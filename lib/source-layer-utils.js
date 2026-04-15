const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SCORE_CAP = 1.5;
const TAG_MATCH_FACTOR = 0.15;

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

const nodeEnrichmentSources = loadJson("node-enrichment-sources.json");
const filmNodeEnrichmentMap = loadJson("film-node-enrichment-map.json");
const connectionSources = loadJson("connection-sources.json");
const filmConnectionSourceMap = loadJson("film-connection-source-map.json");

const nodeSourceById = indexById(nodeEnrichmentSources);
const connectionSourceById = indexById(connectionSources);

function expandSources(sourceIds, sourceIndex) {
  return sourceIds.map((sourceId) => sourceIndex.get(sourceId)).filter(Boolean);
}

function getNodeEnrichmentForFilm(filmId) {
  const sourceIds = filmNodeEnrichmentMap[filmId] || [];
  return expandSources(sourceIds, nodeSourceById);
}

function tagsByKey(source) {
  return new Map((source.tags || []).map((tag) => [normalize(tag), tag]));
}

function compareConnectionSources(filmIdA, filmIdB) {
  const sourceIdsA = filmConnectionSourceMap[filmIdA] || [];
  const sourceIdsB = filmConnectionSourceMap[filmIdB] || [];

  const sourceIdSetB = new Set(sourceIdsB);
  const sharedSources = expandSources(
    sourceIdsA.filter((sourceId) => sourceIdSetB.has(sourceId)),
    connectionSourceById
  );

  const sourcesA = expandSources(sourceIdsA, connectionSourceById);
  const sourcesB = expandSources(sourceIdsB, connectionSourceById);
  const sharedTags = new Map();

  sourcesA.forEach((sourceA) => {
    const sourceATags = tagsByKey(sourceA);
    sourcesB.forEach((sourceB) => {
      if (sourceA.id === sourceB.id) {
        return;
      }

      const sourceBTags = tagsByKey(sourceB);
      sourceATags.forEach((displayTag, normalizedTag) => {
        if (!sourceBTags.has(normalizedTag)) {
          return;
        }

        const tagScore = Math.min(sourceA.weight, sourceB.weight) * TAG_MATCH_FACTOR;
        const existing = sharedTags.get(normalizedTag);
        if (!existing || tagScore > existing.score) {
          sharedTags.set(normalizedTag, {
            tag: displayTag,
            score: tagScore,
          });
        }
      });
    });
  });

  const sharedSourceScore = sharedSources.reduce((sum, source) => sum + source.weight, 0);
  const sharedTagScore = Array.from(sharedTags.values()).reduce(
    (sum, entry) => sum + entry.score,
    0
  );

  return {
    shared_sources: sharedSources,
    shared_tags: Array.from(sharedTags.values())
      .map((entry) => entry.tag)
      .sort((left, right) => left.localeCompare(right)),
    total_connection_source_score: Math.min(
      SCORE_CAP,
      Number((sharedSourceScore + sharedTagScore).toFixed(4))
    ),
  };
}

module.exports = {
  compareConnectionSources,
  getNodeEnrichmentForFilm,
};
