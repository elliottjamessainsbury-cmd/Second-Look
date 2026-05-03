## id
`showtimes-calendar-view`

## priority
`P1`

## purpose
Validate the homepage showtimes module after the week-view simplification, including day picking, day-specific listing output, cinema filtering, logo rendering, empty states, and mobile readability.

## setup
- Use the local repository checkout.
- Serve the static app locally.
- Ensure `data/cinema-showtimes.json` exists and contains upcoming entries.
- Use the current homepage implementation in `index.html`, `app.js`, and `styles.css`.

## steps
1. Load the homepage and locate the showtimes module.
2. Confirm the week calendar renders exactly seven upcoming day buttons.
3. Click one day and confirm all films for that day appear below.
4. Click a different day and confirm the listing area swaps to that day's films.
5. Change the cinema filter and confirm only matching cinemas remain on the currently selected day.
6. Trigger a no-results filter combination and confirm the empty state is graceful.
7. Confirm Garden Cinema cards display the Garden vector logo.
8. Confirm cards without a mapped logo still render cleanly.
9. Check the module on a narrow/mobile viewport and confirm cards remain readable.
10. Run `node --check app.js`.

## expected
- The showtimes module renders a seven-day week view.
- Day selection changes the visible listings.
- All films for the selected day appear below when no cinema filter is active.
- Cinema filtering works.
- Empty states are readable and non-breaking.
- Garden Cinema uses the added vector logo asset.
- Missing-logo fallback does not break card layout.
- Booking/showtime cards remain readable on mobile.
- `node --check app.js` passes.

## notes
- The old `Cinema layer` header label should not be present.
- Cards should read as a left-aligned stack with cinema logo, cinema name, film title, and time.
- Booking CTA presence depends on `ticketUrl`; missing links should show a fallback label instead of removing the card.
