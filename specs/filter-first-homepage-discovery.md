# Filter-First Homepage Discovery

## 1. Feature goal
Shift the homepage from a recommendation-first surface to a filter-first discovery surface.

Users should be able to browse the curated universe immediately by platform, format, genre, and mood, then shape a longer-term taste profile through saves, dismissals, and outbound clicks. A smaller recommendation module should sit underneath and adapt to those signals over time.

## 2. User problem
The previous homepage leaned too heavily on guided picks and onboarding-style recommendation output. That made discovery feel narrower than intended and did not foreground the product as a taste space.

Users need:
- a clear browse surface at the top of the homepage
- explicit taste controls they can manipulate directly
- ongoing recommendation logic that learns from behaviour instead of only from a one-time onboarding session

## 3. Current built behaviour
- The top homepage section is now a browse-first layout.
- A left-side filter card controls the curated grid.
- Filters currently supported:
  - platform
  - format
  - genre
  - mood
- The main grid on the right shows curated films matching the active filter combination.
- Films marked `Not for me` are excluded from the browse grid.
- Users can still `Save`, mark `Not for me`, and open outbound links from the browse cards.
- Those interactions update the taste profile immediately.
- A secondary module below the browse grid is labelled `Recommended by your profile`.
- That recommendation module is populated by the recommendation engine and refreshes from taste signals, not only from explicit onboarding completion.
- Returning users with enough saved / liked / dismissed / outbound interaction history will see profile-driven recommendations on homepage load.

## 4. Data dependencies
- `data/curated-films.json`
- `data/sample-movies.json`
- `data/tmdb-metadata.json`
- `data/film-metadata.json`
- `data/availability.json`
- `data/recommendation-blurbs.json`

Runtime composition:
- `buildInternalFilms()` in `app.js` builds the homepage film objects.
- Platform filter values are normalized from streaming provider data in `availability`.
- Format filter values are derived only from real film metadata currently available in the app, primarily `black and white` keyword matches.
- Recommendation copy is sourced from `recommendation-blurbs.json` when a pair-specific blurb exists, with editorial fallbacks otherwise.

## 5. UI structure
Implementation reference: `index.html` around line 34.

Top homepage section:
- section wrapper: `.recommendations-section`
- heading: `#results-title`
- browse layout wrapper: `.browse-layout`

Left filter card:
- wrapper: `#taste-refine-section`
- title: `#browse-filters-title`
- summary copy: `#browse-summary`
- reset action: `#reset-filters`
- filter controls:
  - `#browse-platform-filter`
  - `#browse-format-filter`
  - `#browse-genre-filter`
  - `#browse-mood-filter`
- saved films shortcut area:
  - `#discovery-bookmarks`

Right browse surface:
- grid container: `#results-grid`

Secondary recommendation surface:
- container: `#criterion-section`
- section heading in rendered output: `Recommended by your profile`

## 6. Filter behaviour
Implementation references:
- filter state: `app.js` around line 185
- filter option derivation: `app.js` around line 1277
- filter application: `app.js` around line 1300

- Filter options are derived from the current curated film dataset.
- Platform options come from normalized streaming provider names.
- Format options come only from metadata-backed format signals currently present on the film objects.
- Genre options come from each film’s merged genre list.
- Mood options come from each film’s derived / curated mood list.
- Filters combine as an intersection.
- Reset clears all four filters back to `All`.
- Dismissed films are excluded from the browse results even if they match the active filters.
- Saved films remain visible in the browse grid and show a saved state.

## 7. Profile-learning behaviour
Implementation references:
- interaction handling: `app.js` around line 875
- profile update logic: `lib/recommendation-engine.js` around line 601
- recommendation generation: `app.js` around line 639

Positive signals:
- `save`
  - adds the film to `savedFilmIds`
  - adds it to `likedFilmIds` if needed
  - boosts mood affinity, theme affinity, and director affinity
- `outbound_click`
  - boosts mood, theme, and director affinity more strongly

Negative signals:
- `not_for_me`
  - adds the film to `dislikedFilmIds`
  - removes it from `savedFilmIds`
  - removes it from `likedFilmIds`
  - applies negative affinity updates
  - prevents the film from reappearing in recommendations and in the browse grid

Recommendation inputs:
- explicit selected seed films, when present
- temporary external seed, when present
- quiz / onboarding answers, when present
- saved films
- liked films
- dismissed films as negative signals

## 8. Recommendation module behaviour
- The lower recommendation card is no longer the primary homepage surface.
- It acts as a profile-driven companion module beneath the browse grid.
- It shows up to four recommendations from the existing recommendation engine.
- Recommendations are ranked by curated edge, theme, tone, mood, pace, and other taste signals, with penalties for generic matches and disliked adjacency.
- A diversity pass prevents over-clustering by director, country, genre, or decade.
- The module can populate for returning users without requiring a fresh onboarding session, as long as `canGenerateRecommendations()` is true.

## 9. Loading, empty, and error states
- While app data is loading, the browse grid shows `Loading the curated film universe…`
- If the core curated dataset fails to load, the browse grid shows the load error text from `state.error`
- If the active filter combination returns no results, the grid shows:
  - `No films match this filter combination yet. Try clearing one filter to widen the curated set.`
- If the profile does not yet have enough signals for recommendation output, the lower module shows:
  - `Save, dismiss, or open films from the curated grid above and this section will start adapting to your taste profile.`

## 10. Accessibility expectations
- The filter card is labelled by `#browse-filters-title`
- Each filter uses a real `<label>` and `<select>`
- The browse grid uses `aria-live="polite"`
- Save and dismiss actions remain keyboard-operable buttons
- Outbound review links remain standard links
- Saved summary content remains exposed through the `#discovery-bookmarks` live region

## 11. Acceptance criteria
- The homepage top section renders as a filter-first layout rather than a recommendation-first layout.
- Users can filter the curated grid by platform, format, genre, and mood.
- Filter combinations behave as an intersection.
- Dismissed films do not reappear in the browse grid.
- Saving, dismissing, and outbound-clicking a film updates the taste profile.
- The lower recommendation module is visible beneath the browse grid.
- That module is populated from the taste profile and recommendation engine.
- Returning users can receive recommendations on homepage load without needing to re-run onboarding.
- The hero and homepage copy describe the filter-first discovery flow.

## 12. Manual QA checklist
- Load the homepage and confirm the top section headline reads `Browse curated films`
- Confirm the left card contains filters for platform, format, genre, and mood
- Change each filter independently and confirm the browse grid updates
- Apply multiple filters together and confirm the result set narrows correctly
- Click `Reset filters` and confirm all filters return to `All`
- Save a film from the browse grid and confirm its button state updates immediately
- Mark a film `Not for me` and confirm it disappears from the browse grid after rerender
- Open a Letterboxd outbound link and confirm the interaction is still wired from the browse grid
- Confirm the lower `Recommended by your profile` module appears beneath the browse area
- Confirm the recommendation module updates after new save / dismiss interactions
- Confirm a returning user with saved taste data sees recommendations without manually restarting onboarding
- Confirm the layout remains readable on mobile with the filter card stacked above the grid

## Implementation references
- Homepage markup: `index.html` around line 34
- Film object enrichment and filter metadata: `app.js` around line 517
- Browse grid filter logic and rendering: `app.js` around line 1277
- Profile-driven recommendation block: `app.js` around line 1446
- Interaction-driven regeneration: `app.js` around line 817
- Profile update rules: `lib/recommendation-engine.js` around line 601
