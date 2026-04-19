const assert = require("assert");
const engine = require("/Users/elliott/Documents/New project/lib/recommendation-engine.js");

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
      mood: ["melancholy", "meditative"],
      themes: ["alienation", "family"],
      directRecommendations: ["direct-hit"],
    },
    {
      source: "internal",
      filmId: "direct-hit",
      title: "Direct Hit",
      year: 1974,
      director: "Alice Director",
      mood: ["melancholy", "meditative"],
      themes: ["alienation", "memory"],
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "same-director",
      title: "Same Director",
      year: 1987,
      director: "Wim Wenders",
      mood: ["melancholy"],
      themes: ["memory"],
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "theme-match",
      title: "Theme Match",
      year: 1991,
      director: "Other Director",
      mood: ["intense"],
      themes: ["alienation", "family"],
      directRecommendations: [],
    },
    {
      source: "internal",
      filmId: "negative-cluster",
      title: "Negative Cluster",
      year: 1990,
      director: "Other Director",
      mood: ["intense"],
      themes: ["pressure", "obsession"],
      directRecommendations: [],
    },
  ];

  const seedFilm = internalFilms[0];
  const directHit = internalFilms[1];
  const sameDirector = internalFilms[2];
  const themeMatch = internalFilms[3];
  const negativeCluster = internalFilms[4];

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
    });
    const scored = scoreAllCandidates([sameDirector, themeMatch], seedProfile, userProfile);
    assert(scored[0].score.totalScore >= scored[1].score.totalScore);
    assert(userProfile.savedFilmIds.includes("direct-hit"));
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
    assert.deepStrictEqual(seedProfile.explicitSeedFilmIds, []);
  }, results);

  printResults(results);

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main();
