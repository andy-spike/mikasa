<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Interface design

Read `DESIGN.md` before changing any frontend code. The current Graphite Workspace mockup is the accepted product interface. Connect it to real data and behavior without redesigning its screens, interaction rules, responsive behavior, or accessibility unless the user asks for a design change.

## Agent skills

### Issue tracker

Issues and specifications live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the default engineering skill labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.

## Databases

Two Neon Postgres branches back the repository: dev for daily work and production for the deployed app. Drizzle owns the schema in `lib/db/schema.ts`, migrations live in `drizzle/`, and the connection strings sit in `.env.local` (`DATABASE_URL_DEV`, `DATABASE_URL_MAIN`).

- `pnpm db:generate` writes a migration from schema changes.
- `pnpm db:migrate` applies pending migrations to the dev database.
- `pnpm db:migrate:main` applies pending migrations to the production database. The production command is the one with `main` in its name.

Both databases must be current after a schema change. Apply to dev first, verify, then apply to production. Do not finish a task with migrations that production has not seen.

## Shipping to main

Pushing `main` deploys to production. There is no CI and no PR process, so the agent merges locally whenever the user says to ship a branch onto main.

Worktree layout: `main` is checked out in the linked worktree at `/home/andy-spike/code/mikasa`. This worktree holds the work branches. Never check out `main` here. Run every merge step over there with `git -C /home/andy-spike/code/mikasa`.

1. On the work branch: everything committed and pushed, with `pnpm test`, `pnpm typecheck`, and `pnpm lint` green. Leave local-only churn uncommitted, never ship it: `.impeccable/hook.cache.json` and dependency install drift in `pnpm-lock.yaml` / `package.json`.
2. If the branch changes `lib/db/schema.ts`: apply the new migrations to both databases before the push, `pnpm db:migrate` for dev and then `pnpm db:migrate:main` for production.
3. In the main worktree: stash any local drift, `git fetch origin`, then `git merge --ff-only <branch>`. Main must be strictly behind the work branch. If it is not a fast-forward, stop and ask instead of forcing anything.
4. `git push origin main`. That push is the deploy. Confirm main matches origin/main afterwards.
5. Come back to the work branch.

Never `push --force` to main. Stash refs are shared between the two worktrees, so always pop by name (`git stash pop stash@{n}`), never a bare `pop`.
