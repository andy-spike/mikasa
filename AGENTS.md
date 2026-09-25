<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Read when it applies

- Before implementation, read `CONTEXT.md` and use its terms exactly.
- For a GitHub Issue or its specification, read `docs/agents/issue-tracker.md` before using `gh`.
- For domain behavior or an ADR, read `docs/agents/domain.md` and the relevant `docs/adr/` files first.
- For frontend changes, read `DESIGN.md`. The Graphite Workspace is accepted. Connect real behavior without changing its screens, interactions, responsive behavior, or accessibility unless the request calls for a design change. Icons are a first-class vocabulary: reach for Lucide at 12–16px with `strokeWidth` 1.75 for a state or an affordance instead of drawing a new glyph (The Icon Rule).
- For issue triage, read `docs/agents/triage-labels.md`.
- For a schema change, read `lib/db/schema.ts` and the existing migrations. Run `pnpm db:generate`, apply the migration to dev with `pnpm db:migrate`, verify it, then apply it to production with `pnpm db:migrate:main`. Do not finish while production is behind.

## Worktree workflow

Worktrunk owns worktree lifecycle for application functionality. Use `wt` for worktree creation, discovery, navigation, integration, and removal. Leave an existing worktree on its current branch. Keep the primary worktree at `/home/andy-spike/code/mikasa` on `main`.

Documentation and agent-instruction changes that do not affect application functionality may be made directly in `main`.

Before implementing an application functionality change, run `wt list --format=json` and find the current worktree.

- When the current branch is `main`, create a task worktree with `wt -y switch --create <branch>`. Add `--base <branch>` only when the task starts from another branch. If the harness does not preserve directory changes, add `--no-cd`, then use the created worktree path from `wt list --format=json`.
- When the current branch is not `main`, it is the assigned task worktree. Implement the change there. This includes a worktree the user created before the agent started.

Let the creation hooks finish. They install dependencies and copy `.env.local`. Start the development server yourself when you need it.

Use `wt remove <branch>` for completed or abandoned worktrees. It preserves dirty or unmerged worktrees by default. Run `wt <command> --help` before using an unfamiliar Worktrunk option.

## Formatting

`pnpm format` (oxfmt) is tree-wide by design, and running it is always allowed: format the whole repository, even when it reformats files that are not part of this session's changes. That churn belongs in the same commit — never revert it, and never leave it behind for someone else. `pnpm format:check` must pass.

## Shipping to main

Only ship when the user asks to ship, deploy, or integrate a branch. Pushing `main` deploys to production.

1. Complete the schema procedure above before pushing a branch that changes `lib/db/schema.ts`.
2. From the task worktree, commit and push the work. Run `pnpm format`, `pnpm test`, `pnpm typecheck`, and `pnpm lint`. Leave `.impeccable/hook.cache.json` and dependency-install drift in `pnpm-lock.yaml` or `package.json` uncommitted.
3. Fetch `origin`. Confirm the primary worktree is clean and `main` matches `origin/main`.
4. From the task worktree, run `wt merge --no-commit --no-rebase --no-remove`. Keep the task worktree until the Codex session ends so its hooks still have a working directory. If the merge cannot fast-forward `main`, stop and ask for direction.
5. From the primary worktree, run `git push origin main`, then confirm `main` matches `origin/main`.

After the Codex session ends, remove the merged task worktree with `wt remove <branch>` from another worktree.

Never force-push `main`. Stash entries are repository-wide, so name the entry when popping it.

## Agent browser auth (Google OAuth)

Auth is Google OAuth only (`lib/auth.ts`); `/courses` and `/settings` need a session (`lib/access.ts`). Google blocks fresh logins inside agent-managed Chromium ("This browser or app may not be secure"), so never retry that — seed instead.

- Preferred: dedicated profile at `~/.profiles/mikasa` (outside the repo, never commit). Pass `--profile ~/.profiles/mikasa` (or `export AGENT_BROWSER_PROFILE=~/.profiles/mikasa`) on every `agent-browser` command, plus your own `--session` per the agent-browser skill. Verify with `open http://localhost:3000/courses`: it must stay on `/courses` and show `Sign out` / `Courses`, not redirect to `/`.
- Re-seed when expired: ask the user to log in at `http://localhost:3000` in their personal Chromium (Sign in → Google → `/courses`). Then run `agent-browser --auto-connect state save /tmp/opencode/mikasa-seed.json` (each call triggers the "Allow remote debugging?" prompt — the user must click Allow), then `agent-browser --session <own-session> --profile ~/.profiles/mikasa state load /tmp/opencode/mikasa-seed.json`, re-verify `/courses`, and delete the temp file. Do not use `--auto-connect` for anything else.
