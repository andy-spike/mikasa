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

## Shipping to main

Pushing `main` deploys to production. There is no CI and no PR process, so the agent merges locally whenever the user says to ship a branch onto main.

Worktree layout: `main` is checked out in the linked worktree at `/home/andy-spike/code/mikasa`. This worktree holds the work branches. Never check out `main` here. Run every merge step over there with `git -C /home/andy-spike/code/mikasa`.

1. On the work branch: everything committed and pushed, with `pnpm test`, `pnpm typecheck`, and `pnpm lint` green. Leave local-only churn uncommitted, never ship it: `.impeccable/hook.cache.json` and dependency install drift in `pnpm-lock.yaml` / `package.json`.
2. In the main worktree: stash any local drift, `git fetch origin`, then `git merge --ff-only <branch>`. Main must be strictly behind the work branch. If it is not a fast-forward, stop and ask instead of forcing anything.
3. `git push origin main`. That push is the deploy. Confirm main matches origin/main afterwards.
4. Come back to the work branch.

Never `push --force` to main. Stash refs are shared between the two worktrees, so always pop by name (`git stash pop stash@{n}`), never a bare `pop`.
