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

Update 18 Nov 2026 (#62): **Vaul 1.1.2** (the share pop-up: a bottom sheet that can be swiped down below 40rem, a
centred dialog with no dragging from 40rem; Esc closes it and the focus goes back to the button that opened it) and
**Sonner 2.0.8** (short messages, mounted once in `app/layout.tsx` as `components/MessageArea.tsx`; pages call
`components/messages.ts`) are installed with exact versions. Vaul brings Radix's dialog with it as a sub-dependency;
we do not use Radix directly. Short messages are used for "Link copied", for errors from buttons that are not about a
form field (start, extend, leave, kick, play again, a refused answer, log out) and, as one lasting message that
updates in place, for "can't reach the server" while the room or the public room list keeps asking; it goes away by
itself when the connection is back. Field errors and the one server message per form stay where they were. The QR
code sits on a new `--color-qr-bg` token (white in both modes) with a white frame as its quiet zone. Limit: the
solo game's errors still show in the page (its files were being restyled in #61 at the same time); a later
ticket can move them to `showError`. `npm audit --omit=dev` reports 0 vulnerabilities; the full `npm audit` still
reports the 16 dev-tooling findings described under #61, none from these two packages.

Update 18 Nov 2026 (#63): the wave circle is in the solo round, built by hand with no package:
`lib/client/wave-shape.ts` (pure: frequency frame → 96 outline points, idle pulse, colour blend; tested),
`lib/client/wave-audio.ts` (connects the round's audio players to one analyser) and `components/WaveCircle.tsx`
(the canvas; also has an idle mode without analyser for the landing page and a still mode for reduce motion;
colours can be passed in for the reveal, #64). The players now ask for cross-origin access (`crossOrigin =
"anonymous"`), which the analyser needs. Limit: if Apple's clip server ever stopped sending the cross-origin
header, the clips would fail to load and the rounds would be skipped; then `prepare()` in `wave-audio.ts` is the
one line to remove, and the circle idles. A clip is routed through the analyser only when the sound context is
already running, so the music never goes silent because of the circle.

Update 18 Nov 2026 (#64): the wave circle shows the album cover's colours on the solo reveal and idles on the
landing page. `lib/client/cover-colours.ts` (`pickCoverColours`, pure, tested) picks 2–3 colours from the
cover's pixels: it skips nearly grey, black and white pixels, sorts the rest into 12 hue groups and takes the
biggest, never two that look nearly the same; a cover with too little colour gives null (the app colours stay).
`lib/client/useCoverColours.ts` (`useCoverColours(artworkUrl)`) loads the cover as a separate cross-origin image,
draws it 32 × 32 on a hidden canvas and returns the colours, or undefined while loading or on any failure; the
room screens can use the same hook. No package. Two changes to earlier choices: under "reduce motion" the colour
now changes at once (`--duration-wave-colour` becomes 0ms too, as the ticket asks), and the circle goes back to
the app colours over `--duration-base` instead of the 900ms blend, so no album colour is left when the next round
starts. Limit: the cover is downloaded twice (once for the picture, once with cross-origin access for the
pixels); both are small and usually come from the browser cache.

Update 18 Nov 2026 (#65): the room screens use the tokens; no new package. The lobby shows the room code, the
countdown (display font) and the settings at the top, then the players as rows (own row soft violet with "(you)",
away players muted with the away icon and the word "away"); the room creator's Extend and Kick, and Leave, are
quiet muted text buttons under the one violet button. On the Multiplayer game board the wave circle replaces the
song half circle: only its top half shows, at the same size, so the seat positions in `lib/client/room-board.ts`
did not change; the seconds sit on a half disc, "Round n / N" in the board's top-left corner, and the time left is
a bar under the board (transform, not width). The answered and away marks are small badges on a nickname's corner,
so with 25 players they take no room from the name. Rooms reuse `wave-audio.ts` the same way as the solo game
(unlock in the Join / Start now / Play again tap, prepare players before a clip, attach when a clip starts); a
player that loaded a clip before any tap (e.g. after a reload) is never routed through the analyser, so its sound
cannot go silent, and the circle idles. The room result shows the same stage as the solo reveal, and its circle takes
the cover colours from `useCoverColours` (#64); the board during a round never gets them. Standings: the top three on a podium (winner in the middle, block height
by rank, so equal points share both rank and height) from `lib/client/standings-view.ts` (pure, tested); totals
roll up from 0 with NumberFlow (straight to the number with reduce motion). The duel layout is left to #66.

Update 18 Nov 2026 (#66): the duel layout uses the tokens; no new package. The opponent's side (cyan tint, top) and
the viewer's side (violet tint with "(you)", bottom, just above the answers) each show avatar, nickname and a large
score; from 48rem the two sides stand left and right of the circle. The duel ring is replaced by the whole wave
circle with the seconds on its solid disc, and the time bar under it is the same as the board's, so the answer area
matches the Multiplayer game board; during a round the circle has the app colours only (rule 5). The opponent's
answered mark is a check icon and the word "Answered" (and an away icon and "Away"), never their answer. The duel
shows only while a round is open, so the scores change while it is hidden: `scoreMemory` in
`lib/client/room-duel.ts` (pure, tested) keeps the score the viewer saw last, and each score rolls from there with
NumberFlow when the next round starts (a lower score means a new game: no roll down). Limit: after a reload the
memory is empty, so the scores show at once without rolling.

Update 18 Nov 2026 (#67): the redesign was checked with worst-case data (20-character nicknames, 25 players, the
highest possible scores, missing covers), on phone-width rules and for accessibility; the fixes are small and change
no behaviour (see the DESIGN.md update for the list). The old colour names are gone, so every style uses the
`--color-…` tokens. Decided: the solo game's errors stay in the page instead of becoming short messages (Sonner),
because each one sits right above the button that fixes it and a short message disappears after a few seconds. Not
done, on purpose: a `theme-color` for the phone's status bar (Next.js needs the colour as a literal value, which would
copy token values outside `app/globals.css`; `color-scheme` already lets the browser match light and dark), and
`viewport-fit=cover` (the page would then need safe-area padding on every side; without it the browser keeps the page
clear of the notch by itself).

Update 18 Nov 2026 (#57, review): this replaces the #67 note on the solo game's errors. They now show as short
messages through `showError` (`components/messages.ts`, #62), like every other error that is not tied to one form
field (user story 26: one message style). The button that recovers stays in the page: "Start game" on the start
screen (e.g. after "too few songs match these filters") and "Try again" on the error screen, which now only says
"The game stopped." Why the change: one message style everywhere matters more than keeping the text above its button;
the button stays, so the player can still recover after the message has gone. Also from the review: the solo and
room games share one stage, one time bar, one stylesheet (`GameShared.module.css`) and one audio hook
(`useWaveAudio`); the motion rule now says that short hover/press colour transitions are allowed; and a shared
rank in the standings is visible on screen ("=2"), not only to screen readers.

Update 18 Nov 2026 (merge of `main`): the "has answered" mark is neutral grey with no tick, on the board, beside your own
name and in the duel, as the team decided in PR #74 (a tick or the success green read as "they answered right"). It
stays readable without colour: a bold name plus hidden "has answered" text on the board, and the word "Answered" on the
pills. The solo settings tiles from `main` (team feedback points 7 and 8) use the shared tile style; their notes about
too few songs use the form error style, while a refused start still shows as a short message.
