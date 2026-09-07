# Mikasa

Mikasa builds a complete Course for one Topic and Goal. A Learner approves the Outline first, then Mikasa generates and reviews the whole Course. The Learner works through Lessons, each ending in one Exercise. The Tutor answers questions. The Tailor proposes changes, and only Learner approval applies them.

Domain terms (Learner, Tutor, Tailor, Change plan) are defined in `CONTEXT.md`. Product rules live in `PRODUCT.md`, the interface direction in `DESIGN.md`, and architecture decisions in `docs/adr/`.

## Stack

Next.js (App Router), React, TypeScript, Tailwind. Postgres on Neon with Drizzle. Better Auth with Google OAuth. All model calls run through the AI SDK on OpenRouter. Durable course generation runs on Vercel Workflows. Coding lessons run in an isolated Vercel Sandbox before publication. Web search uses Firecrawl.

## Setup

Copy `.env.example` to `.env.local` and fill in the values. Auth vars are required at boot.

```bash
bun install
bun run dev
```

Open http://localhost:3000.

## Runtime note

The Next.js scripts use Node.js. Bun's fetch ignores Workflow's Undici dispatcher and times out local queue requests after five minutes, which course generation can exceed. Use `bun run dev` for the dev server. Bun is fine for installing packages and other scripts.

`node tests/workflow-queue.check.mjs` checks a queue request lasting 310 seconds. Bun 1.4.0 fails it with a TimeoutError.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Development server |
| `bun run build` | Production build |
| `bun run lint` / `lint:fix` | Oxlint |
| `bun run format` / `format:check` | Oxfmt |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest |

## Database

Two Neon Postgres branches: dev for daily work, main for production.

| Command | Effect |
| --- | --- |
| `bun run db:generate` | Generate migrations with drizzle-kit |
| `bun run db:migrate` | Apply migrations to dev |
| `bun run db:migrate:main` | Promote to main after dev is verified |
