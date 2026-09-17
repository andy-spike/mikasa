---
version: 1
slug: "app-courses-page-tsx"
primary_target: "app/courses/page.tsx"
related_targets: ["components/course-row-menu.tsx","lib/db/courses.ts"]
---

# Surface brief: Courses index

Scope: `app/courses` — the Courses page only. Visitor mode Operate.

Audience and job: the solo learner returning to a library of Courses. First job: resume the Course they were last in. Second: see which Courses need a decision, and find any Course in a library of thirty-plus.

Proof: rows carry last activity and the states that need the learner; the open pane carries the Goal, where the learner is, the next Lesson and the one action. No pills, rings, percentages, streaks, cards.

Constraints: `DESIGN.md` Flexoki Paper Desk, both grounds. The app header, the delete flow, the empty-state copy, and the new-Course affordance stay. Layout, component visuals, and code color may change. Warm paper leads per user pin. No serif. No skeuomorphic paper. The user locked this direction in chat; the decision board and payload sit at `.impeccable/mocks/decision/surface-courses.json` (roll seed `ac6d65e8`, dealt indices 3/4/7).

Chosen direction: The Two-Pane Index — library and live Course side by side.

## Direction contract

THESIS: The library and the live Course sit side by side: a searchable ruled index left, the open Course's own page right. The pane answers without a click what the learner came back to do — where I am, what comes next, what this Course needs — while every index row still opens its Course in one click.

OWN-WORLD: Flexoki Paper Desk unchanged: index on the panel ground against a canvas pane, one hairline between; square, hairline-ruled rows; Geist for words, mono tabular for fractions and dates; one olive moment, the live Course's mark. Needs-you rows speak in full ink and their own state words, never a second colour; no cards, pills, rings or percentages.

STORY: The learner lands and the pane already shows the Course they left, so Continue is one click. To switch, they scan the grouped index — Needs you, In progress, Done — read a row's last touched and fraction, and open it in one click; resting on a row or tabbing to it previews that Course in the pane.

FIRST VIEWPORT: At 1024 and wider, the app header over two regions filling the rest: the index (22rem, panel ground, its own scroll) carrying the h1, the New Course control, a search field, and the grouped rows; the pane (canvas) carrying the Topic at 1.5rem, the Goal, the module and Lesson position with the next Lesson's title, one greyscale action, and the meta line. Below 1024 the live Course leads as a resume block and the index follows; the floating New Course button stays.

FORM: The Two-Pane Index, 1st of 7 grounded structures in this surface round (roll `ac6d65e8`, dealt 3/4/7); code-led, no comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: whether the pane should let the learner pin a Course explicitly or always fall back to last-touched; whether index search should also match Lesson titles.
