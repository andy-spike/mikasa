# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General self-learners who want to go from fundamentals to a concrete outcome in a topic, without stitching a curriculum together out of chat conversations. Developers learning an SDK are one example, not the whole audience.

## Product Purpose

Mikasa generates structured courses from a Topic and a Goal. The learner shapes the Outline before content is generated, then works through Modules and Lessons toward the Goal, with one self-marked Exercise per Lesson. Success is a learner reaching their stated Goal through the course rather than ad-hoc chat sessions.

## Positioning

Two-phase generation with a learner-shaped checkpoint: the Outline is generated cheaply and edited (manually or via the Tailor) before any Lesson content is paid for, and each Lesson is generated on demand with an Exercise that steps toward the learner's specific Goal. A chat-first tool cannot truthfully claim a structured, editable curriculum scoped to an outcome.

## Operating Context

- Solo self-paced learning on the web; no cohort or instructor in the loop.
- Courses are privately owned by the user who created them.
- The product is pre-launch: a Waitlist gates account creation, with pending entries approved manually.
- Usage model: generate the Outline, shape it, generate Lessons as needed, keep the course mutable afterwards (Tailor change plans with per-change undo).

## Capabilities and Constraints

- Two-phase generation: Outline first (Default model), then Lessons on demand (Strong model, one Exercise per Lesson).
- Tailor agent applies structure/content changes on instruction; Tutor answers questions grounded in generated Lesson content plus web search and never changes the course.
- Grounding (live web search via the AI Gateway) is on by default and toggleable per course at creation.
- Depth is the learner's choice at creation: just enough to reach the Goal, solid working knowledge, or deep mastery; Background is an optional statement of prior knowledge that lets the Outline skip familiar fundamentals.
- Model access runs entirely through the Vercel AI Gateway; all model calls route through it (ADR 0002).
- Auth is BetterAuth with Google OAuth and email+password (ADR 0003); data in Neon Postgres via Drizzle (ADR 0004); deployed on Vercel.
- Terminology is pinned in CONTEXT.md (Topic, Goal, Course, Module, Lesson, Exercise, Outline, Depth, Background, Grounding, Tutor, Tailor, Waitlist, Default model, Strong model); avoid the listed synonyms.

## Brand Commitments

The name "Mikasa" is fixed. No other voice, asset, or identity commitments are binding yet.

## Evidence on Hand

- Domain vocabulary: CONTEXT.md at the repo root.
- Architecture decisions: docs/adr/0001 through 0004.
- No real content, testimonials, case studies, or press exists. Future work must not fabricate learner stories, benchmarks, or usage claims.

## Product Principles

- The learner's Goal shapes the whole course, from Outline scope to the final Exercise.
- Never spend generation budget before the learner has approved the shape of what they'll get.
- The course stays mutable after generation; progress survives changes (per-change undo).
- Lessons read like a knowledgeable friend explaining, in the easygoing voice CONTEXT.md implies, backed by runnable code where the Topic calls for it.
- The Tutor informs, the Tailor changes; the two never blur.

## Accessibility & Inclusion

No product-specific requirement established yet. Standard web accessibility applies as a baseline; record a target standard (e.g. WCAG 2.2 AA) if the user commits to one.
