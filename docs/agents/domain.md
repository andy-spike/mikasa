# Domain docs

This is a single-context repository.

## Before exploring

Read `CONTEXT.md` before working in the repository. Use the terms it defines.

Read the ADRs in `docs/adr/` that affect the area being changed. If a file does not exist, continue without creating it.

## Layout

- `CONTEXT.md` defines Mikasa's domain language.
- `docs/adr/` records hard-to-reverse architecture decisions.

## Vocabulary

Use the exact domain terms from `CONTEXT.md` in issue titles, specifications, tests, code, and documentation.

Do not replace a defined term with one of its avoided synonyms. If a required concept is missing, reconsider the new term or handle it through domain modeling.

## ADR conflicts

Call out any proposal that contradicts an ADR. Do not silently override an existing decision.
