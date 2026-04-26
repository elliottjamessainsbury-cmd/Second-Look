# Showtimes Calendar View

## 1. Feature goal
Add a lightweight showtimes surface to the homepage that lets users browse the next seven days of repertory listings without turning the product into a full cinema-directory experience.

The module should stay small, readable, and action-oriented: pick a day, narrow the list, and open booking links.

## 2. User problem
Users may like a recommendation but still need a fast answer to "what can I actually see this week, and where?".

The older showtimes treatment used a preview/full-calendar split and did not offer direct film or cinema filtering. It also carried an extra "Cinema layer" label that added noise instead of helping orientation.

## 3. Current MVP behaviour
- The showtimes module renders as a minimal week-view calendar.
- Users can pick one day from the next available seven-day window.
- Users can filter the visible listings by film.
- Users can filter the visible listings by cinema.
- Filters apply only to the currently selected day.
- The old `Cinema layer` header label is removed.
- The module title remains `Playing in London this week`.
- The intro copy explains the interaction: pick a day, then narrow by film or cinema.
- Showtime cards render a left-aligned content stack containing:
  - cinema logo
  - cinema name
  - film title
  - time
- Cards include a booking CTA when `ticketUrl` is present.
- Cards fall back to `Booking link unavailable` when no ticket link exists.
- A vector logo asset now exists for Garden Cinema at `assets/images/cinema-logos/The Garden Cinema logo.svg`.
- Cinema logo lookup is wired in `app.js`.

## 4. Data dependencies
- Primary data file: `data/cinema-showtimes.json`
- Expected source shape:
```json
{
  "generatedAt": "ISO_TIMESTAMP",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "label": "Friday",
      "films": [
        {
          "displayTitle": "Film Title",
          "cinema": "Cinema Name",
          "showtimes": ["18:10", "20:45"],
          "ticketUrl": "https://..."
        }
      ]
    }
  ]
}
```
- Frontend state reads from `state.cinemaShowtimes.generatedAt` and `state.cinemaShowtimes.days` in `app.js`.
- Logo assets live under `assets/images/cinema-logos/`.
- Current logo mapping implementation is in `app.js` around line 1620.

## 5. UI structure
Implementation reference: `index.html` around line 70.

The showtimes section contains:
- Section wrapper: `#cinema-showtimes-section`
- Heading area:
  - `#cinema-showtimes-title`
  - `#cinema-showtimes-intro`
  - `#cinema-showtimes-updated`
- Filter row:
  - `#cinema-showtimes-film-filter`
  - `#cinema-showtimes-cinema-filter`
- Calendar grid:
  - `#cinema-showtimes-calendar`
- Listing grid:
  - `#cinema-showtimes-list`

Card structure in the current implementation:
- Logo tile on the left
- Left-aligned text stack on the right:
  - cinema name
  - film title
  - time
- Booking action row below

Styling reference: `styles.css` around line 1366.

## 6. Filters and day-selection behaviour
Implementation reference: `app.js` around line 1634.

- The rendered week is derived from upcoming days only.
- `getUpcomingShowtimeDays()` filters out past dates and limits the module to seven days.
- `getSelectedShowtimesDay()` ensures the selected day always resolves to a valid day inside the current week window.
- Film filter options are derived from the visible seven-day dataset.
- Cinema filter options are derived from the visible seven-day dataset.
- Selecting a day updates the visible listings for that day.
- Selecting a film filters the selected day’s cards to matching `displayTitle`.
- Selecting a cinema filters the selected day’s cards to matching `cinema`.
- Film and cinema filters can be combined.
- If a selected filter value no longer exists in the available options, the UI resets that selection to `All`.

## 7. Empty, loading, and error states
- Initial HTML state shows `Loading showtimes...` in `#cinema-showtimes-updated` before data is loaded.
- If no upcoming showtime days are available:
  - the calendar is cleared
  - both filters are reset to `All`
  - the module shows:
    - `No cinema showtimes available yet`
    - `Run the showtimes builder or check back after the next scheduled update.`
  - the updated label becomes `Showtimes unavailable.`
- If a selected day plus the active filters produce no cards, the module shows:
  - `No screenings match for {selected day}`
  - `Try another day or clear one of the filters.`
- Ticket-link absence is handled per card with a non-interactive fallback label rather than removing the card.

## 8. Accessibility expectations
- The section is labelled by `#cinema-showtimes-title`.
- The filter row uses explicit `<label>` wrappers for both `<select>` controls.
- The calendar container includes `aria-label="Choose a showtimes date"`.
- Each date control is a real `<button>`.
- The active date button sets `aria-pressed="true"`.
- The listing container uses `aria-live="polite"` so card updates are announced as the selected day or filters change.
- Cinema logo images use descriptive `alt` text in the form `{Cinema Name} logo`.
- The week view must remain keyboard-operable through buttons, selects, and booking links.

## 9. Acceptance criteria
- The homepage showtimes module renders a seven-day calendar view based on upcoming entries in `data/cinema-showtimes.json`.
- The `Cinema layer` label is absent from the module header.
- Users can select a day and see listings update accordingly.
- Users can filter listings by film.
- Users can filter listings by cinema.
- Film and cinema filters work together on the selected day.
- The filter dropdowns are populated from available upcoming showtimes data.
- Showtime cards show the cinema logo when a mapped asset exists.
- Garden Cinema uses `assets/images/cinema-logos/The Garden Cinema logo.svg`.
- Unmapped cinemas render without breaking the card layout.
- Cards present a left-aligned reading order of cinema logo, cinema name, film title, and time.
- Cards show a booking link when present and a fallback label when absent.
- The module remains readable on mobile, including the week strip and stacked cards.

## 10. Manual QA checklist
- Load the homepage and confirm the showtimes card appears below the recommendation area.
- Confirm the old `Cinema layer` label is gone.
- Confirm the calendar renders as a week strip with seven visible day buttons.
- Confirm the current week only includes upcoming dates.
- Click at least two different day buttons and confirm the listing grid changes.
- Open the film filter and confirm it contains film options plus `All films`.
- Open the cinema filter and confirm it contains cinema options plus `All cinemas`.
- Select a film and confirm only matching cards remain.
- Select a cinema and confirm only matching cards remain.
- Combine a film filter and a cinema filter and confirm the result set is the intersection.
- Pick a filter combination that returns no results and confirm the empty state is graceful.
- Confirm Garden Cinema cards display the vector logo asset.
- Confirm BFI Southbank, Prince Charles Cinema, and Close-Up Cinema still display mapped logos.
- Confirm a missing-logo scenario does not collapse spacing or break alignment.
- Confirm the card content reads top-to-bottom as cinema name, film title, then time.
- Confirm booking links render when `ticketUrl` exists.
- Confirm the fallback label renders when `ticketUrl` is missing.
- Confirm the module still behaves correctly if `data/cinema-showtimes.json` is unavailable or empty.
- Run `node --check app.js` and confirm it passes.

## Implementation references
- Markup: `index.html` around line 70
- Logo mapping: `app.js` around line 1620
- Filtering and day selection: `app.js` around line 1634
- Calendar and card styling: `styles.css` around line 1366
