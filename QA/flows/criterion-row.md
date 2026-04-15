## id
`criterion-row`

## priority
`P1`

## purpose
Show a row of 'Criterion closet picks' underneath the suggested 

## setup
- Open the app home page
- Select a film whose director has Criterion closet information (found in criterion-closet-picks.json)

## steps
1. Inspect the recommendation cards
2. Confirm each card shows a poster image area.
3. Cards should explain that the film has been picked as it is part of the directors' Criterion closet picks, but also provide a 
3. Open `See Letterboxd reviews` for one or more cards where the image looks missing or generic.

## expected
- Each card shows either:
  - a valid poster thumbnail
  - or a deliberate fallback monogram block
- Broken image icons should never appear.
- If a poster is shown, it should correspond to the linked film page rather than an unrelated search result.
- There should be a separate section under the main 'recommended' films with a  'Director's picks' string

## notes
- Incorrect Letterboxd slugs and duplicate-title collisions should be logged as metadata issues.
