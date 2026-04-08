import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path
from typing import Optional


WORKBOOK_PATH = Path("/Users/elliott/Downloads/Film curation .xlsx")
OUTPUT_PATH = Path("/Users/elliott/Documents/New project/data/curated-films.json")

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


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

        extracted = []
        for row in rows:
            extracted.append([cell_value(cell) for cell in row.findall("a:c", NS)])
        return extracted


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized


def parse_year(value: str) -> Optional[int]:
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def parse_rating(value: str) -> Optional[float]:
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_manual_links(value: str) -> list[str]:
    text = str(value).strip()
    if not text or text.lower() == "yes":
        return []

    parts = [part.strip() for part in text.split(",")]
    return [part for part in parts if part]


def dedupe_preserve_order(items: list[str]) -> list[str]:
    return list(OrderedDict((item, None) for item in items))


def main() -> None:
    rows = read_xlsx_rows(WORKBOOK_PATH)
    _, *data_rows = rows

    groups: OrderedDict[tuple[str, int | None], dict] = OrderedDict()

    for row in data_rows:
        padded = row + [""] * (5 - len(row))
        title, year_raw, letterboxd_uri, rating_raw, would_also_like = padded[:5]
        title = str(title).strip()
        if not title:
            continue

        year = parse_year(year_raw)
        rating = parse_rating(rating_raw)
        manual_links = parse_manual_links(would_also_like)

        key = (title.casefold(), year)
        group = groups.setdefault(
            key,
            {
                "title": title,
                "year": year,
                "film_id": f"{slugify(title)}-{year}" if year else slugify(title),
                "elliott_rating": None,
                "manual_links": [],
                "source_row_count": 0,
            },
        )

        group["source_row_count"] += 1

        if rating is not None and (
            group["elliott_rating"] is None or rating > group["elliott_rating"]
        ):
            group["elliott_rating"] = rating

        group["manual_links"].extend(manual_links)

    output = []
    for group in groups.values():
        deduped_links = dedupe_preserve_order(group["manual_links"])
        if not deduped_links:
            continue

        record = {
            "film_id": group["film_id"],
            "title": group["title"],
            "year": group["year"],
            "elliott_rating": group["elliott_rating"],
            "manual_links": deduped_links,
            "source_row_count": group["source_row_count"],
        }
        output.append(record)

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(output)} deduped records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
