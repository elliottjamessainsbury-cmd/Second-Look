#!/usr/bin/env python3
"""
Build pair-based editorial recommendation blurbs.

Usage:
  export OPENAI_API_KEY="your-key"
  python3 scripts/build_recommendation_blurbs.py

This script reads:
- data/curated-films.json
- data/film-metadata.json
- data/tmdb-metadata.json
- data/sample-movies.json

And writes:
- data/recommendation-blurbs.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CURATED_PATH = REPO_ROOT / "data/curated-films.json"
FILM_METADATA_PATH = REPO_ROOT / "data/film-metadata.json"
TMDB_METADATA_PATH = REPO_ROOT / "data/tmdb-metadata.json"
SAMPLE_MOVIES_PATH = REPO_ROOT / "data/sample-movies.json"
OUTPUT_PATH = REPO_ROOT / "data/recommendation-blurbs.json"
RESPONSES_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.4-mini"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build pair-based editorial recommendation blurbs."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N source/recommendation pairs.",
    )
    parser.add_argument(
        "--refresh-existing",
        action="store_true",
        help="Regenerate existing cached blurbs instead of skipping them.",
    )
    return parser.parse_args()


SYSTEM_PROMPT = """
You are writing recommendation copy for Second Look, a curated indie / arthouse / world cinema discovery app.

The product is taste-led, editorial, and discovery-first. Avoid generic streaming-platform language.

Never say only that two films share a genre, country, director, or vibe. Explain the deeper connection:
- theme
- emotional texture
- pacing
- formal style
- protagonist type
- moral tension
- visual rhythm
- political / social undercurrent
- cinematic movement
- why this is an unexpected but credible next step

Write like a sharp film programmer, not a marketing copywriter.
Keep it concise, specific, and human.
Return strict JSON only.
""".strip()


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def pair_key(source_title: str, recommended_title: str) -> str:
    return f"{source_title}::{recommended_title}"


def normalize(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def build_title_index(items: list[dict]) -> dict[str, dict]:
    return {
        normalize(item.get("title")): item
        for item in items
        if isinstance(item, dict) and normalize(item.get("title"))
    }


def shared_values(left: list[str] | None, right: list[str] | None) -> list[str]:
    left_values = {normalize(value): value for value in left or [] if normalize(value)}
    right_keys = {normalize(value) for value in right or [] if normalize(value)}
    return [value for key, value in left_values.items() if key in right_keys]


def call_openai(api_key: str, model: str, payload: dict) -> str:
    request = urllib.request.Request(
        RESPONSES_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_text = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"OpenAI API request failed: {exc.code} {error_text}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"OpenAI API request failed: {exc}") from exc

    output_text = result.get("output_text", "").strip()
    if output_text:
        return output_text

    parts = []
    for item in result.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "\n".join(part for part in parts if part).strip()


def extract_first_json_object(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    text = cleaned

    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in model output.")

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    raise ValueError("Unterminated JSON object in model output.")


def parse_llm_json(text: str) -> dict:
    candidate = extract_first_json_object(text)

    repairs = [
        candidate,
        re.sub(r",\s*([}\]])", r"\1", candidate),
        re.sub(r"[\x00-\x1f]+", " ", candidate),
        re.sub(r",\s*([}\]])", r"\1", re.sub(r"[\x00-\x1f]+", " ", candidate)),
    ]

    last_error = None
    for attempt in repairs:
        try:
            parsed = json.loads(attempt)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            last_error = exc

    raise ValueError(f"Could not parse model JSON: {last_error}")


def build_prompt(
    source_film: dict,
    recommended_title: str,
    film_metadata: dict,
    tmdb_metadata: dict,
    sample_movies_by_title: dict[str, dict],
) -> str:
    recommended_film_metadata = film_metadata.get(recommended_title, {})
    recommended_tmdb_metadata = tmdb_metadata.get(recommended_title, {})
    source_film_metadata = film_metadata.get(source_film["title"], {})
    source_tmdb_metadata = tmdb_metadata.get(source_film["title"], {})
    source_sample = sample_movies_by_title.get(normalize(source_film["title"]), {})
    recommended_sample = sample_movies_by_title.get(normalize(recommended_title), {})

    shared_themes = shared_values(source_sample.get("themes"), recommended_sample.get("themes"))
    shared_tone = shared_values(source_sample.get("tone"), recommended_sample.get("tone"))
    shared_genres = shared_values(source_tmdb_metadata.get("genres"), recommended_tmdb_metadata.get("genres"))
    shared_keywords = shared_values(source_tmdb_metadata.get("keywords"), recommended_tmdb_metadata.get("keywords"))
    shared_countries = shared_values(source_sample.get("countries"), recommended_sample.get("countries"))
    shared_pace = []
    if source_sample.get("pace") and recommended_sample.get("pace"):
        if normalize(source_sample.get("pace")) == normalize(recommended_sample.get("pace")):
            shared_pace = [source_sample.get("pace")]
    same_director = (
        normalize(source_tmdb_metadata.get("director")) != ""
        and normalize(source_tmdb_metadata.get("director"))
        == normalize(recommended_tmdb_metadata.get("director"))
    )
    curated_connection = {
        "is_manual_edge": bool(
            source_film.get("manual_links") and recommended_title in source_film.get("manual_links", [])
        ),
        "source_manual_links": source_film.get("manual_links", []),
        "source_sample_manual_links": source_sample.get("manual_links", []),
        "source_similar_to": source_sample.get("similar_to", []),
    }

    evidence_hints = []
    if curated_connection["is_manual_edge"]:
        evidence_hints.append("manual_edge")
    if shared_themes:
        evidence_hints.append("shared_sample_themes")
    if shared_tone:
        evidence_hints.append("shared_sample_tone")
    if shared_pace:
        evidence_hints.append("shared_sample_pace")
    if shared_keywords:
        evidence_hints.append("shared_tmdb_keywords")
    if shared_genres:
        evidence_hints.append("shared_tmdb_genres")
    if shared_countries:
        evidence_hints.append("shared_sample_countries")
    if same_director:
        evidence_hints.append("same_director")

    shared_signals = {
        "themes": shared_themes,
        "tone": shared_tone,
        "pace": shared_pace,
        "genres": shared_genres,
        "keywords": shared_keywords,
        "countries": shared_countries,
        "same_director": same_director,
        "source_editorial_notes": source_sample.get("editorial_notes", []),
        "recommended_editorial_notes": recommended_sample.get("editorial_notes", []),
        "evidence_hints": evidence_hints,
    }

    source_payload = {
        "title": source_film["title"],
        "year": source_film.get("year"),
        "sample": source_sample,
        "letterboxd": source_film_metadata,
        "tmdb": source_tmdb_metadata,
    }
    recommended_payload = {
        "title": recommended_title,
        "sample": recommended_sample,
        "letterboxd": recommended_film_metadata,
        "tmdb": recommended_tmdb_metadata,
    }

    return f"""
Source film:
{json.dumps(source_payload, ensure_ascii=False, indent=2)}

Recommended film:
{json.dumps(recommended_payload, ensure_ascii=False, indent=2)}

Known shared signals:
{json.dumps(shared_signals, ensure_ascii=False, indent=2)}

Curated graph connection:
{json.dumps(curated_connection, ensure_ascii=False, indent=2)}

Task:
Write a short recommendation rationale explaining why someone who liked the source film might like the recommended film.

Return strict JSON:
{{
  "primary_angle": "specific editorial connection",
  "supporting_points": ["point 1", "point 2"],
  "source_signals": ["signal 1", "signal 2"],
  "blurb": "1-2 sentence user-facing recommendation copy"
}}

Rules:
- Do not use generic phrases like "if you enjoyed X, you'll love Y"
- Do not over-rely on genre
- Do not mention unavailable data
- Be specific enough that the blurb could not apply to any random film
- Return JSON only. Do not use markdown fences or extra commentary.
""".strip()


def save_output(output: dict) -> None:
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set.")

    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    curated = load_json(CURATED_PATH)
    film_metadata = load_json(FILM_METADATA_PATH)
    tmdb_metadata = load_json(TMDB_METADATA_PATH)
    sample_movies = load_json(SAMPLE_MOVIES_PATH)
    sample_movies_by_title = build_title_index(sample_movies if isinstance(sample_movies, list) else [])
    existing = load_json(OUTPUT_PATH) if OUTPUT_PATH.exists() else {}

    output = dict(existing) if isinstance(existing, dict) else {}
    created = 0
    skipped = 0
    failed: list[str] = []
    pairs: list[tuple[dict, str, str]] = []

    for source_film in curated:
        for recommended_title in source_film.get("manual_links", []):
            key = pair_key(source_film["title"], recommended_title)
            pairs.append((source_film, recommended_title, key))

    if args.limit is not None:
        pairs = pairs[: max(args.limit, 0)]

    total_pairs = len(pairs)
    print(f"Planning to process {total_pairs} source/recommendation pairs...")

    for index, (source_film, recommended_title, key) in enumerate(pairs, start=1):
        print(f"[{index}/{total_pairs}] {key}")
        if not args.refresh_existing and key in output and output[key].get("blurb"):
            skipped += 1
            print("  Skipping: already cached")
            continue

        prompt = build_prompt(
            source_film,
            recommended_title,
            film_metadata,
            tmdb_metadata,
            sample_movies_by_title,
        )
        response_text = call_openai(
            api_key,
            model,
            {
                "model": model,
                "input": [
                    {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
                    {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
                ],
            },
        )

        try:
            parsed = parse_llm_json(response_text)
        except ValueError:
            failed.append(key)
            print("  Failed: could not parse model JSON")
            continue

        output[key] = {
            "primary_angle": parsed.get("primary_angle", ""),
            "supporting_points": parsed.get("supporting_points", [])[:3],
            "source_signals": parsed.get("source_signals", [])[:5],
            "blurb": parsed.get("blurb", "").strip(),
        }
        created += 1
        save_output(output)
        print("  Saved")

    save_output(output)
    print(f"Wrote {len(output)} recommendation blurbs to {OUTPUT_PATH}")
    print(f"Created: {created}")
    print(f"Skipped existing: {skipped}")
    print(f"Failed: {len(failed)}")
    if failed:
        print("Examples:", ", ".join(failed[:10]))


if __name__ == "__main__":
    main()
