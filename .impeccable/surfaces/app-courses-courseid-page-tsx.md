---
version: 1
slug: "app-courses-courseid-page-tsx"
primary_target: "app/courses/[courseId]/page.tsx"
related_targets: []
---

---
version: 1
slug: "app-courses-courseid-page-tsx"
primary_target: "app/courses/[courseId]/page.tsx"
related_targets: ["components/workspace"]
---

# Surface brief: course workspace

Route: `app/courses/[courseId]`. Visitor mode **Operate**. Direction: **Graphite Workspace** (roll 21608bd1, re-roll 1, safer register, user-picked, code-led).

## Job and audience

General self-learners, alone, at a laptop, in a deep-work session and often with an editor open beside it. They open one Course and want to know where they are, read the current Lesson, mark its Exercise done, and occasionally ask the Tutor or send the Tailor after the structure.

## Outcome and proof

Success is the learner finishing a Lesson and marking its Exercise, then seeing the accent hand off to the next entry. Progress reads without leaning on colour: done is a neutral check and a date, live is the one accent on the screen, and a Lesson not yet reached carries no mark at all. No badge, pill, ring, or percentage.

What only Mikasa can claim here: the Outline is a live, editable object sitting beside the Lesson, not a table of contents. The learner shaped it before content existed and can still reshape it. The workspace has to make that feel true.

## The direction that was replaced

The Reading Room (roll d3f00ad5) shipped and was rejected outright: too serif-heavy, too skeuomorphic. It is now anti-reference. Nothing carries forward from it except product truth, the demo content, and the three topology decisions below. Do not reintroduce paper, vellum, ink stamps, folds, brass, or a book metaphor, and do not set this product in a serif.

## Selected direction and structure

A working shell where every pixel carries information and the only colour is where you are.

**Surfaces separate by luminance, never by border.** Four steps up from a graphite canvas. Hairlines divide; nothing is a card, nothing floats except the command palette.

**The rail.** The Outline is a dense left rail carrying all twenty Lessons without scrolling at a laptop height, four facts per row: mark, number, title, and either the completion date or the estimate. Summaries do not belong in a scanning surface; they live on the Lesson. The rail collapses to a stub and comes back on click, keyboard, or the palette.

**The panel.** One panel at the right edge, closed by default, holding the Tutor or the Tailor with an explicit mode switch at its top. Opening it below 1280px costs the rail. While it is open it owns its own close and its own switch, so the shell shows no second control naming the same thing.

**The command palette.** ⌘K is real navigation, not a shortcut: every Lesson and every action in the workspace is reachable from it without the pointer. A Course is generated in one pass, so every Lesson is there; the empty state covers a search that matches nothing.

**Two grounds.** The workspace ships graphite and paper. The same system re-grounded, not a second design: four surface steps either way, the sidebars one step off the reading ground, and both grounds landing on the same contrast floors. A stored choice wins, the operating system decides otherwise, and the class is on `<html>` before first paint. One switch in the chrome, holding no React state.

**The rails are the shadcn Sidebar.** Both of them, adapted rather than rebuilt: one open state per rail across both widths, no cookie, no provider-level keyboard shortcut, and `inert` while parked off the canvas. The Outline collapses to an icon rail, the panel goes offcanvas, and below `md` both become sheets.

**Accent law.** One accent — `#4fd1a5` on graphite, `#0a7f5f` on paper — means exactly one thing: the Lesson you are up to, the first that is set and not done. Which Lesson is *open* is carried by a raised ground, never by colour, so the two signals never compete for the same meaning. The accent is not spent on done, on code, on a hover, or on a button.

**Focal moment.** Marking an Exercise done is one handoff in two halves: the check strokes itself onto the row you finished, and the accent lifts to the next one. It fires on a real mark, never on first paint or a revisit. Reduced motion keeps both states and drops the movement.

## Scope and boundaries

A Course is generated in one cohesive pass on approval, so inside this workspace every Lesson exists and every Lesson opens. The dashed, inert row belongs to the Outline screen, where a Course still waiting on approval draws all of its Lessons before any of them are written. Generation itself is not part of this build.

Anti-goals: cards as page structure anywhere, the Tailor's change list included, progress rings and percentages, coloured status pills, streaks or XP, a second accent, a serif anywhere, any material pretending to be paper.

The brief's earlier anti-goal against "a generic collapsible-sidebar app shell" is superseded: the user chose the familiar register explicitly. What keeps it from being generic is the density (all twenty Lessons at once), the one-accent law, and the palette as primary navigation — not ornament.

## States and ranges

Demo Course: 3 to 6 Modules, 4 to 9 Lessons each, 14 to 40 Lessons total. Lesson titles of 2 to 7 words that must survive 12. Lesson body of 600 to 1500 words with 2 to 5 code blocks and one Exercise. Tutor thread of 0 to 30 turns. Tailor plan of 1 to 8 changes.

States built: mid-progress as the default; Exercise just marked, with the handoff; rail collapsed; panel in both modes; Tailor plan pending, applied, and undone; the palette open, filtered, and empty; both overlays on a phone.

Deferred with the logic: generation in progress, network and model errors, unsaved state.

## Interaction and layout

The Lesson holds a 65 to 75 character measure and does not stretch with the window. Every body block shares one right edge at that measure; code and tables scroll inside it rather than reaching past it, and each horizontal scroller fades its own edge while there is something past it. The reading column holds still by keeping the region around it a constant size: the rail's collapse is paid back as left pad, and from `2xl` up a closed panel keeps its width in reserve on the right so the column can centre in the space it will still occupy once the panel opens. Zero drift measured at 1280, 1440, 1600 and 1920 on both toggles. Keyboard reaches the rail toggle, every Lesson, mark done, the panel, and the palette. Below `md` both rails become sheets: focus moves in, Escape closes, the layer behind goes inert, and focus returns to the control that opened it. That is the dialog primitive's job now, not the shell's.

## Still not built

Generation of any kind, auth, persistence, and model calls. The Tutor composer accepts a question and shows the pending state, then returns a labelled placeholder saying it is not connected in this build.
