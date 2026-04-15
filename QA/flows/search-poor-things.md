## id
`search-poor-things`

## priority
`P0`

## purpose
User can search for a film and see recommendation cards.

## setup
- Open the app home page
- Ensure the page is fully loaded
- No film should already be selected

## steps
1. Focus the search input in the left-hand panel.
2. Type `Poor Things`.
3. Click `Add top match`.

## expected
- A source film is selected successfully.
- Recommendation cards appear in the main results area.
- Cards render in a three-column row on desktop.
- Each card includes:
  - a film thumbnail or poster area
  - `See Letterboxd reviews`
  - `Where to watch it`
  - `See more`
- No empty state or error state is shown.

## notes
- Button labels can change slightly only if the behavior is unchanged.
- If search returns no result for `Poor Things`, treat that as a failure.
