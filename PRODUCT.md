# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web.

## Learners

Mikasa is for independent Learners who want to reach a concrete Goal without assembling a curriculum from unrelated chat answers. Developers learning an SDK are one example, not the whole audience.

## Product purpose

Mikasa creates a cohesive Course from a Topic, Goal, Depth, Background, Course Language, and Grounding choice. The Learner shapes and approves the Outline before Mikasa generates the complete Course. The Learner then works through its Lessons, completes one Exercise per Lesson, asks the Tutor for help, and uses the Tailor to propose changes.

## Positioning

The Outline is a checkpoint before the expensive work starts. After approval, Mikasa generates and reviews the Course as one unit instead of treating Lessons as unrelated prompts. The result should read as one designed Course with a shared Goal, sequence, vocabulary, examples, and final Exercise.

## Operating context

- Learning is private, self-paced, and web-based. There is no cohort or instructor.
- Registration is open through Google OAuth. The first sign-in creates the account. There is no waitlist or email and password flow.
- A Course may take several minutes to generate. The Learner sees durable progress and can return later.
- The current Course stays readable while Mikasa prepares an approved Course revision.

## Course creation

- Topic and titles accept at most 200 characters.
- Goal and summaries accept at most 500 characters.
- Background accepts at most 2,000 characters.
- Course Language is required and cannot change. Initial values are English, Spanish, French, German, and Portuguese.
- Grounding is on by default and can be turned off when the Course is created.
- Depth controls the generated Outline bounds. Reach uses 3 to 4 Modules with 2 to 3 Lessons each. Working knowledge uses 5 to 7 Modules with 3 to 4 Lessons each. Mastery uses 8 to 10 Modules with 4 to 5 Lessons each.
- Manual Outline changes are not restricted to those generated bounds.

## Course design and generation

- Mikasa creates a private Course specification and a visible Outline from the Course inputs.
- The Course specification links the Goal, final Exercise, learning dependencies, shared examples, Lesson responsibilities, and Sources.
- The Learner can change the Outline manually, through the Tailor, or with both before approval. Each change makes the Course specification stale until approval reconciles it.
- Outline approval starts full Course generation.
- Mikasa generates Lessons in dependency order, one Module at a time.
- Every Lesson has an explanation, worked example, recall prompt, self-explanation prompt, one Exercise, and a bridge to the next Lesson.
- Mikasa reviews the complete Course for structure, factual and code accuracy, and learning design.
- Review findings trigger targeted corrections. Mikasa runs at most two correction rounds.
- Coding Courses run executable examples in an isolated sandbox before publication.
- The Course becomes readable only when every Lesson and review has passed.
- A failed build retries only failed work and preserves valid drafts.
- Lessons and Tutor answers include inline links to relevant Sources.

## Completion

- The Learner marks the Exercise done to complete a Lesson.
- The Course is complete when every Lesson is complete.
- Added Lessons start incomplete.
- Renaming, moving, or rewriting Lesson prose preserves Completion.
- Rewriting an Exercise resets that Lesson's Completion.
- Splitting or merging Lessons resets Completion for the affected Lessons.
- Removing a Lesson saves its Completion with the removed content.
- Undo restores the Completion saved with the previous Course revision.

## Tutor

- The Tutor is attached to a Course and persists its full conversation.
- It receives the current Lesson, Outline, a compact Course specification, recent messages, and relevant Lesson fragments.
- It can search the Course and the web when needed.
- It streams responses through the AI SDK agent and message interfaces.
- It cannot change the Course.
- A failed or disconnected turn can be retried. Mikasa stores only complete Tutor responses.

## Tailor

- The Tailor persists its full conversation and proposes a Change plan.
- The manual editor supports the same structure changes before and after publication. Post-publication manual changes use the same Change plan process as Tailor changes.
- A Change plan can add, remove, rename, move, split, or merge Modules and Lessons. It can also rewrite Lesson prose or an Exercise.
- The Learner accepts or discards each proposed change.
- Mikasa applies accepted changes together.
- Before full Course generation, accepted structural changes update the Outline directly.
- After publication, accepted changes create and review a staged Course revision before an atomic publication.
- Each accepted change can be undone independently when later changes have not touched the same Course parts.
- An optimistic Course version rejects conflicting edits.

## Model access

- All model calls use the AI SDK through OpenRouter.
- Mikasa chooses every model and reasoning setting. The Learner never selects a model.
- OpenRouter provider fallbacks are allowed, requested parameters are required, and provider data collection is denied.
- The application relies on the OpenRouter budget instead of adding daily per-Learner quotas.

## Brand commitments

The name "Mikasa" is fixed.

The Graphite Workspace in `DESIGN.md` is the authoritative interface direction. It uses a calm, conventional application register inspired by products such as Linear and Notion. The earlier literary Reading Room direction was rejected.

Mikasa ships graphite and paper grounds. Neither is secondary. One accent marks the Lesson the Learner is up to, and the interface uses the design tokens, layout rules, typography, and component behavior recorded in `DESIGN.md`.

The frontend mockup is the product interface, not a disposable prototype. Backend work must replace authored demo state with real behavior without redesigning the screens or weakening their interaction and accessibility rules.

No other voice or asset commitments are binding yet.

## Product principles

- The Goal shapes the Outline, Lesson sequence, Exercises, and final result.
- The Learner approves the Outline before full Course generation starts.
- The Course publishes as a cohesive unit, not as a growing set of unrelated Lessons.
- The current Course remains readable while approved changes are prepared.
- The Tutor informs. The Tailor proposes changes. Only Learner approval changes the Course.
- Backend implementation preserves the Graphite Workspace and connects its existing states to real data.

## Evidence on hand

- Domain vocabulary: `CONTEXT.md`.
- Architecture decisions: `docs/adr/0001` through `docs/adr/0008`.
- Course-generation research: `docs/research/cohesive-course-generation.md`.
- Interface direction: `DESIGN.md` and the current frontend mockup.
- There are no real Learner stories, benchmarks, testimonials, or usage claims. Future work must not invent them.

## Accessibility and inclusion

Standard web accessibility is the current baseline. `DESIGN.md` records the current interface-specific accessibility rules.
