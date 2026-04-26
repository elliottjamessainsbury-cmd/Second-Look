## id
`recommendation-model-v1`

## priority
`P0`

## purpose
Validate that the recommendation model feels specific, taste-led, and editorial rather than broadly metadata-driven.

## setup
- Use the pure recommendation engine module
- Use a small internal-only mock catalogue plus one temporary external TMDb-style seed

## steps
1. Build a seed profile from internal seeds plus questionnaire answers.
2. Score internal candidates and confirm score output includes explanation data and reason strings, not just a numeric total.
3. Confirm direct recommendations and shared theme/tone matches outrank a genre-only candidate.
4. Apply repeated save interactions and confirm saved films strengthen later ranking through added profile signals.
5. Apply a `not for me` interaction and confirm related candidates are downranked.
6. Run the diversity pass and confirm the final set does not collapse into one director/country/decade cluster while preserving top curated edges.
7. Build a seed profile from a temporary external seed and confirm recommendations remain internal-only.

## expected
- Only internal films are ever scored as recommendation candidates.
- Score payloads expose explanation reasons and overlap data that can be rendered in the UI or used for QA.
- Direct recommendations outrank looser same-director or metadata-only matches.
- Genre overlap alone does not dominate the ranking and can incur a generic-match penalty.
- Save interactions strengthen later scores, especially when profile films add overlapping taste signals.
- Negative feedback downranks related candidates without breaking the model.
- The final recommendation set stays varied instead of over-clustering around one director, country, genre, or decade.
- External seeds stay temporary and never become internal objects.
