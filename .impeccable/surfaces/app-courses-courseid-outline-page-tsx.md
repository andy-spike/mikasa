---
version: 1
slug: "app-courses-courseid-outline-page-tsx"
primary_target: "app/courses/[courseId]/outline/page.tsx"
related_targets: ["components/course-design-progress.tsx","components/outline-editor.tsx","app/mock/outline-generation/page.tsx","app/mock/outline/page.tsx","app/mock/lesson-generation/page.tsx"]
---

# Surface brief: the Outline screen

Scope: `app/courses/[courseId]/outline/page.tsx` in both of its lives. While a Course is `designing` it is the generation surface (the Sources → Outline → Connections → Saving run); once the Outline exists — `awaiting-outline-approval`, and `generating`/`reviewing` after approval — it is the review surface. Visitor mode Operate. Three disposable mocks carry the builds until the learner moves them to the real surface: `app/mock/outline-generation/page.tsx` (generation), `app/mock/outline/page.tsx` (review), and `app/mock/lesson-generation/page.tsx` (the writing run and the check).

## Generation (designing)

Audience and job: a solo learner who has just set a Topic and Goal, now waiting on one Outline. They need to know the run is alive, what it is doing, and that they may leave.

Action: wait with confidence, read the Outline as it is written, cancel if they change their mind.

Proof/content: the four-step run state with marks, elapsed time in mono, the arrival of Modules and their Lessons, the Sources consulted, and the Course's Why this shape.

Constraints: AppShell chrome, Flexoki tokens, existing copy and terms, and Cancel / Back to Courses all stay. Loading is System-native motion: no spinner, no progress ring, no percentage. The moving parts are authored with `motion/react`: the indeterminate rule, the live caret, the frontier write-in, each ruler tick landing, and source arrival. Both grounds, reduced motion drops every transform and both end states remain.

Chosen direction: The Now Column. The run narrates itself from one fixed left column while the Outline takes the rest of the width in two proof columns.

Memorable moment: the frontier — the newest Lesson arrives under the olive triangle while the step's live mark holds the same position, and the counts tick in tabular figures.

### Direction contract — generation

THESIS: The generation narrates itself from one sticky column while the Outline takes the main event in two proof columns. It refuses the narrow single column that hides both the run and the work.

OWN-WORLD: Flexoki grounds — canvas page, panel status column, hairline rules; Geist words, Geist Mono counts; live olive only at the writing frontier; the three marks carry step and Lesson state; no cards, no shadows, one radius language. Stripped of words: a 22rem panel column of ruled steps beside a two-column ruled sheet with one olive tick.

STORY: The learner sees the machine alive, what it is doing now, how long it has run, what is already written, and what is still to come — then leaves or cancels.

FIRST VIEWPORT: From `lg`: a 22rem panel column at the left with the four steps (mark, name, Done/Doing/Queued), the ticking elapsed in mono, one now line, and a progress ruler — one tick per Lesson, grouped by Module, filled as the Outline is written — then Cancel and Back to Courses. Right: Topic and Goal, then two columns of Modules; the frontier Lesson carries the olive triangle and its summary writes in. Sources and Why this shape close the page. Below `lg` the status column stacks first and the proof becomes one column.

FORM: The Now Column, 6th of 7 grounded structures, seed key ae5d7d6d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Unresolved: whether a wide screen (2xl) gives the status column more width or gives the proof a third column. Settled in the mock: 520ms clip for the frontier write-in, 300ms for a ruler tick, 1.8s linear for the rule, 1.1s for the caret.

## Review (the Outline exists)

Audience and job: the same solo learner, one step later. The Outline exists; this is the last stop before the expensive work. They must grasp what the Course will be, change what is wrong — by hand or through the Tailor — and commit, or leave for later.

Action: read the shape, edit it in place, tailor it, approve it; after approval, follow the writing run and leave again.

Proof/content: Topic and Goal; every Module as a band with its Lesson count; every Lesson as a row with its summary; the Module and Lesson counts beside the commit; the Tailor conversation and the proposed Change plan; the change count; Why this shape and Sources as the evidence for the decision; after approval, each Lesson's Done / Doing / Queued state.

Constraints: AppShell chrome, Flexoki tokens, existing copy and terms, Back to Courses stay. The review register keeps the generation screen's reading order and row grammar; the run's status column (steps, elapsed, ruler, Cancel this Course) does not return to it. Before approval the reserved left gutter holds each Lesson's drag grip — a column of identical dashes would say nothing — and after approval the marks return to it. Olive stays off the review screen outside focus rings and selection; while writing, the olive triangle marks the Lesson being written. Rows never move when a state changes: the same row gains or loses its actions and status in place, and a rename keeps the row's height — the input takes the text's own line box. Both grounds, reduced motion drops every transform and every end state remains.

Chosen direction: The Ledger. The roll's deal, locked by the learner (seed key 1bbf8f0c, 3rd of 7 grounded structures, code-led).

Memorable moment: the counts land — Generate the Lessons sits beside `6 Modules · 13 Lessons`, and every Tailor change ticks them the moment it is accepted.

### Direction contract — review

THESIS: The review is a count: the whole Course on one ruled register, with the Module and Lesson counts set beside the commit. It refuses the narrow single column that makes a 13-Lesson Course feel like a form.

OWN-WORLD: Flexoki grounds — canvas page, panel Tailor column, hairline rules; a full-width register with Modules as bands (`n Lessons`) and Lessons as one row each (number, title, summary, hover actions); Geist words, Geist Mono counts in tabular figures; the three marks only after approval; no cards, no shadows, one radius language. Stripped of words: a wide ruled register of module bands and lesson rows with a counts rule at its foot and one panel column at the right.

STORY: The learner sees what the Course will be, changes what is wrong in place or in words, and approves with the shape in front of them; then watches the same rows fill with written Lessons.

FIRST VIEWPORT: From `lg`: Back to Courses at the top left, then Topic, Goal and the handoff line (`Drafted in 1m 52s`); beneath, the register spanning the width left of a 20rem Tailor column — Module bands with `I. Title` at the left and `3 Lessons` at the right, Lesson rows with a drag grip, number, title, summary and hover actions; Why this shape and Sources close the register as evidence; a sticky footbar leads with Generate the Lessons, then `6 Modules · 13 Lessons`, then the change count. The Tailor column pins to the bottom of its scroll, the composer at its foot with a tight bottom gap. After approval the same register is the writing run: a mark column appears, rows keep their order, and each carries Done, Doing or Queued. Below `lg` the Tailor stacks under the register and the footbar keeps its counts on their own line.

FORM: The Ledger, 3rd of 7 grounded structures, seed key 1bbf8f0c.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Settled in the mock: every Module sits on the register — nothing folds into disclosures — and Why this shape and Sources stay plain ruled sections under their label headings. Row and band actions are hover-revealed clusters on hover-capable pointers; on touch they become a per-row menu, and coarse pointers at `sm` and up keep the cluster visible. Below `lg` the commit bar follows the page instead of the register column, so it survives the Tailor. While writing, the Tailor column leaves and the register takes the full width. Study-time estimates are dropped from both mocks: the register shows Module and Lesson counts only, while the model still returns `minutes` per Lesson server-side; the measured run time stays instead (`Working for …` while writing, `Drafted in 1m 52s` on the review). Accepting a Change plan operation applies it to the register immediately; Undo returns the register to the moment before it and replays the operations accepted after it, and Apply all changes applies every still-proposed operation at once. The manual Merge-with-the-next-Lesson action is gone from both the hover cluster and the touch menu, and the plan is edit-only: the mock's scripted plan demonstrates rewrites and additions, never a merge. The port drops `mergeLesson` from what the Tailor may propose (its instructions and plan vocabulary) — if a merge survives anywhere it is a learner's own verb, not the plan's. The Ledger's rasters in `.impeccable/review/outline/` predate this change (they still show a Merge move and the old Tailor line); the live mock is current — refresh those rasters in the finish review. Back to Courses lives at the top left with the generation screen's arrow animation instead of in the footbar. Each Lesson row carries a drag grip in the reserved left gutter while awaiting approval; dragging reorders within its Module and the register renumbers in place, one change counted per drag, with ↑/↓ on the focused grip as the keyboard path.

## Writing (generating and reviewing)

Audience and job: the same solo learner, one step later. The Outline is approved and the Lessons are being written one at a time, then checked and corrected. They need to see the Course being made, start reading what exists, and know the run is alive — or leave and come back.

Action: watch the Lesson in hand being written section by section, open any finished Lesson as a draft, follow the check as it names what is wrong and watch the corrections land, then open the published Course; or leave, or cancel.

Proof/content: the phase line and ticking elapsed; the count of Lessons written; the queue with Done / Doing / Queued; the Lesson at the measure with its real sections arriving in the order the writer produces them; the pages already written; the check's findings tied to the Lessons they touch and their correction state; the published line and Open the Course.

Constraints: AppShell chrome, Flexoki tokens, existing copy and terms, Back to Courses, Cancel generation and the leave note stay. The page in hand uses the workspace's reading grammar and section vocabulary, so the port renders the same `LessonBlock`s the real LessonPane does. A draft is labelled as a draft: nothing implies the check has run on a finished Lesson until it has. Olive marks only the Lesson the run still owes work on — written, checked, or corrected — and it leaves the page when the work does. No card, no progress ring, no percentage, no ETA — elapsed is a measured fact. Both grounds, reduced motion drops every transform and every end state remains, and every authored animation is `motion/react` rather than a CSS keyframe — the rows' hover grounds and the Back arrow included, so the port inherits one motion system and not two; the shared `Button` keeps its own colour transitions.

Chosen direction: The Writer's Column. The roll's deal, locked by the learner (seed key b5144ce7, 6th of 7 grounded structures, code-led).

Memorable moment: a Lesson lands — the last section writes in at the measure, the stack gains its page, the margin's mark hands from Doing to Done — and the page in hand has become the next Lesson before you finish reading.

### Direction contract — writing

THESIS: The writing run is one Lesson at reading size: the page in hand fills section by section while a margin carries the queue and the check. It refuses the status list that shows neither the work nor the Course.

OWN-WORLD: Flexoki grounds — canvas page, panel margin, hairline rules; the Lesson at the measure with its real section vocabulary (explanation, worked example, Recall, Explain it to yourself, Exercise, bridge); Geist words, Geist Mono counts; live olive only where the run is working — the Lesson being written, checked, or corrected; the three marks carry the run; a rail of written pages squared at the right edge; no cards, no shadows, one radius language. Stripped of words: a margin of ruled queue rows beside a page at the measure and a rail of stacked sheets.

STORY: The learner watches the Course being written, reads any finished Lesson as a labelled draft, sees the check name what is wrong and watches it get fixed, then opens the published Course.

FIRST VIEWPORT: From `lg`: a 20rem panel margin with the phase line and ticking elapsed, Cancel generation under them, the count (`4 of 13 written`), the queue as ruled rows with the three marks, and the leave note at its foot; the page in hand — `Lesson n of 13`, title, body, worked example, Recall, Explain it to yourself, bridge, Exercise — filling section by section with skeleton rules ahead of it; from `xl` a 20rem panel rail of written pages at the right edge, both panels squared against the canvas the way the real Workspace squares its rails, and equal in width so the Lesson sits at the center of the screen. The check swaps the margin's queue for the findings and their corrections; publish closes with Open the Course. Below `lg` the margin stacks first, its queue becomes a compact ruler, and the written pages list under the page.

FORM: The Writer's Column, 6th of 7 grounded structures, seed key b5144ce7. Code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Settled in the mock: the run opens at a chosen moment with `?t=<ms>` so every phase can be inspected by eye. The page in hand follows the work: the frontier while it is written, then the finding in hand while the check runs and its corrections land (the newest finding as it is named, the one being fixed while it is fixed, the last correction through the re-check and the ready state). Opening a finished Lesson pins it and keeps it through the run — the bar's copy follows the phase (`Writing now · Lesson n: …`, then `The check is running`, `Correcting what the check found`, `Re-checking the corrections`, and `Every Lesson passed the check` when the Course is ready) with `Return to writing` becoming `Return to the run`, so a pin is always reversible — and both the queue and the rail mark the open page with the raised ground, never the accent. A Lesson's sections land across the first 80% of its window — body and worked example, Recall, Explain it to yourself, bridge, then Exercise — so the finished page holds for a beat before the handoff. The check swaps the margin's queue for the findings the moment writing ends: findings reveal in reading order, fix one at a time, and the fixing one carries the live mark. Corrected Lessons visibly rewrite in place: a fix lands 1.5s into its 2.2s window, the page swaps its draft body for the corrected one, the strip reads `✓ Fixed in this round.`, and the corrected page holds at the measure for the rest of the window before the run turns to the next finding. The finding strip's own line carries that colour: while the finding on the page is still queued or being fixed, `▶ The check · Structure` is set in the accent with the live mark, and `Fixing now.` is set in it too while the correction is in flight; all of it goes quiet — third ink, mark gone, `✓ Fixed in this round.` — the moment the fix lands, so the accent reads as the run at work on this page and never survives into the fixed state. Live Olive in DESIGN.md carries the extension: the accent is spent on where the work is — the Lesson you are up to, the page a run still owes work on, and the one important action a surface turns on — loosened from the live Lesson alone, with the landing's wayfinding rule unchanged. Drafts are labelled in the meta line (`Being written now.`, `Draft · the check runs after the last Lesson.`, `Draft · the check is running.`), and the labels become `Checked.` then `Published in revision 1.` The page's `h1` is the Topic in the margin with the Goal under it, mirroring the real workspace rail; the Lesson title is an `h2` and the section labels `h3`, the real LessonPane's order. Below `lg` the margin stacks first, its queue becomes a compact module ruler, and the written Lessons list under the page; the separate rail appears from `xl`. The panels are sized and squared like the real Workspace's rails: 20rem on both sides from `xl` (the margin alone from `lg`), both `panel` against the `canvas` page, equal in width so the Lesson holds the center of the screen — 192px of gutter either side at 1680; below `xl` the margin stands alone and the Lesson centers in the space that remains, which sits left of the screen's center. The row grammar is the product's (`raised` for hover and for the open page, never `panel` on `panel`); the rail's empty state is a line of copy rather than a void, and its rows are 44px on touch. The margin reads as three blocks — the Course's identity, the run's status, the work — with 2rem between blocks and 12–16px inside one; its inner padding is the rail's own, so the two sidebars stay symmetric and the queue's titles keep 16px more room before they truncate. The phase sentence sits at the foot of its two-line reserve, so the sweep rule and the elapsed hold the same distance in every phase, and the meta line carries the measured elapsed alone — the Lesson's position already lives at the measure and on the queue's live row. Cancel generation closes up under the elapsed line, with the status it belongs to; the leave note is pinned to the margin's foot. Code arrives highlighted: the server runs Shiki over each block before the mock renders (the step the real page takes too), so `LessonBlock` draws the five syntax roles and the browser ships no highlighter. Everything that moves is `motion/react` under one ease and three durations: the skeleton pulse (the design system's `Skeleton` keeps its surface, its CSS pulse retired), the indeterminate rule (a soft-edged gradient core, eased, on screen for nearly the whole 2.4s pass), the counters settling, the margin swapping queue for findings, the mark handing from Doing to Done, the page turning when the open Lesson changes, the pinned bar and the finding strip unfolding to their height, and each written page landing on the stack. Only pointer hover transitions remain the product's shared CSS, as everywhere else. Captures: `.impeccable/review/lesson-generation/`.

Unresolved after review: none on this surface. Answered: corrections visibly rewrite the page in place; the written-pages rail keeps its own column from `xl`; a pinned page stays pinned for the whole run with the bar tracking the phase; when nothing is pinned the page follows the finding in hand; the measured run time stays; this surface's own hover feedback runs through `motion/react` too (the row grounds as a raised layer the pointer fades in, the Back arrow's nudge), while the shared `Button` keeps its component colour transitions — moving those would change every surface, so it is the product's call, not this page's; the Tailor's plan is edit-only; the Ledger's grip set stays within-Module and hover-revealed.
