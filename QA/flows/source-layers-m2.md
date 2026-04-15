## id
`source-layers-m2`

## priority
`P0`

## purpose
Ensure the M2 source-layer split is valid, closed to the existing film dataset, and usable by helper utilities.

## setup
- Use the local repository checkout
- Treat `data/curated-films.json` as the closed film universe
- Regenerate the source-layer outputs before validating them

## steps
1. Run the source-layer build script.
2. Confirm the four generated JSON files exist.
3. Validate that every `film_id` in source files exists in `data/curated-films.json`.
4. Validate that the two per-film map files exactly match the inverse of the source files.
5. Validate helper outputs for representative known films.
6. Validate that expanded `See more` recommendation copy resolves to relationship-specific editorial blurbs for representative recommendation pairs instead of generic fallback language.
7. Validate that year-qualified ambiguous recommendation titles use exact metadata and canonical Letterboxd targets instead of guessed slugs.

## expected
- Build succeeds without creating any new film entries.
- All `film_id` values in source files and maps already exist in the curated dataset.
- No unmatched or placeholder film IDs are written into production JSON.
- Node enrichment returns the expected source memberships for known canon titles.
- Connection comparison favors exact shared source membership over tag-only overlap.
- Final connection scores stay capped.
- Expanded recommendation copy uses the pair-specific editorial blurb when one exists for the selected film and recommended film in the active UI direction.
- Year-qualified ambiguous titles resolve to the intended film record instead of another film with the same base title.

## notes
- This is a data integrity and engine-behavior smoke test, not a UI flow.
- If the build script reports unmatched titles or IDs, they should be dropped from output and treated as a setup issue rather than a runtime crash.
