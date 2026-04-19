const LEGACY_SAVED_FILMS_STORAGE_KEY = "secondlook:savedFilmIds";
const SESSION_STATE_STORAGE_KEY = "secondlook:sessionState:v2";

const {
  USER_PROFILE_STORAGE_KEY,
  normalize,
  unique,
  createEmptyUserProfile,
  normalizeUserProfile,
  buildSeedProfile,
  scoreCandidate,
  updateUserProfileFromInteraction,
} = window.SecondLookEngine || {};

if (!window.SecondLookEngine) {
  throw new Error("SecondLookEngine failed to load.");
}

function getLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function loadLegacySavedFilmIds() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return [];
    }

    const raw = storage.getItem(LEGACY_SAVED_FILMS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to load legacy saved ids.", error);
    return [];
  }
}

function loadUserProfile() {
  try {
    const storage = getLocalStorage();
    const legacySaved = loadLegacySavedFilmIds();
    if (!storage) {
      return normalizeUserProfile(createEmptyUserProfile(), legacySaved);
    }

    const raw = storage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) {
      return normalizeUserProfile(createEmptyUserProfile(), legacySaved);
    }

    return normalizeUserProfile(JSON.parse(raw), legacySaved);
  } catch (error) {
    console.warn("Failed to load user profile.", error);
    return normalizeUserProfile(createEmptyUserProfile(), loadLegacySavedFilmIds());
  }
}

function saveUserProfile() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    storage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(state.userProfile));
  } catch (error) {
    console.warn("Failed to save user profile.", error);
  }
}

function baseSessionState() {
  return {
    answers: {},
    seedFilmIds: [],
    externalSeedTitle: "",
    expandedCardKey: "",
    hasGenerated: false,
  };
}

function normalizeSessionState(value) {
  const base = baseSessionState();
  if (!value || typeof value !== "object") {
    return base;
  }

  return {
    answers: value.answers && typeof value.answers === "object" ? value.answers : {},
    seedFilmIds: Array.isArray(value.seedFilmIds) ? unique(value.seedFilmIds) : [],
    externalSeedTitle: value.externalSeedTitle ? String(value.externalSeedTitle) : "",
    expandedCardKey: value.expandedCardKey ? String(value.expandedCardKey) : "",
    hasGenerated: Boolean(value.hasGenerated),
  };
}

function loadSessionState() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return baseSessionState();
    }

    const raw = storage.getItem(SESSION_STATE_STORAGE_KEY);
    if (!raw) {
      return baseSessionState();
    }

    return normalizeSessionState(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load session state.", error);
    return baseSessionState();
  }
}

function saveSessionState() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    storage.setItem(
      SESSION_STATE_STORAGE_KEY,
      JSON.stringify({
        answers: state.session.answers,
        seedFilmIds: state.session.seedFilmIds,
        externalSeedTitle: state.session.externalSeed ? state.session.externalSeed.title : "",
        expandedCardKey: state.session.expandedCardKey,
        hasGenerated: state.session.hasGenerated,
      })
    );
  } catch (error) {
    console.warn("Failed to save session state.", error);
  }
}

const persistedSession = loadSessionState();

const state = {
  internalFilms: [],
  internalFilmById: {},
  internalFilmByTitleKey: {},
  externalSeedPool: [],
  metadataByTitle: {},
  tmdbMetadataByTitle: {},
  recommendationBlurbsByPairId: {},
  recommendationBlurbsByPairTitle: {},
  availabilityByFilmId: {},
  query: "",
  externalSearchResults: [],
  quickPicks: [],
  recommendations: [],
  userProfile: loadUserProfile(),
  session: {
    answers: persistedSession.answers,
    seedFilmIds: persistedSession.seedFilmIds,
    externalSeed: null,
    expandedCardKey: persistedSession.expandedCardKey,
    hasGenerated: persistedSession.hasGenerated,
  },
  loading: true,
  error: "",
};

const elements = {
  movieSearch: document.querySelector("#movie-search"),
  addFirstMatch: document.querySelector("#add-first-match"),
  searchResults: document.querySelector("#search-results"),
  directorList: document.querySelector("#director-list"),
  selectedSeeds: document.querySelector("#selected-seeds"),
  discoveryBookmarks: document.querySelector("#discovery-bookmarks"),
  resetDirector: document.querySelector("#reset-director"),
  clearRecommendations: document.querySelector("#clear-recommendations"),
  resultsGrid: document.querySelector("#results-grid"),
  criterionSection: document.querySelector("#criterion-section"),
  resultsTitle: document.querySelector("#results-title"),
  savedFilmsList: document.querySelector("#saved-films-list"),
};

const isSavedPage = Boolean(
  typeof document !== "undefined" &&
    document.body &&
    document.body.classList &&
    document.body.classList.contains("saved-page")
);

const tasteQuizQuestions = [
  {
    id: "bw",
    prompt: "Black & white films:",
    answers: [
      { id: "timeless", label: "Timeless" },
      { id: "depends", label: "Depends" },
      { id: "homework", label: "Homework" },
    ],
  },
  {
    id: "subtitles",
    prompt: "Subtitles:",
    answers: [
      { id: "essential", label: "Essential" },
      { id: "fine", label: "Fine if it’s worth it" },
      { id: "prefer_not", label: "Prefer not" },
    ],
  },
  {
    id: "slow",
    prompt: "Slow films:",
    answers: [
      { id: "hypnotic", label: "Hypnotic" },
      { id: "depends", label: "Depends" },
      { id: "move_it", label: "Move it along" },
    ],
  },
  {
    id: "weird",
    prompt: "Weirdness:",
    answers: [
      { id: "max", label: "As weird as it gets" },
      { id: "medium", label: "A little strange is good" },
      { id: "grounded", label: "Keep it grounded" },
    ],
  },
  {
    id: "craft_vs_feeling",
    prompt: "What matters more:",
    answers: [
      { id: "craft", label: "How it’s made" },
      { id: "feeling", label: "How it makes me feel" },
    ],
  },
  {
    id: "ambiguity",
    prompt: "Ambiguous endings:",
    answers: [
      { id: "love", label: "That’s the point" },
      { id: "sometimes", label: "Fine occasionally" },
      { id: "clear", label: "Just tell me what happened" },
    ],
  },
];

function shuffleList(values) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function mergeLists(...lists) {
  return unique(lists.flat().filter(Boolean));
}

function answerCount() {
  return Object.keys(state.session.answers).length;
}

function isQuizComplete() {
  return answerCount() === tasteQuizQuestions.length;
}

function buildTitleIndex(items, getTitle) {
  return items.reduce((output, item) => {
    output[normalize(getTitle(item))] = item;
    return output;
  }, {});
}

function metadataForTitle(title) {
  if (state.metadataByTitle[title]) {
    return state.metadataByTitle[title];
  }

  return state.metadataByTitle[Object.keys(state.metadataByTitle).find((key) => normalize(key) === normalize(title))] || null;
}

function tmdbMetadataForTitle(title) {
  if (state.tmdbMetadataByTitle[title]) {
    return state.tmdbMetadataByTitle[title];
  }

  return (
    state.tmdbMetadataByTitle[
      Object.keys(state.tmdbMetadataByTitle).find((key) => normalize(key) === normalize(title))
    ] || null
  );
}

function defaultRetailerSearchLinks(title) {
  const encoded = encodeURIComponent(title);
  return [
    {
      retailer: "Criterion",
      url: `https://www.criterion.com/search?q=${encoded}`,
    },
    {
      retailer: "BFI Shop",
      url: `https://shop.bfi.org.uk/search.php?search_query=${encoded}`,
    },
    {
      retailer: "HMV",
      url: `https://hmv.com/search?searchtext=${encoded}`,
    },
  ];
}

function availabilityForFilm(film) {
  return state.availabilityByFilmId[film.filmId] || null;
}

function normalizedRetailerLinks(film) {
  const availability = availabilityForFilm(film);
  const existing = availability?.physical_media?.retailer_search_links || [];
  const byRetailer = new Map();

  existing.forEach((item) => {
    if (!item?.retailer || !item?.url) {
      return;
    }
    if (!byRetailer.has(item.retailer)) {
      byRetailer.set(item.retailer, item);
    }
  });

  defaultRetailerSearchLinks(film.title).forEach((item) => {
    if (!byRetailer.has(item.retailer)) {
      byRetailer.set(item.retailer, item);
    }
  });

  return ["Criterion", "BFI Shop", "HMV"]
    .map((retailer) => byRetailer.get(retailer))
    .filter(Boolean);
}

function makeLetterboxdSlug(title) {
  const normalizedTitle = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const overrides = {
    tar: "tar-2022",
    "dune-part-two": "dune-part-two",
    "dune-part-2": "dune-part-two",
    "suspiria-guadagnino-version": "suspiria-2018",
  };

  return overrides[normalizedTitle] || normalizedTitle;
}

function makeLetterboxdUrl(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.letterboxd_url) {
    return metadata.letterboxd_url;
  }

  return `https://letterboxd.com/film/${makeLetterboxdSlug(title)}/`;
}

function makePosterUrl(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.poster_url) {
    return metadata.poster_url;
  }

  const tmdb = tmdbMetadataForTitle(title);
  if (tmdb?.poster_path) {
    return `https://image.tmdb.org/t/p/w342${tmdb.poster_path}`;
  }

  return "";
}

function renderPosterMarkup(title) {
  const posterUrl = makePosterUrl(title);
  if (posterUrl) {
    return `<img class="poster-image" src="${posterUrl}" alt="Poster for ${title}" loading="lazy" />`;
  }

  return `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
}

function synopsisForTitle(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.intro) {
    return metadata.intro;
  }

  const tmdb = tmdbMetadataForTitle(title);
  if (tmdb?.overview) {
    return tmdb.overview;
  }

  return "No extended synopsis available yet.";
}

function monogramForTitle(title) {
  return String(title || "")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function buildBlurbIndices(rawBlurbs, internalFilmByTitleKey) {
  const byTitle = {};
  const byId = {};

  Object.entries(rawBlurbs).forEach(([key, value]) => {
    const [leftTitle, rightTitle] = key.split("::");
    if (!leftTitle || !rightTitle) {
      return;
    }

    byTitle[`${normalize(leftTitle)}::${normalize(rightTitle)}`] = value;

    const leftFilm = internalFilmByTitleKey[normalize(leftTitle)];
    const rightFilm = internalFilmByTitleKey[normalize(rightTitle)];
    if (leftFilm && rightFilm) {
      byId[`${leftFilm.filmId}::${rightFilm.filmId}`] = value;
    }
  });

  return { byId, byTitle };
}

function blurbForPair(seed, candidate) {
  if (!seed || !candidate) {
    return null;
  }

  function reverseToForward(entry, leftTitle, rightTitle) {
    const points = (entry.supporting_points || []).slice(0, 3);
    if (points.length) {
      return {
        ...entry,
        blurb: `${leftTitle} and ${rightTitle} connect through ${formatList(points)}. That shared terrain is why ${rightTitle} feels like a strong follow-on from ${leftTitle}.`,
      };
    }

    if (entry.primary_angle) {
      const angle = entry.primary_angle.replace(/\.$/, "");
      return {
        ...entry,
        blurb: `${leftTitle} and ${rightTitle} sit in related territory: ${angle.toLowerCase()}. That is what makes ${rightTitle} feel closely linked to ${leftTitle}.`,
      };
    }

    return entry;
  }

  if (seed.filmId && candidate.filmId) {
    const directId = state.recommendationBlurbsByPairId[`${seed.filmId}::${candidate.filmId}`];
    if (directId) {
      return directId;
    }

    const reverseId = state.recommendationBlurbsByPairId[`${candidate.filmId}::${seed.filmId}`];
    if (reverseId) {
      return reverseToForward(reverseId, seed.title, candidate.title);
    }
  }

  const titleKey = `${normalize(seed.title)}::${normalize(candidate.title)}`;
  if (state.recommendationBlurbsByPairTitle[titleKey]) {
    return state.recommendationBlurbsByPairTitle[titleKey];
  }

  const reverseTitleKey = `${normalize(candidate.title)}::${normalize(seed.title)}`;
  if (state.recommendationBlurbsByPairTitle[reverseTitleKey]) {
    return reverseToForward(state.recommendationBlurbsByPairTitle[reverseTitleKey], seed.title, candidate.title);
  }

  return null;
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
    const metadata = metadataByTitle[curatedFilm.title] || metadataForTitle(curatedFilm.title) || {};
    const tmdb = tmdbByTitle[curatedFilm.title] || tmdbMetadataForTitle(curatedFilm.title) || {};
    const sample = sampleByTitle[normalize(curatedFilm.title)] || {};
    const directRecommendations = unique(
      (curatedFilm.manual_links || [])
        .map((title) => internalTitleToId[normalize(title)])
        .filter(Boolean)
    );
    const themes = mergeLists(sample.themes || [], tmdb.keywords || []);
    const mood = mergeLists(
      curatedFilm.mood || [],
      sample.tone || [],
      deriveMoodSignalsFromText(tmdb.keywords || [], `${metadata.intro || ""} ${tmdb.overview || ""}`)
    );
    const cardTags = mergeLists(curatedFilm.cardTags || [], sample.tags ? sample.tags.slice(0, 3) : []);

    return {
      source: "internal",
      filmId: curatedFilm.film_id,
      title: curatedFilm.title,
      year: curatedFilm.year || metadata.year || tmdb.year || null,
      director: metadata.director || tmdb.director || sample.director || "",
      genres: mergeLists(tmdb.genres || [], sample.genres || []),
      themes,
      mood,
      directRecommendations,
      cardTags,
      tmdbId: tmdb.tmdb_id || null,
      availability: availabilityByFilmId[curatedFilm.film_id] || {},
    };
  });
}

function buildExternalSeedPool(tmdbByTitle, internalFilmByTitleKey) {
  return Object.entries(tmdbByTitle)
    .filter(([title, tmdb]) => tmdb && !internalFilmByTitleKey[normalize(title)])
    .map(([title, tmdb]) => ({
      source: "tmdb-external",
      title,
      year: tmdb.year || null,
      director: tmdb.director || "",
      genres: unique(tmdb.genres || []),
      themes: unique(tmdb.keywords || []),
      mood: deriveMoodSignalsFromText(tmdb.keywords || [], tmdb.overview || ""),
      tmdbId: tmdb.tmdb_id || null,
    }))
    .filter((seed) => seed.title && (seed.themes.length || seed.mood.length || seed.director))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function getInternalFilmById(filmId) {
  return state.internalFilmById[filmId] || null;
}

function getSelectedSeedFilms() {
  return state.session.seedFilmIds.map((filmId) => getInternalFilmById(filmId)).filter(Boolean);
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

function formatList(values) {
  if (!values.length) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function buildFallbackExplanation(candidate, scoreData, bestSeed) {
  if (bestSeed) {
    if (scoreData.directSources.length) {
      return `${candidate.title} is one of our direct next-step picks out of ${bestSeed.title}, so it gets the strongest recommendation boost in this pass.`;
    }

    if (scoreData.moodOverlap.length && scoreData.themeOverlap.length) {
      return `${candidate.title} stays close to ${bestSeed.title} through ${formatList(scoreData.moodOverlap)} mood and ${formatList(scoreData.themeOverlap)} thematic overlap.`;
    }

    if (scoreData.moodOverlap.length) {
      return `${candidate.title} keeps some of the same emotional register as ${bestSeed.title}, especially around ${formatList(scoreData.moodOverlap)} moods.`;
    }

    if (scoreData.themeOverlap.length) {
      return `${candidate.title} circles many of the same ideas as ${bestSeed.title}, especially ${formatList(scoreData.themeOverlap)}.`;
    }

    if (scoreData.sameDirector) {
      return `${candidate.title} keeps the same directorial voice as ${bestSeed.title}, but with a lighter score than a hand-authored direct recommendation.`;
    }
  }

  const likedMood = Object.entries(state.userProfile.moodAffinity)
    .filter(([, value]) => value > 1)
    .map(([key]) => key);
  const likedTheme = Object.entries(state.userProfile.themeAffinity)
    .filter(([, value]) => value > 1)
    .map(([key]) => key);

  const moodHit = candidate.mood.find((value) => likedMood.includes(normalize(value)));
  if (moodHit) {
    return `You’ve been saving films with a ${moodHit} pull, so ${candidate.title} rises because it fits that mood memory.`;
  }

  const themeHit = candidate.themes.find((value) => likedTheme.includes(normalize(value)));
  if (themeHit) {
    return `Your recent saves keep leaning toward ${themeHit}, and ${candidate.title} fits that thread.`;
  }

  return `${candidate.title} feels like a strong fit for the taste profile built from your quiz, seed picks, and recent interactions.`;
}

function explanationForCandidate(candidate, scoreData, bestSeed) {
  const blurb = blurbForPair(bestSeed, candidate);
  if (blurb?.blurb) {
    return blurb.blurb;
  }

  return buildFallbackExplanation(candidate, scoreData, bestSeed);
}

function generateRecommendations() {
  const seedFilms = getSelectedSeedFilms();
  const externalSeed = state.session.externalSeed;
  const seedProfile = buildSeedProfile({
    questionnaireAnswers: state.session.answers,
    seedFilms,
    externalSeed,
    userProfile: state.userProfile,
  });

  const excludedIds = new Set([
    ...seedProfile.explicitSeedFilmIds,
    ...state.userProfile.dislikedFilmIds,
  ]);

  const scored = state.internalFilms
    .filter((film) => !excludedIds.has(film.filmId))
    .map((film) => {
      const scoreData = scoreCandidate(film, seedProfile, state.userProfile);
      const bestSeed = bestSeedForCandidate(film, scoreData, seedFilms, externalSeed);
      return {
        film,
        scoreData,
        bestSeed,
        explanation: explanationForCandidate(film, scoreData, bestSeed),
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

  state.recommendations = picks.slice(0, 8);
  state.session.hasGenerated = true;
  state.session.expandedCardKey = "";
  saveSessionState();
}

function canGenerateRecommendations() {
  return Boolean(
    state.session.seedFilmIds.length ||
      state.session.externalSeed ||
      isQuizComplete() ||
      state.userProfile.savedFilmIds.length ||
      state.userProfile.likedFilmIds.length
  );
}

function regenerateIfActive() {
  if (!state.session.hasGenerated) {
    render();
    return;
  }

  generateRecommendations();
  render();
}

function toggleSeedFilm(filmId) {
  if (state.session.seedFilmIds.includes(filmId)) {
    state.session.seedFilmIds = state.session.seedFilmIds.filter((id) => id !== filmId);
  } else {
    state.session.seedFilmIds = [...state.session.seedFilmIds, filmId].slice(0, 3);
  }

  saveSessionState();
  regenerateIfActive();
}

function setExternalSeed(seed) {
  state.session.externalSeed = seed;
  state.query = seed ? seed.title : "";
  state.externalSearchResults = [];
  if (elements.movieSearch) {
    elements.movieSearch.value = seed ? seed.title : "";
  }
  saveSessionState();
  regenerateIfActive();
}

function clearSessionAndReturnToOnboarding() {
  state.session = {
    answers: {},
    seedFilmIds: [],
    externalSeed: null,
    expandedCardKey: "",
    hasGenerated: false,
  };
  state.query = "";
  state.externalSearchResults = [];
  state.recommendations = [];
  if (elements.movieSearch) {
    elements.movieSearch.value = "";
  }
  saveSessionState();
  render();
}

function handleQuizAnswer(questionId, answerId) {
  state.session.answers[questionId] = answerId;
  saveSessionState();
  regenerateIfActive();
}

function handleFilmInteraction(filmId, actionType) {
  const film = getInternalFilmById(filmId);
  if (!film) {
    return;
  }

  state.userProfile = updateUserProfileFromInteraction({
    filmId,
    actionType,
    filmData: film,
    userProfile: state.userProfile,
  });
  saveUserProfile();
  regenerateIfActive();
}

function removeSavedFilm(filmId) {
  state.userProfile = updateUserProfileFromInteraction({
    filmId,
    actionType: "unsave",
    filmData: getInternalFilmById(filmId),
    userProfile: state.userProfile,
  });
  saveUserProfile();
  render();
}

function searchExternalSeeds(query) {
  const needle = normalize(query);
  if (!needle) {
    return [];
  }

  return state.externalSeedPool
    .filter((seed) => normalize(seed.title).includes(needle))
    .slice(0, 8);
}

function refreshQuickPicks() {
  state.quickPicks = shuffleList(state.internalFilms).slice(0, 12);
}

function renderSelectedSeeds() {
  if (!elements.selectedSeeds) {
    return;
  }

  const selectedSeeds = getSelectedSeedFilms();
  const chips = selectedSeeds.map(
    (film) => `
      <button class="selected-seed-chip" type="button" data-remove-seed="${film.filmId}">
        ${film.title}
      </button>
    `
  );

  if (state.session.externalSeed) {
    chips.push(
      `<button class="selected-seed-chip selected-seed-chip-secondary" type="button" data-clear-external>${state.session.externalSeed.title}</button>`
    );
  }

  elements.selectedSeeds.innerHTML = chips.length
    ? `<div class="selected-seed-list">${chips.join("")}</div>`
    : `<p class="selected-seed-empty">Pick up to three internal seed films, or add one outside film as a temporary taste input.</p>`;

  elements.selectedSeeds.querySelectorAll("[data-remove-seed]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.removeSeed));
  });

  elements.selectedSeeds.querySelector("[data-clear-external]")?.addEventListener("click", () => {
    setExternalSeed(null);
  });
}

function renderSearchResults() {
  if (!elements.searchResults) {
    return;
  }

  if (!state.query) {
    elements.searchResults.innerHTML = "";
    return;
  }

  if (!state.externalSearchResults.length) {
    elements.searchResults.innerHTML = `
      <div class="empty-state search-empty-state">
        <h3>No external seed in the local cache yet</h3>
        <p>Try another title, or use one of the curated starting films below.</p>
      </div>
    `;
    return;
  }

  elements.searchResults.innerHTML = state.externalSearchResults
    .map(
      (seed) => `
        <div class="search-result">
          <div>
            <strong>${seed.title}</strong>
            <div class="match-meta">${[seed.year || "Year unknown", seed.director || "Director unknown"].join(" • ")}</div>
          </div>
          <button type="button" data-external-seed="${encodeURIComponent(seed.title)}">Use as seed</button>
        </div>
      `
    )
    .join("");

  elements.searchResults.querySelectorAll("[data-external-seed]").forEach((button) => {
    button.addEventListener("click", () => {
      const title = decodeURIComponent(button.dataset.externalSeed);
      const seed = state.externalSeedPool.find((item) => normalize(item.title) === normalize(title));
      if (seed) {
        setExternalSeed(seed);
      }
      render();
    });
  });
}

function renderQuickPicks() {
  if (!elements.directorList) {
    return;
  }

  elements.directorList.innerHTML = state.quickPicks
    .map(
      (film) => `
        <button
          class="director-pill ${state.session.seedFilmIds.includes(film.filmId) ? "active" : ""}"
          type="button"
          data-quick-pick="${film.filmId}"
        >
          ${film.title}
        </button>
      `
    )
    .join("");

  elements.directorList.querySelectorAll("[data-quick-pick]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.quickPick));
  });
}

function renderSavedSidebar() {
  if (!elements.discoveryBookmarks) {
    return;
  }

  const savedCount = state.userProfile.savedFilmIds.length;
  elements.discoveryBookmarks.innerHTML = `
    <a class="card-link-button saved-sidebar-button" href="./saved.html">Your saved films</a>
    <p class="saved-sidebar-summary">${savedCount ? `${savedCount} saved so far.` : "Nothing saved yet."}</p>
  `;
}

function providerActionLabel(provider) {
  if (provider.type === "flatrate") {
    return `Stream on ${provider.provider_name}`;
  }
  if (provider.type === "rent") {
    return `Rent on ${provider.provider_name}`;
  }
  return `Buy on ${provider.provider_name}`;
}

function ebayActionLabel(item) {
  const details = [item.price, item.condition].filter(Boolean).join(" • ");
  return details ? `Buy used on eBay • ${details}` : "Buy used on eBay";
}

function renderLink(url, label, filmId, kind, className) {
  return `
    <a
      class="${className || "availability-chip"}"
      href="${url}"
      target="_blank"
      rel="noreferrer"
      data-outbound-film="${filmId}"
      data-outbound-kind="${kind}"
    >
      ${label}
    </a>
  `;
}

function renderAvailabilityPanel(film) {
  const availability = availabilityForFilm(film);
  const streamingProviders = availability?.streaming?.providers || [];
  const watchUrl = availability?.streaming?.watch_url || "";
  const ebayListings = availability?.physical_media?.ebay || [];
  const retailerLinks = normalizedRetailerLinks(film);

  if (!streamingProviders.length && !ebayListings.length && !retailerLinks.length) {
    return "";
  }

  const streamingMarkup = streamingProviders.length
    ? `
        <div class="availability-group">
          <span class="availability-label">Streaming</span>
          <div class="availability-links">
            ${streamingProviders
              .map((provider) => renderLink(watchUrl || makeLetterboxdUrl(film.title), providerActionLabel(provider), film.filmId, "streaming"))
              .join("")}
          </div>
        </div>
      `
    : "";

  const ebayMarkup = ebayListings.length
    ? `
        <div class="availability-group">
          <span class="availability-label">Physical media</span>
          <div class="availability-links">
            ${ebayListings
              .map((item) => renderLink(item.item_url, ebayActionLabel(item), film.filmId, "physical_media", "availability-link-listing"))
              .join("")}
          </div>
        </div>
      `
    : "";

  const retailerMarkup = retailerLinks.length
    ? `
        <div class="availability-group">
          <span class="availability-label">Disc retailers</span>
          <div class="availability-links">
            ${retailerLinks
              .map((item) => renderLink(item.url, `Search ${item.retailer}`, film.filmId, "retailer"))
              .join("")}
          </div>
        </div>
      `
    : "";

  return `
    <div class="expanded-availability">
      ${streamingMarkup}
      ${ebayMarkup}
      ${retailerMarkup}
    </div>
  `;
}

function renderExpandedPanel(film, explanation) {
  const metadata = metadataForTitle(film.title);
  const letterboxdAverage = metadata?.average_rating || "Not available";

  return `
    <div class="card-expanded-panel">
      <div class="expanded-stats">
        <div class="expanded-stat">
          <span class="expanded-stat-label">Average Letterboxd rating</span>
          <strong>${letterboxdAverage}</strong>
        </div>
      </div>
      <div class="expanded-reason">
        <span class="expanded-reason-label">Why we think you’ll like this</span>
        <p class="expanded-reason-copy">${explanation}</p>
      </div>
      ${renderAvailabilityPanel(film)}
      <p class="expanded-copy">${synopsisForTitle(film.title)}</p>
    </div>
  `;
}

function cardKey(section, filmId) {
  return `${section}:${filmId}`;
}

function renderRecommendationCards() {
  return state.recommendations
    .map((item) => {
      const film = item.film;
      const key = cardKey("recommendation", film.filmId);
      const expanded = state.session.expandedCardKey === key;
      const isSaved = state.userProfile.savedFilmIds.includes(film.filmId);
      const isDismissed = state.userProfile.dislikedFilmIds.includes(film.filmId);
      const letterboxdUrl = makeLetterboxdUrl(film.title);

      return `
        <article class="result-card ${expanded ? "result-card-expanded" : ""}">
          <div class="poster-block">
            ${renderPosterMarkup(film.title)}
          </div>
          <div class="card-body">
            <h3 class="card-title">${film.title}</h3>
            <p class="match-meta">${[film.year || "Year unknown", film.director || "Director unknown"].join(" • ")}</p>
            ${
              film.cardTags.length
                ? `<p class="discovery-card__rationale">${film.cardTags.slice(0, 3).join(" • ")}</p>`
                : ""
            }
            ${expanded ? renderExpandedPanel(film, item.explanation) : ""}
            <div class="card-actions">
              <button class="card-link-button discovery-action-button ${isSaved ? "is-active" : ""}" type="button" data-save-film="${film.filmId}">
                ${isSaved ? "Saved" : "Save"}
              </button>
              <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-dismiss-film="${film.filmId}">
                ${isDismissed ? "Not for me" : "Not for me"}
              </button>
              <a class="card-link-button card-link-button-secondary" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
              <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-card="${key}">
                ${expanded ? "See less" : "See more"}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderOnboarding() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations) {
    return;
  }

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Curated taste onboarding";
  elements.resultsGrid.innerHTML = `
    <section class="results-grid-span taste-quiz-shell">
      <div class="taste-quiz-intro">
        <p class="eyebrow">Onboarding</p>
        <h3>Start with your taste, not a catalogue search</h3>
        <p class="results-subtitle">Pick up to three curated films from the left, answer the quick taste questions, or add one outside film as a temporary seed. Recommendations will always stay inside the curated universe.</p>
      </div>
      <div class="taste-quiz-list">
        ${tasteQuizQuestions
          .map((question) => {
            const selectedAnswer = state.session.answers[question.id];
            return `
              <section class="taste-quiz-question">
                <div class="taste-quiz-question__head">
                  <span class="taste-quiz-question__count">${question.id.toUpperCase()}</span>
                  <h4>${question.prompt}</h4>
                </div>
                <div class="taste-quiz-answers">
                  ${question.answers
                    .map(
                      (answer) => `
                        <button
                          class="taste-quiz-answer ${selectedAnswer === answer.id ? "is-selected" : ""}"
                          type="button"
                          data-quiz-answer="${question.id}::${answer.id}"
                        >
                          ${answer.label}
                        </button>
                      `
                    )
                    .join("")}
                </div>
              </section>
            `;
          })
          .join("")}
      </div>
      <div class="taste-quiz-footer">
        <p class="taste-quiz-footer__copy">${state.session.seedFilmIds.length} curated seeds • ${state.session.externalSeed ? "1 outside seed" : "0 outside seeds"} • ${answerCount()} of ${tasteQuizQuestions.length} answers</p>
        <button
          id="taste-quiz-submit"
          class="ghost-button taste-quiz-submit"
          type="button"
          ${canGenerateRecommendations() ? "" : "disabled"}
        >
          Show me films
        </button>
      </div>
    </section>
  `;
  elements.criterionSection.innerHTML = "";

  elements.resultsGrid.querySelectorAll("[data-quiz-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const [questionId, answerId] = button.dataset.quizAnswer.split("::");
      handleQuizAnswer(questionId, answerId);
    });
  });

  elements.resultsGrid.querySelector("#taste-quiz-submit")?.addEventListener("click", () => {
    generateRecommendations();
    render();
  });
}

function renderRecommendations() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations || isSavedPage) {
    return;
  }

  if (!state.session.hasGenerated || !state.recommendations.length) {
    renderOnboarding();
    return;
  }

  elements.clearRecommendations.hidden = false;
  elements.resultsTitle.textContent = "Your next watches";
  elements.resultsGrid.innerHTML = renderRecommendationCards();
  elements.criterionSection.innerHTML = "";

  elements.resultsGrid.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderRecommendations();
    });
  });

  elements.resultsGrid.querySelectorAll("[data-save-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.saveFilm, "save"));
  });

  elements.resultsGrid.querySelectorAll("[data-dismiss-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.dismissFilm, "not_for_me"));
  });

  elements.resultsGrid.querySelectorAll("[data-outbound-film]").forEach((link) => {
    link.addEventListener("click", () => {
      handleFilmInteraction(link.dataset.outboundFilm, "outbound_click");
    });
  });
}

function renderSavedFilmsPage() {
  if (!elements.savedFilmsList) {
    return;
  }

  const savedFilms = state.userProfile.savedFilmIds.map((filmId) => getInternalFilmById(filmId)).filter(Boolean);

  if (state.loading) {
    elements.savedFilmsList.innerHTML = `
      <div class="empty-state">
        <h3>Loading saved films</h3>
        <p>Pulling together your shortlist.</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    elements.savedFilmsList.innerHTML = `
      <div class="empty-state">
        <h3>Couldn't load saved films</h3>
        <p>${state.error}</p>
      </div>
    `;
    return;
  }

  if (!savedFilms.length) {
    elements.savedFilmsList.innerHTML = `
      <div class="empty-state saved-films-empty-state">
        <h3>No saved films yet</h3>
        <p>Save recommendation cards from the discovery page and they will show up here.</p>
        <a class="card-link-button saved-films-empty-state__link" href="./index.html">Back to discovery</a>
      </div>
    `;
    return;
  }

  elements.savedFilmsList.innerHTML = `
    <div class="saved-films-list">
      ${savedFilms
        .map((film) => {
          const key = cardKey("saved", film.filmId);
          const expanded = state.session.expandedCardKey === key;
          return `
            <article class="saved-film-row ${expanded ? "saved-film-row-expanded" : ""}">
              <div class="saved-film-row__summary">
                <div class="saved-film-row__meta">
                  <h2 class="saved-film-row__title">${film.title}</h2>
                  <p class="saved-film-row__subline">${[film.year || "Year unknown", film.director || "Director unknown"].join(" • ")}</p>
                </div>
                <div class="saved-film-row__actions">
                  <button class="card-link-button card-link-button-tertiary saved-film-row__toggle" type="button" data-saved-toggle="${key}">
                    ${expanded ? "See less" : "See more"}
                  </button>
                  <button class="card-link-button saved-film-row__unsave" type="button" data-saved-unsave="${film.filmId}">
                    Remove
                  </button>
                </div>
              </div>
              ${
                expanded
                  ? `
                    <div class="saved-film-row__detail">
                      <div class="poster-block">
                        ${renderPosterMarkup(film.title)}
                      </div>
                      <div class="card-body">
                        <h3 class="card-title">${film.title}</h3>
                        ${renderExpandedPanel(film, "You saved this film as part of your evolving taste profile.")}
                        <div class="card-actions">
                          <a class="card-link-button" href="${makeLetterboxdUrl(film.title)}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
                        </div>
                      </div>
                    </div>
                  `
                  : ""
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  elements.savedFilmsList.querySelectorAll("[data-saved-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.savedToggle;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderSavedFilmsPage();
    });
  });

  elements.savedFilmsList.querySelectorAll("[data-saved-unsave]").forEach((button) => {
    button.addEventListener("click", () => {
      removeSavedFilm(button.dataset.savedUnsave);
      renderSavedFilmsPage();
    });
  });
}

function render() {
  renderSelectedSeeds();
  renderSearchResults();
  renderQuickPicks();
  renderSavedSidebar();

  if (isSavedPage) {
    renderSavedFilmsPage();
    return;
  }

  renderRecommendations();
}

function handleExternalSearchInput(value) {
  state.query = value;
  state.externalSearchResults = searchExternalSeeds(value);
  renderSearchResults();
}

function initRotatingFilmQuotes() {
  const quoteElement = document.getElementById("rotating-film-quote");
  if (!quoteElement) {
    return;
  }

  fetch("./data/film-quotes.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((quotes) => {
      if (!Array.isArray(quotes) || !quotes.length) {
        return;
      }

      let currentIndex = Math.floor(Math.random() * quotes.length);

      function renderQuote(index) {
        const entry = quotes[index] || {};
        const quote = typeof entry === "string" ? entry : entry.quote || "Quote unavailable.";
        const film = typeof entry === "object" ? entry.film || "" : "";
        const credit = typeof entry === "object" ? [entry.director || "", entry.year || ""].filter(Boolean).join(", ") : "";
        quoteElement.innerHTML = `
          <span class="quote-text">${quote}</span>
          ${film ? `<span class="quote-film">${film}</span>` : ""}
          ${credit ? `<span class="quote-credit">${credit}</span>` : ""}
        `;
        quoteElement.classList.add("is-visible");
      }

      renderQuote(currentIndex);
      window.setInterval(() => {
        currentIndex = (currentIndex + 1) % quotes.length;
        renderQuote(currentIndex);
      }, 30000);
    })
    .catch((error) => {
      console.error("Quote load failed:", error);
    });
}

function attachBaseEventHandlers() {
  elements.movieSearch?.addEventListener("input", (event) => {
    handleExternalSearchInput(event.target.value);
  });

  elements.addFirstMatch?.addEventListener("click", () => {
    const firstMatch = state.externalSearchResults[0];
    if (firstMatch) {
      setExternalSeed(firstMatch);
      render();
    }
  });

  elements.resetDirector?.addEventListener("click", () => {
    refreshQuickPicks();
    renderQuickPicks();
  });

  elements.clearRecommendations?.addEventListener("click", () => {
    clearSessionAndReturnToOnboarding();
  });
}

async function loadAppData() {
  try {
    const [curatedResponse, metadataResponse, blurbsResponse, tmdbResponse, availabilityResponse, sampleResponse] =
      await Promise.all([
        fetch("./data/curated-films.json"),
        fetch("./data/film-metadata.json"),
        fetch("./data/recommendation-blurbs.json"),
        fetch("./data/tmdb-metadata.json"),
        fetch("./data/availability.json"),
        fetch("./data/sample-movies.json"),
      ]);

    if (!curatedResponse.ok) {
      throw new Error(`HTTP ${curatedResponse.status}`);
    }

    const curated = await curatedResponse.json();
    state.metadataByTitle = metadataResponse.ok ? await metadataResponse.json() : {};
    const rawBlurbs = blurbsResponse.ok ? await blurbsResponse.json() : {};
    state.tmdbMetadataByTitle = tmdbResponse.ok ? await tmdbResponse.json() : {};
    state.availabilityByFilmId = availabilityResponse.ok ? await availabilityResponse.json() : {};
    const sampleMovies = sampleResponse.ok ? await sampleResponse.json() : [];

    const metadataByTitleKey = buildTitleIndex(
      Object.entries(state.metadataByTitle).map(([title, value]) => ({ title, value })),
      (item) => item.title
    );
    const tmdbByTitleKey = buildTitleIndex(
      Object.entries(state.tmdbMetadataByTitle).map(([title, value]) => ({ title, value })),
      (item) => item.title
    );

    const metadataLookup = Object.entries(metadataByTitleKey).reduce((output, [key, item]) => {
      output[item.title] = item.value;
      return output;
    }, {});
    const tmdbLookup = Object.entries(tmdbByTitleKey).reduce((output, [key, item]) => {
      output[item.title] = item.value;
      return output;
    }, {});

    state.internalFilms = buildInternalFilms(
      curated,
      metadataLookup,
      tmdbLookup,
      sampleMovies,
      state.availabilityByFilmId
    );
    state.internalFilmById = state.internalFilms.reduce((output, film) => {
      output[film.filmId] = film;
      return output;
    }, {});
    state.internalFilmByTitleKey = state.internalFilms.reduce((output, film) => {
      output[normalize(film.title)] = film;
      return output;
    }, {});

    const blurbs = buildBlurbIndices(rawBlurbs, state.internalFilmByTitleKey);
    state.recommendationBlurbsByPairId = blurbs.byId;
    state.recommendationBlurbsByPairTitle = blurbs.byTitle;

    state.externalSeedPool = buildExternalSeedPool(state.tmdbMetadataByTitle, state.internalFilmByTitleKey);
    if (persistedSession.externalSeedTitle) {
      state.session.externalSeed =
        state.externalSeedPool.find((seed) => normalize(seed.title) === normalize(persistedSession.externalSeedTitle)) || null;
    }

    refreshQuickPicks();

    if (state.session.hasGenerated && canGenerateRecommendations()) {
      generateRecommendations();
    }
  } catch (error) {
    console.error(error);
    state.error = "The curated dataset could not be loaded.";
  } finally {
    state.loading = false;
    render();
  }
}

attachBaseEventHandlers();
initRotatingFilmQuotes();
render();
loadAppData();
