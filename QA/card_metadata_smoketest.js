const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = "/Users/elliott/Documents/New project";

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

async function createHarness() {
  const selectors = [
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

  const context = {
    console,
    window: {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval
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
  addFilm,
  renderRecommendations,
  cardKey,
  cardCoverageForTitle
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });
  await new Promise((resolve) => setTimeout(resolve, 40));

  return {
    app: context.__cardMetadataHarness,
    elementMap
  };
}

function pickSeed(app) {
  for (const film of app.state.curatedSourceFilms) {
    app.addFilm(film.film_id);

    const primaryCard = (app.state.recommendations.primary || []).find(
      (item) => app.cardCoverageForTitle(item.title).isFull
    );
    const criterionCard = (app.state.recommendations.criterion || []).find(
      (item) => app.cardCoverageForTitle(item.title).isFull
    );

    if (primaryCard && criterionCard) {
      return {
        seed: film.title,
        primaryCard,
        criterionCard
      };
    }
  }

  return null;
}

async function main() {
  console.log("Running card metadata smoke test...");
  console.log("Flow: QA/flows/card-metadata.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];
  const scenario = pickSeed(app);

  runCheck("Found a seed film with covered primary and criterion cards", () => {
    assert(scenario, "No suitable seed film found");
  }, results);

  if (!scenario) {
    printResults(results);
    process.exitCode = 1;
    return;
  }

  app.state.expandedCardKey = app.cardKey("primary", scenario.primaryCard.title);
  app.renderRecommendations();

  runCheck("Expanded primary card includes explanation, synopsis, rating, and availability", () => {
    const html = elementMap.get("#results-grid").innerHTML;
    assert(html.includes(scenario.primaryCard.title), `Primary title missing: ${scenario.primaryCard.title}`);
    assert(html.includes("expanded-reason-copy"), "Primary explanation missing");
    assert(html.includes("Average Letterboxd rating"), "Primary rating label missing");
    assert(html.includes("expanded-copy"), "Primary synopsis missing");
    assert(html.includes("Search Criterion"), "Primary retailer links missing");
    assert(!html.includes("BFI"), "Primary card should not show BFI links");
  }, results);

  app.state.expandedCardKey = app.cardKey("criterion", scenario.criterionCard.title);
  app.renderRecommendations();

  runCheck("Expanded criterion card includes explanation, synopsis, rating, and availability", () => {
    const html = elementMap.get("#criterion-section").innerHTML;
    assert(html.includes(scenario.criterionCard.title), `Criterion title missing: ${scenario.criterionCard.title}`);
    assert(html.includes("expanded-reason-copy"), "Criterion explanation missing");
    assert(html.includes("Average Letterboxd rating"), "Criterion rating label missing");
    assert(html.includes("expanded-copy"), "Criterion synopsis missing");
    assert(html.includes("Search Criterion"), "Criterion retailer links missing");
    assert(!html.includes("BFI"), "Criterion card should not show BFI links");
  }, results);

  app.state.expandedCardKey = "";
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
