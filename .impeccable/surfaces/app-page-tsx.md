---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: landing

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
