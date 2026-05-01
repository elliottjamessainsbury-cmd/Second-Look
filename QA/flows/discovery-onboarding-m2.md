id: discovery-onboarding-m2
priority: high
purpose: verify the filter-first homepage discovery flow and the secondary profile-driven recommendation module.
setup:
  - Start the app locally at http://localhost:4173/
  - Use a clean browser state
  - Land on the home page
steps:
  - Confirm the homepage opens with a filter-first browse layout rather than an onboarding-first quiz
  - Confirm the left card contains platform, format, genre, and mood filters plus a reset action
  - Confirm the right grid shows curated browse cards with poster image or monogram fallback, metadata, Save, Not for me, and outbound review link
  - Change one filter and confirm the grid updates
  - Apply multiple filters and confirm the result set narrows as an intersection
  - Click Reset filters and confirm all filter values return to All
  - Save at least one film from the browse grid and confirm the button state updates immediately
  - Confirm the lower recommendation section appears or refreshes after the save
  - Mark one visible browse card as Not for me and confirm it no longer appears in the browse grid
  - Refresh the page and confirm the saved / dismissed state still affects the homepage
expected:
  - The homepage is browse-first, not quiz-first
  - The top grid responds to platform, format, genre, and mood filters
  - Filter combinations behave as an intersection
  - Saved titles update profile state immediately
  - Dismissed titles are excluded from future browse results
  - A lower recommendation module is driven by the evolving taste profile
  - Returning users still receive profile-shaped homepage content after reload
notes:
  - Recommendation ranking logic is covered in `QA/flows/recommendation-model-v1.md`
