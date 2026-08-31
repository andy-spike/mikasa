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
