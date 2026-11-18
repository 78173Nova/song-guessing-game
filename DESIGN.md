---
name: Song Guessing Game
description: A music quiz whose one memorable element is the wave circle, the song made visible.
status: proposed, awaiting team review (decision 016)
colors:
  bg: "#f4f5fb"
  surface: "#ffffff"
  surface-alt: "#e9ebf6"
  text: "#10142e"
  text-muted: "#4b5175"
  border: "#d3d6e6"
  border-strong: "#6b7194"
  primary: "#5a2fd0"
  on-primary: "#ffffff"
  primary-hover: "#4a22b5"
  primary-soft: "#ebe5ff"
  secondary: "#0b6b80"
  secondary-soft: "#dcf3f8"
  success: "#146c3b"
  success-bg: "#e1f3e8"
  danger: "#b42029"
  danger-bg: "#fbe4e5"
  focus: "#5a2fd0"
  wave-blue: "#1d3a8f"
  wave-cyan: "#0891b2"
  wave-violet: "#7c3aed"
  dark-bg: "#0a0d24"
  dark-surface: "#141936"
  dark-surface-alt: "#1e2448"
  dark-text: "#eef0ff"
  dark-text-muted: "#aab0d8"
  dark-border: "#2b3262"
  dark-border-strong: "#7179ab"
  dark-primary: "#a88cff"
  dark-on-primary: "#0a0d24"
  dark-primary-hover: "#bba6ff"
  dark-primary-soft: "#2a2163"
  dark-secondary: "#4fd3e6"
  dark-secondary-soft: "#0e2d3d"
  dark-success: "#5fe09a"
  dark-success-bg: "#0f2b22"
  dark-danger: "#ff8b8f"
  dark-danger-bg: "#3a1422"
  dark-focus: "#a88cff"
  dark-wave-blue: "#4466e0"
  dark-wave-cyan: "#33d1ea"
  dark-wave-violet: "#9b6bff"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.8rem + 4vw, 4rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  number:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(3rem, 2rem + 6vw, 5rem)"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.5625rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  full: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "52px"
  answer-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "60px"
  answer-option-chosen:
    backgroundColor: "{colors.primary-soft}"
  answer-option-correct:
    backgroundColor: "{colors.success-bg}"
  answer-option-wrong:
    backgroundColor: "{colors.danger-bg}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "52px"
---

# Design System: Song Guessing Game

Status: **proposed, awaiting team review.** Written with Impeccable `shape` for issue #58 (spec #57).
The reasons, alternatives and limits are in [decision 016](docs/decisions/016-visual-design.md).
This file holds the rules; every later visual ticket (#59–#67) builds from it.

## Overview

**Creative North Star: "The Late-Night Radio Dial"**

A song comes out of the dark and the only thing glowing is the dial. The app is calm, deep blue and a bit
night-time; one shape carries all the energy: the **wave circle**, a ring that ripples to the clip that is
playing. Everything else (buttons, lists, forms) is quiet, legible and the same on every screen, so the circle
and the player's own result are what you notice.

The look is chosen for the real use scene: friends on phones, often in the evening, sometimes reading a room
code from across a table. So: large type for numbers and codes, big tap targets, high contrast in both modes,
and colour that always comes with a word or an icon.

**Key characteristics**
- Deep navy and ink instead of grey; violet is the one action colour, cyan is the "other side" colour.
- One display face with character (Bricolage Grotesque) for titles and numbers, one highly legible face
  (Atkinson Hyperlegible Next) for everything people read or type.
- Flat, tonal surfaces. A shadow only on things that float above the page (pop-up, sheet, short message).
- Motion only when the game or the player changes something. The circle is the only thing that moves on its own.
- The album's colours appear only after the answer: during a round the circle uses the app's own colours.

## Colors

All colours are CSS custom properties on `:root` in `app/globals.css`, with a dark block inside
`@media (prefers-color-scheme: dark)`. Area stylesheets (`*.module.css`) use `var(--color-…)` only, never a raw
hex value or `rgb()`. There is no theme switch inside the app: it follows the system setting.

### Tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-bg` | #f4f5fb | #0a0d24 | Page background (cool off-white / deep navy) |
| `--color-surface` | #ffffff | #141936 | Panels, inputs, answer buttons, pop-up |
| `--color-surface-alt` | #e9ebf6 | #1e2448 | Chips, countdown track, stripes, skeletons |
| `--color-text` | #10142e | #eef0ff | Main text ("ink") |
| `--color-text-muted` | #4b5175 | #aab0d8 | Hints, secondary lines, quiet room-creator controls |
| `--color-border` | #d3d6e6 | #2b3262 | Decorative dividers and tracks only (not a control outline) |
| `--color-border-strong` | #6b7194 | #7179ab | Outlines of inputs, answer buttons, secondary buttons (≥ 3 : 1) |
| `--color-primary` | #5a2fd0 | #a88cff | Violet: main buttons, links, "you" |
| `--color-on-primary` | #ffffff | #0a0d24 | Text and icons on `--color-primary` |
| `--color-primary-hover` | #4a22b5 | #bba6ff | Primary button hover and pressed |
| `--color-primary-soft` | #ebe5ff | #2a2163 | Chosen answer, own row in standings, my side of the duel |
| `--color-secondary` | #0b6b80 | #4fd3e6 | Cyan: the opponent in a duel, neutral info |
| `--color-secondary-soft` | #dcf3f8 | #0e2d3d | Opponent side of the duel |
| `--color-success` | #146c3b | #5fe09a | Right answer: text, icon, outline |
| `--color-success-bg` | #e1f3e8 | #0f2b22 | Right answer: fill |
| `--color-danger` | #b42029 | #ff8b8f | Wrong answer, errors: text, icon, outline |
| `--color-danger-bg` | #fbe4e5 | #3a1422 | Wrong answer, error message: fill |
| `--color-focus` | #5a2fd0 | #a88cff | Focus ring (3px, offset 2px) |
| `--color-wave-blue` | #1d3a8f | #4466e0 | Wave circle colour 1 (dark blue) |
| `--color-wave-cyan` | #0891b2 | #33d1ea | Wave circle colour 2 (cyan) |
| `--color-wave-violet` | #7c3aed | #9b6bff | Wave circle colour 3 (violet) |
| `--color-backdrop` | rgb(10 13 36 / 0.55) | rgb(0 0 0 / 0.65) | Behind the share pop-up / sheet (not a text background) |

### Old names → new names

The old names stay as aliases (`--background: var(--color-bg);` and so on) until every area is restyled
(#60–#66), then #67 removes them.

| Old name | New token | Note |
|---|---|---|
| `--background` | `--color-bg` | |
| `--foreground` | `--color-text` | |
| `--card` | `--color-surface` | |
| `--muted` | `--color-border` | Today `--muted` is also used for 2px input/option outlines; those move to `--color-border-strong` when restyled, because an outline must reach 3 : 1 |
| `--accent` | `--color-primary` | |
| `--accent-text` | `--color-on-primary` | |
| `--good` | `--color-success` | |
| `--good-bg` | `--color-success-bg` | |
| `--bad` | `--color-danger` | |
| `--bad-bg` | `--color-danger-bg` | |

### Named rules

**The One Violet Rule.** Violet (`--color-primary`) marks what to press next and "you". One filled violet button
per screen; other actions are secondary or quiet.

**The Never Colour Alone Rule.** Right, wrong, away, answered, error: each always has an icon or a word as well
as a colour.

**The Dark Before The Answer Rule.** During an open round, nothing on screen comes from the song: the circle uses
the three wave tokens. Album colours are only allowed once the answer is revealed.

**No opacity for quiet text.** Today `.pitch` uses `opacity: 0.85`; opacity silently lowers contrast. Use
`--color-text-muted` instead.

### Contrast pairs (checked)

Every text/background pair the design uses, in both modes, with its WCAG 2.x contrast ratio. Needs: 4.5 : 1 for
normal text, 3 : 1 for large text (≥ 24px, or ≥ 18.66px bold), outlines, focus rings and icons. All 84 pairs
pass. Ticket #59's contrast test should check exactly this list (token pairs, both modes). Disabled controls
are exempt under WCAG, but should still stay ≥ 3 : 1 where possible. The wave colours are decorative (they carry
no information) and are listed only so the circle stays visible.

| Mode | Foreground | Background | Values | Ratio | Needs | Used for |
|---|---|---|---|---|---|---|
| light | `--color-text` | `--color-bg` | #10142e / #f4f5fb | 16.62 : 1 | 4.5 : 1 | body text on the page |
| light | `--color-text` | `--color-surface` | #10142e / #ffffff | 18.08 : 1 | 4.5 : 1 | text in panels, inputs, answer buttons |
| light | `--color-text` | `--color-surface-alt` | #10142e / #e9ebf6 | 15.22 : 1 | 4.5 : 1 | text on tracks, chips, table stripes |
| light | `--color-text-muted` | `--color-bg` | #4b5175 / #f4f5fb | 7.06 : 1 | 4.5 : 1 | hints, secondary lines |
| light | `--color-text-muted` | `--color-surface` | #4b5175 / #ffffff | 7.68 : 1 | 4.5 : 1 | hints inside panels |
| light | `--color-text-muted` | `--color-surface-alt` | #4b5175 / #e9ebf6 | 6.47 : 1 | 4.5 : 1 | hints on chips |
| light | `--color-primary` | `--color-bg` | #5a2fd0 / #f4f5fb | 7.01 : 1 | 4.5 : 1 | links, "you" marker |
| light | `--color-primary` | `--color-surface` | #5a2fd0 / #ffffff | 7.63 : 1 | 4.5 : 1 | links inside panels |
| light | `--color-primary` | `--color-surface-alt` | #5a2fd0 / #e9ebf6 | 6.42 : 1 | 4.5 : 1 | selected chip text |
| light | `--color-on-primary` | `--color-primary` | #ffffff / #5a2fd0 | 7.63 : 1 | 4.5 : 1 | primary button label |
| light | `--color-on-primary` | `--color-primary-hover` | #ffffff / #4a22b5 | 9.60 : 1 | 4.5 : 1 | primary button label, hover/pressed |
| light | `--color-text` | `--color-primary-soft` | #10142e / #ebe5ff | 14.79 : 1 | 4.5 : 1 | chosen answer, own row in standings, my duel side |
| light | `--color-primary` | `--color-primary-soft` | #5a2fd0 / #ebe5ff | 6.24 : 1 | 4.5 : 1 | "Locked in" / "(you)" label on the soft tint |
| light | `--color-text-muted` | `--color-primary-soft` | #4b5175 / #ebe5ff | 6.29 : 1 | 4.5 : 1 | secondary line in own row |
| light | `--color-secondary` | `--color-bg` | #0b6b80 / #f4f5fb | 5.63 : 1 | 4.5 : 1 | cyan accent text (opponent name, info) |
| light | `--color-secondary` | `--color-surface` | #0b6b80 / #ffffff | 6.12 : 1 | 4.5 : 1 | cyan accent text in panels |
| light | `--color-secondary` | `--color-surface-alt` | #0b6b80 / #e9ebf6 | 5.16 : 1 | 4.5 : 1 | cyan text on chips |
| light | `--color-text` | `--color-secondary-soft` | #10142e / #dcf3f8 | 15.68 : 1 | 4.5 : 1 | opponent side of the duel |
| light | `--color-secondary` | `--color-secondary-soft` | #0b6b80 / #dcf3f8 | 5.31 : 1 | 4.5 : 1 | opponent label on its tint |
| light | `--color-text-muted` | `--color-secondary-soft` | #4b5175 / #dcf3f8 | 6.67 : 1 | 4.5 : 1 | secondary line on opponent side |
| light | `--color-success` | `--color-surface` | #146c3b / #ffffff | 6.49 : 1 | 4.5 : 1 | "Right" verdict text |
| light | `--color-success` | `--color-success-bg` | #146c3b / #e1f3e8 | 5.62 : 1 | 4.5 : 1 | right-answer label on its tint |
| light | `--color-text` | `--color-success-bg` | #10142e / #e1f3e8 | 15.66 : 1 | 4.5 : 1 | song title on right-answer tint |
| light | `--color-text-muted` | `--color-success-bg` | #4b5175 / #e1f3e8 | 6.65 : 1 | 4.5 : 1 | hint on right-answer tint |
| light | `--color-danger` | `--color-surface` | #b42029 / #ffffff | 6.61 : 1 | 4.5 : 1 | field errors in panels |
| light | `--color-danger` | `--color-bg` | #b42029 / #f4f5fb | 6.07 : 1 | 4.5 : 1 | errors on the page |
| light | `--color-danger` | `--color-danger-bg` | #b42029 / #fbe4e5 | 5.45 : 1 | 4.5 : 1 | wrong-answer label on its tint |
| light | `--color-text` | `--color-danger-bg` | #10142e / #fbe4e5 | 14.92 : 1 | 4.5 : 1 | answer text on wrong tint |
| light | `--color-text-muted` | `--color-danger-bg` | #4b5175 / #fbe4e5 | 6.34 : 1 | 4.5 : 1 | hint on wrong tint |
| light | `--color-border-strong` | `--color-bg` | #6b7194 / #f4f5fb | 4.37 : 1 | 3 : 1 | input and answer-button outlines |
| light | `--color-border-strong` | `--color-surface` | #6b7194 / #ffffff | 4.76 : 1 | 3 : 1 | input outlines inside panels |
| light | `--color-border-strong` | `--color-surface-alt` | #6b7194 / #e9ebf6 | 4.00 : 1 | 3 : 1 | outlines on chips |
| light | `--color-focus` | `--color-bg` | #5a2fd0 / #f4f5fb | 7.01 : 1 | 3 : 1 | focus ring |
| light | `--color-focus` | `--color-surface` | #5a2fd0 / #ffffff | 7.63 : 1 | 3 : 1 | focus ring in panels |
| light | `--color-focus` | `--color-surface-alt` | #5a2fd0 / #e9ebf6 | 6.42 : 1 | 3 : 1 | focus ring on chips |
| light | `--color-focus` | `--color-primary-soft` | #5a2fd0 / #ebe5ff | 6.24 : 1 | 3 : 1 | focus ring on chosen answer |
| light | `--color-primary` | `--color-bg` | #5a2fd0 / #f4f5fb | 7.01 : 1 | 3 : 1 | primary button shape against the page |
| light | `--color-success` | `--color-bg` | #146c3b / #f4f5fb | 5.96 : 1 | 3 : 1 | right-answer outline/icon |
| light | `--color-danger` | `--color-surface-alt` | #b42029 / #e9ebf6 | 5.56 : 1 | 3 : 1 | error outline on chips |
| light | `--color-wave-blue` | `--color-bg` | #1d3a8f / #f4f5fb | 9.40 : 1 | 3 : 1 | wave circle colour 1 (decorative, checked anyway) |
| light | `--color-wave-cyan` | `--color-bg` | #0891b2 / #f4f5fb | 3.38 : 1 | 3 : 1 | wave circle colour 2 |
| light | `--color-wave-violet` | `--color-bg` | #7c3aed / #f4f5fb | 5.24 : 1 | 3 : 1 | wave circle colour 3 |
| dark | `--color-text` | `--color-bg` | #eef0ff / #0a0d24 | 16.92 : 1 | 4.5 : 1 | body text on the page |
| dark | `--color-text` | `--color-surface` | #eef0ff / #141936 | 15.17 : 1 | 4.5 : 1 | text in panels, inputs, answer buttons |
| dark | `--color-text` | `--color-surface-alt` | #eef0ff / #1e2448 | 13.23 : 1 | 4.5 : 1 | text on tracks, chips, table stripes |
| dark | `--color-text-muted` | `--color-bg` | #aab0d8 / #0a0d24 | 9.04 : 1 | 4.5 : 1 | hints, secondary lines |
| dark | `--color-text-muted` | `--color-surface` | #aab0d8 / #141936 | 8.11 : 1 | 4.5 : 1 | hints inside panels |
| dark | `--color-text-muted` | `--color-surface-alt` | #aab0d8 / #1e2448 | 7.07 : 1 | 4.5 : 1 | hints on chips |
| dark | `--color-primary` | `--color-bg` | #a88cff / #0a0d24 | 7.17 : 1 | 4.5 : 1 | links, "you" marker |
| dark | `--color-primary` | `--color-surface` | #a88cff / #141936 | 6.43 : 1 | 4.5 : 1 | links inside panels |
| dark | `--color-primary` | `--color-surface-alt` | #a88cff / #1e2448 | 5.61 : 1 | 4.5 : 1 | selected chip text |
| dark | `--color-on-primary` | `--color-primary` | #0a0d24 / #a88cff | 7.17 : 1 | 4.5 : 1 | primary button label |
| dark | `--color-on-primary` | `--color-primary-hover` | #0a0d24 / #bba6ff | 9.13 : 1 | 4.5 : 1 | primary button label, hover/pressed |
| dark | `--color-text` | `--color-primary-soft` | #eef0ff / #2a2163 | 12.39 : 1 | 4.5 : 1 | chosen answer, own row in standings, my duel side |
| dark | `--color-primary` | `--color-primary-soft` | #a88cff / #2a2163 | 5.25 : 1 | 4.5 : 1 | "Locked in" / "(you)" label on the soft tint |
| dark | `--color-text-muted` | `--color-primary-soft` | #aab0d8 / #2a2163 | 6.62 : 1 | 4.5 : 1 | secondary line in own row |
| dark | `--color-secondary` | `--color-bg` | #4fd3e6 / #0a0d24 | 10.76 : 1 | 4.5 : 1 | cyan accent text (opponent name, info) |
| dark | `--color-secondary` | `--color-surface` | #4fd3e6 / #141936 | 9.65 : 1 | 4.5 : 1 | cyan accent text in panels |
| dark | `--color-secondary` | `--color-surface-alt` | #4fd3e6 / #1e2448 | 8.42 : 1 | 4.5 : 1 | cyan text on chips |
| dark | `--color-text` | `--color-secondary-soft` | #eef0ff / #0e2d3d | 12.69 : 1 | 4.5 : 1 | opponent side of the duel |
| dark | `--color-secondary` | `--color-secondary-soft` | #4fd3e6 / #0e2d3d | 8.07 : 1 | 4.5 : 1 | opponent label on its tint |
| dark | `--color-text-muted` | `--color-secondary-soft` | #aab0d8 / #0e2d3d | 6.78 : 1 | 4.5 : 1 | secondary line on opponent side |
| dark | `--color-success` | `--color-surface` | #5fe09a / #141936 | 10.32 : 1 | 4.5 : 1 | "Right" verdict text |
| dark | `--color-success` | `--color-success-bg` | #5fe09a / #0f2b22 | 9.08 : 1 | 4.5 : 1 | right-answer label on its tint |
| dark | `--color-text` | `--color-success-bg` | #eef0ff / #0f2b22 | 13.35 : 1 | 4.5 : 1 | song title on right-answer tint |
| dark | `--color-text-muted` | `--color-success-bg` | #aab0d8 / #0f2b22 | 7.14 : 1 | 4.5 : 1 | hint on right-answer tint |
| dark | `--color-danger` | `--color-surface` | #ff8b8f / #141936 | 7.64 : 1 | 4.5 : 1 | field errors in panels |
| dark | `--color-danger` | `--color-bg` | #ff8b8f / #0a0d24 | 8.52 : 1 | 4.5 : 1 | errors on the page |
| dark | `--color-danger` | `--color-danger-bg` | #ff8b8f / #3a1422 | 7.17 : 1 | 4.5 : 1 | wrong-answer label on its tint |
| dark | `--color-text` | `--color-danger-bg` | #eef0ff / #3a1422 | 14.23 : 1 | 4.5 : 1 | answer text on wrong tint |
| dark | `--color-text-muted` | `--color-danger-bg` | #aab0d8 / #3a1422 | 7.61 : 1 | 4.5 : 1 | hint on wrong tint |
| dark | `--color-border-strong` | `--color-bg` | #7179ab / #0a0d24 | 4.59 : 1 | 3 : 1 | input and answer-button outlines |
| dark | `--color-border-strong` | `--color-surface` | #7179ab / #141936 | 4.11 : 1 | 3 : 1 | input outlines inside panels |
| dark | `--color-border-strong` | `--color-surface-alt` | #7179ab / #1e2448 | 3.59 : 1 | 3 : 1 | outlines on chips |
| dark | `--color-focus` | `--color-bg` | #a88cff / #0a0d24 | 7.17 : 1 | 3 : 1 | focus ring |
| dark | `--color-focus` | `--color-surface` | #a88cff / #141936 | 6.43 : 1 | 3 : 1 | focus ring in panels |
| dark | `--color-focus` | `--color-surface-alt` | #a88cff / #1e2448 | 5.61 : 1 | 3 : 1 | focus ring on chips |
| dark | `--color-focus` | `--color-primary-soft` | #a88cff / #2a2163 | 5.25 : 1 | 3 : 1 | focus ring on chosen answer |
| dark | `--color-primary` | `--color-bg` | #a88cff / #0a0d24 | 7.17 : 1 | 3 : 1 | primary button shape against the page |
| dark | `--color-success` | `--color-bg` | #5fe09a / #0a0d24 | 11.51 : 1 | 3 : 1 | right-answer outline/icon |
| dark | `--color-danger` | `--color-surface-alt` | #ff8b8f / #1e2448 | 6.67 : 1 | 3 : 1 | error outline on chips |
| dark | `--color-wave-blue` | `--color-bg` | #4466e0 / #0a0d24 | 3.85 : 1 | 3 : 1 | wave circle colour 1 (decorative, checked anyway) |
| dark | `--color-wave-cyan` | `--color-bg` | #33d1ea / #0a0d24 | 10.45 : 1 | 3 : 1 | wave circle colour 2 |
| dark | `--color-wave-violet` | `--color-bg` | #9b6bff / #0a0d24 | 5.42 : 1 | 3 : 1 | wave circle colour 3 |

## Typography

**Display font:** Bricolage Grotesque (variable: weight 200–800, width 75–100, optical size 12–96).
**Body font:** Atkinson Hyperlegible Next (variable: weight 200–800).
Both load with `next/font/google` in `app/layout.tsx`, replacing Geist, as CSS variables:

```ts
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz", "wdth"] });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });
```

Tokens: `--font-display: var(--font-bricolage), system-ui, sans-serif;`
`--font-body: var(--font-atkinson), system-ui, sans-serif;`

**Character:** Bricolage has the slightly rough, ink-trap look of a gig poster and gets narrower and tighter at
large sizes (its optical size axis does this by itself). Atkinson Hyperlegible was drawn for low-vision readers:
letters like I/l/1 and O/0 are clearly different, which matters for nicknames and room codes.

### Scale

| Token | Size | Font / weight | Line height | Used for |
|---|---|---|---|---|
| `--text-xs` | 0.8125rem (13px) | body 400 | 1.4 | Fine print only (footer, "(you)" tags). Never for errors |
| `--text-sm` | 0.9375rem (15px) | body 400/600 | 1.45 | Hints, labels, list meta |
| `--text-md` | 1.0625rem (17px) | body 400 | 1.5 | Body text, inputs (≥ 16px, so phones do not zoom) |
| `--text-lg` | 1.25rem (20px) | body 600 | 1.35 | Answer buttons, main buttons, nicknames on the board |
| `--text-xl` | 1.5625rem (25px) | display 650 | 1.2 | Section titles, verdict ("Right!"), song title on reveal |
| `--text-2xl` | clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem) | display 700 | 1.1 | Page headings, question ("Which song is this?") |
| `--text-display` | clamp(2.5rem, 1.8rem + 4vw, 4rem) | display 800 | 1.0 | Landing title, room code |
| `--text-number` | clamp(3rem, 2rem + 6vw, 5rem) | display 700, tabular | 1.0 | Countdown, get-ready 3-2-1, duel scores |

Rules: letter spacing never below -0.03em; body lines at most 65ch (`--measure: 65ch`); numbers that change
(scores, countdown, standings points) use `font-variant-numeric: tabular-nums` so they do not jump; the room code
gets `letter-spacing: 0.12em`. Headings use `text-wrap: balance`.

## Layout

**Spacing steps** (4px base): `--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px ·
`--space-5` 24px · `--space-6` 32px · `--space-7` 48px · `--space-8` 64px. Tight inside a group (`--space-2`/`-3`),
generous between groups (`--space-5`/`-6`), more space above a heading than below it.

**Widths:** `--width-form: 30rem` (landing, forms, lobby), `--width-game: 40rem` (solo, room rounds, standings),
`--width-board: 56rem` (Multiplayer game board on a laptop). Page gutter `--space-4` on phones, `--space-5` from
640px. One breakpoint for layout changes: `40rem` (640px). No sideways scrolling at 360px.

**Touch:** every control at least 44 × 44px (buttons are 52px high, answer buttons 60px).

Layout uses flex and grid with `gap`, mobile first. The page background is the bg colour; content sits directly
on it or in one panel (`--color-surface`, `--radius-lg`). Never a panel inside a panel.

### Sketches

Phone width (≈ 360px) unless noted. `( ~~~ )` is the wave circle. `[ Button ]` is a filled violet button,
`[[ Button ]]` a secondary (outlined) one, `‹link›` a quiet text button.

**Landing** (`/`) – the circle idles (slow pulse) above the title; three main choices, then the room code.

```
┌──────────────────────────────────┐
│                                  │
│            .-~~~~~-.             │
│          (  ~~~~~~~  )           │  wave circle, idle pulse, ~55% of width
│            '-~~~~~-'             │
│                                  │
│      Song Guessing Game          │  --text-display, centred
│  Hear a few seconds of a hit.    │  --text-md, muted
│  Name it before anyone else.     │
│                                  │
│  [        Play solo          ]   │  primary
│  [[     Create a room        ]]  │  secondary
│  [[      Join a room         ]]  │  secondary
│  ──────────────────────────────  │
│  Room code                       │
│  [ 1 2 3 4 5 6     ] [[ Join ]]  │
│  ──────────────────────────────  │
│  ‹Log in›           ‹Sign up›    │  account buttons, quiet
└──────────────────────────────────┘
Laptop: same column (--width-form), circle grows to 280px, sits left of the column from 64rem up.
```

The three "how it works" points stay as a short list under the pitch with small inline SVG icons (no emoji).

**Solo round** (`/solo`, screen `round`) – the circle is the centre; seconds sit inside it on a solid disc.

```
┌──────────────────────────────────┐
│ Round 3 of 5          Score 1 240│  --text-sm muted / tabular
│                                  │
│           .-~~~~~~~-.            │
│        (~   ┌─────┐   ~)         │  wave ring ripples to the beat
│       (~    │  12 │    ~)        │  inner disc --color-surface, seconds --text-number
│        (~   └─────┘   ~)         │  thin arc on the disc edge = time left
│           '-~~~~~~~-'            │
│                                  │
│     Which song is this?          │  --text-2xl
│                                  │
│  ┌────────────────────────────┐  │
│  │ Blinding Lights            │  │  answer button, 60px, --text-lg
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Levitating                 │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ As It Was                  │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Bad Habits                 │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
Laptop (≥ 40rem): answers in a 2 × 2 grid under the circle.
```

**Solo reveal** – the circle blends into the cover's colours; the panel replaces nothing above it.

```
│        (~  album colours  ~)     │  same circle, colours now from the cover
│  ┌────────────────────────────┐  │
│  │ ✓ Right!          +840     │  │  verdict word + icon, points pop in
│  │ ┌────┐ Blinding Lights     │  │
│  │ │cover│ The Weeknd · 2019  │  │  cover 96px, --radius-sm
│  │ └────┘ ‹Open in iTunes›    │  │
│  │ [        Next song       ] │  │
│  └────────────────────────────┘  │
│  answer buttons stay below, locked: right one green + ✓, own wrong one red + ✗
```

**Lobby** (`/join/[code]`, screen `lobby`) – readable from across a table.

```
┌──────────────────────────────────┐
│            4 8 2 9 1 7           │  room code, --text-display, tracked
│     The game starts in 0:42      │  --text-lg, number tabular
│  Multiplayer · 2 sets of 5 songs │  --text-sm muted
│  [[  Share link and code     ]]  │  room creator only
│                                  │
│  Players (4)                     │
│  ┌────────────────────────────┐  │
│  │ 🦊  Mila (you)             │  │  own row: --color-primary-soft
│  │ 🐙  Jonas                  │  │
│  │ 🐼  Ana    ◌ away          │  │  away: muted + icon + word
│  │ 🐸  Theo                   │  │
│  └────────────────────────────┘  │
│  [         Start now         ]   │  room creator only, primary
│  ‹Extend +60 s›  ‹Kick Ana›      │  quiet controls, --color-text-muted
│  ‹Leave room›                    │
└──────────────────────────────────┘
```

**Multiplayer game board** (`RoomBoard`) – the song half circle at the bottom becomes the top half of the
wave circle; nicknames sit on the two rings around it (positions from `lib/client/room-board.ts`, unchanged).

```
┌──────────────────────────────────────────────┐
│   ✓Jonas      Ana◌      Theo      ✓Lea       │  outer ring
│        ✓Sam        Kai        Noor           │  inner ring
│                .-~~~~~~~~~-.                 │
│             (~      12       ~)              │  half wave circle, seconds + "Round 3 / 10"
│ ────────────'───────────────'─────────────── │
│  🦊 Mila (you)  ✓                            │  own line under the board
│        Which song is this?                   │
│  [ answer ]  [ answer ]                      │  2 × 2 on laptop, stacked on phone
│  [ answer ]  [ answer ]                      │
└──────────────────────────────────────────────┘
Answered seats: ✓ icon + bold name. Away seats: muted + away icon. Nicknames truncate with an ellipsis.
```

**Duel** (`RoomDuel`) – opponent on top in cyan, me at the bottom in violet, the circle between.

```
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │  --color-secondary-soft
│ │ 🐙 Jonas        ✓ answered   │ │
│ │                    2 310     │ │  --text-number, tabular, NumberFlow
│ └──────────────────────────────┘ │
│           .-~~~~~~~-.            │
│          (~    12    ~)          │  wave circle, seconds inside
│           '-~~~~~~~-'            │
│ ┌──────────────────────────────┐ │  --color-primary-soft
│ │ 🦊 Mila (you)                │ │
│ │                    1 980     │ │
│ └──────────────────────────────┘ │
│  answers below (2 × 2 on laptop) │
└──────────────────────────────────┘
Laptop: the two sides sit left and right of the circle instead of above and below.
```

**Standings** (after a set and at the end)

```
┌──────────────────────────────────┐
│       Standings after set 1      │  --text-2xl
│                                  │
│          ┌──────┐                │
│  ┌──────┐│ 🦊 1 │┌──────┐        │  podium for the top three: 2 · 1 · 3
│  │ 🐙 2 ││ Mila ││ 🐼 3 │        │  shared rank = same number, same height
│  │ Jonas││ 2 310││ Ana  │        │
│  │ 1 980│└──────┘│ 1 400│        │
│  └──────┘        └──────┘        │
│  4   🐸 Theo            1 120    │  list from rank 4, tabular points
│  4   🦁 Lea             1 120    │  equal points share a rank
│  6   🐧 Sam               640   │
│  ...                             │
│  own row highlighted (primary-soft + "(you)")
│  [[        Continue          ]]  │
└──────────────────────────────────┘
```

**Set summary** (and solo results): a list, one row per song – icon + "Right"/"Wrong", title and artist,
points right-aligned and tabular, "Open in iTunes" as a quiet link. No cover images in the list.

## Elevation & Depth

Flat and tonal: depth comes from `--color-bg` → `--color-surface` → `--color-surface-alt`. Two shadows only, for
things that float above the page:

- `--shadow-raised`: light `0 2px 8px rgb(16 20 46 / 0.08)`, dark `0 2px 8px rgb(0 0 0 / 0.4)` – the short
  message (Sonner toast).
- `--shadow-overlay`: light `0 16px 40px rgb(16 20 46 / 0.18)`, dark `0 16px 40px rgb(0 0 0 / 0.6)` – the share
  pop-up and the bottom sheet.

No glow, no glass/blur, no coloured halos.

## Shapes

Radius steps: `--radius-sm` 8px (chips, cover images, small badges) · `--radius-md` 12px (buttons, inputs,
answer buttons) · `--radius-lg` 20px (panels, pop-up, top of the bottom sheet) · `--radius-full` (avatars,
pills, the wave circle's inner disc). Borders: 1px for dividers (`--color-border`), 2px for control outlines
(`--color-border-strong`). No coloured side borders.

**Icons:** a small set of hand-drawn inline SVG icons in one stroke (2px, round caps, 20/24px box): check,
cross, play, away, share, copy, close. They replace the ✓, ✗, ▶ glyphs and the emoji bullets on the landing
page. Avatars stay emoji: they are content the player picked, not icons.

## Components

- **Primary button:** violet fill, `--color-on-primary` label, 52px high, `--text-lg` 600, `--radius-md`. Hover
  and pressed: `--color-primary-hover`. Pressed: `scale(0.97)`. Disabled: `--color-surface-alt` fill,
  `--color-text-muted` label, no press.
- **Secondary button:** `--color-surface` fill, 2px `--color-border-strong` outline, `--color-text` label.
- **Quiet button / link:** no fill, `--color-text-muted` (room-creator extras, Leave) or `--color-primary`
  (links), underline on hover, still ≥ 44px tap area.
- **Answer button:** `--color-surface`, 2px `--color-border-strong`, 60px, left-aligned `--text-lg`, `--radius-md`.
  States: hover → border `--color-primary`; pressed → `scale(0.97)`; chosen → `--color-primary-soft` +
  primary border + "Locked in" text; correct → `--color-success-bg` + success border + check icon + "Right
  answer"; wrong (own pick) → `--color-danger-bg` + danger border + cross icon; others → muted text.
- **Input:** `--color-surface`, 2px `--color-border-strong`, 52px, `--text-md`; label above (`--text-sm` 600);
  error below in `--color-danger` with a cross icon, `aria-invalid` sets a danger outline.
- **Panel:** `--color-surface`, `--radius-lg`, `--space-5` padding. One per screen at most.
- **Focus:** `outline: 3px solid var(--color-focus); outline-offset: 2px` on every focusable element.
- **Short messages (Sonner):** bottom-centre on phones, bottom-right on laptops; `--color-surface`,
  `--shadow-raised`, icon + sentence. For "Link copied" and errors not tied to one field. Field errors stay at
  the field.
- **Share pop-up:** below 40rem a bottom sheet (Vaul) with a drag handle; from 40rem a centred dialog
  (`--width-form`), both `--shadow-overlay` on `--color-backdrop`. The QR code always sits on white with a quiet
  zone, also in dark mode (scanners need dark-on-light).
- **Numbers (NumberFlow):** countdown, points earned, totals in standings, duel scores. Tabular.
- **Browser surfaces:** `::selection` uses `--color-primary-soft` + `--color-text`; `accent-color` and
  `caret-color` use `--color-primary`; `color-scheme: light dark`.

## Motion

Motion only shows a change caused by the player or the game: answer locked, right answer revealed, points
earned, standings appear, a pop-up opens. Only `transform` and `opacity` animate (and the wave circle on its
canvas). Nothing moves on page load except the landing circle's idle pulse.

### Tokens

| Token | Value | Used for |
|---|---|---|
| `--duration-instant` | 100ms | Press scale, hover colour |
| `--duration-fast` | 160ms | Chosen-answer state, toast in/out, small fades |
| `--duration-base` | 240ms | Reveal panel in, correct/wrong marks, number roll per tick |
| `--duration-slow` | 420ms | Standings rows, podium rise, sheet open |
| `--duration-wave-colour` | 900ms | Circle blends from app colours to cover colours |
| `--stagger-step` | 40ms | Delay between standings rows (max 8 rows staggered, rest appear together) |
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | Things entering, number rolls (default) |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Things moving from one place to another, colour blends |
| `--ease-in` | cubic-bezier(0.5, 0, 0.75, 0) | Things leaving (used with `--duration-fast`) |

### What moves, when

1. **Answer tapped:** button presses (`scale(0.97)`, instant), then shows "Locked in" (fast). Other buttons do
   not move.
2. **Reveal:** the right answer gets its mark first (base), then the reveal panel fades and rises 8px (base,
   80ms later), then "+points" pops (scale 0.9 → 1, base) and the total rolls (NumberFlow). At the same moment the
   circle blends to the cover colours (wave-colour). The answer buttons stay where they are.
3. **Next round:** panel fades out (fast, ease-in); the circle returns to app colours over `--duration-base`
   before the new clip starts, so no album colour is ever on screen during an open round.
4. **Countdown:** digits roll each second (NumberFlow, base). The time arc moves continuously with `transform`
   (rotate/scale, not `width`, which today's bar animates).
5. **Standings:** podium blocks rise (slow), then rows from rank 4 fade in with the stagger. Total under
   0.8s.
6. **Pop-up / sheet:** dialog fades + scales 0.96 → 1 (fast); sheet slides up (slow) and follows the finger
   when dragged (Vaul).

The wave circle runs on `requestAnimationFrame` only while it is on screen and the tab is visible.

### Reduce motion (`prefers-reduced-motion: reduce`)

- All the movements above are turned off: duration tokens become `0ms` in a
  `@media (prefers-reduced-motion: reduce)` block, NumberFlow shows the new number directly, Sonner and Vaul
  appear without sliding (checked by hand in #66).
- The wave circle stays still as a plain ring. It still changes colour on reveal (colour is not motion), as a
  crossfade.
- Nothing that carries information depends on motion: every state change is also a word, an icon or a colour.

## The wave circle

A browser-only component (`<canvas>`, no package) used on the landing page, in the solo round, on the
Multiplayer game board (top half) and in the duel.

- **Shape:** a ring of a fixed number of points (proposed 96) around a centre. A pure function turns one frame
  of the analyser's frequency data into the points: silence gives a perfect circle at the base radius; louder
  bands push the outline out, at most to the edge of the drawing area. The component only draws what the
  function returns (tests in #63).
- **Size:** base radius 34% of the canvas, maximum outline 48%; inner disc (holds the seconds) 26%. Canvas
  220px on phones, 280px on laptops, drawn at `devicePixelRatio`.
- **Colour during a round:** a conic gradient through `--color-wave-blue` → `--color-wave-cyan` →
  `--color-wave-violet` → back to blue, read from the CSS tokens so dark mode works.
- **Colour after the answer:** 2–3 colours picked from the album cover's pixels, blended in over
  `--duration-wave-colour`. If the cover is missing, fails to load or is nearly grey, the app colours stay.
- **No analyser** (browser refuses, sound blocked): a slow idle pulse, ±3% radius over 2.4s, ease-in-out. The
  same pulse runs on the landing page.
- **Never** blocks the answer buttons, never delays the round, never carries text except the seconds on its
  solid inner disc (`--color-text` on `--color-surface`, a checked pair).

## Do's and Don'ts

**Do**
- Use tokens for every colour, size, space, radius, shadow and timing.
- Show right/wrong, away and answered with an icon or word as well as colour.
- Keep one filled violet button per screen.
- Give nicknames and song titles room to wrap or truncate with an ellipsis (25 players, long names).
- Check every new text/background pair against the contrast list above and add it there.

**Don't**
- Don't use album colours, the cover or anything from the song before the answer is revealed.
- Don't animate layout properties (`width`, `height`, `top`, `left`), and don't add motion without a cause.
- Don't use gradient text, glass/blur, glows or nested panels.
- Don't use emoji or Unicode glyphs as icons (avatars are the exception: they are content).
- Don't lower contrast with `opacity` on text.
- Don't add Tailwind, a component library, an animation library or an icon package.

## Updates

Update 18 Nov 2026 (#59): the tokens are in `app/globals.css`. Two small additions while building them:
line-height tokens `--leading-xs` … `--leading-number` carry the line heights from the type scale table, and
under reduce motion `--duration-wave-colour` keeps its value (only the movement timings become `0ms`), because
the circle still crossfades its colour on reveal. To add a text/background pair, add a row to the
"Contrast pairs" table: `tests/client/design-tokens.test.ts` reads that table and checks the row in the given mode.

Update 18 Nov 2026 (#60): icons live in `components/icons/` (also headphones, bolt, people and a back arrow for the
landing page and back links). The focus ring, `::selection`, `accent-color` and `caret-color` are set once in
`app/globals.css` for every element. The room code input uses the body font (Atkinson tells 0/O and 1/l apart);
the large room code in the lobby keeps the display font. Until #64 adds the canvas, the landing page shows a still
ring in the wave colours in the circle's place.

Update 18 Nov 2026 (#61): the solo round is one frame from "Loading first song…" to the reveal: status line,
the stage (a fixed 220/280px square where the wave circle goes, #63; until then a still ring in the wave colours)
with the seconds, 3-2-1 or the verdict icon on its inner disc, then the rest. The time left is a thin bar under the
stage that shrinks with `transform: scaleX()` (not an arc on the disc edge; #63 may move it onto the circle).
On reveal the panel takes the place of the time bar and question, between the stage and the answers, as in the
sketch; the answer buttons do not animate. The icons live in `components/icons/` (one file per icon).

Update 18 Nov 2026 (#62): the share pop-up and short messages are built. New token `--color-qr-bg` (#ffffff in both
modes): the QR code sits on it inside a white frame (`--space-4` padding) that adds a quiet zone. The bottom sheet
keeps Vaul's own timing (500ms, its iOS curve), because Vaul uses the same curve when it finishes a drag; the laptop
dialog fades and grows from 0.96 over `--duration-fast`. Under reduce motion the sheet and dialog appear without
moving. Short messages sit bottom-right on laptops and across the bottom on phones (Sonner switches below 600px),
above the pop-up, with a check or cross icon.

Update 18 Nov 2026 (#63): the wave circle replaces the still ring in the solo stage. The canvas fills the stage
(behind the disc); the outline is a light 18 % wash of the gradient with a 3px stroke on top. It follows the music
during the round and the reveal, and idles (±3 % pulse) while loading or when no analyser is available. The time
bar stays under the stage (not moved onto the circle). Analyser: fftSize 256 (128 bands), smoothing 0.8; the ring
shows the lower 64 bands, mirrored left/right, with a small boost for higher bands so not only the top moves.

Update 18 Nov 2026 (#64): the cover colours come from `pickCoverColours` (`lib/client/cover-colours.ts`) through
the `useCoverColours` hook. Under reduce motion the circle's colour now changes at once instead of crossfading
(`--duration-wave-colour` is 0ms there too); this replaces the reduce-motion note from #59. Leaving the reveal, the
circle blends back to the app colours over `--duration-base`. On the landing page the circle is
`min(220px, 55vw, 26dvh)` on phones, with the empty canvas edge above and below given back to the page, so the
title and the main buttons sit higher on short screens; 280px left of the column from 64rem up, as before.

Update 18 Nov 2026 (#65): room screens built. Board: the wave circle's top half replaces the song half circle at the
same size (radius = `SONG_RADIUS`, outline ≤ 48 % of its square), seconds on a half disc (28 % radius), "Round n / N"
top left, a time bar as the board's base line; answered/away marks are corner badges on the nickname labels. Room
creator controls and Leave are quiet `--color-text-muted` text buttons in one centred row. Podium: blocks
`--color-surface-alt` (own block `--color-primary-soft` with a primary outline), heights 6 / 4.5 / 3rem by rank;
with two players only two blocks. Blocks rise third → second → first (`--duration-slow`, `--stagger-step` apart),
then list rows from rank 4 rise with the stagger. The room result reuses the solo stage and reveal pieces without a
second panel (the page card already is one); its circle blends to the cover colours like the solo reveal.

Update 18 Nov 2026 (#66): duel built. Each side is a tinted panel (`--color-secondary-soft` with a `--color-secondary`
outline for the opponent, `--color-primary-soft` with a `--color-primary` outline for "you"): avatar and nickname
(opponent's nickname in `--color-secondary`), an "Answered" / "Away" pill under it, and the score on the right with
a small "Score" label, in `--text-number` (capped at 2.75rem side by side on a laptop so 5 digits fit). The whole wave
circle sits between them, `min(220px, 56vw, 26vh)` on phones and `min(220px, 30vh)` from 48rem, with the seconds
on a solid disc (inset 24 %), "Round n / N" under it and the board's time bar under the duel. Scores roll from the
value seen last round to the new one when a round starts (NumberFlow; at once with reduce motion).

Update 18 Nov 2026 (#67): stress, phone and accessibility pass. The old colour names (`--background`, `--foreground`,
`--card`, `--muted`, `--accent`, `--accent-text`, `--good`, `--good-bg`, `--bad`, `--bad-bg`) are removed from
`app/globals.css`; nothing used them any more, so the "Old names → new names" table above is history now. Phone
basics are set once in `app/globals.css`: no tap highlight, no text inflation in landscape, `touch-action:
manipulation` on links and controls, and button labels are not selectable. Hover styles only apply to a precise
pointer (`(hover: hover) and (pointer: fine)`), so a tapped button never keeps its hover look. Sizes that follow the
screen height use `svh` (the height with the browser bars showing), so the board, the duel circle and the landing
circle never grow when the address bar hides. A cover that fails to load is left out instead of showing a broken
image. On the board the answered/away badges come after the nickname (a screen reader says the name first), and a
player who is both gets the second badge on the other corner. The solo game keeps its errors in the page (start
screen and error screen) instead of short messages: each one belongs to the button right under it ("Start game",
"Try again") and should not disappear after a few seconds.

Update 18 Nov 2026 (#57, review): the motion rule, said precisely. Short colour transitions on hover/press states
are allowed (`--duration-instant`, as the token table already says: "hover colour"); anything that moves uses only
`transform` and `opacity` (and the wave circle on its canvas). This matches the CSS: the landing and form buttons,
inputs, tiles and avatar options fade their border or background colour over `--duration-instant`; the game and
room buttons change colour at once and only their press scale moves.

Update 18 Nov 2026 (#57, review): the solo and room games share their styles through
`components/GameShared.module.css` (buttons, the stage, the time bar, answer buttons, the reveal and the `pop` and
`riseIn` keyframes, each defined once) instead of the room importing `SoloGame.module.css`. One stage component
(`components/GameStage.tsx`) and one time bar (`components/TimeBar.tsx`) are used by the solo round, the room result,
the game board and the duel; each screen only sets the time bar's width. The wave circle's audio wiring is one hook,
`useWaveAudio` (`lib/client/useWaveAudio.ts`). Nothing looks different.

Update 18 Nov 2026 (#57, review): this replaces the end of the #67 note. The solo game's errors (the start refused,
server or network errors, a clip that would not load) now show as short messages (`showError`, #62), the same style as
every other error that is not tied to one field. The button that recovers stays in the page: "Start game" on the start
screen and "Try again" on the error screen, which says "The game stopped." in muted text.

Update 18 Nov 2026 (#57, review): a shared rank in the standings is visible on screen, not only to screen readers: it
shows as "=2" (`rankText`, `lib/client/standings-view.ts`) on the podium block and in the list row alike, so when more
than three players share podium ranks the tied player in the list shows the same "=1" and never looks lower-ranked.
The list's rank column is 2.75rem wide so "=25" fits.
