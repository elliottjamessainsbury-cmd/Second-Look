const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = "/Users/elliott/Documents/New project";
const DATA_DIR = path.join(ROOT, "data");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "build_availability_data.py");

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
}

function sorted(values) {
  return [...values].sort();
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

function main() {
  console.log("Running M3 availability smoke test...");
  console.log("Flow: QA/flows/availability-m3.md");
  console.log("");

  execFileSync("python3", [BUILD_SCRIPT], { cwd: ROOT, stdio: "inherit" });

  const curatedFilms = loadJson("curated-films.json");
  const availability = loadJson("availability.json");
  const curatedIds = curatedFilms.map((film) => film.film_id);
  const availabilityIds = Object.keys(availability);
  const results = [];

  runCheck("availability.json exists", () => {
    assert(fs.existsSync(path.join(DATA_DIR, "availability.json")));
  }, results);

  runCheck("Availability output only contains curated film_ids", () => {
    availabilityIds.forEach((filmId) => {
      assert(curatedIds.includes(filmId), `Unexpected film_id in availability.json: ${filmId}`);
    });
  }, results);

  runCheck("Every curated film has an availability entry", () => {
    assert.deepStrictEqual(sorted(availabilityIds), sorted(curatedIds));
  }, results);

  runCheck("Every film has the expected streaming and physical_media containers", () => {
    curatedIds.forEach((filmId) => {
      const entry = availability[filmId];
      assert(entry, `Missing availability entry for ${filmId}`);
      assert(entry.streaming, `Missing streaming section for ${filmId}`);
      assert(Array.isArray(entry.streaming.providers), `Invalid streaming.providers for ${filmId}`);
      assert(entry.physical_media, `Missing physical_media section for ${filmId}`);
      assert(Array.isArray(entry.physical_media.ebay), `Invalid physical_media.ebay for ${filmId}`);
      assert(
        Array.isArray(entry.physical_media.retailer_search_links),
        `Invalid physical_media.retailer_search_links for ${filmId}`
      );
    });
  }, results);

  runCheck("Every film has Criterion, BFI Shop, and HMV retailer links", () => {
    curatedIds.forEach((filmId) => {
      const retailers = availability[filmId].physical_media.retailer_search_links.map(
        (item) => item.retailer
      );
      assert.deepStrictEqual(retailers, ["Criterion", "BFI Shop", "HMV"]);
    });
  }, results);

  runCheck("Retailer links are generated even when live APIs are unavailable", () => {
    const sample = availability["ash-is-purest-white-2018"];
    assert(sample, "Missing sample availability entry");
    assert.strictEqual(sample.physical_media.retailer_search_links.length, 3);
  }, results);

  printResults(results);

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main();
