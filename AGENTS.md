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

## Worktrees

Worktrunk owns every worktree in this repository. Use `wt` for worktree creation, discovery, navigation, integration, and removal in every agent harness. Do not use `git worktree` or change the branch inside an existing worktree.

- Keep the primary worktree at `/home/andy-spike/code/mikasa` on `main`.
- Inspect current worktrees with `wt list`. Use `wt list --format=json` when a tool needs a worktree path.
- Create a task worktree with `wt -y switch --create <branch>`. `-y` authorizes the repository's setup hooks in non-interactive agent shells. Add `--base <branch>` only when the task must start somewhere other than the default branch.
- If the harness does not preserve directory changes, use `wt switch --create --no-cd <branch>`, read the new path from `wt list --format=json`, and set that path as the working directory for later commands.
- Let the configured `pre-start` hooks finish. They install dependencies and copy `.env.local` from the primary worktree.
- The configured `post-start` hook starts a tethered Next.js development server. Use `wt list` to find its URL. Task worktrees use ports 3001 through 3010, which are registered as Google OAuth callback URLs.
- Use `wt list` to find the worktree's URL. If its server stopped, run `wt hook post-start -y project:server` inside that worktree. Do not choose a port by hand.
- Return to an existing worktree with `wt switch <branch>`. Use `wt switch ^` for the default branch worktree.
- Remove completed or abandoned worktrees with `wt remove <branch>`. Worktrunk refuses dirty worktrees and unmerged branches by default. Treat that refusal as a safety check. Use force flags only when the user explicitly asks to discard the affected work.
- Use `wt merge --no-commit --no-rebase` for a prepared, committed branch when the user asks to integrate it locally. This preserves the branch commits, requires a fast-forward, and removes the task worktree after the merge.

Run `wt <command> --help` before using an unfamiliar option. The repository configuration is in `.config/wt.toml`.

## Shipping to main

Pushing `main` deploys to production. There is no CI and no PR process, so the agent integrates locally whenever the user says to ship a branch onto main. Work in a Worktrunk task worktree. Never commit work directly to `main`.

1. On the work branch: everything committed and pushed, with `pnpm test`, `pnpm typecheck`, and `pnpm lint` green. Leave local-only churn uncommitted, never ship it: `.impeccable/hook.cache.json` and dependency install drift in `pnpm-lock.yaml` / `package.json`.
2. If the branch changes `lib/db/schema.ts`: apply the new migrations to both databases before the push, `pnpm db:migrate` for dev and then `pnpm db:migrate:main` for production.
3. Fetch `origin`. Confirm the primary worktree is clean and its `main` has not diverged from `origin/main`.
4. From the task worktree, run `wt merge --no-commit --no-rebase`. If Worktrunk cannot fast-forward `main`, stop and ask instead of rewriting or forcing anything.
5. In the primary worktree, run `git push origin main`. That push is the deploy. Confirm `main` matches `origin/main` afterwards.

Never push-force to `main`. Stash entries are repository-wide, so pop by name (`git stash pop stash@{n}`), never a bare `pop`.
