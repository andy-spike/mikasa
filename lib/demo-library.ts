/**
 * The learner's Depth choices, as the creation screen offers them.
 *
 * The rest of this file was mockup scaffolding — a synthetic library and a
 * fake Tailor plan for the Outline demonstration. The Tailor's plans are
 * real since ticket #12; the scaffolding went with them.
 */

/** The three Depth choices, in the order they are offered at creation. */
export const depths = [
  {
    id: "reach",
    title: "Just enough to reach the Goal",
    detail: "The shortest line from where you are to the outcome. Nothing beside the point.",
  },
  {
    id: "working",
    title: "Solid working knowledge",
    detail: "The Goal, plus the surrounding ground you need to keep using this without a reference open.",
  },
  {
    id: "mastery",
    title: "Deep mastery",
    detail: "Past the Goal into the edges: the internals, the failure modes, the arguments.",
  },
] as const;
