#!/usr/bin/env python3
"""
Build a local TMDb enrichment cache for recommendation explanations.

Usage:
  export TMDB_API_KEY="your-key"
  python3 scripts/build_tmdb_metadata.py

This script:
- reads curated source films and their manual links
- searches TMDb for missing titles
- fetches details, keywords, and credits
- writes a local cache to data/tmdb-metadata.json
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path


CURATED_PATH = Path("/Users/elliott/Documents/New project/data/curated-films.json")
OUTPUT_PATH = Path("/Users/elliott/Documents/New project/data/tmdb-metadata.json")
API_ROOT = "https://api.themoviedb.org/3"


def normalize_title(title: str) -> str:
    return " ".join(str(title or "").strip().split())


def tmdb_get(path: str, api_key: str, params: dict | None = None) -> dict:
    params = params or {}
    params["api_key"] = api_key
    url = f"{API_ROOT}{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "SecondLook-TMDb-Enricher/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_titles() -> list[str]:
    curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    titles: set[str] = set()
    for item in curated:
        titles.add(normalize_title(item["title"]))
        for linked in item.get("manual_links", []):
            titles.add(normalize_title(linked))
    return sorted(title for title in titles if title)


def load_existing() -> dict:
    if not OUTPUT_PATH.exists():
        return {}
    return json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))


def find_best_movie_match(title: str, api_key: str) -> dict | None:
    results = tmdb_get(
        "/search/movie",
        api_key,
        {"query": title, "include_adult": "false"},
    ).get("results", [])

    if not results:
        return None

    return results[0]


def fetch_movie_enrichment(movie_id: int, api_key: str) -> dict:
    details = tmdb_get(
        f"/movie/{movie_id}",
        api_key,
        {"append_to_response": "keywords,credits"},
    )

    genres = [item["name"] for item in details.get("genres", [])[:4]]
    keywords = [item["name"] for item in details.get("keywords", {}).get("keywords", [])[:8]]
    cast = [item["name"] for item in details.get("credits", {}).get("cast", [])[:5]]

    crew = details.get("credits", {}).get("crew", [])
    director = next((member["name"] for member in crew if member.get("job") == "Director"), "")

    release_date = details.get("release_date") or ""
    year = int(release_date[:4]) if len(release_date) >= 4 and release_date[:4].isdigit() else None

    return {
        "tmdb_id": details.get("id"),
        "title": details.get("title", ""),
        "year": year,
        "director": director,
        "genres": genres,
        "keywords": keywords,
        "cast": cast,
        "overview": details.get("overview", ""),
        "poster_path": details.get("poster_path", ""),
    }


def main() -> None:
    api_key = os.environ.get("TMDB_API_KEY")
    if not api_key:
        raise SystemExit("TMDB_API_KEY is not set.")

    titles = load_titles()
    existing = load_existing()
    output = dict(existing)

    fetched = 0
    skipped = 0
    missing: list[str] = []

    for title in titles:
        if title in output and output[title].get("tmdb_id"):
            skipped += 1
            continue

        try:
            match = find_best_movie_match(title, api_key)
            if not match:
                missing.append(title)
                continue

            enrichment = fetch_movie_enrichment(match["id"], api_key)
            output[title] = enrichment
            fetched += 1
            time.sleep(0.1)
        except Exception:
            missing.append(title)

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(output)} TMDb records to {OUTPUT_PATH}")
    print(f"Fetched: {fetched}")
    print(f"Skipped existing: {skipped}")
    print(f"Missing: {len(missing)}")
    if missing:
        print("Examples:", ", ".join(missing[:20]))


if __name__ == "__main__":
    main()
