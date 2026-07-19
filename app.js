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
  diversifyRecommendations,
  updateUserProfileFromInteraction,
} = window.SecondLookEngine || {};
const {
  formatList,
  buildBlurbIndices,
  explanationForCandidate: buildEditorialExplanation,
} = window.SecondLookEditorial || {};

if (!window.SecondLookEngine) {
  throw new Error("SecondLookEngine failed to load.");
}

if (!window.SecondLookEditorial) {
  throw new Error("SecondLookEditorial failed to load.");
}

let tasteCardSwapIndex = 0;

function initHeroHeaderImageRotation() {
  const hero = document.querySelector(".hero-copy");
  if (!hero) {
    return;
  }

  const heroImages = [
    "28548_073_Current_medium.jpg",
    "Funeral-Parade-HERO.jpg",
    "MV5BODI3OTY3MTAyNl5BMl5BanBnXkFtZTcwNDQ2MjMzMw@@._V1_.jpg",
    "The_Ascent_2.jpg",
    "Zerkalo_01_1080.png",
    "akira_1280.jpg",
    "header-film-still.jpg",
    "seconds-1200-1200-675-675-crop-000000.jpg",
    "story-of-women-1.jpg",
    "vertigo-fr-1748625916.jpg",
  ];

  const pick = heroImages[Math.floor(Math.random() * heroImages.length)];
  const cacheBust = Date.now();
  hero.style.setProperty("--hero-image", `url("./assets/images/hero/${pick}?v=${cacheBust}")`);
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
  cinemaShowtimes: {
    generatedAt: "",
    days: [],
  },
  browseFilters: {
    genres: [],
    eras: [],
    countries: [],
    colours: [],
  },
  selectedCinemaShowtimesDate: "",
  selectedCinemaShowtimesCinema: "",
  query: "",
  externalSearchResults: [],
  quickPicks: [],
  recommendations: [],
  resultsMode: "discover",
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
  tasteRefineSection: document.querySelector("#taste-refine-section"),
  resetDirector: document.querySelector("#reset-director"),
  resetFilters: document.querySelector("#reset-filters"),
  clearRecommendations: document.querySelector("#clear-recommendations"),
  resultsGrid: document.querySelector("#results-grid"),
  browseSummary: document.querySelector("#browse-summary"),
  facetGenres: document.querySelector("#facet-genres"),
  facetEras: document.querySelector("#facet-eras"),
  facetCountries: document.querySelector("#facet-countries"),
  facetColours: document.querySelector("#facet-colours"),
  criterionSection: document.querySelector("#criterion-section"),
  resultsTitle: document.querySelector("#results-title"),
  savedFilmsList: document.querySelector("#saved-films-list"),
  cinemaShowtimesSection: document.querySelector("#cinema-showtimes-section"),
  cinemaShowtimesTitle: document.querySelector("#cinema-showtimes-title"),
  cinemaShowtimesCalendar: document.querySelector("#cinema-showtimes-calendar"),
  cinemaShowtimesList: document.querySelector("#cinema-showtimes-list"),
  cinemaShowtimesCinemaFilter: document.querySelector("#cinema-showtimes-cinema-filter"),
  cinemaShowtimesIntro: document.querySelector("#cinema-showtimes-intro"),
  cinemaShowtimesUpdated: document.querySelector("#cinema-showtimes-updated"),
  cinemaShowtimesMonth: document.querySelector("#cinema-showtimes-month"),
  cinemaShowtimesToday: document.querySelector("#cinema-showtimes-today"),
  cinemaShowtimesSelection: document.querySelector("#cinema-showtimes-selection"),
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

function parseRatingValue(value) {
  const numeric = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePlatformName(providerName) {
  const value = String(providerName || "").trim();
  const key = normalize(value);

  if (!key) {
    return "";
  }
  if (key.includes("mubi")) {
    return "MUBI";
  }
  if (key.includes("bfi player")) {
    return "BFI Player";
  }
  if (key.includes("amazon prime")) {
    return "Amazon Prime Video";
  }
  if (key.includes("amazon video")) {
    return "Amazon Video";
  }
  if (key.includes("apple tv")) {
    return "Apple TV";
  }
  if (key.includes("netflix")) {
    return "Netflix";
  }
  if (key.includes("curzon")) {
    return "Curzon Home Cinema";
  }
  if (key.includes("now tv")) {
    return "NOW";
  }
  if (key.includes("sky go")) {
    return "Sky Go";
  }
  if (key.includes("sky store")) {
    return "Sky Store";
  }
  if (key.includes("google play")) {
    return "Google Play";
  }
  if (key.includes("rakuten")) {
    return "Rakuten TV";
  }
  if (key.includes("youtube")) {
    return "YouTube";
  }
  if (key.includes("shudder")) {
    return "Shudder";
  }
  if (key.includes("disney plus")) {
    return "Disney+";
  }
  if (key.includes("guidedoc")) {
    return "GuideDoc";
  }
  if (key.includes("paramount")) {
    return "Paramount+";
  }
  if (key.includes("hbo max")) {
    return "HBO Max";
  }

  return value;
}

function platformsFromAvailability(availability) {
  const providers = availability?.streaming?.providers || [];
  return unique(providers.map((provider) => normalizePlatformName(provider.provider_name)).filter(Boolean));
}

function deriveFormats(sample, tmdb) {
  const sampleFormats = Array.isArray(sample?.formats) ? sample.formats : [];
  if (sampleFormats.length) {
    return unique(sampleFormats);
  }

  const keywords = Array.isArray(tmdb?.keywords) ? tmdb.keywords.map((keyword) => normalize(keyword)) : [];
  if (keywords.includes("black and white")) {
    return ["Black & white"];
  }

  return [];
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
      [...(curatedFilm.manual_links || []), ...(sample.manual_links || []), ...(sample.similar_to || [])]
        .map((title) => internalTitleToId[normalize(title)])
        .filter(Boolean)
    );
    const themes = mergeLists(sample.themes || [], tmdb.keywords || []);
    const tone = unique(sample.tone || []);
    const cardTags = mergeLists(curatedFilm.cardTags || [], sample.tags ? sample.tags.slice(0, 3) : []);
    const availability = availabilityByFilmId[curatedFilm.film_id] || {};
    const countries = unique([curatedFilm.country, ...(sample.countries || []), ...(tmdb.countries || [])].filter(Boolean));
    const platforms = platformsFromAvailability(availability);
    const formats = deriveFormats(sample, tmdb);

    return {
      source: "internal",
      filmId: curatedFilm.film_id,
      title: curatedFilm.title,
      year: curatedFilm.year || metadata.year || tmdb.year || null,
      director: metadata.director || tmdb.director || sample.director || "",
      countries,
      formats,
      platforms,
      genres: mergeLists(tmdb.genres || [], sample.genres || []),
      themes,
      tone,
      mood: [],
      bw: Boolean(curatedFilm.bw),
      pace: sample.pace || "",
      directRecommendations,
      cardTags,
      averageRating: parseRatingValue(metadata.average_rating || metadata.review_rating),
      tmdbId: tmdb.tmdb_id || null,
      availability,
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
      countries: [],
      formats: [],
      platforms: [],
      genres: unique(tmdb.genres || []),
      themes: unique(tmdb.keywords || []),
      tone: [],
      mood: [],
      bw: false,
      pace: "",
      averageRating: 0,
      tmdbId: tmdb.tmdb_id || null,
    }))
    .filter((seed) => seed.title && (seed.themes.length || seed.director))
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
    const themeOverlap = (candidate.themes || []).filter((value) => (seed.themes || []).some((seedTheme) => normalize(seedTheme) === normalize(value)));
    const toneOverlap = (candidate.tone || []).filter((value) => (seed.tone || []).some((seedTone) => normalize(seedTone) === normalize(value)));
    const paceMatch =
      candidate.pace && seed.pace && normalize(candidate.pace) === normalize(seed.pace);
    score += themeOverlap.length * 5;
    score += toneOverlap.length * 4;
    score += paceMatch ? 3 : 0;

    if (seed.director && candidate.director && normalize(seed.director) === normalize(candidate.director)) {
      score += 6;
    }

    if (seed.year && candidate.year && Math.abs(seed.year - candidate.year) <= 6) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSeed = seed;
    }
  });

  return bestSeed;
}

function explanationForCandidate(candidate, scoreData, bestSeed) {
  const explanation = buildEditorialExplanation({
    candidate,
    scoreData,
    bestSeed,
    lookups: {
      blurbsByPairId: state.recommendationBlurbsByPairId,
      blurbsByPairTitle: state.recommendationBlurbsByPairTitle,
    },
    userProfile: state.userProfile,
  });

  return explanation.text;
}

function generateRecommendations() {
  const seedFilms = getSelectedSeedFilms();
  const externalSeed = state.session.externalSeed;
  const signalFilmIds = new Set(seedFilms.map((film) => film.filmId));
  const profileFilms = unique([...state.userProfile.savedFilmIds, ...state.userProfile.likedFilmIds])
    .filter((filmId) => !signalFilmIds.has(filmId))
    .map((filmId) => getInternalFilmById(filmId))
    .filter(Boolean);
  const dislikedFilms = state.userProfile.dislikedFilmIds.map((filmId) => getInternalFilmById(filmId)).filter(Boolean);
  const seedProfile = buildSeedProfile({
    questionnaireAnswers: state.session.answers,
    seedFilms,
    externalSeed,
    userProfile: state.userProfile,
    profileFilms,
    dislikedFilms,
  });

  const excludedIds = new Set([
    ...seedProfile.explicitSeedFilmIds,
    ...state.userProfile.savedFilmIds,
    ...state.userProfile.likedFilmIds,
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

  state.recommendations = diversifyRecommendations(scored, 8);
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
  if (!canGenerateRecommendations()) {
    render();
    return;
  }

  generateRecommendations();
  render();
}

function toggleSeedFilm(filmId) {
  state.resultsMode = "discover";
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
  state.resultsMode = "discover";
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
  state.quickPicks = shuffleList(state.internalFilms).slice(0, 8);
}

function renderSelectedSeeds() {
  if (!elements.selectedSeeds) {
    return;
  }

  const selectedSeeds = getSelectedSeedFilms();
  const selectedIds = new Set(selectedSeeds.map((film) => film.filmId));
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

  const suggestedChips = state.quickPicks
    .filter((film) => !selectedIds.has(film.filmId))
    .slice(0, chips.length ? 3 : 5)
    .map(
      (film) => `
        <button class="selected-seed-chip selected-seed-chip-suggestion" type="button" data-summary-quick-pick="${film.filmId}">
          ${film.title}
        </button>
      `
    );

  elements.selectedSeeds.innerHTML = `
    <div class="selected-seed-list">${[...chips, ...suggestedChips].join("")}</div>
    ${
      chips.length
        ? ""
        : `<p class="selected-seed-empty">Choose a suggested film, or pick from the guided set below.</p>`
    }
  `;

  elements.selectedSeeds.querySelectorAll("[data-remove-seed]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.removeSeed));
  });

  elements.selectedSeeds.querySelectorAll("[data-summary-quick-pick]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.summaryQuickPick));
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
        <h3>No external film in the local cache yet</h3>
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
          <button type="button" data-external-seed="${encodeURIComponent(seed.title)}">Use film</button>
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
    <button class="card-link-button saved-sidebar-button ${state.resultsMode === "saved" ? "is-active" : ""}" type="button" data-open-saved>
      ${savedCount ? `Saved films (${savedCount})` : "Saved films"}
    </button>
    <p class="saved-sidebar-summary">${savedCount ? `${savedCount} saved so far.` : "Nothing saved yet."}</p>
  `;

  elements.discoveryBookmarks.querySelector("[data-open-saved]")?.addEventListener("click", () => {
    state.resultsMode = "saved";
    state.session.expandedCardKey = "";
    render();
  });
}

function renderRefinePanelState() {
  // Refine panel is always visible; retain method for render() call sites.
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
  const letterboxdAverage = metadata?.average_rating ? String(metadata.average_rating) : "";
  const ratingMarkup = letterboxdAverage
    ? `
      <div class="expanded-stats">
        <div class="expanded-stat">
          <span class="expanded-stat-label">Average Letterboxd rating</span>
          <strong>${letterboxdAverage}</strong>
        </div>
      </div>
    `
    : "";

  const reasonMarkup = explanation
    ? `
      <div class="expanded-reason">
        <span class="expanded-reason-label">Why we think you’ll like this</span>
        <p class="expanded-reason-copy">${explanation}</p>
      </div>
    `
    : "";

  const synopsis = metadata?.intro || tmdbMetadataForTitle(film.title)?.overview || "";
  const synopsisMarkup = synopsis ? `<p class="expanded-copy">${synopsis}</p>` : "";

  return `
    <div class="card-expanded-panel">
      ${ratingMarkup}
      ${reasonMarkup}
      ${renderAvailabilityPanel(film)}
      ${synopsisMarkup}
    </div>
  `;
}

function filmHasExpandableDetail(film) {
  return Boolean(
    synopsisForTitle(film.title) ||
      renderAvailabilityPanel(film) ||
      metadataForTitle(film.title)?.average_rating
  );
}

function cardKey(section, filmId) {
  return `${section}:${filmId}`;
}

function normalizeScreeningTitle(value) {
  return normalize(
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\+.*$/g, "")
      .replace(/\b(anniversary|restoration|preview|screening)\b/gi, "")
  );
}

function londonTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function allScreenings() {
  const days = Array.isArray(state.cinemaShowtimes.days) ? state.cinemaShowtimes.days : [];
  const today = londonTodayDate();
  return days.flatMap((day) =>
    day.date >= today
      ? (Array.isArray(day.films) ? day.films : []).flatMap((film) => {
          const showtimes = Array.isArray(film.showtimes) && film.showtimes.length ? film.showtimes : [""];
          return showtimes.map((time) => ({
            date: day.date,
            dayLabel: day.label || formatShowtimesDate(day.date),
            title: film.displayTitle || "",
            cinema: film.cinema || "",
            time,
            ticketUrl: film.ticketUrl || "",
          }));
        })
      : []
  );
}

function findScreeningForFilm(film) {
  const filmKey = normalizeScreeningTitle(film?.title);
  if (!filmKey) {
    return null;
  }

  return (
    allScreenings()
      .filter((screening) => normalizeScreeningTitle(screening.title) === filmKey)
      .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))[0] || null
  );
}

function renderScreeningPreview(film) {
  const screening = findScreeningForFilm(film);
  if (!screening) {
    return "";
  }

  const timeLabel = [formatShowtimesDate(screening.date), screening.time].filter(Boolean).join(" • ");
  return `
    <div class="film-screening-preview">
      <p class="screening-kicker">Playing nearby</p>
      <p class="screening-meta">${escapeHtml(screening.cinema)} • ${escapeHtml(timeLabel)}</p>
      ${
        screening.ticketUrl
          ? `<a class="card-link-button screening-book-button" href="${escapeHtml(screening.ticketUrl)}" target="_blank" rel="noreferrer" data-outbound-film="${film.filmId}" data-outbound-kind="screening">Book tickets</a>`
          : ""
      }
    </div>
  `;
}

function renderFacetButtons(element, kind, options, selectedValues) {
  if (!element) {
    return;
  }

  if (!options.length) {
    element.innerHTML = `<p class="browse-facet__empty">None available yet</p>`;
    return;
  }

  element.innerHTML = options
    .map((option) => {
      const active = selectedValues.includes(option);
      return `<button type="button" class="browse-facet__chip ${active ? "is-active" : ""}" data-facet-kind="${kind}" data-facet-value="${escapeHtml(option)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(option)}</button>`;
    })
    .join("");
}

function filmDecade(film) {
  const year = Number(film?.year);
  if (!Number.isFinite(year) || year <= 0) {
    return "";
  }
  return `${Math.floor(year / 10) * 10}s`;
}

function filmColour(film) {
  return film?.bw ? "Black & white" : "Colour";
}

function getBrowseFilterOptions() {
  const genres = new Map();
  const eras = new Set();
  const countries = new Map();
  const colours = new Set();

  state.internalFilms.forEach((film) => {
    (film.genres || []).forEach((genre) => genres.set(normalize(genre), genre));
    const decade = filmDecade(film);
    if (decade) {
      eras.add(decade);
    }
    (film.countries || []).forEach((country) => countries.set(normalize(country), country));
    colours.add(filmColour(film));
  });

  return {
    genres: Array.from(genres.values()).sort((left, right) => left.localeCompare(right)),
    eras: Array.from(eras).sort((left, right) => parseInt(left, 10) - parseInt(right, 10)),
    countries: Array.from(countries.values()).sort((left, right) => left.localeCompare(right)),
    colours: Array.from(colours).sort((left, right) => left.localeCompare(right)),
  };
}

function browseFilterCount() {
  const { genres, eras, countries, colours } = state.browseFilters;
  return genres.length + eras.length + countries.length + colours.length;
}

function getFilteredBrowseFilms() {
  const { genres, eras, countries, colours } = state.browseFilters;

  // Selecting within a facet is OR; across facets is AND.
  return state.internalFilms.filter((film) => {
    if (state.userProfile.dislikedFilmIds.includes(film.filmId)) {
      return false;
    }
    if (genres.length && !genres.some((value) => (film.genres || []).includes(value))) {
      return false;
    }
    if (eras.length && !eras.includes(filmDecade(film))) {
      return false;
    }
    if (countries.length && !countries.some((value) => (film.countries || []).includes(value))) {
      return false;
    }
    if (colours.length && !colours.includes(filmColour(film))) {
      return false;
    }
    return true;
  });
}

function renderBrowseGridCards() {
  if (state.loading) {
    return `
      <div class="empty-state results-grid-span recommendations-empty-state">
        <p>Loading curated picks…</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="empty-state results-grid-span recommendations-empty-state">
        <p>${escapeHtml(state.error)}</p>
      </div>
    `;
  }

  const activeFilterCount = browseFilterCount();
  const options = getBrowseFilterOptions();

  renderFacetButtons(elements.facetGenres, "genres", options.genres, state.browseFilters.genres);
  renderFacetButtons(elements.facetEras, "eras", options.eras, state.browseFilters.eras);
  renderFacetButtons(elements.facetCountries, "countries", options.countries, state.browseFilters.countries);
  renderFacetButtons(elements.facetColours, "colours", options.colours, state.browseFilters.colours);

  if (!activeFilterCount) {
    if (elements.browseSummary) {
      elements.browseSummary.textContent = "Choose a genre, era, country, or colour to begin.";
    }
    return `
      <div class="empty-state results-grid-span recommendations-empty-state browse-empty-state">
        <h3>Explore the collection</h3>
        <p>Pick from genre, era, country, or colour on the left — combine as many as you like — and the films that match will appear here.</p>
      </div>
    `;
  }

  const filteredFilms = getFilteredBrowseFilms()
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title));

  if (elements.browseSummary) {
    elements.browseSummary.textContent = `${filteredFilms.length} film${filteredFilms.length === 1 ? "" : "s"} match your selection. Save or dismiss to shape the recommendation card below.`;
  }

  if (!filteredFilms.length) {
    return `
      <div class="empty-state results-grid-span recommendations-empty-state">
        <p>No films match this combination yet. Try removing a filter to widen the set.</p>
      </div>
    `;
  }

  return filteredFilms
    .map((film) => {
      const isSaved = state.userProfile.savedFilmIds.includes(film.filmId);
      const isDismissed = state.userProfile.dislikedFilmIds.includes(film.filmId);
      const surfaceTags = unique([...(film.platforms || []).slice(0, 2)]);
      const key = cardKey("browse", film.filmId);
      const expanded = state.session.expandedCardKey === key;
      const hasDetail = filmHasExpandableDetail(film);

      return `
        <article class="result-card film-card browse-film-card ${expanded ? "result-card-expanded" : ""}">
          <div class="poster-block">
            ${renderPosterMarkup(film.title)}
          </div>
          <div class="card-body film-card-body">
            <h3 class="card-title">${film.title}</h3>
            <p class="match-meta">${[film.year || "Year unknown", film.director || "Director unknown"].join(" • ")}</p>
            ${
              surfaceTags.length
                ? `<p class="discovery-card__rationale">${surfaceTags.join(" • ")}</p>`
                : ""
            }
            <div class="card-actions film-actions">
              <button class="card-link-button discovery-action-button save-action-button ${isSaved ? "is-active" : ""}" type="button" data-save-film="${film.filmId}">
                ${isSaved ? "Saved" : "Save"}
              </button>
              <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-dismiss-film="${film.filmId}">
                Not for me
              </button>
            </div>
            ${renderScreeningPreview(film)}
            ${expanded ? renderExpandedPanel(film) : ""}
            <div class="browse-card-links">
              ${
                hasDetail
                  ? `<button class="text-button card-detail-toggle" type="button" data-toggle-card="${key}">${expanded ? "See less" : "See more"}</button>`
                  : ""
              }
              <a class="text-button card-detail-toggle" href="${makeLetterboxdUrl(film.title)}" target="_blank" rel="noreferrer" data-outbound-film="${film.filmId}">
                See Letterboxd reviews
              </a>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecommendationCards(items) {
  return (items || state.recommendations)
    .map((item) => {
      const film = item.film;
      const key = cardKey("recommendation", film.filmId);
      const expanded = state.session.expandedCardKey === key;
      const isSaved = state.userProfile.savedFilmIds.includes(film.filmId);
      const isDismissed = state.userProfile.dislikedFilmIds.includes(film.filmId);

      return `
        <article class="result-card film-card ${expanded ? "result-card-expanded" : ""}">
          <div class="poster-block">
            ${renderPosterMarkup(film.title)}
          </div>
          <div class="card-body film-card-body">
            <h3 class="card-title">${film.title}</h3>
            <p class="match-meta">${[film.year || "Year unknown", film.director || "Director unknown"].join(" • ")}</p>
            ${
              film.cardTags.length
                ? `<p class="discovery-card__rationale">${film.cardTags.slice(0, 3).join(" • ")}</p>`
                : ""
            }
            <div class="card-actions film-actions">
              <button class="card-link-button discovery-action-button save-action-button ${isSaved ? "is-active" : ""}" type="button" data-save-film="${film.filmId}">
                ${isSaved ? "Saved" : "Save"}
              </button>
              <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-dismiss-film="${film.filmId}">
                ${isDismissed ? "Not for me" : "Not for me"}
              </button>
            </div>
            ${renderScreeningPreview(film)}
            ${expanded ? renderExpandedPanel(film, item.explanation) : ""}
            <button class="text-button card-detail-toggle" type="button" data-toggle-card="${key}">
              ${expanded ? "See less" : "See more"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAlgorithmRecommendationCard() {
  if (!elements.criterionSection) {
    return;
  }

  if (state.loading) {
    elements.criterionSection.innerHTML = "";
    return;
  }

  const recommendations = state.recommendations.slice(0, 4);
  if (!recommendations.length) {
    elements.criterionSection.innerHTML = `
      <section class="discovery-shell">
        <div class="discovery-shell__head">
          <div>
            <p class="eyebrow">Recommended films</p>
            <h3>Recommended by your profile</h3>
          </div>
        </div>
        <div class="empty-state recommendations-empty-state">
          <p>Save, dismiss, or open films from the curated grid above and this section will start adapting to your taste profile.</p>
        </div>
      </section>
    `;
    return;
  }

  elements.criterionSection.innerHTML = `
    <section class="discovery-shell">
      <div class="discovery-shell__head">
        <div>
          <p class="eyebrow">Recommended films</p>
          <h3>Recommended by your profile</h3>
        </div>
        <p class="discovery-shell__summary">These are shaped by your saved films, dismissals, outbound clicks, and any onboarding taste signals still in session.</p>
      </div>
      <div class="discovery-grid-cards recommendation-stack">
        ${renderRecommendationCards(recommendations)}
      </div>
    </section>
  `;
}

function setTasteCardSwapActive(cards, activeIndex) {
  const total = cards.length;
  if (!total) {
    return;
  }

  cards.forEach((card, cardIndex) => {
    const offset = (cardIndex - activeIndex + total) % total;
    card.classList.toggle("is-active", offset === 0);
    card.classList.toggle("is-next", offset === 1);
    card.classList.toggle("is-third", offset === 2);
    card.classList.toggle("is-hidden", offset > 2);
    card.setAttribute("aria-hidden", offset === 0 ? "false" : "true");

    card.querySelectorAll("button").forEach((button) => {
      button.tabIndex = offset === 0 ? 0 : -1;
    });
  });
}

function initTasteCardSwap() {
  const swapRoot = elements.resultsGrid?.querySelector("[data-taste-card-swap]");
  if (!swapRoot) {
    return;
  }

  const cards = Array.from(swapRoot.querySelectorAll("[data-swap-card]"));
  if (!cards.length) {
    return;
  }

  tasteCardSwapIndex %= cards.length;
  const applyActiveCard = () => setTasteCardSwapActive(cards, tasteCardSwapIndex);
  const advanceCard = () => {
    tasteCardSwapIndex = (tasteCardSwapIndex + 1) % cards.length;
    applyActiveCard();
  };

  applyActiveCard();

  swapRoot.querySelector("[data-swap-next]")?.addEventListener("click", advanceCard);
}

function renderOnboarding() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations) {
    return;
  }

  const unansweredQuestions = tasteQuizQuestions.filter((question) => !state.session.answers[question.id]);

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Curated taste onboarding";
  elements.resultsGrid.innerHTML = `
    <section class="results-grid-span taste-quiz-shell">
      <div class="taste-quiz-intro">
        <p class="eyebrow">Onboarding</p>
        <h3>Start with your taste, not a catalogue search</h3>
        <p class="results-subtitle">Pick up to three curated films from the left and answer the quick taste questions. Recommendations will always stay within our curated picks.</p>
      </div>
      <div class="taste-card-swap-layout">
        <div class="taste-card-swap-copy">
          <p class="eyebrow">Card stack</p>
          <h4>Answer one card at a time.</h4>
          <p>Pick an option and that card leaves the deck. Use next card if you want to answer them in a different order.</p>
        </div>
        <div class="taste-card-swap" data-taste-card-swap>
          <div class="taste-card-swap-stage">
            ${
              unansweredQuestions.length
                ? unansweredQuestions
                    .map((question) => {
                      return `
                        <section class="taste-quiz-question taste-swap-card" data-swap-card>
                          <div class="taste-quiz-question__head">
                            <span class="taste-quiz-question__count">${question.id.toUpperCase()}</span>
                            <h4>${question.prompt}</h4>
                          </div>
                          <div class="taste-quiz-answers">
                            ${question.answers
                              .map(
                                (answer) => `
                                  <button
                                    class="taste-quiz-answer"
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
                    .join("")
                : `
                  <section class="taste-quiz-question taste-swap-card is-active taste-swap-card-complete">
                    <div class="taste-quiz-question__head">
                      <span class="taste-quiz-question__count">DONE</span>
                      <h4>Your taste cards are complete.</h4>
                    </div>
                    <p class="taste-card-swap-note">You can generate recommendations now, or add curated films from the list first.</p>
                  </section>
                `
            }
          </div>
          ${
            unansweredQuestions.length > 1
              ? `
                <div class="taste-card-swap-controls">
                  <button class="card-link-button" type="button" data-swap-next>Next card</button>
                </div>
              `
              : ""
          }
        </div>
      </div>
      <div class="taste-quiz-footer">
        <p class="taste-quiz-footer__copy">${state.session.seedFilmIds.length} curated films • ${answerCount()} of ${tasteQuizQuestions.length} answers</p>
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
      tasteCardSwapIndex = 0;
      handleQuizAnswer(questionId, answerId);
    });
  });

  elements.resultsGrid.querySelector("#taste-quiz-submit")?.addEventListener("click", () => {
    generateRecommendations();
    render();
  });

  initTasteCardSwap();
}

function renderRecommendations() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations || isSavedPage) {
    return;
  }

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Browse curated films";
  elements.resultsGrid.innerHTML = renderBrowseGridCards();
  renderAlgorithmRecommendationCard();

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

  elements.resultsGrid.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderRecommendations();
    });
  });

  elements.criterionSection.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderRecommendations();
    });
  });

  elements.criterionSection.querySelectorAll("[data-save-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.saveFilm, "save"));
  });

  elements.criterionSection.querySelectorAll("[data-dismiss-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.dismissFilm, "not_for_me"));
  });

  elements.criterionSection.querySelectorAll("[data-outbound-film]").forEach((link) => {
    link.addEventListener("click", () => {
      handleFilmInteraction(link.dataset.outboundFilm, "outbound_click");
    });
  });
}

function renderSavedResults() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations || isSavedPage) {
    return;
  }

  const savedFilms = state.userProfile.savedFilmIds.map((filmId) => getInternalFilmById(filmId)).filter(Boolean);
  const backLabel =
    state.session.hasGenerated && state.recommendations.length ? "Back to recommendations" : "Back to discovery";

  elements.clearRecommendations.hidden = false;
  elements.clearRecommendations.textContent = backLabel;
  elements.resultsTitle.textContent = "Your saved films";
  elements.criterionSection.innerHTML = "";

  if (!savedFilms.length) {
    elements.resultsGrid.innerHTML = `
      <div class="empty-state results-grid-span saved-results-empty-state">
        <h3>No saved films yet</h3>
        <p>Save films from your recommendation cards and they’ll stay here for later.</p>
      </div>
    `;
    return;
  }

  elements.resultsGrid.innerHTML = savedFilms
    .map((film) => {
      const key = cardKey("saved", film.filmId);
      const expanded = state.session.expandedCardKey === key;
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
            ${expanded ? renderExpandedPanel(film, "You saved this one to revisit when the timing feels right.") : ""}
            <div class="card-actions">
              <button class="card-link-button discovery-action-button is-active" type="button" data-saved-unsave="${film.filmId}">
                Remove
              </button>
              <a class="card-link-button card-link-button-secondary" href="${makeLetterboxdUrl(film.title)}" target="_blank" rel="noreferrer" data-outbound-film="${film.filmId}">
                See Letterboxd reviews
              </a>
              <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-saved-card="${key}">
                ${expanded ? "See less" : "See more"}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  elements.resultsGrid.querySelectorAll("[data-toggle-saved-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleSavedCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderSavedResults();
    });
  });

  elements.resultsGrid.querySelectorAll("[data-saved-unsave]").forEach((button) => {
    button.addEventListener("click", () => {
      removeSavedFilm(button.dataset.savedUnsave);
    });
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatShowtimesDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatShowtimesDayLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
  }).format(date);
}

function formatShowtimesDayNumber(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
  }).format(date);
}

function formatShowtimesMonthLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
  }).format(date);
}

function formatShowtimesMonthHeading(days) {
  if (!Array.isArray(days) || !days.length) {
    return "";
  }

  const first = new Date(`${days[0].date}T12:00:00`);
  const last = new Date(`${days[days.length - 1].date}T12:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return "";
  }

  const firstMonth = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(first);
  const lastMonth = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(last);
  const lastYear = new Intl.DateTimeFormat("en-GB", { year: "numeric" }).format(last);

  if (firstMonth === lastMonth) {
    return `${firstMonth} ${lastYear}`;
  }

  return `${firstMonth} / ${lastMonth} ${lastYear}`;
}

function formatShowtimesUpdated(value) {
  if (!value) {
    return "Showtimes update automatically.";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Showtimes update automatically.";
  }

  return `Updated ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

const CINEMA_LOGO_PATHS = {
  [normalize("BFI Southbank")]: "./assets/images/cinema-logos/BFI Southbank logo.jpg",
  [normalize("Prince Charles Cinema")]: "./assets/images/cinema-logos/Prince Charles Cinema logo.jpg",
  [normalize("The Garden Cinema")]: "./assets/images/cinema-logos/cover_garden_cinema_logo-650x650.jpg",
  [normalize("Garden Cinema")]: "./assets/images/cinema-logos/cover_garden_cinema_logo-650x650.jpg",
  [normalize("Close-Up Cinema")]: "./assets/images/cinema-logos/Close-Up Cinema.jpeg",
  [normalize("Close Up Cinema")]: "./assets/images/cinema-logos/Close-Up Cinema.jpeg",
};

function getCinemaLogoPath(cinemaName) {
  const cinemaKey = normalize(cinemaName || "");
  return CINEMA_LOGO_PATHS[cinemaKey] || "";
}

function getCinemaInitials(cinemaName) {
  const words = cinemaName.trim()
    .split(" ")
    .filter(Boolean)
    .filter((word) => !["the", "cinema"].includes(word.toLowerCase()));

  return (words.slice(0, 3).map((word) => word[0]).join("") || "C").toUpperCase();
}

function getUpcomingShowtimeDays() {
  const sourceDays = Array.isArray(state.cinemaShowtimes.days) ? state.cinemaShowtimes.days : [];
  if (!sourceDays.length) {
    return [];
  }
  const daysByDate = new Map(sourceDays.map((day) => [day.date, day]));
  const startDate = new Date(`${londonTodayDate()}T12:00:00`);

  if (Number.isNaN(startDate.getTime())) {
    return sourceDays.slice(0, 7);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + index);
    const dateKey = formatDateKey(nextDate);
    const existingDay = daysByDate.get(dateKey);
    return (
      existingDay || {
        date: dateKey,
        label: formatShowtimesDate(dateKey),
        films: [],
      }
    );
  });
}

function getSelectedShowtimesDay() {
  const days = getUpcomingShowtimeDays();
  if (!days.length) {
    return null;
  }

  const selectedDate =
    days.some((day) => day.date === state.selectedCinemaShowtimesDate) ? state.selectedCinemaShowtimesDate : days[0].date;
  state.selectedCinemaShowtimesDate = selectedDate;
  return days.find((day) => day.date === selectedDate) || days[0];
}

function getShowtimeFilterOptions(days) {
  const cinemas = new Map();

  days.forEach((day) => {
    (Array.isArray(day.films) ? day.films : []).forEach((film) => {
      const cinema = film.cinema || "";
      if (cinema) {
        cinemas.set(normalize(cinema), cinema);
      }
    });
  });

  return {
    cinemas: Array.from(cinemas.values()).sort((left, right) => left.localeCompare(right)),
  };
}

function renderShowtimeFilterSelect(element, options, selectedValue, allLabel) {
  if (!element) {
    return;
  }

  element.innerHTML = [
    `<option value="">${escapeHtml(allLabel)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`),
  ].join("");
  element.value = selectedValue;
}

function getCalendarFilmsForDay(day) {
  const films = Array.isArray(day?.films) ? day.films : [];
  return films.filter((film) => !state.selectedCinemaShowtimesCinema || film.cinema === state.selectedCinemaShowtimesCinema);
}

function scrollCinemaShowtimesListIntoView() {
  elements.cinemaShowtimesList?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function renderCinemaScreeningCard(screening, compact = false) {
  const cinemaName = screening.cinema || "Cinema TBC";
  const cinemaLogoPath = getCinemaLogoPath(cinemaName);
  const cinemaLogoMarkup = cinemaLogoPath
    ? `<span class="cinema-showtimes-card__logo"><img src="${escapeHtml(cinemaLogoPath)}" alt="${escapeHtml(cinemaName)} logo" loading="lazy" decoding="async"></span>`
    : `<span class="cinema-showtimes-card__logo cinema-showtimes-card__logo-fallback" aria-hidden="true">${escapeHtml(getCinemaInitials(cinemaName))}</span>`;

  return `
    <article class="cinema-showtimes-card ${compact ? "cinema-showtimes-card-compact" : ""}">
      <div class="card-body cinema-showtimes-card__body">
        <div class="cinema-showtimes-card__header">
          ${cinemaLogoMarkup}
          <div class="cinema-showtimes-card__meta">
            <p class="match-meta cinema-showtimes-card__cinema-name">${escapeHtml(cinemaName)}</p>
            <h3 class="card-title">${escapeHtml(screening.title || "Untitled screening")}</h3>
            <p class="cinema-showtimes-card__times">${escapeHtml(
              compact ? `${formatShowtimesDate(screening.date)} • ${screening.time || "Time TBC"}` : screening.time || "Time TBC"
            )}</p>
          </div>
        </div>
        <div class="card-actions cinema-showtimes-card__actions">
          ${
            screening.ticketUrl
              ? `<a class="card-link-button" href="${escapeHtml(screening.ticketUrl)}" target="_blank" rel="noreferrer">Book tickets</a>`
              : `<span class="cinema-showtimes-card__missing-link">Booking link unavailable</span>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderCinemaShowtimes() {
  if (
    !elements.cinemaShowtimesSection ||
    !elements.cinemaShowtimesCalendar ||
    !elements.cinemaShowtimesList ||
    isSavedPage
  ) {
    return;
  }

  if (elements.cinemaShowtimesTitle) {
    elements.cinemaShowtimesTitle.textContent = "Playing in London this week";
  }
  if (elements.cinemaShowtimesIntro) {
    elements.cinemaShowtimesIntro.textContent = "Choose a day in the week view, then browse that day's listings below.";
  }

  const days = getUpcomingShowtimeDays();
  if (!days.length) {
    elements.cinemaShowtimesCalendar.innerHTML = "";
    if (elements.cinemaShowtimesCinemaFilter) {
      elements.cinemaShowtimesCinemaFilter.innerHTML = `<option value="">All cinemas</option>`;
    }
    if (elements.cinemaShowtimesMonth) {
      elements.cinemaShowtimesMonth.textContent = "";
    }
    if (elements.cinemaShowtimesSelection) {
      elements.cinemaShowtimesSelection.textContent = "";
    }
    elements.cinemaShowtimesList.innerHTML = `
      <div class="empty-state cinema-showtimes__empty">
        <h3>No cinema showtimes available yet</h3>
        <p>Run the showtimes builder or check back after the next scheduled update.</p>
      </div>
    `;
    if (elements.cinemaShowtimesUpdated) {
      elements.cinemaShowtimesUpdated.textContent = "Showtimes unavailable.";
    }
    return;
  }

  if (elements.cinemaShowtimesUpdated) {
    elements.cinemaShowtimesUpdated.textContent = formatShowtimesUpdated(state.cinemaShowtimes.generatedAt);
  }
  if (elements.cinemaShowtimesMonth) {
    elements.cinemaShowtimesMonth.textContent = formatShowtimesMonthHeading(days);
  }
  if (elements.cinemaShowtimesToday) {
    const isTodaySelected = state.selectedCinemaShowtimesDate === londonTodayDate();
    elements.cinemaShowtimesToday.classList.toggle("is-active", isTodaySelected);
    elements.cinemaShowtimesToday.setAttribute("aria-pressed", isTodaySelected ? "true" : "false");
  }

  const { cinemas: cinemaOptions } = getShowtimeFilterOptions(days);
  if (!cinemaOptions.includes(state.selectedCinemaShowtimesCinema)) {
    state.selectedCinemaShowtimesCinema = "";
  }
  renderShowtimeFilterSelect(
    elements.cinemaShowtimesCinemaFilter,
    cinemaOptions,
    state.selectedCinemaShowtimesCinema,
    "All cinemas"
  );

  const selectedDay = getSelectedShowtimesDay();
  const selectedDate = selectedDay?.date || days[0].date;
  const selectedDayFilms = getCalendarFilmsForDay(selectedDay);

  elements.cinemaShowtimesCalendar.innerHTML = days
    .map((day) => {
      const films = getCalendarFilmsForDay(day);
      const filmCount = films.length;
      const screeningCount = films.reduce((count, film) => {
        const showtimes = Array.isArray(film.showtimes) ? film.showtimes : [];
        return count + Math.max(showtimes.length, 1);
      }, 0);
      return `
        <article class="cinema-week-day ${day.date === selectedDate ? "is-active" : ""}">
          <button class="cinema-week-day__button" type="button" data-cinema-date="${escapeHtml(day.date)}" aria-pressed="${day.date === selectedDate ? "true" : "false"}">
            <span class="cinema-week-day__label">${escapeHtml(formatShowtimesDayLabel(day.date))}</span>
            <span class="cinema-week-day__number">${escapeHtml(formatShowtimesDayNumber(day.date))}</span>
            <span class="cinema-week-day__month">${escapeHtml(formatShowtimesMonthLabel(day.date))}</span>
            <span class="cinema-week-day__count">${filmCount} film${filmCount === 1 ? "" : "s"}</span>
            <span class="cinema-week-day__summary">${screeningCount} screening${screeningCount === 1 ? "" : "s"}</span>
          </button>
        </article>
      `;
    })
    .join("");

  const filteredFilms = selectedDayFilms;

  if (elements.cinemaShowtimesSelection) {
    elements.cinemaShowtimesSelection.textContent = `${formatShowtimesDate(selectedDate)} · ${filteredFilms.length} film${
      filteredFilms.length === 1 ? "" : "s"
    }`;
  }

  elements.cinemaShowtimesList.innerHTML = filteredFilms.length
    ? filteredFilms
        .map((film) => {
          const showtimes = Array.isArray(film.showtimes) && film.showtimes.length ? film.showtimes : ["Time TBC"];
          return renderCinemaScreeningCard(
            {
              date: selectedDate,
              title: film.displayTitle || "Untitled screening",
              cinema: film.cinema || "Cinema TBC",
              time: showtimes.join(" • "),
              ticketUrl: film.ticketUrl || "",
            },
            false
          );
        })
        .join("")
    : `
      <div class="empty-state cinema-showtimes__empty">
        <h3>No screenings match for ${escapeHtml(formatShowtimesDate(selectedDate))}</h3>
        <p>Try another day or clear one of the filters.</p>
      </div>
    `;

  elements.cinemaShowtimesCalendar.querySelectorAll("[data-cinema-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCinemaShowtimesDate = button.dataset.cinemaDate || "";
      renderCinemaShowtimes();
      scrollCinemaShowtimesListIntoView();
    });
  });
}

function render() {
  renderSelectedSeeds();
  renderSearchResults();
  renderQuickPicks();
  renderSavedSidebar();
  renderRefinePanelState();
  renderCinemaShowtimes();

  if (isSavedPage) {
    renderSavedFilmsPage();
    return;
  }

  if (state.resultsMode === "saved") {
    renderSavedResults();
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
    renderSelectedSeeds();
    renderQuickPicks();
  });

  [elements.facetGenres, elements.facetEras, elements.facetCountries, elements.facetColours].forEach((container) => {
    container?.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-facet-kind]");
      if (!chip) {
        return;
      }
      const kind = chip.dataset.facetKind;
      const value = chip.dataset.facetValue;
      const selected = state.browseFilters[kind];
      if (!Array.isArray(selected)) {
        return;
      }
      const index = selected.indexOf(value);
      if (index === -1) {
        selected.push(value);
      } else {
        selected.splice(index, 1);
      }
      renderRecommendations();
    });
  });

  elements.resetFilters?.addEventListener("click", () => {
    state.browseFilters = {
      genres: [],
      eras: [],
      countries: [],
      colours: [],
    };
    renderRecommendations();
  });

  elements.cinemaShowtimesCinemaFilter?.addEventListener("change", (event) => {
    state.selectedCinemaShowtimesCinema = event.target.value || "";
    renderCinemaShowtimes();
  });

  elements.cinemaShowtimesToday?.addEventListener("click", () => {
    const today = londonTodayDate();
    state.selectedCinemaShowtimesDate = getUpcomingShowtimeDays().some((day) => day.date === today)
      ? today
      : getUpcomingShowtimeDays()[0]?.date || "";
    renderCinemaShowtimes();
    scrollCinemaShowtimesListIntoView();
  });

  elements.clearRecommendations?.addEventListener("click", () => {
    if (state.resultsMode === "saved") {
      state.resultsMode = "discover";
      state.session.expandedCardKey = "";
      render();
      return;
    }

    clearSessionAndReturnToOnboarding();
  });
}

async function loadCinemaShowtimes() {
  try {
    const response = await fetch("./data/cinema-showtimes.json");
    if (!response.ok) {
      console.warn(`Cinema showtimes unavailable (HTTP ${response.status}).`);
      return null;
    }

    const showtimes = await response.json();
    state.cinemaShowtimes = {
      generatedAt: showtimes.generatedAt || "",
      days: Array.isArray(showtimes.days) ? showtimes.days : [],
    };
    state.selectedCinemaShowtimesDate = getUpcomingShowtimeDays()[0]?.date || state.cinemaShowtimes.days[0]?.date || "";
    render();
    return showtimes;
  } catch (error) {
    console.warn("Cinema showtimes unavailable.", error);
    return null;
  }
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
    if (persistedSession.externalSeedTitle && elements.movieSearch) {
      state.session.externalSeed =
        state.externalSeedPool.find((seed) => normalize(seed.title) === normalize(persistedSession.externalSeedTitle)) || null;
    }

    refreshQuickPicks();

    if (canGenerateRecommendations()) {
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
initHeroHeaderImageRotation();
initRotatingFilmQuotes();
render();
loadAppData();
loadCinemaShowtimes();
