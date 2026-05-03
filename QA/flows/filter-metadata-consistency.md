## id
`filter-metadata-consistency`

## priority
`P0`

## purpose
Validate that homepage browse filters are backed by consistent film metadata, and that unsupported filters do not appear in the UI.

## setup
- Open the app home page
- Let the curated film dataset load fully

## steps
1. Inspect the visible browse filters on the left-hand filter card.
2. Confirm each visible filter corresponds to a real metadata field used by the film objects.
3. Confirm each visible filter has options populated from film metadata rather than hardcoded labels.
4. Confirm no filter is shown for a field that is missing on part of the film set.
5. Confirm universal derived filters such as platform availability or era remain visible when every film supports them.
6. Confirm unsupported or stale filters, such as `Language` when no canonical language layer exists, are absent.

## expected
- Every visible filter is metadata-backed.
- Every film in the browse universe has the required metadata for each visible filter.
- Every filter option corresponds to at least one film.
- Stale filters that are not consistently supported by the data do not appear.

## notes
- This is a data-integrity and homepage-contract smoke test.
- A filter can still be considered invalid if the UI renders it but only a subset of films carry that metadata.
