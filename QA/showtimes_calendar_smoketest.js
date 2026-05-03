const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = "/Users/elliott/Documents/New project";
const engine = require(path.join(ROOT, "lib", "recommendation-engine.js"));
const editorial = require(path.join(ROOT, "lib", "editorial-copy.js"));

class MockElement {
  constructor(id = "") {
    this.id = id;
    this._innerHTML = "";
    this.hidden = false;
    this.value = "";
    this.listeners = {};
    this.attributes = {};
    this._queryCache = new Map();
    this.style = {
      setProperty() {},
    };
    this.classList = {
      toggle() {},
      contains() {
        return false;
      },
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this._queryCache.clear();
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  scrollIntoView() {}

  querySelectorAll(selector) {
    if (this._queryCache.has(selector)) {
      return this._queryCache.get(selector);
    }

    let matches = [];
    if (selector === "[data-cinema-date]") {
      matches = Array.from(this._innerHTML.matchAll(/data-cinema-date="([^"]+)"/g)).map((match) => {
        const button = new MockElement("calendar-button");
        button.dataset = { cinemaDate: match[1] };
        return button;
      });
    }

    this._queryCache.set(selector, matches);
    return matches;
  }

  querySelector() {
    return null;
  }
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

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function createHarness() {
  const selectors = [
    ".hero-copy",
    "#movie-search",
    "#add-first-match",
    "#search-results",
    "#director-list",
    "#selected-seeds",
    "#discovery-bookmarks",
    "#reset-director",
    "#reset-filters",
    "#clear-recommendations",
    "#results-grid",
    "#browse-summary",
    "#browse-platform-filter",
    "#browse-format-filter",
    "#browse-genre-filter",
    "#browse-mood-filter",
    "#criterion-section",
    "#results-title",
    "#saved-films-list",
    "#cinema-showtimes-section",
    "#cinema-showtimes-title",
    "#cinema-showtimes-calendar",
    "#cinema-showtimes-list",
    "#cinema-showtimes-cinema-filter",
    "#cinema-showtimes-intro",
    "#cinema-showtimes-updated",
    "#cinema-showtimes-month",
    "#cinema-showtimes-today",
    "#cinema-showtimes-selection",
  ];

  const elementMap = new Map(selectors.map((selector) => [selector, new MockElement(selector)]));

  const context = {
    console,
    window: {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
      },
      SecondLookEngine: engine,
      SecondLookEditorial: editorial,
    },
    document: {
      body: {
        classList: {
          contains() {
            return false;
          },
        },
      },
      querySelector(selector) {
        return elementMap.get(selector) || new MockElement(selector);
      },
      getElementById() {
        return null;
      },
    },
    fetch: async (url) => {
      const filePath = path.join(ROOT, url.replace(/^\.?\//, ""));
      const text = await fs.promises.readFile(filePath, "utf8");
      return {
        ok: true,
        status: 200,
        async json() {
          return JSON.parse(text);
        },
      };
    },
  };
  context.globalThis = context;

  const source = await fs.promises.readFile(path.join(ROOT, "app.js"), "utf8");
  const wrapped = `${source}
globalThis.__showtimesHarness = {
  state,
  elements,
  renderCinemaShowtimes,
  getUpcomingShowtimeDays,
  getSelectedShowtimesDay,
  getCalendarFilmsForDay,
  formatShowtimesDate,
  londonTodayDate
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  const waitStart = Date.now();
  while (context.__showtimesHarness?.state?.loading) {
    if (Date.now() - waitStart > 5000) {
      throw new Error("Timed out waiting for app data to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const showtimeWaitStart = Date.now();
  while (!(context.__showtimesHarness?.state?.cinemaShowtimes?.days || []).length) {
    if (Date.now() - showtimeWaitStart > 5000) {
      throw new Error("Timed out waiting for cinema showtimes data to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    app: context.__showtimesHarness,
    elementMap,
  };
}

function findDistinctUpcomingDays(days) {
  const daysWithFilms = days.filter((day) => Array.isArray(day.films) && day.films.length);
  if (daysWithFilms.length < 2) {
    return [daysWithFilms[0] || null, null];
  }

  const first = daysWithFilms[0];
  const firstTitles = new Set(first.films.map((film) => film.displayTitle));
  const second =
    daysWithFilms.find((day) => day.date !== first.date && day.films.some((film) => !firstTitles.has(film.displayTitle))) ||
    daysWithFilms[1];

  return [first, second];
}

async function main() {
  console.log("Running showtimes calendar smoke test...");
  console.log("Flow: QA/flows/showtimes-calendar-view.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];
  const calendarElement = elementMap.get("#cinema-showtimes-calendar");
  const listElement = elementMap.get("#cinema-showtimes-list");
  const selectionElement = elementMap.get("#cinema-showtimes-selection");

  app.state.selectedCinemaShowtimesCinema = "";
  app.renderCinemaShowtimes();

  const upcomingDays = app.getUpcomingShowtimeDays();
  const [firstDay, secondDay] = findDistinctUpcomingDays(upcomingDays);

  runCheck("Calendar renders a strict seven-day upcoming window", () => {
    assert.strictEqual(upcomingDays.length, 7, `Expected 7 upcoming days, got ${upcomingDays.length}`);
    assert.strictEqual(upcomingDays[0].date, app.londonTodayDate());
    assert.strictEqual(calendarElement.querySelectorAll("[data-cinema-date]").length, 7);
  }, results);

  runCheck("Each calendar day button is wired for date selection", () => {
    const buttons = calendarElement.querySelectorAll("[data-cinema-date]");
    assert(buttons.length >= 2, "Expected at least two day buttons");
    buttons.forEach((button) => {
      assert(typeof button.listeners.click === "function", `Missing click handler for ${button.dataset.cinemaDate}`);
    });
  }, results);

  runCheck("Picking a date renders all films for that date below the calendar", () => {
    assert(firstDay, "No populated calendar day found");
    const firstButton = calendarElement
      .querySelectorAll("[data-cinema-date]")
      .find((button) => button.dataset.cinemaDate === firstDay.date);
    assert(firstButton, `No calendar button found for ${firstDay.date}`);

    firstButton.listeners.click();

    const renderedCardCount = countMatches(listElement.innerHTML, /<article class="cinema-showtimes-card\b/g);
    assert.strictEqual(renderedCardCount, firstDay.films.length, `Expected ${firstDay.films.length} cards, got ${renderedCardCount}`);
    firstDay.films.forEach((film) => {
      assert(listElement.innerHTML.includes(escapeHtml(film.displayTitle)), `Missing rendered title for ${film.displayTitle}`);
    });
    assert(String(selectionElement.textContent || "").includes(app.formatShowtimesDate(firstDay.date)));
  }, results);

  runCheck("Changing the selected date swaps the listing set to that day", () => {
    assert(secondDay, "No second populated calendar day found");
    const secondButton = calendarElement
      .querySelectorAll("[data-cinema-date]")
      .find((button) => button.dataset.cinemaDate === secondDay.date);
    assert(secondButton, `No calendar button found for ${secondDay.date}`);

    secondButton.listeners.click();

    const renderedCardCount = countMatches(listElement.innerHTML, /<article class="cinema-showtimes-card\b/g);
    assert.strictEqual(renderedCardCount, secondDay.films.length, `Expected ${secondDay.films.length} cards, got ${renderedCardCount}`);
    secondDay.films.forEach((film) => {
      assert(listElement.innerHTML.includes(escapeHtml(film.displayTitle)), `Missing rendered title for ${film.displayTitle}`);
    });
    assert(String(selectionElement.textContent || "").includes(app.formatShowtimesDate(secondDay.date)));
    assert.strictEqual(app.state.selectedCinemaShowtimesDate, secondDay.date);
  }, results);

  printResults(results);

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
