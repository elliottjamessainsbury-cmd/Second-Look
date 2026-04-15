import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple, Union


ROOT = Path("/Users/elliott/Documents/New project")
FILMS_PATH = ROOT / "data/curated-films.json"
NODE_SOURCES_PATH = ROOT / "data/node-enrichment-sources.json"
NODE_MAP_PATH = ROOT / "data/film-node-enrichment-map.json"
CONNECTION_SOURCES_PATH = ROOT / "data/connection-sources.json"
CONNECTION_MAP_PATH = ROOT / "data/film-connection-source-map.json"

VALID_NODE_SOURCE_TYPES = {"canon_list", "internal_editorial"}
VALID_CONNECTION_SOURCE_TYPES = {
    "curated_programme",
    "editorial_article",
    "user_list",
    "internal_editorial",
}

NODE_ENRICHMENT_SEEDS = [
    {
        "id": "sight-and-sound-greatest-films-2022",
        "source_name": "Sight and Sound",
        "source_type": "canon_list",
        "title": "The Greatest Films of All Time (2022 Critics' Poll)",
        "weight": 1.0,
        "tags": ["canon", "critical-consensus", "global-cinema"],
        "film_ids": [
            "citizen-kane-1941",
            "vertigo-1958",
            "persona-1966",
            "rashomon-1950",
            "chungking-express-1994",
            "shoah-1985",
            "spirited-away-2001",
        ],
        "notes": "Top-priority canon enrichment layer for cultural prestige and critical positioning.",
    },
    {
        "id": "afi-100-years-100-movies-2007",
        "source_name": "American Film Institute",
        "source_type": "canon_list",
        "title": "AFI's 100 Years...100 Movies (10th Anniversary Edition)",
        "weight": 0.4,
        "tags": ["american-canon", "hollywood-classic", "institutional-canon"],
        "film_ids": [
            "citizen-kane-1941",
            "lawrence-of-arabia-1962",
            "singin-in-the-rain-1952",
            "all-about-eve-1950",
        ],
        "notes": "Useful as a lighter-touch American canon signal rather than a connection source.",
    },
    {
        "id": "afi-100-years-100-thrills-2001",
        "source_name": "American Film Institute",
        "source_type": "canon_list",
        "title": "AFI's 100 Years...100 Thrills",
        "weight": 0.4,
        "tags": ["american-genre-canon", "thriller-canon", "institutional-canon"],
        "film_ids": [
            "the-silence-of-the-lambs-1991",
            "the-shining-1980",
            "vertigo-1958",
        ],
        "notes": "Weak but still useful prestige signal for major American thrillers and horror-adjacent titles.",
    },
]

CONNECTION_SOURCE_SEEDS = [
    {
        "id": "slant-100-essential-horror-films",
        "source_name": "Slant Magazine",
        "source_type": "editorial_article",
        "title": "100 Essential Horror Films",
        "weight": 0.8,
        "tags": ["horror", "canon", "formal-extremity"],
        "film_ids": [
            "haxan-1922",
            "eraserhead-1977",
            "the-texas-chain-saw-massacre-1974",
            "the-shining-1980",
            "the-silence-of-the-lambs-1991",
        ],
        "notes": "High-signal editorial grouping for horror adjacency and canonized extremity.",
    },
    {
        "id": "bfi-dream-palaces-great-musicals",
        "source_name": "BFI Southbank",
        "source_type": "curated_programme",
        "title": "Dream Palaces: Great Musicals",
        "weight": 0.9,
        "tags": ["musical", "performance", "studio-spectacle"],
        "film_ids": [
            "singin-in-the-rain-1952",
            "cabaret-1972",
        ],
        "notes": "Repertory-programming signal for musical pathways and performance-driven recommendations.",
    },
    {
        "id": "prince-charles-stanley-kubrick-season",
        "source_name": "Prince Charles Cinema",
        "source_type": "curated_programme",
        "title": "Stanley Kubrick Season",
        "weight": 0.85,
        "tags": ["kubrick", "repertory-cinema", "cold-war-anxiety"],
        "film_ids": [
            "dr-strangelove-or-how-i-learned-to-stop-worrying-and-love-the-bomb-1964",
            "the-shining-1980",
        ],
        "notes": "Useful repertory linkage between canonical Kubrick titles without turning the whole layer into director matching.",
    },
    {
        "id": "letterboxd-official-top-250-narrative-feature-films",
        "source_name": "Letterboxd",
        "source_type": "user_list",
        "title": "The Official Top 250 Narrative Feature Films",
        "weight": 0.25,
        "tags": ["narrative-feature", "consensus-favorites", "canon", "user-list"],
        "film_ids": [
            "citizen-kane-1941",
            "vertigo-1958",
            "persona-1966",
            "lawrence-of-arabia-1962",
            "chungking-express-1994",
        ],
        "notes": "Low-signal community grouping that can add weak relational context without overpowering stronger editorial sources.",
    },
]


def load_catalogue_ids() -> Set[str]:
    films = json.loads(FILMS_PATH.read_text())
    return {film["film_id"] for film in films if film.get("film_id")}


def dedupe_preserve_order(values: List[str]) -> List[str]:
    seen = set()
    output = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def sanitize_source(
    seed: dict, valid_film_ids: Set[str], valid_source_types: Set[str]
) -> Tuple[dict, List[str]]:
    source_type = seed["source_type"]
    if source_type not in valid_source_types:
        raise ValueError(f"Unsupported source_type '{source_type}' for {seed['id']}")

    unmatched = []
    matched_ids = []
    for film_id in seed["film_ids"]:
        if film_id in valid_film_ids:
            matched_ids.append(film_id)
        else:
            unmatched.append(film_id)

    record = {
        "id": seed["id"],
        "source_name": seed["source_name"],
        "source_type": source_type,
        "title": seed["title"],
        "weight": seed["weight"],
        "tags": dedupe_preserve_order(seed["tags"]),
        "film_ids": dedupe_preserve_order(matched_ids),
    }
    if seed.get("notes"):
        record["notes"] = seed["notes"]
    return record, unmatched


def build_film_map(sources: List[dict]) -> Dict[str, List[str]]:
    film_map: Dict[str, List[str]] = defaultdict(list)
    for source in sources:
        for film_id in source["film_ids"]:
            film_map[film_id].append(source["id"])

    return {
        film_id: dedupe_preserve_order(source_ids)
        for film_id, source_ids in sorted(film_map.items())
    }


def write_json(path: Path, payload: Union[List[dict], Dict[str, List[str]]]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    valid_film_ids = load_catalogue_ids()

    node_sources = []
    connection_sources = []
    unmatched_by_source: Dict[str, List[str]] = {}

    for seed in NODE_ENRICHMENT_SEEDS:
        source, unmatched = sanitize_source(seed, valid_film_ids, VALID_NODE_SOURCE_TYPES)
        node_sources.append(source)
        if unmatched:
            unmatched_by_source[source["id"]] = unmatched

    for seed in CONNECTION_SOURCE_SEEDS:
        source, unmatched = sanitize_source(seed, valid_film_ids, VALID_CONNECTION_SOURCE_TYPES)
        connection_sources.append(source)
        if unmatched:
            unmatched_by_source[source["id"]] = unmatched

    write_json(NODE_SOURCES_PATH, node_sources)
    write_json(NODE_MAP_PATH, build_film_map(node_sources))
    write_json(CONNECTION_SOURCES_PATH, connection_sources)
    write_json(CONNECTION_MAP_PATH, build_film_map(connection_sources))

    print(
        f"Wrote {len(node_sources)} node enrichment sources and "
        f"{len(connection_sources)} connection sources."
    )

    if unmatched_by_source:
        print("Skipped unmatched film IDs:")
        for source_id, film_ids in sorted(unmatched_by_source.items()):
            print(f"  - {source_id}: {', '.join(film_ids)}")
    else:
        print("All referenced film IDs matched the closed curated dataset.")


if __name__ == "__main__":
    main()
