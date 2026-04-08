# Data Model Notes

## Current State

The prototype movie seed data currently lives in:

- `data/sample-movies.json`

That file is useful for the clickable MVP, but it should not be the long-term home for all recommendation data.

## Recommended Structure

As the project grows, split data into two layers:

1. Canonical movie records
2. Editorial curation records

This keeps external metadata separate from your taste layer.

## Suggested Files

### `data/films.json`

Use this as the main film catalog. It should contain one record per film with stable IDs and factual metadata.

Suggested fields:

- `id`
- `title`
- `year`
- `director`
- `countries`
- `genres`
- `themes`
- `tone`
- `pace`
- `tags`
- `tmdb_id`
- `runtime`
- `language`
- `poster_url`

### `data/curated-films.json`

Use this for your editorial layer. This is where your taste and recommendation logic becomes differentiated.

Suggested fields:

- `film_id`
- `editorial_score`
- `editorial_notes`
- `manual_links`
- `deep_cut_score`
- `overexposed_score`
- `accessibility`
- `intensity`
- `discovery_lanes`
- `collections`

## Why Split Them

This split makes it easier to:

- refresh metadata from TMDb without overwriting your notes
- expand your core 200 films safely
- tweak recommendation logic without editing factual film records
- add admin tooling later

## Recommended Workflow

1. Add a film to `data/films.json`
2. Add its editorial layer to `data/curated-films.json`
3. Merge those two datasets in the app when calculating recommendations

## Near-Term Shortcut

If you want to move quickly for now, it is completely fine to keep using a single JSON file while the dataset is small.

For example:

- `data/sample-movies.json` for the prototype
- later split into `films.json` and `curated-films.json`

That said, if you are already planning a curated core library of around 200 titles, I would start splitting now rather than later.
