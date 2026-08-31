# Cohesive Course generation

Status: research input. `CONTEXT.md`, `PRODUCT.md`, and the ADRs record accepted product and architecture decisions.

## Recommendation

Build a Course as one **Course build**. Do not treat an Outline as a list of
independent prompts that happen to share a Topic. The build should first make
one durable Course specification, then create every Lesson from that shared
specification, audit the complete Course, revise the affected Lessons, and only
then publish the Course to the Learner.

That does **not** mean putting an entire Course in one model response. A single
very large prompt makes failures hard to isolate and correct. It means one
orchestrated build with one source of truth and a final, Course-wide gate. The
Course specification and the audit records are the durable context that let the
generator behave like a coding agent working from a codebase.

This is a design synthesis. The learning claims below come from the original
sources linked in the evidence section. No source establishes that an LLM can
reliably create a coherent Course on its own.

## Pedagogical method

Use backward design expressed through constructive alignment:

1. Turn the Learner's **Goal** into a small set of observable terminal
   performances. For a technical Course, these should be things the Learner can
   build, diagnose, explain, or change.
2. Define the final **Exercise** as evidence of that Goal. Give it constraints,
   acceptance checks, and the concepts and techniques it requires.
3. Create a prerequisite graph from the final Exercise backwards. Each node
   states what a Learner must be able to do, not merely a topic to mention.
4. Group a contiguous part of that graph into each **Module**. Every Module has
   one milestone that moves the Learner's work toward the final Exercise.
5. Make every **Lesson** introduce or strengthen a small, named part of the
   graph. Its explanation, worked example, practice, and **Exercise** must all
   serve that Lesson's stated performance.
6. Sequence from supported examples to increasingly independent work. Reuse a
   small number of running examples, vocabulary, conventions, and artefacts
   across Modules. The Learner should extend one coherent mental model and,
   where appropriate, one coherent codebase.
7. Require active recall and explanation, not only reading. Each Lesson should
   include a short retrieval prompt and a prompt asking the Learner to explain a
   key choice, prediction, or failure mode. The Exercise remains the single
   substantive task defined by Mikasa.
Biggs's constructive alignment supplies the spine: intended performance,
learning activity, and assessment must agree. [Biggs (1996)](https://doi.org/10.1007/BF00138871)
Merrill independently frames instruction around progressively more complex
whole problems, activation of prior knowledge, demonstration, application, and
integration. [Merrill (2002)](https://doi.org/10.1007/BF02505024)
Together they fit a Goal-shaped, text-based technical Course particularly well.

## The Course specification

Generate and persist this specification before drafting prose. It is the
authoritative context for every later call, not a Learner-facing document.

| Part | Required content | Why it prevents drift |
| --- | --- | --- |
| Course contract | Topic, Goal, Background, Depth, language, Learner assumptions, exclusions, and terminal performances | Keeps scope and difficulty stable. |
| Learning graph | Skills and concepts; prerequisite and dependency links; each link's rationale | Makes it possible to detect a Lesson that uses an idea too early. |
| Alignment map | For every Lesson: performance, prerequisite nodes, Module milestone, Exercise contribution, and final-Exercise contribution | Lets an audit verify that every Lesson earns its place. |
| Throughline | One running problem, project, dataset, codebase, or scenario; vocabulary, notation, API/version assumptions, and recurring examples | Prevents every Lesson from starting over with unrelated examples. |
| Lesson contract | The fixed Lesson shape: motivation, explanation, worked example, guided practice, retrieval/self-explanation prompt, Exercise, and bridge forward | Gives every Lesson the same teaching grammar without making the prose repetitive. |
| Evidence ledger | Grounding sources and date, plus claims they support | Supports factual correction without changing the teaching structure. |

The Learner may approve the **Outline**, but the Course build should also
materialize these hidden artifacts. The Outline alone is too thin to carry
cohesion through a complete Course.

## Course build and audit loop

Use a bounded, tool-checkable loop. The generator must receive the Course
specification and the relevant neighbouring Lesson contracts; the auditor must
receive the whole alignment map, all Lesson summaries, and the Course text or
retrievable slices of it.

```text
Goal + Background + Depth
        ↓
Course specification → Learner approves Outline
        ↓
draft every Lesson against its Lesson contract
        ↓
structural audit → factual/code audit → learning-design audit
        ↓                         ↑
revise only affected Lessons ─────┘ (at most two revision rounds)
        ↓
publish complete Course
```

The three audits have separate jobs:

- **Structural audit:** every prerequisite is introduced before use; every
  Module advances the Course; no duplicate, orphaned, or missing learning-graph
  node; the final Exercise is feasible from the Course alone.
- **Factual and code audit:** claims match the evidence ledger; code has one
  chosen runtime/version and is executable or clearly marked illustrative;
  references are current when Grounding is enabled.
- **Learning-design audit:** every Lesson aligns to its performance; worked
  examples precede unsupported problem solving for unfamiliar material;
  Exercises progress toward the Goal; retrieval and self-explanation prompts
  are present; cognitive load is kept local by avoiding unrelated concepts in a
  single Lesson.

The first pass should produce structured audit findings with stable IDs,
severity, evidence, and an allowed repair scope. A later revision receives only
the findings and the affected Course context. Re-run the audits after revision,
but cap the loop at two passes. If blocking findings remain, mark the Course
build failed with sanitized retryable context and keep the Course candidate
unavailable to the Learner. This avoids an unbounded agent loop and makes
failures inspectable.

For coding Topics, make the throughline a small repository specification:
starting state, final state, file tree, commands, dependencies, environment,
and tests. Each Lesson changes that shared state. The Course build can then run
the commands and tests as external feedback. This is materially stronger than
asking a model whether its own snippets "look correct."

## Implications for Mikasa

- **Outline:** generate it from the learning graph and alignment map. Show
  Module names, Lesson titles, summaries, and milestones to the Learner; keep
  the graph and contracts private implementation data.
- **Lesson:** store both the rendered Markdown and its Lesson contract. Do not
  allow a Tailor change to replace prose without re-running the affected
  structural and learning-design checks.
- **Exercise:** make it a deliberate piece of the final Goal-shaped artefact,
  not a loosely related end-of-Lesson question. The final Exercise combines the
  preceding ones.
- **Tutor:** answer from the Course specification, the Learner's current
  Lesson, and generated Lesson content. It can explain a prerequisite or
  suggest practice, but must not silently alter the Course contract.
- **Tailor:** treat a requested change as a patch to the Course specification
  first. Recompute affected Lesson contracts, show the Learner the Change plan,
  then regenerate and audit only the affected slice. A change that alters the
  Goal, throughline, or dependency graph should require a Course-wide rebuild.
- **Generation boundary:** preserve the existing Learner approval point at the
  Outline. After approval, generate all Lessons as a single Course build and
  withhold partial publication until the audit passes. This achieves the
  integrated experience without requiring one enormous model call.

## Evidence and limits

- Worked examples can support schema acquisition and transfer in technical
  problem solving. [Cooper & Sweller (1987)](https://doi.org/10.1037/0022-0663.79.4.347)
  and [Sweller (1988)](https://doi.org/10.1207/s15516709cog1202_4) support the
  recommendation to demonstrate before asking novices to solve a new kind of
  problem unaided.
- Learners who generated more self-explanations while studying worked examples
  built more example-independent knowledge in the original mechanics study.
  [Chi et al. (1989)](https://doi.org/10.1207/s15516709cog1302_1)
- In the original prose-learning experiments, retrieval practice produced
  stronger delayed retention than repeated study, even when repeated study
  produced higher confidence. [Roediger & Karpicke (2006)](https://doi.org/10.1111/j.1467-9280.2006.01693.x)
- Bloom's original mastery-learning proposal calls for explicit expectations,
  formative feedback, corrective instruction, and sufficient time rather than
  a fixed pace. [Bloom (1968)](https://eric.ed.gov/?id=ED053419)
- Iterative LLM refinement has shown improvements on several non-educational
  generation tasks. [Madaan et al. (2023)](https://arxiv.org/abs/2303.17651)
  Tool-backed critique is more credible for verifiable claims and code than
  unaided self-critique. [Gou et al. (2023)](https://arxiv.org/abs/2305.11738)
  A direct study of planning found same-model self-critique unreliable compared
  with an external sound verifier. [Valmeekam et al. (2023)](https://arxiv.org/abs/2310.08118)

Therefore, use the model for drafting and targeted criticism, but use explicit
course invariants, source checks, and executable checks as the authority. Do
not represent the audit as proof that the Course is pedagogically effective;
Mikasa will still need Learner research and outcome measurement.
