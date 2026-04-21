# Cinema Showtimes Feature

## Purpose
Surface repertory and indie cinema listings in London so users can discover films they can attend today or tomorrow.

## Scope
- Display "Today" and "Tomorrow" showtimes
- Include:
  - film title
  - cinema name
  - showtimes
  - ticket URL
- Deduplicate same film + cinema + date
- Aggregate showtimes

## Supported Cinemas (v1)
- BFI Southbank
- Prince Charles Cinema
- The Garden Cinema
- Close-Up Cinema

## Data Output
File: `data/cinema-showtimes.json`

Shape:
```json
{
  "generatedAt": "ISO_TIMESTAMP",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "label": "Today",
      "films": [
        {
          "displayTitle": "Film Title",
          "cinema": "Cinema Name",
          "showtimes": ["18:10", "20:45"],
          "ticketUrl": "https://..."
        }
      ]
    }
  ]
}

## Rendering
- Add new card to homepage
- Title: "Playing in London"
- Sections:
    - Today
    - Tomorrow
- Show:
    - title
    - cinema
    - showtimes
    - booking link

## Additional Requirements
- Sort films by earliest showtime
- Display "Updated at {time}" using generatedAt
- Do not integrate with recommendation graph yet

## Build Logic
- Script: scripts/build_cinema_showtimes.py
- Fetch cinema pages
- Parse listings
- Normalize into shared schema
- Write JSON file

## Constraints
- No database
- No frontend framework
- No live API calls in browser
- Partial data is acceptable if one cinema fails

## Validation
- JSON file is created
- No duplicate films per cinema per day
- Showtimes aggregated correctly
- Frontend renders without error

## Data acquisition rules

Use public HTML listing pages as the primary source for cinema programming.

Do not use PDFs, screenshots, OCR, or other document-extraction approaches unless explicitly approved.

Priority order for sources:
1. Public HTML webpages for each cinema
2. Structured embedded data on webpages (JSON-LD, script tags, predictable listing markup)
3. Public APIs, only if already available and low-cost
4. PDFs only as a last resort, and only if no HTML source exists

Constraints:
- Prefer simple requests + HTML parsing over heavyweight extraction
- Do not introduce PDF parsing for v1
- Do not use OCR for cinema listings
- If a cinema site is JS-heavy or difficult to parse, log and skip it rather than switching to PDF
- Partial output is acceptable if one venue cannot be parsed

Implementation guidance:
- Each cinema should have a dedicated HTML parser function
- Parse title, date, time, and booking URL from webpage markup
- Use PDF parsing only if the spec is later updated to allow it

## Out of scope for v1

- PDF parsing
- OCR-based extraction
- Screenshot-based extraction
- Browser automation unless HTML parsing is impossible
- Paid scraping services