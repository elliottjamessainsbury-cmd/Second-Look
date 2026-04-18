const SAVED_FILMS_STORAGE_KEY = "secondlook:savedFilmIds";
const MAIN_PAGE_STATE_STORAGE_KEY = "secondlook:mainPageState";

function getLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function normalizeSavedFilmIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.reduce((output, value) => {
    const filmId = String(value || "").trim();
    if (!filmId || output.includes(filmId)) {
      return output;
    }

    output.push(filmId);
    return output;
  }, []);
}

function loadSavedFilmIds() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return [];
    }

    const raw = storage.getItem(SAVED_FILMS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeSavedFilmIds(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load saved film ids.", error);
    return [];
  }
}

function saveSavedFilmIds(ids) {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    storage.setItem(SAVED_FILMS_STORAGE_KEY, JSON.stringify(normalizeSavedFilmIds(ids)));
  } catch (error) {
    console.warn("Failed to save film ids.", error);
  }
}

function baseTasteProfile() {
  return {
    oldCinemaAffinity: 0,
    worldCinemaAffinity: 0,
    slowCinemaAffinity: 0,
    weirdnessAffinity: 0,
    craftAffinity: 0,
    ambiguityAffinity: 0
  };
}

function normalizeDiscoveryPageState(value) {
  const discovery = value && typeof value === "object" ? value.discovery || {} : {};
  const selectedFilmId =
    value && typeof value === "object" && value.selectedFilmId ? String(value.selectedFilmId) : null;

  return {
    selectedFilmId,
    expandedCardKey:
      value && typeof value === "object" && typeof value.expandedCardKey === "string"
        ? value.expandedCardKey
        : "",
    discovery: {
      step:
        discovery.step === "grid1" || discovery.step === "grid2" || discovery.step === "quiz"
          ? discovery.step
          : "quiz",
      answers: discovery.answers && typeof discovery.answers === "object" ? discovery.answers : {},
      tasteProfile: {
        ...baseTasteProfile(),
        ...(discovery.tasteProfile && typeof discovery.tasteProfile === "object"
          ? discovery.tasteProfile
          : {})
      },
      dismissedIds: normalizeSavedFilmIds(discovery.dismissedIds),
      currentBatch: Array.isArray(discovery.currentBatch) ? discovery.currentBatch : [],
      batchHistory: Array.isArray(discovery.batchHistory) ? discovery.batchHistory : []
    }
  };
}

function loadMainPageState() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return normalizeDiscoveryPageState(null);
    }

    const raw = storage.getItem(MAIN_PAGE_STATE_STORAGE_KEY);
    if (!raw) {
      return normalizeDiscoveryPageState(null);
    }

    return normalizeDiscoveryPageState(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load main page state.", error);
    return normalizeDiscoveryPageState(null);
  }
}

function shouldPersistMainPageState() {
  return Boolean(
    state.selectedFilmId ||
      state.discovery.step !== "quiz" ||
      state.discovery.dismissedIds.length
  );
}

function saveMainPageState() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    if (!shouldPersistMainPageState()) {
      storage.removeItem(MAIN_PAGE_STATE_STORAGE_KEY);
      return;
    }

    storage.setItem(
      MAIN_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        selectedFilmId: state.selectedFilmId,
        expandedCardKey: state.expandedCardKey,
        discovery: {
          step: state.discovery.step,
          answers: state.discovery.answers,
          tasteProfile: state.discovery.tasteProfile,
          dismissedIds: state.discovery.dismissedIds,
          currentBatch: state.discovery.currentBatch,
          batchHistory: state.discovery.batchHistory
        }
      })
    );
  } catch (error) {
    console.warn("Failed to save main page state.", error);
  }
}

const persistedMainPageState = loadMainPageState();

const state = {
  curatedFilms: [],
  curatedSourceFilms: [],
  discoveryFilms: [],
  quickPicks: [],
  metadataByTitle: {},
  recommendationBlurbsByPair: {},
  tmdbMetadataByTitle: {},
  availabilityByFilmId: {},
  sampleMovies: [],
  criterionClosetPicks: [],
  query: "",
  selectedFilmId: persistedMainPageState.selectedFilmId,
  selectedFilm: null,
  expandedCardKey: persistedMainPageState.expandedCardKey,
  recommendations: [],
  discovery: {
    step: persistedMainPageState.discovery.step,
    answers: persistedMainPageState.discovery.answers,
    tasteProfile: persistedMainPageState.discovery.tasteProfile,
    bookmarkedIds: loadSavedFilmIds(),
    dismissedIds: persistedMainPageState.discovery.dismissedIds,
    currentBatch: persistedMainPageState.discovery.currentBatch,
    batchHistory: persistedMainPageState.discovery.batchHistory
  },
  loading: true,
  error: ""
};

const elements = {
  savedFilmsList: document.querySelector("#saved-films-list"),
  movieSearch: document.querySelector("#movie-search"),
  addFirstMatch: document.querySelector("#add-first-match"),
  searchResults: document.querySelector("#search-results"),
  directorList: document.querySelector("#director-list"),
  discoveryBookmarks: document.querySelector("#discovery-bookmarks"),
  resetDirector: document.querySelector("#reset-director"),
  clearRecommendations: document.querySelector("#clear-recommendations"),
  resultsGrid: document.querySelector("#results-grid"),
  criterionSection: document.querySelector("#criterion-section"),
  resultsTitle: document.querySelector("#results-title")
};

const isSavedPage = Boolean(
  typeof document !== "undefined" &&
    document.body &&
    document.body.classList &&
    document.body.classList.contains("saved-page")
);

function shuffleList(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

const tasteQuizQuestions = [
  {
    id: "bw",
    prompt: "Black & white films:",
    answers: [
      { id: "timeless", label: "Timeless" },
      { id: "depends", label: "Depends" },
      { id: "homework", label: "Homework" }
    ]
  },
  {
    id: "subtitles",
    prompt: "Subtitles:",
    answers: [
      { id: "essential", label: "Essential" },
      { id: "fine", label: "Fine if it's worth it" },
      { id: "prefer_not", label: "Prefer not" }
    ]
  },
  {
    id: "slow",
    prompt: "Slow films:",
    answers: [
      { id: "hypnotic", label: "Hypnotic" },
      { id: "depends", label: "Depends" },
      { id: "move_it", label: "Move it along" }
    ]
  },
  {
    id: "weird",
    prompt: "Weirdness:",
    answers: [
      { id: "max", label: "As weird as it gets" },
      { id: "medium", label: "A little strange is good" },
      { id: "grounded", label: "Keep it grounded" }
    ]
  },
  {
    id: "craft_vs_feeling",
    prompt: "What matters more:",
    answers: [
      { id: "craft", label: "How it's made" },
      { id: "feeling", label: "How it makes me feel" }
    ]
  },
  {
    id: "ambiguity",
    prompt: "Ambiguous endings:",
    answers: [
      { id: "love", label: "That's the point" },
      { id: "sometimes", label: "Fine occasionally" },
      { id: "clear", label: "Just tell me what happened" }
    ]
  }
];

function answerLabel(questionId, answerId) {
  const question = tasteQuizQuestions.find((item) => item.id === questionId);
  const answer = question?.answers.find((item) => item.id === answerId);
  return answer?.label || "";
}

async function initRotatingFilmQuotes() {
  const quoteEl = document.getElementById("rotating-film-quote");
  if (!quoteEl) {
    return;
  }

  try {
    const response = await fetch("./data/film-quotes.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const quotes = await response.json();
    if (!Array.isArray(quotes) || quotes.length === 0) {
      quoteEl.textContent = "No quotes available.";
      quoteEl.classList.add("is-visible");
      return;
    }

    let currentIndex = Math.floor(Math.random() * quotes.length);

    function formatQuote(entry) {
      if (typeof entry === "string") {
        return {
          quote: entry,
          filmLine: "",
          creditLine: ""
        };
      }

      if (entry && typeof entry === "object") {
        const quote = String(entry.quote || "").trim();
        const film = String(entry.film || "").trim();
        const director = String(entry.director || "").trim();
        const year = entry.year ? String(entry.year) : "";

        if (quote && film && director) {
          return {
            quote,
            filmLine: film,
            creditLine: year ? `${director}, ${year}` : director
          };
        }

        if (quote && film) {
          return {
            quote,
            filmLine: film,
            creditLine: year || ""
          };
        }

        if (quote) {
          return {
            quote,
            filmLine: "",
            creditLine: ""
          };
        }
      }

      return {
        quote: "Quote unavailable.",
        filmLine: "",
        creditLine: ""
      };
    }

    function showQuote(index) {
      quoteEl.classList.remove("is-visible");

      window.setTimeout(() => {
        const formatted = formatQuote(quotes[index]);
        quoteEl.innerHTML = `
          <span class="quote-text">${formatted.quote}</span>
          ${formatted.filmLine ? `<span class="quote-film">${formatted.filmLine}</span>` : ""}
          ${formatted.creditLine ? `<span class="quote-credit">${formatted.creditLine}</span>` : ""}
        `;
        quoteEl.classList.add("is-visible");
      }, 1200);
    }

    showQuote(currentIndex);

    window.setInterval(() => {
      currentIndex = (currentIndex + 1) % quotes.length;
      showQuote(currentIndex);
    }, 30000);
  } catch (error) {
    console.error("Quote load failed:", error);
    quoteEl.textContent = "Unable to load quote.";
    quoteEl.classList.add("is-visible");
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeUniqueLists(...lists) {
  const merged = new Map();

  lists.flat().forEach((value) => {
    const label = String(value || "").trim();
    const key = normalize(label);
    if (!key || merged.has(key)) {
      return;
    }
    merged.set(key, label);
  });

  return Array.from(merged.values());
}

function createEmptyTasteProfile() {
  return baseTasteProfile();
}

function scoreTasteProfile(answers) {
  const profile = createEmptyTasteProfile();

  switch (answers.bw) {
    case "timeless":
      profile.oldCinemaAffinity += 2;
      break;
    case "depends":
      profile.oldCinemaAffinity += 1;
      break;
    case "homework":
      profile.oldCinemaAffinity -= 1;
      break;
    default:
      break;
  }

  switch (answers.subtitles) {
    case "essential":
      profile.worldCinemaAffinity += 2;
      break;
    case "fine":
      profile.worldCinemaAffinity += 1;
      break;
    case "prefer_not":
      profile.worldCinemaAffinity -= 1;
      break;
    default:
      break;
  }

  switch (answers.slow) {
    case "hypnotic":
      profile.slowCinemaAffinity += 2;
      break;
    case "depends":
      profile.slowCinemaAffinity += 1;
      break;
    case "move_it":
      profile.slowCinemaAffinity -= 1;
      break;
    default:
      break;
  }

  switch (answers.weird) {
    case "max":
      profile.weirdnessAffinity += 2;
      break;
    case "medium":
      profile.weirdnessAffinity += 1;
      break;
    case "grounded":
      profile.weirdnessAffinity -= 1;
      break;
    default:
      break;
  }

  switch (answers.craft_vs_feeling) {
    case "craft":
      profile.craftAffinity += 2;
      break;
    case "feeling":
      profile.craftAffinity -= 1;
      break;
    default:
      break;
  }

  switch (answers.ambiguity) {
    case "love":
      profile.ambiguityAffinity += 2;
      break;
    case "sometimes":
      profile.ambiguityAffinity += 1;
      break;
    case "clear":
      profile.ambiguityAffinity -= 1;
      break;
    default:
      break;
  }

  return profile;
}

function getSearchMatches() {
  if (!state.query) {
    return [];
  }

  const needle = normalize(state.query);
  const curatedMatches = state.curatedFilms
    .filter((film) => normalize(film.title).includes(needle))
    .map((film) => ({
      ...film,
      sourceType: "graph"
    }));

  const seenTitles = new Set(curatedMatches.map((film) => normalize(film.title)));
  const sampleMatches = state.sampleMovies
    .filter((film) => normalize(film.title).includes(needle) && !seenTitles.has(normalize(film.title)))
    .map((film) => ({
      ...film,
      film_id: film.id || titleToId(film.title, film.year),
      elliott_rating: null,
      manual_links: [],
      sourceType: "sample"
    }));

  return [...curatedMatches, ...sampleMatches].slice(0, 8);
}

function metadataForTitle(title) {
  if (state.metadataByTitle[title]) {
    return state.metadataByTitle[title];
  }

  const needle = normalize(title);
  const matchedKey = Object.keys(state.metadataByTitle).find((key) => normalize(key) === needle);
  return matchedKey ? state.metadataByTitle[matchedKey] : null;
}

function tmdbMetadataForTitle(title) {
  if (state.tmdbMetadataByTitle[title]) {
    return state.tmdbMetadataByTitle[title];
  }

  const needle = normalize(title);
  const matchedKey = Object.keys(state.tmdbMetadataByTitle).find((key) => normalize(key) === needle);
  return matchedKey ? state.tmdbMetadataByTitle[matchedKey] : null;
}

function recommendationBlurbForPair(sourceTitle, recommendedTitle) {
  function findPairEntry(leftTitle, rightTitle) {
    const key = `${leftTitle}::${rightTitle}`;
    if (state.recommendationBlurbsByPair[key]) {
      return state.recommendationBlurbsByPair[key];
    }

    const leftNeedle = normalize(leftTitle);
    const rightNeedle = normalize(rightTitle);
    const matchedKey = Object.keys(state.recommendationBlurbsByPair).find((candidateKey) => {
      const [candidateLeft = "", candidateRight = ""] = candidateKey.split("::");
      return normalize(candidateLeft) === leftNeedle && normalize(candidateRight) === rightNeedle;
    });

    return matchedKey ? state.recommendationBlurbsByPair[matchedKey] : null;
  }

  const directEntry = findPairEntry(sourceTitle, recommendedTitle);
  if (directEntry) {
    return directEntry;
  }

  const reverseEntry = findPairEntry(recommendedTitle, sourceTitle);
  if (!reverseEntry) {
    return null;
  }

  const supportingPoints = (reverseEntry.supporting_points || []).slice(0, 3);
  if (supportingPoints.length) {
    return {
      ...reverseEntry,
      blurb: `${sourceTitle} and ${recommendedTitle} connect through ${formatList(supportingPoints)}. That shared terrain is why ${recommendedTitle} feels like a strong follow-on from ${sourceTitle}.`
    };
  }

  if (reverseEntry.primary_angle) {
    const primaryAngle = reverseEntry.primary_angle.replace(/\.$/, "");
    return {
      ...reverseEntry,
      blurb: `${sourceTitle} and ${recommendedTitle} sit in related territory: ${primaryAngle.toLowerCase()}. That is what makes ${recommendedTitle} feel closely linked to ${sourceTitle}.`
    };
  }

  return reverseEntry;
}

function inferYearForTitle(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.year) {
    return metadata.year;
  }

  const tmdbMetadata = tmdbMetadataForTitle(title);
  if (tmdbMetadata?.year) {
    return tmdbMetadata.year;
  }

  const matchedSample = byTitle(state.sampleMovies, title);
  return matchedSample?.year || "";
}

function directorForTitle(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.director) {
    return metadata.director;
  }

  const tmdbMetadata = tmdbMetadataForTitle(title);
  if (tmdbMetadata?.director) {
    return tmdbMetadata.director;
  }

  const matchedSample = byTitle(state.sampleMovies, title);
  return matchedSample?.director || "";
}

function makeLetterboxdSlug(title) {
  const normalized = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const manualOverrides = {
    "tar": "tar-2022",
    "dune-part-two": "dune-part-two",
    "dune-part-2": "dune-part-two",
    "suspiria-guadagnino-version": "suspiria-2018"
  };

  return manualOverrides[normalized] || normalized;
}

function makeLetterboxdUrl(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.letterboxd_url) {
    return metadata.letterboxd_url;
  }

  return `https://letterboxd.com/film/${makeLetterboxdSlug(title)}/`;
}

function renderPosterMarkup(title) {
  const posterUrl = makePosterUrl(title);
  if (posterUrl) {
    return `<img class="poster-image" src="${posterUrl}" alt="Poster for ${title}" loading="lazy" />`;
  }

  return `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
}

function makePosterUrl(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.poster_url) {
    return metadata.poster_url;
  }

  const tmdbMetadata = tmdbMetadataForTitle(title);
  if (tmdbMetadata?.poster_path) {
    return `https://image.tmdb.org/t/p/w342${tmdbMetadata.poster_path}`;
  }

  return "";
}

function synopsisForTitle(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.intro) {
    return metadata.intro;
  }

  const tmdbMetadata = tmdbMetadataForTitle(title);
  if (tmdbMetadata?.overview) {
    return tmdbMetadata.overview;
  }

  return "No extended synopsis available yet.";
}

function hasAvailabilityLinks(title) {
  const availability = availabilityForTitle(title);
  const retailerLinks = normalizedRetailerSearchLinks(
    title,
    availability?.physical_media?.retailer_search_links || []
  );

  return Boolean(
    availability?.streaming?.providers?.length ||
      availability?.physical_media?.ebay?.length ||
      retailerLinks.length
  );
}

function cardCoverageForTitle(title) {
  const metadata = metadataForTitle(title);
  const synopsis = synopsisForTitle(title);
  const posterUrl = makePosterUrl(title);
  const hasAverageRating = Boolean(metadata?.average_rating);
  const hasSynopsis = synopsis !== "No extended synopsis available yet.";
  const hasPoster = Boolean(posterUrl);
  const hasAvailability = hasAvailabilityLinks(title);

  return {
    hasAverageRating,
    hasSynopsis,
    hasPoster,
    hasAvailability,
    isFull: hasAverageRating && hasSynopsis && hasPoster && hasAvailability
  };
}

function cardKey(section, title) {
  return `${section}:${normalize(title)}`;
}

function titleToId(title, year) {
  return normalize(`${title}-${year || ""}`).replace(/\s+/g, "-");
}

function dedupeTitles(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function byTitle(movies, title) {
  const needle = normalize(title);
  return movies.find((movie) => normalize(movie.title) === needle) || null;
}

function sourceFilmForTitle(title) {
  return byTitle(state.curatedSourceFilms, title);
}

function availabilityForTitle(title) {
  const sourceFilm = sourceFilmForTitle(title);
  if (!sourceFilm?.film_id) {
    return null;
  }
  return state.availabilityByFilmId[sourceFilm.film_id] || null;
}

function defaultRetailerSearchLinks(title) {
  const encoded = encodeURIComponent(title);
  return [
    {
      retailer: "Criterion",
      url: `https://www.criterion.com/search?q=${encoded}`
    },
    {
      retailer: "Amazon",
      url: `https://www.amazon.co.uk/s?k=${encoded}&i=dvd`
    },
    {
      retailer: "HMV",
      url: `https://hmv.com/search?searchtext=${encoded}`
    }
  ];
}

function normalizedRetailerSearchLinks(title, retailerLinks = []) {
  const desiredRetailers = ["Criterion", "Amazon", "HMV"];
  const defaults = defaultRetailerSearchLinks(title);
  const byRetailer = new Map();

  retailerLinks.forEach((item) => {
    if (!item?.retailer) {
      return;
    }
    if (item.retailer === "BFI Shop") {
      return;
    }
    if (!byRetailer.has(item.retailer)) {
      byRetailer.set(item.retailer, item);
    }
  });

  defaults.forEach((fallback) => {
    if (!byRetailer.has(fallback.retailer)) {
      byRetailer.set(fallback.retailer, fallback);
    }
  });

  return desiredRetailers
    .map((retailer) => byRetailer.get(retailer))
    .filter(Boolean);
}

function sharedValues(left = [], right = []) {
  const rightKeys = new Set(right.map((value) => normalize(value)));
  return left.filter((value) => rightKeys.has(normalize(value)));
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

function stableIndex(seed, length) {
  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return length ? hash % length : 0;
}

function pickVariant(seed, options) {
  return options[stableIndex(seed, options.length)];
}

function reasonForRecommendation(item, selectedFilm) {
  const selectedDirector = directorForTitle(selectedFilm.title);
  const candidateDirector = directorForTitle(item.title);
  const selectedSample = byTitle(state.sampleMovies, selectedFilm.title);
  const candidateSample = byTitle(state.sampleMovies, item.title);
  const selectedTmdb = tmdbMetadataForTitle(selectedFilm.title);
  const candidateTmdb = tmdbMetadataForTitle(item.title);
  const seed = `${selectedFilm.title}:${item.title}:${item.kind}`;

  if (item.kind === "criterion") {
    return pickVariant(seed, [
      `${item.criterionDirector} picked this in the Criterion Closet, so we've selected it as a director-endorsed path out of ${selectedFilm.title}.`,
      `We've picked this because ${item.criterionDirector} singled it out in the Criterion Closet, which makes it a strong companion to ${selectedFilm.title}.`,
      `${item.criterionDirector}'s Criterion Closet pick gives us a direct line out of ${selectedFilm.title}, so we've brought it into this row.`
    ]);
  }

  if (selectedDirector && candidateDirector && normalize(selectedDirector) === normalize(candidateDirector)) {
    return pickVariant(seed, [
      `${item.title} is directed by ${candidateDirector}, the same filmmaker behind ${selectedFilm.title}, so we've picked it for that shared authorial voice.`,
      `We've selected ${item.title} because ${candidateDirector} directs both films, giving them a strong creative through-line.`,
      `${candidateDirector} is behind both ${selectedFilm.title} and ${item.title}, which makes this feel like a natural next watch.`
    ]);
  }

  if (selectedTmdb && candidateTmdb) {
    const sharedKeywords = sharedValues(selectedTmdb.keywords || [], candidateTmdb.keywords || []).slice(0, 2);
    const sharedGenres = sharedValues(selectedTmdb.genres || [], candidateTmdb.genres || []).slice(0, 2);
    const sharedCast = sharedValues(selectedTmdb.cast || [], candidateTmdb.cast || []).slice(0, 2);

    if (sharedKeywords.length && sharedGenres.length) {
      return pickVariant(seed, [
        `We've picked ${item.title} because it shares ${formatList(sharedKeywords)} with ${selectedFilm.title}, while keeping to the same ${formatList(sharedGenres)} territory.`,
        `${item.title} feels linked to ${selectedFilm.title} through ${formatList(sharedKeywords)} and the same ${formatList(sharedGenres)} backbone.`,
        `The overlap in ${formatList(sharedKeywords)} and ${formatList(sharedGenres)} is what makes ${item.title} feel like a strong next step after ${selectedFilm.title}.`
      ]);
    }

    if (sharedCast.length) {
      return pickVariant(seed, [
        `We've selected ${item.title} because it shares ${formatList(sharedCast)} with ${selectedFilm.title}, which gives the pairing a strong connective thread.`,
        `${item.title} and ${selectedFilm.title} both feature ${formatList(sharedCast)}, so this recommendation keeps a familiar on-screen energy.`,
        `The shared presence of ${formatList(sharedCast)} is a big part of why we've paired ${item.title} with ${selectedFilm.title}.`
      ]);
    }

    if (sharedKeywords.length) {
      return pickVariant(seed, [
        `${item.title} stands next to ${selectedFilm.title} through shared ideas like ${formatList(sharedKeywords)}, which is why we've picked it here.`,
        `We've selected ${item.title} because it circles many of the same ideas as ${selectedFilm.title}, especially ${formatList(sharedKeywords)}.`,
        `${formatList(sharedKeywords)} gives ${item.title} a similar pull to ${selectedFilm.title}, making it a natural follow-on choice.`
      ]);
    }
  }

  if (selectedSample && candidateSample) {
    const sharedThemes = sharedValues(selectedSample.themes || [], candidateSample.themes || []).slice(0, 2);
    const sharedTone = sharedValues(selectedSample.tone || [], candidateSample.tone || []).slice(0, 2);
    const sharedTags = sharedValues(selectedSample.tags || [], candidateSample.tags || []).slice(0, 2);
    const sharedGenres = sharedValues(selectedSample.genres || [], candidateSample.genres || []).slice(0, 2);
    const sharedCountries = sharedValues(selectedSample.countries || [], candidateSample.countries || []).slice(0, 1);

    if (sharedThemes.length && sharedTone.length) {
      return pickVariant(seed, [
        `We've picked ${item.title} because it echoes ${selectedFilm.title} through ${formatList(sharedThemes)} and a similarly ${formatList(sharedTone)} tone.`,
        `${item.title} feels close to ${selectedFilm.title} for the mix of ${formatList(sharedThemes)} and that same ${formatList(sharedTone)} mood.`,
        `The overlap in ${formatList(sharedThemes)} and the similarly ${formatList(sharedTone)} tone makes ${item.title} a strong follow-on from ${selectedFilm.title}.`
      ]);
    }

    if (sharedThemes.length && sharedGenres.length) {
      return pickVariant(seed, [
        `${item.title} picks up on the ${formatList(sharedThemes)} running through ${selectedFilm.title}, while staying in the same ${formatList(sharedGenres)} lane.`,
        `We've selected ${item.title} because it carries over ${formatList(sharedThemes)} while keeping to the same ${formatList(sharedGenres)} territory as ${selectedFilm.title}.`,
        `${formatList(sharedThemes)} and that shared ${formatList(sharedGenres)} DNA make ${item.title} feel closely linked to ${selectedFilm.title}.`
      ]);
    }

    if (sharedThemes.length) {
      return pickVariant(seed, [
        `${item.title} feels adjacent to ${selectedFilm.title} because both films lean into ${formatList(sharedThemes)}.`,
        `We've picked ${item.title} for the way it shares ${formatList(sharedThemes)} with ${selectedFilm.title}.`,
        `${selectedFilm.title} and ${item.title} both lean into ${formatList(sharedThemes)}, which is why this pairing works.`
      ]);
    }

    if (sharedTags.length) {
      return pickVariant(seed, [
        `${item.title} should click if you liked ${selectedFilm.title}, since both land in a similar zone of ${formatList(sharedTags)} filmmaking.`,
        `We've selected ${item.title} because it shares that same ${formatList(sharedTags)} sensibility as ${selectedFilm.title}.`,
        `${formatList(sharedTags)} is the main bridge between ${selectedFilm.title} and ${item.title}, so we've paired them here.`
      ]);
    }

    if (sharedTone.length) {
      return pickVariant(seed, [
        `${item.title} sits close to ${selectedFilm.title} because both films strike a similarly ${formatList(sharedTone)} note.`,
        `We've picked ${item.title} because it lands in the same ${formatList(sharedTone)} register as ${selectedFilm.title}.`,
        `The similarly ${formatList(sharedTone)} tone makes ${item.title} feel like a natural companion to ${selectedFilm.title}.`
      ]);
    }

    if (sharedGenres.length) {
      return pickVariant(seed, [
        `${item.title} keeps close to ${selectedFilm.title} through the same ${formatList(sharedGenres)} DNA.`,
        `We've selected ${item.title} because it shares the same ${formatList(sharedGenres)} backbone as ${selectedFilm.title}.`,
        `${formatList(sharedGenres)} is the clearest overlap here, which makes ${item.title} a solid follow-on from ${selectedFilm.title}.`
      ]);
    }

    if (sharedCountries.length) {
      return pickVariant(seed, [
        `${item.title} feels like a natural follow-on from ${selectedFilm.title}, with both films emerging from the same ${formatList(sharedCountries)} tradition.`,
        `We've picked ${item.title} because it comes out of the same ${formatList(sharedCountries)} tradition as ${selectedFilm.title}.`,
        `That shared ${formatList(sharedCountries)} tradition is what links ${item.title} back to ${selectedFilm.title}.`
      ]);
    }

    if (selectedSample.pace && candidateSample.pace && selectedSample.pace === candidateSample.pace) {
      return pickVariant(seed, [
        `${item.title} matches the same ${selectedSample.pace} tempo as ${selectedFilm.title}, which helps it sit naturally alongside it.`,
        `We've selected ${item.title} because it moves at the same ${selectedSample.pace} pace as ${selectedFilm.title}.`,
        `The same ${selectedSample.pace} tempo makes ${item.title} feel like an easy next step after ${selectedFilm.title}.`
      ]);
    }
  }

  if (item.kind === "curated") {
    return pickVariant(seed, [
      `${item.title} lands as a close companion to ${selectedFilm.title}, so we've picked it as an immediate follow-on.`,
      `We've selected ${item.title} as a direct next watch from ${selectedFilm.title} because the pairing feels especially close.`,
      `${item.title} sits very near ${selectedFilm.title}, so we've brought it forward as one of the clearest follow-on picks.`
    ]);
  }

  if (item.kind === "discovery") {
    return pickVariant(seed, [
      `${item.title} feels like a strong match for ${selectedFilm.title}, so we've selected it for the overlap in mood, themes, and overall feel.`,
      `We've picked ${item.title} because it shares enough of the mood and shape of ${selectedFilm.title} to feel like a strong continuation.`,
      `${item.title} came through as a close match for ${selectedFilm.title}, especially in the overall tone and thematic feel.`
    ]);
  }

  return pickVariant(seed, [
    `${item.title} sits in a nearby orbit to ${selectedFilm.title}, so we've picked it as a natural next watch.`,
    `We've selected ${item.title} because it feels closely aligned with the world and mood of ${selectedFilm.title}.`,
    `${item.title} feels like a sensible next step after ${selectedFilm.title}, so we've added it to this set of picks.`
  ]);
}

function buildBidirectionalCuratedFilms(rawFilms) {
  const graph = new Map();

  rawFilms.forEach((film) => {
    const year = film.year || inferYearForTitle(film.title);
    graph.set(normalize(film.title), {
      ...film,
      year,
      film_id: film.film_id || titleToId(film.title, year),
      manual_links: dedupeTitles(film.manual_links || []),
      graphOrigin: "source"
    });
  });

  rawFilms.forEach((film) => {
    dedupeTitles(film.manual_links || []).forEach((linkedTitle) => {
      const key = normalize(linkedTitle);
      const existing = graph.get(key);

      if (existing) {
        existing.manual_links = dedupeTitles([...existing.manual_links, film.title]);
        existing.graphOrigin =
          existing.graphOrigin === "source" ? "source+reverse" : existing.graphOrigin;
        if (!existing.year) {
          existing.year = inferYearForTitle(existing.title);
        }
        if (!existing.film_id) {
          existing.film_id = titleToId(existing.title, existing.year);
        }
        return;
      }

      const year = inferYearForTitle(linkedTitle);
      graph.set(key, {
        film_id: titleToId(linkedTitle, year),
        title: linkedTitle,
        year,
        elliott_rating: null,
        manual_links: [film.title],
        source_row_count: 0,
        graphOrigin: "reverse"
      });
    });
  });

  return Array.from(graph.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function buildDiscoveryFilmCatalog() {
  const catalog = new Map();
  const criterionTitles = [];
  const criterionTitleKeys = new Set();

  state.criterionClosetPicks.forEach((entry) => {
    entry.picks.forEach((title) => {
      const key = normalize(title);
      if (criterionTitleKeys.has(key)) {
        return;
      }

      criterionTitleKeys.add(key);
      criterionTitles.push(title);
    });
  });

  const allTitles = mergeUniqueLists(
    state.curatedFilms.map((film) => film.title),
    state.sampleMovies.map((film) => film.title),
    criterionTitles
  );

  allTitles.forEach((titleOrKey) => {
    const title =
      state.curatedFilms.find((film) => normalize(film.title) === normalize(titleOrKey))?.title ||
      state.sampleMovies.find((film) => normalize(film.title) === normalize(titleOrKey))?.title ||
      Object.keys(state.tmdbMetadataByTitle).find((key) => normalize(key) === normalize(titleOrKey)) ||
      titleOrKey;
    const key = normalize(title);
    const curated = byTitle(state.curatedFilms, title);
    const sample = byTitle(state.sampleMovies, title);
    const tmdb = tmdbMetadataForTitle(title) || {};
    const metadata = metadataForTitle(title) || {};
    const year = sample?.year || curated?.year || tmdb.year || metadata.year || inferYearForTitle(title);
    const averageRating = Number.parseFloat(metadata.average_rating) || 0;
    const coverage = cardCoverageForTitle(title);

    catalog.set(key, {
      id: curated?.film_id || sample?.id || titleToId(title, year),
      title,
      year,
      director: sample?.director || tmdb.director || metadata.director || "",
      countries: mergeUniqueLists(sample?.countries || []),
      genres: mergeUniqueLists(sample?.genres || [], tmdb.genres || []),
      themes: mergeUniqueLists(sample?.themes || []),
      tone: mergeUniqueLists(sample?.tone || []),
      tags: mergeUniqueLists(sample?.tags || [], tmdb.keywords || []),
      manualLinks: dedupeTitles([...(curated?.manual_links || []), ...(sample?.manual_links || [])]),
      editorialScore: sample?.editorial_score || 0,
      elliottRating: curated?.elliott_rating || 0,
      averageRating,
      hasFullCardCoverage: coverage.isFull,
      cardCoverage: coverage,
      sourceKinds: mergeUniqueLists(
        curated ? ["curated"] : [],
        sample ? ["sample"] : [],
        criterionTitleKeys.has(key) ? ["criterion"] : []
      )
    });
  });

  return Array.from(catalog.values()).filter((film) => film.title);
}

function getDiscoveryFilmById(filmId) {
  return state.discoveryFilms.find((film) => film.id === filmId) || null;
}

function discoverySignalList(film) {
  return [
    ...film.tags,
    ...film.tone,
    ...film.themes,
    ...film.genres
  ].map(normalize);
}

function countMatches(values, signals) {
  if (!values.length || !signals.length) {
    return 0;
  }

  const signalSet = new Set(signals.map(normalize));
  return values.reduce((total, value) => total + (signalSet.has(normalize(value)) ? 1 : 0), 0);
}

function discoveryBaseScore(film) {
  let score = 0;

  if (film.sourceKinds.includes("curated")) {
    score += 5;
  }
  if (film.sourceKinds.includes("sample")) {
    score += 4;
  }
  if (film.sourceKinds.includes("criterion")) {
    score += 2;
  }

  score += Math.min(film.manualLinks.length, 5) * 1.2;
  score += Math.min(film.editorialScore, 10) * 0.6;
  score += Math.min(film.elliottRating || 0, 5) * 0.5;
  score += Math.min(film.averageRating || 0, 5) * 0.35;

  return score;
}

function scoreFilmForTasteProfile(film, tasteProfile) {
  const signals = discoverySignalList(film);
  let score = discoveryBaseScore(film);

  if (film.year && film.year < 1970) {
    score += tasteProfile.oldCinemaAffinity * 2;
  } else if (film.year && film.year < 1990) {
    score += tasteProfile.oldCinemaAffinity;
  }

  const countries = film.countries.map(normalize);
  const nonEnglishLanguageWorldCinema = countries.filter(
    (country) => !["usa", "united states", "uk", "united kingdom", "england"].includes(country)
  );
  if (nonEnglishLanguageWorldCinema.length) {
    score += tasteProfile.worldCinemaAffinity * 2;
  } else if (countries.length && !countries.includes("usa") && !countries.includes("united states")) {
    score += tasteProfile.worldCinemaAffinity;
  }

  score += countMatches(signals, [
    "hypnotic",
    "sleepy",
    "lyrical",
    "immersive",
    "observant",
    "drifting",
    "interiority"
  ]) * tasteProfile.slowCinemaAffinity;

  score += countMatches(signals, [
    "surreal",
    "dreamlike",
    "off kilter",
    "mysterious",
    "symbolic",
    "body horror",
    "madness",
    "provocative",
    "cult horror",
    "cult favorite"
  ]) * tasteProfile.weirdnessAffinity;

  score += countMatches(signals, [
    "formal beauty",
    "art film",
    "art cinema",
    "precise",
    "austere",
    "physical performance",
    "creative life"
  ]) * tasteProfile.craftAffinity;

  score += countMatches(signals, [
    "mysterious",
    "symbolic",
    "surreal",
    "dreamlike",
    "interiority",
    "spiritual crisis"
  ]) * tasteProfile.ambiguityAffinity;

  return score;
}

function scoreFilmFromBookmarks(film, bookmarkedIds) {
  const bookmarkedFilms = bookmarkedIds
    .map((filmId) => getDiscoveryFilmById(filmId))
    .filter(Boolean);

  if (!bookmarkedFilms.length) {
    return { score: 0, seedTitle: "" };
  }

  let score = 0;
  let bestSeedTitle = "";
  let bestPairScore = -Infinity;

  bookmarkedFilms.forEach((bookmarkedFilm) => {
    let pairScore = 0;

    if (film.director && bookmarkedFilm.director && normalize(film.director) === normalize(bookmarkedFilm.director)) {
      pairScore += 4;
    }

    pairScore += countMatches(film.genres, bookmarkedFilm.genres) * 1.4;
    pairScore += countMatches(film.themes, bookmarkedFilm.themes) * 2;
    pairScore += countMatches(film.tone, bookmarkedFilm.tone) * 1.7;
    pairScore += countMatches(film.tags, bookmarkedFilm.tags) * 1.2;
    pairScore += countMatches(film.countries, bookmarkedFilm.countries);

    if (film.manualLinks.some((title) => normalize(title) === normalize(bookmarkedFilm.title))) {
      pairScore += 3;
    }
    if (bookmarkedFilm.manualLinks.some((title) => normalize(title) === normalize(film.title))) {
      pairScore += 3;
    }

    if (film.year && bookmarkedFilm.year) {
      const yearGap = Math.abs(film.year - bookmarkedFilm.year);
      if (yearGap <= 6) {
        pairScore += 1.5;
      } else if (eraBucket(film.year) === eraBucket(bookmarkedFilm.year)) {
        pairScore += 1;
      }
    }

    if (recommendationBlurbForPair(bookmarkedFilm.title, film.title)) {
      pairScore += 2;
    }

    score += pairScore;

    if (pairScore > bestPairScore) {
      bestPairScore = pairScore;
      bestSeedTitle = bookmarkedFilm.title;
    }
  });

  return {
    score,
    seedTitle: bestSeedTitle
  };
}

function pickScoredFilms(scoredFilms, count, usedIds) {
  const picks = [];
  const pickedDirectors = new Set();

  [true, false].forEach((avoidDirectorRepeat) => {
    scoredFilms.forEach((item) => {
      if (picks.length >= count || usedIds.has(item.film.id)) {
        return;
      }

      const directorKey = normalize(item.film.director);
      if (avoidDirectorRepeat && directorKey && pickedDirectors.has(directorKey)) {
        return;
      }

      picks.push(item);
      usedIds.add(item.film.id);
      if (directorKey) {
        pickedDirectors.add(directorKey);
      }
    });
  });

  return picks.slice(0, count);
}

function describeTasteBridge(film, tasteProfile) {
  const descriptors = [];
  const signals = discoverySignalList(film);

  if (tasteProfile.oldCinemaAffinity > 0 && film.year && film.year < 1990) {
    descriptors.push("older cinema");
  }

  if (tasteProfile.worldCinemaAffinity > 0) {
    const countries = film.countries.map(normalize);
    if (countries.some((country) => !["usa", "united states", "uk", "united kingdom", "england"].includes(country))) {
      descriptors.push("world cinema");
    }
  }

  if (
    tasteProfile.slowCinemaAffinity > 0 &&
    countMatches(signals, ["hypnotic", "lyrical", "immersive", "sleepy", "observant", "interiority"])
  ) {
    descriptors.push("quieter, more hypnotic films");
  }

  if (
    tasteProfile.weirdnessAffinity > 0 &&
    countMatches(signals, ["surreal", "dreamlike", "off kilter", "mysterious", "symbolic", "madness"])
  ) {
    descriptors.push("stranger edges");
  }

  if (
    tasteProfile.craftAffinity > 0 &&
    countMatches(signals, ["formal beauty", "art film", "art cinema", "precise", "austere"])
  ) {
    descriptors.push("form and texture");
  }

  if (
    tasteProfile.ambiguityAffinity > 0 &&
    countMatches(signals, ["mysterious", "symbolic", "surreal", "dreamlike", "interiority"])
  ) {
    descriptors.push("open-ended moods");
  }

  return descriptors.slice(0, 2);
}

function discoveryAnswerSignals(answers) {
  const signals = [];

  if (answers.subtitles === "essential") {
    signals.push("subtitles are essential");
  } else if (answers.subtitles === "fine") {
    signals.push("subtitles are worth it when the film earns them");
  }

  if (answers.slow === "hypnotic") {
    signals.push("you like films with a hypnotic pace");
  } else if (answers.slow === "depends") {
    signals.push("you are open to slower films when the mood is right");
  }

  if (answers.weird === "max") {
    signals.push("you want the stranger end of the spectrum");
  } else if (answers.weird === "medium") {
    signals.push("you like a little strangeness");
  }

  if (answers.bw === "timeless") {
    signals.push("older cinema feels timeless to you");
  } else if (answers.bw === "depends") {
    signals.push("you will go with older films when the pull is strong");
  }

  if (answers.craft_vs_feeling === "craft") {
    signals.push("form and craft matter to you");
  } else if (answers.craft_vs_feeling === "feeling") {
    signals.push("emotional impact matters most");
  }

  if (answers.ambiguity === "love") {
    signals.push("you enjoy ambiguity");
  } else if (answers.ambiguity === "sometimes") {
    signals.push("you can go with ambiguity in the right film");
  }

  return signals.slice(0, 2);
}

function formatDiscoveryRationale(parts, ending) {
  const cleanParts = parts.filter(Boolean);

  if (!cleanParts.length) {
    return ending;
  }

  if (cleanParts.length === 1) {
    return `${cleanParts[0]}, so ${ending}`;
  }

  return `${cleanParts[0]} and ${cleanParts[1]}, so ${ending}`;
}

function buildDiscoveryRationale(film, context) {
  const answerSignals = discoveryAnswerSignals(state.discovery.answers);
  const descriptors = describeTasteBridge(film, context.tasteProfile);

  if (context.seedTitle) {
    const seedFilm = state.discoveryFilms.find((item) => normalize(item.title) === normalize(context.seedTitle));
    const sharedMood =
      seedFilm && (countMatches(film.tone, seedFilm.tone) || countMatches(film.themes, seedFilm.themes));
    const seedClause = `you bookmarked ${context.seedTitle}`;
    const tasteClause = answerSignals[0] || descriptors[0] || "";

    if (sharedMood) {
      return formatDiscoveryRationale(
        [seedClause, tasteClause],
        `${film.title} keeps some of that same mood while nudging you somewhere new.`
      );
    }

    return formatDiscoveryRationale(
      [seedClause, tasteClause],
      `${film.title} felt like a strong next step for this batch.`
    );
  }

  if (context.bucket === "wildcard") {
    return formatDiscoveryRationale(
      answerSignals,
      `${film.title} is the wildcard here to keep some surprise in the mix.`
    );
  }

  if (context.bucket === "stretch" && descriptors.length) {
    return formatDiscoveryRationale(
      [answerSignals[0], descriptors[0]],
      `${film.title} reaches a little further without losing the thread of your answers.`
    );
  }

  if (descriptors.length || answerSignals.length) {
    return formatDiscoveryRationale(
      [answerSignals[0], descriptors[0]],
      `${film.title} felt like a strong fit for the taste profile you just gave us.`
    );
  }

  return context.mode === "refined"
    ? `${film.title} is a sharper follow-on based on what you saved.`
    : `${film.title} is a broad discovery pick to open up the field.`;
}

function finalizeDiscoveryBatch(picks, context) {
  return picks.map((item) => ({
    filmId: item.film.id,
    rationale: buildDiscoveryRationale(item.film, {
      ...context,
      bucket: item.bucket,
      seedTitle: item.seedTitle
    }),
    bucket: item.bucket,
    seedTitle: item.seedTitle || ""
  }));
}

function getInitialDiscoveryBatch({ tasteProfile, allFilms, excludedIds = [] }) {
  const excludedSet = new Set(excludedIds);
  const eligibleFilms = allFilms.filter((film) => film.hasFullCardCoverage);
  const scored = eligibleFilms
    .filter((film) => !excludedSet.has(film.id))
    .map((film) => ({
      film,
      score: scoreFilmForTasteProfile(film, tasteProfile),
      baseScore: discoveryBaseScore(film)
    }))
    .sort((left, right) => right.score - left.score || right.baseScore - left.baseScore);

  const usedIds = new Set();
  const aligned = pickScoredFilms(scored.slice(0, 18), 5, usedIds).map((item) => ({
    ...item,
    bucket: "aligned"
  }));
  const stretch = pickScoredFilms(scored.slice(5, 32), 3, usedIds).map((item) => ({
    ...item,
    bucket: "stretch"
  }));
  const wildcardPool = shuffleList(scored.slice(10, 42));
  const wildcard = pickScoredFilms(wildcardPool, 1, usedIds).map((item) => ({
    ...item,
    bucket: "wildcard"
  }));
  const fallback = pickScoredFilms(scored, 9 - aligned.length - stretch.length - wildcard.length, usedIds).map((item) => ({
    ...item,
    bucket: "aligned"
  }));

  return finalizeDiscoveryBatch([...aligned, ...stretch, ...wildcard, ...fallback].slice(0, 9), {
    mode: "initial",
    tasteProfile
  });
}

function getRefinedDiscoveryBatch({
  tasteProfile,
  bookmarkedIds,
  dismissedIds,
  allFilms,
  excludedIds = []
}) {
  const excludedSet = new Set([...dismissedIds, ...excludedIds]);
  const eligibleFilms = allFilms.filter((film) => film.hasFullCardCoverage);
  const scored = eligibleFilms
    .filter((film) => !excludedSet.has(film.id))
    .map((film) => {
      const tasteScore = scoreFilmForTasteProfile(film, tasteProfile);
      const bookmarkScore = scoreFilmFromBookmarks(film, bookmarkedIds);
      const score = tasteScore + bookmarkScore.score * 1.6;

      return {
        film,
        score,
        baseScore: discoveryBaseScore(film),
        seedTitle: bookmarkScore.seedTitle
      };
    })
    .sort((left, right) => right.score - left.score || right.baseScore - left.baseScore);

  const usedIds = new Set();
  const aligned = pickScoredFilms(scored.slice(0, 18), 6, usedIds).map((item) => ({
    ...item,
    bucket: "aligned"
  }));
  const stretch = pickScoredFilms(scored.slice(6, 34), 2, usedIds).map((item) => ({
    ...item,
    bucket: "stretch"
  }));
  const wildcardPool = shuffleList(scored.slice(12, 44));
  const wildcard = pickScoredFilms(wildcardPool, 1, usedIds).map((item) => ({
    ...item,
    bucket: "wildcard",
    seedTitle: ""
  }));
  const fallback = pickScoredFilms(scored, 9 - aligned.length - stretch.length - wildcard.length, usedIds).map((item) => ({
    ...item,
    bucket: "aligned"
  }));

  return finalizeDiscoveryBatch([...aligned, ...stretch, ...wildcard, ...fallback].slice(0, 9), {
    mode: "refined",
    tasteProfile
  });
}

function describeSearchMatch(film) {
  const year = film.year || "Year unknown";
  const director = directorForTitle(film.title);
  return director ? `${year} • ${director}` : `${year}`;
}

function increment(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sumMatches(map, values, factor = 1) {
  return values.reduce((score, value) => score + ((map.get(value) || 0) * factor), 0);
}

function eraBucket(year) {
  if (year < 1970) return "60s";
  if (year < 1980) return "70s";
  if (year < 1990) return "80s";
  if (year < 2000) return "90s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  return "2020s";
}

function collectWeightedProfile(selectedMovies) {
  const profile = {
    genres: new Map(),
    themes: new Map(),
    tone: new Map(),
    countries: new Map(),
    tags: new Map(),
    pace: new Map()
  };

  selectedMovies.forEach((movie) => {
    movie.genres.forEach((genre) => increment(profile.genres, genre, 3));
    movie.themes.forEach((theme) => increment(profile.themes, theme, 4));
    movie.tone.forEach((tone) => increment(profile.tone, tone, 3));
    movie.countries.forEach((country) => increment(profile.countries, country, 2));
    movie.tags.forEach((tag) => increment(profile.tags, tag, 2));
    increment(profile.pace, movie.pace, 2);
  });

  return profile;
}

function scoreSampleMovie(candidate, selectedMovies, profile) {
  let score = 0;

  score += sumMatches(profile.genres, candidate.genres, 1.1);
  score += sumMatches(profile.themes, candidate.themes, 1.4);
  score += sumMatches(profile.tone, candidate.tone, 1.2);
  score += sumMatches(profile.countries, candidate.countries, 0.8);
  score += sumMatches(profile.tags, candidate.tags, 0.8);
  score += profile.pace.get(candidate.pace) || 0;

  const selectedEras = new Set(selectedMovies.map((movie) => eraBucket(movie.year)));
  if (selectedEras.has(eraBucket(candidate.year))) {
    score += 3;
  }

  const linkedFromSelections = selectedMovies.filter((movie) =>
    (movie.manual_links || []).includes(candidate.title)
  );
  if (linkedFromSelections.length > 0) {
    score += 12;
  }

  if (candidate.editorial_score >= 9) {
    score += 3;
  } else {
    score += Math.round(candidate.editorial_score / 3);
  }

  return score;
}

function getHybridRecommendations(selectedFilm) {
  const manualTitles = selectedFilm.manual_links || [];
  const curatedCards = manualTitles.map((title) => ({
    kind: "curated",
    title,
    sourceFilm: selectedFilm.title
  }));

  const directorNames = new Set();
  const selectedDirector = directorForTitle(selectedFilm.title);
  if (selectedDirector) {
    directorNames.add(selectedDirector);
  }

  const sampleSeeds = [];
  const selectedAsSample = byTitle(state.sampleMovies, selectedFilm.title);
  if (selectedAsSample) {
    sampleSeeds.push(selectedAsSample);
    directorNames.add(selectedAsSample.director);
  }

  manualTitles.forEach((title) => {
    const matched = byTitle(state.sampleMovies, title);
    if (matched && !sampleSeeds.some((movie) => movie.id === matched.id)) {
      sampleSeeds.push(matched);
    }
  });

  const blockedTitles = new Set([selectedFilm.title, ...manualTitles].map(normalize));
  const criterionCards = [];

  state.criterionClosetPicks.forEach((entry) => {
    if (!directorNames.has(entry.director)) {
      return;
    }

    entry.picks.forEach((title) => {
      if (blockedTitles.has(normalize(title))) {
        return;
      }

      if (criterionCards.some((item) => normalize(item.title) === normalize(title))) {
        return;
      }

      criterionCards.push({
        kind: "criterion",
        title,
        sourceFilm: selectedFilm.title,
        criterionDirector: entry.director,
        criterionSource: entry.source
      });
    });
  });

  if (sampleSeeds.length === 0) {
    return {
      primary: curatedCards,
      criterion: criterionCards.slice(0, 4)
    };
  }

  const profile = collectWeightedProfile(sampleSeeds);
  criterionCards.forEach((item) => blockedTitles.add(normalize(item.title)));

  const discoveryCards = state.sampleMovies
    .filter((movie) => !blockedTitles.has(normalize(movie.title)))
    .map((movie) => ({
      kind: "discovery",
      title: movie.title,
      rankLabel: "DISCOVER",
      score: scoreSampleMovie(movie, sampleSeeds, profile),
      sourceFilm: selectedFilm.title
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  return {
    primary: [...curatedCards, ...discoveryCards],
    criterion: criterionCards.slice(0, 4)
  };
}

function addFilm(filmId) {
  let film = state.curatedFilms.find((item) => item.film_id === filmId);

  if (!film) {
    const sampleFilm = state.sampleMovies.find((item) => (item.id || titleToId(item.title, item.year)) === filmId);
    if (sampleFilm) {
      film = {
        film_id: sampleFilm.id || titleToId(sampleFilm.title, sampleFilm.year),
        title: sampleFilm.title,
        year: sampleFilm.year,
        elliott_rating: null,
        manual_links: [],
        sourceType: "sample"
      };
    }
  }

  if (!film) {
    return;
  }

  state.selectedFilmId = filmId;
  state.selectedFilm = film;
  state.recommendations = getHybridRecommendations(film);
  state.expandedCardKey = "";
  state.query = "";
  if (elements.movieSearch) {
    elements.movieSearch.value = "";
  }
  saveMainPageState();
  render();
}

function restoreSelectedFilmState() {
  if (!state.selectedFilmId) {
    return false;
  }

  let film = state.curatedFilms.find((item) => item.film_id === state.selectedFilmId);

  if (!film) {
    const sampleFilm = state.sampleMovies.find(
      (item) => (item.id || titleToId(item.title, item.year)) === state.selectedFilmId
    );
    if (sampleFilm) {
      film = {
        film_id: sampleFilm.id || titleToId(sampleFilm.title, sampleFilm.year),
        title: sampleFilm.title,
        year: sampleFilm.year,
        elliott_rating: null,
        manual_links: [],
        sourceType: "sample"
      };
    }
  }

  if (!film) {
    state.selectedFilmId = null;
    state.selectedFilm = null;
    state.recommendations = [];
    saveMainPageState();
    return false;
  }

  state.selectedFilm = film;
  state.recommendations = getHybridRecommendations(film);
  return true;
}

function openRecommendationsForTitle(title) {
  const curatedFilm = byTitle(state.curatedFilms, title);
  if (curatedFilm) {
    addFilm(curatedFilm.film_id);
    return;
  }

  const sampleFilm = byTitle(state.sampleMovies, title);
  if (sampleFilm) {
    addFilm(sampleFilm.id || titleToId(sampleFilm.title, sampleFilm.year));
    return;
  }

  const year = inferYearForTitle(title);
  const metadata = metadataForTitle(title);
  const tmdbMetadata = tmdbMetadataForTitle(title);

  if (!metadata && !tmdbMetadata && !year) {
    return;
  }

  const film = {
    film_id: titleToId(title, year),
    title,
    year,
    elliott_rating: null,
    manual_links: [],
    sourceType: metadata ? "graph" : "sample"
  };

  state.selectedFilmId = film.film_id;
  state.selectedFilm = film;
  state.recommendations = getHybridRecommendations(film);
  state.expandedCardKey = "";
  state.query = "";
  if (elements.movieSearch) {
    elements.movieSearch.value = "";
  }
  saveMainPageState();
  render();
}

function clearSelectedFilm() {
  state.selectedFilmId = null;
  state.selectedFilm = null;
  state.expandedCardKey = "";
  state.recommendations = [];
  saveMainPageState();
  render();
}

function toggleExpandedCard(key) {
  state.expandedCardKey = state.expandedCardKey === key ? "" : key;
  saveMainPageState();
  renderRecommendations();
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

function renderLinkOrText(url, label, className = "availability-chip") {
  if (!url) {
    return `<span class="${className} availability-chip-muted">${label}</span>`;
  }

  return `<a class="${className}" href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
}

function renderAvailabilityPanel(title) {
  const availability = availabilityForTitle(title);
  const streamingProviders = availability?.streaming?.providers || [];
  const watchUrl = availability?.streaming?.watch_url || "";
  const ebayListings = availability?.physical_media?.ebay || [];
  const retailerLinks = normalizedRetailerSearchLinks(
    title,
    availability?.physical_media?.retailer_search_links || []
  );

  if (!streamingProviders.length && !ebayListings.length && !retailerLinks.length) {
    return "";
  }

  const streamingMarkup = streamingProviders.length
    ? `
        <div class="availability-group">
          <span class="availability-label">Streaming</span>
          <div class="availability-links">
            ${streamingProviders
              .map((provider) => renderLinkOrText(watchUrl, providerActionLabel(provider)))
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
              .map((listing) =>
                renderLinkOrText(listing.item_url, ebayActionLabel(listing), "availability-link-listing")
              )
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
              .map((item) => renderLinkOrText(item.url, `Search ${item.retailer}`))
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

function renderSearchResults() {
  if (!elements.searchResults) {
    return;
  }

  if (state.loading) {
    elements.searchResults.innerHTML = `
      <div class="empty-state">
        <h3>Loading curated graph</h3>
        <p>Pulling in the films you already mapped by hand.</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    elements.searchResults.innerHTML = `
      <div class="empty-state">
        <h3>Couldn't load the dataset</h3>
        <p>${state.error}</p>
      </div>
    `;
    return;
  }

  const matches = getSearchMatches();

  if (!state.query) {
    elements.searchResults.innerHTML = "";
    return;
  }

  if (matches.length === 0) {
    elements.searchResults.innerHTML = `
      <div class="empty-state search-empty-state">
        <h3>Game over, man! Game over!</h3>
        <p>That film isn't here right now, but... we're working on it.</p>
      </div>
    `;
    return;
  }

  elements.searchResults.innerHTML = matches
    .map(
      (film) => `
        <div class="search-result">
          <div>
            <strong>${film.title}</strong>
            <div class="match-meta">${describeSearchMatch(film)}</div>
          </div>
          <button type="button" data-add-film="${film.film_id}">Select</button>
        </div>
      `
    )
    .join("");
}

function getQuickPicks() {
  return state.quickPicks;
}

function refreshQuickPicks() {
  state.quickPicks = shuffleList(state.curatedSourceFilms).slice(0, 12);
  renderQuickPicks();
}

function renderQuickPicks() {
  if (!elements.directorList) {
    return;
  }

  if (state.loading || state.error) {
    elements.directorList.innerHTML = "";
    return;
  }

  elements.directorList.innerHTML = getQuickPicks()
    .map(
      (film) => `
        <button
          class="director-pill ${state.selectedFilmId === film.film_id ? "active" : ""}"
          type="button"
          data-quick-pick="${film.film_id}"
        >
          ${film.title}
        </button>
      `
    )
    .join("");
}

function renderDiscoveryBookmarks() {
  if (!elements.discoveryBookmarks) {
    return;
  }

  if (state.loading || state.error) {
    elements.discoveryBookmarks.innerHTML = "";
    return;
  }

  const savedCount = state.discovery.bookmarkedIds.length;

  elements.discoveryBookmarks.innerHTML = `
    <a class="card-link-button saved-sidebar-button" href="./saved.html">Your saved films</a>
    <p class="saved-sidebar-summary">${savedCount ? `${savedCount} saved so far.` : "Nothing saved yet."}</p>
  `;
}

function getSavedFilms() {
  return normalizeSavedFilmIds(state.discovery.bookmarkedIds)
    .map((filmId) => getDiscoveryFilmById(filmId))
    .filter(Boolean);
}

function savedFilmReason(film) {
  const fromDiscovery = state.discovery.currentBatch.find((item) => item.filmId === film.id);
  if (fromDiscovery?.rationale) {
    return fromDiscovery.rationale;
  }

  return "You saved this from your discovery shortlist.";
}

function renderSavedFilmDetail(title, reason) {
  const posterMarkup = renderPosterMarkup(title);
  const letterboxdUrl = makeLetterboxdUrl(title);

  return `
    <div class="saved-film-row__detail">
      <div class="poster-block">
        ${posterMarkup}
      </div>
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        ${renderExpandedPanel(title, reason)}
        <div class="card-actions">
          <a class="card-link-button" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
        </div>
      </div>
    </div>
  `;
}

function renderSavedFilmsPage() {
  if (!elements.savedFilmsList) {
    return;
  }

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

  const savedFilms = getSavedFilms();

  if (!savedFilms.length) {
    elements.savedFilmsList.innerHTML = `
      <div class="empty-state saved-films-empty-state">
        <h3>No saved films yet</h3>
        <p>Bookmark films from the discovery page and they will show up here.</p>
        <a class="card-link-button saved-films-empty-state__link" href="./index.html">Back to discovery</a>
      </div>
    `;
    return;
  }

  elements.savedFilmsList.innerHTML = `
    <div class="saved-films-list">
      ${savedFilms
        .map((film) => {
          const detailKey = cardKey("saved", film.title);
          const expanded = state.expandedCardKey === detailKey;
          const director = film.director || directorForTitle(film.title) || "Director unknown";

          return `
            <article class="saved-film-row ${expanded ? "saved-film-row-expanded" : ""}" data-saved-film="${film.id}">
              <div class="saved-film-row__summary">
                <div class="saved-film-row__meta">
                  <h2 class="saved-film-row__title">${film.title}</h2>
                  <p class="saved-film-row__subline">${film.year || "Year unknown"} • ${director}</p>
                </div>
                <div class="saved-film-row__actions">
                  <button class="card-link-button card-link-button-tertiary saved-film-row__toggle" type="button" data-saved-toggle="${detailKey}">
                    ${expanded ? "See less" : "See more"}
                  </button>
                  <button class="card-link-button saved-film-row__unsave" type="button" data-saved-unsave="${film.id}">
                    Unsave
                  </button>
                </div>
              </div>
              ${expanded ? renderSavedFilmDetail(film.title, savedFilmReason(film)) : ""}
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  elements.savedFilmsList.querySelectorAll("[data-saved-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.savedToggle;
      state.expandedCardKey = state.expandedCardKey === key ? "" : key;
      renderSavedFilmsPage();
    });
  });

  elements.savedFilmsList.querySelectorAll("[data-saved-unsave]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleDiscoveryBookmark(button.dataset.savedUnsave);
      if (state.expandedCardKey === cardKey("saved", getDiscoveryFilmById(button.dataset.savedUnsave)?.title || "")) {
        state.expandedCardKey = "";
      }
      renderSavedFilmsPage();
    });
  });
}

function monogramForTitle(title) {
  return title
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderExpandedPanel(title, reason) {
  const metadata = metadataForTitle(title);
  const availabilityPanel = renderAvailabilityPanel(title);
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
        <span class="expanded-reason-label">AI take on the fit</span>
        <p class="expanded-reason-copy">${reason}</p>
      </div>
      ${availabilityPanel}
      <p class="expanded-copy">${synopsisForTitle(title)}</p>
    </div>
  `;
}

function handleTasteQuizAnswer(questionId, answerId) {
  state.discovery.answers[questionId] = answerId;
  renderRecommendations();
}

function completeQuizAndGenerateFirstBatch() {
  state.discovery.tasteProfile = scoreTasteProfile(state.discovery.answers);
  state.discovery.currentBatch = getInitialDiscoveryBatch({
    tasteProfile: state.discovery.tasteProfile,
    allFilms: state.discoveryFilms,
    excludedIds: []
  });
  state.discovery.batchHistory = [state.discovery.currentBatch.map((item) => item.filmId)];
  state.discovery.step = "grid1";
  state.expandedCardKey = "";

  console.log("[taste-discovery] quiz complete", {
    answers: state.discovery.answers,
    tasteProfile: state.discovery.tasteProfile,
    batchIds: state.discovery.currentBatch.map((item) => item.filmId)
  });

  saveMainPageState();
  renderRecommendations();
}

function toggleDiscoveryBookmark(filmId) {
  if (state.discovery.bookmarkedIds.includes(filmId)) {
    state.discovery.bookmarkedIds = state.discovery.bookmarkedIds.filter((id) => id !== filmId);
  } else {
    state.discovery.bookmarkedIds = [filmId, ...state.discovery.bookmarkedIds];
  }

  saveSavedFilmIds(state.discovery.bookmarkedIds);
  saveMainPageState();

  console.log("[taste-discovery] bookmark", {
    filmId,
    bookmarkedIds: state.discovery.bookmarkedIds
  });
}

function toggleDiscoveryDismiss(filmId) {
  if (state.discovery.dismissedIds.includes(filmId)) {
    state.discovery.dismissedIds = state.discovery.dismissedIds.filter((id) => id !== filmId);
  } else {
    state.discovery.dismissedIds = [...state.discovery.dismissedIds, filmId];
  }

  state.discovery.bookmarkedIds = state.discovery.bookmarkedIds.filter((id) => id !== filmId);
  saveSavedFilmIds(state.discovery.bookmarkedIds);
  saveMainPageState();

  console.log("[taste-discovery] not-for-me", {
    filmId,
    dismissedIds: state.discovery.dismissedIds
  });
}

function advanceDiscovery() {
  const excludedIds = state.discovery.batchHistory.flat();
  state.discovery.currentBatch = getRefinedDiscoveryBatch({
    tasteProfile: state.discovery.tasteProfile,
    bookmarkedIds: state.discovery.bookmarkedIds,
    dismissedIds: state.discovery.dismissedIds,
    allFilms: state.discoveryFilms,
    excludedIds
  });
  state.discovery.batchHistory = [
    ...state.discovery.batchHistory,
    state.discovery.currentBatch.map((item) => item.filmId)
  ];
  state.discovery.step = "grid2";
  state.expandedCardKey = "";

  console.log("[taste-discovery] batch generated", {
    step: state.discovery.step,
    bookmarkedIds: state.discovery.bookmarkedIds,
    dismissedIds: state.discovery.dismissedIds,
    batchIds: state.discovery.currentBatch.map((item) => item.filmId)
  });

  saveMainPageState();
  renderRecommendations();
}

function renderTasteQuiz() {
  renderDiscoveryBookmarks();
  elements.clearRecommendations.hidden = true;
  elements.resultsTitle.textContent = "Taste discovery";
  elements.resultsGrid.innerHTML = `
    <section class="results-grid-span taste-quiz-shell" data-discovery-step="quiz">
      <div class="taste-quiz-intro">
        <p class="eyebrow">Onboarding</p>
        <h3>Teach us your film taste</h3>
        <p class="results-subtitle">Six quick questions, then we will open with a broad grid of films to explore.</p>
      </div>
      <div class="taste-quiz-list">
        ${tasteQuizQuestions
          .map((question) => {
            const selectedAnswer = state.discovery.answers[question.id];

            return `
              <section class="taste-quiz-question" data-quiz-question="${question.id}">
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
        <p class="taste-quiz-footer__copy">${Object.keys(state.discovery.answers).length} of ${tasteQuizQuestions.length} answered</p>
        <button
          id="taste-quiz-submit"
          class="ghost-button taste-quiz-submit"
          type="button"
          ${Object.keys(state.discovery.answers).length < tasteQuizQuestions.length ? "disabled" : ""}
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
      handleTasteQuizAnswer(questionId, answerId);
    });
  });

  elements.resultsGrid.querySelector("#taste-quiz-submit")?.addEventListener("click", () => {
    completeQuizAndGenerateFirstBatch();
  });
}

function renderDiscoveryGrid() {
  renderDiscoveryBookmarks();
  elements.clearRecommendations.hidden = true;

  const batchItems = state.discovery.currentBatch
    .map((item) => ({
      ...item,
      film: getDiscoveryFilmById(item.filmId)
    }))
    .filter((item) => item.film);

  const isRefined = state.discovery.step === "grid2";
  const headerTitle = isRefined ? "Getting warmer" : "A first pass at your taste";
  const headerCopy = isRefined
    ? "Bookmark what lands. Use Not for me lightly, and we will keep some surprise in the mix."
    : "Bookmark anything that pulls you in. We will use those saves to sharpen the next nine.";
  const continueLabel = isRefined ? "Keep exploring" : "Refine these picks";

  elements.resultsTitle.textContent = "Taste discovery";
  elements.resultsGrid.innerHTML = `
    <section class="results-grid-span discovery-shell" data-discovery-step="${state.discovery.step}">
      <div class="discovery-shell__head">
        <div>
          <p class="eyebrow">Discovery</p>
          <h3>${headerTitle}</h3>
        </div>
        <p class="results-subtitle">${headerCopy}</p>
      </div>
      <div class="discovery-grid-cards">
        ${batchItems
          .map((item) => {
            const film = item.film;
            const title = film.title;
            const key = cardKey("discovery", `${state.discovery.step}:${title}`);
            const expanded = state.expandedCardKey === key;
            const posterUrl = makePosterUrl(title);
            const posterMarkup = posterUrl
              ? `<img class="poster-image" src="${posterUrl}" alt="Poster for ${title}" loading="lazy" />`
              : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
            const letterboxdUrl = makeLetterboxdUrl(title);
            const year = film.year ? `<span>${film.year}</span>` : "";
            const director = film.director ? `<span>${film.director}</span>` : "";
            const isBookmarked = state.discovery.bookmarkedIds.includes(film.id);
            const isDismissed = state.discovery.dismissedIds.includes(film.id);

            return `
              <article
                class="result-card discovery-card ${expanded ? "result-card-expanded" : ""} ${isDismissed ? "discovery-card-dismissed" : ""}"
                data-discovery-card="${film.id}"
              >
                <div class="poster-block">
                  ${posterMarkup}
                </div>
                <div class="card-body">
                  <div class="discovery-card__meta">
                    <h4 class="card-title">${title}</h4>
                    <p class="match-meta">${[year, director].filter(Boolean).join(" • ")}</p>
                    <p class="discovery-card__rationale">${item.rationale}</p>
                  </div>
                  ${expanded ? renderExpandedPanel(title, item.rationale) : ""}
                  <div class="card-actions">
                    <button class="card-link-button discovery-action-button ${isBookmarked ? "is-active" : ""}" type="button" data-discovery-bookmark="${film.id}">
                      ${isBookmarked ? "Saved" : "Bookmark"}
                    </button>
                    ${
                      isRefined
                        ? `
                          <button class="card-link-button card-link-button-tertiary discovery-dismiss-button ${isDismissed ? "is-active" : ""}" type="button" data-discovery-dismiss="${film.id}">
                            ${isDismissed ? "Undo not for me" : "Not for me"}
                          </button>
                        `
                        : ""
                    }
                    <a class="card-link-button card-link-button-secondary" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
                    <button class="card-link-button card-link-button-tertiary" type="button" data-discovery-toggle="${key}">
                      ${expanded ? "See less" : "See more"}
                    </button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      <div class="discovery-shell__footer">
        <p class="discovery-shell__summary">${state.discovery.bookmarkedIds.length} saved • ${state.discovery.dismissedIds.length} not for me</p>
        <button class="ghost-button discovery-shell__continue" type="button" data-discovery-continue>${continueLabel}</button>
      </div>
    </section>
  `;
  elements.criterionSection.innerHTML = "";

  elements.resultsGrid.querySelectorAll("[data-discovery-bookmark]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleDiscoveryBookmark(button.dataset.discoveryBookmark);
      renderDiscoveryGrid();
    });
  });

  elements.resultsGrid.querySelectorAll("[data-discovery-dismiss]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleDiscoveryDismiss(button.dataset.discoveryDismiss);
      renderDiscoveryGrid();
    });
  });

  elements.resultsGrid.querySelectorAll("[data-discovery-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.dataset.discoveryToggle;
      const isOpening = state.expandedCardKey !== nextKey;
      state.expandedCardKey = isOpening ? nextKey : "";
      if (isOpening) {
        console.log("[taste-discovery] detail expand", { key: nextKey });
      }
      renderDiscoveryGrid();
    });
  });

  elements.resultsGrid.querySelector("[data-discovery-continue]")?.addEventListener("click", () => {
    advanceDiscovery();
  });
}

function renderRecommendations() {
  if (!elements.resultsGrid || !elements.resultsTitle || !elements.criterionSection || isSavedPage) {
    return;
  }

  if (!state.selectedFilm) {
    if (!state.loading && !state.error) {
      if (state.discovery.step === "quiz") {
        renderTasteQuiz();
        return;
      }

      renderDiscoveryGrid();
      return;
    }

    elements.clearRecommendations.hidden = true;
    elements.resultsTitle.textContent = "Recommendations";
    elements.resultsGrid.innerHTML = `
      <div class="empty-state recommendations-empty-state results-grid-span">
        <p>
          Select a film you've watched, and recommendations will appear here. Curated by us, with some AI magic.
        </p>
      </div>
    `;
    elements.criterionSection.innerHTML = "";
    return;
  }

  elements.clearRecommendations.hidden = false;
  elements.resultsTitle.textContent = `${state.selectedFilm.title} leads to:`;
  const primaryRecommendations = state.recommendations.primary || [];
  const criterionRecommendations = state.recommendations.criterion || [];

  const orderedPrimaryRecommendations = [...primaryRecommendations].sort((left, right) => {
    const leftExpanded = state.expandedCardKey === cardKey("primary", left.title) ? 1 : 0;
    const rightExpanded = state.expandedCardKey === cardKey("primary", right.title) ? 1 : 0;
    return rightExpanded - leftExpanded;
  });

  elements.resultsGrid.innerHTML = orderedPrimaryRecommendations
    .map((item) => {
      const title = item.title;
      const metadata = metadataForTitle(title);
      const key = cardKey("primary", title);
      const expanded = state.expandedCardKey === key;
      const posterUrl = makePosterUrl(title);
      const posterMarkup = posterUrl
        ? `<img class="poster-image" src="${posterUrl}" alt="Poster for ${title}" loading="lazy" />`
        : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
      const letterboxdUrl = makeLetterboxdUrl(title);
      const letterboxdAverage = metadata?.average_rating || "Not available";
      const editorialBlurb = recommendationBlurbForPair(item.sourceFilm || state.selectedFilm.title, title);
      const reason = editorialBlurb?.blurb || reasonForRecommendation(item, state.selectedFilm);
      const availabilityPanel = renderAvailabilityPanel(title);
      const expandedPanel = expanded
        ? `
            <div class="card-expanded-panel">
              <div class="expanded-stats">
                <div class="expanded-stat">
                  <span class="expanded-stat-label">Average Letterboxd rating</span>
                  <strong>${letterboxdAverage}</strong>
                </div>
              </div>
              <div class="expanded-reason">
                <span class="expanded-reason-label">Why we think you'll like this</span>
                <p class="expanded-reason-copy">${reason}</p>
              </div>
              ${availabilityPanel}
              <p class="expanded-copy">${synopsisForTitle(title)}</p>
            </div>
          `
        : "";

      return `
        <article class="result-card ${expanded ? "result-card-expanded" : ""}">
          <div class="poster-block">
            ${posterMarkup}
          </div>
          <div class="card-body">
            <a class="card-title card-title-link" href="#results-title" data-open-title="${encodeURIComponent(title)}">${title}</a>
            ${expanded ? expandedPanel : ""}
            <div class="card-actions">
              <a class="card-link-button" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
              <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-card="${key}">
                ${expanded ? "See less" : "See more"}
              </button>
            </div>
          </div>
        </article>
      `
    })
    .join("");

  elements.resultsGrid.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => toggleExpandedCard(button.dataset.toggleCard));
  });

  elements.resultsGrid.querySelectorAll("[data-open-title]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openRecommendationsForTitle(decodeURIComponent(link.dataset.openTitle));
    });
  });

  if (!criterionRecommendations.length) {
    elements.criterionSection.innerHTML = "";
    return;
  }

  elements.criterionSection.innerHTML = `
    <div class="criterion-divider"></div>
    <div class="criterion-head">
      <div>
        <p class="eyebrow">Director's picks</p>
        <h3>${criterionRecommendations[0].criterionDirector}'s Criterion Closet picks</h3>
      </div>
      <p class="criterion-subtitle">
        Films picked in the Criterion Closet by the director of ${state.selectedFilm.title}.
      </p>
    </div>
    <div class="results-grid results-grid-secondary">
      ${[...criterionRecommendations]
        .sort((left, right) => {
          const leftExpanded = state.expandedCardKey === cardKey("criterion", left.title) ? 1 : 0;
          const rightExpanded = state.expandedCardKey === cardKey("criterion", right.title) ? 1 : 0;
          return rightExpanded - leftExpanded;
        })
        .map((item) => {
          const title = item.title;
          const metadata = metadataForTitle(title);
          const key = cardKey("criterion", title);
          const expanded = state.expandedCardKey === key;
          const posterUrl = makePosterUrl(title);
          const posterMarkup = posterUrl
            ? `<img class="poster-image" src="${posterUrl}" alt="Poster for ${title}" loading="lazy" />`
            : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
          const letterboxdUrl = makeLetterboxdUrl(title);
          const letterboxdAverage = metadata?.average_rating || "Not available";
          const editorialBlurb = recommendationBlurbForPair(item.sourceFilm || state.selectedFilm.title, title);
          const reason = editorialBlurb?.blurb || reasonForRecommendation(item, state.selectedFilm);
          const availabilityPanel = renderAvailabilityPanel(title);
          const expandedPanel = expanded
            ? `
                <div class="card-expanded-panel">
                  <div class="expanded-stats">
                    <div class="expanded-stat">
                      <span class="expanded-stat-label">Average Letterboxd rating</span>
                      <strong>${letterboxdAverage}</strong>
                    </div>
                  </div>
                  <div class="expanded-reason">
                    <span class="expanded-reason-label">Why we think you'll like this</span>
                    <p class="expanded-reason-copy">${reason}</p>
                  </div>
                  ${availabilityPanel}
                  <p class="expanded-copy">${synopsisForTitle(title)}</p>
                </div>
              `
            : "";

          return `
            <article class="result-card ${expanded ? "result-card-expanded" : ""}">
              <div class="poster-block">
                ${posterMarkup}
              </div>
              <div class="card-body">
                <a class="card-title card-title-link" href="#results-title" data-open-title="${encodeURIComponent(title)}">${title}</a>
                ${expanded ? expandedPanel : ""}
                <div class="card-actions">
                  <a class="card-link-button" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
                  <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-card="${key}">
                    ${expanded ? "See less" : "See more"}
                  </button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  elements.criterionSection.querySelectorAll("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => toggleExpandedCard(button.dataset.toggleCard));
  });

  elements.criterionSection.querySelectorAll("[data-open-title]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openRecommendationsForTitle(decodeURIComponent(link.dataset.openTitle));
    });
  });
}

function render() {
  if (isSavedPage) {
    renderSavedFilmsPage();
    return;
  }

  renderSearchResults();
  renderQuickPicks();
  renderDiscoveryBookmarks();
  renderRecommendations();
}

async function loadCuratedFilms() {
  try {
    const [filmsResponse, metadataResponse, blurbsResponse, tmdbResponse, sampleResponse, criterionResponse, availabilityResponse] = await Promise.all([
      fetch("./data/curated-films.json"),
      fetch("./data/film-metadata.json"),
      fetch("./data/recommendation-blurbs.json"),
      fetch("./data/tmdb-metadata.json"),
      fetch("./data/sample-movies.json"),
      fetch("./data/criterion-closet-picks.json"),
      fetch("./data/availability.json")
    ]);

    if (!filmsResponse.ok) {
      throw new Error(`HTTP ${filmsResponse.status}`);
    }

    if (metadataResponse.ok) {
      state.metadataByTitle = await metadataResponse.json();
    }

    if (blurbsResponse.ok) {
      state.recommendationBlurbsByPair = await blurbsResponse.json();
    }

    if (tmdbResponse.ok) {
      state.tmdbMetadataByTitle = await tmdbResponse.json();
    }

    if (sampleResponse.ok) {
      state.sampleMovies = (await sampleResponse.json()).map((movie) => ({
        ...movie,
        id: movie.id || titleToId(movie.title, movie.year)
      }));
    }

    if (criterionResponse.ok) {
      state.criterionClosetPicks = await criterionResponse.json();
    }

    if (availabilityResponse.ok) {
      state.availabilityByFilmId = await availabilityResponse.json();
    }

    const films = await filmsResponse.json();
    state.curatedSourceFilms = films.map((film) => ({
      ...film,
      manual_links: dedupeTitles(film.manual_links || []),
      graphOrigin: "source"
    }));
    state.curatedFilms = buildBidirectionalCuratedFilms(state.curatedSourceFilms);
    state.discoveryFilms = buildDiscoveryFilmCatalog();
    state.quickPicks = shuffleList(state.curatedSourceFilms).slice(0, 12);
  } catch (error) {
    state.error = "The curated film file could not be loaded. Make sure the local server is running.";
  } finally {
    state.loading = false;
    render();
  }
}

if (elements.movieSearch) {
  elements.movieSearch.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderSearchResults();
  });
}

if (elements.addFirstMatch) {
  elements.addFirstMatch.addEventListener("click", () => {
    const firstMatch = getSearchMatches()[0];
    if (!firstMatch) {
      return;
    }

    addFilm(firstMatch.film_id);
  });
}

if (elements.searchResults) {
  elements.searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-film]");
    if (!button) {
      return;
    }

    addFilm(button.dataset.addFilm);
  });
}

if (elements.directorList) {
  elements.directorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-pick]");
    if (!button) {
      return;
    }

    addFilm(button.dataset.quickPick);
  });
}

if (elements.resetDirector) {
  elements.resetDirector.addEventListener("click", () => {
    refreshQuickPicks();
  });
}

if (elements.clearRecommendations) {
  elements.clearRecommendations.addEventListener("click", () => {
    clearSelectedFilm();
  });
}

render();
loadCuratedFilms();
initRotatingFilmQuotes();
