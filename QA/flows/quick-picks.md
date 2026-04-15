## id
`quick-picks`

## priority
`P0`

## purpose
Quick pick buttons should behave the same as selecting the same film via search.

## setup
- Open the app home page
- Ensure no film is already selected

## steps
1. Click a title in the `Quick picks` section.
2. Observe the selected film panel.
3. Observe the recommendation results area.
4. Clear the selected film.
5. Search for the same title manually and select it.
6. Compare the resulting recommendation state.

## expected
- Clicking a quick pick selects that film immediately.
- The recommendation results appear without requiring extra actions.
- The selected film chip matches the quick-pick title.
- The recommendation behavior matches the same title selected through search.

## notes
- Differences in ordering or result content between quick picks and search should be treated as a state or selection bug.
