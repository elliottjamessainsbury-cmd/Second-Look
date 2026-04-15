## id
`card-metadata`

## priority
`P0`

## purpose
Expanded recommendation cards should surface the key metadata cleanly for both the main recommendation row and the Criterion row.

## setup
- Open the app home page
- Select a film that produces at least one recommendation in the main row
- If available, also select a film that produces titles in the `Director's picks` row

## steps
1. Expand one card in the main recommendation row by clicking `See more`.
2. Confirm the expanded card includes:
   - the AI-written recommendation description
   - a plot summary / synopsis
   - an average Letterboxd rating
3. Confirm the expanded card includes actionable availability links where relevant:
   - streaming links if present
   - physical media / retailer links if present
4. Confirm retailer links prefer Criterion, Amazon, and HMV rather than BFI.
5. Repeat the same checks for one expanded card in the `Director's picks` row.
6. Collapse the expanded cards and confirm the layout returns to normal.

## expected
- Expanded cards in both rows include the recommendation explanation, synopsis, and average Letterboxd rating.
- Availability content appears when relevant and does not disappear for Criterion-row titles.
- Retailer links use Criterion, Amazon, and HMV when search links are shown.
- No BFI retailer links appear in the expanded availability section.
- Expanding and collapsing cards does not break the layout.

## notes
- Treat missing metadata in either the primary recommendation row or the Criterion row as a failure.
- Treat missing retailer links for Criterion-row titles as a failure if no streaming links are available.
