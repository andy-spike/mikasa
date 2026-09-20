# Model change checklist

Use this checklist before changing a model in `MODEL_PROFILES`.

1. Add representative valid and invalid outputs to the stored contract corpus when a model exposes a new edge case.
2. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
3. Run `pnpm model:smoke` with the intended provider credentials.
4. Confirm the preflight uses the intended provider and model.
5. Confirm structured output succeeds with no warnings.
6. Compare duration, provider-call count, input tokens, and output tokens with the current model.
7. Exercise one Course at each Depth. Check Outline bounds, Lesson shape, Source refs, and review corrections.
8. Inspect structured-generation failures by stage. Do not promote a model with more invalid output, truncation, filtering, timeouts, or provider failures.
9. Record the comparison in the pull request. Change `MODEL_PROFILES` only after the checks pass.

Structured-generation diagnostics contain stage, outcome, timing, provider-call count, finish reason, provider, model, token usage, and failure type. They do not contain prompts, model output, Lesson text, or Source excerpts.
