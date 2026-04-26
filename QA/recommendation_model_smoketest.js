const assert = require("assert");
const engine = require("/Users/elliott/Documents/New Project/lib/recommendation-engine.js");

function runCheck(label, fn, results) {
  try {
    fn();
    results.push({ label, status: "PASS" });
  } catch (error) {
    results.push({ label, status: "FAIL", error: error.message });
  }
}

function printResults(results) {
  results.forEach((result) => {
    if (result.status === "PASS") {
      console.log(`PASS  ${result.label}`);
      return;
    }
    console.log(`FAIL  ${result.label}`);
    console.log(`      ${result.error}`);
  });

  const passed = results.filter((result) => result.status === "PASS").length;
  console.log("");
  console.log(`Summary: ${passed} passed, ${results.length - passed} failed`);
}

function scoreAllCandidates(candidates, seedProfile, userProfile) {
  return candidates
    .map((candidate) => ({
      candidate,
      score: engine.scoreCandidate(candidate, seedProfile, userProfile),
    }))
    .sort((left, right) => right.score.totalScore - left.score.totalScore);
}

function main() {
  console.log("Running recommendation model smoke test...");
  console.log("Flow: QA/flows/recommendation-model-v1.md");
  console.log("");

  const internalFilms = [
    {
      source: "internal",
      filmId: "seed-a",
      title: "Seed A",
      year: 1984,
      director: "Wim Wenders",
      countries: ["Germany"],
      genres: ["Drama"],
      tone: ["cool", "observant"],
      mood: ["melancholy", "meditative"],
      themes: ["alienation", "family"],
      pace: "slow",
      directRecommendations: ["direct-hit"],
    },
    {
      source: "internal",
      filmId: "direct-hit",
      title: "Direct Hit",
      year: 1974,
      director: "Alice Director",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool", "observant"],
      mood: ["melancholy", "meditative"],
      themes: ["alienation", "memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "same-director",
      title: "Same Director",
      year: 1987,
      director: "Wim Wenders",
      countries: ["Germany"],
      genres: ["Drama"],
      tone: ["cool"],
      mood: ["melancholy"],
      themes: ["memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "theme-match",
      title: "Theme Match",
      year: 1991,
      director: "Other Director",
      countries: ["Belgium"],
      genres: ["Drama"],
      tone: ["precise", "cool"],
      mood: ["intense"],
      themes: ["alienation", "family"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "negative-cluster",
      title: "Negative Cluster",
      year: 1990,
      director: "Other Director",
      countries: ["USA"],
      genres: ["Drama", "Thriller"],
      tone: ["abrasive"],
      mood: ["intense"],
      themes: ["pressure", "obsession"],
      pace: "fast",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "genre-only-match",
      title: "Genre Only Match",
      year: 1985,
      director: "Genre Director",
      countries: ["Germany"],
      genres: ["Drama"],
      tone: ["dry"],
      mood: ["distant"],
      themes: ["bureaucracy"],
      pace: "fast",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "saved-echo",
      title: "Saved Echo",
      year: 1993,
      director: "New Voice",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool", "observant"],
      mood: ["melancholy"],
      themes: ["memory", "creative life"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "cluster-a",
      title: "Cluster A",
      year: 1971,
      director: "Cluster Director",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool"],
      mood: ["melancholy"],
      themes: ["memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "cluster-b",
      title: "Cluster B",
      year: 1972,
      director: "Cluster Director",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool"],
      mood: ["melancholy"],
      themes: ["memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "cluster-c",
      title: "Cluster C",
      year: 1973,
      director: "Cluster Director",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool"],
      mood: ["melancholy"],
      themes: ["memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "cluster-d",
      title: "Cluster D",
      year: 1974,
      director: "Cluster Director",
      countries: ["France"],
      genres: ["Drama"],
      tone: ["cool"],
      mood: ["melancholy"],
      themes: ["memory"],
      pace: "slow",
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "breakout-pick",
      title: "Breakout Pick",
      year: 1988,
      director: "Different Director",
      countries: ["Japan"],
      genres: ["Drama"],
      tone: ["cool", "observant"],
      mood: ["melancholy"],
      themes: ["memory", "alienation"],
      pace: "slow",
      directRecommendations: [],
    },
  ];

  const seedFilm = internalFilms[0];
  const directHit = internalFilms[1];
  const sameDirector = internalFilms[2];
  const themeMatch = internalFilms[3];
  const negativeCluster = internalFilms[4];
  const genreOnlyMatch = internalFilms[5];
  const savedEcho = internalFilms[6];
  const clusterA = internalFilms[7];
  const clusterB = internalFilms[8];
  const clusterC = internalFilms[9];
  const clusterD = internalFilms[10];
  const breakoutPick = internalFilms[11];

  const externalSeed = {
    source: "tmdb-external",
    title: "Whiplash",
    year: 2014,
    director: "Damien Chazelle",
    genres: ["Drama", "Music"],
    themes: ["obsession", "pressure"],
    mood: ["intense", "anxious"],
  };

  const results = [];

  runCheck("Direct recommendations get the strongest initial boost", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile: engine.createEmptyUserProfile(),
    });
    const scored = scoreAllCandidates([directHit, sameDirector, themeMatch], seedProfile, engine.createEmptyUserProfile());
    assert.strictEqual(scored[0].candidate.filmId, "direct-hit");
  }, results);

  runCheck("Scoring exposes explanation reasons and specific overlap signals", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile: engine.createEmptyUserProfile(),
    });
    const score = engine.scoreCandidate(directHit, seedProfile, engine.createEmptyUserProfile());
    assert(Array.isArray(score.reasons));
    assert(Array.isArray(score.explanation.sharedThemes));
    assert(score.reasons.includes("curated connection"));
    assert(score.explanation.sharedTone.includes("cool"));
  }, results);

  runCheck("Specific curated and thematic matches beat genre-only overlap", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile: engine.createEmptyUserProfile(),
    });
    const scored = scoreAllCandidates([themeMatch, genreOnlyMatch], seedProfile, engine.createEmptyUserProfile());
    assert.strictEqual(scored[0].candidate.filmId, "theme-match");
    assert(scored[0].score.totalScore > scored[1].score.totalScore);
    assert(scored[1].score.reasons.includes("generic genre-only match"));
  }, results);

  runCheck("Save interactions strengthen later ranking for related films", () => {
    let userProfile = engine.createEmptyUserProfile();
    userProfile = engine.updateUserProfileFromInteraction({
      filmId: "direct-hit",
      actionType: "save",
      filmData: directHit,
      userProfile,
    });

    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile,
      profileFilms: [directHit],
    });
    const scored = scoreAllCandidates([sameDirector, themeMatch], seedProfile, userProfile);
    assert(scored[0].score.totalScore >= scored[1].score.totalScore);
    assert(userProfile.savedFilmIds.includes("direct-hit"));
  }, results);

  runCheck("Saved films contribute extra taste signals beyond the explicit seed", () => {
    let userProfile = engine.createEmptyUserProfile();
    userProfile = engine.updateUserProfileFromInteraction({
      filmId: "direct-hit",
      actionType: "save",
      filmData: directHit,
      userProfile,
    });

    const withoutSavedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile,
      profileFilms: [],
    });
    const withSavedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile,
      profileFilms: [directHit],
    });

    const withoutSavedScore = engine.scoreCandidate(savedEcho, withoutSavedProfile, userProfile).totalScore;
    const withSavedScore = engine.scoreCandidate(savedEcho, withSavedProfile, userProfile).totalScore;
    assert(withSavedScore > withoutSavedScore);
  }, results);

  runCheck("Not-for-me feedback downranks related mood/theme clusters", () => {
    let userProfile = engine.createEmptyUserProfile();
    userProfile = engine.updateUserProfileFromInteraction({
      filmId: "negative-cluster",
      actionType: "not_for_me",
      filmData: negativeCluster,
      userProfile,
    });

    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile,
    });

    const negativeScore = engine.scoreCandidate(negativeCluster, seedProfile, userProfile).totalScore;
    const neutralScore = engine.scoreCandidate(themeMatch, seedProfile, userProfile).totalScore;
    assert(negativeScore < neutralScore);
  }, results);

  runCheck("External seeds stay temporary while candidate pool stays internal-only", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [],
      externalSeed,
      userProfile: engine.createEmptyUserProfile(),
    });

    const scored = scoreAllCandidates(internalFilms, seedProfile, engine.createEmptyUserProfile());
    assert(scored.every((item) => item.candidate.source === "internal"));
    assert.strictEqual(seedProfile.externalSeedTitle, "Whiplash");
  }, results);

  runCheck("Questionnaire signals contribute to the seed profile without creating film objects", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {
        slow: "hypnotic",
        weird: "max",
        ambiguity: "love",
      },
      seedFilms: [],
      externalSeed: null,
      userProfile: engine.createEmptyUserProfile(),
    });

    assert(seedProfile.moodCounts.meditative > 0);
    assert(seedProfile.themeCounts.obsession > 0);
    assert(seedProfile.paceCounts.slow > 0);
    assert.deepStrictEqual(seedProfile.explicitSeedFilmIds, []);
  }, results);

  runCheck("Diversity pass preserves curated picks and avoids bland clustering", () => {
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: {},
      seedFilms: [seedFilm],
      externalSeed: null,
      userProfile: engine.createEmptyUserProfile(),
    });
    const scoredCandidates = scoreAllCandidates(
      [directHit, clusterA, clusterB, clusterC, clusterD, breakoutPick],
      seedProfile,
      engine.createEmptyUserProfile()
    ).map((entry) => ({
      film: entry.candidate,
      scoreData: entry.score,
    }));

    const diversified = engine.diversifyRecommendations(scoredCandidates, 4);
    const ids = diversified.map((item) => item.film.filmId);

    assert(ids.includes("direct-hit"));
    assert(ids.includes("breakout-pick"));
    assert(ids.filter((filmId) => filmId.startsWith("cluster-")).length < 4);
  }, results);

  printResults(results);

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main();
