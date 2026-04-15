const state = {
  curatedFilms: [],
  curatedSourceFilms: [],
  metadataByTitle: {},
  recommendationBlurbsByPair: {},
  tmdbMetadataByTitle: {},
  availabilityByFilmId: {},
  sampleMovies: [],
  criterionClosetPicks: [],
  query: "",
  selectedFilmId: null,
  selectedFilm: null,
  expandedCardKey: "",
  recommendations: [],
  loading: true,
  error: ""
};

const elements = {
  movieSearch: document.querySelector("#movie-search"),
  addFirstMatch: document.querySelector("#add-first-match"),
  searchResults: document.querySelector("#search-results"),
  directorList: document.querySelector("#director-list"),
  resetDirector: document.querySelector("#reset-director"),
  resultsGrid: document.querySelector("#results-grid"),
  criterionSection: document.querySelector("#criterion-section"),
  resultsTitle: document.querySelector("#results-title")
};

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

    function showQuote(index) {
      quoteEl.classList.remove("is-visible");

      window.setTimeout(() => {
        quoteEl.textContent = quotes[index];
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
  elements.movieSearch.value = "";
  render();
}

function clearSelectedFilm() {
  state.selectedFilmId = null;
  state.selectedFilm = null;
  state.expandedCardKey = "";
  state.recommendations = [];
  render();
}

function toggleExpandedCard(key) {
  state.expandedCardKey = state.expandedCardKey === key ? "" : key;
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
      <div class="empty-state">
        <h3>No curated match yet</h3>
        <p>Try another title from your left-hand column, or use one of the quick picks below.</p>
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
  return [...state.curatedSourceFilms]
    .sort((left, right) => {
      if (right.elliott_rating !== left.elliott_rating) {
        return right.elliott_rating - left.elliott_rating;
      }
      return right.manual_links.length - left.manual_links.length;
    })
    .slice(0, 12);
}

function renderQuickPicks() {
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

function monogramForTitle(title) {
  return title
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderRecommendations() {
  if (!state.selectedFilm) {
    elements.resultsTitle.textContent = "Recommendations";
    elements.resultsGrid.innerHTML = `
      <div class="empty-state recommendations-empty-state">
        <p>
          Select a film you've watched, and recommendations will appear here. Curated by us, with some AI magic.
        </p>
      </div>
    `;
    elements.criterionSection.innerHTML = "";
    return;
  }

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
            <div class="card-title">${title}</div>
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
                <div class="card-title">${title}</div>
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
}

function render() {
  renderSearchResults();
  renderQuickPicks();
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
  } catch (error) {
    state.error = "The curated film file could not be loaded. Make sure the local server is running.";
  } finally {
    state.loading = false;
    render();
  }
}

elements.movieSearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderSearchResults();
});

elements.addFirstMatch.addEventListener("click", () => {
  const firstMatch = getSearchMatches()[0];
  if (!firstMatch) {
    return;
  }

  addFilm(firstMatch.film_id);
});

elements.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-film]");
  if (!button) {
    return;
  }

  addFilm(button.dataset.addFilm);
});

elements.directorList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-pick]");
  if (!button) {
    return;
  }

  addFilm(button.dataset.quickPick);
});

elements.resetDirector.addEventListener("click", () => {
  clearSelectedFilm();
});

render();
loadCuratedFilms();
initRotatingFilmQuotes();
