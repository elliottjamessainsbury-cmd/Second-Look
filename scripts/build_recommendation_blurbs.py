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


CURATED_PATH = Path("/Users/elliott/Documents/New project/data/curated-films.json")
FILM_METADATA_PATH = Path("/Users/elliott/Documents/New project/data/film-metadata.json")
TMDB_METADATA_PATH = Path("/Users/elliott/Documents/New project/data/tmdb-metadata.json")
OUTPUT_PATH = Path("/Users/elliott/Documents/New project/data/recommendation-blurbs.json")
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
    return parser.parse_args()


SYSTEM_PROMPT = """
You are an expert film editor and critic writing short, intelligent recommendation blurbs for a movie discovery app.

Return valid JSON only:
{
  "primary_angle": "string",
  "supporting_points": ["string", "string", "string"],
  "source_signals": ["string", "string", "string"],
  "blurb": "string"
}

Rules:
- Write like a smart, concise film journalist or festival programmer.
- Be specific, vivid, and human.
- Never sound generic or salesy.
- Do not invent facts not present in the provided data.
- Focus on the strongest 1 to 2 recommendation angles, not everything.
- Mention contrast when it sharpens the recommendation.
- Avoid vague filler like "compelling narrative" or "masterpiece".
- Do not rely on the phrase "the system recommends".
- If data is thin, write cautiously and narrowly.
- Keep the blurb to 2 to 4 sentences and ideally 60 to 120 words.
- supporting_points should be short, machine-usable phrases, not long prose.
- source_signals should be short references to what evidence was used, e.g. tmdb_keywords, tmdb_cast, letterboxd_intro, director_match.
""".strip()


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def pair_key(source_title: str, recommended_title: str) -> str:
    return f"{source_title}::{recommended_title}"


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


def build_prompt(source_film: dict, recommended_title: str, film_metadata: dict, tmdb_metadata: dict) -> str:
    recommended_film_metadata = film_metadata.get(recommended_title, {})
    recommended_tmdb_metadata = tmdb_metadata.get(recommended_title, {})
    source_film_metadata = film_metadata.get(source_film["title"], {})
    source_tmdb_metadata = tmdb_metadata.get(source_film["title"], {})

    payload = {
        "source_film": {
            "title": source_film["title"],
            "year": source_film.get("year"),
            "manual_links": source_film.get("manual_links", []),
            "letterboxd": source_film_metadata,
            "tmdb": source_tmdb_metadata,
        },
        "recommended_film": {
            "title": recommended_title,
            "letterboxd": recommended_film_metadata,
            "tmdb": recommended_tmdb_metadata,
        },
    }

    return (
        "Write an editorial recommendation explanation for this exact source/recommendation pair.\n\n"
        "Return one JSON object only. Do not use markdown fences. Do not add trailing commas. Do not add text before or after the JSON.\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


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
        if key in output and output[key].get("blurb"):
            skipped += 1
            print("  Skipping: already cached")
            continue

        prompt = build_prompt(source_film, recommended_title, film_metadata, tmdb_metadata)
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
