#!/usr/bin/env python3
"""
Build London cinema showtimes data.
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "data" / "cinema-showtimes.json"

LONDON_TZ = ZoneInfo("Europe/London")
USER_AGENT = "SecondLook-CinemaShowtimes/1.0"
BFI_SEARCH_ID = "25E7EA2E-291F-44F9-8EBC-E560154FDAEB"
BFI_TEXT_RENDERER_PREFIX = "https://r.jina.ai/http://r.jina.ai/http://"
DEFAULT_DAY_COUNT = 7


class CinemaParseError(RuntimeError):
    pass


@dataclass
class Screening:
    date: str
    cinema: str
    display_title: str
    showtime: str
    ticket_url: str


def iso_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value)


def repair_mojibake(value: str) -> str:
    try:
        repaired = value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    return repaired if repaired else value


def clean_text(value: str) -> str:
    text = html.unescape(html.unescape(strip_tags(value or "")))
    text = repair_mojibake(text)
    text = text.replace("\xa0", " ")
    return collapse_whitespace(text)


def normalize_title(value: str) -> str:
    text = clean_text(value).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[’']", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def normalize_showtime(value: str) -> str:
    text = clean_text(value).lower().replace(".", ":")
    text = re.sub(r"\s+", " ", text)

    for pattern in ("%H:%M", "%I:%M %p"):
        try:
            parsed = datetime.strptime(text.upper(), pattern)
            return parsed.strftime("%H:%M")
        except ValueError:
            continue

    raise CinemaParseError(f"Unsupported showtime format: {value!r}")


def current_london_date() -> date:
    override = os.environ.get("CINEMA_SHOWTIMES_BASE_DATE")
    if override:
        return date.fromisoformat(override)
    return datetime.now(LONDON_TZ).date()


def target_dates() -> list[date]:
    today = current_london_date()
    day_count = int(os.environ.get("CINEMA_SHOWTIMES_DAYS", DEFAULT_DAY_COUNT))
    if day_count < 1:
        raise CinemaParseError("CINEMA_SHOWTIMES_DAYS must be at least 1")
    return [today + timedelta(days=offset) for offset in range(day_count)]


def fetch_url(url: str, cinema: str, expect_bytes: bool = False) -> str | bytes:
    print(f"[{cinema}] fetched URL: {url}")
    payload: bytes | None = None

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
    except (urllib.error.URLError, TimeoutError):
        curl_result = subprocess.run(
            ["curl", "-L", "--max-time", "30", "-A", USER_AGENT, url],
            capture_output=True,
            check=False,
        )
        if curl_result.returncode != 0:
            stderr = collapse_whitespace(curl_result.stderr.decode("utf-8", errors="ignore"))
            raise CinemaParseError(f"request failed: {stderr or f'curl exit {curl_result.returncode}'}")
        payload = curl_result.stdout

    if expect_bytes:
        return payload

    text = payload.decode("utf-8", errors="ignore")
    if "Enable JavaScript and cookies to continue" in text or "<title>Just a moment...</title>" in text:
        raise CinemaParseError("site returned a Cloudflare challenge")
    return text


def parse_relative_or_named_date(value: str) -> str:
    label = clean_text(value)
    today = current_london_date()
    if label == "Today":
        return today.isoformat()
    if label == "Tomorrow":
        return (today + timedelta(days=1)).isoformat()
    return datetime.strptime(label, "%A %d %b %Y").date().isoformat()


def split_sections(html_text: str, marker_pattern: str) -> list[tuple[re.Match[str], str]]:
    matches = list(re.finditer(marker_pattern, html_text, re.S))
    sections: list[tuple[re.Match[str], str]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(html_text)
        sections.append((match, html_text[start:end]))
    return sections


def parse_prince_charles(target_dates: set[str]) -> list[Screening]:
    cinema = "Prince Charles Cinema"
    html_text = fetch_url("https://princecharlescinema.com/next-7-days/", cinema)
    screenings: list[Screening] = []

    for heading_match, section in split_sections(html_text, r'<div class="day"><h4>(.*?)</h4>'):
        date_iso = parse_relative_or_named_date(heading_match.group(1))
        if date_iso not in target_dates:
            continue

        for chunk in section.split('<div class="performance-dayslist">')[1:]:
            title_match = re.search(r'<div class="leftsideperf">.*?<a href="([^"]+)">(.*?)</a>', chunk, re.S)
            time_match = re.search(r'<span class="time">([^<]+)</span>', chunk)
            ticket_match = re.search(r'<a(?:[^>]*href="([^"]+)")?[^>]*class="(?:sold)?film_book_button"', chunk)

            if not title_match or not time_match:
                continue

            film_url = title_match.group(1)
            ticket_url = ticket_match.group(1) if ticket_match and ticket_match.group(1) else film_url
            screenings.append(
                Screening(
                    date=date_iso,
                    cinema=cinema,
                    display_title=clean_text(title_match.group(2)),
                    showtime=normalize_showtime(time_match.group(1)),
                    ticket_url=ticket_url,
                )
            )

    return screenings


def parse_garden_cinema(target_dates: set[str]) -> list[Screening]:
    cinema = "The Garden Cinema"
    html_text = fetch_url("https://www.thegardencinema.co.uk/", cinema)
    screenings: list[Screening] = []

    for block_match, section in split_sections(html_text, r'<div class="date-block"[^>]*data-date="([^"]+)"'):
        date_iso = block_match.group(1)
        if date_iso not in target_dates:
            continue

        for chunk in section.split('<div class="films-list__by-date__film"')[1:]:
            title_match = re.search(
                r'<h1 class="films-list__by-date__film__title"><a\s+href="([^"]+)">(.*?)</a></h1>',
                chunk,
                re.S,
            )
            if not title_match:
                continue

            raw_title = re.sub(
                r'<span class="films-list__by-date__film__rating">.*?</span>',
                "",
                title_match.group(2),
                flags=re.S,
            )
            title = clean_text(raw_title)
            times = re.findall(r'<a class="screening[^"]*" href="([^"]+)">([^<]+)</a>', chunk)
            for ticket_url, raw_time in times:
                screenings.append(
                    Screening(
                        date=date_iso,
                        cinema=cinema,
                        display_title=title,
                        showtime=normalize_showtime(raw_time),
                        ticket_url=ticket_url,
                    )
                )

    return screenings


def parse_close_up(target_dates: set[str]) -> list[Screening]:
    cinema = "Close-Up Cinema"
    html_text = fetch_url("https://www.closeupfilmcentre.com/search_film_programmes/", cinema)
    shows_match = re.search(r"var shows ='(.*?)';", html_text, re.S)
    if not shows_match:
        raise CinemaParseError("could not find shows JSON payload")

    try:
        payload = json.loads(shows_match.group(1))
    except json.JSONDecodeError as error:
        raise CinemaParseError(f"invalid shows JSON: {error}") from error

    screenings: list[Screening] = []
    for item in payload:
        show_time = item.get("show_time", "")
        try:
            screening_dt = datetime.strptime(show_time, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

        date_iso = screening_dt.date().isoformat()
        if date_iso not in target_dates:
            continue

        ticket_url = item.get("blink") or urljoin("https://www.closeupfilmcentre.com", item.get("film_url", ""))
        screenings.append(
            Screening(
                date=date_iso,
                cinema=cinema,
                display_title=clean_text(item.get("title", "")),
                showtime=screening_dt.strftime("%H:%M"),
                ticket_url=ticket_url,
            )
        )

    return screenings


def parse_ica_date_label(value: str) -> str:
    label = clean_text(value)
    today = current_london_date()
    parsed = datetime.strptime(f"{label} {today.year}", "%A, %d %B %Y").date()
    if parsed < today - timedelta(days=30):
        parsed = parsed.replace(year=parsed.year + 1)
    return parsed.isoformat()


def parse_ica(target_dates: set[str]) -> list[Screening]:
    cinema = "ICA"
    html_text = fetch_url("https://www.ica.art/next-7-days", cinema)
    screenings: list[Screening] = []

    for heading_match, section in split_sections(html_text, r'<div class="docket-date">([^<]+)</div>'):
        date_iso = parse_ica_date_label(heading_match.group(1))
        if date_iso not in target_dates:
            continue

        for chunk in section.split('<div class="item films "')[1:]:
            href_match = re.search(r'<a href="(/films/[^"]+)">', chunk)
            title_matches = re.findall(r'<div class="title[^"]*">(.*?)</div>', chunk, re.S)
            time_matches = re.findall(r'<div class="time-slot">(.*?)</div>', chunk, re.S)
            if not href_match or not title_matches or not time_matches:
                continue

            href = href_match.group(1)
            title = clean_text(title_matches[-1])
            ticket_url = urljoin("https://www.ica.art", href)

            for raw_time in time_matches:
                screenings.append(
                    Screening(
                        date=date_iso,
                        cinema=cinema,
                        display_title=title,
                        showtime=normalize_showtime(raw_time),
                        ticket_url=ticket_url,
                    )
                )

    return screenings


def format_bfi_search_date(day: date) -> str:
    return f"{day.year}-{day.month}-{day.day}"


def build_bfi_search_url(start_date: date, end_date: date) -> str:
    query = {
        "BOset::WScontent::SearchCriteria::venue_filter": "",
        "BOset::WScontent::SearchCriteria::city_filter": "",
        "BOset::WScontent::SearchCriteria::month_filter": "",
        "BOset::WScontent::SearchCriteria::object_type_filter": "",
        "BOset::WScontent::SearchCriteria::category_filter": "",
        "BOset::WScontent::SearchCriteria::search_from": format_bfi_search_date(start_date),
        "BOset::WScontent::SearchCriteria::search_to": format_bfi_search_date(end_date),
        "doWork::WScontent::search": "1",
        "BOparam::WScontent::search::article_search_id": BFI_SEARCH_ID,
        "BOset::WScontent::SearchCriteria::search_criteria": "",
    }
    return f"https://whatson.bfi.org.uk/Online/default.asp?{urlencode(query)}"


def fetch_bfi_listing_page(start_date: date, end_date: date) -> str:
    url = build_bfi_search_url(start_date, end_date)
    try:
        return fetch_url(url, "BFI Southbank")
    except CinemaParseError as error:
        if "Cloudflare challenge" not in str(error):
            raise

    return fetch_url(f"{BFI_TEXT_RENDERER_PREFIX}{url}", "BFI Southbank")


def parse_bfi_southbank(target_dates: set[str]) -> list[Screening]:
    target_days = sorted(datetime.strptime(value, "%Y-%m-%d").date() for value in target_dates)
    page_text = fetch_bfi_listing_page(target_days[0], target_days[-1])
    screenings = parse_bfi_listing_text(page_text, target_dates)

    if not screenings:
        raise CinemaParseError("no BFI screenings extracted from live listings pages")

    return screenings


def parse_bfi_listing_text(page_text: str, target_dates: set[str]) -> list[Screening]:
    lines = [collapse_whitespace(line) for line in page_text.splitlines()]
    link_pattern = re.compile(
        r'^\[(?P<title>[^\]]+)\]\((?P<url>https://whatson\.bfi\.org\.uk/Online/default\.asp\?doWork::WScontent::loadArticle=[^\s)]+)'
    )
    date_pattern = re.compile(r"^-?([A-Za-z]+ \d{1,2} [A-Za-z]+ \d{4}) (\d{1,2}:\d{2})$")
    screenings: list[Screening] = []

    for index, line in enumerate(lines):
        link_match = link_pattern.match(line)
        if not link_match:
            continue

        date_match = None
        venue = ""
        for lookahead in lines[index + 1 : index + 8]:
            date_match = date_match or date_pattern.match(lookahead)
            if lookahead.startswith("Screen "):
                venue = lookahead
                break

        if not date_match or not venue.startswith("Screen NFT"):
            continue

        date_iso = datetime.strptime(date_match.group(1), "%A %d %B %Y").date().isoformat()
        if date_iso not in target_dates:
            continue

        screenings.append(
            Screening(
                date=date_iso,
                cinema="BFI Southbank",
                display_title=clean_text(link_match.group("title")),
                showtime=normalize_showtime(date_match.group(2)),
                ticket_url=link_match.group("url"),
            )
        )

    return screenings


def aggregate_screenings(screenings: list[Screening], target_days: list[date]) -> dict:
    by_day: dict[str, dict[tuple[str, str, str], dict]] = {
        day.isoformat(): {} for day in target_days
    }

    for screening in screenings:
        day_entries = by_day.get(screening.date)
        if day_entries is None:
            continue

        key = (
            normalize_title(screening.display_title),
            screening.cinema,
            screening.date,
        )
        existing = day_entries.get(key)
        if not existing:
            day_entries[key] = {
                "displayTitle": screening.display_title,
                "cinema": screening.cinema,
                "showtimes": [screening.showtime],
                "ticketUrl": screening.ticket_url,
            }
            continue

        if screening.showtime not in existing["showtimes"]:
            existing["showtimes"].append(screening.showtime)
            existing["showtimes"].sort()

        if screening.showtime == existing["showtimes"][0]:
            existing["ticketUrl"] = screening.ticket_url

    days_output = []
    for day in target_days:
        date_iso = day.isoformat()
        films = list(by_day[date_iso].values())
        for film in films:
            film["showtimes"] = sorted(film["showtimes"])

        films.sort(key=lambda item: (item["showtimes"][0], item["cinema"], item["displayTitle"]))
        days_output.append(
            {
                "date": date_iso,
                "label": day.strftime("%A"),
                "films": films,
            }
        )

    return {
        "generatedAt": iso_timestamp(),
        "days": days_output,
    }


def run_parser(cinema: str, parser, target_dates: set[str]) -> tuple[list[Screening], str | None]:
    try:
        screenings = parser(target_dates)
        print(f"[{cinema}] number of screenings parsed: {len(screenings)}")
        return screenings, None
    except Exception as error:
        message = collapse_whitespace(str(error)) or error.__class__.__name__
        print(f"[{cinema}] parser failure: {message}")
        return [], message


def build_payload() -> tuple[dict, dict[str, str | None]]:
    target_days = target_dates()
    target_date_values = {day.isoformat() for day in target_days}

    all_screenings: list[Screening] = []
    statuses: dict[str, str | None] = {}

    parsers = [
        ("BFI Southbank", parse_bfi_southbank),
        ("Prince Charles Cinema", parse_prince_charles),
        ("The Garden Cinema", parse_garden_cinema),
        ("ICA", parse_ica),
        ("Close-Up Cinema", parse_close_up),
    ]

    for cinema, parser in parsers:
        screenings, error = run_parser(cinema, parser, target_date_values)
        all_screenings.extend(screenings)
        statuses[cinema] = error

    return aggregate_screenings(all_screenings, target_days), statuses


def main() -> None:
    payload, statuses = build_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")

    successful = [cinema for cinema, error in statuses.items() if error is None]
    failed = {cinema: error for cinema, error in statuses.items() if error is not None}
    print(f"Successful cinemas: {', '.join(successful) if successful else 'none'}")
    if failed:
        print("Failed cinemas:")
        for cinema, error in failed.items():
            print(f"- {cinema}: {error}")


if __name__ == "__main__":
    main()
