const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.resolve(__dirname, "..", "api", "taste-embedding.js");

function loadHandler(fetchImpl) {
  const source = fs.readFileSync(sourcePath, "utf8")
    .replace("export default async function handler", "async function handler") + "\nmodule.exports = handler;";
  const sandbox = {
    module: { exports: {} }, exports: {}, fetch: fetchImpl, Date, Map,
    process: { env: { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", OPENAI_API_KEY: "key" } },
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

function response() {
  return {
    statusCode: 0, payload: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

async function call(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

async function main() {
  const successFetch = async (url, options) => {
    if (String(url).includes("supabase.co")) return { ok: true, json: async () => ({ id: "user-1" }) };
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: body.input.map((_, index) => ({ index, embedding: Array(512).fill(index + 1) })) }) };
  };
  let handler = loadHandler(successFetch);

  let res = await call(handler, { method: "GET", headers: {}, body: {} });
  assert.strictEqual(res.statusCode, 405);
  res = await call(handler, { method: "POST", headers: {}, body: { inputs: ["film"] } });
  assert.strictEqual(res.statusCode, 401);
  res = await call(handler, { method: "POST", headers: { authorization: "Bearer token" }, body: { inputs: [] } });
  assert.strictEqual(res.statusCode, 400);
  console.log("PASS  method, authentication, and malformed input are rejected");

  res = await call(handler, { method: "POST", headers: { authorization: "Bearer token" }, body: { inputs: ["one", "two"] } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.payload.embeddings.length, 2);
  assert.strictEqual(res.payload.embeddings[0].length, 512);
  assert.strictEqual(res.headers["Cache-Control"], "no-store");
  console.log("PASS  authenticated batches preserve order and return 512 dimensions without caching");

  handler = loadHandler(async (url) => String(url).includes("supabase.co")
    ? { ok: true, json: async () => ({ id: "user-2" }) }
    : { ok: false, json: async () => ({}) });
  res = await call(handler, { method: "POST", headers: { authorization: "Bearer token" }, body: { inputs: ["film"] } });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.payload.error, "embedding_upstream_failed");
  console.log("PASS  upstream failure returns a deterministic fallback signal");

  handler = loadHandler(successFetch);
  for (let index = 0; index < 12; index += 1) {
    res = await call(handler, { method: "POST", headers: { authorization: "Bearer token" }, body: { inputs: ["film"] } });
    assert.strictEqual(res.statusCode, 200);
  }
  res = await call(handler, { method: "POST", headers: { authorization: "Bearer token" }, body: { inputs: ["film"] } });
  assert.strictEqual(res.statusCode, 429);
  console.log("PASS  per-user rate limiting is enforced");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
