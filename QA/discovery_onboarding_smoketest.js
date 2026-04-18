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

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
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
globalThis.__appHarness = {
  state,
  elements,
  tasteQuizQuestions,
  handleTasteQuizAnswer,
  completeQuizAndGenerateFirstBatch,
  toggleDiscoveryBookmark,
  toggleDiscoveryDismiss,
  advanceDiscovery,
  renderDiscoveryGrid,
  cardKey
};`;

  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: "app.js" });

  await new Promise((resolve) => setTimeout(resolve, 40));

  return {
    app: context.__appHarness,
    elementMap
  };
}

async function main() {
  console.log("Running M2 discovery onboarding smoke test...");
  console.log("Flow: QA/flows/discovery-onboarding-m2.md");
  console.log("");

  const { app, elementMap } = await createHarness();
  const results = [];
  const answers = {
    bw: "timeless",
    subtitles: "essential",
    slow: "hypnotic",
    weird: "medium",
    craft_vs_feeling: "craft",
    ambiguity: "love"
  };
  const resultsGrid = elementMap.get("#results-grid");
  const bookmarksRail = elementMap.get("#discovery-bookmarks");

  runCheck("Quiz renders before the legacy recommendation state", () => {
    assert(resultsGrid.innerHTML.includes('data-discovery-step="quiz"'));
    assert.strictEqual(countMatches(resultsGrid.innerHTML, /data-quiz-question="/g), 6);
    assert(resultsGrid.innerHTML.includes("Show me films"));
    assert(resultsGrid.innerHTML.includes("disabled"));
  }, results);

  Object.entries(answers).forEach(([questionId, answerId]) => {
    app.handleTasteQuizAnswer(questionId, answerId);
  });
  app.completeQuizAndGenerateFirstBatch();

  const firstBatchIds = app.state.discovery.currentBatch.map((item) => item.filmId);
  const firstFilm = app.state.discovery.currentBatch[0];
  const firstFilmRecord = app.state.discoveryFilms.find((film) => film.id === firstFilm.filmId);

  runCheck("First discovery grid shows nine unique recommendations with no dismiss action", () => {
    assert.strictEqual(app.state.discovery.step, "grid1");
    assert.strictEqual(firstBatchIds.length, 9);
    assert.strictEqual(new Set(firstBatchIds).size, 9);
    assert.strictEqual(countMatches(resultsGrid.innerHTML, /data-discovery-card="/g), 9);
    assert.strictEqual(countMatches(resultsGrid.innerHTML, /data-discovery-dismiss=/g), 0);
  }, results);

  runCheck("Each first-grid card has imagery and an answer-aware rationale", () => {
    const imageryCount =
      countMatches(resultsGrid.innerHTML, /class="poster-image"/g) +
      countMatches(resultsGrid.innerHTML, /class="poster-monogram"/g);
    assert.strictEqual(imageryCount, 9);
    assert(resultsGrid.innerHTML.includes("subtitles are essential") || resultsGrid.innerHTML.includes("form and craft matter to you"));
  }, results);

  app.state.expandedCardKey = app.cardKey("discovery", `grid1:${firstFilmRecord.title}`);
  app.renderDiscoveryGrid();

  runCheck("Expanded discovery card includes the AI-fit panel and legacy detail content", () => {
    assert(resultsGrid.innerHTML.includes("AI take on the fit"));
    assert(resultsGrid.innerHTML.includes("Average Letterboxd rating"));
    assert(resultsGrid.innerHTML.includes("expanded-copy"));
    assert(resultsGrid.innerHTML.includes(firstFilmRecord.title));
  }, results);

  app.toggleDiscoveryBookmark(firstBatchIds[0]);
  app.toggleDiscoveryBookmark(firstBatchIds[1]);
  app.renderDiscoveryGrid();

  runCheck("Bookmarked discovery titles appear in the left rail", () => {
    assert(bookmarksRail.innerHTML.includes(firstFilmRecord.title));
    const secondFilmRecord = app.state.discoveryFilms.find((film) => film.id === firstBatchIds[1]);
    assert(bookmarksRail.innerHTML.includes(secondFilmRecord.title));
  }, results);

  app.advanceDiscovery();
  const secondBatchIds = app.state.discovery.currentBatch.map((item) => item.filmId);

  runCheck("Second discovery grid stays at nine titles and introduces Not for me", () => {
    assert.strictEqual(app.state.discovery.step, "grid2");
    assert.strictEqual(secondBatchIds.length, 9);
    assert.strictEqual(new Set(secondBatchIds).size, 9);
    assert.strictEqual(countMatches(resultsGrid.innerHTML, /data-discovery-card="/g), 9);
    assert(countMatches(resultsGrid.innerHTML, /data-discovery-dismiss="/g) >= 9);
    assert.strictEqual(secondBatchIds.filter((filmId) => firstBatchIds.includes(filmId)).length, 0);
  }, results);

  const dismissedId = secondBatchIds[0];
  app.toggleDiscoveryDismiss(dismissedId);
  app.renderDiscoveryGrid();
  app.advanceDiscovery();

  runCheck("Dismissed titles do not reappear in subsequent discovery batches", () => {
    const nextBatchIds = app.state.discovery.currentBatch.map((item) => item.filmId);
    assert(!nextBatchIds.includes(dismissedId), `Dismissed film ${dismissedId} reappeared`);
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
