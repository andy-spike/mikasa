# Implementation conventions for ticket workers

Every worker implementing a Mikasa ticket follows these rules. They exist so tickets can be built one after another without re-deciding the basics.

## Read before writing

1. `gh issue view <N>` for the ticket (plus its comments, if any).
2. `CONTEXT.md` for product vocabulary. Use those words exactly.
3. `DESIGN.md` if you touch any UI. The Graphite Workspace is accepted. Integrate, never redesign screens, interaction rules, responsive behavior, or accessibility.
4. Relevant `docs/adr/*.md` decisions.
5. `node_modules/next/dist/docs/` guides for anything Next.js related. This Next.js version has breaking changes versus older training data. Check deprecation notices.

## Stack (locked by ADRs)

- Next.js 16 App Router, TypeScript, bun (`bun run dev`, `bun run build`).
- Neon Postgres through Drizzle (`drizzle-orm`, `drizzle-kit`, `postgres` driver). Schema in one place, migrations via drizzle-kit.
- Better Auth for Google OAuth sign-in.
- OpenRouter through the AI SDK (`ai` v7 is installed) for all model calls.
- Firecrawl for web Sources.
- Vercel Workflow for durable Course work (design, generation, review, correction, approved post-ready changes). Tutor and Tailor conversations stream directly and never use Workflow.
- Vercel Sandbox for coding Topic verification.

Secrets live in `.env.local` and are already present (GOOGLE_CLIENT_ID/SECRET, BETTER_AUTH_*, DATABASE_URL, OPENROUTER_API_KEY, FIRECRAWL_API_KEY, NEON_PROJECT_ID). Never print, commit, or copy secret values. Read them only through `process.env`. A missing auth variable fails at startup: `instrumentation.ts` runs `assertAuthConfig` when the server boots.

## Code layout

- `app/` routes and pages. `components/` UI. `lib/` server logic, agents, db.
- `lib/db/schema.ts` owns the Drizzle schema. `lib/db/` owns the client and repositories.
- Domain logic goes in `lib/` as plain functions with injected dependencies so tests never need network or real services.
- Route handlers and server actions stay thin: authorize, validate, delegate to `lib/`.

## Ownership and authorization

Every query and mutation filters by the authenticated Learner. Cross-Learner access returns not-found, not an error that leaks existence.

## Testing

- Test runner: `vitest` (`bun run test`). Unit tests for pure domain logic; integration tests run the Drizzle schema on PGlite (in-process Postgres, includes pgvector) so no Docker or remote DB is needed.
- External providers are always substituted in tests: fake model (AI SDK mock model or hand-written fake), fake Firecrawl, fake Sandbox, fake embeddings. Tests must never call real APIs.
- Where a ticket says "end-to-end checks", write hermetic integration tests that exercise the route handler or server action plus the database on PGlite, with substituted providers. The orchestrator does real-browser verification separately.
- Durable work: keep step bodies as plain functions taking explicit inputs and returning explicit outputs. Test those directly. The workflow wrapper stays thin. If Vercel Workflow cannot execute locally in this environment, test the step functions and document the limitation in the commit message.
- `bun run typecheck` (tsc --noEmit) and `bun run lint` must pass. Run the full test suite before committing.

## Git

- Commit to the current branch (`services`). One commit per ticket, message format: `feat: <what> (#N)`. Include schema migrations and any new env var names in the body (names only, never values).
- Do not close the issue; the orchestrator closes it after verification.
- Do not modify `.env.local`, `vercel.json`, or the design of existing screens.
