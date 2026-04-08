# Movie Recommendation App

An MVP concept for a movie recommendation app focused on discovery, curation, and surfacing high-quality films beyond the obvious mainstream choices.

## Problem

People often struggle to discover new films worth watching. Smaller, independent, international, archival, and critically acclaimed titles can be hard to find across cinemas and streaming platforms. Existing recommendation systems tend to over-index on popularity and familiarity.

This app is designed to help users move from a few recent films or favorite directors to a set of thoughtful recommendations that feel curated rather than algorithmically generic.

## Core User Flow

1. The user opens the app.
2. The user enters 3 to 4 recently watched films or selects from a list of directors.
3. The app generates a set of recommended films.
4. The user sees recommendation cards with artwork, short reasoning, and useful metadata.
5. Editorial notes from Elliott can shape, boost, or override recommendations.

## Product Direction

This should feel like:

- intelligent but opinionated
- cinematic rather than overly technical
- discovery-first
- useful for both casual users and film-curious audiences

It should not feel like:

- a generic streaming app clone
- a black-box algorithm
- a popularity contest that only returns the same famous titles

## MVP Recommendation Inputs

The first version should support:

- 3 to 4 recent films typed by the user
- a director picker for users who do not know what to enter
- optional manual curation tags and notes maintained by Elliott

## MVP Recommendation Outputs

Each recommendation card should ideally include:

- film title
- poster or thumbnail
- year
- director
- short one-line explanation of why it was recommended
- tags such as `psychological`, `slow cinema`, `gritty British drama`, `formal experimentation`
- confidence or match strength

## Recommendation Strategy

For v1, avoid relying on broad scraping as the primary engine.

Instead, use a hybrid recommendation model:

1. A structured local movie dataset
2. Similarity based on tags, directors, eras, countries, genres, and mood
3. Editorial weighting from Elliott
4. Optional enrichment from external APIs later

This gives us:

- more control
- faster performance
- easier debugging
- safer legal and maintenance posture than scraping Letterboxd, IMDb, and Reddit directly

## Suggested v1 Data Model

Each movie record could contain:

- `id`
- `title`
- `year`
- `director`
- `countries`
- `genres`
- `themes`
- `tone`
- `pace`
- `tags`
- `similar_to`
- `editorial_score`
- `editorial_notes`
- `poster_url`
- `where_to_watch` (optional later)

## Recommendation Logic

Given user inputs, the engine can:

1. Find the selected films in the dataset
2. Merge their attributes into a weighted preference profile
3. Score other films by overlap and editorial boost
4. Exclude titles the user already entered
5. Return a ranked list with explanations

Example reasons:

- "Because you liked intimate British character studies with melancholy humor"
- "Shares the same formal precision and urban paranoia as your recent picks"
- "A deeper cut if you want to move from classic noir into political conspiracy thrillers"

## Editorial Layer

Elliott's taste and knowledge can be a major differentiator.

That layer can be implemented as:

- custom tags
- hand-authored recommendation links
- boosts for overlooked films
- anti-boosts for obvious but low-value recommendations
- short written blurbs
- curated collections such as `bleak British realism`, `maximalist melodrama`, `1990s erotic thrillers`, `great first Tarkovsky`, or `postwar British noir`

## Why Not Start With Scraping

Scraping can be useful later for research or enrichment, but it is a fragile foundation for the first version because:

- site structures change often
- terms of service may restrict usage
- recommendation quality becomes hard to control
- scraped data is noisy and inconsistent

Better first options:

- TMDb API for title search and posters
- OMDb for lightweight metadata
- a local curated JSON dataset
- optional future ingestion from public datasets or licensed APIs

## Proposed MVP Tech Stack

Because the workspace is empty, a practical first stack would be:

- Next.js
- TypeScript
- Tailwind CSS
- local JSON or SQLite for the first movie dataset

This would let us build:

- a fast search-first homepage
- recommendation cards
- an admin-style curation file or panel later

## Build Order

1. Create a small curated dataset of 50 to 100 films
2. Build input UI for recent films and director selection
3. Implement local recommendation scoring
4. Render recommendation cards with reasons
5. Add Elliott editorial boosts and manual recommendation links
6. Add external metadata enrichment only where useful

## Immediate Next Step

The best next move is to build a clickable MVP with:

- a homepage input form
- a small seed movie dataset
- a recommendation function
- a simple results page

That will let us test whether the recommendation tone and curation model feels right before we invest in larger-scale data collection.
