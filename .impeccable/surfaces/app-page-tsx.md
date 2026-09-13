---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: landing

## Current direction: living course demo

Follow-up hero direction: center the headline, copy, and actions with no diagram beneath them, and fill the first viewport exactly (100dvh minus the fixed bar) with the content vertically centered. An earlier goal-to-course hero diagram and its lead question were removed by user decision; the living course demonstration carries the interaction with its own subject tabs. The headline mask reveal and underline draw remain. The user explicitly requested a landing-only exception to reduced-motion behavior for the hero and course-demo animations; app behavior remains unchanged. No continuous animation loops.

Follow-up polish: the demo subject tabs join with no gaps, section headings drop the wayfinding triangle, and the page sits over a notebook-paper ground — a faint ruled grid in the hairline token at 20% that holds still while content scrolls over it. The navbar is a compact fixed bar on translucent blurred canvas with a hairline; Sign in is a primary button with the Google mark at 16px; the closing CTA repeats the hero CTA verbatim (Google mark plus "Create your course"); the footer records the copyright line.

Follow-up motion: scroll-linked motion runs through Motion in `components/landing-motion.tsx`. The exercise band clips in on a spring when first seen or on subject change, the quality terms stagger on springs, and a greyscale hairline tracks reading progress at the viewport top. Content renders visible by default so scripts failing leaves the page readable. The same landing reduced-motion exception covers these.

The user selected this direction for the landing overdrive pass. This section supersedes the earlier hero, illustrative course, width, and motion descriptions below.

Lead with "Create a course about anything" in large Geist type with one olive underline. Retain warm paper and charcoal themes. Replace the desk illustration with an interactive demonstration of Photography, Jazz harmony, and Databases. Each selection updates the goal, learner background, three-module outline, and sample exercise together. All examples are explicitly illustrative. Subject buttons expose their pressed state and work by keyboard or pointer.

Use a 77rem frame including gutters, an open editorial hero, and three numbered demo steps on a hairline spine sharing one ground, closed by a hairline below. Mobile stacks the demonstration. The quality section explains connected lessons, practice, course-wide review with corrections, and linked sources. Preserve the existing course-creation workflow, Tutor and Tailor facts, language and depth details, and Google OAuth behavior.

The authored motion is the short staggered reveal of outline rows on subject selection, with a reduced-motion fallback. The hero arrives as a cascade: headline mask and underline draw first, then copy, actions, and microcopy rise on the stagger. See `app/landing.css` and `components/landing-course-demo.tsx`. Earlier review rasters document the previous design and are not current acceptance captures.

Route: `/`. Visitor mode **Persuade**. Direction: **Flexoki Paper Desk, morning light**. The landing is the desk seen from the visitor's side: it keeps every token, type step and hairline of `DESIGN.md`, and spends them on making a visitor feel welcome and start a Course. It may spend the accent as wayfinding, one olive moment per section, recorded in `DESIGN.md` under The Landing Wayfinding Rule. It is not a separate marketing world.

## Job and audience

Independent Learners arrive with a personal Goal. They need to understand that Mikasa creates a private, self-paced Course around that Goal, lets them shape the Outline, and supports learning after publication.

The page's job is to make the visitor feel at home at a working desk and make the course-creation path clear enough to start a Course through Google sign-in.

## Promise and action

The opening asks what the Learner wants to be able to do in Display XL (`2.75rem → 3.5rem → 4rem`), and pairs it with an illustrated desk: a sheet mid-outline, a pencil laid where its writing stopped, a cup with steam. The scene carries the page's olive moments and the page's story: an Outline being shaped, a Lesson marked as where you are up to.

The primary action is **Start a Course**. It retains the existing Google OAuth behavior and callback to `/courses`; it reports a failed sign-in and prevents a duplicate request while sign-in is pending. The supporting copy states that Courses are private and self-paced. Both `Start a Course` controls stay greyscale; the accent never colours an action.

## Composition and widths

The landing uses the Flexoki Paper Desk's shell gutters inside a 60rem frame. The hero is the page's one composition: statement left, desk scene right (`components/desk-scene.tsx`), a light wash and 110px rule rhythm behind both, masked to the top right. Below 768px the grid stacks and the scene follows the text at 19rem. The opening explanation and closing invitation stay on the 36rem prose measure. The workflow and capabilities rows are contained at 44rem so their hairlines end with their content. The Goal and Outline demonstration alone occupies the full 60rem width.

Each section below the hero carries one live triangle beside its heading (`SectionMark`), the same mark the Outline rail uses, and enters with one settle: 16px rise, 560ms, staggered 90ms within the section (`components/reveal.tsx`). The hero's lines rise on arrival, the scene settles at 220ms, and its steam draws and then breathes. Nothing settles twice; `prefers-reduced-motion` resolves everything to its end state.

At narrow widths, the navigation reduces to sign-in and the theme control, and the Goal and Outline demonstration stacks in reading order. The same surface re-grounds on paper and charcoal; it preserves Geist, the radius ramp, tonal separation, hairlines, and the accent's meaning.

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

Do not add performance claims, testimonials, cohorts, instructor support, daily quotas, waitlists, passwords, pricing, or model controls. Do not imply that the Tutor or Tailor can change a Course without Learner approval. Do not introduce cards, rounded containers, an accent call to action, a second illustration, or a serif. Do not let the wash, the rule rhythm, or the scene sit behind body text at reading opacity. Motion is limited to the hero entrance, the scene's steam, the hero wash drift, and the once-only settle; no parallax, no pinned scenes, no repeated reveals.

## Review disposition

**SHIP.** Recaptured after the hero composition, desk scene, wayfinding accent, and scroll settles landed. The accepted review rasters are `.impeccable/review/landing-desktop.png`, `.impeccable/review/landing-desktop-dark.png`, `.impeccable/review/landing-mobile.png`, and `.impeccable/review/landing-mobile-dark.png`. The older `landing-signin-error.png` predates this pass; the error state's markup and copy are unchanged.
