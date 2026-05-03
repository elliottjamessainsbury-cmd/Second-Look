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
    this.innerHTML = "";
    this.hidden = false;
    this.value = "";
    this.listeners = {};
    this.attributes = {};
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

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  scrollIntoView() {}

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

function extractOptions(markup) {
  return Array.from(String(markup || "").matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g))
    .map((match) => ({
      value: match[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
      label: match[2]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    }))
    .filter((option) => option.value);
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
    "#browse-platform-filter-wrap",
    "#browse-platform-filter",
    "#browse-decade-filter-wrap",
    "#browse-decade-filter",
    "#browse-format-filter-wrap",
    "#browse-format-filter",
    "#browse-genre-filter-wrap",
    "#browse-genre-filter",
    "#browse-mood-filter-wrap",
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
globalThis.__filterMetadataHarness = {
  state,
  elements,
  renderRecommendations,
  getBrowseFilterOptions,
  getSupportedBrowseFilters,
  getBrowseFilterValuesForFilm,
  BROWSE_FILTER_DEFINITIONS
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  const waitStart = Date.now();
  while (context.__filterMetadataHarness?.state?.loading) {
    if (Date.now() - waitStart > 5000) {
      throw new Error("Timed out waiting for app data to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  context.__filterMetadataHarness.renderRecommendations();

  return {
    app: context.__filterMetadataHarness,
    elementMap,
  };
}

async function main() {
  console.log("Running filter metadata consistency smoke test...");
  console.log("Flow: QA/flows/filter-metadata-consistency.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];
  const films = app.state.internalFilms;
  const indexHtml = await fs.promises.readFile(path.join(ROOT, "index.html"), "utf8");

  const displayedFilters = app.BROWSE_FILTER_DEFINITIONS.map((definition) => ({
    key: definition.key,
    selector: `#${definition.elementKey.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`,
    wrapSelector: `#${definition.wrapKey.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`,
  }));
  const supportedKeys = new Set(app.getSupportedBrowseFilters().map((definition) => definition.key));

  runCheck("Historical unsupported language filter is absent from the homepage", () => {
    assert(!indexHtml.includes('id="browse-language-filter"'), "Found stale browse-language-filter in index.html");
  }, results);

  displayedFilters.forEach((filterDef) => {
    runCheck(`${filterDef.key} filter visibility matches metadata support`, () => {
      const wrap = elementMap.get(filterDef.wrapSelector);
      const isVisible = wrap ? !wrap.hidden : false;
      assert.strictEqual(
        isVisible,
        supportedKeys.has(filterDef.key),
        `Filter "${filterDef.key}" visibility drifted from the metadata support contract`
      );
    }, results);

    if (!supportedKeys.has(filterDef.key)) {
      return;
    }

    runCheck(`Displayed ${filterDef.key} filter is supported by metadata on every film`, () => {
      const supportedCount = films.filter((film) => app.getBrowseFilterValuesForFilm(film, filterDef.key).length).length;
      assert.strictEqual(
        supportedCount,
        films.length,
        `Filter "${filterDef.key}" is shown, but only ${supportedCount}/${films.length} films have usable metadata`
      );
    }, results);

    runCheck(`Displayed ${filterDef.key} filter options come from the film metadata`, () => {
      const options = extractOptions(elementMap.get(filterDef.selector).innerHTML);
      assert(options.length > 0, `No options were rendered for ${filterDef.selector}`);
      options.forEach((option) => {
        const hasBackingFilm = films.some((film) => app.getBrowseFilterValuesForFilm(film, filterDef.key).includes(option.value));
        assert(hasBackingFilm, `Option "${option.value}" in ${filterDef.selector} has no backing film metadata`);
      });
    }, results);
  });

  runCheck("Rendered filter options stay aligned with the app's computed browse options", () => {
    const { options, supportedFilters } = app.getBrowseFilterOptions();
    supportedFilters.forEach((definition) => {
      const selector = `#${definition.elementKey.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
      assert.strictEqual(
        JSON.stringify(extractOptions(elementMap.get(selector).innerHTML).map((option) => option.value)),
        JSON.stringify(options[definition.optionKey] || [])
      );
    });
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
