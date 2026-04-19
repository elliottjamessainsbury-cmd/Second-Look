#!/usr/bin/env python3
"""
Build local availability data for the closed curated film catalogue.

Usage:
  export TMDB_API_KEY="your-key"
  export EBAY_CLIENT_ID="your-client-id"
  export EBAY_CLIENT_SECRET="your-client-secret"
  python3 scripts/build_availability_data.py

This script:
- reads the closed curated film dataset
- fetches TMDb watch provider data for configured region when possible
- fetches eBay Browse results when credentials are present
 - generates retailer search links for Criterion, Amazon, and HMV
- writes a local cache to data/availability.json
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path("/Users/elliott/Documents/New project")
CURATED_PATH = ROOT / "data/curated-films.json"
TMDB_METADATA_PATH = ROOT / "data/tmdb-metadata.json"
OUTPUT_PATH = ROOT / "data/availability.json"

API_ROOT_TMDB = "https://api.themoviedb.org/3"
API_ROOT_EBAY = "https://api.ebay.com"
DEFAULT_REGION = "GB"
DEFAULT_EBAY_MARKETPLACE_ID = "EBAY_GB"
MAX_EBAY_RESULTS = 3
TMDB_USER_AGENT = "SecondLook-AvailabilityBuilder/1.0"
EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope"
NEGATIVE_EBAY_TOKENS = {
    "poster",
    "book",
    "novel",
    "screenplay",
    "soundtrack",
    "vinyl",
    "cd",
    "cassette",
    "shirt",
    "t-shirt",
    "tee",
    "photo",
    "lobby",
    "vhs",
    "laserdisc",
    "digital",
    "download",
}
FORMAT_TOKENS = ("blu-ray", "blu ray", "dvd", "4k", "uhd")
TYPE_PRIORITY = {"flatrate": 0, "rent": 1, "buy": 2}


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_title(title: str) -> str:
    text = str(title or "").lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[’']", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def iso_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def tmdb_get(path: str, api_key: str, params: dict | None = None) -> dict:
    params = params or {}
    params["api_key"] = api_key
    url = f"{API_ROOT_TMDB}{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": TMDB_USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def tmdb_search_movie_id(title: str, year: int | None, api_key: str) -> int | None:
    params = {
        "query": title,
        "include_adult": "false",
    }
    if year:
        params["year"] = str(year)

    results = tmdb_get("/search/movie", api_key, params).get("results", [])
    if not results:
        return None

    normalized_title = normalize_title(title)

    def score(result: dict) -> tuple[int, int]:
        result_title = normalize_title(result.get("title", ""))
        release_date = result.get("release_date") or ""
        result_year = int(release_date[:4]) if len(release_date) >= 4 and release_date[:4].isdigit() else None
        title_score = 2 if result_title == normalized_title else 1 if normalized_title in result_title else 0
        year_score = 1 if year and result_year == year else 0
        return (title_score, year_score)

    best = max(results, key=score)
    best_title_score, _ = score(best)
    if best_title_score == 0:
        return None
    return best.get("id")


def find_tmdb_id(film: dict, tmdb_metadata: dict, api_key: str | None) -> int | None:
    title = film["title"]
    exact = tmdb_metadata.get(title)
    if exact and exact.get("tmdb_id"):
        return exact["tmdb_id"]

    normalized_title = normalize_title(title)
    for candidate_title, candidate in tmdb_metadata.items():
        if normalize_title(candidate_title) == normalized_title and candidate.get("tmdb_id"):
            return candidate["tmdb_id"]

    if not api_key:
        return None

    try:
        return tmdb_search_movie_id(title, film.get("year"), api_key)
    except Exception:
        return None


def fetch_streaming_availability(movie_id: int, region: str, api_key: str) -> dict:
    payload = tmdb_get(f"/movie/{movie_id}/watch/providers", api_key)
    region_data = (payload.get("results") or {}).get(region, {})
    providers = []

    for provider_type in ("flatrate", "rent", "buy"):
        for provider in region_data.get(provider_type, []):
            providers.append(
                {
                    "provider_name": provider.get("provider_name", ""),
                    "type": provider_type,
                    "region": region,
                    "display_priority": provider.get("display_priority", 999),
                }
            )

    deduped = {}
    for provider in providers:
        key = (provider["provider_name"], provider["type"], provider["region"])
        if key not in deduped:
            deduped[key] = provider

    ordered = sorted(
        deduped.values(),
        key=lambda item: (
            TYPE_PRIORITY.get(item["type"], 9),
            item.get("display_priority", 999),
            item["provider_name"].lower(),
        ),
    )

    return {
        "providers": [
            {
                "provider_name": provider["provider_name"],
                "type": provider["type"],
                "region": provider["region"],
            }
            for provider in ordered
        ],
        "watch_url": region_data.get("link"),
        "last_checked": iso_timestamp(),
    }


def ebay_headers(access_token: str, marketplace_id: str) -> dict:
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
        "X-EBAY-C-MARKETPLACE-ID": marketplace_id,
    }


def get_ebay_access_token(client_id: str, client_secret: str) -> str:
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "scope": EBAY_SCOPE,
        }
    ).encode("utf-8")
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        f"{API_ROOT_EBAY}/identity/v1/oauth2/token",
        data=body,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload["access_token"]


def looks_like_physical_media(item_title: str) -> bool:
    normalized = normalize_title(item_title)
    if any(token in normalized.split() for token in NEGATIVE_EBAY_TOKENS):
        return False
    return any(token.replace("-", " ") in normalized for token in FORMAT_TOKENS)


def title_match_score(film_title: str, film_year: int | None, item_title: str) -> int:
    normalized_film = normalize_title(film_title)
    normalized_item = normalize_title(item_title)
    score = 0

    if normalized_film in normalized_item:
        score += 8

    film_tokens = [token for token in normalized_film.split() if len(token) > 2]
    score += sum(1 for token in film_tokens if token in normalized_item)

    if film_year and str(film_year) in normalized_item:
        score += 2

    if any(token.replace("-", " ") in normalized_item for token in FORMAT_TOKENS):
        score += 3

    if not looks_like_physical_media(item_title):
        score -= 10

    return score


def fetch_ebay_results(
    film: dict, access_token: str, marketplace_id: str, limit: int = MAX_EBAY_RESULTS
) -> list[dict]:
    query = f"{film['title']} {film.get('year') or ''} blu ray dvd 4k"
    params = urllib.parse.urlencode(
        {
            "q": query.strip(),
            "limit": "12",
            "filter": "buyingOptions:{FIXED_PRICE}",
        }
    )
    request = urllib.request.Request(
        f"{API_ROOT_EBAY}/buy/browse/v1/item_summary/search?{params}",
        headers=ebay_headers(access_token, marketplace_id),
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    ranked_items = []
    for item in payload.get("itemSummaries", []):
        item_title = item.get("title", "")
        score = title_match_score(film["title"], film.get("year"), item_title)
        if score < 4:
            continue

        price = item.get("price", {})
        image = item.get("image", {})
        ranked_items.append(
            (
                score,
                {
                    "title": item_title,
                    "price": f"{price.get('currency', '')} {price.get('value', '')}".strip(),
                    "condition": item.get("condition"),
                    "item_url": item.get("itemWebUrl", ""),
                    "image_url": image.get("imageUrl"),
                },
            )
        )

    ranked_items.sort(key=lambda item: item[0], reverse=True)

    output = []
    seen_urls = set()
    for _, item in ranked_items:
        if not item["item_url"] or item["item_url"] in seen_urls:
            continue
        seen_urls.add(item["item_url"])
        output.append(item)
        if len(output) >= limit:
            break

    return output


def retailer_search_links(title: str) -> list[dict]:
    encoded = urllib.parse.quote_plus(title)
    return [
        {
            "retailer": "Criterion",
            "url": f"https://www.criterion.com/search?q={encoded}",
        },
        {
            "retailer": "BFI Shop",
            "url": f"https://shop.bfi.org.uk/search.php?search_query={encoded}",
        },
        {
            "retailer": "HMV",
            "url": f"https://hmv.com/search?searchtext={encoded}",
        },
    ]


def default_streaming(existing_entry: dict | None) -> dict:
    existing_streaming = (existing_entry or {}).get("streaming") or {}
    return {
        "providers": existing_streaming.get("providers", []),
        "watch_url": existing_streaming.get("watch_url"),
        "last_checked": existing_streaming.get("last_checked"),
    }


def default_physical_media(title: str, existing_entry: dict | None) -> dict:
    existing_physical = (existing_entry or {}).get("physical_media") or {}
    return {
        "ebay": existing_physical.get("ebay", []),
        "retailer_search_links": retailer_search_links(title),
        "last_checked": existing_physical.get("last_checked"),
    }


def main() -> None:
    curated_films = load_json(CURATED_PATH, [])
    tmdb_metadata = load_json(TMDB_METADATA_PATH, {})
    existing_output = load_json(OUTPUT_PATH, {})

    region = os.environ.get("AVAILABILITY_REGION", DEFAULT_REGION)
    marketplace_id = os.environ.get("EBAY_MARKETPLACE_ID", DEFAULT_EBAY_MARKETPLACE_ID)
    tmdb_api_key = os.environ.get("TMDB_API_KEY")
    ebay_client_id = os.environ.get("EBAY_CLIENT_ID")
    ebay_client_secret = os.environ.get("EBAY_CLIENT_SECRET")

    if not tmdb_api_key:
        print("Warning: TMDB_API_KEY is not set. Streaming availability will be preserved or omitted.")

    ebay_access_token = None
    if ebay_client_id and ebay_client_secret:
        try:
            ebay_access_token = get_ebay_access_token(ebay_client_id, ebay_client_secret)
        except Exception as error:
            print(f"Warning: failed to get eBay access token: {error}")
    else:
        print("Warning: eBay credentials are not set. eBay listings will be preserved or omitted.")

    output = {}
    warnings = []
    build_checked_at = iso_timestamp()

    for film in curated_films:
        film_id = film["film_id"]
        existing_entry = existing_output.get(film_id, {})

        streaming = default_streaming(existing_entry)
        physical_media = default_physical_media(film["title"], existing_entry)
        physical_media["last_checked"] = build_checked_at

        tmdb_id = find_tmdb_id(film, tmdb_metadata, tmdb_api_key)
        if tmdb_api_key and tmdb_id:
            try:
                streaming = fetch_streaming_availability(tmdb_id, region, tmdb_api_key)
            except Exception as error:
                warnings.append(f"{film_id}: TMDb watch provider lookup failed ({error})")
        elif tmdb_api_key and not tmdb_id:
            warnings.append(f"{film_id}: no TMDb id available for streaming lookup")

        if ebay_access_token:
            try:
                physical_media["ebay"] = fetch_ebay_results(film, ebay_access_token, marketplace_id)
            except Exception as error:
                warnings.append(f"{film_id}: eBay lookup failed ({error})")

        output[film_id] = {
            "streaming": streaming,
            "physical_media": physical_media,
        }
        time.sleep(0.05)

    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(output)} availability records to {OUTPUT_PATH}")
    if warnings:
        print(f"Warnings: {len(warnings)}")
        for warning in warnings[:20]:
            print(f"- {warning}")


if __name__ == "__main__":
    main()
