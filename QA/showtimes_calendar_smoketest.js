const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.SECOND_LOOK_ROOT || path.resolve(__dirname, "..");
const engine = require(path.join(ROOT, "lib", "recommendation-engine.js"));
const editorial = require(path.join(ROOT, "lib", "editorial-copy.js"));
const FIXED_NOW = new Date("2026-07-29T11:00:00.000Z");

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [FIXED_NOW.getTime()]));
  }

  static now() {
    return FIXED_NOW.getTime();
  }
}

FixedDate.UTC = Date.UTC;
FixedDate.parse = Date.parse;

class MockElement {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.value = "";
    this.listeners = {};
    this.attributes = {};
    this.style = {
      setProperty() {}
    };
    this.classList = {
      toggle() {}
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  scrollIntoView() {}
}

function createLocalStorage() {
  const map = new Map();

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
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
  return (text.match(pattern) || []).length;
}

function extractCinemaNames(html) {
  return Array.from(html.matchAll(/cinema-showtimes-card__cinema-name">([^<]+)</g)).map((match) => match[1]);
}

async function createHarness() {
  const selectors = [
    "#movie-search",
    "#add-first-match",
    "#search-results",
    "#director-list",
    "#selected-seeds",
    "#discovery-bookmarks",
    "#reset-director",
    "#clear-recommendations",
    "#results-grid",
    "#criterion-section",
    "#results-title",
    "#cinema-showtimes-section",
    "#cinema-showtimes-title",
    "#cinema-showtimes-calendar",
    "#cinema-showtimes-list",
    "#cinema-showtimes-cinema-filter",
    "#cinema-showtimes-intro",
    "#cinema-showtimes-updated",
    "#cinema-showtimes-month",
    "#cinema-showtimes-today",
    "#cinema-showtimes-selection"
  ];
  const elementMap = new Map(selectors.map((selector) => [selector, new MockElement(selector)]));

  const context = {
    console,
    Date: FixedDate,
    window: {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      localStorage: createLocalStorage(),
      SecondLookEngine: engine,
      SecondLookEditorial: editorial
    },
    document: {
      body: {
        classList: {
          contains() {
            return false;
          }
        }
      },
      querySelector(selector) {
        return elementMap.get(selector) || null;
      },
      getElementById() {
        return null;
      }
    },
    fetch: async (url) => {
      const filePath = path.join(ROOT, url.replace(/^\.?\//, ""));
      const text = await fs.promises.readFile(filePath, "utf8");
      return {
        ok: true,
        status: 200,
        async json() {
          return JSON.parse(text);
        }
      };
    }
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
  londonTodayDate,
  filterPastShowtimesForDay
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  const waitStart = Date.now();
  while (!context.__showtimesHarness?.state?.cinemaShowtimes?.days?.length) {
    if (Date.now() - waitStart > 5000) {
      throw new Error("Timed out waiting for cinema showtimes to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    app: context.__showtimesHarness,
    elementMap
  };
}

async function main() {
  console.log("Running showtimes calendar smoke test...");
  console.log("Flow: QA/flows/showtimes-calendar-view.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];

  app.renderCinemaShowtimes();
  const calendarElement = elementMap.get("#cinema-showtimes-calendar");
  const listElement = elementMap.get("#cinema-showtimes-list");
  const filterElement = elementMap.get("#cinema-showtimes-cinema-filter");
  const selectionElement = elementMap.get("#cinema-showtimes-selection");
  const todayElement = elementMap.get("#cinema-showtimes-today");

  runCheck("Calendar renders seven date buttons", () => {
    assert.strictEqual(countMatches(calendarElement.innerHTML, /data-cinema-date="/g), 7);
    assert(calendarElement.innerHTML.includes('aria-pressed="true"'), "Selected day is not marked pressed");
  }, results);

  runCheck("Selected day renders listing cards and selection summary", () => {
    const selectedDay = app.getSelectedShowtimesDay();
    const expectedCount = app.getCalendarFilmsForDay(selectedDay).length;
    assert(selectionElement.textContent.includes(`${expectedCount} film`), "Selection summary missing selected day count");
    if (expectedCount) {
      assert(listElement.innerHTML.includes("cinema-showtimes-card"), "Expected listing cards for selected day");
    }
  }, results);

  runCheck("Changing the selected date updates the visible listings", () => {
    const days = app.getUpcomingShowtimeDays();
    const alternateDay = days.find((day) => day.date !== app.state.selectedCinemaShowtimesDate);
    assert(alternateDay, "No alternate day available");
    app.state.selectedCinemaShowtimesDate = alternateDay.date;
    app.state.selectedCinemaShowtimesCinema = "";
    app.renderCinemaShowtimes();

    const expectedCount = app.getCalendarFilmsForDay(alternateDay).length;
    assert(calendarElement.innerHTML.includes(`data-cinema-date="${alternateDay.date}" aria-pressed="true"`), "Alternate day was not selected");
    assert(selectionElement.textContent.includes(`${expectedCount} film`), "Selection summary did not update");
  }, results);

  runCheck("Cinema filter options populate from upcoming showtimes", () => {
    assert(filterElement.innerHTML.includes("<option value=\"\">All cinemas</option>"), "All cinemas option missing");
    assert(countMatches(filterElement.innerHTML, /<option value="/g) > 1, "Cinema options missing");
  }, results);

  runCheck("Cinema filter narrows cards to one cinema", () => {
    const days = app.getUpcomingShowtimeDays();
    const dayWithCinemas = days.find((day) => {
      const cinemas = new Set((day.films || []).map((film) => film.cinema).filter(Boolean));
      return cinemas.size >= 2;
    });
    assert(dayWithCinemas, "No day with multiple cinemas available");
    const targetCinema = (dayWithCinemas.films || []).find((film) => film.cinema)?.cinema;
    assert(targetCinema, "No target cinema found");

    app.state.selectedCinemaShowtimesDate = dayWithCinemas.date;
    app.state.selectedCinemaShowtimesCinema = targetCinema;
    app.renderCinemaShowtimes();

    const expectedFilms = app.getCalendarFilmsForDay(dayWithCinemas);
    const renderedCinemas = extractCinemaNames(listElement.innerHTML);
    assert(expectedFilms.length > 0, "Filtered cinema produced no fixture films");
    assert.strictEqual(renderedCinemas.length, expectedFilms.length, "Rendered card count did not match filtered films");
    assert(renderedCinemas.every((cinema) => cinema === targetCinema), "A non-matching cinema remained after filtering");
  }, results);

  runCheck("No-results filter combination renders graceful empty state", () => {
    const days = app.getUpcomingShowtimeDays();
    const allCinemas = new Set(days.flatMap((day) => (day.films || []).map((film) => film.cinema).filter(Boolean)));
    const pair = days
      .map((day) => {
        const dayCinemas = new Set((day.films || []).map((film) => film.cinema).filter(Boolean));
        const absentCinema = Array.from(allCinemas).find((cinema) => !dayCinemas.has(cinema));
        return absentCinema ? { day, absentCinema } : null;
      })
      .filter(Boolean)[0];
    assert(pair, "No valid cross-day cinema filter could produce an empty selected day");

    app.state.selectedCinemaShowtimesDate = pair.day.date;
    app.state.selectedCinemaShowtimesCinema = pair.absentCinema;
    app.renderCinemaShowtimes();

    assert(listElement.innerHTML.includes("No screenings match"), "No-results empty state missing");
    assert(!listElement.innerHTML.includes("cinema-showtimes-card"), "Cards remained in no-results state");
  }, results);

  runCheck("Mapped and unmapped cinema logo paths both render safely", () => {
    app.state.selectedCinemaShowtimesDate = app.getUpcomingShowtimeDays()[0].date;
    app.state.selectedCinemaShowtimesCinema = "";
    app.renderCinemaShowtimes();

    assert(
      listElement.innerHTML.includes("cover_garden_cinema_logo") ||
        listElement.innerHTML.includes("BFI Southbank logo") ||
        listElement.innerHTML.includes("Prince Charles Cinema logo"),
      "Expected a mapped cinema logo"
    );
    assert(
      listElement.innerHTML.includes("cinema-showtimes-card__logo-fallback") || listElement.innerHTML.includes("ICA"),
      "Expected an unmapped cinema fallback or fixture cinema"
    );
  }, results);

  runCheck("Empty showtimes dataset renders unavailable state", () => {
    const originalShowtimes = app.state.cinemaShowtimes;
    app.state.cinemaShowtimes = { generatedAt: "", days: [] };
    app.renderCinemaShowtimes();

    assert.strictEqual(calendarElement.innerHTML, "", "Calendar should clear for empty data");
    assert(listElement.innerHTML.includes("No cinema showtimes available yet"), "Unavailable empty state missing");
    app.state.cinemaShowtimes = originalShowtimes;
    app.renderCinemaShowtimes();
  }, results);

  runCheck("Today filter removes past HH:MM showtimes", () => {
    const today = app.londonTodayDate();
    const fixtureDay = {
      date: today,
      films: [
        { displayTitle: "Past Only", cinema: "Test Cinema", showtimes: ["00:01"] },
        { displayTitle: "Time TBC", cinema: "Test Cinema", showtimes: ["Time TBC"] },
      ],
    };
    const filtered = app.filterPastShowtimesForDay(fixtureDay);
    assert(!filtered.some((film) => film.displayTitle === "Past Only"), "Past showtime was retained");
    assert(filtered.some((film) => film.displayTitle === "Time TBC"), "Non-HH:MM time should be retained");
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
