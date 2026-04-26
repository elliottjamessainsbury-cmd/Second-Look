## id
`showtimes-calendar-view`

## priority
`P1`

## purpose
Validate the homepage showtimes module after the calendar-view update, including week navigation, filtering, logo rendering, empty states, and mobile readability.

## setup
- Use the local repository checkout.
- Serve the static app locally.
- Ensure `data/cinema-showtimes.json` exists and contains upcoming entries.
- Use the current homepage implementation in `index.html`, `app.js`, and `styles.css`.

## steps
1. Load the homepage and locate the showtimes module.
2. Confirm the week calendar renders.
3. Click different day buttons and confirm the visible listings change.
4. Change the film filter and confirm only matching films remain.
5. Change the cinema filter and confirm only matching cinemas remain.
6. Apply both filters together and confirm the result is the intersection.
7. Trigger a no-results filter combination and confirm the empty state is graceful.
8. Confirm Garden Cinema cards display the Garden vector logo.
9. Confirm cards without a mapped logo still render cleanly.
10. Check the module on a narrow/mobile viewport and confirm cards remain readable.
11. Run `node --check app.js`.

## expected
- The showtimes module renders a seven-day week view.
- Day selection changes the visible listings.
- Film filtering works.
- Cinema filtering works.
- Film and cinema filters combine correctly.
- Empty states are readable and non-breaking.
- Garden Cinema uses the added vector logo asset.
- Missing-logo fallback does not break card layout.
- Booking/showtime cards remain readable on mobile.
- `node --check app.js` passes.

## notes
- The old `Cinema layer` header label should not be present.
- Cards should read as a left-aligned stack with cinema logo, cinema name, film title, and time.
- Booking CTA presence depends on `ticketUrl`; missing links should show a fallback label instead of removing the card.
