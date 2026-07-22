# Components

This is a static HTML/CSS/vanilla JS app. There is no component directory or framework component system yet.

## UI Primitives

- Buttons and links are CSS primitives in `styles.css`: `.ghost-button`, `.text-button`, `.card-link-button`, `.account-button`, `.director-pill`.
- Cards are CSS primitives in `styles.css`: `.card`, `.result-card`, `.empty-state`, `.saved-film-row`.
- Forms use native `input` elements styled by shared CSS.
- Dialogs are rendered by `app.js` into `#onboarding-overlay` and `#account-overlay`.

## Primary Rendering Source

```text
app.js
```

Key render functions:

- `renderRecommendationCards`
- `renderAnonymousPreview`
- `renderSavedFilmsPage`
- `renderCinemaShowtimes`
- `renderWelcomeOverlay`
- `renderAuthDialog`
- `renderAccountPane`
