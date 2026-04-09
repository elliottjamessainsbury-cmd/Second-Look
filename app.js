const state = {
  curatedFilms: [],
  metadataByTitle: {},
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
  selectedMovies: document.querySelector("#selected-movies"),
  directorList: document.querySelector("#director-list"),
  resetDirector: document.querySelector("#reset-director"),
  clearSelections: document.querySelector("#clear-selections"),
  resultsGrid: document.querySelector("#results-grid"),
  criterionSection: document.querySelector("#criterion-section"),
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
  const curatedMatches = state.curatedFilms
    .filter((film) => normalize(film.title).includes(needle))
    .map((film) => ({
      ...film,
      sourceType: "curated"
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

function directorForTitle(title) {
  const metadata = metadataForTitle(title);
  if (metadata?.director) {
    return metadata.director;
  }

  const matchedSample = byTitle(state.sampleMovies, title);
  return matchedSample?.director || "";
}

function makeJustWatchUrl(title) {
  return `https://www.justwatch.com/uk/search?q=${encodeURIComponent(title)}`;
}

function makeLetterboxdUrl(title) {
  const metadata = metadataForTitle(title);
  return metadata?.letterboxd_url || `https://letterboxd.com/search/films/${encodeURIComponent(title)}/`;
}

function cardKey(section, title) {
  return `${section}:${normalize(title)}`;
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

    const linkedDirector = directorForTitle(title);
    if (linkedDirector) {
      directorNames.add(linkedDirector);
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
            <div class="match-meta">${
              film.sourceType === "curated"
                ? `${film.year} • Curated source film${film.elliott_rating ? ` • Elliott rating ${film.elliott_rating}/5` : ""}`
                : `${film.year} • Original similarity engine`
            }</div>
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
    elements.resultsTitle.textContent = "Recommendations";
    elements.resultsSubtitle.textContent =
      "Once you've chosen a film, you'll find recommendations here.";
    elements.resultsGrid.innerHTML = `
      <div class="empty-state">
        <h3>Start from one film</h3>
        <p>
          Search for a title you mapped manually and we’ll return the companion films you chose for it.
        </p>
      </div>
    `;
    elements.criterionSection.innerHTML = "";
    return;
  }

  elements.resultsTitle.textContent = `${state.selectedFilm.title} leads to:`;
  const primaryRecommendations = state.recommendations.primary || [];
  const criterionRecommendations = state.recommendations.criterion || [];
  const manualCount = state.selectedFilm.manual_links.length;
  const discoverCount = primaryRecommendations.filter((item) => item.kind === "discovery").length;
  if (manualCount > 0) {
    elements.resultsSubtitle.textContent =
      `${manualCount} hand-picked recommendation` +
      `${manualCount === 1 ? "" : "s"} from your “Would also like” column` +
      (discoverCount ? `, plus ${discoverCount} extra picks from the original similarity engine.` : ".");
  } else if (discoverCount > 0) {
    elements.resultsSubtitle.textContent =
      `${discoverCount} recommendation${discoverCount === 1 ? "" : "s"} from the original similarity engine.`;
  } else {
    elements.resultsSubtitle.textContent =
      "No hand-curated links for this title yet, but you can still browse related director picks below when available.";
  }

  elements.resultsGrid.innerHTML = primaryRecommendations
    .map((item) => {
      const title = item.title;
      const metadata = metadataForTitle(title);
      const key = cardKey("primary", title);
      const expanded = state.expandedCardKey === key;
      const posterMarkup = metadata?.poster_url
        ? `<img class="poster-image" src="${metadata.poster_url}" alt="Poster for ${title}" loading="lazy" />`
        : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
      const letterboxdUrl = makeLetterboxdUrl(title);
      const justWatchUrl = makeJustWatchUrl(title);
      const letterboxdAverage = metadata?.average_rating || "Not available";
      const rottenTomatoesRating = "Not available";
      const expandedPanel = expanded
        ? `
            <div class="card-expanded-panel">
              <div class="expanded-stats">
                <div class="expanded-stat">
                  <span class="expanded-stat-label">Average Letterboxd rating</span>
                  <strong>${letterboxdAverage}</strong>
                </div>
                <div class="expanded-stat">
                  <span class="expanded-stat-label">Rotten Tomatoes</span>
                  <strong>${rottenTomatoesRating}</strong>
                </div>
              </div>
              <p class="expanded-copy">${metadata?.intro || "No extended synopsis available yet."}</p>
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
            <div class="card-actions">
              <a class="card-link-button" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
              <a class="card-link-button card-link-button-secondary" href="${justWatchUrl}" target="_blank" rel="noreferrer">Where to watch it</a>
              <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-card="${key}">
                ${expanded ? "See less" : "See more"}
              </button>
            </div>
            ${expandedPanel}
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
        <p class="eyebrow">Director's Picks</p>
        <h3>${criterionRecommendations[0].criterionDirector}'s Criterion Closet picks</h3>
      </div>
      <p class="criterion-subtitle">
        Films picked in the Criterion Closet by the director of ${state.selectedFilm.title}.
      </p>
    </div>
    <div class="results-grid results-grid-secondary">
      ${criterionRecommendations
        .map((item) => {
          const title = item.title;
          const metadata = metadataForTitle(title);
          const key = cardKey("criterion", title);
          const expanded = state.expandedCardKey === key;
          const posterMarkup = metadata?.poster_url
            ? `<img class="poster-image" src="${metadata.poster_url}" alt="Poster for ${title}" loading="lazy" />`
            : `<div class="poster-monogram">${monogramForTitle(title)}</div>`;
          const letterboxdUrl = makeLetterboxdUrl(title);
          const justWatchUrl = makeJustWatchUrl(title);
          const letterboxdAverage = metadata?.average_rating || "Not available";
          const rottenTomatoesRating = "Not available";
          const expandedPanel = expanded
            ? `
                <div class="card-expanded-panel">
                  <div class="expanded-stats">
                    <div class="expanded-stat">
                      <span class="expanded-stat-label">Average Letterboxd rating</span>
                      <strong>${letterboxdAverage}</strong>
                    </div>
                    <div class="expanded-stat">
                      <span class="expanded-stat-label">Rotten Tomatoes</span>
                      <strong>${rottenTomatoesRating}</strong>
                    </div>
                  </div>
                  <p class="expanded-copy">${metadata?.intro || "No extended synopsis available yet."}</p>
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
                <div class="card-actions">
                  <a class="card-link-button" href="${letterboxdUrl}" target="_blank" rel="noreferrer">See Letterboxd reviews</a>
                  <a class="card-link-button card-link-button-secondary" href="${justWatchUrl}" target="_blank" rel="noreferrer">Where to watch it</a>
                  <button class="card-link-button card-link-button-tertiary" type="button" data-toggle-card="${key}">
                    ${expanded ? "See less" : "See more"}
                  </button>
                </div>
                ${expandedPanel}
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
  renderSelectedFilm();
  renderQuickPicks();
  renderRecommendations();
}

async function loadCuratedFilms() {
  try {
    const [filmsResponse, metadataResponse, sampleResponse, criterionResponse] = await Promise.all([
      fetch("./data/curated-films.json"),
      fetch("./data/film-metadata.json"),
      fetch("./data/sample-movies.json"),
      fetch("./data/criterion-closet-picks.json")
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

    if (criterionResponse.ok) {
      state.criterionClosetPicks = await criterionResponse.json();
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

render();
loadCuratedFilms();
