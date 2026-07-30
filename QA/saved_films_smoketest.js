const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.SECOND_LOOK_ROOT || path.resolve(__dirname, "..");
const engine = require(path.join(ROOT, "lib", "recommendation-engine.js"));
const editorial = require(path.join(ROOT, "lib", "editorial-copy.js"));

class MockElement {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
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
      localStorage,
      SecondLookEngine: engine,
      SecondLookEditorial: editorial
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
  cardKey,
  metadataForTitle
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  const waitStart = Date.now();
  while (context.__savedFilmsHarness?.state?.loading) {
    if (Date.now() - waitStart > 5000) {
      throw new Error("Timed out waiting for app data to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

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

  const savedHarness = await createHarness({ page: "saved" });
  const savedIds = savedHarness.app.state.internalFilms
    .filter((film) => savedHarness.app.metadataForTitle(film.title)?.average_rating)
    .slice(0, 3)
    .map((film) => film.filmId);
  savedHarness.app.state.account.user = { id: "test-user", email: "test@example.com" };
  savedHarness.app.state.account.ready = true;
  savedHarness.app.state.account.loading = false;
  savedHarness.app.state.userProfile = engine.normalizeUserProfile(
    {
      ...engine.createEmptyUserProfile(),
      savedFilmIds: savedIds,
    },
    savedHarness.app.state.internalFilms
  );
  savedHarness.app.renderSavedFilmsPage();

  const savedListHtml = savedHarness.elementMap.get("#saved-films-list").innerHTML;
  const savedFilms = savedIds
    .map((filmId) => savedHarness.app.state.internalFilmById[filmId])
    .filter(Boolean);

  runCheck("Saved page renders account saved films in a compact list", () => {
    assert(savedListHtml.includes("saved-films-list"), "Saved films list container missing");
    assert.strictEqual((savedListHtml.match(/data-saved-toggle="/g) || []).length, 3);
    savedFilms.forEach((film) => {
      assert(savedListHtml.includes(film.title), `Missing saved film title ${film.title}`);
    });
  }, results);

  runCheck("Collapsed saved rows show title, year, director, and See more only", () => {
    assert(savedListHtml.includes("See more"), "Missing See more action");
    assert(!savedListHtml.includes("Average Letterboxd rating"), "Collapsed rows should not show expanded metadata");
    assert(!savedListHtml.includes("Why we think you’ll like this"), "Collapsed rows should not show expanded rationale");
    assert(!savedListHtml.includes("Search Criterion"), "Collapsed rows should not show availability links");
  }, results);

  const expandedKey = savedHarness.app.cardKey("saved", savedFilms[0].filmId);
  savedHarness.app.state.session.expandedCardKey = expandedKey;
  savedHarness.app.renderSavedFilmsPage();
  const expandedHtml = savedHarness.elementMap.get("#saved-films-list").innerHTML;

  runCheck("Saved page reuses the existing detail renderer for See more", () => {
    assert(expandedHtml.includes("Average Letterboxd rating"), "Expanded saved row missing rating");
    assert(expandedHtml.includes("Why we think you’ll like this"), "Expanded saved row missing rationale heading");
    assert(expandedHtml.includes("expanded-copy"), "Expanded saved row missing synopsis");
  }, results);

  const emptyHarness = await createHarness({ page: "saved" });
  emptyHarness.app.state.account.user = { id: "test-user", email: "test@example.com" };
  emptyHarness.app.state.account.ready = true;
  emptyHarness.app.state.account.loading = false;
  emptyHarness.app.state.userProfile = engine.normalizeUserProfile(engine.createEmptyUserProfile(), []);
  emptyHarness.app.renderSavedFilmsPage();
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
