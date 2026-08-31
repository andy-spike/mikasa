# Mikasa

Mikasa generates structured courses from a topic and a goal, so a learner goes from fundamentals to a concrete outcome without piecing it together from chat conversations.

## Language

**Topic**:
The subject a learner wants to learn about, e.g. "the Vercel AI SDK".
_Avoid_: subject, theme

**Goal**:
The outcome the learner wants by the end, e.g. "build my own AI chat app". Shapes where the curriculum ends and what the final exercise asks for.
_Avoid_: objective, aim, purpose

**Course**:
A generated curriculum for one Topic and one Goal, organized into Modules. Owned privately by the user who created it.
_Avoid_: track, path, learning path

**Module**:
A group of Lessons covering one area of the Topic, e.g. "streaming responses".
_Avoid_: chapter, section

**Lesson**:
One unit of study: prose explanation in easygoing language, runnable code examples, and one Exercise. The unit of progress tracking.
_Avoid_: page, article, unit

**Exercise**:
The single task at the end of a Lesson that steps toward the Goal. Self-marked as done by the learner.
_Avoid_: assignment, quiz, task

**Outline**:
The skeleton of a Course: its Modules and Lesson titles with one-line summaries. The learner shapes it before Lesson content is generated, by editing it manually, by talking to the Tailor, or both.
_Avoid_: syllabus, curriculum, table of contents

**Depth**:
The learner's choice of how far past the Goal to go: just enough to reach it, solid working knowledge, or deep mastery. Maps internally to module and lesson bounds the learner never sees.
_Avoid_: size, level, length

**Background**:
The optional statement of what the learner already knows, given at creation so the Outline can skip familiar fundamentals.
_Avoid_: skill level, experience, prerequisites

**Grounding**:
Whether generation consults live web search or draws on the model's knowledge alone. On by default, toggleable per course at creation.
_Avoid_: research, browsing, RAG

**Tutor**:
The conversation attached to a Course, grounded in its generated Lesson content plus web search. Answers questions, does not change the Course.
_Avoid_: course chat, assistant, sidebar

**Tailor**:
The agent that applies requested changes to a Course's structure or Lesson content on the learner's instruction. Distinct from the Tutor.
_Avoid_: editor, editor agent, course chat

**Default model**:
The capable mid-tier model used for most generation jobs: the Outline, the Tutor, and the Tailor. Selected by default wherever a model runs.
_Avoid_: mid-tier model, cheap model

**Strong model**:
The most capable model, used for Lesson generation and available as an opt-in upgrade in Tailor mode for large course changes.
_Avoid_: premium model
