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
    "#cinema-showtimes-intro",
    "#cinema-showtimes-updated",
    "#toggle-cinema-calendar"
  ];
  const elementMap = new Map(selectors.map((selector) => [selector, new MockElement(selector)]));

  const context = {
    console,
    window: {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      SecondLookEngine: engine,
      SecondLookEditorial: editorial
    },
    document: {
      querySelector(selector) {
        return elementMap.get(selector) || new MockElement(selector);
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
globalThis.__cardMetadataHarness = {
  state,
  elements,
  renderRecommendations,
  cardKey,
  toggleSeedFilm,
  generateRecommendations,
  metadataForTitle
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  // Wait for loadAppData() to complete (it runs at module load).
  const waitStart = Date.now();
  while (context.__cardMetadataHarness?.state?.loading) {
    if (Date.now() - waitStart > 5000) {
      throw new Error("Timed out waiting for app data to load.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    app: context.__cardMetadataHarness,
    elementMap
  };
}

function pickScenario(app) {
  const seed = app.state.internalFilms.find((film) => film && film.source === "internal") || null;
  if (!seed) {
    return null;
  }

  app.state.session.seedFilmIds = [seed.filmId];
  app.generateRecommendations();
  app.renderRecommendations();

  const picks = Array.isArray(app.state.recommendations) ? app.state.recommendations : [];
  const primaryPick = picks[0]?.film ? picks[0].film : null;
  if (!primaryPick) {
    return null;
  }

  return { seed, primaryPick };
}

async function main() {
  console.log("Running card metadata smoke test...");
  console.log("Flow: QA/flows/card-metadata.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];
  const scenario = pickScenario(app);

  runCheck("Found a seed film that generates recommendations", () => {
    assert(scenario, "No suitable seed film found / no recommendations generated");
  }, results);

  if (!scenario) {
    printResults(results);
    process.exitCode = 1;
    return;
  }

  app.state.session.expandedCardKey = app.cardKey("recommendation", scenario.primaryPick.filmId);
  app.renderRecommendations();

  runCheck("Expanded recommendation card includes explanation, synopsis, and availability", () => {
    const html = elementMap.get("#results-grid").innerHTML;
    assert(html.includes(scenario.primaryPick.title), `Recommendation title missing: ${scenario.primaryPick.title}`);
    assert(html.includes("expanded-reason-copy"), "Explanation missing");
    assert(html.includes("expanded-copy"), "Synopsis missing");
    assert(html.includes("Search Criterion"), "Retailer links missing");

    const metadata = app.metadataForTitle(scenario.primaryPick.title);
    if (metadata && metadata.average_rating) {
      assert(html.includes("Average Letterboxd rating"), "Rating label missing for film with rating metadata");
    } else {
      assert(!html.includes("Average Letterboxd rating"), "Rating label should be omitted when rating metadata is missing");
    }
  }, results);

  app.state.session.expandedCardKey = "";
  app.renderRecommendations();

  runCheck("Collapsing cards returns the layout to normal", () => {
    const primaryHtml = elementMap.get("#results-grid").innerHTML;
    const criterionHtml = elementMap.get("#criterion-section").innerHTML;
    assert(!primaryHtml.includes("result-card-expanded"), "Primary row stayed expanded");
    assert(!criterionHtml.includes("result-card-expanded"), "Criterion row stayed expanded");
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
