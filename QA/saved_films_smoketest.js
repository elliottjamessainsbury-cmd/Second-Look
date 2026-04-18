const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = "/Users/elliott/Documents/New project";
const STORAGE_KEY = "secondlook:savedFilmIds";

class MockElement {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
    this.hidden = false;
    this.value = "";
    this.listeners = {};
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

function createLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    }
  };
}

async function createHarness({ page = "index", storageSeed = {} } = {}) {
  const selectors = [
    "#saved-films-list",
    "#movie-search",
    "#add-first-match",
    "#search-results",
    "#director-list",
    "#discovery-bookmarks",
    "#reset-director",
    "#clear-recommendations",
    "#results-grid",
    "#criterion-section",
    "#results-title"
  ];

  const elementMap = new Map(selectors.map((selector) => [selector, new MockElement(selector)]));
  const localStorage = createLocalStorage(storageSeed);

  const context = {
    console,
    window: {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      localStorage
    },
    document: {
      body: {
        classList: {
          contains(name) {
            return page === "saved" && name === "saved-page";
          }
        }
      },
      querySelector(selector) {
        if (page !== "saved" && selector === "#saved-films-list") {
          return null;
        }
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
globalThis.__savedFilmsHarness = {
  state,
  elements,
  renderSavedFilmsPage,
  renderDiscoveryGrid,
  toggleDiscoveryBookmark,
  cardKey
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });
  await new Promise((resolve) => setTimeout(resolve, 60));

  return {
    app: context.__savedFilmsHarness,
    elementMap,
    localStorage
  };
}

async function main() {
  console.log("Running saved films smoke test...");
  console.log("Flow: QA/flows/saved-films-page.md");
  console.log("");

  const results = [];

  const mainHarness = await createHarness({ page: "index" });
  const firstSavedId = mainHarness.app.state.discoveryFilms[0].id;
  const secondSavedId = mainHarness.app.state.discoveryFilms[1].id;
  const thirdSavedId = mainHarness.app.state.discoveryFilms[2].id;

  mainHarness.app.toggleDiscoveryBookmark(firstSavedId);
  mainHarness.app.toggleDiscoveryBookmark(secondSavedId);
  mainHarness.app.toggleDiscoveryBookmark(thirdSavedId);
  const persistedIds = JSON.parse(mainHarness.localStorage.dump()[STORAGE_KEY]);

  runCheck("Bookmarking from the main app persists ids to localStorage in most-recent-first order", () => {
    assert.deepStrictEqual(persistedIds.slice(0, 3), [thirdSavedId, secondSavedId, firstSavedId]);
  }, results);

  const savedHarness = await createHarness({
    page: "saved",
    storageSeed: {
      [STORAGE_KEY]: JSON.stringify(persistedIds)
    }
  });

  const savedListHtml = savedHarness.elementMap.get("#saved-films-list").innerHTML;
  const savedFilms = persistedIds
    .map((filmId) => savedHarness.app.state.discoveryFilms.find((film) => film.id === filmId))
    .filter(Boolean);

  runCheck("Saved page renders the same saved films in a compact list", () => {
    assert(savedListHtml.includes("saved-films-list"), "Saved films list container missing");
    assert.strictEqual((savedListHtml.match(/data-saved-film="/g) || []).length, 3);
    savedFilms.forEach((film) => {
      assert(savedListHtml.includes(film.title), `Missing saved film title ${film.title}`);
    });
  }, results);

  runCheck("Collapsed saved rows show title, year, director, and See more only", () => {
    assert(savedListHtml.includes("See more"), "Missing See more action");
    assert(!savedListHtml.includes("Average Letterboxd rating"), "Collapsed rows should not show expanded metadata");
    assert(!savedListHtml.includes("AI take on the fit"), "Collapsed rows should not show expanded rationale");
    assert(!savedListHtml.includes("Search Criterion"), "Collapsed rows should not show availability links");
  }, results);

  const expandedKey = savedHarness.app.cardKey("saved", savedFilms[0].title);
  savedHarness.app.state.expandedCardKey = expandedKey;
  savedHarness.app.renderSavedFilmsPage();
  const expandedHtml = savedHarness.elementMap.get("#saved-films-list").innerHTML;

  runCheck("Saved page reuses the existing detail renderer for See more", () => {
    assert(expandedHtml.includes("Average Letterboxd rating"), "Expanded saved row missing rating");
    assert(expandedHtml.includes("AI take on the fit"), "Expanded saved row missing rationale heading");
    assert(expandedHtml.includes("expanded-copy"), "Expanded saved row missing synopsis");
  }, results);

  const emptyHarness = await createHarness({
    page: "saved",
    storageSeed: {
      [STORAGE_KEY]: JSON.stringify([])
    }
  });
  const emptyHtml = emptyHarness.elementMap.get("#saved-films-list").innerHTML;

  runCheck("Saved page shows a clean empty state when no films are saved", () => {
    assert(emptyHtml.includes("No saved films yet"), "Empty state title missing");
    assert(emptyHtml.includes("Back to discovery"), "Empty state back link missing");
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
