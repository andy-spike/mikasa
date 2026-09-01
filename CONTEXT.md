# Mikasa

Mikasa creates a cohesive Course for one Topic and Goal. It gives a Learner a guided route from their Background to a concrete result.

## Language

**Learner**:
The person who owns and studies a Course.
_Avoid_: user, student, customer

**Topic**:
The subject a Learner wants to learn, such as "the Vercel AI SDK".
_Avoid_: subject, theme

**Goal**:
The result the Learner wants to produce by the end of a Course, such as "build my own AI chat app".
_Avoid_: objective, aim, purpose

**Course**:
A private curriculum for one Topic and Goal. It contains ordered Modules and Lessons.
_Avoid_: track, path, learning path

**Course Language**:
The language used for a Course and its conversations. It does not change after Course creation.
_Avoid_: locale, output language

**Depth**:
How far a Course goes beyond its Goal: reach the Goal, gain working knowledge, or reach mastery.
_Avoid_: size, level, length

**Background**:
What the Learner already knows before starting a Course.
_Avoid_: skill level, experience, prerequisites

**Grounding**:
Whether Course creation uses current Sources beyond the model's built-in knowledge. The Learner chooses it when creating a Course.
_Avoid_: research, browsing, RAG

**Course specification**:
The private plan that links the Goal, Outline, Lessons, Exercises, and Sources before Lesson content is written. A Learner does not edit it directly.
_Avoid_: curriculum plan, generation plan, hidden outline

**Outline**:
The visible structure of a Course. It contains Module and Lesson titles with short summaries.
_Avoid_: syllabus, curriculum, table of contents

**Module**:
An ordered group of Lessons that covers one area of a Topic.
_Avoid_: chapter, section

**Lesson**:
One unit of study with an explanation, worked example, recall prompt, self-explanation prompt, Exercise, and bridge to the next Lesson.
_Avoid_: page, article, unit

**Exercise**:
The single practice activity at the end of a Lesson. Completing it moves the Learner toward the Goal.
_Avoid_: assignment, quiz, task

**Source**:
An external reference used to support a Course or a Tutor answer.
_Avoid_: citation, search result, evidence item

**Tutor**:
The conversation attached to a Course. It answers questions using Course content and web search but cannot change the Course.
_Avoid_: course chat, assistant, sidebar

**Tailor**:
The conversation that proposes changes to a Course. It cannot apply a change without the Learner's approval.
_Avoid_: editor, editor agent, course chat

**Change plan**:
An ordered set of Course changes prepared by the Tailor or the manual editor. The Learner reviews the changes before Mikasa applies the accepted set together.
_Avoid_: patch, edit list, mutation plan

**Course revision**:
A complete version of a Course that can be prepared while the current version remains readable, then published as one change.
_Avoid_: snapshot, draft version, content version

**Undo**:
Reversing one published Change plan. Available while no later change has touched the same Lessons or Modules; it puts those Lessons' shape, content, and Completion back to what the plan's base revision had, and leaves every other Lesson where later changes put it.
_Avoid_: rollback, revert, restore

**Completion**:
The Learner's record that an Exercise is done. A Lesson is complete when its Exercise is done, and a Course is complete when every Lesson is complete.
_Avoid_: progress flag, done state
