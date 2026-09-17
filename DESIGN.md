---
name: Mikasa
description: A warm desk for structured courses, where everything on screen is information and the only colour outside code is where the work is.
colors:
  canvas: "#1b1a18"
  panel: "#262522"
  raised: "#2f2e2b"
  over: "#3a3936"
  hair: "#35322e"
  rule: "#57534a"
  fg: "#fffcf0"
  fg-2: "#d9d6c3"
  fg-3: "#b5b2a6"
  fg-dim: "#a8a49b"
  mark: "#8a867d"
  live: "#9cb52d"
  bad: "#d14d41"
  select: "rgba(156, 181, 45, 0.22)"
  thumb: "#3a3936"
  thumb-hover: "#57534a"
  scroll-shade: "rgba(0, 0, 0, 0.5)"
  float: "#3a3936"
  scrim: "rgba(0, 0, 0, 0.55)"
  code-red: "#e0604a"
  code-orange: "#da702c"
  code-yellow: "#d0a215"
  code-green: "#879a39"
  code-cyan: "#3aa99f"
  code-blue: "#5aa0d8"
  code-purple: "#9a8fd0"
  code-magenta: "#d96a9b"
colorsLight:
  canvas: "#fffcf0"
  panel: "#f2f0e5"
  raised: "#e6e4d9"
  over: "#d9d6c3"
  hair: "#ddd9c7"
  rule: "#c9c4b0"
  fg: "#1c1b1a"
  fg-2: "#3f3e38"
  fg-3: "#565651"
  fg-dim: "#5e5d58"
  mark: "#76746b"
  live: "#4a6b0a"
  bad: "#af3029"
  select: "rgba(74, 107, 10, 0.16)"
  thumb: "#c9c4b0"
  thumb-hover: "#a8a497"
  scroll-shade: "rgba(28, 27, 26, 0.16)"
  float: "#fffdf5"
  scrim: "rgba(28, 27, 26, 0.44)"
  code-red: "#af3029"
  code-orange: "#bc5215"
  code-yellow: "#8a6d00"
  code-green: "#4a6b0a"
  code-cyan: "#1f6e68"
  code-blue: "#205ea6"
  code-purple: "#5e409d"
  code-magenta: "#a02f6f"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-0.026em"
  display-xl:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "4rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  display-xl-md:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  display-xl-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
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
rounded: # held at zero: this world is square
  sm: "0px"
  md: "0px"
  lg: "0px"
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
  landing-hero:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.fg}"
    typography: "{typography.display-xl}"
    padding: "3.5rem 0 4rem"
  desk-scene:
    backgroundColor: "transparent"
    textColor: "{colors.fg-dim}"
    width: "30rem"
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
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.fg-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "0.875rem"
    width: "{spacing.measure}"
---

# Design System: Mikasa

## Overview

**Creative North Star: "The Flexoki Paper Desk"**

The Course is a warm desk, not a grey instrument. It keeps the working-shell posture, one Course at a laptop, often with an editor beside it, built for long sessions. Every row carries the fewest facts that let the reader act on it; a fact that is one click away, derivable from the screen, or fixed at creation time is not on the screen.

Depth comes from light, and light has two warm settings. Paper runs four steps down from `#fffcf0`; charcoal runs four steps up from `#1b1a18`. The ground flips, the system does not: in both, the sidebars sit one step off the reading ground, the open row sits two, and what floats sits at the top of the stack. A stored choice decides which ground a learner gets, and with no stored choice the operating system does; the class is set on `<html>` before first paint, so the shell is never briefly the wrong colour. A fixed grain wash lies over the shell at very low opacity, multiply on paper and overlay on charcoal, so the surface has tooth without ever sitting behind body text at reading opacity. Hairlines divide but never enclose, except for code, which sits on the reading ground inside one hairline so its syntax roles stay legible. Type does the structural work that borders would do elsewhere: one sans for every word, one mono for every number that is data, and a single small tracked label style for the few things that need naming rather than reading.

Colour is rationed. `#4a6b0a` on paper, `#9cb52d` on charcoal, marks where the work is — the Lesson you are up to, the page the run still owes work on, the one action a surface turns on — and nothing else outside code. Which Lesson is _open_ is carried by a raised ground, so position and progress never compete for the same signal. Everything the learner has already finished is neutral, and everything still ahead of them carries no mark at all. Inside code blocks alone, a full Flexoki syntax palette is spent on keywords, strings, numbers, functions, and comments, each clearing 4.5:1 on the reading ground it sits on. A Course is generated in one pass, so a generated Course has no missing Lesson; the dashed rule belongs to a Course still sitting at its Outline, where nothing has been written yet. This world replaced a square-cornered graphite instrument; that precision is evidence, not heritage. The rejected serif Reading Room stays rejected.

One surface is allowed to spend the accent as wayfinding: the landing is the desk seen from the visitor's side, so it carries one olive moment per section — a triangle beside a section heading, the pencil band and the half-written line in the hero's illustrated scene. It is the same mark, borrowed to say _this is where you are_, never a colour for an action: `Start a Course` stays greyscale in both grounds.

**Key Characteristics:**

- Two warm grounds, one system: paper and charcoal, four surface steps each, zero cards as page structure, one shadow, one grain wash.
- One accent, spent on where the work is — the Lesson you are up to, the page a run still owes work on — and on the one action a surface turns on, roughly one moment per screen; the landing borrows the same mark once per section as wayfinding. Code alone carries syntax colour.
- Fewest facts per row: three in the Outline rail, three in the Courses list, everything else a click away.
- Geist and Geist Mono only; no serif anywhere in the product.
- A viewport-centred Lesson at a 36rem measure, with fixed edge tools that never move it.
- Both rails are the shadcn Sidebar, adapted rather than reinvented.
- Command palette as primary navigation, not a power-user shortcut.
- The landing is the one Persuade surface: a hero with an illustrated desk, a scroll settle, and one olive mark per section.

## Colors

A warm near-neutral family carries every surface, hairline and text step, with one olive green as the only chrome colour and a full Flexoki syntax palette spent only inside code.

### Two grounds

Every semantic token has two values and one meaning. `{colors.*}` in this document names the charcoal value; `colorsLight` in the frontmatter carries its paper twin. The pairing is by role, never by lightness — `--panel` is the sidebars' ground in both, which reads darker than the reading column on paper and lighter than it on charcoal.

The two grounds land on the same contrast floor by construction: every text step clears 4.5:1 on all four surfaces in both themes, and the one graphics-only mark clears 3:1 wherever a dashed rule can sit. Code roles clear 4.5:1 on the reading ground they sit on, which is why code sits on the canvas inside a hairline instead of on a shaded fill.

A colour is defined in `:root` and, if it moves, redefined in `.dark`. Nothing is ever defined only in one ground.

### Primary

- **Live Olive** (`{colors.live}`): The accent, and the workspace's only chrome colour. It is spent on where the work is: the Lesson you are up to — the first Lesson that is set and not done — as a small solid triangle in the Outline rail, drawn in `components/workspace/marks.tsx`; and, while a Course is being generated, the page the run still owes work on, whose finding strip carries the accent with the live mark while its finding is queued or being corrected and goes quiet the moment the fix lands. When a surface turns on one important action, that action may take it too. It is never decoration: not done, not hover, not a status badge, and never a second hue for a second meaning. It also paints the focus ring, the text caret, and the selection wash, because those are the browser surfaces the workspace still owns. The landing borrows it once per section as wayfinding, described under Named Rules. `#4a6b0a` on paper clears 6.01:1 on the canvas; `#9cb52d` on charcoal clears 7.50:1, so the same olive is legal as a mark and as small text on either ground.

### Neutral — surfaces

- **Warm Canvas** (`{colors.canvas}`): The ground everything sits on. The reading column, the shell, the palette scrim's backdrop. `#fffcf0` by day, `#1b1a18` by night.
- **Panel** (`{colors.panel}`): One step off the reading ground. The Outline rail, the Tutor/Tailor panel, the code header strip, the palette trigger, the Done chip.
- **Raised** (`{colors.raised}`): Two steps off. The open Lesson row, the active palette option, the active mode-switch segment, inline code, the learner's own turns in the Tutor thread, the primary button at rest.
- **Over** (`{colors.over}`): Three steps off. The compact Approve button and, on charcoal, the command palette body.
- **Float** (`{colors.float}`): What leaves the document. On charcoal it is `--over`; on paper it is `#fffdf5`, because a modal that steps _down_ from its own page reads as a hole rather than a layer. The command palette is its only consumer.
- **Grain** (`.grain::after` in `app/globals.css`): A fixed feTurbulence wash at 0.05 opacity on paper and 0.07 on charcoal. It adds tooth over the shell and never carries meaning.

### Neutral — hairlines

- **Hairline** (`{colors.hair}`): The default divider and the global border colour. Rail against reading column, panel against shell, table row against table row.
- **Rule** (`{colors.rule}`): The stronger divider, used where a hairline would be read as incidental: the note block's left rule, the table's header rule, and the Approve button's hover ground.

### Neutral — text

Every text step is legal body text on all four surfaces; the ramp is a hierarchy of emphasis, not a hierarchy of legality.

- **Full Ink** (`{colors.fg}`): Lesson titles, open Lesson rows, strong inline emphasis, the last column of a result table.
- **Second Ink** (`{colors.fg-2}`): Body prose, unopened Lesson titles, Tutor answers, code body. The colour most words in the product are set in.
- **Third Ink** (`{colors.fg-3}`): Supporting text — Goal, module counts, captions, quiet buttons, placeholders, code comments. Placeholders use this step, so they clear body contrast too.
- **Dim Ink** (`{colors.fg-dim}`): The lowest text step — completion dates, minute estimates, keycaps, separators, palette group headers. Still body-legal on the topmost surface in both themes.
- **Mark** (`{colors.mark}`): Graphics only, never text. Its one consumer is the dashed rule that stands in for a Lesson in a Course that has not been generated yet — the Outline screen and the Courses list, never inside a Course the learner is reading.

### Syntax — code blocks only

Code sits on the reading ground inside one hairline, with a panel-ground language strip, so every role below clears 4.5:1 on its own ground. Shiki runs on the server (`lib/course/highlight.tsx`) and hands `components/workspace/prose.tsx` a rendered tree: keywords in green semibold (`.tok-key`), strings in orange (`.tok-str`), numbers and constants in purple (`.tok-num`), functions, tags and types in blue (`.tok-func`), comments in third ink italic (`.tok-com`). The theme carries the tokens rather than a palette of its own, so each role's ink is edited in one place and both grounds answer; operators and punctuation stay in the block's own ink, and a language the highlighter does not carry renders as plain code. The strip's right edge carries the copy control: an icon button in the strip's own third ink, stepping to raised and full ink on hover, confirming with a check at full ink and a spoken line — a luminance step, never the accent. No syntax colour leaks into chrome, rows, buttons, or the palette.

### Neutral — browser surfaces

- **Selection** (`{colors.select}`), **Scrollbar Thumb** (`{colors.thumb}` / `{colors.thumb-hover}`), **Scroll Shade** (`{colors.scroll-shade}`), **Scrim** (`{colors.scrim}`): The parts the workspace does not draw but still owns. Thin scrollbars, an accent selection, the shade that fades a horizontal scroller's edge while content sits past it, and the ground the command palette sits on. `color-scheme` moves with the theme, so the form controls and scrollbars the browser draws itself follow. A bar is never parked on screen: it rides with the scroll, lingers a beat after the last event, then fades out and comes back on the next scroll. The engines do not animate scrollbar pseudo-elements, so the thumb cannot fade itself — the port hides it under a cover in its own ground and reserves the lane (`scrollbar-gutter: stable`) so the cover never crosses content and the column never shifts.

### Tertiary

- **Bad Red** (`{colors.bad}`): One consumer only — the hover state of the Tailor's Discard control, where the word already says the same thing. There is no red fill, no red badge, no error surface in this build.

### Third-party marks

One graphic in the product is exempt from everything above: Google's G on the sign-in button, drawn in `components/google-mark.tsx`. Its four hexes are hardcoded and are answered in neither ground, because it is an identity mark under someone else's brand terms rather than an interface icon — recolouring it to `--fg` would be the wrong kind of consistency. It is the single place a literal colour is legal at a call site, and the single place colour on screen does not mean "this is where the work is". Nothing else earns this; a second exception is a design problem, not a precedent.

### Declared but unspent

`--live-dim`, `--live-wash` and `--warn` are declared in the token layer. `--live-dim` and `--live-wash` back focus and selection depth; `--warn` stays reserved. `--radius` was declared and unread, and has been deleted; the ramp is `--radius-sm/md/lg`, all three held at `0px` — this world is square.

### Named Rules

**The One Accent Rule.** Olive is the workspace's one chrome colour, and it is spent on where the work is: the Lesson you are up to, the page a run still owes work on, and the one important action a surface turns on. Roughly one moment per screen carries it — two views of the same fact, a row and the strip that mirrors it, count as one. It is never decoration and never on done or hover; if a surface wants more emphasis than that, the answer is a luminance step, not a second hue. Inside code blocks, syntax roles carry their own hues and never leak out. The one colour on screen that is not the accent is Google's G on the sign-in button, which belongs to Google.

**The Landing Wayfinding Rule.** The landing is not the workspace, and it may spend the same olive once per section as wayfinding: the triangle beside a section heading or the hero scene's own marks (the sheet's live triangle, the line it is writing, the pencil band). One moment per section, never two, and never on an action — both `Start a Course` controls stay greyscale. The scene and the wash are drawn from the surface tokens, so both grounds get their own light and no new colour enters the system.

**The Light, Not Line Rule.** Surfaces separate by luminance. A hairline divides two regions; it never wraps one to make an object. The one exception is code, which sits on the reading ground inside a single hairline so its syntax roles stay legible. If any other thing needs a border on all four sides to read, it is drawn wrong.

**The Graphics-Only Floor Rule.** `--mark` clears 3:1 and not 4.5:1. It is legal for meaning-bearing marks and illegal for text. Every other ink step is legal everywhere.

**The Both Grounds Rule.** A colour is a role with two values, not a value. Anything added to `:root` is answered in `.dark` unless it genuinely does not move, and a token is never hardcoded at a call site — a literal hex in a component is a colour that cannot follow the theme. The Google mark is the one deliberate violation, and it is deliberate because that colour is not ours to move.

## Typography

**Body Font:** Geist (with `ui-sans-serif, system-ui, sans-serif`), loaded via `next/font` with `font-feature-settings: "cv11", "ss01"`
**Mono Font:** Geist Mono (with `ui-monospace, monospace`)

**Character:** Two families, no third. Geist is neutral enough to disappear at 13px in a dense rail and confident enough to carry a 36px Lesson title; the alternate `cv11` and `ss01` forms keep the lowercase l and the numerals unambiguous next to code. Geist Mono is not decoration — it appears wherever a glyph is data the learner might compare.

### Hierarchy

- **Display XL** (600, 4rem, 1.04, -0.035em), **Display XL Medium** (3.5rem) and **Display XL Small** (2.75rem): The landing hero headline only, across three ends. It exists because the hero is the one line in the product that must carry a whole page on its own, and the answer to that is a size step. Recorded as a set for the same reason Display Large is a pair: a step that moves at a breakpoint names every end it lands on.
- **Display Large** (600, 3rem, 1.08, -0.03em) and **Display Large Small** (600, 2.5rem, same leading and tracking, below 640px): The landing's closing statement, and the level a heading takes when it must stop a reader. It exists because a 2.25rem line reads as a section heading at the top of a page that has nothing above it, and the answer to that is a size step, not a second weight or a colour. One consumer remains in `app/page.tsx`; the opening statement moved up to Display XL. It is recorded as a pair — the system holds one size per named step, and a step that moves at a breakpoint names both ends.
- **Display** (600, 2.25rem, 1.16, -0.026em): The Lesson title at ≥640px, capped at 22 characters per line and balanced.
- **Display Small** (600, 1.875rem, 1.16, -0.026em): The same title below 640px, and the Courses pane's Topic — one step below the Course page's own Display, so a preview never speaks as loudly as the page it previews. One of the system's responsive steps; the Display XL set and Display Large are the others, and all live at the top of the ramp where a line has room to be wrong.
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

### Landing update: living course demo

The hero is centered: headline, supporting copy, and actions, with no diagram beneath it, and it fills the first viewport — `min-height: calc(100dvh − 3.5rem)` with the content vertically centered — so the demonstration begins exactly at the fold. The living course demonstration follows directly as the first section, with its own subject tabs updating the goal, background, outline, and exercise through shared state. The headline reveals through a mask and its olive underline draws once. Animations replay on subject selection, finish in under a second, and do not loop. At the user's explicit request, the landing hero and course-demo motion are exceptions to the app's reduced-motion rules. This replaces the earlier static-hero, reduced-motion, and hero-diagram descriptions in this landing section.

The landing's scroll motion runs on Motion (`motion/react` in `components/landing-motion.tsx`). The exercise band wipes in through a clip path with a spring when it first enters view or remounts on a subject change, the quality list staggers its four terms by 70ms on springs, and a greyscale hairline tracks reading progress at the viewport top with a spring. All Motion work keeps content visible by default, so a failed script leaves a readable page; the CSS entrance and assembly animations are unchanged and carry the reduced-motion exception the user requested.

The landing now uses a living course demonstration in place of the illustrated hero and static photography outline. This section supersedes the earlier landing-specific composition and motion descriptions.

The landing frame is 77rem including gutters. "Create a course about anything" uses fluid Geist display type capped at 6rem, with a single olive hand-drawn underline. Desktop display runs from 3.25rem to 6rem; mobile runs from 2.75rem to 4.5rem. Supporting feature titles may use 1.125rem, and course goals and section headings may use 2rem at narrow widths. These are landing-only additions to the type ramp.

Visitors choose Photography, Jazz harmony, or Databases with pressed-state buttons. The selected example reads top to bottom as three numbered steps on a hairline spine — the goal with its starting point, the outline with its modules, and one lesson exercise. All three steps share one ground, closed by a hairline below. Examples are labeled illustrative. Steps are separated by generous whitespace with no enclosing borders, rounded cards, or shadows; mono numerals carry the sequence and the section's one olive mark sits on the outline approval. The subject selector uses a neutral bottom rule for its selected state.

Changing subjects reveals module rows with a short clip and 8px settle, staggered by 65ms. It runs on entry or subject selection. Reduced motion shows the complete content immediately. The hero stays visible without animation. The steps stack in reading order at every width, and subject controls remain visible together.

The quality section explains course-wide sequencing, exercises, review and correction, and sources. It precedes the workflow and learning-support content. The primary hero action is "Create your course" and uses the existing Google sign-in flow; the closing action repeats it verbatim with the Google mark, so both ends of the page carry the same CTA.

The navbar is fixed to the viewport top: a compact translucent canvas bar with a backdrop blur and a bottom hairline. "Sign in" is a compact primary control carrying the Google mark at 16px. Anchor targets carry scroll margins that clear the bar. The footer carries "© 2026 Mikasa · Developed by Andrés Sanabria".

The demonstration's subject tabs join without gaps. Section headings carry no wayfinding triangle. The page sits over a notebook-paper ground: a faint ruled grid in the hairline token at 20% over canvas, holding still while content scrolls over it. It keeps animating nothing of its own and stays clear of reading text.

**The shell.** Full viewport height, full viewport width, and never scrolled: Outline rail, reading column, panel, each region owning its own overflow. Both rails are fixed to the viewport's own edges, so the shell is not capped or centred — the room a wide screen has going spare is spent on the rail and the reading column's margins instead of on a boxed page.

**The rail.** 20rem, and 23rem from `xl` up. Its rows are a three-column grid (`0.75rem 1.25rem 1fr`) carrying mark, number and title — three facts, one line, no wrap. The completion date and the minute estimate used to sit in a fourth column and were dropped: neither is a thing a learner scanning for their place acts on. Row padding is 0.375rem on a pointer and 0.75rem on touch, so a long Course scrolls rather than compressing. Collapsed, the rail leaves a 2.75rem stub carrying the reopen control and the done count — `collapsible="icon"`, because a rail that vanishes entirely takes the shell's left edge with it. The header carries the Topic and the Goal and nothing else; Depth, Grounding and the done fraction came off it, and the route to the Outline screen lives in the command palette.

**The reading column.** Gutters of 1.25rem, 2rem at `sm`, 2.5rem at `lg`, shared exactly by the chrome row and the article, so the Lesson sits on the same axis as the controls above it. Content blocks are capped at `--measure` (36rem); the article's own 44rem box only bounds the meta line.

The column holds still by keeping the region around it a constant size, from both ends. When the rail collapses, the region takes a left pad of `calc(rail − 2.75rem)`. From `2xl` up, where there is room to spare, a closed panel keeps its 21rem in reserve as a right pad and the article centres in what is left — so the sentence sits in the middle of the space it will still occupy once the panel opens. Measured 0px drift at 1280, 1440, 1600 and 1920 when either the rail or the panel toggles.

**The landing.** The one surface that is not the shell: a 60rem frame with the shell's own gutters. Prose stays on the 36rem measure, the numbered steps and the definition rows cap their painted edges at 44rem so no hairline runs past the words it divides, and the Outline demonstration is the single element that spends the full 60rem. That contrast is the page's only width rhythm.

The hero is the page's one composition: the statement on the left, an illustrated desk on the right (`components/desk-scene.tsx`), and behind both a light wash drawn from `--over` and `--raised` plus a faint rule rhythm at 110px, masked to the top right. The scene is drawn, not photographed: a sheet mid-outline, a pencil laid where the writing stopped, a cup with steam. Its strokes reuse the Lucide weight (1.25–1.5px) so it sits in the same world as the icons, and every fill is a surface token, so both grounds are lit separately. It has no card and no frame; the drawing sits on the page the way it would sit on the desk. Below 768px the scene follows the text in the same column at 19rem, because welcome is the landing's whole job and a text-only phone hero is not welcoming.

Each section below the hero carries exactly one olive moment — the live triangle beside its heading (`SectionMark`), matching the mark the Outline rail uses — and settles into place once, the first time it enters the viewport (`components/reveal.tsx`). The settle is 16px of rise and a fade over 560ms on the system ease; stagger is 90ms within a section and never between sections. The page's motion is otherwise still: the hero's lines rise on arrival, the scene's lines draw and its steam breathes, and nothing else moves.

**The Tailor column.** On the Outline screen the right column is not a rail; it is a second column in the page's own flow, 20rem from `lg` up. Once a plan has more than a few changes in it, that column is taller than the viewport, and `position: sticky` can hold a tall element by its top or by its bottom but never both. So `hooks/use-sticky-follow.ts` moves the sticky `top` with the scroll and clamps it at each end: scroll down and the column rides up until its last change sits on the viewport floor, then stops; scroll up and it rides back down until its first row meets the header, then stops. It has no scrollport of its own — an inner scrollbar beside a scrolling page is two scroll surfaces competing for the same wheel. Below `lg` the column stacks under the Outline and the hook no-ops.

**The panel.** 21rem, closed by default, at the right edge, `collapsible="offcanvas"`. Below 1280px, opening it collapses the rail — the shell never tries to show all three at a width that fits two. Parked off the canvas it is `inert`: out of the document, not merely out of sight.

**The Courses index.** The Courses surface is one composition in two regions: a 22rem index on the panel ground with its own scroll, and the open Course's own page on the canvas at the reading column's own geometry — `41rem` with the `pt-6`/`sm:pt-9` and `lg:px-10` gutters the Lesson article uses, so the pane's Topic shares a top line with the h1 and the pane previews the page it opens rather than describing it. The index carries the h1 with New Course beside it, a canvas-inset search field, and the grouped rows — Needs you, In progress, Done — under sticky label heads. A row is a mark, a Topic with its last activity under it, and one fact on the right; the Topic truncates rather than reflowing, and the pane names it in full, so the row carries no hint. Rows are links: one click opens the Course. Resting on a row for 220ms, or tabbing to it, turns the pane to that Course first, and the pane never turns back on its own. Which row the pane is showing is carried by ground, not by a second mark: the shown row sits at `raised`, a row under the pointer at half that step, so the pane's subject and the live Course's olive triangle can disagree without competing — two views of two different facts. Below 1024 the pane leads as a resume block and the index follows under it; New Course is the index head's compact control from `lg` up and the floating button below it, where a thumb can reach. The pane's content is keyed on the Course it shows and comes back over `--dur` (`mk-turn`, opacity alone): a page already on the desk returns to full ink rather than rising into place the way a layer does.

**Below 768px.** Both rails become sheets — a base-ui dialog with a blurred scrim, focus moved in, Escape to close, the layer behind inert, and focus returned to the control that opened it. The sheet takes `min(22rem, 88vw)`. Rail rows grow to `py-3` for a 44px touch target. The Courses index keeps its three columns all the way down — at 390px the last activity and the fact stay in their columns and the Topic truncates rather than the row reflowing, because a scanning row that changes shape stops being scannable. A device that cannot hover sees the row's options control at all times, since there is no reveal to wait for.

**Breakpoints:** 768 (`md`), 1024 (`lg`), 1280 (`xl`), 1536 (`2xl`), plus the 767px query behind the sheet behaviour and a 1279px check that trades the rail for the panel.

### Named Rules

**The One Right Edge Rule.** Every painted edge in the Lesson column — paragraph, code block, table, note, Exercise rule, footer rule — lands on the same right edge at 36rem. Code and tables scroll inside that edge; nothing reaches past it.

**The Fixed Sentence Rule.** Opening or closing chrome must not move the reading column. Zero drift is the acceptance test, not "close enough".

**The Fewest Facts Rule.** A mark that is the same on every row is not a fact: the Outline screen draws the mark column only for a Course that has been generated, because before approval every row would carry the identical dash the heading already accounts for. Beyond that, a row carries the fewest facts that let the reader act on it, not the most that fit. The rail row is a mark, a number and a title. A Course row in the Courses index is a Topic, its last activity, and one fact — the fraction, or the state that wants the learner; its Goal moved to the pane, where prose is read rather than scanned. A fact that is one click away, derivable from what is already on screen, or fixed at creation time does not belong in a scanning surface. This replaced an earlier rule requiring all twenty Lessons to be visible at once: density was serving the design rather than the reader, and the rail scrolls now on purpose.

**The Constant Region Rule.** The reading column does not hold still by being nailed to the left; it holds still because the region around it never changes size. Anything that opens at an edge either reserves its width in advance or is not allowed to move the sentence.

## Elevation & Depth

The system is tonal, not shadowed. Depth is four steps of luminance — canvas, panel, raised, over — plus one faint grain wash, and an element's height in the stack is its distance from the reading ground: on charcoal that is lighter, on paper it is darker. Hover is a step up; active is a step up; a floating layer is the top step. There is no ambient shadow, no glow, no ring, and no border used to fake separation, except the single hairline that encloses code on its own ground.

Exactly one shadow ships, on the only thing that genuinely floats.

### Shadow Vocabulary

- **Lift** (`--lift`): The layers that actually leave the document — the command palette, the Select popup, and the hints and the selection pill that hang over a Lesson. Offset and blur, never a halo. Two values: `0 18px 44px -12px rgba(0,0,0,0.72), 0 3px 10px -3px rgba(0,0,0,0.55)` on graphite, and a shorter, lighter pair on paper — a shadow tuned for a dark ground reads as soot on a white one.

### Named Rules

**The Flat Shell Rule.** One shadow exists in this system and it belongs to whatever genuinely leaves the document — the command palette, the Select popup, a hint. Everything else earns its depth from light.

## Shapes

Every corner in the product is square. Rows, chips, buttons, fields, code blocks, the command palette, the focus ring and the scrollbar thumb read the named ramp, and every step of it — `--radius-sm/md/lg` — is held at `0px`: a corner never has to soften what light and a hairline already separated. A call site still says which kind of thing it is, and one edit would soften this world again if it ever wanted to.

The square corner is not decoration; it is the desk register — the instrument's precision rather than paper's softness. Depth here is light plus a faint grain wash, and division is a hairline. Nothing is pill-shaped, nothing is circular, and no element carries a full border for decoration, except code on its reading ground.

Marks are drawn, not iconified in a font: a solid triangle in live olive for the current Lesson, a stroked check for done, a dashed rule for unset — all drawn on the same 12px box so a column of rows never shifts, and drawn at 10px in the Outline rail, where a mark sits beside a 12px number and a 13px title. Interface icons are Lucide at 14–16px, `strokeWidth` 1.75. The one exception to this whole section is Google's G on the sign-in button, a third-party mark that keeps its own geometry as well as its own colours.

The focus ring is a 2px solid olive outline at 2px offset, following the shape of the thing it surrounds. A control that runs edge to edge inside a clipped or scrolling region — the workspace header's field, the Outline's Courses link, a Course row in the index — takes the same ring inset by 2px instead, because a ring hanging outside the clip loses the two sides that say what shape it surrounds.

### Named Rules

**The Square Corner Rule.** Nothing carries a radius: the ramp is held at `0px`, so one edit could soften the world, but a corner is never what separates two things. An element that needs to read as separate takes a luminance step or a hairline first. Uppercase stays inside the one 0.6875rem label.

## Components

### Vendored primitives (shadcn / base-ui)

Anything with real interaction behaviour comes from the registry and is adapted through the token layer rather than rebuilt: `Sidebar`, `Button`, `Command`, `Dialog`, `Select`, `Switch`, `RadioGroup`, `ToggleGroup`, `Textarea`, `Input`, `Sheet`, `Tooltip`. Nothing in the product hand-rolls a control any more. The primitive owns roving focus, arrow keys, typeahead, ARIA, portalling and dismissal; this file owns how it looks. Every adaptation is recorded in the component file at the line it changes, in these four shapes:

- **`Toggle` / `ToggleGroup`** — the shipped variants are uppercase at `tracking-widest` with a focus ring, which spends the one label style on a control and adds a ring this world does not have. Restyled to the segmented switch: a canvas-inset track, the chosen segment on a raised ground, at 0.8125rem/500.
- **`RadioGroup`** — the shipped item is a round dot. Nothing here is circular and a chosen state is a ground step, never a mark (the Two Signals rule), so the item is a full-width row that steps up when checked, and the label lives inside the control so the whole row is the hit target.
- **`Switch`** — the shipped track is a bordered block with focus and invalid rings. The Light, Not Line Rule keeps the border off and a switch is not where the work is, so the accent stays off it, the track is a luminance step — `raised` off, `over` on — with a block thumb at third ink off and full ink on.
- **`Select`** — the trigger becomes a field on the panel ground rather than a bottom underline; the popup drops its `ring-1` for `lift`, because it is one of the two things in the product that genuinely leaves the document, and it always opens below its trigger rather than over it, capping its height and scrolling when the room below is short.
- **`Textarea`** — a canvas-inset field that steps up on focus, not an underline.
- **`Button`** — the shipped variants are uppercase at `tracking-widest` with a ring and a press translate. Replaced with the controls this file names — `primary`, `hero`, `compact`, `quiet`, `discard`, `icon`, `icon-raised` — plus `bare` for a control whose shape is its container (the rename trigger, the Next-Lesson row) and two aliases, `ghost` and `outline`, because Dialog, Sheet and Sidebar reach for those names by hand. Padding rides the variant, since each control has its own. `nativeButton` defaults to `false` whenever `render` is passed: `render` here is almost always a Link, and an anchor is navigation, not an action.
- **`Tooltip`** — the shipped hint is a raised chip with square corners, no shadow and a pointer, and a raised box vanishes over a raised row. Restyled to the layer a hint is — `float` ground, `lift` — and the pointer comes off with the arrow.
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

### Desk Scene (signature, landing)

The landing hero's illustration, drawn as one SVG in `components/desk-scene.tsx`. Not an icon set and not a photo: a sheet mid-outline with a live triangle on its first row, the line it is writing in `--live`, a pencil laid where that line stopped with a single olive band, a cup with two steam lines, a desk rule, and two angled light wedges. It tells the product's story in one image: the Outline is being shaped, the Lesson you are up to is marked, the work is not finished.

- **Drawn from tokens:** every fill and stroke reads `--panel`, `--raised`, `--over`, `--fg-dim`, `--mark`, `--rule` or `--live`, so the paper and charcoal grounds each light the scene. The light wedges are `--over` wash and drop to 0.13 opacity on charcoal (`.dark .desk-ray`), where the same value would read heavier.
- **One stroke family:** 1.25–1.5px, square or round caps to match the thing drawn — the same weight band as the Lucide icons at 14–16px.
- **Alive once:** the steam strokes draw in on the scene's settle (`mk-steam`) and then breathe between its own opacity and 0.8 (`mk-breathe`, 7s alternate). Under `prefers-reduced-motion` the steam is drawn at rest and no animation runs.
- **No frame:** the scene carries no card, hairline or shadow around it; it sits on the page the way its objects sit on the desk.

### Outline Rail (signature)

The Outline is a live, editable object beside the Lesson, not a table of contents, and the rail is built to look like one. Module headings are labels with a `done/total` count; Lesson rows are a fixed four-column grid.

- **Three states, three marks:** live is the accent triangle; done is a neutral check; unset is a dashed rule at `--mark` with its title at third ink. Inside a generated Course only the first two occur — a Lesson the learner has not reached yet is unmarked, not unfinished. Module headings carry their name and no count.
- **Open:** raised ground, title at full ink and medium weight, `aria-current="true"`. Never the accent.
- **Hover:** raised at 60% opacity. Rows transition background and colour over 120ms.
- **Unset rows are `<div aria-disabled="true">`, not buttons.** No hover, no cursor change, no click target, no palette entry.

### Buttons

- **Shape:** small and soft, like everything else. All seven live on `Button`; `variant` decides both the look and the padding.
- **Primary** (`Mark the Exercise done`): raised ground, full ink, 0.8125rem/500, 1rem × 0.625rem padding. Hover steps to over. It is the most important action on the page and it is still greyscale.
- **Hero** (`Start a Course`, `Continue with Google`): over ground, full ink, 0.875rem/500, 1.25rem × 0.75rem padding, hover to rule. One luminance step above Primary, because an Operate screen has several actions competing and a Persuade surface has one. The step is the system answering "this needs more weight" the way it always does — with light, never with a hue.
- **Compact** (`Approve`, New Course in the Courses index head): over ground, full ink, 0.75rem/500. Hover steps to rule.
- **Quiet** (`Undo`, `Discard`): no ground, third ink, hover to full ink. Discard alone hovers to bad red.
- **Icon** (rail toggle, panel close, palette trigger, code copy): third ink on no ground, hover to a panel or raised step and full ink.

### Hints

Where a title has to be cut — a Lesson in the rail, a count, a control that carries only an icon — hovering names the thing in full. The box wears what any small floating layer here wears: `float` ground, `lift`, 0.75rem at second ink, and no pointer, because nothing in this world draws one. It opens 400ms after the pointer stops, fades in on the 160ms default, and opens instantly while the pointer stays inside one group of them, so walking a rail reads as one gesture rather than a row of separate ones. Focus opens it too, so the pointerless reader is not left out. The browser's own black box is never the answer: nothing in the product names itself with a native `title`.

- **One wrapper:** `Hint` in `components/workspace/hint.tsx` puts the trigger on its child, so a call site costs one line and no wrapper element, and the layout it sits in cannot move.
- **Where a reveal already exists, no hint:** the New Course button slides its own label out on hover, so it carries none; the Courses index truncates a long Topic because resting on that row names the Course in full in the pane, so the row carries none either.

### Command Palette (signature)

Navigation, not a shortcut: every set Lesson and every action is reachable without the pointer. ⌘K/Ctrl-K toggles it globally.

- **Surface:** float ground, square, 34rem wide, `lift` shadow, on the scrim, 12vh from the top.
- **Trigger:** a panel-ground field in the shell bar, square, holding the search glyph and the `⌘K` cap; the footer's keycaps are drawn the same way.
- **Composition:** search input over a hairline, grouped results (Actions, then Lessons) with label-style group headers, a hairline-topped keycap footer. A hint beside an option identifies it — the Module a Lesson sits in — and never explains it, so the action rows carry a label alone.
- **Behaviour is the primitive's:** cmdk inside a base-ui Dialog owns filtering, the active option, arrow keys, Enter, Escape, the focus trap, the inert background and returning focus. Opened by `⌘K` from anywhere there is no trigger to return to, so focus lands on the body.
- **Active option:** raised ground, full ink; arrow keys wrap, Enter runs, Escape closes.
- **Empty state:** says that nothing in this Course matches, rather than leaving the absence unexplained. Every Lesson in a generated Course is in the palette, because every Lesson exists.

### Panel (Tutor / Tailor)

One panel, two modes, an explicit segmented switch at the top on a canvas-inset ground with the active segment raised. It owns its own close, so the shell shows no second control naming the same thing. A one-line subtitle states the contract: the Tutor changes nothing, the Tailor writes nothing until approved.

- **Tutor thread:** the learner's turns sit one luminance step up in a raised block; the Tutor's answers are unadorned prose at second ink. Pending state is a live-region line, not a spinner.
- **Composer:** canvas-inset field that steps up to raised on focus-within; Enter sends, Shift-Enter breaks.
- **Tailor plan:** hairline-divided rows on the panel's own ground — verb label, target, change, reason, then Approve/Discard or Applied/Undo. Deliberately not a card list. Once every change has a decision and at least one is approved, the Course revision starts immediately; a neutral live status names its current stage while the published Course remains readable.

### Prose Blocks

- **Paragraph:** second ink, 1rem/1.72, capped at the measure.
- **Code:** reading-ground block inside one hairline, square corners, a panel-ground label strip over a hairline, and a horizontally scrolling body with edge fades that appear only while there is content past the edge. Highlighting is syntax roles that each clear 4.5:1 on the canvas; comments fall back to third ink italic. **No syntax colour outside code.**
- **Note:** a left rule at `--rule` with a label heading. Not a callout, not a box.
- **Table:** mono, tabular, label-style headers over a rule, hairline row dividers, last column at full ink. Scrolls inside the measure with the same edge fades.

### Motion

Everything eases on `cubic-bezier(0.2, 0, 0, 1)` — exponential ease-out, no bounce — at 120ms for row and colour changes, 160ms for the default, 240ms for entrances. A port's scrollbar rides on the same ease: inked with the first scroll event, lingering 1.6s after the last one, gone over 240ms, and back the moment the port moves again. The authored moment is marking an Exercise done: one handoff in two halves, the check stroking itself onto the row just finished (340ms dash) while the accent lifts into place on the next Lesson (300ms). It fires on a real mark, never on first paint or a revisit. Under `prefers-reduced-motion`, both end states remain and all movement is dropped.

The landing adds two motions and no more. The hero settles on arrival: its lines rise one breath after another (`mk-rise`, 600ms, 90ms stagger), the scene settles at 220ms, and the scene's steam draws itself in at 420ms, then breathes between its own opacity and 0.8 on a 7s alternate — the page's only loop. Scrolling, each section fades up 16px once (`mk-settle`, 560ms) when it first enters the viewport, through `components/reveal.tsx`: `rootMargin: 0px 0px -8% 0px`, disconnect after the first intersect. The hero wash drifts 2% over 22s. Nothing settles twice, nothing enters twice, and reduced motion resolves every element to its end state.

### Named Rules

**The Stays In Place Rule.** A Course whose Lessons have not been generated draws every one of them, ruled and inert. They are never hidden, never faded out, and never disabled buttons — they hold their positions so the shape of the Course is legible before a word of it exists. The state is a property of the Course, not of a Lesson within it: generation is one pass, so a Course is either written or it is not.

**The Two Signals Rule.** Where you are up to is colour; what you have open is light. The two never swap and never combine on one row.

**The No Contract In Markup Rule.** Direction contracts live in surface briefs, never in shipped markup. No `DESIGN.md` language, hidden DOM, comment, or data attribute carries the contract into the browser.

## Do's and Don'ts

### Do:

- **Do** separate surfaces with luminance — `{colors.canvas}` → `{colors.panel}` → `{colors.raised}` → `{colors.over}` — and use hairlines only to divide, except for the single enclosure around code.
- **Do** spend `{colors.live}` outside code on where the work is — the Lesson the learner is up to, the page a run still owes work on, the one important action a surface turns on — and on the landing, once per section as wayfinding.
- **Do** carry the open state with a raised ground and `aria-current`, never with colour.
- **Do** draw the landing's scene and wash from the surface tokens, so paper and charcoal are lit separately and no colour is hardcoded into an illustration.
- **Do** resolve every landing animation to its end state once the observer fires, and give reduced motion the same end state with no movement.
- **Do** hold body copy to the 36rem measure and land every painted edge in the reading column on it.
- **Do** set every number that is data in Geist Mono or with `.tnum`, so columns of counts, dates and estimates line up.
- **Do** keep the Lessons of an unapproved Outline in place, ruled at `--mark` and inert, with no hover and no click target.
- **Do** give a scrolling code block or table its own edge fade rather than letting it bleed past the measure.
- **Do** let a port's scrollbar ride with the scroll — inked on the first scroll event, gone a beat after the last one — and reserve its lane, so the bar never crosses content and the column never shifts when it comes and goes.
- **Do** cut a row to the fewest facts that let a reader act on it, and put the rest one click away.
- **Do** give a title that had to be cut, and a control that carries only an icon, a `Hint` — the same box on hover and on focus.
- **Do** move focus into a full-screen overlay, close it on Escape, mark the layers behind `inert`, and return focus to the control that opened it.
- **Do** keep both end states and drop the movement under `prefers-reduced-motion`.
- **Do** answer every new `:root` colour in `.dark`, and check both grounds against the contrast floors before shipping either.
- **Do** reach for the vendored Sidebar for anything rail-shaped, and record an adaptation in the file at the line it changes.
- **Do** mark a layer parked off the canvas `inert`, so it leaves the tab order with the pixels.

### Don't:

- **Don't** build cards. No bordered, radiused, shadowed boxes as page structure — the Tailor's change list included.
- **Don't** introduce a second accent, a coloured status pill, a progress ring, a percentage, a streak, or an XP counter.
- **Don't** spend the accent on decoration, on done, on hover, or on more than one moment per screen; a control earns it only when it is the surface's one important action. On the landing it is wayfinding, one moment per section, and it still never colours an action. Syntax roles stay inside code blocks.
- **Don't** give the landing a second illustrated world or a card around its scene; the desk scene is drawn from the same tokens as everything else and sits on the page unframed.
- **Don't** animate a landing section twice, or let anything move that the reader is currently reading. The settle fires once; the steam is the only loop.
- **Don't** set any part of this product in a serif, or reintroduce paper, vellum, ink stamps, folds, brass or a book metaphor. That world was tried and rejected outright.
- **Don't** use `--mark` for text; it clears 3:1, not 4.5:1.
- **Don't** render an unwritten Lesson as a disabled button, and don't list one in the command palette. Every Lesson of a generated Course is listed, because there are no unwritten ones left in it.
- **Don't** add a shadow to anything that is not a floating modal layer; step the luminance instead.
- **Don't** let a native `title` ship: it wears the browser's black box, not this world. A hint is the only box that names a control.
- **Don't** let opening or closing the rail or the panel shift the reading column by a single pixel.
- **Don't** duplicate a control the panel already owns; while the panel is open, the shell shows no second control naming the same thing.
- **Don't** round a corner. The ramp is held at `0px`; a thing that needs to read as separate takes a luminance step or a hairline. Uppercase stays inside the one 0.6875rem label.
- **Don't** hardcode a colour at a call site, or define one in only one ground.
- **Don't** let the accent change meaning between the two grounds — it is darkened for paper, not repurposed.
- **Don't** carry the theme in React state; the class on `<html>` is the state, and a mounted flag is a hydration seam waiting to show.
