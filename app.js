const LEGACY_SAVED_FILMS_STORAGE_KEY = "secondlook:savedFilmIds";
const SESSION_STATE_STORAGE_KEY = "secondlook:sessionState:v2";
const ONBOARDING_DISMISSED_STORAGE_KEY = "secondlook:onboardingDismissed:v1";
const LOCAL_IMPORT_DISMISSED_STORAGE_KEY = "secondlook:localImportDismissed:v1";
const MAX_SEED_COUNT = 3;
const ACCOUNT_DELETE_FUNCTION_NAME = "delete-account";

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

function loadLocalUserProfileForImport() {
  return loadUserProfile();
}

function storageBoolean(key) {
  try {
    return getLocalStorage()?.getItem(key) === "true";
  } catch (error) {
    return false;
  }
}

function setStorageBoolean(key, value) {
  try {
    getLocalStorage()?.setItem(key, value ? "true" : "false");
  } catch (error) {
    console.warn(`Failed to persist ${key}.`, error);
  }
}

function getSupabaseConfig() {
  const config = window.SecondLookConfig || window.SECOND_LOOK_CONFIG || {};
  const supabaseConfig = config.supabase || window.SECOND_LOOK_SUPABASE || {};
  return {
    url: supabaseConfig.url || "",
    anonKey: supabaseConfig.anonKey || supabaseConfig.anon_key || "",
  };
}

function createSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    return null;
  }

  return window.supabase.createClient(config.url, config.anonKey);
}

function baseSessionState() {
  return {
    answers: {},
    seedFilmIds: [],
    externalSeedTitles: [],
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
    externalSeedTitles: Array.isArray(value.externalSeedTitles)
      ? unique(value.externalSeedTitles.map((title) => String(title || "").trim()).filter(Boolean))
      : value.externalSeedTitle
        ? [String(value.externalSeedTitle).trim()]
        : [],
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
        externalSeedTitles: (state.session.externalSeeds || []).map((seed) => seed.title),
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
  metadataByFilmKey: {},
  tmdbMetadataByTitle: {},
  tmdbMetadataByFilmKey: {},
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
  tasteAnchors: [],
  tastePicks: [],
  tasteQuery: "",
  tasteSearchResults: [],
  tasteGenerated: false,
  selectedCinemaShowtimesDate: "",
  selectedCinemaShowtimesCinema: "",
  query: "",
  externalSearchResults: [],
  quickPicks: [],
  recommendations: [],
  resultsMode: "discover",
  userProfile: normalizeUserProfile(createEmptyUserProfile(), []),
  localUserProfileForImport: loadLocalUserProfileForImport(),
  session: {
    answers: persistedSession.answers,
    seedFilmIds: persistedSession.seedFilmIds,
    externalSeeds: [],
    expandedCardKey: persistedSession.expandedCardKey,
    hasGenerated: persistedSession.hasGenerated,
  },
  account: {
    client: createSupabaseClient(),
    configured: false,
    ready: false,
    loading: true,
    user: null,
    profile: null,
    paneOpen: false,
    authDialogOpen: false,
    editDetailsOpen: false,
    onboardingDismissed: storageBoolean(ONBOARDING_DISMISSED_STORAGE_KEY),
    localImportDismissed: storageBoolean(LOCAL_IMPORT_DISMISSED_STORAGE_KEY),
    message: "",
    error: "",
    pendingEmail: "",
    pendingDisplayName: "",
  },
  loading: true,
  error: "",
};

state.account.configured = Boolean(state.account.client);

const elements = {
  movieSearch: document.querySelector("#movie-search"),
  addFirstMatch: document.querySelector("#add-first-match"),
  searchResults: document.querySelector("#search-results"),
  directorList: document.querySelector("#director-list"),
  selectedSeeds: document.querySelector("#selected-seeds"),
  discoveryBookmarks: document.querySelector("#discovery-bookmarks"),
  tasteRefineSection: document.querySelector("#taste-refine-section"),
  resetDirector: document.querySelector("#reset-director"),
  clearRecommendations: document.querySelector("#clear-recommendations"),
  resultsGrid: document.querySelector("#results-grid"),
  browseSummary: document.querySelector("#browse-summary"),
  facetGenres: document.querySelector("#facet-genres"),
  facetEras: document.querySelector("#facet-eras"),
  facetCountries: document.querySelector("#facet-countries"),
  facetColours: document.querySelector("#facet-colours"),
  tasteSearchSection: document.querySelector("#taste-search-section"),
  tasteSearchInput: document.querySelector("#taste-search-input"),
  tasteSearchResults: document.querySelector("#taste-search-results"),
  tastePicks: document.querySelector("#taste-picks"),
  tasteGenerate: document.querySelector("#taste-generate"),
  tasteRecsHead: document.querySelector("#taste-recs-head"),
  tasteRecs: document.querySelector("#taste-recs"),
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
  accountButton: document.querySelector("#account-button"),
  accountOverlay: document.querySelector("#account-overlay"),
  onboardingOverlay: document.querySelector("#onboarding-overlay"),
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

function filmLookupKey(title, year) {
  return `${normalize(title)}::${year || ""}`;
}

function buildFilmValueIndex(records) {
  return Object.values(records || {}).reduce((output, item) => {
    if (!item?.title) {
      return output;
    }
    output[filmLookupKey(item.title, item.year)] = item;
    return output;
  }, {});
}

function metadataForTitle(title) {
  if (state.metadataByTitle[title]) {
    return state.metadataByTitle[title];
  }

  return state.metadataByTitle[Object.keys(state.metadataByTitle).find((key) => normalize(key) === normalize(title))] || null;
}

function metadataForFilm(film) {
  if (!film?.title) {
    return null;
  }

  return state.metadataByFilmKey[filmLookupKey(film.title, film.year)] || metadataForTitle(film.title);
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

function tmdbMetadataForFilm(film) {
  if (!film?.title) {
    return null;
  }

  return state.tmdbMetadataByFilmKey[filmLookupKey(film.title, film.year)] || tmdbMetadataForTitle(film.title);
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

function makeLetterboxdUrl(subject) {
  const film = typeof subject === "string" ? { title: subject } : subject;
  const title = film?.title || "";
  if (film?.letterboxdUrl) {
    return film.letterboxdUrl;
  }
  const metadata = typeof subject === "string" ? metadataForTitle(title) : metadataForFilm(film);
  if (metadata?.letterboxd_url) {
    return metadata.letterboxd_url;
  }

  return `https://letterboxd.com/film/${makeLetterboxdSlug(title)}/`;
}

function makePosterUrl(subject) {
  const film = typeof subject === "string" ? { title: subject } : subject;
  const title = film?.title || "";
  const metadata = typeof subject === "string" ? metadataForTitle(title) : metadataForFilm(film);
  if (metadata?.poster_url) {
    return metadata.poster_url;
  }

  const tmdb = typeof subject === "string" ? tmdbMetadataForTitle(title) : tmdbMetadataForFilm(film);
  if (tmdb?.poster_path) {
    return `https://image.tmdb.org/t/p/w342${tmdb.poster_path}`;
  }

  return "";
}

function renderPosterMarkup(subject) {
  const film = typeof subject === "string" ? { title: subject } : subject;
  const title = film?.title || "";
  const posterUrl = makePosterUrl(film);
  if (posterUrl) {
    return `<img class="poster-image" src="${posterUrl}" alt="Poster for ${escapeHtml(title)}" loading="lazy" />`;
  }

  // No poster: a dark typographic card — intentional accent pieces in the grid.
  const director = film?.director || "";
  return `<div class="poster-monogram poster-fallback">
    <span class="poster-fallback__title">${escapeHtml(title)}</span>
    ${director ? `<span class="poster-fallback__director">${escapeHtml(director)}</span>` : ""}
  </div>`;
}

function synopsisForTitle(subject) {
  const film = typeof subject === "string" ? { title: subject } : subject;
  const title = film?.title || "";
  const metadata = typeof subject === "string" ? metadataForTitle(title) : metadataForFilm(film);
  if (metadata?.intro) {
    return metadata.intro;
  }

  const tmdb = typeof subject === "string" ? tmdbMetadataForTitle(title) : tmdbMetadataForFilm(film);
  if (tmdb?.overview) {
    return tmdb.overview;
  }

  return "No extended synopsis available yet.";
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

function buildInternalFilms(curated, sampleMovies, availabilityByFilmId) {
  const internalTitleToId = curated.reduce((output, film) => {
    output[normalize(film.title)] = film.film_id;
    return output;
  }, {});

  const sampleByTitle = buildTitleIndex(sampleMovies, (film) => film.title);

  return curated.map((curatedFilm) => {
    const metadata = metadataForFilm(curatedFilm) || {};
    const tmdb = tmdbMetadataForFilm(curatedFilm) || {};
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
    // Country facet uses the hand-curated primary country as the source of truth.
    // TMDB emits ISO codes (US/GB) that would splinter into duplicate chips
    // (USA vs US) after an enrichment refresh, so it is intentionally excluded here.
    const countries = unique([curatedFilm.country, ...(sample.countries || [])].filter(Boolean));
    const platforms = platformsFromAvailability(availability);
    const formats = deriveFormats(sample, tmdb);

    return {
      source: "internal",
      filmId: curatedFilm.film_id,
      title: curatedFilm.title,
      year: curatedFilm.year || metadata.year || tmdb.year || null,
      letterboxdUrl: curatedFilm.letterboxd_url || metadata.letterboxd_url || "",
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

function buildExternalSeedPool(tmdbByTitle, internalFilms) {
  const internalFilmKeys = new Set(
    (internalFilms || []).map((film) => filmLookupKey(film.title, film.year))
  );
  return Object.entries(tmdbByTitle)
    .filter(
      ([title, tmdb]) =>
        tmdb &&
        !internalFilmKeys.has(filmLookupKey(title, tmdb.year))
    )
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

function getSelectedExternalSeeds() {
  return Array.isArray(state.session.externalSeeds) ? state.session.externalSeeds.filter(Boolean) : [];
}

function totalSelectedSeedCount() {
  return getSelectedSeedFilms().length + getSelectedExternalSeeds().length;
}

function bestSeedForCandidate(candidate, scoreData, seedFilms, externalSeeds) {
  if (scoreData.directSources.length) {
    const title = scoreData.directSources[0];
    return seedFilms.find((film) => normalize(film.title) === normalize(title)) || null;
  }

  const allSeeds = [...seedFilms];
  if (Array.isArray(externalSeeds) && externalSeeds.length) {
    allSeeds.push(...externalSeeds);
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

function isSignedIn() {
  return Boolean(state.account.user);
}

function accountDisplayName() {
  const profileName = state.account.profile?.display_name || "";
  const userEmail = state.account.user?.email || "";
  return profileName || userEmail.split("@")[0] || "Account";
}

function localImportFilmIds() {
  return unique([
    ...normalizeUserProfile(state.localUserProfileForImport, []).savedFilmIds,
    ...loadLegacySavedFilmIds(),
  ]);
}

function hasLocalImportAvailable() {
  if (!isSignedIn() || state.account.localImportDismissed) {
    return false;
  }

  return localImportFilmIds().some((filmId) => !state.userProfile.savedFilmIds.includes(filmId));
}

function promptForAuth(message) {
  state.account.authDialogOpen = true;
  state.account.paneOpen = false;
  state.account.editDetailsOpen = false;
  state.account.message = message || "Sign up or log in to save films and shape your recommendations.";
  state.account.error = "";
  renderAccountSurfaces();
}

function requireSignedIn(message) {
  if (isSignedIn()) {
    return true;
  }

  promptForAuth(message);
  return false;
}

function profileForPersistence() {
  return normalizeUserProfile(state.userProfile, []);
}

function profileToDatabasePayload(userProfile) {
  const normalizedProfile = normalizeUserProfile(userProfile, []);
  return {
    liked_film_ids: normalizedProfile.likedFilmIds,
    disliked_film_ids: normalizedProfile.dislikedFilmIds,
    mood_affinity: normalizedProfile.moodAffinity,
    theme_affinity: normalizedProfile.themeAffinity,
    director_affinity: normalizedProfile.directorAffinity,
  };
}

function databasePayloadToProfile(payload, savedFilmIds) {
  return normalizeUserProfile(
    {
      likedFilmIds: payload?.liked_film_ids || [],
      dislikedFilmIds: payload?.disliked_film_ids || [],
      savedFilmIds,
      moodAffinity: payload?.mood_affinity || {},
      themeAffinity: payload?.theme_affinity || {},
      directorAffinity: payload?.director_affinity || {},
    },
    []
  );
}

function showAccountMessage(message) {
  state.account.message = message;
  state.account.error = "";
  renderAccountSurfaces();
}

function showAccountError(message) {
  state.account.error = message;
  renderAccountSurfaces();
}

async function fetchRemoteUserProfile() {
  if (!state.account.client || !state.account.user) {
    state.userProfile = normalizeUserProfile(createEmptyUserProfile(), []);
    state.account.profile = null;
    return;
  }

  const user = state.account.user;
  const client = state.account.client;
  const email = user.email || "";

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .upsert({ id: user.id, email }, { onConflict: "id" })
    .select("id,email,display_name")
    .single();

  if (profileError) {
    throw profileError;
  }

  const [{ data: savedRows, error: savedError }, { data: tasteRows, error: tasteError }] = await Promise.all([
    client.from("saved_films").select("film_id").eq("user_id", user.id).order("saved_at", { ascending: false }),
    client.from("taste_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (savedError) {
    throw savedError;
  }
  if (tasteError) {
    throw tasteError;
  }

  state.account.profile = profile || { id: user.id, email, display_name: "" };
  state.account.pendingDisplayName = state.account.profile.display_name || accountDisplayName();
  state.userProfile = databasePayloadToProfile(tasteRows || {}, (savedRows || []).map((row) => row.film_id));
}

async function persistRemoteUserProfile() {
  if (!state.account.client || !state.account.user) {
    return;
  }

  const client = state.account.client;
  const userId = state.account.user.id;
  const userProfile = profileForPersistence();
  const savedFilmIds = new Set(userProfile.savedFilmIds);

  const { data: existingRows, error: fetchError } = await client
    .from("saved_films")
    .select("film_id")
    .eq("user_id", userId);

  if (fetchError) {
    throw fetchError;
  }

  const existingIds = new Set((existingRows || []).map((row) => row.film_id));
  const inserts = [...savedFilmIds]
    .filter((filmId) => !existingIds.has(filmId))
    .map((filmId) => ({ user_id: userId, film_id: filmId }));
  const removals = [...existingIds].filter((filmId) => !savedFilmIds.has(filmId));

  if (inserts.length) {
    const { error } = await client.from("saved_films").upsert(inserts, { onConflict: "user_id,film_id" });
    if (error) {
      throw error;
    }
  }

  if (removals.length) {
    const { error } = await client.from("saved_films").delete().eq("user_id", userId).in("film_id", removals);
    if (error) {
      throw error;
    }
  }

  const { error: tasteError } = await client.from("taste_profiles").upsert({
    user_id: userId,
    ...profileToDatabasePayload(userProfile),
    updated_at: new Date().toISOString(),
  });

  if (tasteError) {
    throw tasteError;
  }
}

async function saveAccountUserProfile() {
  if (!isSignedIn()) {
    return;
  }

  try {
    await persistRemoteUserProfile();
  } catch (error) {
    console.warn("Failed to save account profile.", error);
    showAccountError("We couldn't save that account change. Please try again.");
  }
}

function generateRecommendations() {
  const seedFilms = getSelectedSeedFilms();
  const externalSeeds = getSelectedExternalSeeds();
  const signalFilmIds = new Set(seedFilms.map((film) => film.filmId));
  const profileFilms = unique([...state.userProfile.savedFilmIds, ...state.userProfile.likedFilmIds])
    .filter((filmId) => !signalFilmIds.has(filmId))
    .map((filmId) => getInternalFilmById(filmId))
    .filter(Boolean);
  const dislikedFilms = state.userProfile.dislikedFilmIds.map((filmId) => getInternalFilmById(filmId)).filter(Boolean);
  const seedProfile = buildSeedProfile({
    questionnaireAnswers: state.session.answers,
    seedFilms,
    externalSeeds,
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
      const bestSeed = bestSeedForCandidate(film, scoreData, seedFilms, externalSeeds);
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
      getSelectedExternalSeeds().length ||
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
  if (!requireSignedIn("Log in to search from films you love and build recommendations around your taste.")) {
    return;
  }

  state.resultsMode = "discover";
  if (state.session.seedFilmIds.includes(filmId)) {
    state.session.seedFilmIds = state.session.seedFilmIds.filter((id) => id !== filmId);
  } else if (totalSelectedSeedCount() < MAX_SEED_COUNT) {
    state.session.seedFilmIds = [...state.session.seedFilmIds, filmId];
  }

  saveSessionState();
  regenerateIfActive();
}

function addExternalSeed(seed) {
  if (!requireSignedIn("Log in to search from films you love and build recommendations around your taste.")) {
    return;
  }

  if (!seed) {
    return;
  }

  const existing = getSelectedExternalSeeds();
  if (existing.some((item) => normalize(item.title) === normalize(seed.title))) {
    return;
  }
  if (totalSelectedSeedCount() >= MAX_SEED_COUNT) {
    return;
  }

  state.session.externalSeeds = [...existing, seed];
  state.query = "";
  state.externalSearchResults = [];
  if (elements.movieSearch) {
    elements.movieSearch.value = "";
    elements.movieSearch.focus();
  }
  saveSessionState();
  regenerateIfActive();
}

function removeExternalSeed(title) {
  if (!requireSignedIn("Log in to change your recommendation seeds.")) {
    return;
  }

  state.session.externalSeeds = getSelectedExternalSeeds().filter(
    (seed) => normalize(seed.title) !== normalize(title)
  );
  if (!state.session.externalSeeds.length && !elements.movieSearch?.value) {
    state.query = "";
  }
  saveSessionState();
  regenerateIfActive();
}

function clearSessionAndReturnToSetup() {
  if (!requireSignedIn("Log in to reset and reshape your recommendation session.")) {
    return;
  }

  state.resultsMode = "discover";
  state.session = {
    answers: {},
    seedFilmIds: [],
    externalSeeds: [],
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
  if (!requireSignedIn("Log in to save taste answers and improve your recommendations.")) {
    return;
  }

  state.session.answers[questionId] = answerId;
  saveSessionState();
  regenerateIfActive();
}

async function handleFilmInteraction(filmId, actionType) {
  if (actionType === "outbound_click" && !isSignedIn()) {
    return;
  }

  if (!requireSignedIn("Log in to save films, dismiss misses, and shape your recommendations.")) {
    return;
  }

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
  await saveAccountUserProfile();
  regenerateIfActive();
}

async function removeSavedFilm(filmId) {
  if (!requireSignedIn("Log in to manage your saved films.")) {
    return;
  }

  state.userProfile = updateUserProfileFromInteraction({
    filmId,
    actionType: "unsave",
    filmData: getInternalFilmById(filmId),
    userProfile: state.userProfile,
  });
  await saveAccountUserProfile();
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
  const selectedExternalSeeds = getSelectedExternalSeeds();
  const signedIn = isSignedIn();
  const selectedIds = new Set(selectedSeeds.map((film) => film.filmId));
  const selectedExternalTitles = new Set(selectedExternalSeeds.map((film) => normalize(film.title)));
  const chips = selectedSeeds.map(
    (film) => `
      <button class="selected-seed-chip" type="button" data-remove-seed="${film.filmId}" ${signedIn ? "" : "disabled"}>
        ${film.title}
      </button>
    `
  );

  selectedExternalSeeds.forEach((seed) => {
    chips.push(
      `<button class="selected-seed-chip selected-seed-chip-secondary" type="button" data-remove-external-seed="${encodeURIComponent(seed.title)}" ${signedIn ? "" : "disabled"}>${seed.title}</button>`
    );
  });

  const suggestedChips = state.quickPicks
    .filter((film) => !selectedIds.has(film.filmId))
    .slice(0, totalSelectedSeedCount() ? 3 : 5)
    .map(
      (film) => `
        <button class="selected-seed-chip selected-seed-chip-suggestion" type="button" data-summary-quick-pick="${film.filmId}" ${signedIn ? "" : "disabled"}>
          ${film.title}
        </button>
      `
    );

  elements.selectedSeeds.innerHTML = `
    <div class="selected-seed-list">${[...chips, ...suggestedChips].join("")}</div>
    ${
      chips.length
        ? `<p class="selected-seed-empty">Selected ${chips.length} of ${MAX_SEED_COUNT} seeds. External search only informs taste; recommendations still come from the curated catalogue.</p>`
        : `<p class="selected-seed-empty">${signedIn ? "Choose a suggested film, or search for an external starting point." : "Log in to search, save, or shape recommendations. The page stays browseable until then."}</p>`
    }
  `;

  elements.selectedSeeds.querySelectorAll("[data-remove-seed]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.removeSeed));
  });

  elements.selectedSeeds.querySelectorAll("[data-summary-quick-pick]").forEach((button) => {
    button.addEventListener("click", () => toggleSeedFilm(button.dataset.summaryQuickPick));
  });

  elements.selectedSeeds.querySelectorAll("[data-remove-external-seed]").forEach((button) => {
    button.addEventListener("click", () => {
      removeExternalSeed(decodeURIComponent(button.dataset.removeExternalSeed));
    });
  });

  if (elements.browseSummary) {
    const selectedCount = chips.length;
    const remaining = Math.max(0, MAX_SEED_COUNT - selectedCount);
    elements.browseSummary.textContent = selectedCount
      ? `${selectedCount} seed${selectedCount === 1 ? "" : "s"} selected. You can add ${remaining} more.`
      : signedIn
        ? "Search for up to three films. Those titles are used as taste input only; recommendations stay inside the curated catalogue."
        : "Browse freely, then log in when you want to search, save, or build a personal recommendation profile.";
  }
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
        <h3>No search match yet</h3>
        <p>Try another title, or use one of the suggested starting films below.</p>
      </div>
    `;
    return;
  }

  const selectedExternalTitles = new Set(getSelectedExternalSeeds().map((seed) => normalize(seed.title)));
  const seedsAtCapacity = totalSelectedSeedCount() >= MAX_SEED_COUNT;
  const signedIn = isSignedIn();

  elements.searchResults.innerHTML = state.externalSearchResults
    .map(
      (seed) => `
        <div class="search-result">
          <div>
            <strong>${seed.title}</strong>
            <div class="match-meta">${[seed.year || "Year unknown", seed.director || "Director unknown"].join(" • ")}</div>
          </div>
          <button
            type="button"
            data-external-seed="${encodeURIComponent(seed.title)}"
            ${!signedIn || selectedExternalTitles.has(normalize(seed.title)) || seedsAtCapacity ? "disabled" : ""}
          >
            ${
              !signedIn
                ? "Log in"
                : selectedExternalTitles.has(normalize(seed.title))
                ? "Selected"
                : seedsAtCapacity
                  ? "Max 3 seeds"
                  : "Use film"
            }
          </button>
        </div>
      `
    )
    .join("");

  elements.searchResults.querySelectorAll("[data-external-seed]").forEach((button) => {
    button.addEventListener("click", () => {
      const title = decodeURIComponent(button.dataset.externalSeed);
      const seed = state.externalSeedPool.find((item) => normalize(item.title) === normalize(title));
      if (seed) {
        addExternalSeed(seed);
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
          ${isSignedIn() ? "" : "disabled"}
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
      ${isSignedIn() && savedCount ? `Saved films (${savedCount})` : "Saved films"}
    </button>
    <p class="saved-sidebar-summary">${
      isSignedIn()
        ? savedCount
          ? `${savedCount} saved so far.`
          : "Nothing saved yet."
        : "Log in to save films to your account."
    }</p>
  `;

  elements.discoveryBookmarks.querySelector("[data-open-saved]")?.addEventListener("click", () => {
    if (!requireSignedIn("Log in to see saved films.")) {
      return;
    }
    state.resultsMode = "saved";
    state.session.expandedCardKey = "";
    render();
  });
}

function renderRefinePanelState() {
  const signedIn = isSignedIn();
  if (elements.movieSearch) {
    elements.movieSearch.disabled = !signedIn;
    elements.movieSearch.placeholder = signedIn
      ? "Use a film you love as a starting point…"
      : "Log in to search from films you love…";
  }
  if (elements.resetDirector) {
    elements.resetDirector.disabled = !signedIn;
  }
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
              .map((provider) => renderLink(watchUrl || makeLetterboxdUrl(film), providerActionLabel(provider), film.filmId, "streaming"))
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
  const metadata = metadataForFilm(film);
  const letterboxdAverage = metadata?.average_rating ? String(metadata.average_rating) : "";
  const ratingMarkup = letterboxdAverage
    ? `
      <a class="expanded-stats expanded-stats-link" href="${makeLetterboxdUrl(film.title)}" target="_blank" rel="noreferrer" data-outbound-film="${film.filmId}">
        <div class="expanded-stat">
          <span class="expanded-stat-label">Average Letterboxd rating</span>
          <strong>${letterboxdAverage}</strong>
        </div>
      </a>
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

function londonNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return -1;
  }
  return hour * 60 + minute;
}

function showtimeToMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

// For today's date (Europe/London) drop showtimes that have already passed, and
// remove films left with no upcoming screenings. Future days are returned as-is.
// Non-HH:MM times (e.g. "Time TBC") are always kept.
function filterPastShowtimesForDay(day) {
  const films = Array.isArray(day?.films) ? day.films : [];
  if (!day || day.date !== londonTodayDate()) {
    return films;
  }
  const nowMinutes = londonNowMinutes();
  if (nowMinutes < 0) {
    return films;
  }
  return films
    .map((film) => {
      const showtimes = Array.isArray(film.showtimes) ? film.showtimes : [];
      const upcoming = showtimes.filter((time) => {
        const minutes = showtimeToMinutes(time);
        return minutes === null || minutes >= nowMinutes;
      });
      return { ...film, showtimes: upcoming };
    })
    .filter((film) => (Array.isArray(film.showtimes) ? film.showtimes.length : 0) > 0);
}

function allScreenings() {
  const days = Array.isArray(state.cinemaShowtimes.days) ? state.cinemaShowtimes.days : [];
  const today = londonTodayDate();
  return days.flatMap((day) =>
    day.date >= today
      ? filterPastShowtimesForDay(day).flatMap((film) => {
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

function renderFacetButtons(element, kind, options, selectedValues, availableSet) {
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
      const disabled = !active && availableSet && !availableSet.has(option);
      return `<button type="button" class="browse-facet__chip ${active ? "is-active" : ""}${disabled ? " is-disabled" : ""}" data-facet-kind="${kind}" data-facet-value="${escapeHtml(option)}" aria-pressed="${active ? "true" : "false"}"${disabled ? " disabled" : ""}>${escapeHtml(option)}</button>`;
    })
    .join("");
}

// For each facet, which option values still yield >=1 film given the OTHER
// facets' current selections (OR within a facet, AND across facets). Used to
// grey out dead-end combinations.
function getAvailableFacetOptions() {
  const { genres, eras, countries, colours } = state.browseFilters;
  const films = state.internalFilms.filter(
    (film) => !state.userProfile.dislikedFilmIds.includes(film.filmId)
  );

  const matchesGenre = (film) => !genres.length || genres.some((value) => (film.genres || []).includes(value));
  const matchesEra = (film) => !eras.length || eras.includes(filmDecade(film));
  const matchesCountry = (film) => !countries.length || countries.some((value) => (film.countries || []).includes(value));
  const matchesColour = (film) => !colours.length || colours.includes(filmColour(film));

  const available = { genres: new Set(), eras: new Set(), countries: new Set(), colours: new Set() };
  films.forEach((film) => {
    if (matchesEra(film) && matchesCountry(film) && matchesColour(film)) {
      (film.genres || []).forEach((value) => available.genres.add(value));
    }
    if (matchesGenre(film) && matchesCountry(film) && matchesColour(film)) {
      const decade = filmDecade(film);
      if (decade) available.eras.add(decade);
    }
    if (matchesGenre(film) && matchesEra(film) && matchesColour(film)) {
      (film.countries || []).forEach((value) => available.countries.add(value));
    }
    if (matchesGenre(film) && matchesEra(film) && matchesCountry(film)) {
      available.colours.add(filmColour(film));
    }
  });
  return available;
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

  const available = getAvailableFacetOptions();
  renderFacetButtons(elements.facetGenres, "genres", options.genres, state.browseFilters.genres, available.genres);
  renderFacetButtons(elements.facetEras, "eras", options.eras, state.browseFilters.eras, available.eras);
  renderFacetButtons(elements.facetCountries, "countries", options.countries, state.browseFilters.countries, available.countries);
  renderFacetButtons(elements.facetColours, "colours", options.colours, state.browseFilters.colours, available.colours);

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
            ${
              hasDetail
                ? `<div class="browse-card-links">
              <button class="card-detail-toggle card-detail-toggle--prominent" type="button" data-toggle-card="${key}">${expanded ? "See less" : "See more"}</button>
            </div>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecommendationCards(items) {
  const signedIn = isSignedIn();

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
            ${renderPosterMarkup(film)}
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
                ${signedIn ? (isSaved ? "Saved" : "Save") : "Log in to save"}
              </button>
              <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-dismiss-film="${film.filmId}">
                ${signedIn ? "Not for me" : "Log in"}
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
            <p class="eyebrow">For you</p>
            <h3>Recommended films</h3>
          </div>
        </div>
        <div class="empty-state recommendations-empty-state">
          <p>Save or open a few films and this list will start to shape itself around your taste.</p>
        </div>
      </section>
    `;
    return;
  }

  elements.criterionSection.innerHTML = `
    <section class="discovery-shell">
      <div class="discovery-shell__head">
        <div>
          <p class="eyebrow">For you</p>
          <h3>Recommended films</h3>
        </div>
        <p class="discovery-shell__summary">A short, evolving list drawn from the films you've saved, opened, and passed over.</p>
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

function renderRecommendationSetup() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations) {
    return;
  }

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Start from a film";
  elements.resultsGrid.innerHTML = `
    <section class="results-grid-span recommendation-empty-shell">
      <p class="eyebrow">Recommendations</p>
      <h3>Start with a film you love.</h3>
      <p class="results-subtitle">Use the search panel to pick up to three starting points. The separate taste-input flow is paused while we decide the right UX.</p>
    </section>
  `;
  elements.criterionSection.innerHTML = "";
}

function renderAnonymousPreview() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations || isSavedPage) {
    return;
  }

  const previewFilms = (state.quickPicks.length ? state.quickPicks : state.internalFilms).slice(0, 8);
  const previewItems = previewFilms.map((film) => ({
    film,
    explanation: "A hand-picked Second Look catalogue title to browse before you make an account.",
  }));

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Browse before you join";
  elements.resultsGrid.innerHTML = previewItems.length
    ? renderRecommendationCards(previewItems)
    : `
      <div class="empty-state results-grid-span recommendations-empty-state">
        <h3>Loading the catalogue</h3>
        <p>Curated films will appear here as soon as the dataset is ready.</p>
      </div>
    `;
  elements.criterionSection.innerHTML = "";

  elements.resultsGrid.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      renderAnonymousPreview();
    });
  });

  elements.resultsGrid.querySelectorAll("[data-save-film], [data-dismiss-film]").forEach((button) => {
    button.addEventListener("click", () => {
      promptForAuth("Log in to save films and make Second Look learn what lands for you.");
    });
  });
}

function renderRecommendations() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.clearRecommendations || isSavedPage) {
    return;
  }

  if (!isSignedIn()) {
    renderAnonymousPreview();
    return;
  }

  if (!canGenerateRecommendations()) {
    renderRecommendationSetup();
    return;
  }

  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = state.recommendations.length
    ? "Recommended from your taste"
    : "Recommendations";

  if (!state.recommendations.length) {
    elements.resultsGrid.innerHTML = `
      <div class="empty-state results-grid-span recommendations-empty-state">
        <h3>No recommendations yet</h3>
        <p>Add one to three seed films or answer a few taste questions to generate recommendations.</p>
      </div>
    `;
    elements.criterionSection.innerHTML = "";
    return;
  }

  elements.resultsGrid.innerHTML = renderRecommendationCards(state.recommendations);
  elements.criterionSection.innerHTML = `
    <section class="discovery-shell">
      <div class="discovery-shell__head">
        <div>
          <p class="eyebrow">Why this section exists</p>
          <h3>Recommendations first, actions second</h3>
        </div>
        <p class="discovery-shell__summary">These cards are driven by your seed films, saved titles, dismissals, and taste answers. The cinema calendar remains a separate section below so it can work as a distinct action layer.</p>
      </div>
    </section>
  `;

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
            ${renderPosterMarkup(film)}
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
              <a class="card-link-button card-link-button-secondary" href="${makeLetterboxdUrl(film)}" target="_blank" rel="noreferrer" data-outbound-film="${film.filmId}">
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

  if (!isSignedIn()) {
    elements.savedFilmsList.innerHTML = `
      <div class="empty-state saved-films-empty-state">
        <h3>Log in to see saved films</h3>
        <p>Saved films now live in your account so they can follow you between browsers.</p>
        <button class="card-link-button saved-films-empty-state__link" type="button" data-open-auth>Sign up / log in</button>
      </div>
    `;
    elements.savedFilmsList.querySelector("[data-open-auth]")?.addEventListener("click", () => {
      promptForAuth("Log in to view your saved films.");
    });
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
                        ${renderPosterMarkup(film)}
                      </div>
                      <div class="card-body">
                        <h3 class="card-title">${film.title}</h3>
                        ${renderExpandedPanel(film, "You saved this film as part of your evolving taste profile.")}
                        <div class="card-actions">
                          <a class="card-link-button" href="${makeLetterboxdUrl(film)}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
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
  const films = filterPastShowtimesForDay(day);
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
      return `
        <article class="cinema-week-day ${day.date === selectedDate ? "is-active" : ""}">
          <button class="cinema-week-day__button" type="button" data-cinema-date="${escapeHtml(day.date)}" aria-pressed="${day.date === selectedDate ? "true" : "false"}">
            <span class="cinema-week-day__label">${escapeHtml(formatShowtimesDayLabel(day.date))}</span>
            <span class="cinema-week-day__number">${escapeHtml(formatShowtimesDayNumber(day.date))}</span>
            <span class="cinema-week-day__month">${escapeHtml(formatShowtimesMonthLabel(day.date))}</span>
            <span class="cinema-week-day__count">${filmCount} film${filmCount === 1 ? "" : "s"}</span>
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

// --- Taste search: "films you love" -> recommendations from the collection ---
function tasteDecade(year) {
  const y = Number(year);
  return Number.isFinite(y) && y > 0 ? Math.floor(y / 10) * 10 : null;
}

function bindFilmCardActions(container) {
  if (!container) {
    return;
  }
  container.querySelectorAll("[data-save-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.saveFilm, "save"));
  });
  container.querySelectorAll("[data-dismiss-film]").forEach((button) => {
    button.addEventListener("click", () => handleFilmInteraction(button.dataset.dismissFilm, "not_for_me"));
  });
  container.querySelectorAll("[data-outbound-film]").forEach((link) => {
    link.addEventListener("click", () => handleFilmInteraction(link.dataset.outboundFilm, "outbound_click"));
  });
  container.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleCard;
      state.session.expandedCardKey = state.session.expandedCardKey === key ? "" : key;
      saveSessionState();
      render();
    });
  });
}

let tasteSearchToken = 0;

async function runTasteSearch(rawQuery) {
  state.tasteQuery = rawQuery;
  const query = String(rawQuery || "").trim();
  if (!query) {
    state.tasteSearchResults = [];
    renderTasteSearchResults();
    return;
  }

  const token = ++tasteSearchToken;
  let results = null;

  // Live TMDB search via the serverless proxy (active once TMDB_API_KEY is set).
  try {
    const response = await fetch(`/api/tmdb-search?q=${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.results) && data.results.length) {
        results = data.results.map((item) => ({
          source: "tmdb",
          id: item.id,
          title: item.title,
          year: item.year || null,
          meta: [item.year].filter(Boolean).join(""),
        }));
      }
    }
  } catch (error) {
    /* fall back to the local anchor set below */
  }

  // Fallback: local anchor set (used before a TMDB key is configured, or offline).
  if (!results) {
    const needle = normalize(query);
    results = state.tasteAnchors
      .filter((anchor) => normalize(anchor.title).includes(needle))
      .slice(0, 6)
      .map((anchor) => ({
        source: "anchor",
        title: anchor.title,
        year: anchor.year || null,
        director: anchor.director || "",
        country: anchor.country || "",
        genres: anchor.genres || [],
        keywords: anchor.keywords || [],
        meta: [anchor.year, anchor.director].filter(Boolean).join(" · "),
      }));
  }

  if (token !== tasteSearchToken) {
    return; // a newer keystroke superseded this search
  }
  state.tasteSearchResults = results.filter(
    (result) => !state.tastePicks.some((pick) => normalize(pick.title) === normalize(result.title))
  );
  renderTasteSearchResults();
}

function renderTasteSearchResults() {
  if (!elements.tasteSearchResults) {
    return;
  }
  if (!String(state.tasteQuery || "").trim()) {
    elements.tasteSearchResults.innerHTML = "";
    return;
  }
  const results = state.tasteSearchResults || [];
  if (!results.length) {
    elements.tasteSearchResults.innerHTML = `<p class="taste-search__muted">No matches yet — try another title.</p>`;
    return;
  }
  elements.tasteSearchResults.innerHTML = results
    .map(
      (result, index) => `
      <button class="taste-result" type="button" data-taste-index="${index}">
        <span class="taste-result__title">${escapeHtml(result.title)}</span>
        <span class="taste-result__meta">${escapeHtml(result.meta || "")}</span>
      </button>`
    )
    .join("");

  elements.tasteSearchResults.querySelectorAll("[data-taste-index]").forEach((button) => {
    button.addEventListener("click", () => pickTasteResult(Number(button.dataset.tasteIndex)));
  });
}

async function pickTasteResult(index) {
  const result = (state.tasteSearchResults || [])[index];
  if (!result || state.tastePicks.length >= 3) {
    return;
  }

  let pick;
  if (result.source === "anchor") {
    pick = {
      title: result.title,
      year: result.year,
      director: result.director,
      country: result.country,
      genres: result.genres || [],
      keywords: result.keywords || [],
    };
  } else {
    pick = { title: result.title, year: result.year, director: "", country: "", genres: [], keywords: [] };
    try {
      const response = await fetch(`/api/tmdb-film?id=${encodeURIComponent(result.id)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.film) {
          pick = {
            title: data.film.title || result.title,
            year: data.film.year || result.year,
            director: data.film.director || "",
            country: data.film.country || "",
            genres: data.film.genres || [],
            keywords: data.film.keywords || [],
          };
        }
      }
    } catch (error) {
      /* keep the minimal pick */
    }
  }

  if (state.tastePicks.some((existing) => normalize(existing.title) === normalize(pick.title))) {
    return;
  }
  state.tastePicks.push(pick);
  state.tasteQuery = "";
  state.tasteSearchResults = [];
  if (elements.tasteSearchInput) {
    elements.tasteSearchInput.value = "";
  }
  state.tasteGenerated = false;
  renderTasteSearchResults();
  renderTastePicks();
  renderTasteRecs();
}

function removeTastePick(title) {
  state.tastePicks = state.tastePicks.filter((pick) => normalize(pick.title) !== normalize(title));
  state.tasteGenerated = false;
  renderTastePicks();
  renderTasteRecs();
}

function renderTastePicks() {
  if (!elements.tastePicks) {
    return;
  }
  const chips = state.tastePicks
    .map(
      (pick) => `
      <span class="taste-chip">${escapeHtml(pick.title)}
        <button class="taste-chip__x" type="button" data-taste-remove="${escapeHtml(pick.title)}" aria-label="Remove ${escapeHtml(pick.title)}">×</button>
      </span>`
    )
    .join("");
  const ghost =
    state.tastePicks.length < 3
      ? `<span class="taste-chip taste-chip--ghost">${state.tastePicks.length ? "Add another (optional)" : "Search and add up to 3"}</span>`
      : "";
  elements.tastePicks.innerHTML = chips + ghost;

  elements.tastePicks.querySelectorAll("[data-taste-remove]").forEach((button) => {
    button.addEventListener("click", () => removeTastePick(button.dataset.tasteRemove));
  });

  if (elements.tasteGenerate) {
    elements.tasteGenerate.disabled = state.tastePicks.length === 0;
    elements.tasteGenerate.textContent = state.tastePicks.length === 0 ? "Add a film to begin" : "Show me recommendations";
  }
}

function buildTasteSignal() {
  const signal = { genres: new Set(), keywords: new Set(), countries: new Set(), directors: new Set(), decades: new Set() };
  state.tastePicks.forEach((pick) => {
    (pick.genres || []).forEach((value) => signal.genres.add(value));
    (pick.keywords || []).forEach((value) => signal.keywords.add(value));
    if (pick.country) signal.countries.add(pick.country);
    if (pick.director) signal.directors.add(pick.director);
    const decade = tasteDecade(pick.year);
    if (decade) signal.decades.add(decade);
  });
  return signal;
}

function scoreTasteCandidate(film, signal) {
  const reasons = [];
  let score = 0;
  const sharedGenres = (film.genres || []).filter((value) => signal.genres.has(value));
  if (sharedGenres.length) {
    score += 3 * sharedGenres.length;
    reasons.push(...sharedGenres);
  }
  const sharedKeywords = (film.themes || []).filter((value) => signal.keywords.has(value));
  if (sharedKeywords.length) {
    score += 2 * sharedKeywords.length;
    reasons.push(...sharedKeywords.slice(0, 2));
  }
  const sharedCountry = (film.countries || []).filter((value) => signal.countries.has(value));
  if (sharedCountry.length) {
    score += 4;
    reasons.push(...sharedCountry);
  }
  if (film.director && signal.directors.has(film.director)) {
    score += 8;
    reasons.push(`dir. ${film.director}`);
  }
  const decade = tasteDecade(film.year);
  if (decade && signal.decades.has(decade)) {
    score += 2;
  }
  return { score, reasons: unique(reasons).slice(0, 4) };
}

function renderTasteCard(film, reasons) {
  const isSaved = state.userProfile.savedFilmIds.includes(film.filmId);
  const isDismissed = state.userProfile.dislikedFilmIds.includes(film.filmId);
  const key = cardKey("taste", film.filmId);
  const expanded = state.session.expandedCardKey === key;
  const hasDetail = filmHasExpandableDetail(film);
  const meta = [film.year || "Year unknown", film.director || "Director unknown", ...(film.countries || []).slice(0, 1)]
    .filter(Boolean)
    .join(" • ");

  return `
    <article class="result-card film-card browse-film-card ${expanded ? "result-card-expanded" : ""}">
      <div class="poster-block">${renderPosterMarkup(film)}</div>
      <div class="card-body film-card-body">
        <h3 class="card-title">${escapeHtml(film.title)}</h3>
        <p class="match-meta">${escapeHtml(meta)}</p>
        ${reasons.length ? `<p class="discovery-card__rationale">${escapeHtml(reasons.join(" • "))}</p>` : ""}
        <div class="card-actions film-actions">
          <button class="card-link-button discovery-action-button save-action-button ${isSaved ? "is-active" : ""}" type="button" data-save-film="${film.filmId}">
            ${isSaved ? "Saved" : "Save"}
          </button>
          <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-dismiss-film="${film.filmId}">
            Not for me
          </button>
        </div>
        ${expanded ? renderExpandedPanel(film) : ""}
        ${
          hasDetail
            ? `<div class="browse-card-links">
          <button class="card-detail-toggle card-detail-toggle--prominent" type="button" data-toggle-card="${key}">${expanded ? "See less" : "See more"}</button>
        </div>`
            : ""
        }
      </div>
    </article>`;
}

function renderTasteRecs() {
  if (!elements.tasteRecs) {
    return;
  }
  if (!state.tasteGenerated || !state.tastePicks.length) {
    if (elements.tasteRecsHead) elements.tasteRecsHead.textContent = "";
    elements.tasteRecs.innerHTML = "";
    return;
  }

  const signal = buildTasteSignal();
  const scored = state.internalFilms
    .filter((film) => !state.userProfile.dislikedFilmIds.includes(film.filmId))
    .map((film) => ({ film, ...scoreTasteCandidate(film, signal) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  if (elements.tasteRecsHead) {
    elements.tasteRecsHead.textContent = `From your taste — ${scored.length} pick${scored.length === 1 ? "" : "s"} from our collection`;
  }

  if (!scored.length) {
    elements.tasteRecs.innerHTML = `<p class="taste-search__muted">Nothing matched those signals yet — try another film.</p>`;
    return;
  }

  elements.tasteRecs.innerHTML = scored.map(({ film, reasons }) => renderTasteCard(film, reasons)).join("");
  bindFilmCardActions(elements.tasteRecs);
}

function renderWelcomeOverlay() {
  if (!elements.onboardingOverlay) {
    return;
  }

  const shouldShow = !isSignedIn() && !state.account.onboardingDismissed && !state.account.authDialogOpen;
  elements.onboardingOverlay.hidden = !shouldShow;
  if (!shouldShow) {
    elements.onboardingOverlay.innerHTML = "";
    return;
  }

  elements.onboardingOverlay.innerHTML = `
    <div class="onboarding-backdrop" data-close-onboarding></div>
    <section class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <button class="overlay-close-button" type="button" aria-label="Close onboarding" data-close-onboarding>&times;</button>
      <p class="eyebrow">Second Look</p>
      <h2 id="onboarding-title">Stop watching slop.</h2>
      <p>Start watching better movies based on what you love, and find the best rare, rerelease, and unusual films showing in London's cinemas off the beaten track.</p>
      <div class="onboarding-actions">
        <button class="ghost-button" type="button" data-open-auth>Sign up / log in</button>
        <button class="text-button" type="button" data-close-onboarding>Browse first</button>
      </div>
    </section>
  `;

  elements.onboardingOverlay.querySelectorAll("[data-close-onboarding]").forEach((button) => {
    button.addEventListener("click", () => {
      state.account.onboardingDismissed = true;
      setStorageBoolean(ONBOARDING_DISMISSED_STORAGE_KEY, true);
      renderAccountSurfaces();
    });
  });

  elements.onboardingOverlay.querySelector("[data-open-auth]")?.addEventListener("click", () => {
    state.account.onboardingDismissed = true;
    setStorageBoolean(ONBOARDING_DISMISSED_STORAGE_KEY, true);
    promptForAuth("Enter your email and we'll send a magic link. No password, no 2FA.");
  });
}

function accountNoticeMarkup() {
  if (state.account.error) {
    return `<p class="account-notice account-notice-error">${escapeHtml(state.account.error)}</p>`;
  }
  if (state.account.message) {
    return `<p class="account-notice">${escapeHtml(state.account.message)}</p>`;
  }
  return "";
}

function renderAuthDialog() {
  const configuredMarkup = state.account.configured
    ? `
      <form class="account-form" data-auth-form>
        <label>
          <span>Email</span>
          <input type="email" name="email" autocomplete="email" required value="${escapeHtml(state.account.pendingEmail)}" placeholder="you@example.com" />
        </label>
        <button class="ghost-button" type="submit">Send magic link</button>
      </form>
    `
    : `
      <div class="account-setup-note">
        <h3>Supabase is not configured yet</h3>
        <p>Add your project URL and anon key in <code>config.js</code>, then run the SQL in <code>supabase/schema.sql</code>.</p>
      </div>
    `;

  return `
    <div class="account-modal-backdrop" data-close-account></div>
    <section class="account-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="account-auth-title">
      <button class="overlay-close-button" type="button" aria-label="Close sign in" data-close-account>&times;</button>
      <p class="eyebrow">Account</p>
      <h2 id="account-auth-title">Sign up / log in</h2>
      <p class="account-copy">Second Look uses email magic links, so there is no password to remember and no 2FA in this first web version.</p>
      ${accountNoticeMarkup()}
      ${configuredMarkup}
      <p class="account-privacy-copy">We store only the details needed to run your account and recommendations. <a href="./privacy.html">Read the privacy note</a>.</p>
    </section>
  `;
}

function renderAccountPane() {
  const savedCount = state.userProfile.savedFilmIds.length;
  const importAvailable = hasLocalImportAvailable();
  const editMarkup = state.account.editDetailsOpen
    ? `
      <form class="account-form account-edit-form" data-profile-form>
        <label>
          <span>Display name</span>
          <input type="text" name="displayName" autocomplete="name" value="${escapeHtml(state.account.pendingDisplayName || "")}" />
        </label>
        <button class="ghost-button" type="submit">Save details</button>
      </form>
    `
    : "";
  const importMarkup = importAvailable
    ? `
      <div class="account-import-card">
        <p>You have saved films in this browser. Import them into this account?</p>
        <div class="account-inline-actions">
          <button class="card-link-button" type="button" data-import-local-saves>Import saves</button>
          <button class="text-button" type="button" data-dismiss-local-import>Not now</button>
        </div>
      </div>
    `
    : "";

  return `
    <div class="account-modal-backdrop" data-close-account></div>
    <aside class="account-pane" role="dialog" aria-modal="true" aria-labelledby="account-pane-title">
      <button class="overlay-close-button" type="button" aria-label="Close account menu" data-close-account>&times;</button>
      <div class="account-pane__head">
        <p class="eyebrow">Account</p>
        <h2 id="account-pane-title">${escapeHtml(accountDisplayName())}</h2>
        <p>${escapeHtml(state.account.user?.email || "")}</p>
      </div>
      ${accountNoticeMarkup()}
      ${importMarkup}
      <div class="account-pane__actions">
        <button class="card-link-button" type="button" data-toggle-edit-details>Edit details</button>
        <a class="card-link-button" href="./saved.html">See saved films (${savedCount})</a>
        <button class="card-link-button" type="button" data-export-account>Export my data</button>
        <button class="card-link-button card-link-button-tertiary" type="button" data-sign-out>Log out</button>
        <button class="card-link-button danger-button" type="button" data-delete-account>Delete account</button>
      </div>
      ${editMarkup}
      <p class="account-privacy-copy">No marketing emails or optional analytics are enabled in this version.</p>
    </aside>
  `;
}

function renderAccountSurfaces() {
  if (elements.accountButton) {
    elements.accountButton.textContent = isSignedIn() ? accountDisplayName() : "Sign up / log in";
    elements.accountButton.classList.toggle("is-authenticated", isSignedIn());
    elements.accountButton.disabled = Boolean(state.account.loading);
  }

  renderWelcomeOverlay();

  if (!elements.accountOverlay) {
    return;
  }

  const shouldShow = state.account.authDialogOpen || state.account.paneOpen;
  elements.accountOverlay.hidden = !shouldShow;
  if (!shouldShow) {
    elements.accountOverlay.innerHTML = "";
    return;
  }

  elements.accountOverlay.innerHTML = state.account.authDialogOpen ? renderAuthDialog() : renderAccountPane();
  attachAccountOverlayHandlers();
}

function closeAccountOverlay() {
  state.account.authDialogOpen = false;
  state.account.paneOpen = false;
  state.account.editDetailsOpen = false;
  state.account.message = "";
  state.account.error = "";
  renderAccountSurfaces();
}

function downloadAccountExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      email: state.account.user?.email || "",
      displayName: state.account.profile?.display_name || "",
    },
    savedFilmIds: state.userProfile.savedFilmIds,
    likedFilmIds: state.userProfile.likedFilmIds,
    dislikedFilmIds: state.userProfile.dislikedFilmIds,
    tasteAffinities: {
      mood: state.userProfile.moodAffinity,
      theme: state.userProfile.themeAffinity,
      director: state.userProfile.directorAffinity,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "second-look-account-export.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importLocalSaves() {
  const importIds = localImportFilmIds();
  if (!importIds.length) {
    return;
  }

  state.userProfile = normalizeUserProfile(
    {
      ...state.userProfile,
      savedFilmIds: unique([...importIds, ...state.userProfile.savedFilmIds]),
    },
    []
  );
  await saveAccountUserProfile();
  state.account.localImportDismissed = true;
  setStorageBoolean(LOCAL_IMPORT_DISMISSED_STORAGE_KEY, true);
  showAccountMessage("Saved films imported into this account.");
  regenerateIfActive();
}

async function updateAccountDetails(displayName) {
  if (!state.account.client || !state.account.user) {
    return;
  }

  const nextDisplayName = String(displayName || "").trim();
  const { data, error } = await state.account.client
    .from("profiles")
    .update({ display_name: nextDisplayName, updated_at: new Date().toISOString() })
    .eq("id", state.account.user.id)
    .select("id,email,display_name")
    .single();

  if (error) {
    throw error;
  }

  state.account.profile = data;
  state.account.pendingDisplayName = data.display_name || accountDisplayName();
  state.account.editDetailsOpen = false;
  showAccountMessage("Account details updated.");
}

async function sendMagicLink(email) {
  if (!state.account.client) {
    showAccountError("Supabase is not configured yet.");
    return;
  }

  const normalizedEmail = String(email || "").trim();
  state.account.pendingEmail = normalizedEmail;
  const { error } = await state.account.client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: window.location.href,
    },
  });

  if (error) {
    showAccountError(error.message || "Magic link sign-in failed.");
    return;
  }

  showAccountMessage("Check your email for a magic link.");
}

async function signOut() {
  if (state.account.client) {
    await state.account.client.auth.signOut();
  }
  state.account.user = null;
  state.account.profile = null;
  state.userProfile = normalizeUserProfile(createEmptyUserProfile(), []);
  closeAccountOverlay();
  render();
}

async function deleteAccount() {
  if (!state.account.client || !state.account.user) {
    return;
  }

  const confirmed = window.confirm(
    "Delete your Second Look account and saved films? This cannot be undone."
  );
  if (!confirmed) {
    return;
  }

  const { error } = await state.account.client.functions.invoke(ACCOUNT_DELETE_FUNCTION_NAME);
  if (error) {
    showAccountError(error.message || "Account deletion failed. Please try again.");
    return;
  }

  await signOut();
}

function attachAccountOverlayHandlers() {
  elements.accountOverlay?.querySelectorAll("[data-close-account]").forEach((button) => {
    button.addEventListener("click", closeAccountOverlay);
  });

  elements.accountOverlay?.querySelector("[data-auth-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    sendMagicLink(form.get("email"));
  });

  elements.accountOverlay?.querySelector("[data-toggle-edit-details]")?.addEventListener("click", () => {
    state.account.editDetailsOpen = !state.account.editDetailsOpen;
    state.account.pendingDisplayName = state.account.profile?.display_name || accountDisplayName();
    renderAccountSurfaces();
  });

  elements.accountOverlay?.querySelector("[data-profile-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await updateAccountDetails(form.get("displayName"));
    } catch (error) {
      console.warn("Profile update failed.", error);
      showAccountError("We couldn't update your details. Please try again.");
    }
  });

  elements.accountOverlay?.querySelector("[data-export-account]")?.addEventListener("click", downloadAccountExport);
  elements.accountOverlay?.querySelector("[data-import-local-saves]")?.addEventListener("click", importLocalSaves);
  elements.accountOverlay?.querySelector("[data-dismiss-local-import]")?.addEventListener("click", () => {
    state.account.localImportDismissed = true;
    setStorageBoolean(LOCAL_IMPORT_DISMISSED_STORAGE_KEY, true);
    renderAccountSurfaces();
  });
  elements.accountOverlay?.querySelector("[data-sign-out]")?.addEventListener("click", signOut);
  elements.accountOverlay?.querySelector("[data-delete-account]")?.addEventListener("click", deleteAccount);
}

async function hydrateAccountFromSession(session) {
  state.account.user = session?.user || null;
  state.account.error = "";
  if (!state.account.user) {
    state.account.profile = null;
    state.userProfile = normalizeUserProfile(createEmptyUserProfile(), []);
    state.account.ready = true;
    state.account.loading = false;
    render();
    return;
  }

  try {
    await fetchRemoteUserProfile();
    state.account.ready = true;
    state.account.loading = false;
    if (canGenerateRecommendations()) {
      generateRecommendations();
    }
    render();
    if (hasLocalImportAvailable()) {
      state.account.paneOpen = true;
      state.account.message = "You can import saved films from this browser into your account.";
      renderAccountSurfaces();
    }
  } catch (error) {
    console.warn("Account profile load failed.", error);
    state.account.ready = true;
    state.account.loading = false;
    state.userProfile = normalizeUserProfile(createEmptyUserProfile(), []);
    showAccountError("We couldn't load your account data. Please refresh or try again.");
    render();
  }
}

async function initAccount() {
  if (!state.account.client) {
    state.account.loading = false;
    state.account.ready = true;
    renderAccountSurfaces();
    return;
  }

  const { data, error } = await state.account.client.auth.getSession();
  if (error) {
    console.warn("Supabase session load failed.", error);
    state.account.loading = false;
    state.account.ready = true;
    showAccountError("We couldn't check your account session.");
    return;
  }

  await hydrateAccountFromSession(data.session);

  state.account.client.auth.onAuthStateChange((_event, session) => {
    hydrateAccountFromSession(session);
  });
}

function render() {
  renderSelectedSeeds();
  renderSearchResults();
  renderQuickPicks();
  renderSavedSidebar();
  renderRefinePanelState();
  renderCinemaShowtimes();
  renderTasteSearchResults();
  renderTastePicks();
  renderTasteRecs();
  renderAccountSurfaces();

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
  if (!requireSignedIn("Log in to search from films you love.")) {
    state.query = "";
    state.externalSearchResults = [];
    if (elements.movieSearch) {
      elements.movieSearch.value = "";
    }
    return;
  }

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
  elements.accountButton?.addEventListener("click", () => {
    if (isSignedIn()) {
      state.account.paneOpen = true;
      state.account.authDialogOpen = false;
      state.account.editDetailsOpen = false;
      renderAccountSurfaces();
      return;
    }

    promptForAuth("Enter your email and we'll send a magic link.");
  });

  elements.movieSearch?.addEventListener("input", (event) => {
    handleExternalSearchInput(event.target.value);
  });

  let tasteSearchDebounce;
  elements.tasteSearchInput?.addEventListener("input", (event) => {
    const value = event.target.value;
    state.tasteQuery = value;
    clearTimeout(tasteSearchDebounce);
    tasteSearchDebounce = setTimeout(() => runTasteSearch(value), 250);
  });

  elements.tasteGenerate?.addEventListener("click", () => {
    state.tasteGenerated = true;
    renderTasteRecs();
    elements.tasteRecs?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  elements.addFirstMatch?.addEventListener("click", () => {
    const firstMatch = state.externalSearchResults[0];
    if (firstMatch) {
      addExternalSeed(firstMatch);
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
      if (!chip || chip.disabled) {
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

    clearSessionAndReturnToSetup();
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
    const [curatedResponse, metadataResponse, blurbsResponse, tmdbResponse, availabilityResponse, sampleResponse, anchorsResponse] =
      await Promise.all([
        fetch("./data/curated-films.json"),
        fetch("./data/film-metadata.json"),
        fetch("./data/recommendation-blurbs.json"),
        fetch("./data/tmdb-metadata.json"),
        fetch("./data/availability.json"),
        fetch("./data/sample-movies.json"),
        fetch("./data/taste-anchor-films.json"),
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
    const anchorData = anchorsResponse.ok ? await anchorsResponse.json() : {};
    state.tasteAnchors = Array.isArray(anchorData.films) ? anchorData.films : [];

    state.metadataByFilmKey = buildFilmValueIndex(state.metadataByTitle);
    state.tmdbMetadataByFilmKey = buildFilmValueIndex(state.tmdbMetadataByTitle);

    state.internalFilms = buildInternalFilms(curated, sampleMovies, state.availabilityByFilmId);
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

    state.externalSeedPool = buildExternalSeedPool(state.tmdbMetadataByTitle, state.internalFilms);
    if (persistedSession.externalSeedTitles?.length && elements.movieSearch) {
      state.session.externalSeeds = persistedSession.externalSeedTitles
        .map((title) =>
          state.externalSeedPool.find((seed) => normalize(seed.title) === normalize(title)) || null
        )
        .filter(Boolean)
        .slice(0, MAX_SEED_COUNT);
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
initAccount();
loadAppData();
loadCinemaShowtimes();
