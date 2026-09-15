---
version: 1
slug: "app-courses-courseid-page-tsx"
primary_target: "app/courses/[courseId]/page.tsx"
related_targets: ["components/workspace","app/mock/lesson"]
---

# Surface brief: course workspace

Scope: `app/courses/[courseId]` workspace shell. Visitor mode Operate.

Audience and job: solo learner at a laptop, often with an editor beside it. Open one Course, know where they are, read the Lesson, mark the Exercise, ask Tutor or send Tailor after structure.

Proof: marking done hands the live mark to the next row. Done reads neutral with a date. Unreached carries no mark. No pills, rings, percentages, streaks.

Constraints: readability is the hard line. Both grounds ship. Layout positions and palette behavior stay. Component visuals, tokens, radius, and code color can change. Warm paper leads per user pin. No serif. No skeuomorphic paper.

Chosen direction: Flexoki paper desk. Warm grounds, ink text, muted accents, subtle grain, syntax color only in code.

Memorable moments: the done stamp (date lands, check strokes, live mark lifts to next) and the margin answer (select a passage, the bracket rises, the answer sets beside it).

## Direction contract

THESIS: The Tutor's home is the margin, not a parked panel. Asking grows out of the text: select a passage, a hairline bracket rises, the question is asked beside it, and the answer stays there for the Lesson — the 36rem measure never moves.

OWN-WORLD: Flexoki paper desk, unchanged: warm grounds, hairline rules, small radii, mono for numerals and dates. The margin is a ruled column of the same paper — quoted passages at 0.75rem in ink-3, the learner's question in ink, the Tutor's answer at 0.8125rem in ink-2; one olive mark stays spent on where the work is; no bubbles, no cards.

STORY: The learner reads at the measure, selects what they do not understand, and the Tutor answers in the margin beside it; the answer survives the session, the rail marks Lessons with margins, and the ask line at the margin's foot is the Tutor's front door.

FIRST VIEWPORT: At 1440 and wider the reading pane is a three-column grid — dead space, the 36rem Lesson measure exactly where it stands today, dead space — with the margin fitted to the right dead space (14–20rem), sticky and self-scrolling: anchored threads above, the ask line at its foot. Selecting text raises a hairline bracket in the article's gutter and a quiet Ask at the selection; the answer streams into the margin beside its passage. Below 1440 the margin becomes the Tutor sheet and the Lesson behaves the same. First build ships as the throwaway fixture `app/mock/lesson`; porting to the real workspace is a later pass.

FORM: The Margin, 1st of 7 grounded structures in surface round 2 (roll 5/6/1), seed key 002abb41, mode operate; code-led, no comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: exact grain opacity on low-end screens. Resumption (opening the last-read Lesson) stays unanswered by this direction; a later pass owns it. The mock's anchors are fixture data; persistence will need a nullable anchor column on tutor messages when the surface ports.

Syntax roles: resolved where the Course is assembled. Shiki runs on the server (`lib/course/highlight.tsx`), themes each grammar scope into the five roles through the `--code-*` tokens, and hands `LessonBlock` a rendered tree, so the browser ships no highlighter and both grounds answer from one palette. A language the highlighter does not carry renders as plain code. The language strip's right edge carries `CopyButton`, which copies the block's raw source and confirms with a check at full ink plus a spoken line.
