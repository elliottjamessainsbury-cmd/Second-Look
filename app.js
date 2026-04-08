const state = {
  curatedFilms: [],
  metadataByTitle: {},
  sampleMovies: [],
  query: "",
  selectedFilmId: null,
  selectedFilm: null,
  recommendations: [],
  loading: true,
  error: ""
};

const elements = {
  movieSearch: document.querySelector("#movie-search"),
  addFirstMatch: document.querySelector("#add-first-match"),
  searchResults: document.querySelector("#search-results"),
  selectedMovies: document.querySelector("#selected-movies"),
  directorList: document.querySelector("#director-list"),
  resetDirector: document.querySelector("#reset-director"),
  clearSelections: document.querySelector("#clear-selections"),
  recommendButton: document.querySelector("#recommend-button"),
  resultsGrid: document.querySelector("#results-grid"),
  resultsTitle: document.querySelector("#results-title"),
  resultsSubtitle: document.querySelector("#results-subtitle")
};

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
  return state.curatedFilms
    .filter((film) => normalize(film.title).includes(needle))
    .slice(0, 8);
}

function metadataForTitle(title) {
  return state.metadataByTitle[title] || null;
}

function titleToId(title, year) {
  return normalize(`${title}-${year || ""}`).replace(/\s+/g, "-");
}

function byTitle(movies, title) {
  const needle = normalize(title);
  return movies.find((movie) => normalize(movie.title) === needle) || null;
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
  const curatedCards = manualTitles.map((title, index) => ({
    kind: "curated",
    title,
    rankLabel: `PICK ${index + 1}`,
    sourceFilm: selectedFilm.title
  }));

  const sampleSeeds = [];
  const selectedAsSample = byTitle(state.sampleMovies, selectedFilm.title);
  if (selectedAsSample) {
    sampleSeeds.push(selectedAsSample);
  }

  manualTitles.forEach((title) => {
    const matched = byTitle(state.sampleMovies, title);
    if (matched && !sampleSeeds.some((movie) => movie.id === matched.id)) {
      sampleSeeds.push(matched);
    }
  });

  if (sampleSeeds.length === 0) {
    return curatedCards;
  }

  const profile = collectWeightedProfile(sampleSeeds);
  const blockedTitles = new Set([selectedFilm.title, ...manualTitles].map(normalize));

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

  return [...curatedCards, ...discoveryCards];
}

function addFilm(filmId) {
  const film = state.curatedFilms.find((item) => item.film_id === filmId);
  if (!film) {
    return;
  }

  state.selectedFilmId = filmId;
  state.selectedFilm = film;
  state.recommendations = getHybridRecommendations(film);
  state.query = "";
  elements.movieSearch.value = "";
  render();
}

function clearSelectedFilm() {
  state.selectedFilmId = null;
  state.selectedFilm = null;
  state.recommendations = [];
  render();
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
            <div class="match-meta">${film.year} • Elliott rating ${film.elliott_rating}/5</div>
          </div>
          <button type="button" data-add-film="${film.film_id}">Use this</button>
        </div>
      `
    )
    .join("");
}

function renderSelectedFilm() {
  if (!state.selectedFilm) {
    elements.selectedMovies.innerHTML = `
      <div class="empty-state">
        <h3>No film selected</h3>
        <p>Search for the films you love.</p>
      </div>
    `;
    return;
  }

  elements.selectedMovies.innerHTML = `
    <div class="movie-chip">
      <span><strong>${state.selectedFilm.title}</strong> (${state.selectedFilm.year})</span>
      <button class="chip-remove" type="button" aria-label="Remove ${state.selectedFilm.title}" data-clear-selected="true">
        ×
      </button>
    </div>
  `;
}

function getQuickPicks() {
  return [...state.curatedFilms]
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
    elements.resultsTitle.textContent = "Your hand-picked recommendation graph";
    elements.resultsSubtitle.textContent =
      "Choose a curated source film and the app will return the titles from your “Would also like” column.";
    elements.resultsGrid.innerHTML = `
      <div class="empty-state">
        <h3>Start from one film</h3>
        <p>
          This version uses your own curation directly. Search for a title you mapped manually and we’ll return
          the companion films you chose for it.
        </p>
      </div>
    `;
    return;
  }

  elements.resultsTitle.textContent = `${state.selectedFilm.title} leads to:`;
  const discoverCount = state.recommendations.filter((item) => item.kind === "discovery").length;
  elements.resultsSubtitle.textContent =
    `${state.selectedFilm.manual_links.length} hand-picked recommendation` +
    `${state.selectedFilm.manual_links.length === 1 ? "" : "s"} from your “Would also like” column` +
    (discoverCount ? `, plus ${discoverCount} extra picks from the original similarity engine.` : ".");

  elements.resultsGrid.innerHTML = state.recommendations
    .map((item, index) => {
      const title = item.title;
      const metadata = metadataForTitle(title);
      const posterMarkup = metadata?.poster_url
        ? `<img class="poster-image" src="${metadata.poster_url}" alt="Poster for ${title}" loading="lazy" />`
        : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
      const detailLine = [metadata?.year, metadata?.director].filter(Boolean).join(" • ");
      const intro =
        metadata?.intro ||
        (item.kind === "curated"
          ? "This title comes straight from your own curation sheet rather than from an automated similarity score."
          : "This extra pick comes from the original similarity engine using themes, tone, era, and editorial links.");

      return `
        <article class="result-card">
          <div class="poster-block">
            <div class="score-badge">${item.kind === "curated" ? `PICK ${index + 1}` : item.rankLabel}</div>
            ${posterMarkup}
          </div>
          <div class="card-body">
            <div class="card-title">${title}</div>
            <div class="card-subtitle">${
              detailLine || (item.kind === "curated"
                ? `Hand-picked from ${state.selectedFilm.title}`
                : `Similarity pick from ${state.selectedFilm.title}`)
            }</div>
            <p class="card-reason">${intro}</p>
            <div class="card-footer">
              <span class="footer-pill">${item.kind === "curated" ? "manual curation" : "similarity engine"}</span>
              <span class="footer-pill">source film: ${state.selectedFilm.title}</span>
              <span class="footer-pill">rating ${state.selectedFilm.elliott_rating}/5</span>
            </div>
          </div>
        </article>
      `
    })
    .join("");
}

function render() {
  renderSearchResults();
  renderSelectedFilm();
  renderQuickPicks();
  renderRecommendations();
}

async function loadCuratedFilms() {
  try {
    const [filmsResponse, metadataResponse, sampleResponse] = await Promise.all([
      fetch("./data/curated-films.json"),
      fetch("./data/film-metadata.json"),
      fetch("./data/sample-movies.json")
    ]);

    if (!filmsResponse.ok) {
      throw new Error(`HTTP ${filmsResponse.status}`);
    }

    const films = await filmsResponse.json();
    state.curatedFilms = films;

    if (metadataResponse.ok) {
      state.metadataByTitle = await metadataResponse.json();
    }

    if (sampleResponse.ok) {
      state.sampleMovies = (await sampleResponse.json()).map((movie) => ({
        ...movie,
        id: movie.id || titleToId(movie.title, movie.year)
      }));
    }
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

elements.selectedMovies.addEventListener("click", (event) => {
  const button = event.target.closest("[data-clear-selected]");
  if (!button) {
    return;
  }

  clearSelectedFilm();
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

elements.clearSelections.addEventListener("click", () => {
  clearSelectedFilm();
});

elements.recommendButton.addEventListener("click", () => {
  if (!state.selectedFilm) {
    const firstMatch = getSearchMatches()[0];
    if (firstMatch) {
      addFilm(firstMatch.film_id);
    }
  }

  elements.resultsGrid.scrollIntoView({ behavior: "smooth", block: "start" });
});

render();
loadCuratedFilms();
