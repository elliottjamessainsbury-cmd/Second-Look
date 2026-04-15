## id
`poster-images`

## priority
`P0`

## purpose
Recommendation cards show a valid poster image or a graceful fallback.

## setup
- Open the app home page
- Select a film that returns recommendation cards

## steps
1. Inspect the recommendation cards in the main results grid.
2. Confirm each card shows a poster image area.
3. Open `See Letterboxd reviews` for one or more cards where the image looks missing or generic.

## expected
- Each card shows either:
  - a valid poster thumbnail
  - or a deliberate fallback monogram block
- Broken image icons should never appear.
- If a poster is shown, it should correspond to the linked film page rather than an unrelated search result.

## notes
- Incorrect Letterboxd slugs and duplicate-title collisions should be logged as metadata issues.
