const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.SECOND_LOOK_ROOT || path.resolve(__dirname, "..");
const engine = require(path.join(ROOT, "lib", "recommendation-engine.js"));
const curated = require(path.join(ROOT, "data", "curated-films.json"));
const profiles = require(path.join(ROOT, "data", "film-taste-profiles.json"));

const controlled = {
  pace: new Set(["slow", "measured", "steady", "brisk"]),
  intensity: new Set(["low", "medium", "high"]),
  ambiguity: new Set(["clear", "open", "opaque"]),
  accessibility: new Set(["approachable", "demanding", "challenging"]),
};

function film(overrides = {}) {
  return {
    source: "internal", filmId: "candidate", title: "Candidate", year: 1980,
    director: "Director", countries: ["France"], genres: ["Drama"],
    themes: ["identity"], mood: ["tense"], tone: ["intimate"], pace: "measured",
    formalStyle: ["observational"], intensity: "medium", ambiguity: "open",
    accessibility: "approachable", movement: "", directRecommendations: [],
    averageRating: 0, elliottRating: 0, ...overrides,
  };
}

function seedProfile(seed, queryVector = null) {
  return engine.buildSeedProfile({
    questionnaireAnswers: {}, seedFilms: [seed], externalSeeds: [],
    userProfile: engine.createEmptyUserProfile(), profileFilms: [], dislikedFilms: [], queryVector,
  });
}

function main() {
  assert.strictEqual(curated.length, 108, "curated universe must remain 108 films");
  assert.deepStrictEqual(new Set(Object.keys(profiles)), new Set(curated.map((item) => item.film_id)));
  Object.values(profiles).forEach((profile) => {
    ["themes", "mood", "tone", "formal_style"].forEach((field) => assert(Array.isArray(profile[field]) && profile[field].length));
    Object.entries(controlled).forEach(([field, allowed]) => assert(allowed.has(profile[field]), `${field}: ${profile[field]}`));
  });
  console.log("PASS  all 108 films have valid controlled editorial profiles");

  const seed = film({ filmId: "seed", title: "Seed", directRecommendations: ["candidate"] });
  const semantic = engine.scoreCandidate(film({ embedding: [1, 0] }), seedProfile(seed, [1, 0]), engine.createEmptyUserProfile());
  assert.strictEqual(semantic.breakdown.semanticSimilarityScore, 24);
  assert.strictEqual(semantic.breakdown.directRecommendationBoost, 40);
  console.log("PASS  semantic similarity and manual-edge weights use the planned scales");

  const rated = engine.scoreCandidate(film({ elliottRating: 5, averageRating: 5 }), seedProfile(seed), engine.createEmptyUserProfile());
  assert.strictEqual(rated.breakdown.elliottRatingPrior, 8);
  assert.strictEqual(rated.breakdown.letterboxdRatingBoost, 8);
  console.log("PASS  Elliott and Letterboxd boosts are independent ranking components");

  const dislikedProfile = engine.normalizeUserProfile({ dislikedFilmIds: ["candidate"] }, []);
  const disliked = engine.scoreCandidate(film(), seedProfile(seed), dislikedProfile);
  assert(disliked.breakdown.dislikePenalty >= 35);
  console.log("PASS  explicit dislikes apply the planned exclusion penalty");

  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(!appSource.includes("function scoreTasteCandidate"));
  assert(appSource.includes("secondlook:onboardingDismissed:v2"));
  assert(appSource.includes("secondlook:recommendationDraft:v1"));
  assert(html.includes("maxlength=\"300\"") && appSource.includes("Ari Aster"));
  assert(html.match(/class="hero-link"/g).length === 2);
  console.log("PASS  homepage uses the shared engine, restored onboarding key, auth draft, and exactly two hero actions");

  const embeddingsPath = path.join(ROOT, "data", "film-embeddings.json");
  if (fs.existsSync(embeddingsPath)) {
    const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, "utf8"));
    assert.strictEqual(embeddings.model, "text-embedding-3-small");
    assert.strictEqual(embeddings.dimensions, 512);
    assert(/^[a-f0-9]{64}$/.test(embeddings.source_checksum));
    if (embeddings.generation_status === "pending_credentials") {
      assert.deepStrictEqual(embeddings.vectors, {});
      console.log("SKIP  embedding manifest is current but awaits a valid OPENAI_API_KEY");
    } else {
      assert.strictEqual(embeddings.generation_status, "ready");
      assert.deepStrictEqual(new Set(Object.keys(embeddings.vectors)), new Set(curated.map((item) => item.film_id)));
      Object.values(embeddings.vectors).forEach((vector) => assert.strictEqual(vector.length, 512));
      console.log("PASS  committed film embeddings are complete and current-format");
    }
  } else {
    console.log("SKIP  film embeddings require a valid OPENAI_API_KEY (deterministic fallback remains active)");
  }

  const idByTitle = new Map(curated.map((item) => [engine.normalize(item.title), item.film_id]));
  const catalogue = curated.map((item) => {
    const profile = profiles[item.film_id];
    return film({
      filmId: item.film_id, title: item.title, year: item.year, countries: [item.country].filter(Boolean),
      themes: profile.themes, mood: profile.mood, tone: profile.tone, formalStyle: profile.formal_style,
      pace: profile.pace, intensity: profile.intensity, ambiguity: profile.ambiguity,
      accessibility: profile.accessibility, movement: profile.movement, elliottRating: item.elliott_rating,
      directRecommendations: (item.manual_links || []).map((title) => idByTitle.get(engine.normalize(title))).filter(Boolean),
    });
  });
  const goldenSeeds = catalogue.filter((item) => item.directRecommendations.length).slice(0, 20);
  assert.strictEqual(goldenSeeds.length, 20);
  goldenSeeds.forEach((seedFilm) => {
    const profile = seedProfile(seedFilm);
    const ranked = catalogue.filter((candidate) => candidate.filmId !== seedFilm.filmId).map((candidate) => ({
      film: candidate,
      scoreData: engine.scoreCandidate(candidate, profile, engine.createEmptyUserProfile()),
    })).sort((left, right) => right.scoreData.totalScore - left.scoreData.totalScore);
    const topIds = new Set(engine.diversifyRecommendations(ranked, 8).map((item) => item.film.filmId));
    assert(seedFilm.directRecommendations.some((filmId) => topIds.has(filmId)), `${seedFilm.title} lost its approved link`);
  });
  console.log("PASS  20 Elliott-linked golden seeds retain an approved film in the top eight");
}

main();
