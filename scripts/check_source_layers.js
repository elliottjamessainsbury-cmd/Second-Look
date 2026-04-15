const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = "/Users/elliott/Documents/New project";
const DATA_DIR = path.join(ROOT, "data");

const {
  getNodeEnrichmentForFilm,
  compareConnectionSources,
} = require(path.join(ROOT, "lib", "source-layer-utils.js"));

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
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
    output[filmId] = unique(output[filmId]);
  });

  return output;
}

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, Array.isArray(item) ? [...item].sort() : item])
  );
}

function main() {
  const curatedFilms = loadJson("curated-films.json");
  const nodeSources = loadJson("node-enrichment-sources.json");
  const nodeMap = loadJson("film-node-enrichment-map.json");
  const connectionSources = loadJson("connection-sources.json");
  const connectionMap = loadJson("film-connection-source-map.json");

  const validFilmIds = new Set(curatedFilms.map((film) => film.film_id));
  const validNodeSourceIds = new Set(nodeSources.map((source) => source.id));
  const validConnectionSourceIds = new Set(connectionSources.map((source) => source.id));

  nodeSources.forEach((source) => {
    source.film_ids.forEach((filmId) => {
      assert(validFilmIds.has(filmId), `Unknown film_id in node source ${source.id}: ${filmId}`);
    });
  });

  connectionSources.forEach((source) => {
    source.film_ids.forEach((filmId) => {
      assert(
        validFilmIds.has(filmId),
        `Unknown film_id in connection source ${source.id}: ${filmId}`
      );
    });
  });

  Object.entries(nodeMap).forEach(([filmId, sourceIds]) => {
    assert(validFilmIds.has(filmId), `Unknown film_id in node map: ${filmId}`);
    sourceIds.forEach((sourceId) => {
      assert(validNodeSourceIds.has(sourceId), `Unknown node source id in map: ${sourceId}`);
    });
  });

  Object.entries(connectionMap).forEach(([filmId, sourceIds]) => {
    assert(validFilmIds.has(filmId), `Unknown film_id in connection map: ${filmId}`);
    sourceIds.forEach((sourceId) => {
      assert(
        validConnectionSourceIds.has(sourceId),
        `Unknown connection source id in map: ${sourceId}`
      );
    });
  });

  assert.deepStrictEqual(
    sortedObject(nodeMap),
    sortedObject(invertSources(nodeSources)),
    "film-node-enrichment-map.json does not match node-enrichment-sources.json"
  );

  assert.deepStrictEqual(
    sortedObject(connectionMap),
    sortedObject(invertSources(connectionSources)),
    "film-connection-source-map.json does not match connection-sources.json"
  );

  const vertigoEnrichment = getNodeEnrichmentForFilm("vertigo-1958");
  assert.strictEqual(vertigoEnrichment.length, 2, "Expected Vertigo to have 2 enrichment sources");

  const horrorPair = compareConnectionSources(
    "the-shining-1980",
    "the-silence-of-the-lambs-1991"
  );
  assert.strictEqual(horrorPair.shared_sources.length, 1, "Expected one shared horror source");
  assert.strictEqual(horrorPair.total_connection_source_score, 0.8);

  const musicalsPair = compareConnectionSources("cabaret-1972", "singin-in-the-rain-1952");
  assert.strictEqual(musicalsPair.shared_sources.length, 1, "Expected one shared musical source");
  assert.strictEqual(musicalsPair.total_connection_source_score, 0.9);

  const tagOnlyPair = compareConnectionSources("the-shining-1980", "vertigo-1958");
  assert.deepStrictEqual(tagOnlyPair.shared_tags, ["canon"]);
  assert.strictEqual(tagOnlyPair.total_connection_source_score, 0.0375);

  console.log("Source layer checks passed.");
  console.log(`Validated ${nodeSources.length} node enrichment sources.`);
  console.log(`Validated ${connectionSources.length} connection sources.`);
  console.log("Confirmed map integrity and helper utility outputs.");
}

main();
