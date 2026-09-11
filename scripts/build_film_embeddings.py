#!/usr/bin/env python3
"""Build 512-dimensional OpenAI embeddings for the curated film universe."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL = "text-embedding-3-small"
DIMENSIONS = 512
OUTPUT_PATH = ROOT / "data/film-embeddings.json"


def load_json(name: str):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def normalize_title(value: object) -> str:
    return " ".join(str(value or "").lower().split())


def matching_record(records: dict, title: str, year: int | None) -> dict:
    values = list(records.values())
    exact = [item for item in values if normalize_title(item.get("title")) == normalize_title(title) and (not year or item.get("year") == year)]
    return exact[0] if exact else next((item for item in values if normalize_title(item.get("title")) == normalize_title(title)), {})


def descriptor(film: dict, profile: dict, tmdb: dict, letterboxd: dict) -> str:
    fields = [
        f"Film: {film['title']} ({film.get('year') or 'year unknown'}).",
        f"Director: {tmdb.get('director') or letterboxd.get('director') or 'unknown'}.",
        f"Country: {film.get('country') or 'unknown'}.",
        f"Genres: {', '.join(tmdb.get('genres', [])) or 'unknown'}.",
        f"Themes: {', '.join(profile['themes'])}.",
        f"Mood: {', '.join(profile['mood'])}.",
        f"Tone: {', '.join(profile['tone'])}.",
        f"Formal style: {', '.join(profile['formal_style'])}.",
        f"Pace: {profile['pace']}; intensity: {profile['intensity']}; ambiguity: {profile['ambiguity']}; accessibility: {profile['accessibility']}.",
    ]
    if profile.get("movement"):
        fields.append(f"Movement: {profile['movement']}.")
    if profile.get("editorial_notes"):
        fields.append(f"Editorial note: {profile['editorial_notes']}")
    overview = tmdb.get("overview") or letterboxd.get("intro") or ""
    if overview:
        fields.append(f"Synopsis: {overview}")
    if tmdb.get("keywords"):
        fields.append(f"Keywords: {', '.join(tmdb['keywords'])}.")
    return " ".join(fields)[:6000]


def source_checksum(payload: object) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def fetch_embeddings(inputs: list[str], api_key: str) -> list[list[float]]:
    body = json.dumps({"model": MODEL, "dimensions": DIMENSIONS, "input": inputs}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))
    rows = sorted(payload.get("data", []), key=lambda item: item.get("index", 0))
    vectors = [row.get("embedding", []) for row in rows]
    if len(vectors) != len(inputs) or any(len(vector) != DIMENSIONS for vector in vectors):
        raise ValueError("OpenAI returned an unexpected embedding shape.")
    return vectors


def main() -> None:
    api_key = os.environ.get("OPENAI_API_KEY")

    curated = load_json("curated-films.json")
    profiles = load_json("film-taste-profiles.json")
    tmdb_records = load_json("tmdb-metadata.json")
    letterboxd_records = load_json("film-metadata.json")
    if set(profiles) != {film["film_id"] for film in curated}:
        raise ValueError("Taste profile ids do not match the curated universe.")

    rows = []
    checksum_payload = []
    for film in curated:
        tmdb = matching_record(tmdb_records, film["title"], film.get("year"))
        letterboxd = matching_record(letterboxd_records, film["title"], film.get("year"))
        text = descriptor(film, profiles[film["film_id"]], tmdb, letterboxd)
        rows.append((film["film_id"], text))
        checksum_payload.append({"film_id": film["film_id"], "descriptor": text})

    checksum = source_checksum(checksum_payload)
    if not api_key or api_key == "your-key-here":
        if "--write-pending" not in sys.argv:
            raise SystemExit("OPENAI_API_KEY is not configured. Use --write-pending only to emit the explicit fallback manifest.")
        output = {
            "model": MODEL,
            "dimensions": DIMENSIONS,
            "source_checksum": checksum,
            "generated_at": None,
            "generation_status": "pending_credentials",
            "vectors": {},
        }
        OUTPUT_PATH.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"Wrote pending embedding manifest to {OUTPUT_PATH}")
        return

    vectors = {}
    for start in range(0, len(rows), 50):
        batch = rows[start:start + 50]
        embedded = fetch_embeddings([text for _, text in batch], api_key)
        for (film_id, _), vector in zip(batch, embedded):
            vectors[film_id] = vector
        print(f"Embedded {min(start + len(batch), len(rows))}/{len(rows)} films")

    output = {
        "model": MODEL,
        "dimensions": DIMENSIONS,
        "source_checksum": checksum,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "generation_status": "ready",
        "vectors": vectors,
    }
    OUTPUT_PATH.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(vectors)} embeddings to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
