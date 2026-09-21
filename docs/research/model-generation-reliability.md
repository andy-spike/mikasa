# Model-generation reliability constraints

Status: research input. This note records the documented contracts of the
model-generation tools used by the Course workflow. It does not change the
Course workflow's steps.

## Stack observed in the repository

| Concern                    | Installed version                   | Current use                                                                                                                                                                                 |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK Core                | `ai` 7.0.100                        | `generateText` with `Output.object` for Course design, Course specification, Lesson generation, review, correction, and reconciliation; `streamText` with tools for Tutor and Tailor turns. |
| OpenRouter AI SDK provider | `@openrouter/ai-sdk-provider` 3.0.0 | `createOpenRouter`; Course text uses `z-ai/glm-5.3-flash:nitro`, restricted to CoreWeave, Together, Fireworks, and Baseten with `require_parameters: true`. Embeddings use OpenAI.          |
| Zod                        | 4.6.1                               | Schemas passed to `Output.object` and Tailor tools.                                                                                                                                         |
| Vercel Workflow            | `workflow` 4.8.5                    | Durable Course design, Course generation, review, correction, and Course revision.                                                                                                          |
| Firecrawl                  | `firecrawl` 4.38.0                  | Optional Grounding search and Markdown page retrieval before Course design.                                                                                                                 |

The evidence comes from [package.json](../../package.json),
[lib/model.ts](../../lib/model.ts), [lib/course/design.ts](../../lib/course/design.ts),
[lib/course/generate.ts](../../lib/course/generate.ts),
[lib/course/review.ts](../../lib/course/review.ts), and the streaming routes.

## What the documented contracts mean

### 1. Treat a schema-valid model response as a parsed candidate, not a correct Course artifact

AI SDK's current structured-output API is `generateText` or `streamText` with
`Output.object({ schema })`. It uses the schema to validate the returned
object. It does not establish factual truth, Course coherence, permitted IDs,
or semantic rules that the schema does not express. The AI SDK explicitly says
that models can produce incorrect or incomplete structured data and that
schemas must be supplied and validated.

The existing workflow already follows the right broad split: Zod constrains
shape, while `validateSpecification`, `generationOrder`, `parseLessonContent`,
and review-specific checks validate Course rules. Keep that split. Do not try
to encode the whole Course invariant set in prompting or a large JSON schema.

- Sources: [AI SDK structured data guide](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [AI SDK `generateText` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text).

### 2. Make the structured-output transport contract explicit and check provider support

OpenRouter structured output requires a model/provider that supports JSON
Schema. Its documentation says to verify supported parameters on the model
page, send `response_format`, set `provider.require_parameters: true`, and use
strict mode. The current model setup already has
`provider.require_parameters: true`, which prevents routing to a provider that
does not support the requested parameters. This is a useful reliability guard.

The missing operational guard is a startup or deployment check that the chosen
model _and_ every provider in the route still advertise the required
structured-output parameter. Do that outside a learner request. If a capability
disappears, fail configuration clearly instead of discovering it midway through
a Course build.

- Sources: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [OpenRouter's AI SDK integration](https://openrouter.ai/docs/community/frameworks).

### 3. Set a bounded call policy for every model invocation

AI SDK documents `maxRetries` with a default of 2, an `abortSignal`, and
timeouts. `generateText` supports a total or per-step timeout; `streamText`
also supports a between-chunk timeout. Both return a unified finish reason:
`stop`, `length`, `content-filter`, `tool-calls`, `error`, or `other`, plus the
raw provider finish reason and provider warnings.

The Course build calls currently rely on defaults and only inspect `output`.
For each build-stage call, define one shared policy:

1. `maxRetries`: choose a small, documented value for transient HTTP failures.
2. `timeout`: set a finite total budget; streaming endpoints also need a
   finite `chunkMs` budget to detect a stalled stream.
3. accept a response only when `finishReason === "stop"`, no provider warning
   invalidates an essential requested setting, and schema plus Course-rule
   validation succeeds.
4. record `rawFinishReason`, model/provider response metadata, warnings, usage,
   and the stage attempt in the Generation run. Keep learner-facing failure
   text sanitized.
5. classify failure as retryable only when it is plausibly transient; do not
   retry an invalid Course artifact unchanged.

This is intentionally a narrow helper policy, rather than bespoke `try/catch`
blocks in each Course step. It preserves every existing workflow step while
making its success criterion consistent.

- Sources: [AI SDK `generateText` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text), [AI SDK `streamText` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), [AI SDK generating text guide](https://ai-sdk.dev/docs/ai-sdk-core/generating-text).

### 4. Do not publish or persist a partial structured output

The AI SDK documents that partial structured outputs from `streamText` cannot
be schema-validated because they are incomplete. Course build artifacts should
therefore remain non-streaming and be persisted only after the final object has
validated. This matches the existing `generateText` use for Outline, Course
specification, Lessons, review findings, and corrections.

Tutor and Tailor are correctly different: they stream interaction text and
receive the request's `AbortSignal`. Their `onEnd` handlers should only write
history after a clean completion; robust handling must also inspect the stream
finish event, rather than inferring success only from nonempty collected text.

- Sources: [AI SDK structured data guide](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [AI SDK `streamText` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text).

### 5. Separate provider routing reliability from output consistency

The configured OpenRouter route uses Nitro's throughput sorting with
`only: ["coreweave", "together", "fireworks", "baseten"]`,
`allow_fallbacks: false`, and `require_parameters: true`. It cannot route
outside the selected providers.

OpenRouter documents that provider fallback is normally enabled and that model
fallbacks can activate for rate limits, downtime, moderation refusal, and
context-length errors. It also documents that requests are billed and reported
using the model actually used. Service tiers such as Flex trade lower cost for
higher latency and lower availability; the current route does not use one.

Choose and document one of these policies for Course builds:

| Policy                                                       | Reliability effect                                          | Required safeguard                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pin a vetted provider list, no fallback outside it (current) | Stable behavior inside the list; availability bounded by it | Strong retry/timeout policy, recorded provider metadata, and a capability preflight on every listed provider.                                              |
| Permit provider fallback for the same model                  | Higher availability; provider behavior can differ           | Record actual provider/model metadata and run the same schema and Course validators.                                                                       |
| Specify compatible model fallbacks                           | Highest availability                                        | Treat a fallback model as a new output variant: capability preflight, strict schema validation, output metadata, and full Course audit before publication. |

Do not make this decision implicitly. Also budget generation time for the
chosen route; a workflow may survive a slow task, but the individual model call
still needs a timeout chosen for that route.

Historical DeepSeek measurements: an Outline draft took about three minutes
at reach and mastery Depth (183s and 190s), with 5.6k–6.9k reasoning tokens
out of 8.1k–8.8k output tokens. A later mastery call took 252.5s. With the
same mastery prompt, GLM 5.3 Flash Nitro returned valid 9-Module, 45-Lesson
Outlines in 27.8s, 26.7s, 16.3s, and 19.8s at low reasoning, and 28.3s,
31.6s, 45.4s, and 55.0s at high reasoning. Three extra requests failed
quickly during the comparison, and one later failure was confirmed as HTTP 429. These are small samples, not latency guarantees. The 600-second stage
ceilings remain until more GLM measurements cover Course specification,
Lesson writing, and review.

- Sources: [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [OpenRouter model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), [OpenRouter service tiers](https://openrouter.ai/docs/guides/features/service-tiers).

### 6. Align the two retry layers

AI SDK retries a failed provider request by default. Vercel Workflow retries a
failed step independently and persists step progress. Vercel documents default
step retries for unhandled errors, `FatalError` to stop retries, and
`RetryableError` to request retry timing. Combining the two without a policy
can multiply identical model requests.

For each Course step, assign exactly one owner for an error class:

| Failure class                                       | AI SDK request retry                     | Workflow-step retry                                                                        | Course action                                  |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Network reset, 429, transient 5xx                   | Small bounded retry                      | Bounded retry with backoff after SDK exhaustion                                            | Re-run the same idempotent stage.              |
| Timeout or stalled stream                           | No blind automatic replay after deadline | Retryable only if the stage has not committed a candidate                                  | Preserve stage/attempt metadata.               |
| `length`, content filter, invalid JSON/schema       | No identical retry                       | Retry only through a deliberate repair/re-prompt path with a changed budget or instruction | Never treat as a successful artifact.          |
| Course invariant failure                            | No                                       | One explicit reconcile/correction attempt only where the workflow already has that step    | Persist validation errors as the repair input. |
| Invalid input, missing stored record, authorization | No                                       | Fatal                                                                                      | Fail once with a safe diagnostic.              |

Existing durable checkpoints and replay-safe writes are the right foundation.
The simplification opportunity is a single error classifier at the model-call
boundary, so each workflow stage does not decide retry semantics itself.

- Sources: [Vercel Workflow error handling](https://vercel.com/academy/svelte-on-vercel/workflow-error-handling), [Vercel Workflow introduction](https://vercel.com/blog/introducing-workflow), [AI SDK `generateText` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text).

### 7. Grounding output needs the same boundary checks

Firecrawl search results and scraped Markdown are untrusted input to Course
design. The current code sensibly bounds source count and excerpts. Keep the
model's excerpt selection optional and fail closed to deterministic excerpts,
as it does now. Before a Source enters the Course specification, validate URL,
size, fetched time, and any source-ownership rules separately from model
schema validation. A model is not an authority for whether text was quoted
verbatim or whether a source supports a claim.

- Source: [Firecrawl documentation](https://docs.firecrawl.dev/).

## Concrete implementation sequence (without changing Course workflow steps)

1. Inventory every `generateText` and `streamText` call and assign it a named
   stage policy: output schema, maximum output budget, timeout, retry budget,
   and acceptable finish reasons.
2. Add one small model-call wrapper for Course-build structured calls. It
   should return a validated candidate or a typed stage failure with the
   observability fields above. Leave prompt construction and Course steps
   unchanged.
3. Preserve existing semantic validators after the wrapper. Schema validation
   is first gate; Course-specific validation remains the second gate.
4. Classify typed failures at the Vercel Workflow boundary as fatal, retryable,
   or repairable. Cap repair rounds where the workflow already caps them.
5. Add a capability preflight for the selected OpenRouter route: structured
   output support, required parameters, and reasoning option support across
   every provider in the route. Run it at deploy/startup or as an explicit
   health check, not during a Learner's Course build.
6. Capture model, provider, finish reason, raw finish reason, warnings, usage,
   timeout/abort status, and attempt number in the Generation run. Use these to
   diagnose reliability without storing prompts or private Course content in
   logs by default.
7. For Tutor and Tailor, propagate abort and timeout status to `onEnd`; persist
   a turn only when the finished stream is successful under the same explicit
   policy.

## Boundaries of this note

This research is about provider and SDK behavior. It does not claim that JSON
Schema, retries, or a successful finish reason make a Course factually correct.
Those mechanisms make malformed and interrupted output observable; the Course
specification, Source checks, deterministic validators, and bounded audit
rounds remain responsible for Course correctness.
