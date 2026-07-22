# Extractable Components

This app does not yet have framework components to extract. If/when the UI is moved to a component framework, these should become reusable components.

## AppTopbar

- Source: `index.html`, `saved.html`, `privacy.html`
- Category: layout
- Description: Privacy link plus account button.
- Extractable props: `accountLabel`, `privacyHref`
- Hardcoded: visual classes, right-aligned layout.

## FilmCard

- Source: `app.js` / `renderRecommendationCards`
- Category: basic
- Description: Poster, title, metadata, rationale, save/dismiss actions, detail toggle.
- Extractable props: `title`, `metadata`, `isSaved`, `isDismissed`, `posterUrl`
- Hardcoded: action labels and card classes.

## AccountDialog

- Source: `app.js` / `renderAuthDialog`
- Category: basic
- Description: Magic-link sign-in dialog.
- Extractable props: `message`, `error`, `email`
- Hardcoded: copy and privacy link.
