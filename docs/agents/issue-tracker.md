# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub Issues. Use the `gh` CLI for all operations.

## Conventions

- Create an issue with `gh issue create`.
- Read an issue and its comments with `gh issue view <number> --comments`.
- List issues with `gh issue list`.
- Comment with `gh issue comment <number>`.
- Apply or remove labels with `gh issue edit`.
- Close an issue with `gh issue close`.

Infer the repository from the Git remote. The GitHub CLI is installed and authenticated for `andy-spike/mikasa`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub Issues are the request and planning surface. Pull requests are not added to the triage queue.

## Publishing work

When a skill says "publish to the issue tracker", create a GitHub Issue.

When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`.

## Dependencies

Use GitHub's native issue dependencies for blocking relationships. If native dependencies are unavailable, put `Blocked by: #<number>` near the top of the blocked issue.

A ticket is ready only when all its blocking issues are closed.
