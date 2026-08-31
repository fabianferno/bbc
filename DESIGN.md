---
name: BBC — the Bull Broadcasting Corporation
description: A 24-hour news channel whose only story is its own trading book.
colors:
  red: "#bb1919"
  red-deep: "#8e1414"
  red-bright: "#e02020"
  studio: "#0a0d11"
  studio-2: "#11161d"
  desk: "#171d26"
  rule: "#232b36"
  rule-lit: "#33404f"
  white: "#ffffff"
  ink: "#f2f3f5"
  dim: "#9aa4b2"
  faint: "#66707d"
  live: "#ff2d2d"
  up: "#33d17a"
  down: "#ff5a4d"
  hold: "#f2b441"
  monitor: "#2f6fd0"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "clamp(2.6rem, 7vw, 4.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "clamp(1.25rem, 3.1vw, 2.4rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.022em"
  strapline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.005em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.13em"
rounded:
  none: "0px"
  monitor: "14px"
  lamp: "999px"
spacing:
  hair: "4px"
  tight: "8px"
  row: "14px"
  panel: "16px"
  section: "40px"
  band: "64px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.red-bright}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  monitor:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.monitor}"
    padding: "14px 16px"
  monitor-lit:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.monitor}"
  pill-neutral:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  pill-red:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  lower-third:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
  strap:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.white}"
    typography: "{typography.strapline}"
    rounded: "{rounded.none}"
    padding: "8px 28px"
  ticker:
    backgroundColor: "#0d1117"
    textColor: "{colors.dim}"
    rounded: "{rounded.none}"
    height: "3.5rem"
  rundown-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "14px 16px"
  rundown-row-hover:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.white}"
---

# Design System: BBC — the Bull Broadcasting Corporation

## Overview

**Creative North Star: "The Night Desk"**

This is a broadcast, not a dashboard. The product is an autonomous
prediction-market trader, and the entire interface is built as the 24-hour news
channel that covers it — a dark studio, an out-of-focus video wall throwing cold
monitor light, a bull anchor camera-right, a red lower third keyed over the
bottom of the shot, and a tape rolling along the foot of the screen at all
times. The category default for this product is a grid of tiles with an accent
colour. This world refuses that outright: the red is not an accent, it is
furniture — the bar the headline sits inside, the strap under it, the tag on
the tape, the cut-in that interrupts.

The density is a newsroom's: information-dense but ordered by rank, not spread
evenly. Big serif headlines carry the story; everything administrative — labels,
tags, statuses, buttons, timestamps — collapses into one tiny all-caps tracked
Archivo voice, the chyron. That two-voice split does almost all the hierarchy
work; there is very little in between. Panels are treated as lit studio monitors
rather than paper cards: a slightly lighter face than the studio floor, one
hairline bezel, one soft downward shadow, and a 14px corner.

The world is dark by commitment, not by theme toggle. `color-scheme: dark` is
declared at the root and there is no light mode; a broadcast studio is a dark
room with lit screens, and BBC red only reads as broadcast red against
near-black. Motion is borrowed from vision mixing rather than from web
animation: things *cut* in with a clip-path wipe, they do not fade and scale.

**Key Characteristics:**
- Dark studio ground (#0a0d11) with a light-only, imagery-free video-wall backdrop
- BBC broadcast red as page furniture — bars, straps, cut-ins, tape tags
- Source Serif 4 headlines against Archivo chyrons, with almost nothing between them
- Panels as lit monitors: one bezel, one shadow, 14px corner
- Square controls, round lamps: radius is semantic, not decorative
- A fixed rolling ticker on every page, occupying the bottom 3.5rem
- Every P&L figure visibly labelled as paper

## Colors

A near-black studio floor lit by two coloured sources — a cold blue monitor bank
and a warm broadcast red — with a five-step neutral text ramp and four status
lamps borrowed from a trading desk.

### Primary
- **Broadcast Red** (`red`): the channel's furniture colour. It fills the lower
  third, the ticker's live-tape cap, the breaking cut-in, the wordmark box, the
  primary button, and the clock cell. It is used as a *ground* far more often
  than as ink. Reach for it whenever a surface is speaking on-air; never as a
  small decorative highlight.
- **Deep Red** (`red-deep`): the strap band that runs directly beneath a lower
  third headline. It exists to let two red bars stack and still read as two.
- **Bright Red** (`red-bright`): red as ink, not ground — the hover state of the
  primary button, the segment index in `SectionLabel`, the accent figure in the
  studio wall, and the hover colour of a rundown row's number and arrow.

### Secondary
- **Monitor Blue** (`monitor`): the cold light of the video wall, and the one
  informational (non-alarming) status. Links out to a chain explorer, the
  "running" phase pill, and the "open" position status.

### Tertiary
- **Live Red** (`live`): reserved for the pulsing on-air lamp only. It is
  hotter than broadcast red on purpose so a lamp reads against a red bar.
- **Up Green** (`up`), **Down Coral** (`down`), **Hold Amber** (`hold`): the
  desk's status lamps. Green for gains and confirmed on-chain state, coral for
  losses and error panels, amber for anything provisional — paper mode,
  simulated, planned, inference spend.

### Neutral
- **Studio** (`studio`): the floor. The page background, the header's
  translucent ground, the scrollbar track.
- **Studio 2** (`studio-2`): the next band up. Used to separate a full-width
  section from the one above it without a rule.
- **Desk** (`desk`): the lit face of a monitor panel and the hover ground of
  every interactive row.
- **Rule** (`rule`) / **Rule Lit** (`rule-lit`): the hairline bezel and divider,
  and its lifted counterpart for a ghost button's border or an unselected pill.
- **White** (`white`) / **Ink** (`ink`) / **Dim** (`dim`) / **Faint** (`faint`):
  the four-step text ramp. White is headline and emphasis; ink is body; dim is
  supporting prose and the ticker's own text; faint is labels, timestamps and
  anything that should recede until hovered.

### Named Rules

**The Furniture Rule.** Red is a surface before it is a colour. If red appears
on a screen, it should be filling a bar that carries type — a lower third, a
strap, a cut-in, a tape cap, a wordmark box, a button. A stray red border, red
icon or red underline is a sign the world has slipped back into
accent-colour thinking.

**The Two-Light Rule.** The studio is lit by exactly two sources: monitor blue
from camera-left and broadcast red from camera-right, both as soft radial
gradients at low opacity. Never introduce a third hue into the environment.
Status lamps are ink, not light, and do not count.

**The Paper Label Rule.** Every P&L, return or performance figure is rendered
adjacent to a visible paper-mode marker — an amber `hold` pill reading
"Paper mode · simulated on Manifold", a "paper" word in the label itself, or
both. A number that could be read as realized cash is a defect, not a style
choice.

## Typography

**Display Font:** Source Serif 4 (600, 700) with Georgia, Times New Roman fallback
**Body Font:** Archivo (400, 500, 600, 700) with system-ui fallback
**Label Font:** Archivo 700, uppercase, heavily tracked — the chyron voice

**Character:** A newsreader's pairing. The serif is the voice on air: warm,
authoritative, tightly set (−0.022em) and almost solid-leaded (1.02) so a
headline reads as a single block of speech. Archivo is everything the channel
prints on screen around that voice — grotesque, neutral, and at label size
compressed into a hard all-caps chyron. The gap between the two is deliberately
large; there is no comfortable middle register, which is what keeps the page
reading as broadcast rather than as an editorial site.

Both font variables are declared on `<html>`, not `<body>` — `@theme inline`
resolves `--font-head` and `--font-ui` at `:root`, so declaring them lower leaves
every `.headline` silently falling through to the platform serif. Do not move
them.

### Hierarchy
- **Display** (`.headline`, 600, `clamp(2.6rem, 7vw, 4.75rem)`, 1.02): the one
  hero headline per surface. Constrained to ~16ch so it breaks into two or three
  short lines like an on-air super.
- **Headline** (`.headline`, 600, `clamp(1.25rem, 3.1vw, 2.4rem)`, 1.02): the
  headline inside a lower third, and section-opening statements. Text-balanced.
- **Title** (`.headline`, 600, ~1.25–1.875rem): the figure in a `Stat`, the
  percentage in a rundown row, the heading of an empty state. Always paired with
  `.numeric` when it carries a number.
- **Strapline** (`.strapline`, Archivo 600, 13–15px): the second line under a
  lower third, and the text of a breaking cut-in. The only place Archivo speaks
  at sentence length in a bold weight.
- **Body** (Archivo 400, 14–17px, `leading-relaxed`): explanatory prose,
  constrained to a 52–70ch measure depending on column width.
- **Label** (`.chyron`, Archivo 700, 11px, 0.13em, uppercase): every small
  label in the system without exception — section names, pills, buttons, table
  headers, statuses, tape tags, nav items, timestamps, empty-state notices.

### Named Rules

**The Two-Voice Rule.** Type is either a headline (Source Serif) or a chyron
(uppercase tracked Archivo). Body prose is the only thing allowed in between,
and it is always plain Archivo at a normal weight. There is no third display
face, no semibold sans headline, and no serif label.

**The Chyron Rule.** If a piece of text is a label rather than a sentence, it
takes `.chyron` — including button text. Sentence-case small text is body copy;
if you find yourself wanting a 12px semibold sentence-case label, it is either a
chyron or it is prose.

**The Tabular Rule.** Every figure carries `.numeric`. `tnum` is on globally at
the body, and `.numeric` sets `font-variant-numeric: tabular-nums` on top, so
prices, percentages, clocks, hashes and P&L columns never jitter as they tick.

## Layout

The page is a single centred column of full-bleed bands, not a fixed grid.
Each band sets its own container and horizontal padding: `px-4` on mobile,
`sm:px-6` above. Vertical rhythm inside a band runs on a coarse scale —
`py-8` for a dense working surface, `py-10`/`py-12` for a standard section,
`py-16` for a feature band. Gaps between panels are `gap-3` to `gap-6`; internal
panel padding is `px-4 py-3.5` for a readout and `px-5 py-5` for a prose row.

The hero band on the home and desk surfaces is a two-column asymmetric grid
(`1.15fr / 0.85fr` and `1.2fr / 0.8fr`) with `items-end`, collapsing to a single
column below `lg`. The anchor sits in the narrow right column and is pulled
downward with a negative bottom margin equal to the band's bottom padding, so it
appears to stand behind the lower third that is absolutely pinned across the
bottom of the shot. The analyze surface uses a three-column working layout
(`340px / 1fr / 390px`) that collapses to one column below `lg`.

Container widths have drifted and are inconsistent across surfaces: `1440px`
(home, desk), `1400px` (portfolio), `1500px` (analyze), and `max-w-3xl` on the
verify page. Treat **1440px** as the intended channel width for broad surfaces
and `max-w-3xl` as the intended width for a single-document read; the 1400 and
1500 variants are drift and should converge on 1440.

**Responsive behaviour.** Everything must hold at 375px. The nav carries two
label sets — a short one for phones, the programme's real name above `sm`. The
studio-wall readout goes from a stacked two-column list on mobile to a four-up
divided row at `lg`. Wide tables live inside their own `overflow-x-auto`
container; the page body itself never scrolls horizontally (`overflow-x: hidden`
is set on `body` as a backstop, not as a licence to overflow).

### Named Rules

**The Tape Rule.** A fixed ticker occupies the bottom 3.5rem of every page at
`z-40`. `main` carries `pb-14` to clear it. Nothing critical, and no primary
action, may sit in that band.

**The Band Rule.** Sections are separated by a change of ground
(`bg-studio-2`), a `border-rule` top edge, or generous vertical padding — never
by a floating card with a shadow. The page is a stack of full-width bands the
studio light falls across.

## Elevation & Depth

This system is almost flat. Depth comes from tonal layering — studio floor to
studio-2 to desk — plus the environmental light of the `.studio` gradient stack.
There is exactly one structural shadow in the vocabulary, and it belongs to the
monitor panel; everything else that appears to be depth is either a hairline
border or a change of ground.

The `.studio` backdrop is the system's one atmospheric device: four stacked
radial and linear gradients for the room light, plus a `::before` layer of soft
blurred rectangles (`blur(22px)`, 0.5 opacity) standing in for a bank of
out-of-focus monitors, masked to fade out before the bottom of the section. It
is pure light — there is no photographic texture, noise layer, or image in the
environment.

### Shadow Vocabulary
- **Monitor** (`box-shadow: 0 18px 40px -24px rgba(0,0,0,0.9)`): the single
  panel shadow. A soft, heavily-negative-spread pool beneath a lit screen.
- **Monitor Lit** (`box-shadow: 0 18px 44px -22px rgba(187,25,25,0.55)`, with a
  red-tinted border): the same shadow burning red, for the one panel currently
  on air.
- **Anchor key light** (`drop-shadow(0 28px 44px rgba(0,0,0,0.6))` plus a
  blurred red ellipse behind the shoulders): specific to the bull anchor.
- **Lamp pulse** (an animated expanding `box-shadow` ring): the live lamp only.

### Named Rules

**The One Shadow Rule.** Elevation is declared once, by `.monitor`. Nothing else
in the system casts a shadow — not buttons, not pills, not rows, not the header.
A second shadow vocabulary means a card has crept in where a monitor belongs.

**The No-Glass Rule.** The one backdrop-blur in the system is the sticky header
(`bg-studio/95 backdrop-blur`), where it exists so type stays legible over
scrolling content. Blur is never used as decoration, and there are no frosted
panels.

## Shapes

Radius is semantic and takes exactly three values.

**14px** belongs to the monitor panel and nothing else — it is the corner of a
studio screen, and it is the only rounded rectangle in the world. **0px** is the
default for everything that behaves like broadcast furniture: lower thirds,
straps, cut-ins, the ticker and its tape cap, pills, buttons, the wordmark box,
table cells, rundown rows. **Fully round** (999px) belongs only to lamps and
status dots, which are physical indicator lights.

Borders are hairlines: `1px solid` in `rule` for a bezel or divider, `rule-lit`
for a control's edge, and a tinted `border-down/45` on a monitor that is
reporting an error. The recurring silhouette of the whole system is a
horizontal bar of type — the lower third, the strap, the tape, the rundown row —
stacked and full-bleed, which is why square corners dominate and the 14px
monitor reads as a distinct object when it appears.

## Components

### Buttons
- **Shape:** hard square corners (0px). Chyron type, so the label is uppercase
  and tracked. Padding `8px 14px`.
- **Primary:** broadcast red ground, white text. Hover lifts to bright red;
  active presses down 1px (`translate-y-px`); disabled drops to 40% red.
- **Ghost:** transparent with a `rule-lit` hairline border and ink text. Hover
  turns the border red and the text white; same 1px press.
- **Quiet:** dim text only, no border or ground. Hover to white. For tertiary
  actions like a manual refresh inside a panel header.
- All variants transition colour only, take an icon at `size-3.5` with
  `strokeWidth={2.5}`, and inherit the global white 2px focus ring.

### Pills
- **Style:** a chyron in a 1px-bordered square box, `2px 8px`, no radius.
- **Tones:** `neutral` (rule-lit border, dim text) for inert metadata; `red`
  (solid red ground, white text) for an action being asserted; and `up` / `down`
  / `hold` / `monitor`, each a 45–50% opacity border over a 10% tint of its own
  hue. `hold` is the paper-mode pill and appears on every surface that shows a
  figure.
- Pills are for status and small controls only — never a navigation target,
  never a filter row's primary affordance.

### Cards / Containers — the Monitor
- **Corner:** 14px. **Background:** a subtle vertical gradient from desk to a
  darker floor, at 92% opacity so the studio light behind it shows through.
- **Border:** 1px `rule`. **Shadow:** the single monitor shadow.
- **Padding:** `px-4 py-3.5` for a readout; rows inside a monitor supply their
  own padding and the monitor takes `overflow-hidden` instead.
- **Variants:** `.monitor-lit` (red bezel and red-burning shadow) for the panel
  currently on air; `.monitor` with `border-down/45` for an error panel — this
  pairing recurs on three surfaces and is the system's error container.

### Navigation
- A sticky 56px channel bar over `bg-studio/95` with a `rule` bottom border and
  a backdrop blur. Left: the wordmark — "BBC" in Source Serif inside a solid red
  box, with the full corporation name as a chyron beside it above `sm`.
- Programmes (nav items) are chyrons with a 2px bottom border: transparent and
  faint at rest, red-bordered and white when `aria-current="page"`, ink on hover.
- Right: an on-air status cluster (pulsing lamp plus the agent's phase, or a
  faint dot and "Off air"), the studio clock, and the wallet controls. The
  status cluster hides below `md`, the clock below `sm`.

### Signature Components

**The Lower Third.** The channel's headline device and the most important object
in the system. A solid red bar carrying the serif brand block ("BBC" over a
brandSuffix chyron) and the headline, with an optional deep-red strap beneath it
holding a one-line summary and, flush right in its own broadcast-red cell, the
studio clock. It arrives with the `.cut-in` wipe. Pages compose it; they never
re-implement a red bar themselves.

**The Ticker.** A full-width strip fixed to the bottom of every page. A red cap
with a live lamp on the left, then a track of duplicated items rolling right to
left via a `translate3d(-50%)` keyframe so the loop is seamless. Speed is driven
by a `--roll` custom property computed from item count. Hovering the ticker
pauses the track so a line can actually be read. Items carry an optional
tone-coloured chyron tag and dim body text, separated by a thin `rule` divider.

**The Rundown Row.** The system's answer to a card grid. A market is a line in a
running order, not a tile: a zero-padded two-digit index in faint chyron, the
question in ink on one line with a dot-separated chyron metadata line beneath it,
and the market's yes-price as a large serif numeral on the right with an
`ArrowUpRight` at `size-4`. The whole row is the link; hover grounds it in
`desk`, whitens the question, and turns the index and arrow bright red.

**The Studio Clock.** A `<time>` element that renders `--:--` on the server and
fills in on the first client tick, so hydration never mismatches. Always
tabular. It appears in the header and in the lower third's strap.

**The Breaking Cut-In.** A transient red banner for a live event. A white chyron
tag with a lamp reading "Breaking", then the headline and an optional lighter
detail clause. It wipes in and dismisses itself after a TTL so the studio never
accumulates stale banners.

### Motion

Motion is a vision mixer, not an animation library. Four devices, all of them
using the same `cubic-bezier(0.16, 1, 0.3, 1)` decelerating ease:

- **`.cut-in`** (620ms): a `clip-path: inset(0 100% 0 0)` wipe from the left
  origin. This is how a lower third or a breaking banner arrives on air. It is
  the signature transition and should not be replaced with a fade.
- **`.cut-up`** (520ms): a 14px rise with a fade, for content appearing inside a
  panel — a new segment row, a settled verification card.
- **`roll`**: the ticker's linear infinite translate.
- **`lamp`** (1.6s): the live lamp's expanding shadow ring.

All four are disabled wholesale under `prefers-reduced-motion: reduce`. Every
other state change in the system is a `transition-colors` only.

## Do's and Don'ts

### Do:
- **Do** compose the on-air furniture from `LowerThird`, `Ticker`, `Slug`,
  `LiveLamp`, `StudioClock`, `AnchorBull` and `BreakingCutIn` rather than
  building a red bar by hand.
- **Do** put every small label in `.chyron` — including button text, table
  headers and statuses — and every figure in `.numeric`.
- **Do** use newsroom forms for page structure: running orders, rundown rows,
  transcript columns, straps, tables and the tape.
- **Do** label every P&L figure as paper, with the amber `hold` pill or the word
  "paper" in the label itself.
- **Do** give a panel `.monitor` (14px, one bezel, one shadow) and let its rows
  supply their own padding under `overflow-hidden`.
- **Do** name the action in a control's label ("Put this market on air", "Pull
  the wire"), never "Submit".
- **Do** ship every state — loading, empty, error, hover, focus-visible,
  disabled. Empty states are a serif headline plus a short dim sentence plus one
  primary button, centred in a monitor at `px-6 py-16`.
- **Do** wrap wide tables in their own `overflow-x-auto` container and hold the
  layout down to 375px.
- **Do** take icons from `lucide-react` at a single stroke weight (2 or 2.5),
  sized `size-3` to `size-4`.

### Don't:
- **Don't** build page structure from cards of icon-plus-heading-plus-text. That
  is the category default this world exists to refuse.
- **Don't** use red as a sprinkled accent — no lone red icons, red underlines or
  red micro-borders. Red fills a bar that carries type.
- **Don't** nest a monitor inside a monitor, or give anything but `.monitor` a
  shadow.
- **Don't** add a kicker or eyebrow above a heading. `Slug` names a segment; it
  never sits over a headline as a decorative pre-title.
- **Don't** use gradient text, glass-blur decoration, or an image or noise
  texture in the studio environment — the room is lit by CSS light only.
- **Don't** use emoji or unicode glyphs as icons or as section markers. Icons
  are lucide SVGs; a section marker that carries no information should simply be
  absent.
- **Don't** number sections `01 / 02 / 03` unless the sequence itself is the
  information (the Bull Pool's Hold → Trade → Draw is a legitimate use; a list of
  unrelated panels is not).
- **Don't** introduce a light theme, a third display face, or a second radius
  value beyond 14px / 0 / round.
- **Don't** place anything critical in the bottom 3.5rem, and don't remove
  `main`'s `pb-14`.
- **Don't** move the font variables off `<html>`; `@theme inline` resolves them
  at `:root` and every headline silently degrades if they move.
- **Don't** write copy that implies realized cash, and don't write "Arc", "EVM",
  "viem" or "Ethereum" — the chain is Solana.
