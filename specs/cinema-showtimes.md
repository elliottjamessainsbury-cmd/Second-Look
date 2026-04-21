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