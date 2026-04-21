# Second Look Feature Spec

## 1. Feature name
Canonical curated film model + intake pipeline

---

## 2. Goal
Introduce a canonical curated film data model with a stable `film_id`, plus a structured intake pipeline for adding new curated films.

All downstream JSON layers should be able to join reliably on `film_id`.

---

## 3. Why this matters
The current film identity model is inconsistent across local JSON layers, which increases the risk of brittle joins, duplicate records, and title-based mismatches. A canonical curated film model makes the static-site architecture safer to extend across metadata, blurbs, availability, and future curated additions.

---

## 4. Current state
- Frontend is a static vanilla JS app rendered from `app.js`
- Data is loaded client-side via `fetch(...)` from `/data` JSON files
- Python build scripts live in `/scripts`
- Curated films currently live in `data/curated-films.json`
- The app joins multiple JSON layers in the frontend, including curated films, TMDb metadata, recommendation blurbs, and availability data

---

## 5. Problem statement
Film identity is not consistently anchored to a single canonical `film_id` across the current data model. Some joins still depend on title strings or other fragile matching, and there is no structured intake flow for adding new curated films safely. This creates avoidable risk around duplication, mismatch, and brittle frontend logic.

---

## 6. Inputs
- `data/curated-films.json`
- `scripts/build_curated_films.py`
- `data/curated-film-intake.json` (new)

---

## 7. Desired outputs
- `data/curated-films.json` contains normalized film records with a stable `film_id`
- Curated films follow a consistent canonical schema
- New curated films are added via a structured intake file and normalized through the build script
- Existing curated films are preserved and migrated safely into the canonical structure
- Downstream JSON layers can join against the canonical `film_id`

---

## 8. Scope
- Define the canonical curated film schema
- Introduce `data/curated-film-intake.json` for structured additions
- Update `scripts/build_curated_films.py` to normalize intake records into approved curated film records
- Safely migrate existing curated films into the canonical structure
- Preserve compatibility with the current static-site architecture and existing frontend rendering

---

## 9. Non-goals
- No backend or database
- No frontend architecture change
- No UI redesign
- No recommendation algorithm changes
- No TMDb runtime integration
- No CMS or admin interface
- No rewrite of unrelated files unless required for compatibility

---

## 10. Constraints
- Frontend remains vanilla JS, HTML, and CSS
- App remains static and client-rendered
- Data continues to live in local JSON under `/data`
- Python build scripts remain in `/scripts`
- Existing `app.js` rendering must keep working
- Prefer minimal, targeted, high-confidence changes over broad rewrites

---

## 11. Proposed implementation
- Add a new intake file at `data/curated-film-intake.json` for structured curated-film additions
- Update `scripts/build_curated_films.py` to normalize intake records and existing curated records into one canonical output shape
- Generate or preserve a stable `film_id` for each curated film
- Store identity and editorial metadata in a consistent schema designed for reliable downstream joins
- Keep the output as static local JSON so the frontend can continue loading data via `fetch(...)`

---

## 12. File-level changes
- `scripts/build_curated_films.py`
- `data/curated-films.json`
- `data/curated-film-intake.json` (new)

Potentially, only if compatibility updates are required:
- `app.js`

---

## 13. Data contract / schema
```json
{
  "film_id": "paris-texas-1984",
  "title": "Paris, Texas",
  "year": 1984,
  "directors": ["Wim Wenders"],
  "source_refs": {
    "tmdb_id": 655,
    "imdb_id": "tt0087884",
    "letterboxd_slug": "paris-texas"
  },
  "editorial": {
    "tier": "core",
    "taste_tags": ["road movie", "melancholic", "arthouse"],
    "vibe_tags": ["lonely", "lyrical"],
    "why_included": "Foundational bridge into accessible arthouse cinema."
  },
  "curation_status": "approved"
}
```
