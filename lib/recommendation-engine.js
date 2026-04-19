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

    if (answers.bw === "timeless") {
      preferredEras.push("pre-1970", "1970s");
      mood.push("classical", "formal");
    } else if (answers.bw === "depends") {
      preferredEras.push("1970s");
    }

    if (answers.slow === "hypnotic") {
      mood.push("meditative", "melancholy");
    } else if (answers.slow === "depends") {
      mood.push("patient");
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

    return {
      mood: unique(mood),
      themes: unique(themes),
      preferredEras: unique(preferredEras),
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

  function addListToCountMap(target, values, amount) {
    values.forEach((value) => {
      const key = normalize(value);
      if (!key) {
        return;
      }
      target[key] = Number(target[key] || 0) + amount;
    });
  }

  function buildSeedProfile({ questionnaireAnswers, seedFilms, externalSeed, userProfile }) {
    const questionnaireSignals = questionnaireToSignals(questionnaireAnswers || {});
    const allSeeds = [...(seedFilms || [])];
    if (externalSeed) {
      allSeeds.push(externalSeed);
    }

    const moodCounts = buildCountMap(questionnaireSignals.mood);
    const themeCounts = buildCountMap(questionnaireSignals.themes);
    const directRecommendationSources = {};
    const seedTitles = [];
    const seedDirectors = [];
    const seedYears = [];

    allSeeds.forEach((seed) => {
      seedTitles.push(seed.title);
      if (seed.director) {
        seedDirectors.push(seed.director);
      }
      if (seed.year) {
        seedYears.push(seed.year);
      }
      addListToCountMap(moodCounts, seed.mood || [], 1);
      addListToCountMap(themeCounts, seed.themes || [], 1);

      if (seed.source === "internal" && Array.isArray(seed.directRecommendations)) {
        seed.directRecommendations.forEach((candidateFilmId) => {
          if (!directRecommendationSources[candidateFilmId]) {
            directRecommendationSources[candidateFilmId] = [];
          }
          directRecommendationSources[candidateFilmId].push(seed.title);
        });
      }
    });

    return {
      questionnaireSignals,
      moodCounts,
      themeCounts,
      seedTitles: unique(seedTitles),
      seedDirectors: unique(seedDirectors),
      seedYears: unique(seedYears),
      directRecommendationSources,
      explicitSeedFilmIds: normalizeFilmIdList((seedFilms || []).map((film) => film.filmId)),
      externalSeedTitle: externalSeed ? externalSeed.title : "",
      userProfile: normalizeUserProfile(userProfile, []),
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
    const moodOverlap = (candidateFilm.mood || []).filter((value) => seedProfile.moodCounts[normalize(value)]);
    const themeOverlap = (candidateFilm.themes || []).filter((value) => seedProfile.themeCounts[normalize(value)]);
    const sameDirector = Boolean(
      candidateFilm.director &&
        seedProfile.seedDirectors.some((director) => normalize(director) === normalize(candidateFilm.director))
    );
    const directSources = seedProfile.directRecommendationSources[candidateFilm.filmId] || [];

    const directRecommendationBoost = directSources.length ? 10 : 0;
    const moodOverlapScore = moodOverlap.length * 4;
    const themeOverlapScore = themeOverlap.length * 3;
    const sameDirectorBonus = sameDirector ? 2 : 0;
    const eraBonus = eraGapBonus(candidateFilm.year, seedProfile.seedYears);
    const userMoodAffinityScore = scoreAffinityList(candidateFilm.mood || [], normalizedUserProfile.moodAffinity);
    const userThemeAffinityScore = scoreAffinityList(candidateFilm.themes || [], normalizedUserProfile.themeAffinity);
    const userDirectorAffinityScore = candidateFilm.director
      ? Number(normalizedUserProfile.directorAffinity[normalize(candidateFilm.director)] || 0)
      : 0;

    let dislikePenalty = 0;
    if (normalizedUserProfile.dislikedFilmIds.includes(candidateFilm.filmId)) {
      dislikePenalty += 20;
    }
    dislikePenalty += Math.max(0, -Math.min(0, userMoodAffinityScore));
    dislikePenalty += Math.max(0, -Math.min(0, userThemeAffinityScore));
    dislikePenalty += Math.max(0, -Math.min(0, userDirectorAffinityScore));

    const totalScore =
      directRecommendationBoost +
      moodOverlapScore +
      themeOverlapScore +
      sameDirectorBonus +
      eraBonus +
      userMoodAffinityScore +
      userThemeAffinityScore +
      userDirectorAffinityScore -
      dislikePenalty;

    return {
      totalScore,
      breakdown: {
        directRecommendationBoost,
        moodOverlapScore,
        themeOverlapScore,
        sameDirectorBonus,
        eraBonus,
        userMoodAffinityScore,
        userThemeAffinityScore,
        userDirectorAffinityScore,
        dislikePenalty,
      },
      moodOverlap,
      themeOverlap,
      directSources,
      sameDirector,
    };
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
    buildSeedProfile,
    scoreCandidate,
    updateUserProfileFromInteraction,
  };
});
