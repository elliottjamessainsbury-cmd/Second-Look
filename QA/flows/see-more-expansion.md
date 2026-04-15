## id
`see-more-expansion`

## priority
`P0`

## purpose
Recommendation cards expand and collapse cleanly, and expanded content remains readable.

## setup
- Open the app home page
- Select a film that returns recommendation cards

## steps
1. Click `See more` on a recommendation card.
2. Verify the card expands within the results layout.
3. Check that the expanded view shows:
   - `Why we think you'll like this`
   - a readable recommendation explanation
   - a Letterboxd rating line
   - a synopsis snippet
4. Click `See less`.

## expected
- The card expands without overlapping adjacent cards.
- All text remains inside the card bounds.
- No text is cut off horizontally.
- The expanded content is readable on desktop.
- Clicking `See less` collapses the same card cleanly.
- Thumbnails do not overflow onto the text 
- All 'See more' views include a thumbnail pulled from either the Letterboxd URL or the web
- See More text recommendation string be unique to each card, AI-generated, explaining why the titles are the same in terms of genre, director or even reviews.
- See More recommendation string should not reference 'the system recommending' a title, but replace this with 'we've picked' or 'we selected' type language
- Average letterboxd rating should show

## notes
- Treat text overflow, clipping, or layout spill as a failure.
