## id
`recommendation-model-v1`

## priority
`P0`

## purpose
Validate the refactored open-input, closed-output recommendation model.

## setup
- Use the pure recommendation engine module
- Use a small internal-only mock catalogue plus one temporary external TMDb-style seed

## steps
1. Build a seed profile from internal seeds plus questionnaire answers.
2. Score internal candidates and confirm direct recommendations receive the strongest boost.
3. Apply repeated save interactions and confirm mood/theme/director affinities influence later scores.
4. Apply a `not for me` interaction and confirm related candidates are downranked.
5. Build a seed profile from a temporary external seed and confirm recommendations remain internal-only.

## expected
- Only internal films are ever scored as recommendation candidates.
- Direct recommendations outrank looser same-director or mood-only matches.
- Save interactions strengthen later scores.
- Negative feedback downranks related candidates without breaking the model.
- External seeds stay temporary and never become internal objects.
