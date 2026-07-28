# Second Look — Design Brief
*Paste this into Claude / Cursor as a system-level context file or design instruction.*

---

## What this product is

Second Look is an editorial film discovery app for arthouse and world cinema lovers. Tone: literary, unhurried, human. It is the antidote to algorithmic streaming — a "small cinema you can walk into." Every design decision should feel considered, not generated.

---

## Design direction

**Minimal. Editorial. Image-led.**

The film images are the entire visual language. The UI chrome should be almost invisible — just quiet scaffolding for the posters and stills to live in. Think Criterion Collection booklet, Sight & Sound magazine, A24 press materials.

This is not a dark-mode app. It is not a streaming UI. It is not shadcn defaults. It is a curated gallery with the restraint of print.

---

## Colour tokens

```css
:root {
  --bg:          #f8f6f2;  /* warm off-white — not paper, not grey */
  --surface:     #ffffff;  /* cards and elevated surfaces */
  --border:      #e4e0d9;  /* hairline dividers only — use sparingly */
  --text-primary:   #1a1814;  /* near-black, warm undertone */
  --text-secondary: #6b6560;  /* secondary labels, descriptions */
  --text-meta:      #9b928a;  /* director, year, runtime — mono metadata */
  --accent:      #1a1814;  /* same as text — no colour accent needed,
                               film images provide all colour */
}
```

**Rule:** No coloured accent in the UI. The posters are the palette. If no poster exists, use a typographic card (see below).

---

## Typography

Two typefaces only. No exceptions.

```css
/* Display + editorial headings */
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');

/* Metadata, labels, captions */
/* IBM Plex Mono — already in project, keep it */
```

### Type scale

| Role | Family | Size | Weight | Transform | Tracking |
|---|---|---|---|---|---|
| Hero / display | EB Garamond | 64–80px | 400 | — | -0.02em |
| Section heading | EB Garamond | 32px | 400 | — | -0.01em |
| Body / "why" text | EB Garamond | 18px | 400 | — | 0 |
| Film title (card) | EB Garamond | 20px | 500 | — | 0 |
| Eyebrow / section label | IBM Plex Mono | 11px | 400 | UPPERCASE | 0.12em |
| Director · Year · Country | IBM Plex Mono | 11px | 400 | UPPERCASE | 0.08em |
| Nav links | IBM Plex Mono | 12px | 400 | UPPERCASE | 0.1em |
| Search input | EB Garamond | 20px | 400 | — | 0 |

**Rule:** IBM Plex Mono is for data and chrome only — it never carries editorial prose. EB Garamond carries the voice.

---

## Spacing

Generous. This app should breathe.

```css
:root {
  --space-xs:  8px;
  --space-sm:  16px;
  --space-md:  32px;
  --space-lg:  64px;
  --space-xl:  120px;

  --max-width: 1080px;
  --card-gap:  24px;
}
```

Section padding: minimum `--space-lg` top and bottom.
Card internal padding: `--space-md`.
Never stack two sections without breathing room.

---

## Border radius

Near-zero. This is editorial print, not a SaaS app.

```css
:root {
  --radius-card: 4px;   /* barely perceptible — cards are almost sharp */
  --radius-input: 2px;
  --radius-pill: 0px;   /* no pills anywhere */
}
```

Remove all existing border-radius values above 4px from the current design.

---

## Components

### Navigation
Plain spaced-caps text links. No pill buttons. No background. No border.

```
[SAVED FILMS]    [SIGN IN]
```

Position: top-right, small, IBM Plex Mono uppercase. Logo (hand-drawn asset) top-left.

### Film card
Portrait aspect ratio — movie poster proportions (2:3).
- Image: full-bleed, no padding, object-fit: cover
- Below image: Film title (EB Garamond, 20px) + Director · Year (IBM Plex Mono, 11px uppercase)
- "Why" text: EB Garamond italic, 15px, --text-secondary, appears on hover/expand
- Actions (Save / Not for me): IBM Plex Mono, 11px uppercase, text-only — no button chrome

### No-poster fallback card
When no image is available, use a typographic card:
- Background: --text-primary (#1a1814)
- Film title: EB Garamond, large (28–36px), --bg colour, centered
- Director: IBM Plex Mono, 11px, --text-meta colour
*These dark cards as accent pieces in an otherwise light grid look intentional, not broken.*

### Search input
No box. No border box. Single bottom border in --border, 1px.
Placeholder text in --text-meta. EB Garamond, 20px.

```
Which films do you love? _________________
```

### Section eyebrow
IBM Plex Mono, 11px, uppercase, --text-meta, 0.12em tracking.
No pill, no background, no icon.

```
START FROM YOUR TASTE
```

### Dividers
1px horizontal rule in --border only. No decorative elements.

---

## Logo

Hand-drawn asset (to be supplied as SVG or transparent PNG).
Place top-left. Maximum height: 32px on mobile, 40px desktop.
No drop shadow, no border, no background treatment.
If logo not yet available: set `font-family: EB Garamond; font-style: italic; font-size: 20px;` as a text placeholder.

---

## Motion

Minimal. One rule: **if you're unsure, don't animate it.**

Permitted:
- Fade-in on recommendation results appearing: `opacity 0.3s ease`
- Hover on film cards: very subtle lift — `transform: translateY(-2px); transition: 0.2s ease`

Not permitted:
- Scroll animations
- Skeleton loaders with shimmer
- Page transitions
- Anything that runs on an interval

---

## What to remove from the current design

- All pill-shaped nav buttons (replace with plain text links)
- Any border-radius above 4px on cards or containers
- White card backgrounds inside the main off-white background (no card-in-card layering)
- Any coloured accent in the UI chrome
- The dashed-border "Search and add up to 3" placeholder chip — replace with clean text or input underline

---

## Tone reminders (for copy decisions)

- Never use: "algorithm," "feed," "for you," "personalised"
- Always use: "chosen," "worth seeking out," "drawn from," "our collection"
- Errors are direction, not apology: "No films matched — try a different title"
- Empty states are invitations: "Add a film you love to begin"

---

## Summary: the single rule

**The film image is the design. Everything else gets out of the way.**

When in doubt: more whitespace, less chrome, smaller type, no colour.
