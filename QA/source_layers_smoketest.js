const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = "/Users/elliott/Documents/New project";
const DATA_DIR = path.join(ROOT, "data");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "build_source_layers.py");

const {
  getNodeEnrichmentForFilm,
  compareConnectionSources,
} = require(path.join(ROOT, "lib", "source-layer-utils.js"));

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values));
}

function invertSources(sources) {
  const output = {};
  sources.forEach((source) => {
    source.film_ids.forEach((filmId) => {
      if (!output[filmId]) {
        output[filmId] = [];
      }
      output[filmId].push(source.id);
    });
  });

  Object.keys(output).forEach((filmId) => {
    output[filmId] = unique(output[filmId]).sort();
  });

  return output;
}

function sortMapEntries(mapObject) {
  return Object.fromEntries(
    Object.entries(mapObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, [...value].sort()])
  );
}

function runCheck(label, fn, results) {
  try {
    fn();
    results.push({ label, status: "PASS" });
  } catch (error) {
    results.push({ label, status: "FAIL", error: error.message });
  }
}

function recommendationBlurbForPair(blurbs, sourceTitle, recommendedTitle) {
  function findPairEntry(leftTitle, rightTitle) {
    const key = `${leftTitle}::${rightTitle}`;
    if (blurbs[key]) {
      return blurbs[key];
    }

    const leftNeedle = normalize(leftTitle);
    const rightNeedle = normalize(rightTitle);
    const matchedKey = Object.keys(blurbs).find((candidateKey) => {
      const [candidateLeft = "", candidateRight = ""] = candidateKey.split("::");
      return normalize(candidateLeft) === leftNeedle && normalize(candidateRight) === rightNeedle;
    });

    return matchedKey ? blurbs[matchedKey] : null;
  }

  function formatList(values) {
    if (!values.length) {
      return "";
    }
    if (values.length === 1) {
      return values[0];
    }
    if (values.length === 2) {
      return `${values[0]} and ${values[1]}`;
    }
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  const directEntry = findPairEntry(sourceTitle, recommendedTitle);
  if (directEntry) {
    return directEntry;
  }

  const reverseEntry = findPairEntry(recommendedTitle, sourceTitle);
  if (!reverseEntry) {
    return null;
  }

  const supportingPoints = (reverseEntry.supporting_points || []).slice(0, 3);
  if (supportingPoints.length) {
    return {
      ...reverseEntry,
      blurb: `${sourceTitle} and ${recommendedTitle} connect through ${formatList(supportingPoints)}. That shared terrain is why ${recommendedTitle} feels like a strong follow-on from ${sourceTitle}.`,
    };
  }

  if (reverseEntry.primary_angle) {
    const primaryAngle = reverseEntry.primary_angle.replace(/\.$/, "");
    return {
      ...reverseEntry,
      blurb: `${sourceTitle} and ${recommendedTitle} sit in related territory: ${primaryAngle.toLowerCase()}. That is what makes ${recommendedTitle} feel closely linked to ${sourceTitle}.`,
    };
  }

  return reverseEntry;
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
  const failed = results.length - passed;
  console.log("");
  console.log(`Summary: ${passed} passed, ${failed} failed`);
}

function main() {
  console.log("Running M2 source-layer smoke test...");
  console.log(`Flow: QA/flows/source-layers-m2.md`);
  console.log("");

  execFileSync("python3", [BUILD_SCRIPT], { cwd: ROOT, stdio: "inherit" });

  const curatedFilms = loadJson("curated-films.json");
  const nodeSources = loadJson("node-enrichment-sources.json");
  const nodeMap = loadJson("film-node-enrichment-map.json");
  const connectionSources = loadJson("connection-sources.json");
  const connectionMap = loadJson("film-connection-source-map.json");
  const recommendationBlurbs = loadJson("recommendation-blurbs.json");
  const filmMetadata = loadJson("film-metadata.json");
  const recommendedFilmUrls = loadJson("recommended-film-urls.json");

  const validFilmIds = new Set(curatedFilms.map((film) => film.film_id));
  const validNodeSourceIds = new Set(nodeSources.map((source) => source.id));
  const validConnectionSourceIds = new Set(connectionSources.map((source) => source.id));
  const results = [];

  runCheck("Generated files exist", () => {
    [
      "node-enrichment-sources.json",
      "film-node-enrichment-map.json",
      "connection-sources.json",
      "film-connection-source-map.json",
    ].forEach((filename) => {
      assert(fs.existsSync(path.join(DATA_DIR, filename)), `Missing ${filename}`);
    });
  }, results);

  runCheck("All node enrichment film_ids are in the closed curated dataset", () => {
    nodeSources.forEach((source) => {
      source.film_ids.forEach((filmId) => {
        assert(validFilmIds.has(filmId), `Unknown node film_id ${filmId} in ${source.id}`);
      });
    });
  }, results);

  runCheck("All connection film_ids are in the closed curated dataset", () => {
    connectionSources.forEach((source) => {
      source.film_ids.forEach((filmId) => {
        assert(validFilmIds.has(filmId), `Unknown connection film_id ${filmId} in ${source.id}`);
      });
    });
  }, results);

  runCheck("Node enrichment map references only valid source ids", () => {
    Object.entries(nodeMap).forEach(([filmId, sourceIds]) => {
      assert(validFilmIds.has(filmId), `Unknown node-map film_id ${filmId}`);
      sourceIds.forEach((sourceId) => {
        assert(validNodeSourceIds.has(sourceId), `Unknown node source_id ${sourceId}`);
      });
    });
  }, results);

  runCheck("Connection map references only valid source ids", () => {
    Object.entries(connectionMap).forEach(([filmId, sourceIds]) => {
      assert(validFilmIds.has(filmId), `Unknown connection-map film_id ${filmId}`);
      sourceIds.forEach((sourceId) => {
        assert(validConnectionSourceIds.has(sourceId), `Unknown connection source_id ${sourceId}`);
      });
    });
  }, results);

  runCheck("Node enrichment map matches inverted source memberships", () => {
    assert.deepStrictEqual(sortMapEntries(nodeMap), sortMapEntries(invertSources(nodeSources)));
  }, results);

  runCheck("Connection map matches inverted source memberships", () => {
    assert.deepStrictEqual(
      sortMapEntries(connectionMap),
      sortMapEntries(invertSources(connectionSources))
    );
  }, results);

  runCheck("getNodeEnrichmentForFilm returns expected sources for Vertigo", () => {
    const enrichment = getNodeEnrichmentForFilm("vertigo-1958");
    const sourceIds = enrichment.map((source) => source.id).sort();
    assert.deepStrictEqual(sourceIds, [
      "afi-100-years-100-thrills-2001",
      "sight-and-sound-greatest-films-2022",
    ]);
  }, results);

  runCheck("compareConnectionSources gives strongest boost to exact shared source membership", () => {
    const result = compareConnectionSources(
      "the-shining-1980",
      "the-silence-of-the-lambs-1991"
    );
    assert.strictEqual(result.shared_sources.length, 1);
    assert.deepStrictEqual(result.shared_tags, []);
    assert.strictEqual(result.total_connection_source_score, 0.8);
  }, results);

  runCheck("compareConnectionSources supports weaker shared-tag overlap across different sources", () => {
    const result = compareConnectionSources("the-shining-1980", "vertigo-1958");
    assert.deepStrictEqual(result.shared_sources, []);
    assert.deepStrictEqual(result.shared_tags, ["canon"]);
    assert.strictEqual(result.total_connection_source_score, 0.0375);
  }, results);

  runCheck("compareConnectionSources keeps final scores capped", () => {
    const result = compareConnectionSources("the-shining-1980", "the-shining-1980");
    assert(result.total_connection_source_score <= 1.5, "Score cap exceeded");
  }, results);

  runCheck("Expanded See more copy resolves to pair-specific editorial blurbs for known recommendation pairs", () => {
    const result = recommendationBlurbForPair(
      recommendationBlurbs,
      "A Woman Under the Influence",
      "Bug"
    );
    assert(
      result && typeof result.blurb === "string" && result.blurb.length > 0,
      "Missing editorial blurb for A Woman Under the Influence -> Bug"
    );
    assert(
      /A Woman Under the Influence and Bug connect through|A Woman Under the Influence and Bug sit in related territory/.test(result.blurb),
      "Resolved blurb does not describe the actual relationship between the selected and recommended films"
    );
    assert(
      !/sits very near|we've brought it forward|clearest follow-on picks/i.test(result.blurb),
      "Expanded copy fell back to generic recommendation language"
    );
  }, results);

  runCheck("Year-qualified ambiguous titles have exact metadata and canonical Letterboxd targets", () => {
    const ambiguousTitles = ["Inside (2007)", "Long Day's Journey Into Night (2018)"];

    ambiguousTitles.forEach((title) => {
      assert(filmMetadata[title], `Missing metadata for ${title}`);
      assert(recommendedFilmUrls[title], `Missing URL override for ${title}`);
      assert.strictEqual(
        filmMetadata[title].letterboxd_url,
        recommendedFilmUrls[title],
        `Metadata URL and override URL differ for ${title}`
      );
    });

    assert.strictEqual(filmMetadata["Long Day's Journey Into Night (2018)"].director, "Bi Gan");
    assert.strictEqual(
      recommendedFilmUrls["Long Day's Journey Into Night (2018)"],
      "https://letterboxd.com/film/long-days-journey-into-night-2018/"
    );
    assert.strictEqual(
      recommendedFilmUrls["Inside (2007)"],
      "https://letterboxd.com/film/inside-2007/"
    );
  }, results);

  runCheck("Ash Is Purest White blurb no longer misattributes Long Day's Journey Into Night to Jia Zhangke", () => {
    const entry =
      recommendationBlurbs["Ash Is Purest White::Long Day's Journey Into Night (2018)"];
    assert(entry, "Missing blurb entry for Ash Is Purest White -> Long Day's Journey Into Night (2018)");
    assert(!/same director/i.test((entry.supporting_points || []).join(" ")));
    assert(!/another Jia Zhangke film/i.test(entry.blurb));
    assert(/Bi Gan/.test(entry.blurb));
  }, results);

  printResults(results);

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length) {
    process.exitCode = 1;
  }
}

main();
