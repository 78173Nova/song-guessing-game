# 016 – Visual design: one look, the wave circle and three UI packages

Date: 18 Nov 2026 · Status: decided, plan accepted by Jasper Berndt on 18 Nov 2026 with all proposed extras (inline SVG icons, circle replaces the board/duel ring, QR stays on white, countdown bar on transform) (issue #58, spec #57)

The detailed rules (tokens, fonts, sketches, motion, contrast list) are in [`DESIGN.md`](../../DESIGN.md).

## Decision
- **Look:** "late-night radio dial": deep navy and ink instead of grey, violet as the one action colour, cyan
  for the other side in a duel, green/red only with an icon or word. Light and dark mode follow the system
  setting. Two fonts through `next/font/google`: Bricolage Grotesque (titles, numbers) and Atkinson Hyperlegible
  Next (everything people read or type). All values are CSS custom properties (`--color-…`, `--text-…`,
  `--space-…`, `--radius-…`, `--duration-…`, `--ease-…`) in `app/globals.css`; area stylesheets use only these.
- **Tools:** Impeccable (`shape` for this plan, later `craft`, `audit`, `polish`) is the design director, with
  `frontend-design` as fallback. Emil Kowalski's skills (`animate`, `choreograph`, `break-ui`, `mobile-native`)
  for motion and edge cases; `ui-ux-pro-max` only as an accessibility review. Impeccable's hooks stay off.
  None of these tools is part of the app.
- **Wave circle:** a canvas ring that ripples to the playing clip, read through the browser's own sound
  analyser (Web Audio API, no package). During a round it uses the app's own three colours (dark blue, cyan,
  violet). When the answer is revealed it blends into 2–3 colours taken from the album cover.
- **Packages (planned, each added on its own ticket with an exact version):** NumberFlow (rolling numbers for
  the countdown, points and scores), Sonner (short messages such as "Link copied" or a network error), Vaul
  (the share pop-up as a bottom sheet on phones).

## Why
- UI/UX is 20 % of the grade and the app looked like a starter page; one set of tokens makes every screen look
  like the same product and makes a later change a one-line change.
- The circle makes the moment a song plays visible, which is the core of a music quiz.
- **Album colours only after the answer:** the cover reaches the browser only with the revealed answer
  (rule 5 in CLAUDE.md, decision 004). Using its colours earlier would need the cover earlier and could hint at
  the song. So the open round uses the app's colours, and the cover colours are the reward at the reveal.
- The fonts were picked for the use scene (phones, evening, reading a room code from across a table): Atkinson
  keeps I/l/1 and O/0 apart; Bricolage gives titles and numbers character without a logo.
- The three packages each do one thing that is hard to get right by hand (digit rolling with reduce-motion,
  accessible stacked messages, a drag-to-close sheet) and are small.

## Alternatives
- **Keep the old look and only tidy it:** less work, but it stays generic and each area keeps its own style.
- **Tailwind or a component library (shadcn/ui, Radix):** faster to start, but a new way of styling for the
  team to learn and explain, and many more dependencies.
- **Album colours during the round:** prettier, but breaks rule 5 (it would leak information about the song).
- **A package for the visualiser or a WebGL shader:** more effects, but heavier and harder to explain than a
  small canvas drawing driven by one pure, tested function.
- **Writing rolling numbers, messages and the sheet ourselves:** no packages, but more code and more
  accessibility details to get wrong.

## Limits
- Contrast was computed for every pair listed in `DESIGN.md`; colours used outside that list are not checked
  until ticket #59's test reads the tokens.
- Some phone browsers block the sound analyser; the circle then shows only an idle pulse.
- Cover colours depend on Apple's image server allowing cross-origin reads (checked on 18 Nov 2026); if that
  changes, the circle keeps the app colours.
- Looks, motion and sound are checked by hand (decision 011), not by screenshot tests.
- No theme switch inside the app; dark mode follows the system setting only.

## How it could change
- The colours, fonts and timings change in one place (`app/globals.css`) and in `DESIGN.md`.
- The circle could move to WebGL, or react to the beat more cleverly, without changing its pure shape function.
- A package can be dropped by replacing it with plain code in its component; each is used in only a few places.

Update 18 Nov 2026: the tokens now live in `app/globals.css` (#59), with the old colour names as aliases, and
the fonts load through `next/font/google` (no package). `tests/client/design-tokens.test.ts` reads the colours
from that stylesheet and the pair list from the "Contrast pairs" table in `DESIGN.md`, so a pair added to the
table is checked automatically in both modes; the limit above ("not checked until #59") no longer applies.

Update 18 Nov 2026 (#60): the landing page and form screens use the tokens. The shared icons are hand-written
inline SVG components in `components/icons/` (one file per icon, same 24px box and 2px stroke), no icon package.
On the landing page only "Play solo" is a filled button (One Violet Rule), so "Create a room" became a secondary
button and Log in / Sign up became quiet text buttons. Error lines get their cross icon from CSS, so every error on
every screen looks the same without changing the components. Account forms still show the server's one message per
form right above its button: the server does not say which field it is about.

Update 18 Nov 2026 (#61): NumberFlow is installed as `@number-flow/react` 0.6.2 (exact version, adds only
`number-flow` and `esm-env`). It rolls the solo countdown, the 3-2-1 and the score; it follows "reduce motion" by
itself (`respectMotionPreference`, on by default), so numbers then change without rolling. `npm audit --omit=dev`
reports 0 vulnerabilities; the full `npm audit` reports 16 high findings that were already there before this
package, all from one `picomatch` advisory inside the dev tooling (vitest, eslint-config-next), with no fixed
version yet.

Update 18 Nov 2026 (#63): the wave circle is in the solo round, built by hand with no package:
`lib/client/wave-shape.ts` (pure: frequency frame → 96 outline points, idle pulse, colour blend; tested),
`lib/client/wave-audio.ts` (connects the round's audio players to one analyser) and `components/WaveCircle.tsx`
(the canvas; also has an idle mode without analyser for the landing page and a still mode for reduce motion;
colours can be passed in for the reveal, #64). The players now ask for cross-origin access (`crossOrigin =
"anonymous"`), which the analyser needs. Limit: if Apple's clip server ever stopped sending the cross-origin
header, the clips would fail to load and the rounds would be skipped; then `prepare()` in `wave-audio.ts` is the
one line to remove, and the circle idles. A clip is routed through the analyser only when the sound context is
already running, so the music never goes silent because of the circle.
