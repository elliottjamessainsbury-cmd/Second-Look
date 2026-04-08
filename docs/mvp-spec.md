# MVP Spec

## Goal

Help users discover films they are likely to love, especially films outside the most obvious mainstream recommendation loops.

## Core Feature

Users provide a small set of recent films or choose a director. The app responds with a visually rich set of recommended films and short explanations that feel curated.

## Primary Users

- film-curious users who want better recommendations
- cinephiles looking for deeper cuts
- users who like MUBI, Criterion, BFI, Letterboxd, podcasts, and repertory cinema culture

## User Stories

- As a user, I want to enter a few films I liked so I can get meaningful recommendations quickly.
- As a user, I want recommendations to include a short explanation so I understand the logic.
- As Elliott, I want to inject taste and curation into the system so recommendations are not generic.
- As a user, I want to discover lesser-known films, not just the most popular related titles.

## Functional Requirements

### Input

- free-text movie search with autosuggest
- alternate browse path using a director list
- support 3 to 4 recent films as the main signal

### Recommendation Engine

- generate at least 8 recommendations
- exclude already selected films
- combine metadata similarity and editorial scoring
- return a human-readable recommendation reason for each item

### Output UI

- grid of movie cards
- poster image
- title, year, director
- short explanation
- optional tags

## Non-Functional Requirements

- recommendations should return quickly on local data
- logic should be explainable
- dataset should be editable without retraining a model
- architecture should support future API enrichment

## Data Sources

### v1

- locally curated dataset
- optional TMDb metadata for posters and search

### Later

- public APIs
- manually reviewed imported recommendation edges
- availability providers

## Recommendation Scoring Concept

Each input film contributes weighted signals such as:

- director adjacency
- genre overlap
- thematic overlap
- era overlap
- country or region overlap
- tone overlap
- pace overlap
- editorial boost

A simple scoring formula is enough for v1:

`score = metadata_similarity + editorial_boost + curated_edge_bonus - popularity_penalty`

The popularity penalty is useful if we want to bias the app toward deeper cuts.

## Editorial Knowledge Design

This should be stored in a format we can edit directly, for example:

```json
{
  "title": "The Long Day Closes",
  "editorial_score": 8,
  "editorial_notes": [
    "Excellent for users who like memory films and intimate British work",
    "Boost when the user likes Terence Davies, Joanna Hogg, or elegiac autobiographical cinema"
  ],
  "manual_links": ["Distant Voices, Still Lives", "Aftersun"]
}
```

## Risks

- title matching can be messy without a clean source of IDs
- recommendation quality depends heavily on dataset quality
- fully automated scraping may create maintenance and legal headaches

## Success Criteria

The MVP succeeds if:

- users can get recommendations in under a minute
- the recommendations feel specific and tasteful
- at least some results are pleasantly unexpected
- Elliott can easily improve the output by editing data

## Suggested Phase After MVP

- add auth and saved taste profiles
- track what users click
- collect simple feedback such as `more like this` or `less obvious`
- expand the editorial dataset
- add where-to-watch information
