---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: landing

Route: `/`. Visitor mode **Persuade**. Direction: **Graphite Workspace**. This is a code-led extension of the established landing composition in `DESIGN.md`; it does not roll a new visual world.

## Job and audience

Independent Learners arrive with a personal Goal. They need to understand that Mikasa creates a private, self-paced Course around that Goal, lets them shape the Outline, and supports learning after publication.

The page's job is to make the course-creation path clear enough for a Learner to start a Course through Google sign-in.

## Promise and action

The opening asks what the Learner wants to be able to do. It explains that Mikasa turns a Goal into a Course with connected Lessons and practical Exercises, using the Learner's Background, chosen Depth, and Course Language.

The primary action is **Start a Course**. It retains the existing Google OAuth behavior and callback to `/courses`; it reports a failed sign-in and prevents a duplicate request while sign-in is pending. The supporting copy states that Courses are private and self-paced.

## Composition and widths

The landing uses the Graphite Workspace's shell gutters inside a 60rem frame. The opening explanation and closing invitation stay on the 36rem prose measure. The workflow and capabilities rows are contained at 44rem so their hairlines end with their content. The Goal and Outline demonstration alone occupies the full 60rem width.

At narrow widths, the navigation reduces to sign-in and the theme control, and the Goal and Outline demonstration stacks in reading order. The same surface re-grounds on graphite and paper; it preserves Geist, square controls, tonal separation, hairlines, and the one-accent law.

## Illustrative Course

The page shows an illustrative photography Course. Its Topic is Photography and its Goal is taking portraits with natural light. The example carries a Learner Background and Reach depth, then presents an Outline before approval: camera basics, shaping natural light, and making a portrait. The example makes the sequence visible without claiming a real Learner outcome. It makes clear that the Learner can change the Outline before Lessons are written.

## Workflow and capabilities

The workflow presents three ordered steps:

1. Start with a Goal, Background, Depth, and Course Language.
2. Review and edit the Outline, directly or through Tailor proposals, before approving it.
3. Approve the Outline for full Course generation and review as a cohesive unit with connected examples and Exercises.

The page names the generation wait honestly: it can take several minutes, progress is available, and the Learner can return later.

The capabilities section describes only existing product behavior:

- Each Lesson has an explanation, worked example, recall prompt, self-explanation prompt, and one Exercise.
- The Tutor answers questions from the Course and may search the web for Sources; it does not change the Course.
- The Tailor proposes a Change plan that the Learner accepts or discards. An approved revision is prepared while the current Course stays readable.
- Grounding may remain on so relevant Sources can appear in Lessons and Tutor answers.

The final details name the supported Depth choices and Course Languages. Course Language stays fixed after creation.

## Boundaries

Do not add performance claims, testimonials, cohorts, instructor support, daily quotas, waitlists, passwords, pricing, or model controls. Do not imply that the Tutor or Tailor can change a Course without Learner approval. Do not turn the page into a separate marketing world or introduce cards, rounded containers, or an accent call to action.

## Review disposition

**SHIP.** The landing was reviewed in graphite and paper, at desktop and mobile sizes. The accepted review rasters are `.impeccable/review/landing-desktop-dark.png`, `.impeccable/review/landing-desktop.png`, `.impeccable/review/landing-mobile-dark.png`, and `.impeccable/review/landing-mobile.png`.
