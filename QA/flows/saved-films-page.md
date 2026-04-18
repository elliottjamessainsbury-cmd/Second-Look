## id
`saved-films-page`

## priority
`P1`

## purpose
Saved films should persist from the main discovery page and render cleanly on the dedicated saved films page.

## setup
- Open the app at `http://localhost:4173/index.html`
- Use a clean browser state or clear `secondlook:savedFilmIds` from localStorage first

## steps
1. Bookmark at least three films from the discovery flow.
2. Refresh the main page and confirm the saved state remains.
3. Open `saved.html`.
4. Confirm the saved page shows the same films in a compact vertical list.
5. Confirm each collapsed row shows only:
   - title
   - year
   - director / filmmaker
   - `See more`
6. Expand one saved film and confirm the existing detail view appears with:
   - rating
   - AI explanation
   - synopsis
   - availability links when relevant
7. Clear saved films and confirm the saved page shows a clean empty state with a link back to discovery.

## expected
- Saved film ids persist through refresh using localStorage.
- `saved.html` resolves the same saved ids into film rows.
- Rows stay compact until expanded.
- `See more` reuses the app’s existing detail rendering instead of a second detail system.
- Empty state appears when there are no saved films.
- No console errors appear from missing localStorage data or missing film ids.

## notes
- Treat missing persistence between discovery and `saved.html` as a state bug.
- Treat extra fields appearing in the collapsed saved rows as a UI bug.
