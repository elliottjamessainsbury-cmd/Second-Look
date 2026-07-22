# Second Look Design System

This is the working UI contract for Second Look. Use it when reviewing screenshots, building new surfaces, or writing QA checks.

## Visual Intent

- Quiet, editorial, cinema-aware, and utilitarian.
- The app should feel like a working discovery tool, not a marketing landing page.
- Dense information is fine when it is organized and scannable.
- Avoid explanatory panels unless they unlock a user decision.

## Tokens

- Background: `--bg`
- Panels: `--panel`, `--paper`, `--panel-dark`
- Text: `--ink`, `--text`, `--muted`
- Lines: `--line`
- Accent: `--accent`, `--accent-soft`
- Save state: `--save`, `--save-soft`, `--save-ink`
- Radius: `--radius-lg`, `--radius-md`, `--radius-pill`
- Controls: `--control-height`, `--control-height-compact`, `--control-padding-x`

## Type

- Use `--display` for headings and major labels.
- Use `--body` for readable copy.
- Use `--mono` only for metadata, labels, and compact technical/context text.
- Letter spacing should be `0` by default. Only uppercase metadata labels may use positive tracking.
- Never use viewport-width-only font sizing. Use `clamp()` with sensible min/max values.

## Controls

- Buttons and button-like links must use the shared control sizing:
  - Default height: `--control-height`
  - Compact height: `--control-height-compact`
  - Horizontal padding: `--control-padding-x`
- Button text must center vertically and horizontally.
- Button text may wrap when needed; it must not overflow its pill.
- Icon-only buttons should be square and use `place-items: center`.

## Layout

- Page shell: constrained centered content with responsive side gutters.
- Cards are allowed for repeated items, modals, and framed tools.
- Avoid cards inside cards where possible.
- Account dialogs and panes must fit within mobile viewports without clipped primary actions.
- No horizontal page scrolling at supported widths.

## Content Fitting Rules

- Text must not overflow buttons, cards, modals, filters, or saved-film rows.
- Long film titles should wrap naturally.
- Metadata should wrap or truncate only when a design explicitly allows it.
- Empty states should be short and action-oriented.

## Supported QA Viewports

- Mobile: `390 x 844`
- Tablet: `768 x 1024`
- Desktop: `1440 x 1000`

Run:

```bash
node QA/design_smoketest.js
```

The static checks run with plain Node. To enable browser layout checks and screenshots, install Playwright for the project and its Chromium browser:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

When Playwright is available, the test also writes screenshots to `QA/artifacts/design-smoke/`.
