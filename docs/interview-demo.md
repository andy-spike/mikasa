# Interview demo

Use https://mikasa-courses.vercel.app. Sign in with Google before sharing your screen.

## Before the interview

- Open the Vercel AI SDK Course. It has 12 published Lessons. The TanStack Query Course has 24 published Lessons and is a second example.
- Ask the Tutor a short question. Confirm that an answer finishes before the interview starts.
- Keep the published Course open in a second tab. Course creation takes several minutes.
- Use a desktop window at least 1280px wide to show the Outline, Lesson, and Tutor together.
- Keep API keys, environment files, and provider dashboards out of the screen share.

## Five-minute walkthrough

1. Start in Courses. Search for `Vercel` to show how a Learner finds a Course.
2. Open the Vercel AI SDK Course. Explain its Topic and Goal. Show the ordered Modules and Lessons in the Outline.
3. Open a Lesson. Point out its explanation, worked example, recall prompt, self-explanation prompt, Exercise, and Sources.
4. Ask the Tutor: `In two sentences, explain why the API key belongs on the server rather than in the browser.` Explain that the Tutor can search the Course and web but cannot change the Course.
5. Open the Tailor. Ask for a small change, such as a clearer Lesson title. Review the Change plan. Explain that the Learner must approve changes before Mikasa applies them. Discard the proposed change if it is only for the demonstration.
6. Mark an Exercise done, then use Undo. Explain that Completion records a finished Exercise.
7. Open the command palette. On mobile, show the Outline and Tutor sheets instead of the desktop rails.

If there is more time, open New Course. Show Topic, Goal, Depth, Background, Course Language, and Grounding. Explain that the Learner approves the Outline before full Course generation starts. Use the published Course to demonstrate reading while generation runs.

## Architecture talking points

- Next.js App Router handles pages, server actions, and streamed Tutor and Tailor requests.
- Better Auth provides Google OAuth. Server queries check Course ownership for the authenticated Learner.
- Neon Postgres and Drizzle store Courses, Course revisions, conversations, and Completion.
- Vercel Workflow runs durable Course design, generation, review, and approved Course revisions.
- The AI SDK uses OpenRouter. Provider fallback stays within the selected provider allowlist.
- The Tailor prepares a Change plan. A staged Course revision leaves the current Course readable until publication.
- Vitest tests domain behavior and database operations with PGlite. Tests substitute external providers.

## Prototype limits

Billing is planned. Subscriptions and credit purchases are unavailable. Pricing estimates describe the planned credit system.

Live model calls depend on provider availability and the OpenRouter budget. Preflight the Tutor before the interview. A published Course remains readable if a provider is unavailable.

## Verification on October 1, 2026

- All 268 tests pass across 33 test files.
- Type checking, lint, formatting, and the production build pass.
- Dev and production each have 22 applied migrations. No schema change was needed.
- Production Google sign-in, Course search, published Lesson reading, mobile Outline access, and Completion with Undo were verified in a real browser.
- A production Tutor failure reproduced an upstream BaseTen rate limit. Enabling provider fallback returned a successful answer through CoreWeave. The structured-output smoke check also passed with no provider capability gaps.
- Pricing purchase controls, Google sign-in error feedback, page recovery, Outline semantics, and command palette semantics were corrected on local `main`.
- The corrections still need deployment and a final production Tutor and Tailor check before the live interview demo is ready.

Automated accessibility checks found no violations on the landing page, Courses index, or the new missing-page screen. The existing Workspace had landmark defects corrected locally. Automated contrast checks on textured backgrounds and code syntax require manual review.
