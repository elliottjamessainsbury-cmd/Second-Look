id: discovery-onboarding-m2
priority: high
purpose: verify the new taste-discovery onboarding flow renders before the legacy recommendation grid and supports the first two discovery rounds.
setup:
  - Start the app locally at http://localhost:4173/
  - Use a clean browser state
  - Land on the home page with no selected film
steps:
  - Confirm the right-hand panel shows the six-question taste quiz instead of the legacy empty recommendations state
  - Answer all six quiz questions and submit the quiz
  - Confirm a 3x3 grid of nine discovery recommendations appears
  - Confirm each card has poster imagery or the monogram fallback, a short rationale, a Bookmark action, and a See more action
  - Expand one card and confirm the expanded panel shows the AI-fit explanation, average rating, synopsis, and any availability details present for that film
  - Bookmark at least two titles and confirm they appear in the left-hand Saved from discovery rail
  - Continue to the second discovery grid
  - Confirm the second grid again shows nine titles, still supports Bookmark and See more, and now also shows Not for me
  - Mark one title as Not for me and continue again
  - Confirm the dismissed title does not reappear in the next discovery batch
expected:
  - The quiz is the first experience shown before any legacy recommendation state
  - The first discovery grid contains exactly nine unique titles
  - The first discovery grid never shows Not for me
  - Expanded discovery cards include answer-aware AI rationale copy
  - Saved titles appear in the left rail as soon as they are bookmarked
  - The second discovery grid contains exactly nine unique titles and introduces Not for me
  - Dismissed titles are excluded from subsequent discovery batches
notes:
  - This flow is covered by QA/discovery_onboarding_smoketest.js for logic and rendered-markup verification
