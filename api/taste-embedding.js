const MODEL = "text-embedding-3-small";
const DIMENSIONS = 512;
const MAX_INPUTS = 5;
const MAX_INPUT_LENGTH = 3000;
const MAX_TOTAL_LENGTH = 9000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const requestsByUser = new Map();

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function validatedInputs(body) {
  if (!body || !Array.isArray(body.inputs) || body.inputs.length < 1 || body.inputs.length > MAX_INPUTS) {
    return null;
  }
  const inputs = body.inputs.map((value) => String(value || "").trim());
  if (inputs.some((value) => !value || value.length > MAX_INPUT_LENGTH)) {
    return null;
  }
  return inputs.join("").length <= MAX_TOTAL_LENGTH ? inputs : null;
}

// Per-process fallback limiter. This alone is NOT sufficient on Vercel: each
// function instance (and every cold start) has its own Map, so a user hitting
// several instances could exceed the limit. It is only used when the shared
// backend below is not configured, or if a shared check fails.
function withinMemoryRateLimit(userId) {
  const now = Date.now();
  const recent = (requestsByUser.get(userId) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestsByUser.set(userId, recent);
    return false;
  }
  requestsByUser.set(userId, [...recent, now]);
  return true;
}

// Shared, atomic limiter backed by Postgres via Supabase RPC, so the limit is
// enforced across every function instance. Requires SUPABASE_SERVICE_ROLE_KEY
// and the `check_embedding_rate_limit` function (see
// supabase/embedding_rate_limit.sql). Returns null when it cannot be used, so
// the caller can fall back to the per-process limiter rather than fail open.
async function withinSharedRateLimit(userId) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/check_embedding_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user_id: userId, p_window_ms: RATE_WINDOW_MS, p_limit: RATE_LIMIT }),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) === true;
  } catch (error) {
    return null;
  }
}

async function withinRateLimit(userId) {
  const shared = await withinSharedRateLimit(userId);
  return shared === null ? withinMemoryRateLimit(userId) : shared;
}

async function authenticatedUser(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("supabase_not_configured");
  }
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "method_not_allowed" });
  }

  const token = bearerToken(req);
  if (!token) {
    return send(res, 401, { error: "authentication_required" });
  }
  const inputs = validatedInputs(req.body);
  if (!inputs) {
    return send(res, 400, { error: "invalid_inputs" });
  }

  try {
    const user = await authenticatedUser(token);
    if (!user?.id) {
      return send(res, 401, { error: "invalid_session" });
    }
    if (!(await withinRateLimit(user.id))) {
      return send(res, 429, { error: "rate_limited" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return send(res, 503, { error: "embedding_service_unavailable" });
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, dimensions: DIMENSIONS, input: inputs }),
    });
    if (!response.ok) {
      return send(res, 502, { error: "embedding_upstream_failed" });
    }
    const payload = await response.json();
    const embeddings = (payload.data || [])
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    if (embeddings.length !== inputs.length || embeddings.some((vector) => vector.length !== DIMENSIONS)) {
      return send(res, 502, { error: "embedding_response_invalid" });
    }
    res.setHeader("Cache-Control", "no-store");
    return send(res, 200, { model: MODEL, dimensions: DIMENSIONS, embeddings });
  } catch (error) {
    const status = error.message === "supabase_not_configured" ? 503 : 502;
    return send(res, status, { error: error.message === "supabase_not_configured" ? error.message : "embedding_upstream_failed" });
  }
}
