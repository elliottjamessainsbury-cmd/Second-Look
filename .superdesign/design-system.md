# Second Look Design System

Use `docs/design-system.md` as the human-readable source of truth. This file gives Superdesign the same constraints in compact form.

## Product Feel

Second Look is a browser-only film discovery tool for better recommendations and London repertory cinema listings. It should feel editorial, cinematic, restrained, and useful.

## Hard Constraints

- Use existing CSS tokens from `styles.css`.
- Keep Helvetica Neue / Helvetica / Arial for display and body.
- Use IBM Plex Mono only for metadata and labels.
- Letter spacing is `0` by default; only uppercase metadata may use positive tracking.
- No horizontal overflow at 390, 768, or 1440 px.
- Buttons use shared pill control sizing and may wrap text.
- Avoid explanatory cards unless they enable a user decision.
- Cards are for repeated items, modals, and framed tools.

## Core Tokens

- `--bg`, `--panel`, `--paper`, `--panel-dark`
- `--ink`, `--text`, `--muted`, `--line`
- `--accent`, `--accent-soft`
- `--save`, `--save-soft`, `--save-ink`
- `--radius-lg`, `--radius-md`, `--radius-pill`
- `--control-height`, `--control-height-compact`, `--control-padding-x`

## Components

- Topbar: right-aligned privacy/account controls.
- Hero: large editorial title and concise CTAs over a real film still.
- Recommendation cards: poster/media block plus title, metadata, rationale, actions, and optional expanded detail.
- Cinema showtimes: calendar strip plus listing cards with cinema identity and booking action.
- Account dialog/pane: compact, focused, no marketing-style layout.
