const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = "/Users/elliott/Documents/New project";
const DATA_DIR = path.join(ROOT, "data");
const CASES_PATH = path.join(ROOT, "QA", "flows", "blurb_quality_cases.json");

const engine = require(path.join(ROOT, "lib", "recommendation-engine.js"));
const editorial = require(path.join(ROOT, "lib", "editorial-copy.js"));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildTitleIndex(items, getTitle) {
  return (items || []).reduce((output, item) => {
    const title = getTitle(item);
    const key = normalize(title);
    if (key) {
      output[key] = item;
    }
    return output;
  }, {});
}

function mergeLists(...lists) {
  const seen = new Set();
  const output = [];
  lists.flat().forEach((value) => {
    const label = String(value || "").trim();
    const key = normalize(label);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(label);
  });
  return output;
}

function metadataForTitle(title, metadataByTitle) {
  return metadataByTitle[normalize(title)] || {};
}

function tmdbMetadataForTitle(title, tmdbByTitle) {
  return tmdbByTitle[normalize(title)] || {};
}

function deriveMoodSignalsFromText(keywords, text) {
  const haystack = `${(keywords || []).join(" ")} ${text || ""}`.toLowerCase();
  const matches = [];

  const moodMap = [
    { mood: "melancholy", needles: ["memory", "loss", "grief", "loneliness", "longing", "distance"] },
    { mood: "meditative", needles: ["silence", "slow", "contemplative", "drift", "journey"] },
    { mood: "dreamlike", needles: ["dream", "surreal", "nightmare", "hallucination", "ghost"] },
    { mood: "intense", needles: ["violence", "obsession", "pressure", "revenge", "war"] },
    { mood: "tender", needles: ["childhood", "family", "friendship", "coming of age", "love"] },
    { mood: "unsettling", needles: ["horror", "murder", "occult", "body", "paranoia"] },
    { mood: "precise", needles: ["ritual", "form", "control", "performance", "discipline"] },
    { mood: "romantic", needles: ["romance", "desire", "marriage", "relationship"] },
  ];

  moodMap.forEach((entry) => {
    if (entry.needles.some((needle) => haystack.includes(needle))) {
      matches.push(entry.mood);
    }
  });

  return unique(matches);
}

function buildInternalFilms(curated, metadataByTitle, tmdbByTitle, sampleMovies, availabilityByFilmId) {
  const internalTitleToId = curated.reduce((output, film) => {
    output[normalize(film.title)] = film.film_id;
    return output;
  }, {});

  const sampleByTitle = buildTitleIndex(sampleMovies, (film) => film.title);

  return curated.map((curatedFilm) => {
    const metadata = metadataForTitle(curatedFilm.title, metadataByTitle);
    const tmdb = tmdbMetadataForTitle(curatedFilm.title, tmdbByTitle);
    const sample = sampleByTitle[normalize(curatedFilm.title)] || {};
    const directRecommendations = unique(
      (curatedFilm.manual_links || [])
        .map((title) => internalTitleToId[normalize(title)])
        .filter(Boolean)
    );

    return {
      source: "internal",
      filmId: curatedFilm.film_id,
      title: curatedFilm.title,
      year: curatedFilm.year || metadata.year || tmdb.year || null,
      director: metadata.director || tmdb.director || sample.director || "",
      genres: mergeLists(tmdb.genres || [], sample.genres || []),
      themes: mergeLists(sample.themes || [], tmdb.keywords || []),
      mood: mergeLists(
        curatedFilm.mood || [],
        sample.tone || [],
        deriveMoodSignalsFromText(tmdb.keywords || [], `${metadata.intro || ""} ${tmdb.overview || ""}`)
      ),
      directRecommendations,
      cardTags: mergeLists(curatedFilm.cardTags || [], sample.tags ? sample.tags.slice(0, 3) : []),
      tmdbId: tmdb.tmdb_id || null,
      availability: availabilityByFilmId[curatedFilm.film_id] || {},
    };
  });
}

function bestSeedForCandidate(candidate, scoreData, seedFilms, externalSeed) {
  if (scoreData.directSources.length) {
    const title = scoreData.directSources[0];
    return seedFilms.find((film) => normalize(film.title) === normalize(title)) || null;
  }

  const allSeeds = [...seedFilms];
  if (externalSeed) {
    allSeeds.push(externalSeed);
  }

  let bestSeed = null;
  let bestScore = -Infinity;

  allSeeds.forEach((seed) => {
    let score = 0;
    const moodOverlap = (candidate.mood || []).filter((value) => (seed.mood || []).some((seedMood) => normalize(seedMood) === normalize(value)));
    const themeOverlap = (candidate.themes || []).filter((value) => (seed.themes || []).some((seedTheme) => normalize(seedTheme) === normalize(value)));
    score += moodOverlap.length * 4;
    score += themeOverlap.length * 3;

    if (seed.director && candidate.director && normalize(seed.director) === normalize(candidate.director)) {
      score += 2;
    }

    if (seed.year && candidate.year && Math.abs(seed.year - candidate.year) <= 6) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSeed = seed;
    }
  });

  return bestSeed;
}

function pickRecommendations(internalFilms, seedProfile, seedFilms, externalSeed, userProfile, lookups) {
  const excludedIds = new Set([
    ...seedProfile.explicitSeedFilmIds,
    ...userProfile.dislikedFilmIds,
  ]);

  const scored = internalFilms
    .filter((film) => !excludedIds.has(film.filmId))
    .map((film) => {
      const scoreData = engine.scoreCandidate(film, seedProfile, userProfile);
      const bestSeed = bestSeedForCandidate(film, scoreData, seedFilms, externalSeed);
      const explanation = editorial.explanationForCandidate({
        candidate: film,
        scoreData,
        bestSeed,
        lookups,
        userProfile,
      });
      return {
        film,
        scoreData,
        bestSeed,
        explanation,
      };
    })
    .sort((left, right) => right.scoreData.totalScore - left.scoreData.totalScore);

  const picks = [];
  const directorCounts = {};

  scored.forEach((item) => {
    if (picks.length >= 8) {
      return;
    }

    const directorKey = normalize(item.film.director);
    const maxPerDirector = item.scoreData.directSources.length ? 2 : 1;
    if (directorKey && Number(directorCounts[directorKey] || 0) >= maxPerDirector) {
      return;
    }

    picks.push(item);
    if (directorKey) {
      directorCounts[directorKey] = Number(directorCounts[directorKey] || 0) + 1;
    }
  });

  scored.forEach((item) => {
    if (picks.length >= 8 || picks.some((existing) => existing.film.filmId === item.film.filmId)) {
      return;
    }
    picks.push(item);
  });

  return picks.slice(0, 8);
}

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

function phraseCounts(texts) {
  const stopwords = new Set([
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "into",
    "your",
    "they",
    "them",
    "both",
    "films",
    "film",
    "because",
    "through",
    "rather",
    "than",
    "same",
    "still",
    "after",
    "comes",
    "keeps",
    "which",
  ]);

  const counts = {};
  texts.forEach((text) => {
    const tokens = normalize(text)
      .split(" ")
      .filter((token) => token && !stopwords.has(token));
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const phrase = `${tokens[index]} ${tokens[index + 1]}`;
      counts[phrase] = Number(counts[phrase] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10);
}

function similarityScore(left, right) {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  return union.size ? intersection.length / union.size : 0;
}

function buildIssue({ id, severity, type, summary, evidence, suggested_fix }) {
  return {
    id,
    severity,
    type,
    title: summary,
    summary,
    evidence,
    suggested_fix,
    source_flow: "QA/flows/blurb_quality_cases.json",
    status: "open",
  };
}

function auditScenarioOutputs(cases, internalFilmById, recommendationsByScenario, lookups) {
  const issues = [];
  const allOutputs = [];
  const genericPatterns = [
    /another thoughtful drama/i,
    /fans of .* will appreciate/i,
    /similarly atmospheric/i,
    /meditative and emotionally resonant/i,
    /strong fit for the taste profile/i,
  ];

  cases.scenarios.forEach((scenario) => {
    const picks = recommendationsByScenario[scenario.id] || [];
    const topPicks = picks.slice(0, scenario.topN || 4);
    allOutputs.push(...topPicks.map((pick) => ({ scenario, ...pick })));

    (scenario.requiredCandidateIds || []).forEach((candidateFilmId) => {
      const found = topPicks.some((pick) => pick.film.filmId === candidateFilmId);
      if (!found) {
        const candidate = internalFilmById[candidateFilmId];
        issues.push(
          buildIssue({
            id: `sparse-pair-${scenario.id}-${candidateFilmId}`,
            severity: "medium",
            type: "sparse_pair_blurbs",
            summary: `Expected comparison candidate is missing in ${scenario.id}`,
            evidence: `${candidate ? candidate.title : candidateFilmId} did not appear in the top ${scenario.topN || 4} recommendations for ${scenario.label}.`,
            suggested_fix: "Adjust the scenario fixture or top-N expectation so the audit compares live recommendation outputs rather than a missing pair.",
          })
        );
      }
    });
  });

  allOutputs.forEach((item) => {
    const text = item.explanation.text;
    const sourceType = item.explanation.sourceType;

    if (genericPatterns.some((pattern) => pattern.test(text))) {
      issues.push(
        buildIssue({
          id: `generic-${item.scenario.id}-${item.film.filmId}`,
          severity: "medium",
          type: "blurb_genericity",
          summary: `Generic editorial phrasing surfaced for ${item.scenario.label} -> ${item.film.title}`,
          evidence: text,
          suggested_fix: "Tighten the fallback or pair-specific copy so it names the concrete shared mood, theme, director, or direct edge instead of using broad recommendation boilerplate.",
        })
      );
    }

    if (sourceType === "fallback_generic") {
      issues.push(
        buildIssue({
          id: `fallback-generic-${item.scenario.id}-${item.film.filmId}`,
          severity: "medium",
          type: "fallback_overuse",
          summary: `A generic fallback blurb surfaced for ${item.scenario.label} -> ${item.film.title}`,
          evidence: text,
          suggested_fix: "Prefer a more specific fallback branch, or expand pair coverage so this recommendation is explained through an actual active signal.",
        })
      );
      return;
    }

    if (sourceType.startsWith("fallback_")) {
      const signals = item.explanation.activeSignals || [];
      const mentionsSignal = signals.some((signal) => normalize(text).includes(normalize(signal)));
      const mentionsDirector = item.bestSeed && item.scoreData.sameDirector
        ? normalize(text).includes(normalize(item.film.director)) || /director|voice/i.test(text)
        : false;
      const mentionsDirectEdge = item.scoreData.directSources.length
        ? /hand-linked|hand linked|next step|curated jump|direct/i.test(text)
        : false;
      const mentionsEra =
        item.scoreData.breakdown.eraBonus > 0 && item.bestSeed && item.bestSeed.year && item.film.year
          ? text.includes(String(item.bestSeed.year)) || text.includes(String(item.film.year))
          : false;

      if (!mentionsSignal && !mentionsDirector && !mentionsDirectEdge && !mentionsEra) {
        issues.push(
          buildIssue({
            id: `mismatch-${item.scenario.id}-${item.film.filmId}`,
            severity: "medium",
            type: "explanation_mismatch",
            summary: `Fallback explanation does not name the strongest live signal for ${item.scenario.label} -> ${item.film.title}`,
            evidence: `${text}\nSignals: ${JSON.stringify({
              activeSignals: item.explanation.activeSignals,
              sourceType,
              directSources: item.scoreData.directSources,
              moodOverlap: item.scoreData.moodOverlap,
              themeOverlap: item.scoreData.themeOverlap,
              sameDirector: item.scoreData.sameDirector,
              eraBonus: item.scoreData.breakdown.eraBonus,
            })}`,
            suggested_fix: "Refine the fallback branch so it explicitly names the mood, theme, director, or era signal that actually lifted the recommendation.",
          })
        );
      }
    }

    const bestSeed = item.bestSeed;
    if (bestSeed) {
      const directBlurb = editorial.blurbForPair(bestSeed, item.film, lookups);
      if (directBlurb && sourceType.startsWith("fallback_")) {
        issues.push(
          buildIssue({
            id: `pair-coverage-${item.scenario.id}-${item.film.filmId}`,
            severity: "high",
            type: "fallback_overuse",
            summary: `Fallback logic was used even though a pair blurb exists for ${bestSeed.title} -> ${item.film.title}`,
            evidence: text,
            suggested_fix: "Ensure explanation resolution always prefers the pair-specific blurb before any fallback branch.",
          })
        );
      }
    }
  });

  const skeletonCounts = {};
  allOutputs.forEach((item) => {
    const seedTitle = item.bestSeed ? item.bestSeed.title : "";
    const skeleton = normalize(item.explanation.text)
      .replaceAll(normalize(seedTitle), "")
      .replaceAll(normalize(item.film.title), "")
      .replace(/\s+/g, " ")
      .trim();
    if (!skeleton) {
      return;
    }
    if (!skeletonCounts[skeleton]) {
      skeletonCounts[skeleton] = [];
    }
    skeletonCounts[skeleton].push(item);
  });

  Object.entries(skeletonCounts).forEach(([skeleton, matches]) => {
    if (matches.length < 3) {
      return;
    }
    issues.push(
      buildIssue({
        id: `repeated-skeleton-${normalize(skeleton).replace(/\s+/g, "-").slice(0, 40)}`,
        severity: "medium",
        type: "repeated_phrasing",
        summary: "Near-identical rationale scaffolding is repeating across multiple recommendations",
        evidence: matches
          .map((item) => `${item.scenario.id}: ${item.bestSeed ? item.bestSeed.title : "No seed"} -> ${item.film.title} :: ${item.explanation.text}`)
          .join("\n"),
        suggested_fix: "Vary the fallback sentence structure and make each branch name a more specific trait so the copy does not collapse into one reusable scaffold.",
      })
    );
  });

  (cases.comparison_groups || []).forEach((group) => {
    const matches = group.scenarioIds
      .map((scenarioId) =>
        allOutputs.find((item) => item.scenario.id === scenarioId && item.film.filmId === group.candidateFilmId)
      )
      .filter(Boolean);

    if (matches.length < 2) {
      return;
    }

    const [left, right] = matches;
    const score = similarityScore(left.explanation.text, right.explanation.text);
    if (score >= 0.8) {
      issues.push(
        buildIssue({
          id: `comparison-${group.id}`,
          severity: "medium",
          type: "repeated_phrasing",
          summary: `Distinct onboarding paths produced near-identical copy for ${left.film.title}`,
          evidence: `${left.scenario.id}: ${left.explanation.text}\n${right.scenario.id}: ${right.explanation.text}`,
          suggested_fix: "Make the pair-specific or fallback copy acknowledge the seed-specific difference instead of relying on the same broad editorial language.",
        })
      );
    }
  });

  return { issues, allOutputs };
}

function toJsonSummary(results, metrics, issues) {
  return {
    summary: {
      passed: results.filter((result) => result.status === "PASS").length,
      failed: results.filter((result) => result.status === "FAIL").length,
    },
    results,
    metrics,
    issues,
  };
}

function main() {
  const jsonMode = process.argv.includes("--json");
  const casesPathArgIndex = process.argv.indexOf("--cases");
  const casesPath = casesPathArgIndex !== -1 ? process.argv[casesPathArgIndex + 1] : CASES_PATH;

  const curated = loadJson(path.join(DATA_DIR, "curated-films.json"));
  const filmMetadata = loadJson(path.join(DATA_DIR, "film-metadata.json"));
  const tmdbMetadata = loadJson(path.join(DATA_DIR, "tmdb-metadata.json"));
  const availability = loadJson(path.join(DATA_DIR, "availability.json"));
  const sampleMovies = loadJson(path.join(DATA_DIR, "sample-movies.json"));
  const recommendationBlurbs = loadJson(path.join(DATA_DIR, "recommendation-blurbs.json"));
  const cases = loadJson(casesPath);

  const metadataByTitle = buildTitleIndex(Object.values(filmMetadata), (entry) => entry.title);
  const tmdbByTitle = buildTitleIndex(Object.values(tmdbMetadata), (entry) => entry.title);
  const internalFilms = buildInternalFilms(curated, metadataByTitle, tmdbByTitle, sampleMovies, availability);
  const internalFilmById = Object.fromEntries(internalFilms.map((film) => [film.filmId, film]));
  const internalFilmByTitleKey = Object.fromEntries(
    internalFilms.map((film) => [normalize(film.title), film])
  );
  const lookups = editorial.buildBlurbIndices(recommendationBlurbs, internalFilmByTitleKey);

  const recommendationsByScenario = {};
  cases.scenarios.forEach((scenario) => {
    const seedFilms = (scenario.seedFilmIds || [])
      .map((filmId) => internalFilmById[filmId])
      .filter(Boolean);
    const userProfile = engine.normalizeUserProfile(scenario.userProfile || engine.createEmptyUserProfile(), []);
    const seedProfile = engine.buildSeedProfile({
      questionnaireAnswers: scenario.questionnaireAnswers || {},
      seedFilms,
      externalSeed: null,
      userProfile,
    });

    recommendationsByScenario[scenario.id] = pickRecommendations(
      internalFilms,
      seedProfile,
      seedFilms,
      null,
      userProfile,
      {
        blurbsByPairId: lookups.byId,
        blurbsByPairTitle: lookups.byTitle,
      }
    );
  });

  const { issues, allOutputs } = auditScenarioOutputs(cases, internalFilmById, recommendationsByScenario, {
    blurbsByPairId: lookups.byId,
    blurbsByPairTitle: lookups.byTitle,
  });

  const auditedOutputs = allOutputs.filter((item) => item.scenario && item.explanation);
  const pairSpecificCount = auditedOutputs.filter((item) => item.explanation.sourceType === "pair_specific_blurb").length;
  const reverseCount = auditedOutputs.filter((item) => item.explanation.sourceType === "reverse_pair_synthesis").length;
  const fallbackCount = auditedOutputs.filter((item) => item.explanation.sourceType.startsWith("fallback_")).length;
  const repeatedPhrases = phraseCounts(auditedOutputs.map((item) => item.explanation.text));

  const results = [];

  runCheck("At least 20 seed -> recommendation pairs are audited", () => {
    assert(auditedOutputs.length >= 20, `Only audited ${auditedOutputs.length} recommendation blurbs`);
  }, results);

  runCheck("Pair-specific blurbs are preferred whenever they exist", () => {
    const overusedFallback = issues.filter((issue) => issue.type === "fallback_overuse" && /pair blurb exists/i.test(issue.summary));
    assert.strictEqual(overusedFallback.length, 0, overusedFallback.map((issue) => issue.summary).join("; "));
  }, results);

  runCheck("Fallback blurbs mention a concrete live connection", () => {
    const mismatches = issues.filter((issue) => issue.type === "explanation_mismatch" || issue.id.startsWith("fallback-generic-"));
    assert.strictEqual(mismatches.length, 0, mismatches.map((issue) => issue.summary).join("; "));
  }, results);

  runCheck("Different onboarding paths produce different rationale language for shared candidates", () => {
    const comparisonIssues = issues.filter((issue) => issue.id.startsWith("comparison-"));
    assert.strictEqual(comparisonIssues.length, 0, comparisonIssues.map((issue) => issue.summary).join("; "));
  }, results);

  runCheck("Fallback copy does not collapse into repeated stock scaffolding", () => {
    const repeatedIssues = issues.filter((issue) => issue.type === "repeated_phrasing");
    assert.strictEqual(repeatedIssues.length, 0, repeatedIssues.map((issue) => issue.summary).join("; "));
  }, results);

  runCheck("No expected comparison candidate drops out of the audited scenarios", () => {
    const sparseIssues = issues.filter((issue) => issue.type === "sparse_pair_blurbs");
    assert.strictEqual(sparseIssues.length, 0, sparseIssues.map((issue) => issue.summary).join("; "));
  }, results);

  if (!jsonMode) {
    console.log("Running blurb quality smoke test...");
    console.log(`Flow: ${path.relative(ROOT, casesPath)}`);
    console.log("");
    console.log(`Audited pairs: ${auditedOutputs.length}`);
    console.log(`Pair-specific: ${pairSpecificCount} (${((pairSpecificCount / auditedOutputs.length) * 100).toFixed(1)}%)`);
    console.log(`Reverse synthesis: ${reverseCount} (${((reverseCount / auditedOutputs.length) * 100).toFixed(1)}%)`);
    console.log(`Fallback: ${fallbackCount} (${((fallbackCount / auditedOutputs.length) * 100).toFixed(1)}%)`);
    console.log("Top repeated phrases:");
    repeatedPhrases.forEach(([phrase, count]) => {
      console.log(`- ${phrase}: ${count}`);
    });
    console.log("");
  }

  const metrics = {
    audited_pairs: auditedOutputs.length,
    pair_specific_percent: Number(((pairSpecificCount / auditedOutputs.length) * 100).toFixed(1)),
    reverse_pair_percent: Number(((reverseCount / auditedOutputs.length) * 100).toFixed(1)),
    fallback_percent: Number(((fallbackCount / auditedOutputs.length) * 100).toFixed(1)),
    repeated_phrases: repeatedPhrases,
  };

  if (jsonMode) {
    console.log(JSON.stringify(toJsonSummary(results, metrics, issues), null, 2));
  } else {
    printResults(results);
    if (issues.length) {
      console.log("");
      console.log("Open QA issues:");
      issues.forEach((issue) => {
        console.log(`- ${issue.id}: ${issue.summary}`);
      });
    }
  }

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main();
