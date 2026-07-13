/**
 * Option 1 prototype — "Pick films you love → recommendations from the curated universe".
 * Self-contained: does not touch the production app. Reuses the data files.
 *
 * In production, the anchor search below is replaced by live TMDB /search/movie,
 * and the taste signal is pulled from the picked films' TMDB metadata.
 */

const state = {
  anchors: [],
  curated: [],
  picks: [],
  likedIds: new Set(),
  dislikedIds: new Set(),
  generated: false,
};

const els = {
  search: document.querySelector("#anchor-search"),
  searchResults: document.querySelector("#anchor-results"),
  picks: document.querySelector("#pick-chips"),
  generate: document.querySelector("#generate"),
  recs: document.querySelector("#recs"),
  recsHead: document.querySelector("#recs-head"),
  step2: document.querySelector("#step-2"),
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function decadeOf(year) {
  const y = Number(year);
  return Number.isFinite(y) && y > 0 ? Math.floor(y / 10) * 10 : null;
}

function posterFor(film) {
  if (film.poster_url) return film.poster_url;
  if (film.poster_path) return `https://image.tmdb.org/t/p/w342${film.poster_path}`;
  return "";
}

function monogram(title) {
  return String(title || "")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

async function loadJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function boot() {
  const [anchorsRaw, curatedRaw, tmdbRaw, fmRaw] = await Promise.all([
    loadJson("./data/taste-anchor-films.json"),
    loadJson("./data/curated-films.json"),
    loadJson("./data/tmdb-metadata.json"),
    loadJson("./data/film-metadata.json"),
  ]);

  state.anchors = anchorsRaw.films || [];

  const tmdbByTitle = {};
  Object.entries(tmdbRaw).forEach(([title, v]) => (tmdbByTitle[normalize(title)] = v));
  const fmByTitle = {};
  Object.entries(fmRaw).forEach(([title, v]) => (fmByTitle[normalize(title)] = v));

  // Build the enriched curated universe (the recommendation pool).
  state.curated = curatedRaw.map((film) => {
    const key = normalize(film.title);
    const tmdb = tmdbByTitle[key] || {};
    const fm = fmByTitle[key] || {};
    return {
      id: film.film_id,
      title: film.title,
      year: film.year || tmdb.year || null,
      country: film.country || "",
      director: fm.director || tmdb.director || "",
      genres: tmdb.genres || [],
      keywords: tmdb.keywords || [],
      poster_url: fm.poster_url || "",
      poster_path: tmdb.poster_path || "",
      letterboxd_url: fm.letterboxd_url || `https://letterboxd.com/search/${encodeURIComponent(film.title)}/`,
    };
  });

  els.search.addEventListener("input", renderSearch);
  els.generate.addEventListener("click", () => {
    state.generated = true;
    renderRecs();
    els.step2.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  renderPicks();
  renderSearch();
}

function renderSearch() {
  const q = normalize(els.search.value);
  if (!q) {
    els.searchResults.innerHTML = "";
    return;
  }
  const matches = state.anchors
    .filter((a) => normalize(a.title).includes(q))
    .filter((a) => !state.picks.some((p) => p.title === a.title))
    .slice(0, 6);

  if (!matches.length) {
    els.searchResults.innerHTML = `<p class="proto-muted">No match in the demo set. (Production searches all of TMDB.)</p>`;
    return;
  }

  els.searchResults.innerHTML = matches
    .map(
      (a, i) => `
      <button class="proto-result" data-anchor="${i}">
        <span class="proto-result__title">${a.title}</span>
        <span class="proto-result__meta">${a.year} · ${a.director} · ${a.genres.join(", ")}</span>
      </button>`
    )
    .join("");

  els.searchResults.querySelectorAll("[data-anchor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addPick(matches[Number(btn.dataset.anchor)]);
    });
  });
}

function addPick(anchor) {
  if (state.picks.length >= 3 || state.picks.some((p) => p.title === anchor.title)) return;
  state.picks.push(anchor);
  els.search.value = "";
  state.generated = false;
  renderSearch();
  renderPicks();
}

function removePick(title) {
  state.picks = state.picks.filter((p) => p.title !== title);
  state.generated = false;
  renderPicks();
  renderRecs();
}

function renderPicks() {
  els.picks.innerHTML =
    state.picks
      .map(
        (p) => `
      <span class="proto-chip">
        ${p.title}
        <button class="proto-chip__x" data-remove="${p.title}" aria-label="Remove ${p.title}">×</button>
      </span>`
      )
      .join("") +
    (state.picks.length < 3
      ? `<span class="proto-chip proto-chip--ghost">${state.picks.length === 0 ? "Search and add up to 3" : "Add another (optional)"}</span>`
      : "");

  els.picks.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removePick(btn.dataset.remove));
  });

  els.generate.disabled = state.picks.length === 0;
  els.generate.textContent =
    state.picks.length === 0 ? "Add a film to begin" : `Show me recommendations`;
}

function buildSignal() {
  const signal = { genres: new Map(), keywords: new Map(), countries: new Set(), directors: new Set(), decades: new Set() };
  const bump = (map, v) => map.set(v, (map.get(v) || 0) + 1);
  state.picks.forEach((p) => {
    (p.genres || []).forEach((g) => bump(signal.genres, g));
    (p.keywords || []).forEach((k) => bump(signal.keywords, k));
    if (p.country) signal.countries.add(p.country);
    if (p.director) signal.directors.add(p.director);
    const d = decadeOf(p.year);
    if (d) signal.decades.add(d);
  });
  return signal;
}

function scoreFilm(film, signal) {
  const reasons = [];
  let score = 0;

  const sharedGenres = (film.genres || []).filter((g) => signal.genres.has(g));
  if (sharedGenres.length) {
    score += 3 * sharedGenres.length;
    reasons.push(...sharedGenres);
  }
  const sharedKeywords = (film.keywords || []).filter((k) => signal.keywords.has(k));
  if (sharedKeywords.length) {
    score += 2 * sharedKeywords.length;
    reasons.push(...sharedKeywords.slice(0, 2));
  }
  if (film.country && signal.countries.has(film.country)) {
    score += 4;
    reasons.push(film.country);
  }
  if (film.director && signal.directors.has(film.director)) {
    score += 8;
    reasons.push(`dir. ${film.director}`);
  }
  const d = decadeOf(film.year);
  if (d && signal.decades.has(d)) score += 2;

  return { score, reasons: [...new Set(reasons)].slice(0, 4) };
}

function renderRecs() {
  if (!state.generated || !state.picks.length) {
    els.recsHead.textContent = "";
    els.recs.innerHTML = `<div class="proto-empty">Pick a film or two you love, then hit “Show me recommendations”.</div>`;
    return;
  }

  const signal = buildSignal();
  const scored = state.curated
    .filter((f) => !state.dislikedIds.has(f.id))
    .map((f) => ({ film: f, ...scoreFilm(f, signal) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      // liked films sink slightly so fresh picks surface; primary sort is score
      const likedA = state.likedIds.has(a.film.id) ? 1 : 0;
      const likedB = state.likedIds.has(b.film.id) ? 1 : 0;
      return likedA - likedB || b.score - a.score;
    })
    .slice(0, 8);

  els.recsHead.textContent = `From your taste — ${scored.length} picks from the curated universe`;

  if (!scored.length) {
    els.recs.innerHTML = `<div class="proto-empty">Nothing in the curated set matched those signals yet. Try a different film — or this is where richer enrichment would widen the net.</div>`;
    return;
  }

  els.recs.innerHTML = scored
    .map(({ film, reasons }) => {
      const poster = posterFor(film);
      const posterMarkup = poster
        ? `<img class="proto-card__poster" src="${poster}" alt="Poster for ${film.title}" loading="lazy" />`
        : `<div class="proto-card__poster proto-card__poster--mono">${monogram(film.title)}</div>`;
      const liked = state.likedIds.has(film.id);
      const meta = [film.year, film.director, film.country].filter(Boolean).join(" · ");
      return `
        <article class="proto-card ${liked ? "is-liked" : ""}">
          ${posterMarkup}
          <div class="proto-card__body">
            <h3 class="proto-card__title">${film.title}</h3>
            <p class="proto-card__meta">${meta}</p>
            ${reasons.length ? `<p class="proto-card__why"><span>Why:</span> ${reasons.join(" · ")}</p>` : ""}
            <div class="proto-card__actions">
              <button class="proto-btn ${liked ? "proto-btn--on" : ""}" data-like="${film.id}">${liked ? "♥ Liked" : "♥ Like"}</button>
              <button class="proto-btn proto-btn--ghost" data-dislike="${film.id}">Not for me</button>
              <a class="proto-btn proto-btn--link" href="${film.letterboxd_url}" target="_blank" rel="noreferrer">Letterboxd ↗</a>
            </div>
          </div>
        </article>`;
    })
    .join("");

  els.recs.querySelectorAll("[data-like]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.like;
      state.likedIds.has(id) ? state.likedIds.delete(id) : state.likedIds.add(id);
      renderRecs();
    })
  );
  els.recs.querySelectorAll("[data-dislike]").forEach((b) =>
    b.addEventListener("click", () => {
      state.dislikedIds.add(b.dataset.dislike);
      renderRecs();
    })
  );
}

boot();
