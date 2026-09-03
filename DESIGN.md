---
name: Mikasa
description: A working shell for structured courses, where everything on screen is information and the only colour is where you are.
colors:
  canvas: "#0f1012"
  panel: "#16181b"
  raised: "#1d2024"
  over: "#24282e"
  hair: "#24272c"
  rule: "#32363d"
  fg: "#e7e9ec"
  fg-2: "#b4bac3"
  fg-3: "#9198a2"
  fg-dim: "#8a9099"
  mark: "#6e747e"
  live: "#4fd1a5"
  bad: "#e06c6c"
  select: "rgba(79, 209, 165, 0.26)"
  thumb: "#2a2e34"
  thumb-hover: "#3a4048"
  scroll-shade: "rgba(0, 0, 0, 0.5)"
  float: "#24282e"
  scrim: "rgba(0, 0, 0, 0.55)"
colorsLight:
  canvas: "#ffffff"
  panel: "#f7f8fa"
  raised: "#edeff2"
  over: "#e3e5e9"
  hair: "#e7e9ed"
  rule: "#d3d7dd"
  fg: "#16181b"
  fg-2: "#3e464c"
  fg-3: "#586066"
  fg-dim: "#5e666c"
  mark: "#788086"
  live: "#0a7f5f"
  bad: "#b62a2a"
  select: "rgba(10, 127, 95, 0.18)"
  thumb: "#ccd0d6"
  thumb-hover: "#aeb4bd"
  scroll-shade: "rgba(22, 24, 27, 0.14)"
  float: "#ffffff"
  scrim: "rgba(22, 24, 27, 0.44)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-0.026em"
  display-lg:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  display-lg-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  display-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-0.026em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.011em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.66
    letterSpacing: "normal"
  ui-lg:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  ui:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  meta:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: "normal"
rounded:
  sm: "0"
  md: "0"
  lg: "0"
spacing:
  row: "0.22rem"
  row-touch: "0.75rem"
  panel-pad: "0.875rem"
  rail-pad: "1rem"
  gutter: "1.25rem"
  gutter-md: "2rem"
  gutter-lg: "2.5rem"
  measure: "36rem"
components:
  outline-row:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0.22rem 0.5rem"
  outline-row-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg-2}"
  outline-row-open:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  outline-row-unset:
    backgroundColor: "transparent"
    textColor: "{colors.fg-3}"
  button-primary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.over}"
    textColor: "{colors.fg}"
  button-hero:
    backgroundColor: "{colors.over}"
    textColor: "{colors.fg}"
    typography: "{typography.ui-lg}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.25rem"
  button-hero-hover:
    backgroundColor: "{colors.rule}"
    textColor: "{colors.fg}"
  button-compact:
    backgroundColor: "{colors.over}"
    textColor: "{colors.fg}"
    typography: "{typography.meta}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.625rem"
  button-compact-hover:
    backgroundColor: "{colors.rule}"
    textColor: "{colors.fg}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.fg-3}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0 0.25rem"
  button-quiet-hover:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
  palette-trigger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-3}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    width: "20rem"
  palette-trigger-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg-3}"
  palette-dialog:
    backgroundColor: "{colors.over}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    width: "34rem"
  palette-option:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    typography: "{typography.ui-lg}"
    padding: "0.5rem 1rem"
  palette-option-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  mode-switch:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.fg-3}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0.125rem"
  mode-switch-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.75rem"
  composer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.fg}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.625rem"
  composer-focus:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  code-block:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "0.875rem"
    width: "{spacing.measure}"
---

# Design System: Mikasa

## Overview

**Creative North Star: "The Graphite Workspace"**

The Course is a working shell, not a reading room. It refuses the course player's checklist-and-progress-bar and the paper metaphor at once: everything on screen is information, and the only colour is where you are. The learner opens one Course at a laptop, often with an editor beside it, and the surface is built for that posture — quiet, square-cornered, and legible in a long session. Every row carries the fewest facts that let the reader act on it; a fact that is one click away, derivable from the screen, or fixed at creation time is not on the screen.

Depth comes from light, and light has two settings. Graphite runs four steps up from `#0f1012`; paper runs four steps down from `#ffffff`. The ground flips, the system does not: in both, the sidebars sit one step off the reading ground, the open row sits two, and what floats sits at the top of the stack. A stored choice decides which ground a learner gets, and with no stored choice the operating system does; the class is set on `<html>` before first paint, so the shell is never briefly the wrong colour. A graphite canvas with three luminance steps up carries every layer in the product; hairlines divide but never enclose, and nothing on screen is a card. Type does the structural work that borders would do elsewhere: one sans for every word, one mono for every number that is data, and a single small tracked label style for the few things that need naming rather than reading.

Colour is rationed to one job. `#4fd1a5` on graphite, `#0a7f5f` on paper, marks the Lesson you are up to and nothing else. Which Lesson is _open_ is carried by a raised ground, so position and progress never compete for the same signal. Everything the learner has already finished is neutral, and everything still ahead of them carries no mark at all. A Course is generated in one pass, so a generated Course has no missing Lesson; the dashed rule belongs to a Course still sitting at its Outline, where nothing has been written yet. This world explicitly replaced a serif, paper-and-brass direction that was rejected outright; that vocabulary is anti-reference, not heritage.

**Key Characteristics:**

- Two grounds, one system: graphite and paper, four surface steps each, zero cards, one shadow.
- One accent with exactly one meaning, spent on roughly one row per screen.
- Fewest facts per row: three in the Outline rail, three in the Courses list, everything else a click away.
- Geist and Geist Mono only; no serif anywhere in the product.
- Reading column pinned to a 36rem measure that never moves when chrome opens.
- Both rails are the shadcn Sidebar, adapted rather than reinvented.
- Command palette as primary navigation, not a power-user shortcut.

## Colors

A single near-neutral family (hue ~258, chroma under 0.02) carries every surface, hairline and text step, with one green as the only colour on the screen.

### Two grounds

Every semantic token has two values and one meaning. `{colors.*}` in this document names the graphite value; `colorsLight` in the frontmatter carries its paper twin. The pairing is by role, never by lightness — `--panel` is the sidebars' ground in both, which reads darker than the reading column on paper and lighter than it on graphite.

The two grounds land on the same contrast floors, deliberately: the quiet text steps clear 5.08 and 4.63 against the topmost surface on paper, 5.09 and 4.61 on graphite, and the one graphics-only mark clears 3.18 and 3.15. Audited in the browser against the computed ground, both themes carry **zero** text below its floor.

A colour is defined in `:root` and, if it moves, redefined in `.dark`. Nothing is ever defined only in one ground.

### Primary

- **Live Mint** (`{colors.live}`): The accent. It marks the Lesson you are up to — the first Lesson that is set and not done — as a small solid triangle in the Outline rail. It also paints the focus ring, the text caret, and the selection wash, because those are the browser surfaces the workspace still owns. It is never spent on done, on code, on hover, on a button, or on a second meaning. 9.97:1 on graphite canvas; the paper twin `#0a7f5f` is darkened to 4.98:1 on white and 3.95:1 on the topmost surface, so the same mark clears the graphics floor on both grounds.

### Neutral — surfaces

- **Graphite Canvas** (`{colors.canvas}`): The ground everything sits on. The reading column, the shell, the palette scrim's backdrop.
- **Panel** (`{colors.panel}`): One step up. The Outline rail, the Tutor/Tailor panel, code blocks, the palette trigger, the Done chip.
- **Raised** (`{colors.raised}`): Two steps up. The open Lesson row, the active palette option, the active mode-switch segment, inline code, the learner's own turns in the Tutor thread, the primary button at rest.
- **Over** (`{colors.over}`): Three steps up. The compact Approve button and, on graphite, the command palette body.
- **Float** (`{colors.float}`): What leaves the document. On graphite it is `--over`; on paper it is white, because a modal that steps _down_ from its own page reads as a hole rather than a layer. The command palette is its only consumer.

### Neutral — hairlines

- **Hairline** (`{colors.hair}`): The default divider and the global border colour. Rail against reading column, panel against shell, table row against table row.
- **Rule** (`{colors.rule}`): The stronger divider, used where a hairline would be read as incidental: the note block's left rule, the table's header rule, and the Approve button's hover ground.

### Neutral — text

Every text step is legal body text on all four surfaces; the ramp is a hierarchy of emphasis, not a hierarchy of legality.

- **Full Ink** (`{colors.fg}`): Lesson titles, open Lesson rows, strong inline emphasis, code keywords, the last column of a result table. 12.18–15.65:1.
- **Second Ink** (`{colors.fg-2}`): Body prose, unopened Lesson titles, Tutor answers. The colour most words in the product are set in. 7.58–9.75:1.
- **Third Ink** (`{colors.fg-3}`): Supporting text — Goal, module counts, captions, quiet buttons, placeholders, code comments. 5.09–6.54:1.
- **Dim Ink** (`{colors.fg-dim}`): The lowest text step — completion dates, minute estimates, keycaps, separators, palette group headers. 4.61–5.92:1.
- **Mark** (`{colors.mark}`): 3.15–4.05:1. **Graphics only, never text.** Its one consumer is the dashed rule that stands in for a Lesson in a Course that has not been generated yet — the Outline screen and the Courses list, never inside a Course the learner is reading.

### Neutral — browser surfaces

- **Selection** (`{colors.select}`), **Scrollbar Thumb** (`{colors.thumb}` / `{colors.thumb-hover}`), **Scroll Shade** (`{colors.scroll-shade}`), **Scrim** (`{colors.scrim}`): The parts the workspace does not draw but still owns. Thin scrollbars, an accent selection, the shade that fades a horizontal scroller's edge while content sits past it, and the ground the command palette sits on. `color-scheme` moves with the theme, so the form controls and scrollbars the browser draws itself follow.

### Tertiary

- **Bad Red** (`{colors.bad}`): One consumer only — the hover state of the Tailor's Discard control, where the word already says the same thing. There is no red fill, no red badge, no error surface in this build.

### Third-party marks

One graphic in the product is exempt from everything above: Google's G on the sign-in button, drawn in `components/google-mark.tsx`. Its four hexes are hardcoded and are answered in neither ground, because it is an identity mark under someone else's brand terms rather than an interface icon — recolouring it to `--fg` would be the wrong kind of consistency. It is the single place a literal colour is legal at a call site, and the single place colour on screen does not mean "the Lesson you are up to". Nothing else earns this; a second exception is a design problem, not a precedent.

### Declared but unspent

`--live-dim`, `--live-wash` and `--warn` are declared in the token layer and have **zero consumers** in the components. They are recorded here as available, not as in use; a new surface that needs a second green or an amber should either spend them deliberately or drop them. `--radius` was declared and unread, and has been deleted; the ramp is `--radius-sm/md/lg`, all three at `0`.

### Named Rules

**The One Accent Rule.** `#4fd1a5` means exactly one thing: the Lesson you are up to. Roughly one row per screen carries it. If a second element wants the accent, the answer is a luminance step, not a hue. The one colour on screen that is not the accent is Google's G on the sign-in button, which belongs to Google.

**The Light, Not Line Rule.** Surfaces separate by luminance. A hairline divides two regions; it never wraps one to make an object. If a thing needs a border on all four sides to read, it is drawn wrong.

**The Graphics-Only Floor Rule.** `--mark` clears 3:1 and not 4.5:1. It is legal for meaning-bearing marks and illegal for text. Every other ink step is legal everywhere.

**The Both Grounds Rule.** A colour is a role with two values, not a value. Anything added to `:root` is answered in `.dark` unless it genuinely does not move, and a token is never hardcoded at a call site — a literal hex in a component is a colour that cannot follow the theme. The Google mark is the one deliberate violation, and it is deliberate because that colour is not ours to move.

## Typography

**Body Font:** Geist (with `ui-sans-serif, system-ui, sans-serif`), loaded via `next/font` with `font-feature-settings: "cv11", "ss01"`
**Mono Font:** Geist Mono (with `ui-monospace, monospace`)

**Character:** Two families, no third. Geist is neutral enough to disappear at 13px in a dense rail and confident enough to carry a 36px Lesson title; the alternate `cv11` and `ss01` forms keep the lowercase l and the numerals unambiguous next to code. Geist Mono is not decoration — it appears wherever a glyph is data the learner might compare.

### Hierarchy

- **Display Large** (600, 3rem, 1.08, -0.03em) and **Display Large Small** (600, 2.5rem, same leading and tracking, below 640px): The Persuade surfaces only — the landing's opening statement and its closing one. It exists because a 2.25rem line reads as a section heading at the top of a page that has nothing above it, and the answer to that is a size step, not a second weight or a colour. Two consumers, both on `app/page.tsx`. It is recorded as a pair for the same reason Display is — the system holds one size per named step, and a step that moves at a breakpoint names both ends.
- **Display** (600, 2.25rem, 1.16, -0.026em): The Lesson title at ≥640px, capped at 22 characters per line and balanced.
- **Display Small** (600, 1.875rem, 1.16, -0.026em): The same title below 640px. One of the system's two responsive steps; Display Large is the other, and both live at the top of the ramp where a line has room to be wrong.
- **Title** (600, 0.9375rem, ~1.4, -0.011em): The Course Topic at the head of the Outline rail. The only other place this weight/size pairing appears is the palette's own input.
- **Body** (400, 1rem, 1.72): Lesson prose and the Exercise task, held to a 36rem measure that reads at 64–75 characters per line. At 600 with -0.011em it is also the item heading inside a landing list — a weight on a size the scale already owns, not a new step.
- **Body Small** (400, 0.9375rem, 1.62–1.66): Set-in note blocks, the Exercise check line, the Next-Lesson title.
- **UI Large** (400–500, 0.875rem, 1.45): Palette options and Tailor change summaries.
- **UI** (400–500, 0.8125rem, 1.55): The workhorse step. Outline rows, chrome buttons, panel prose, code, tables, captions, composer input.
- **Meta** (400, 0.75rem, 1.5): The facts around the content — Lesson position line, rail numbers, module counts, applied/pending state.
- **Label** (600, 0.6875rem, 1, 0.06em, uppercase): The one label style. Module headings, `Exercise`, `Goal`, `Next`, the code block's language, table headers, palette group names, Tailor verbs.
- **Mono** (400, 0.8125rem, 1.72): Code blocks, result tables, inline code at 0.86em of its host, keycaps at 0.6875rem.

### Named Rules

**The Two Family Rule.** Geist sets every word and Geist Mono every number that is data. No third face, and no serif anywhere in this product — the serif world was tried and rejected.

**The Tabular Data Rule.** Any number a learner might compare down a column — completion counts, Lesson numbers, dates, minute estimates, table cells, keycaps — carries `.tnum` (`font-variant-numeric: tabular-nums lining`). Prose numbers do not.

**The One Label Rule.** There is exactly one uppercase tracked style in the system, at 0.6875rem/600/0.06em. Uppercase is never used at any other size, and a label never grows into a heading.

## Layout

**The shell.** Full viewport height, full viewport width, and never scrolled: Outline rail, reading column, panel, each region owning its own overflow. Both rails are fixed to the viewport's own edges, so the shell is not capped or centred — the room a wide screen has going spare is spent on the rail and the reading column's margins instead of on a boxed page.

**The rail.** 20rem, and 23rem from `xl` up. Its rows are a three-column grid (`0.75rem 1.25rem 1fr`) carrying mark, number and title — three facts, one line, no wrap. The completion date and the minute estimate used to sit in a fourth column and were dropped: neither is a thing a learner scanning for their place acts on. Row padding is 0.375rem on a pointer and 0.75rem on touch, so a long Course scrolls rather than compressing. Collapsed, the rail leaves a 2.75rem stub carrying the reopen control and the done count — `collapsible="icon"`, because a rail that vanishes entirely takes the shell's left edge with it. The header carries the Topic and the Goal and nothing else; Depth, Grounding and the done fraction came off it, and the route to the Outline screen lives in the command palette.

**The reading column.** Gutters of 1.25rem, 2rem at `sm`, 2.5rem at `lg`, shared exactly by the chrome row and the article, so the Lesson sits on the same axis as the controls above it. Content blocks are capped at `--measure` (36rem); the article's own 44rem box only bounds the meta line.

The column holds still by keeping the region around it a constant size, from both ends. When the rail collapses, the region takes a left pad of `calc(rail − 2.75rem)`. From `2xl` up, where there is room to spare, a closed panel keeps its 21rem in reserve as a right pad and the article centres in what is left — so the sentence sits in the middle of the space it will still occupy once the panel opens. Measured 0px drift at 1280, 1440, 1600 and 1920 when either the rail or the panel toggles.

**The landing.** The one surface that is not the shell: a 60rem frame with the shell's own gutters. Prose stays on the 36rem measure, the numbered steps and the definition rows cap their painted edges at 44rem so no hairline runs past the words it divides, and the two-column Outline demonstration is the single element that spends the full 60rem. That contrast is the page's only width rhythm.

**The Tailor column.** On the Outline screen the right column is not a rail; it is a second column in the page's own flow, 20rem from `lg` up. Once a plan has more than a few changes in it, that column is taller than the viewport, and `position: sticky` can hold a tall element by its top or by its bottom but never both. So `hooks/use-sticky-follow.ts` moves the sticky `top` with the scroll and clamps it at each end: scroll down and the column rides up until its last change sits on the viewport floor, then stops; scroll up and it rides back down until its first row meets the header, then stops. It has no scrollport of its own — an inner scrollbar beside a scrolling page is two scroll surfaces competing for the same wheel. Below `lg` the column stacks under the Outline and the hook no-ops.

**The panel.** 21rem, closed by default, at the right edge, `collapsible="offcanvas"`. Below 1280px, opening it collapses the rail — the shell never tries to show all three at a width that fits two. Parked off the canvas it is `inert`: out of the document, not merely out of sight.

**Below 768px.** Both rails become sheets — a base-ui dialog with a blurred scrim, focus moved in, Escape to close, the layer behind inert, and focus returned to the control that opened it. The sheet takes `min(22rem, 88vw)`. Rail rows grow to `py-3` for a 44px touch target. The Courses list keeps its three columns all the way down — at 390px the Goal truncates rather than the row reflowing, because a scanning row that changes shape stops being scannable.

**Breakpoints:** 768 (`md`), 1024 (`lg`), 1280 (`xl`), 1536 (`2xl`), plus the 767px query behind the sheet behaviour and a 1279px check that trades the rail for the panel.

### Named Rules

**The One Right Edge Rule.** Every painted edge in the Lesson column — paragraph, code block, table, note, Exercise rule, footer rule — lands on the same right edge at 36rem. Code and tables scroll inside that edge; nothing reaches past it.

**The Fixed Sentence Rule.** Opening or closing chrome must not move the reading column. Zero drift is the acceptance test, not "close enough".

**The Fewest Facts Rule.** A mark that is the same on every row is not a fact: the Outline screen draws the mark column only for a Course that has been generated, because before approval every row would carry the identical dash the heading already accounts for. Beyond that, a row carries the fewest facts that let the reader act on it, not the most that fit. The rail row is a mark, a number and a title. A Course in the list is a Topic, a Goal and a fraction. A fact that is one click away, derivable from what is already on screen, or fixed at creation time does not belong in a scanning surface. This replaced an earlier rule requiring all twenty Lessons to be visible at once: density was serving the design rather than the reader, and the rail scrolls now on purpose.

**The Constant Region Rule.** The reading column does not hold still by being nailed to the left; it holds still because the region around it never changes size. Anything that opens at an edge either reserves its width in advance or is not allowed to move the sentence.

## Elevation & Depth

The system is tonal, not shadowed. Depth is four steps of luminance — canvas, panel, raised, over — and an element's height in the stack is its distance from the reading ground: on graphite that is lighter, on paper it is darker. Hover is a step up; active is a step up; a floating layer is the top step. There is no ambient shadow, no glow, no ring, and no border used to fake separation.

Exactly one shadow ships, on the only thing that genuinely floats.

### Shadow Vocabulary

- **Lift** (`--lift`): The layers that actually leave the document — the command palette and the Select popup. Offset and blur, never a halo. Two values: `0 18px 44px -12px rgba(0,0,0,0.72), 0 3px 10px -3px rgba(0,0,0,0.55)` on graphite, and a shorter, lighter pair on paper — a shadow tuned for a dark ground reads as soot on a white one.

### Named Rules

**The Flat Shell Rule.** One shadow exists in this system and it belongs to whatever genuinely leaves the document — the command palette, the Select popup. Everything else earns its depth from light.

## Shapes

Nothing in this product has a rounded corner. Rows, chips, buttons, fields, code blocks, the command palette, the focus ring and the scrollbar thumb are all square. The ramp is still named in the token layer — `--radius-sm`, `--radius-md`, `--radius-lg`, all three set to `0` — so a call site still says which kind of thing it is, and one edit would bring a ramp back if this world ever wanted one.

The square corner is not decoration; it is the same argument the rest of the system makes. Depth here is light and division is a hairline. A radius would be a third way of saying "this is an object" on a surface that already has two, and the one that says it least precisely. Nothing is pill-shaped, nothing is circular, and no element carries a full border for decoration.

Marks are drawn, not iconified in a font: a 12px solid triangle for live, a 12px stroked check for done, a 12px dashed rule for unset — all on the same 12px box so a column of rows never shifts. Interface icons are Lucide at 14–16px, `strokeWidth` 1.75. The one exception to this whole section is Google's G on the sign-in button, a third-party mark that keeps its own geometry as well as its own colours.

The focus ring is a 2px solid mint outline at 2px offset, square like the thing it surrounds.

### Named Rules

**The Square Corner Rule.** There is no radius anywhere in this product. An element that needs to read as separate takes a luminance step or a hairline — the two tools the system already has.

## Components

### Vendored primitives (shadcn / base-ui)

Anything with real interaction behaviour comes from the registry and is adapted through the token layer rather than rebuilt: `Sidebar`, `Button`, `Command`, `Dialog`, `Select`, `RadioGroup`, `ToggleGroup`, `Textarea`, `Input`, `Sheet`, `Tooltip`. Nothing in the product hand-rolls a control any more. The primitive owns roving focus, arrow keys, typeahead, ARIA, portalling and dismissal; this file owns how it looks. Every adaptation is recorded in the component file at the line it changes, in these four shapes:

- **`Toggle` / `ToggleGroup`** — the shipped variants are uppercase at `tracking-widest` with a focus ring, which spends the one label style on a control and adds a ring this world does not have. Restyled to the segmented switch: a canvas-inset track, the chosen segment on a raised ground, at 0.8125rem/500.
- **`RadioGroup`** — the shipped item is a round dot. Nothing here is circular and a chosen state is a ground step, never a mark (the Two Signals rule), so the item is a full-width row that steps up when checked, and the label lives inside the control so the whole row is the hit target.
- **`Select`** — the trigger becomes a field on the panel ground rather than a bottom underline; the popup drops its `ring-1` for `lift`, because it is one of the two things in the product that genuinely leaves the document.
- **`Textarea`** — a canvas-inset field that steps up on focus, not an underline.
- **`Button`** — the shipped variants are uppercase at `tracking-widest` with a ring and a press translate. Replaced with the controls this file names — `primary`, `hero`, `compact`, `quiet`, `discard`, `icon`, `icon-raised` — plus `bare` for a control whose shape is its container (the rename trigger, the Next-Lesson row) and two aliases, `ghost` and `outline`, because Dialog, Sheet and Sidebar reach for those names by hand. Padding rides the variant, since each control has its own. `nativeButton` defaults to `false` whenever `render` is passed: `render` here is almost always a Link, and an anchor is navigation, not an action.
- **`Command` / `Dialog`** — the palette. The scrim loses its blur (DESIGN.md gives the blurred scrim to the mobile sheet, and the two are not the same layer), the popup trades `shadow-md ring-1` for `lift`, the input becomes a plain field over a hairline instead of an InputGroup with a search glyph, the group heading takes the one label style, the active option takes a raised ground, and the trailing check comes off the item because nothing in this palette is a checked state. cmdk's fuzzy scorer is replaced with a substring filter: this palette is navigation, not search, so a query either appears in the entry or the entry is not a result. This registry's `CommandDialog` does not wrap its children in the cmdk root, so `palette.tsx` supplies it, with `loop` for the wrapping arrow keys.

Hand-rolled controls were deleted as each primitive landed. `switchTrack`/`switchSeg` went when `ToggleGroup` replaced them and the five `btn*` constants went when `Button` did, leaving `lib/ui.ts` holding one idiom: the inset `field` that a few inputs still wear directly. The palette's own dialog, filter, active-option tracking and key handling went with `Command` — what remains in `palette.tsx` is the surface, the grouping and the footer.

### Sidebar (vendored, shadcn)

Both rails are the shadcn `Sidebar` — provider, gap, container, header, content, group, menu, and the mobile sheet — restyled through the token layer rather than rebuilt. `--sidebar` and its four companions are aliases onto `--panel`, `--fg`, `--hair`, `--raised` and `--live`, so the component follows the theme without knowing about it. `SidebarMenuButton` already carries `data-active` and hover as a ground step, which is exactly the Two Signals rule, so the Outline row spends it rather than re-implementing it.

Four adaptations are recorded in the file, at the lines they change:

- **One open state per rail.** The shipped provider keeps a second `openMobile` for the sheet. Two providers are on screen at once here, so the caller owns the only truth and the sheet reads it too.
- **No cookie.** Two rails would write one cookie name. Nothing about the shell is persisted in this build.
- **No `⌘B` inside the provider.** Two providers would both answer it. The workspace binds it once, for the Outline, beside `⌘K`.
- **`inert` when parked offcanvas.** A sidebar translated off the canvas is still in the tab order and the accessibility tree. The icon rail keeps its stub and stays reachable.

`--sidebar-width` is set inline by the provider, where a breakpoint cannot reach it, so it reads `--mk-rail` and the class moves that instead.

### Theme Switch

One control in the chrome, holding no React state: the class on `<html>` is the state, which icon shows is a CSS question, and the choice is written to `localStorage` under `mk-theme`. It renders identically on the server and the client, so it needs no mounted flag and produces no hydration seam.

### Outline Rail (signature)

The Outline is a live, editable object beside the Lesson, not a table of contents, and the rail is built to look like one. Module headings are labels with a `done/total` count; Lesson rows are a fixed four-column grid.

- **Three states, three marks:** live is the accent triangle; done is a neutral check; unset is a dashed rule at `--mark` with its title at third ink. Inside a generated Course only the first two occur — a Lesson the learner has not reached yet is unmarked, not unfinished. Module headings carry their name and no count.
- **Open:** raised ground, title at full ink and medium weight, `aria-current="true"`. Never the accent.
- **Hover:** raised at 60% opacity. Rows transition background and colour over 120ms.
- **Unset rows are `<div aria-disabled="true">`, not buttons.** No hover, no cursor change, no click target, no palette entry.

### Buttons

- **Shape:** square, like everything else. All seven live on `Button`; `variant` decides both the look and the padding.
- **Primary** (`Mark the Exercise done`): raised ground, full ink, 0.8125rem/500, 1rem × 0.625rem padding. Hover steps to over. It is the most important action on the page and it is still greyscale.
- **Hero** (`Start a Course`, `Continue with Google`): over ground, full ink, 0.875rem/500, 1.25rem × 0.75rem padding, hover to rule. One luminance step above Primary, because an Operate screen has several actions competing and a Persuade surface has one. The step is the system answering "this needs more weight" the way it always does — with light, never with a hue.
- **Compact** (`Approve`): over ground, full ink, 0.75rem/500. Hover steps to rule.
- **Quiet** (`Undo`, `Discard`): no ground, third ink, hover to full ink. Discard alone hovers to bad red.
- **Icon** (rail toggle, panel close, palette trigger): third ink on no ground, hover to a panel or raised step and full ink.

### Command Palette (signature)

Navigation, not a shortcut: every set Lesson and every action is reachable without the pointer. ⌘K/Ctrl-K toggles it globally.

- **Surface:** float ground, square, 34rem wide, `lift` shadow, on the scrim, 12vh from the top.
- **Composition:** search input over a hairline, grouped results (Actions, then Lessons) with label-style group headers, a hairline-topped keycap footer. A hint beside an option identifies it — the Module a Lesson sits in — and never explains it, so the action rows carry a label alone.
- **Behaviour is the primitive's:** cmdk inside a base-ui Dialog owns filtering, the active option, arrow keys, Enter, Escape, the focus trap, the inert background and returning focus. Opened by `⌘K` from anywhere there is no trigger to return to, so focus lands on the body.
- **Active option:** raised ground, full ink; arrow keys wrap, Enter runs, Escape closes.
- **Empty state:** says that nothing in this Course matches, rather than leaving the absence unexplained. Every Lesson in a generated Course is in the palette, because every Lesson exists.

### Panel (Tutor / Tailor)

One panel, two modes, an explicit segmented switch at the top on a canvas-inset ground with the active segment raised. It owns its own close, so the shell shows no second control naming the same thing. A one-line subtitle states the contract: the Tutor changes nothing, the Tailor writes nothing until approved.

- **Tutor thread:** the learner's turns sit one luminance step up in a right-shouldered rounded block; the Tutor's answers are unadorned prose at second ink. Pending state is a live-region line, not a spinner.
- **Composer:** canvas-inset field that steps up to raised on focus-within; Enter sends, Shift-Enter breaks.
- **Tailor plan:** hairline-divided rows on the panel's own ground — verb label, target, change, reason, then Approve/Discard or Applied/Undo. Deliberately not a card list.

### Prose Blocks

- **Paragraph:** second ink, 1rem/1.72, capped at the measure.
- **Code:** panel ground, square, a label-style language strip over a hairline, and a horizontally scrolling body with edge fades (Lea Verou's local/scroll gradient pair) that appear only while there is content past the edge. Highlighting is weight for keywords and a dim step for comments; **no accent in code**.
- **Note:** a left rule at `--rule` with a label heading. Not a callout, not a box.
- **Table:** mono, tabular, label-style headers over a rule, hairline row dividers, last column at full ink. Scrolls inside the measure with the same edge fades.

### Motion

Everything eases on `cubic-bezier(0.2, 0, 0, 1)` — exponential ease-out, no bounce — at 120ms for row and colour changes, 160ms for the default, 240ms for entrances. The authored moment is marking an Exercise done: one handoff in two halves, the check stroking itself onto the row just finished (340ms dash) while the accent lifts into place on the next Lesson (300ms). It fires on a real mark, never on first paint or a revisit. Under `prefers-reduced-motion`, both end states remain and all movement is dropped.

### Named Rules

**The Stays In Place Rule.** A Course whose Lessons have not been generated draws every one of them, ruled and inert. They are never hidden, never faded out, and never disabled buttons — they hold their positions so the shape of the Course is legible before a word of it exists. The state is a property of the Course, not of a Lesson within it: generation is one pass, so a Course is either written or it is not.

**The Two Signals Rule.** Where you are up to is colour; what you have open is light. The two never swap and never combine on one row.

## Do's and Don'ts

### Do:

- **Do** separate surfaces with luminance — `{colors.canvas}` → `{colors.panel}` → `{colors.raised}` → `{colors.over}` — and use hairlines only to divide.
- **Do** spend `{colors.live}` on exactly one thing: the Lesson the learner is up to.
- **Do** carry the open state with a raised ground and `aria-current`, never with colour.
- **Do** hold body copy to the 36rem measure and land every painted edge in the reading column on it.
- **Do** set every number that is data in Geist Mono or with `.tnum`, so columns of counts, dates and estimates line up.
- **Do** keep the Lessons of an unapproved Outline in place, ruled at `--mark` and inert, with no hover and no click target.
- **Do** give a scrolling code block or table its own edge fade rather than letting it bleed past the measure.
- **Do** cut a row to the fewest facts that let a reader act on it, and put the rest one click away.
- **Do** move focus into a full-screen overlay, close it on Escape, mark the layers behind `inert`, and return focus to the control that opened it.
- **Do** keep both end states and drop the movement under `prefers-reduced-motion`.
- **Do** answer every new `:root` colour in `.dark`, and check both grounds against the contrast floors before shipping either.
- **Do** reach for the vendored Sidebar for anything rail-shaped, and record an adaptation in the file at the line it changes.
- **Do** mark a layer parked off the canvas `inert`, so it leaves the tab order with the pixels.

### Don't:

- **Don't** build cards. No bordered, radiused, shadowed boxes as page structure — the Tailor's change list included.
- **Don't** introduce a second accent, a coloured status pill, a progress ring, a percentage, a streak, or an XP counter.
- **Don't** spend the accent on done, on hover, on a button, on code syntax, or on anything but the live Lesson.
- **Don't** set any part of this product in a serif, or reintroduce paper, vellum, ink stamps, folds, brass or a book metaphor. That world was tried and rejected outright.
- **Don't** use `--mark` for text; it clears 3:1, not 4.5:1.
- **Don't** render an unwritten Lesson as a disabled button, and don't list one in the command palette. Every Lesson of a generated Course is listed, because there are no unwritten ones left in it.
- **Don't** add a shadow to anything that is not a floating modal layer; step the luminance instead.
- **Don't** let opening or closing the rail or the panel shift the reading column by a single pixel.
- **Don't** duplicate a control the panel already owns; while the panel is open, the shell shows no second control naming the same thing.
- **Don't** add a radius. Anywhere. Uppercase stays inside the one 0.6875rem label.
- **Don't** hardcode a colour at a call site, or define one in only one ground.
- **Don't** let the accent change meaning between the two grounds — it is darkened for paper, not repurposed.
- **Don't** carry the theme in React state; the class on `<html>` is the state, and a mounted flag is a hydration seam waiting to show.
