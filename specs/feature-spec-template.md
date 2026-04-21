# Second Look Feature Spec

## 1. Feature name
[Short, specific name]

Example:
Canonical curated film intake
Recommendation ranking V2
Saved films and dislike feedback
Fullscreen onboarding overlay V3

---

## 2. Goal
What are we trying to achieve?

Write this in one or two sentences.
Focus on the user or system outcome, not the implementation.

Example:
Introduce a canonical curated-film structure so all downstream metadata, availability, and recommendation layers can join on a stable `film_id`.

---

## 3. Why this matters
Why is this feature worth doing now?

Example:
The current film data model is becoming harder to extend across curated films, TMDb metadata, recommendation blurbs, and availability. A canonical model reduces join errors and makes future recommendation work safer.

---

## 4. Current state
What exists today?

Reference the real files and architecture.

Example:
- Frontend is vanilla JS in `app.js`
- Data is loaded client-side from local JSON via `fetch(...)`
- Curated films live in `data/curated-films.json`
- Build scripts live in `scripts/`
- The app is a static site served locally via `python3 -m http.server 4173`

---

## 5. Problem statement
What is broken, unclear, fragile, or limited?

Be concrete.

Example:
Curated films, TMDb metadata, blurbs, and availability do not consistently share a single stable identity key. This increases the chance of title-based mismatches, duplicate joins, and brittle frontend logic.

---

## 6. Inputs
What files, scripts, and data sources are involved?

Example:
- `data/curated-films.json`
- `data/curated-film-intake.json`
- `scripts/build_curated_films.py`
- `data/tmdb-metadata.json`
- `data/recommendation-blurbs.json`
- `data/availability.json`

---

## 7. Desired outputs
What should exist after the work is done?

Example:
- Curated films use a canonical `film_id`
- New curated films can be added via a structured intake flow
- Downstream data layers can join against the canonical ID
- Frontend continues to render without runtime API calls

---

## 8. Scope
What is included in this feature?

Example:
- Define canonical curated film schema
- Update curated film build script
- Normalize new intake records into approved curated records
- Preserve compatibility with the existing static-site architecture

---

## 9. Non-goals
What is explicitly out of scope?

This is the bit that stops Codex freestyling.

Example:
- No backend or database
- No CMS/admin tool
- No redesign of recommendation cards
- No rewrite of unrelated JSON layers unless needed for compatibility
- No live TMDb calls from the frontend

---

## 10. Constraints
What must remain true?

Example:
- Frontend remains vanilla JS/HTML/CSS
- App remains static and client-rendered
- Data continues to live in local JSON under `/data`
- Python build scripts remain in `/scripts`
- Prefer minimal, high-confidence changes over broad rewrites

---

## 11. Proposed implementation
Describe the intended approach in plain English.

Example:
- Add a lightweight intake JSON for new curated films
- Normalize intake records in `scripts/build_curated_films.py`
- Generate a stable `film_id`
- Separate canonical identity/editorial metadata from relationship logic
- Keep downstream joins based on `film_id`

---

## 12. File-level changes
List the exact files likely to change.

Example:
- `scripts/build_curated_films.py`
- `data/curated-films.json`
- `data/curated-film-intake.json` (new)
- `app.js` (only if join logic must be updated)

---

## 13. Data contract / schema
If relevant, define the expected shape.

Example:
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
    "why_included": "Foundational bridge into accessible arthouse cinema."
  },
  "curation_status": "approved"
}
```
