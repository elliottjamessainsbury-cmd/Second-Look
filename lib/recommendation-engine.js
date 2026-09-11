(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.SecondLookEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const USER_PROFILE_STORAGE_KEY = "secondlook:userProfile:v1";

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function unique(values) {
    const seen = new Set();
    return values.reduce((output, value) => {
      const label = String(value || "").trim();
      const key = normalize(label);
      if (!key || seen.has(key)) {
        return output;
      }

      seen.add(key);
      output.push(label);
      return output;
    }, []);
  }

  function normalizeFilmIdList(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    return unique(values.map((value) => String(value || "").trim()));
  }

  function createEmptyUserProfile() {
    return {
      likedFilmIds: [],
      dislikedFilmIds: [],
      savedFilmIds: [],
      moodAffinity: {},
      themeAffinity: {},
      directorAffinity: {},
    };
  }

  function normalizeAffinityMap(value) {
    if (!value || typeof value !== "object") {
      return {};
    }

    return Object.entries(value).reduce((output, [key, rawValue]) => {
      const normalizedKey = normalize(key);
      const numericValue = Number(rawValue);
      if (!normalizedKey || Number.isNaN(numericValue) || numericValue === 0) {
        return output;
      }

      output[normalizedKey] = numericValue;
      return output;
    }, {});
  }

  function normalizeUserProfile(value, fallbackSavedFilmIds) {
    const base = createEmptyUserProfile();
    const savedFilmIds = normalizeFilmIdList([
      ...(fallbackSavedFilmIds || []),
      ...normalizeFilmIdList(value && value.savedFilmIds),
    ]);

    return {
      likedFilmIds: normalizeFilmIdList(value && value.likedFilmIds),
      dislikedFilmIds: normalizeFilmIdList(value && value.dislikedFilmIds),
      savedFilmIds,
      moodAffinity: normalizeAffinityMap(value && value.moodAffinity),
      themeAffinity: normalizeAffinityMap(value && value.themeAffinity),
      directorAffinity: normalizeAffinityMap(value && value.directorAffinity),
    };
  }

  function incrementAffinity(map, key, amount) {
    const normalizedKey = normalize(key);
    if (!normalizedKey) {
      return;
    }

    const nextValue = Number(map[normalizedKey] || 0) + amount;
    if (nextValue === 0) {
      delete map[normalizedKey];
      return;
    }

    map[normalizedKey] = Number(nextValue.toFixed(2));
  }

  function questionnaireToSignals(answers) {
    const mood = [];
    const themes = [];
    const preferredEras = [];
    const preferredPaces = [];
    const lowWeightMood = [];
    const lowWeightThemes = [];

    if (answers.bw === "timeless") {
      preferredEras.push("pre-1970", "1970s");
      mood.push("classical", "formal");
    } else if (answers.bw === "depends") {
      preferredEras.push("1970s");
    }

    if (answers.slow === "hypnotic") {
      mood.push("meditative", "melancholy");
      preferredPaces.push("slow");
    } else if (answers.slow === "depends") {
      mood.push("patient");
      preferredPaces.push("medium");
    } else if (answers.slow === "move_it") {
      preferredPaces.push("fast");
    }

    if (answers.weird === "max") {
      mood.push("dreamlike", "unsettling");
      themes.push("obsession", "identity");
    } else if (answers.weird === "medium") {
      mood.push("strange");
      themes.push("dislocation");
    }

    if (answers.craft_vs_feeling === "craft") {
      mood.push("precise");
      themes.push("form");
    } else if (answers.craft_vs_feeling === "feeling") {
      mood.push("tender");
      themes.push("intimacy");
    }

    if (answers.ambiguity === "love") {
      themes.push("ambiguity", "memory");
      mood.push("mysterious");
    } else if (answers.ambiguity === "sometimes") {
      themes.push("memory");
    }

    if (answers.subtitles === "essential") {
      themes.push("distance");
    }

    if (answers.ari_aster === "hereditary") {
      lowWeightMood.push("dreamlike", "playful");
    } else if (answers.ari_aster === "midsommar") {
      lowWeightMood.push("intimate");
      lowWeightThemes.push("identity");
    } else if (answers.ari_aster === "beau") {
      lowWeightMood.push("tense");
      lowWeightThemes.push("family");
    }

    return {
      mood: unique(mood),
      themes: unique(themes),
      preferredEras: unique(preferredEras),
      preferredPaces: unique(preferredPaces),
      lowWeightMood: unique(lowWeightMood),
      lowWeightThemes: unique(lowWeightThemes),
    };
  }

  function buildCountMap(values) {
    return values.reduce((output, value) => {
      const key = normalize(value);
      if (!key) {
        return output;
      }

      output[key] = Number(output[key] || 0) + 1;
      return output;
    }, {});
  }

  const SCORE_WEIGHTS = {
    curatedEdge: 40,
    semanticSimilarity: 24,
    editorialOverlap: 24,
    sharedDirectorOrMovement: 8,
    structuralMatch: 8,
    elliottRatingPriorMin: -4,
    elliottRatingPriorMax: 8,
    letterboxdRatingBoost: 8,
    learnedAffinityMin: -12,
    learnedAffinityMax: 12,
    dislikedPenalty: -35,
    genericMatchPenalty: -10,
  };

  function listify(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    return value ? [value] : [];
  }

  function addListToCountMap(target, values, amount) {
    values.forEach((value) => {
      const key = normalize(value);
      if (!key) {
        return;
      }
      target[key] = Number(target[key] || 0) + amount;
    });
  }

  function addValueToCountMap(target, value, amount) {
    const key = normalize(value);
    if (!key) {
      return;
    }
    target[key] = Number(target[key] || 0) + amount;
  }

  function buildOverlap(values, countMap) {
    return unique(listify(values).filter((value) => Number(countMap[normalize(value)] || 0) > 0));
  }

  function weightedOverlapScore(values, countMap, unitWeight) {
    return buildOverlap(values, countMap).reduce(
      (total, value) => total + Math.min(Number(countMap[normalize(value)] || 0), 2) * unitWeight,
      0
    );
  }

  function decadeLabel(year) {
    if (!year || Number.isNaN(Number(year))) {
      return "";
    }
    return `${Math.floor(Number(year) / 10) * 10}s`;
  }

  function primaryValue(values) {
    return normalize(listify(values)[0]);
  }

  function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) {
      return 0;
    }
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftValue = Number(left[index]) || 0;
      const rightValue = Number(right[index]) || 0;
      dot += leftValue * rightValue;
      leftNorm += leftValue * leftValue;
      rightNorm += rightValue * rightValue;
    }
    return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
  }

  function blendQueryVectors(groups) {
    const active = (groups || []).filter((group) => Array.isArray(group.vector) && group.vector.length && group.weight > 0);
    if (!active.length) {
      return null;
    }
    const dimensions = active[0].vector.length;
    if (active.some((group) => group.vector.length !== dimensions)) {
      return null;
    }
    const weightTotal = active.reduce((total, group) => total + group.weight, 0);
    const blended = Array(dimensions).fill(0);
    active.forEach((group) => {
      const normalizedWeight = group.weight / weightTotal;
      group.vector.forEach((value, index) => {
        blended[index] += (Number(value) || 0) * normalizedWeight;
      });
    });
    const magnitude = Math.sqrt(blended.reduce((total, value) => total + value * value, 0));
    return magnitude ? blended.map((value) => value / magnitude) : blended;
  }

  function buildSeedProfile({ questionnaireAnswers, seedFilms, externalSeed, externalSeeds, userProfile, profileFilms, dislikedFilms, queryVector, refinements }) {
    const questionnaireSignals = questionnaireToSignals(questionnaireAnswers || {});
    const explicitSeeds = [...(seedFilms || [])];
    const profileSignalFilms = [...(profileFilms || [])];
    const negativeSignalFilms = [...(dislikedFilms || [])];
    const allPositiveSignalFilms = [...explicitSeeds, ...profileSignalFilms];
    const normalizedExternalSeeds = Array.isArray(externalSeeds)
      ? externalSeeds.filter(Boolean)
      : externalSeed
        ? [externalSeed]
        : [];
    allPositiveSignalFilms.push(...normalizedExternalSeeds);

    const moodCounts = buildCountMap(questionnaireSignals.mood);
    const themeCounts = buildCountMap(questionnaireSignals.themes);
    addListToCountMap(moodCounts, questionnaireSignals.lowWeightMood || [], 0.35);
    addListToCountMap(themeCounts, questionnaireSignals.lowWeightThemes || [], 0.35);
    const toneCounts = {};
    const paceCounts = {};
    const genreCounts = {};
    const countryCounts = {};
    const formalStyleCounts = {};
    const intensityCounts = {};
    const ambiguityCounts = {};
    const accessibilityCounts = {};
    const movementCounts = {};
    const dislikedMoodCounts = {};
    const dislikedThemeCounts = {};
    const dislikedToneCounts = {};
    const dislikedGenreCounts = {};
    const dislikedCountryCounts = {};
    const dislikedDirectorCounts = {};
    const directRecommendationSources = {};
    const seedTitles = [];
    const seedDirectors = [];
    const seedYears = [];
    const seedCountries = [];

    addListToCountMap(paceCounts, questionnaireSignals.preferredPaces || [], 1);

    function applyPositiveFilmSignals(film, amount) {
      addListToCountMap(moodCounts, film.mood || [], amount);
      addListToCountMap(themeCounts, film.themes || [], amount);
      addListToCountMap(toneCounts, film.tone || [], amount);
      addListToCountMap(genreCounts, film.genres || [], amount);
      addListToCountMap(countryCounts, film.countries || [], amount);
      addListToCountMap(paceCounts, listify(film.pace), amount);
      addListToCountMap(formalStyleCounts, film.formalStyle || [], amount);
      addListToCountMap(intensityCounts, listify(film.intensity), amount);
      addListToCountMap(ambiguityCounts, listify(film.ambiguity), amount);
      addListToCountMap(accessibilityCounts, listify(film.accessibility), amount);
      addListToCountMap(movementCounts, listify(film.movement), amount);
    }

    function applyNegativeFilmSignals(film, amount) {
      addListToCountMap(dislikedMoodCounts, film.mood || [], amount);
      addListToCountMap(dislikedThemeCounts, film.themes || [], amount);
      addListToCountMap(dislikedToneCounts, film.tone || [], amount);
      addListToCountMap(dislikedGenreCounts, film.genres || [], amount);
      addListToCountMap(dislikedCountryCounts, film.countries || [], amount);
      if (film.director) {
        addValueToCountMap(dislikedDirectorCounts, film.director, amount);
      }
    }

    allPositiveSignalFilms.forEach((seed) => {
      seedTitles.push(seed.title);
      if (seed.director) {
        seedDirectors.push(seed.director);
      }
      if (seed.year) {
        seedYears.push(seed.year);
      }
      if (Array.isArray(seed.countries)) {
        seedCountries.push(...seed.countries);
      }

      const isExplicitExternalSeed = normalizedExternalSeeds.includes(seed);
      const weight = explicitSeeds.includes(seed) || isExplicitExternalSeed ? 1.2 : 0.8;
      applyPositiveFilmSignals(seed, weight);

      if (seed.source === "internal" && Array.isArray(seed.directRecommendations)) {
        seed.directRecommendations.forEach((candidateFilmId) => {
          if (!directRecommendationSources[candidateFilmId]) {
            directRecommendationSources[candidateFilmId] = [];
          }
          directRecommendationSources[candidateFilmId].push(seed.title);
        });
      }
    });

    negativeSignalFilms.forEach((film) => {
      applyNegativeFilmSignals(film, 1);
    });

    return {
      questionnaireSignals,
      moodCounts,
      themeCounts,
      toneCounts,
      paceCounts,
      genreCounts,
      countryCounts,
      formalStyleCounts,
      intensityCounts,
      ambiguityCounts,
      accessibilityCounts,
      movementCounts,
      dislikedMoodCounts,
      dislikedThemeCounts,
      dislikedToneCounts,
      dislikedGenreCounts,
      dislikedCountryCounts,
      dislikedDirectorCounts,
      seedTitles: unique(seedTitles),
      seedDirectors: unique(seedDirectors),
      seedYears: unique(seedYears),
      seedCountries: unique(seedCountries),
      directRecommendationSources,
      explicitSeedFilmIds: normalizeFilmIdList((seedFilms || []).map((film) => film.filmId)),
      externalSeedTitle: normalizedExternalSeeds[0] ? normalizedExternalSeeds[0].title : "",
      externalSeedTitles: unique(normalizedExternalSeeds.map((seed) => seed.title)),
      userProfile: normalizeUserProfile(userProfile, []),
      queryVector: Array.isArray(queryVector) ? queryVector : null,
      refinements: refinements || {},
    };
  }

  function eraGapBonus(candidateYear, seedYears) {
    if (!candidateYear || !seedYears.length) {
      return 0;
    }

    const closeMatch = seedYears.some((year) => Math.abs(candidateYear - year) <= 6);
    if (closeMatch) {
      return 1;
    }

    const sameDecade = seedYears.some((year) => Math.floor(year / 10) === Math.floor(candidateYear / 10));
    return sameDecade ? 1 : 0;
  }

  function scoreAffinityList(values, affinityMap) {
    return values.reduce((total, value) => total + Number(affinityMap[normalize(value)] || 0), 0);
  }

  function scoreCandidate(candidateFilm, seedProfile, userProfile) {
    const normalizedUserProfile = normalizeUserProfile(userProfile, []);
    const moodOverlap = buildOverlap(candidateFilm.mood || [], seedProfile.moodCounts || {});
    const themeOverlap = buildOverlap(candidateFilm.themes || [], seedProfile.themeCounts || {});
    const toneOverlap = buildOverlap(candidateFilm.tone || [], seedProfile.toneCounts || {});
    const paceOverlap = buildOverlap(candidateFilm.pace || [], seedProfile.paceCounts || {});
    const genreOverlap = buildOverlap(candidateFilm.genres || [], seedProfile.genreCounts || {});
    const countryOverlap = buildOverlap(candidateFilm.countries || [], seedProfile.countryCounts || {});
    const formalStyleOverlap = buildOverlap(candidateFilm.formalStyle || [], seedProfile.formalStyleCounts || {});
    const intensityOverlap = buildOverlap(candidateFilm.intensity || [], seedProfile.intensityCounts || {});
    const ambiguityOverlap = buildOverlap(candidateFilm.ambiguity || [], seedProfile.ambiguityCounts || {});
    const accessibilityOverlap = buildOverlap(candidateFilm.accessibility || [], seedProfile.accessibilityCounts || {});
    const movementOverlap = buildOverlap(candidateFilm.movement || [], seedProfile.movementCounts || {});
    const sameDirector = Boolean(
      candidateFilm.director &&
        seedProfile.seedDirectors.some((director) => normalize(director) === normalize(candidateFilm.director))
    );
    const directSources = seedProfile.directRecommendationSources[candidateFilm.filmId] || [];
    const directRecommendationBoost = directSources.length
      ? SCORE_WEIGHTS.curatedEdge + Math.max(0, directSources.length - 1) * 5
      : 0;
    const editorialMatches = unique([
      ...moodOverlap, ...themeOverlap, ...toneOverlap, ...paceOverlap, ...formalStyleOverlap,
      ...intensityOverlap, ...ambiguityOverlap, ...accessibilityOverlap,
    ]);
    const editorialOverlapScore = Math.min(SCORE_WEIGHTS.editorialOverlap, editorialMatches.length * 4);
    const sameDirectorBonus = sameDirector || movementOverlap.length ? SCORE_WEIGHTS.sharedDirectorOrMovement : 0;
    const structureMatches = genreOverlap.length + countryOverlap.length + eraGapBonus(candidateFilm.year, seedProfile.seedYears);
    const structuralMatchScore = Math.min(SCORE_WEIGHTS.structuralMatch, structureMatches * 2);
    const userMoodAffinityScore = scoreAffinityList(candidateFilm.mood || [], normalizedUserProfile.moodAffinity);
    const userThemeAffinityScore = scoreAffinityList(candidateFilm.themes || [], normalizedUserProfile.themeAffinity);
    const userToneAffinityScore = 0;
    const userDirectorAffinityScore = candidateFilm.director
      ? Number(normalizedUserProfile.directorAffinity[normalize(candidateFilm.director)] || 0)
      : 0;
    const rawAffinity = userMoodAffinityScore + userThemeAffinityScore + userDirectorAffinityScore;
    const learnedAffinityScore = Math.max(
      SCORE_WEIGHTS.learnedAffinityMin,
      Math.min(SCORE_WEIGHTS.learnedAffinityMax, rawAffinity)
    );
    const elliottRating = Number(candidateFilm.elliottRating || 0);
    const elliottRatingPrior = elliottRating
      ? Math.max(SCORE_WEIGHTS.elliottRatingPriorMin, Math.min(SCORE_WEIGHTS.elliottRatingPriorMax, elliottRating * 3 - 7))
      : 0;
    const letterboxdRatingBoost = Math.min(Number(candidateFilm.averageRating || 0) / 5, 1) * SCORE_WEIGHTS.letterboxdRatingBoost;
    const semanticSimilarity = Math.max(0, cosineSimilarity(seedProfile.queryVector, candidateFilm.embedding));
    const semanticSimilarityScore = semanticSimilarity * SCORE_WEIGHTS.semanticSimilarity;

    const dislikedMoodOverlap = buildOverlap(candidateFilm.mood || [], seedProfile.dislikedMoodCounts || {});
    const dislikedThemeOverlap = buildOverlap(candidateFilm.themes || [], seedProfile.dislikedThemeCounts || {});
    const dislikedToneOverlap = buildOverlap(candidateFilm.tone || [], seedProfile.dislikedToneCounts || {});
    const dislikedGenreOverlap = buildOverlap(candidateFilm.genres || [], seedProfile.dislikedGenreCounts || {});
    const dislikedCountryOverlap = buildOverlap(candidateFilm.countries || [], seedProfile.dislikedCountryCounts || {});

    let dislikePenalty = 0;
    if (normalizedUserProfile.dislikedFilmIds.includes(candidateFilm.filmId)) {
      dislikePenalty += Math.abs(SCORE_WEIGHTS.dislikedPenalty);
    }
    dislikePenalty += Math.max(0, -Math.min(0, userMoodAffinityScore));
    dislikePenalty += Math.max(0, -Math.min(0, userThemeAffinityScore));
    dislikePenalty += Math.max(0, -Math.min(0, userDirectorAffinityScore));
    dislikePenalty += dislikedMoodOverlap.length * 3;
    dislikePenalty += dislikedThemeOverlap.length * 5;
    dislikePenalty += dislikedToneOverlap.length * 4;
    dislikePenalty += dislikedGenreOverlap.length * 1;
    dislikePenalty += dislikedCountryOverlap.length * 1;
    if (candidateFilm.director && Number((seedProfile.dislikedDirectorCounts || {})[normalize(candidateFilm.director)] || 0) > 0) {
      dislikePenalty += 6;
    }

    const hasSpecificConnection =
      directSources.length ||
      themeOverlap.length ||
      toneOverlap.length ||
      moodOverlap.length ||
      paceOverlap.length || formalStyleOverlap.length || movementOverlap.length ||
      sameDirector ||
      userMoodAffinityScore > 0 ||
      userThemeAffinityScore > 0 ||
      userDirectorAffinityScore > 0;
    const genericOnlyMatch = !hasSpecificConnection && (genreOverlap.length || countryOverlap.length || structureMatches > 0);
    const genericMatchPenalty = genericOnlyMatch ? Math.abs(SCORE_WEIGHTS.genericMatchPenalty) : 0;
    const refinements = seedProfile.refinements || {};
    let refinementScore = 0;
    if (refinements.pace && refinements.pace !== "any" && normalize(candidateFilm.pace) === normalize(refinements.pace)) {
      refinementScore += 4;
    }
    if (refinements.temperature && refinements.temperature !== "any") {
      const wantedIntensity = refinements.temperature === "cool" ? "low" : refinements.temperature === "hot" ? "high" : "medium";
      if (normalize(candidateFilm.intensity) === wantedIntensity) refinementScore += 4;
    }
    if (refinements.era && refinements.era !== "any") {
      const year = Number(candidateFilm.year || 0);
      if ((refinements.era === "classic" && year && year < 1970) ||
          (refinements.era === "modern" && year >= 2000) ||
          (refinements.era === "late-century" && year >= 1970 && year < 2000)) refinementScore += 4;
    }
    if (refinements.wander === "close" && editorialMatches.length) refinementScore += 3;
    if (refinements.wander === "far" && !sameDirector && !countryOverlap.length) refinementScore += 3;

    const totalScore =
      directRecommendationBoost +
      semanticSimilarityScore +
      editorialOverlapScore +
      sameDirectorBonus +
      structuralMatchScore +
      elliottRatingPrior +
      letterboxdRatingBoost +
      learnedAffinityScore -
      dislikePenalty -
      genericMatchPenalty +
      refinementScore;

    const reasons = [];
    if (directSources.length) {
      reasons.push("curated connection");
    }
    if (themeOverlap.length) {
      reasons.push(`shared themes: ${themeOverlap.slice(0, 3).join(", ")}`);
    }
    if (toneOverlap.length) {
      reasons.push(`tone match: ${toneOverlap.slice(0, 2).join(", ")}`);
    }
    if (moodOverlap.length) {
      reasons.push(`mood match: ${moodOverlap.slice(0, 2).join(", ")}`);
    }
    if (paceOverlap.length) {
      reasons.push(`pace match: ${paceOverlap.slice(0, 1).join(", ")}`);
    }
    if (sameDirector && candidateFilm.director) {
      reasons.push(`director affinity: ${candidateFilm.director}`);
    }
    if (countryOverlap.length) {
      reasons.push(`country link: ${countryOverlap.slice(0, 2).join(", ")}`);
    }
    if (genericOnlyMatch) {
      reasons.push("generic genre-only match");
    }
    if (normalizedUserProfile.dislikedFilmIds.includes(candidateFilm.filmId) || dislikePenalty > 0 && !directSources.length) {
      reasons.push("penalised by dislike signal");
    }

    const explanation = {
      reasons,
      curatedConnection: directSources.slice(),
      sharedThemes: themeOverlap,
      sharedTone: toneOverlap,
      sharedMood: moodOverlap,
      sharedPace: paceOverlap,
      sharedGenres: genreOverlap,
      sharedCountries: countryOverlap,
      sharedFormalStyle: formalStyleOverlap,
      sharedMovement: movementOverlap,
      semanticSimilarity,
      sameDirector: sameDirector ? candidateFilm.director : "",
      genericOnlyMatch,
      penalizedByDislike: dislikePenalty > 0,
    };

    return {
      totalScore,
      reasons,
      explanation,
      breakdown: {
        directRecommendationBoost,
        semanticSimilarityScore,
        editorialOverlapScore,
        sameDirectorBonus,
        structuralMatchScore,
        userMoodAffinityScore,
        userThemeAffinityScore,
        userToneAffinityScore,
        userDirectorAffinityScore,
        learnedAffinityScore,
        elliottRatingPrior,
        letterboxdRatingBoost,
        refinementScore,
        genericMatchPenalty,
        dislikePenalty,
      },
      moodOverlap,
      themeOverlap,
      toneOverlap,
      paceOverlap,
      genreOverlap,
      countryOverlap,
      directSources,
      sameDirector,
      genericOnlyMatch,
    };
  }

  function diversifyRecommendations(scoredCandidates, limit) {
    const maxItems = Number.isFinite(limit) && limit > 0 ? limit : 9;
    const selected = [];
    const selectedIds = new Set();
    const directorCounts = new Map();
    const countryCounts = new Map();
    const genreCounts = new Map();
    const decadeCounts = new Map();

    function addItem(item) {
      selected.push(item);
      selectedIds.add(item.film.filmId);

      const directorKey = normalize(item.film.director);
      const countryKey = primaryValue(item.film.countries || []);
      const genreKey = primaryValue(item.film.genres || []);
      const decadeKey = decadeLabel(item.film.year);

      if (directorKey) {
        directorCounts.set(directorKey, Number(directorCounts.get(directorKey) || 0) + 1);
      }
      if (countryKey) {
        countryCounts.set(countryKey, Number(countryCounts.get(countryKey) || 0) + 1);
      }
      if (genreKey) {
        genreCounts.set(genreKey, Number(genreCounts.get(genreKey) || 0) + 1);
      }
      if (decadeKey) {
        decadeCounts.set(decadeKey, Number(decadeCounts.get(decadeKey) || 0) + 1);
      }
    }

    const curatedPriority = (scoredCandidates || []).filter(
      (item) => item && item.film && item.scoreData && (item.scoreData.directSources || []).length
    );

    curatedPriority.forEach((item) => {
      if (selected.length >= maxItems || selectedIds.has(item.film.filmId)) {
        return;
      }
      addItem(item);
    });

    (scoredCandidates || []).forEach((item) => {
      if (!item || !item.film || !item.scoreData || selected.length >= maxItems || selectedIds.has(item.film.filmId)) {
        return;
      }

      const hasStrongCuratedEdge = (item.scoreData.directSources || []).length > 0;
      const directorKey = normalize(item.film.director);
      const countryKey = primaryValue(item.film.countries || []);
      const genreKey = primaryValue(item.film.genres || []);
      const decadeKey = decadeLabel(item.film.year);

      if (!hasStrongCuratedEdge) {
        if (directorKey && Number(directorCounts.get(directorKey) || 0) >= 1) {
          return;
        }
        if (countryKey && Number(countryCounts.get(countryKey) || 0) >= 2) {
          return;
        }
        if (genreKey && Number(genreCounts.get(genreKey) || 0) >= 3) {
          return;
        }
        if (decadeKey && Number(decadeCounts.get(decadeKey) || 0) >= 3) {
          return;
        }
      }

      addItem(item);
    });

    (scoredCandidates || []).forEach((item) => {
      if (!item || !item.film || selected.length >= maxItems || selectedIds.has(item.film.filmId)) {
        return;
      }
      addItem(item);
    });

    return selected.slice(0, maxItems);
  }

  function updateUserProfileFromInteraction({ filmId, actionType, filmData, userProfile }) {
    const nextProfile = normalizeUserProfile(userProfile, []);
    const moodValues = filmData && Array.isArray(filmData.mood) ? filmData.mood : [];
    const themeValues = filmData && Array.isArray(filmData.themes) ? filmData.themes : [];
    const directorValue = filmData && filmData.director ? filmData.director : "";

    function applyPositive(moodDelta, themeDelta, directorDelta) {
      moodValues.forEach((value) => incrementAffinity(nextProfile.moodAffinity, value, moodDelta));
      themeValues.forEach((value) => incrementAffinity(nextProfile.themeAffinity, value, themeDelta));
      if (directorValue) {
        incrementAffinity(nextProfile.directorAffinity, directorValue, directorDelta);
      }
    }

    function applyNegative(moodDelta, themeDelta, directorDelta) {
      moodValues.forEach((value) => incrementAffinity(nextProfile.moodAffinity, value, moodDelta));
      themeValues.forEach((value) => incrementAffinity(nextProfile.themeAffinity, value, themeDelta));
      if (directorValue) {
        incrementAffinity(nextProfile.directorAffinity, directorValue, directorDelta);
      }
    }

    if (actionType === "save") {
      if (!nextProfile.savedFilmIds.includes(filmId)) {
        nextProfile.savedFilmIds = [filmId, ...nextProfile.savedFilmIds];
      }
      if (!nextProfile.likedFilmIds.includes(filmId)) {
        nextProfile.likedFilmIds = [filmId, ...nextProfile.likedFilmIds];
        applyPositive(2, 2, 1);
      }
      nextProfile.dislikedFilmIds = nextProfile.dislikedFilmIds.filter((id) => id !== filmId);
      return nextProfile;
    }

    if (actionType === "not_for_me") {
      if (!nextProfile.dislikedFilmIds.includes(filmId)) {
        nextProfile.dislikedFilmIds = [filmId, ...nextProfile.dislikedFilmIds];
        applyNegative(-1, -1, -1);
      }
      nextProfile.savedFilmIds = nextProfile.savedFilmIds.filter((id) => id !== filmId);
      nextProfile.likedFilmIds = nextProfile.likedFilmIds.filter((id) => id !== filmId);
      return nextProfile;
    }

    if (actionType === "outbound_click") {
      applyPositive(3, 3, 2);
      if (!nextProfile.likedFilmIds.includes(filmId)) {
        nextProfile.likedFilmIds = [filmId, ...nextProfile.likedFilmIds];
      }
      return nextProfile;
    }

    if (actionType === "unsave") {
      nextProfile.savedFilmIds = nextProfile.savedFilmIds.filter((id) => id !== filmId);
      return nextProfile;
    }

    return nextProfile;
  }

  return {
    USER_PROFILE_STORAGE_KEY,
    normalize,
    unique,
    createEmptyUserProfile,
    normalizeUserProfile,
    questionnaireToSignals,
    cosineSimilarity,
    blendQueryVectors,
    buildSeedProfile,
    scoreCandidate,
    diversifyRecommendations,
    SCORE_WEIGHTS,
    updateUserProfileFromInteraction,
  };
});
