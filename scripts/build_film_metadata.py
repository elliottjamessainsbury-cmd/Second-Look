import json
import time
import re
import unicodedata
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path


WORKBOOK_PATH = Path("/Users/elliott/Downloads/Film curation .xlsx")
CURATED_PATH = Path("/Users/elliott/Documents/New project/data/curated-films.json")
OUTPUT_PATH = Path("/Users/elliott/Documents/New project/data/film-metadata.json")
FALLBACKS_PATH = Path("/Users/elliott/Documents/New project/data/letterboxd-fallbacks.json")
CRITERION_PATH = Path("/Users/elliott/Documents/New project/data/criterion-closet-picks.json")

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = normalized.encode("ascii", "ignore").decode("ascii").lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[’']", "", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalized.strip()


def read_xlsx_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for si in root.findall("a:si", NS):
                shared_strings.append("".join(t.text or "" for t in si.iterfind(".//a:t", NS)))

        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall("pr:Relationship", NS)
        }

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = workbook.find("a:sheets/a:sheet", NS)
        relation_id = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        sheet_xml = ET.fromstring(archive.read("xl/" + rel_map[relation_id]))
        rows = sheet_xml.findall(".//a:sheetData/a:row", NS)

        def cell_value(cell) -> str:
            cell_type = cell.attrib.get("t")
            value = cell.find("a:v", NS)
            inline = cell.find("a:is", NS)
            if cell_type == "s" and value is not None:
                return shared_strings[int(value.text)]
            if cell_type == "inlineStr" and inline is not None:
                return "".join(t.text or "" for t in inline.iterfind(".//a:t", NS))
            if value is not None:
                return value.text or ""
            return ""

        return [[cell_value(cell) for cell in row.findall("a:c", NS)] for row in rows]


def title_map_from_workbook() -> dict[str, dict]:
    _, *rows = read_xlsx_rows(WORKBOOK_PATH)
    mapping = {}
    for row in rows:
        padded = row + [""] * (5 - len(row))
        title, year_raw, letterboxd_uri = padded[:3]
        title = str(title).strip()
        if not title or not str(letterboxd_uri).strip():
            continue

        try:
            year = int(float(year_raw))
        except ValueError:
            year = None

        key = normalize(title)
        if key not in mapping:
            mapping[key] = {
                "title": title,
                "year": year,
                "letterboxd_uri": str(letterboxd_uri).strip(),
            }
    return mapping


def extract_meta(html: str, name: str, attr: str = "property") -> str:
    pattern = re.compile(
        rf'<meta[^>]+{attr}="{re.escape(name)}"[^>]+content="([^"]+)"',
        re.IGNORECASE,
    )
    match = pattern.search(html)
    if match:
        return unescape(match.group(1)).strip()
    return ""


def extract_film_url_from_review(html: str) -> str:
    patterns = [
        r'"sameAs":"(https://letterboxd\.com/film/[^"]+/)"',
        r'data-item-link="(/film/[^"]+/)"',
        r'<h2 class="primaryname prettify"><a href="(/film/[^"]+/)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            url = unescape(match.group(1))
            if url.startswith("/"):
                return "https://letterboxd.com" + url
            return url
    return ""


def extract_structured_poster(html: str) -> str:
    patterns = [
        r'"itemReviewed":\{.*?"image":"([^"]+)"',
        r'"@type":"Movie".*?"image":"([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.DOTALL)
        if match:
            return unescape(match.group(1)).strip()
    return ""


def fetch_html(url: str) -> str:
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Language": "en-GB,en;q=0.9",
                },
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))
    raise last_error


def fetch_letterboxd_metadata(url: str) -> dict:
    html = fetch_html(url)

    page_type = extract_meta(html, "og:type")
    title_with_year = extract_meta(html, "og:title")

    if page_type == "letterboxd:review":
        review_poster = extract_structured_poster(html)
        film_url = extract_film_url_from_review(html)
        if film_url:
            film_html = fetch_html(film_url)
            film_title = extract_meta(film_html, "og:title")
            film_description = extract_meta(film_html, "og:description")
            film_image = extract_structured_poster(film_html) or extract_meta(film_html, "og:image")
            director = extract_meta(film_html, "twitter:data1", attr="name")
            average_rating = extract_meta(film_html, "twitter:data2", attr="name")
            year_match = re.search(r"\((\d{4})\)", film_title)
            year = int(year_match.group(1)) if year_match else None
            parsed_title = re.sub(r"\s*\(\d{4}\)\s*$", "", film_title).strip()
            return {
                "page_type": "letterboxd:film",
                "title": parsed_title,
                "year": year,
                "director": director,
                "intro": film_description,
                "poster_url": review_poster or film_image,
                "letterboxd_url": film_url,
                "review_rating": "",
                "average_rating": average_rating,
                "twitter_title": extract_meta(film_html, "twitter:title", attr="name"),
            }

    description = extract_meta(html, "og:description")
    image_url = extract_structured_poster(html) or extract_meta(html, "og:image")
    twitter_title = extract_meta(html, "twitter:title", attr="name")
    review_rating = extract_meta(html, "twitter:data2", attr="name")
    average_rating = review_rating if page_type == "video.movie" else ""
    year_match = re.search(r"\((\d{4})\)", title_with_year)
    year = int(year_match.group(1)) if year_match else None
    parsed_title = re.sub(r"^A\s+★★★★★?\s+review of\s+", "", title_with_year, flags=re.IGNORECASE)
    parsed_title = re.sub(r"\s*\(\d{4}\)\s*$", "", parsed_title).strip(" '")
    director = extract_meta(html, "twitter:data1", attr="name") if page_type != "letterboxd:review" else ""

    return {
        "page_type": page_type,
        "title": parsed_title,
        "year": year,
        "director": director,
        "intro": description,
        "poster_url": image_url,
        "letterboxd_url": url,
        "review_rating": review_rating,
        "average_rating": average_rating,
        "twitter_title": twitter_title,
    }


def main() -> None:
    curated = json.loads(CURATED_PATH.read_text())
    criterion = json.loads(CRITERION_PATH.read_text()) if CRITERION_PATH.exists() else []
    workbook_titles = title_map_from_workbook()
    fallbacks = json.loads(FALLBACKS_PATH.read_text()) if FALLBACKS_PATH.exists() else {}

    targets = set()
    for item in curated:
        targets.add(item["title"])
        for manual_link in item["manual_links"]:
            targets.add(manual_link)
    for entry in criterion:
        for pick in entry["picks"]:
            targets.add(pick)

    output = {}
    missing = []

    for title in sorted(targets):
        workbook_entry = workbook_titles.get(normalize(title))
        target_url = ""
        fallback_url = fallbacks.get(title)
        if fallback_url:
            target_url = fallback_url
            if not workbook_entry:
                workbook_entry = {"year": None}
        elif workbook_entry:
            target_url = workbook_entry["letterboxd_uri"]
        else:
            missing.append(title)
            continue

        if workbook_entry is None:
            workbook_entry = {"year": None}

        try:
            meta = fetch_letterboxd_metadata(target_url)
        except Exception:
            missing.append(title)
            continue

        output[title] = {
            "title": meta["title"] or title,
            "year": meta["year"] or workbook_entry["year"],
            "director": meta["director"],
            "intro": meta["intro"],
            "poster_url": meta["poster_url"],
            "letterboxd_url": meta["letterboxd_url"],
            "average_rating": meta["average_rating"],
            "page_type": meta["page_type"],
            "review_rating": meta["review_rating"],
        }

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(output)} metadata records to {OUTPUT_PATH}")
    print(f"Missing metadata for {len(missing)} titles")
    if missing:
        print("Examples:", ", ".join(missing[:20]))


if __name__ == "__main__":
    main()
