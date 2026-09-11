#!/usr/bin/env python3
"""Build controlled editorial taste profiles for the curated film universe."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATED_PATH = ROOT / "data/curated-films.json"
TMDB_PATH = ROOT / "data/tmdb-metadata.json"
LETTERBOXD_PATH = ROOT / "data/film-metadata.json"
SAMPLE_PATH = ROOT / "data/sample-movies.json"
OUTPUT_PATH = ROOT / "data/film-taste-profiles.json"

CONTROLLED = {
    "themes": {
        "identity", "memory", "family", "grief", "love", "obsession", "violence",
        "power", "class", "isolation", "justice", "survival", "coming of age",
        "faith", "art", "history", "community", "mortality", "displacement",
        "technology", "desire", "work", "friendship", "revenge",
    },
    "mood": {
        "tender", "melancholic", "unsettling", "tense", "dreamlike", "comic",
        "hopeful", "romantic", "contemplative", "bleak", "visceral", "playful",
        "eerie", "exhilarating", "angry", "warm",
    },
    "tone": {
        "naturalistic", "lyrical", "satirical", "austere", "surreal",
        "expressionist", "intimate", "epic", "deadpan", "operatic", "suspenseful",
        "humanist", "provocative",
    },
    "formal_style": {
        "classical", "observational", "stylized", "experimental", "documentary",
        "theatrical", "nonlinear", "minimalist", "kinetic", "genre-driven",
    },
    "pace": {"slow", "measured", "steady", "brisk"},
    "intensity": {"low", "medium", "high"},
    "ambiguity": {"clear", "open", "opaque"},
    "accessibility": {"approachable", "demanding", "challenging"},
}

THEME_PATTERNS = {
    "identity": ["identity", "double life", "self discovery", "gender", "masquerade"],
    "memory": ["memory", "past", "recollection", "nostalgia", "remember"],
    "family": ["family", "father", "mother", "parent", "daughter", "son", "marriage"],
    "grief": ["grief", "loss", "mourning", "bereavement"],
    "love": ["love", "romance", "relationship", "affair", "marriage"],
    "obsession": ["obsession", "obsessive", "voyeur", "jealous", "fixation"],
    "violence": ["violence", "murder", "war", "crime", "gang", "killer", "brutal"],
    "power": ["power", "politic", "authority", "dictator", "corruption", "control"],
    "class": ["class", "wealth", "poverty", "bourgeois", "working class", "social"],
    "isolation": ["isolation", "lonely", "loneliness", "alienation", "solitude"],
    "justice": ["justice", "trial", "court", "police", "investigation", "law"],
    "survival": ["survival", "survive", "escape", "disaster", "apocalyptic"],
    "coming of age": ["coming of age", "childhood", "adolesc", "teen", "youth"],
    "faith": ["faith", "religion", "god", "spiritual", "church", "ritual"],
    "art": ["artist", "cinema", "film", "music", "writer", "theatre", "dance"],
    "history": ["histor", "period drama", "biography", "revolution"],
    "community": ["community", "village", "neighbour", "collective"],
    "mortality": ["death", "mortality", "dying", "illness", "aging"],
    "displacement": ["migration", "immigrant", "exile", "refugee", "displacement"],
    "technology": ["technology", "computer", "robot", "artificial intelligence", "space"],
    "desire": ["desire", "sexual", "erotic", "seduction", "passion"],
    "work": ["work", "labour", "office", "factory", "career"],
    "friendship": ["friend", "friendship", "companionship"],
    "revenge": ["revenge", "vengeance", "retribution"],
}

MOVEMENTS = {
    "French New Wave": {"Jean-Luc Godard", "François Truffaut", "Agnès Varda", "Éric Rohmer", "Jacques Rivette", "Alain Resnais"},
    "New German Cinema": {"Rainer Werner Fassbinder", "Werner Herzog", "Wim Wenders", "Margarethe von Trotta"},
    "Japanese New Wave": {"Nagisa Ōshima", "Shohei Imamura", "Hiroshi Teshigahara", "Masahiro Shinoda"},
    "Czech New Wave": {"Věra Chytilová", "Miloš Forman", "Jiří Menzel"},
    "New Hollywood": {"Robert Altman", "Francis Ford Coppola", "Martin Scorsese", "John Cassavetes", "Brian De Palma"},
    "Hong Kong New Wave": {"Wong Kar-wai", "Ann Hui", "John Woo", "Tsui Hark", "Stanley Kwan"},
    "Dogme 95": {"Lars von Trier", "Thomas Vinterberg"},
    "Romanian New Wave": {"Cristian Mungiu", "Cristi Puiu", "Radu Jude", "Corneliu Porumboiu"},
    "British social realism": {"Mike Leigh", "Ken Loach", "Lynne Ramsay", "Alan Clarke"},
}


def norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def has_any(text: str, needles: list[str]) -> bool:
    padded = f" {text} "
    return any(f" {norm(needle)} " in padded for needle in needles)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def value_by_film(records: dict, title: str, year: int | None) -> dict:
    exact = [item for item in records.values() if norm(item.get("title")) == norm(title) and (not year or item.get("year") == year)]
    if exact:
        return exact[0]
    return next((item for item in records.values() if norm(item.get("title")) == norm(title)), {})


def pick_terms(text: str, patterns: dict[str, list[str]], minimum: int = 2, maximum: int = 5) -> list[str]:
    selected = [label for label, needles in patterns.items() if any(needle in text for needle in needles)]
    defaults = ["identity", "community", "mortality", "love", "power"]
    for label in defaults:
        if len(selected) >= minimum:
            break
        if label not in selected:
            selected.append(label)
    return selected[:maximum]


def movement_for(director: str) -> str:
    director_key = norm(director)
    return next(
        (movement for movement, directors in MOVEMENTS.items() if director_key in {norm(item) for item in directors}),
        "",
    )


def derive_profile(curated: dict, tmdb: dict, letterboxd: dict, sample: dict) -> dict:
    genres = [str(value) for value in tmdb.get("genres", [])]
    keywords = [str(value) for value in tmdb.get("keywords", [])]
    overview = tmdb.get("overview") or letterboxd.get("intro") or ""
    director = tmdb.get("director") or letterboxd.get("director") or sample.get("director") or ""
    text = norm(" ".join([
        curated["title"], overview, " ".join(genres), " ".join(keywords),
        " ".join(sample.get("themes", [])), " ".join(sample.get("tone", [])),
        " ".join(sample.get("tags", [])),
    ]))

    themes = [norm(value) for value in sample.get("themes", []) if norm(value) in CONTROLLED["themes"]]
    themes = list(dict.fromkeys(themes + pick_terms(text, THEME_PATTERNS)))[:5]

    mood = [norm(value) for value in sample.get("tone", []) if norm(value) in CONTROLLED["mood"]]
    if has_any(text, ["horror", "haunting", "supernatural", "nightmare", "ghost"]):
        mood.extend(["unsettling", "eerie"])
    if has_any(text, ["thriller", "suspense", "crime", "murder"]):
        mood.append("tense")
    if has_any(text, ["comedy", "comic", "satire", "funny"]):
        mood.append("comic")
    if has_any(text, ["romance", "love", "tender", "intimate"]):
        mood.extend(["romantic", "tender"])
    if has_any(text, ["melancholic", "grief", "loss", "lonely", "loneliness"]):
        mood.append("melancholic")
    if has_any(text, ["dream", "surreal", "fantasy", "memory"]):
        mood.append("dreamlike")
    if has_any(text, ["action", "adventure", "chase", "martial arts"]):
        mood.append("exhilarating")
    if has_any(text, ["war", "brutal", "violent", "body horror"]):
        mood.append("visceral")
    if not mood:
        mood = ["contemplative", "tense"] if "Drama" in genres else ["playful", "hopeful"]
    mood = list(dict.fromkeys(mood))[:4]

    tone = [norm(value) for value in sample.get("tone", []) if norm(value) in CONTROLLED["tone"]]
    if "Documentary" in genres:
        tone.extend(["naturalistic", "humanist"])
    if has_any(text, ["surreal", "dream", "absurd"]):
        tone.append("surreal")
    if has_any(text, ["satire", "satirical", "black comedy"]):
        tone.append("satirical")
    if has_any(text, ["epic", "war", "historical"]):
        tone.append("epic")
    if has_any(text, ["intimate", "relationship", "family"]):
        tone.append("intimate")
    if has_any(text, ["lyrical", "poetic", "memory"]):
        tone.append("lyrical")
    if not tone:
        tone = ["naturalistic", "humanist"]
    tone = list(dict.fromkeys(tone))[:4]

    formal_style = []
    if "Documentary" in genres:
        formal_style.append("documentary")
    if has_any(text, ["experimental", "avant garde", "nonlinear", "dream"]):
        formal_style.extend(["experimental", "nonlinear"])
    if has_any(text, ["stylized", "expressionist", "neon", "surreal"]):
        formal_style.append("stylized")
    if has_any(text, ["minimal", "austere", "slow cinema"]):
        formal_style.append("minimalist")
    if has_any(text, ["action", "thriller", "horror", "western"]):
        formal_style.append("genre-driven")
    formal_style.append("observational" if "Drama" in genres else "classical")
    formal_style = list(dict.fromkeys(formal_style))[:3]

    slow_catalogue = {
        "aparajito-1956", "tropical-malady-2004", "the-look-of-silence-2014",
        "persona-1966", "harakiri-1962", "time-of-the-wolf-2003", "the-ascent-1977",
        "shoah-1985", "eraserhead-1977", "autumn-sonata-1978", "ash-is-purest-white-2018",
        "haxan-1922", "wax-or-the-discovery-of-television-among-the-bees-1991",
        "3-women-1977", "solaris-2002", "dersu-uzala-1975", "code-unknown-2000",
        "f-for-fake-1973", "meshes-of-the-afternoon-1943", "radio-on-1979",
        "platform-2000", "71-fragments-of-a-chronology-of-chance-1994",
        "the-third-part-of-the-night-1971", "peter-hujar-s-day-2025", "penda-s-fen-1974",
    }
    pace = norm(sample.get("pace"))
    if curated["film_id"] in slow_catalogue:
        pace = "slow"
    if pace not in CONTROLLED["pace"]:
        if has_any(text, ["slow", "meditative", "patient", "minimal"]):
            pace = "slow"
        elif has_any(text, ["action", "chase", "fast paced", "thriller"]):
            pace = "brisk"
        elif "Drama" in genres or "Documentary" in genres:
            pace = "measured"
        else:
            pace = "steady"

    intensity = "high" if has_any(text, ["horror", "war", "violent", "brutal", "murder", "trauma"]) else "medium"
    if pace == "slow" and not has_any(text, ["horror", "violent", "trauma"]):
        intensity = "low"

    ambiguity = "opaque" if has_any(text, ["surreal", "experimental", "dream", "nonlinear"]) else "open"
    if has_any(text, ["biography", "true story", "documentary", "courtroom"]):
        ambiguity = "clear"

    demanding = pace == "slow" or "experimental" in formal_style or ambiguity == "opaque"
    accessibility = "challenging" if ambiguity == "opaque" or demanding and intensity == "high" else "demanding" if demanding else "approachable"
    movement = movement_for(director)

    notes = sample.get("editorial_notes", [])
    editorial_notes = str(notes[0]).strip() if notes else (
        f"A {pace} {tone[0]} film, especially useful for matching {', '.join(themes[:3])}."
    )

    profile = {
        "themes": themes,
        "mood": mood,
        "tone": tone,
        "formal_style": formal_style,
        "pace": pace,
        "intensity": intensity,
        "ambiguity": ambiguity,
        "accessibility": accessibility,
        "movement": movement,
        "editorial_notes": editorial_notes,
    }
    validate_profile(curated["film_id"], profile)
    return profile


def validate_profile(film_id: str, profile: dict) -> None:
    required = set(CONTROLLED) | {"movement", "editorial_notes"}
    if set(profile) != required:
        raise ValueError(f"{film_id}: invalid fields {sorted(set(profile) ^ required)}")
    for field in ("themes", "mood", "tone", "formal_style"):
        values = profile[field]
        if not values or any(value not in CONTROLLED[field] for value in values):
            raise ValueError(f"{film_id}: invalid {field}: {values}")
    for field in ("pace", "intensity", "ambiguity", "accessibility"):
        if profile[field] not in CONTROLLED[field]:
            raise ValueError(f"{film_id}: invalid {field}: {profile[field]}")
    if not profile["editorial_notes"]:
        raise ValueError(f"{film_id}: missing editorial_notes")


def main() -> None:
    curated = load_json(CURATED_PATH)
    tmdb_records = load_json(TMDB_PATH)
    letterboxd_records = load_json(LETTERBOXD_PATH)
    samples = {norm(item.get("title")): item for item in load_json(SAMPLE_PATH)}

    output = {}
    for film in curated:
        title = film["title"]
        year = film.get("year")
        output[film["film_id"]] = derive_profile(
            film,
            value_by_film(tmdb_records, title, year),
            value_by_film(letterboxd_records, title, year),
            samples.get(norm(title), {}),
        )

    if len(output) != len(curated):
        raise ValueError("Every curated film must have exactly one taste profile.")
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(output)} controlled taste profiles to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
