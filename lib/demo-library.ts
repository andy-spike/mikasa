/**
 * The learner's Courses, for every screen outside the workspace.
 *
 * Synthetic, like demo-course: no real learner, no real usage data. The SQL
 * Course is the one with Lesson content generated; the other two sit at the
 * checkpoint the product is built around — Outline generated, nothing paid
 * for yet — which is why they open on the Outline and not on a Lesson.
 */

import {
  addedFrames,
  course,
  splitTies,
  tailorPlan,
  type Lesson,
  type Module,
  type TailorChange,
} from "./demo-course";

export type Phase = "reading" | "outline";

/**
 * A Tailor change, plus what approving it does to the Outline.
 *
 * The panel only ever showed the prose; the Outline screen has to actually
 * move the Lessons, so the operation rides along with the sentence that
 * describes it and one function applies any plan (ADR 0001: the Outline is
 * always base + approved changes, so dropping one restores the shape).
 */
export type PlanOp =
  | { kind: "add"; after: string; lesson: Lesson }
  | { kind: "split"; at: string; into: Lesson[] }
  | { kind: "move"; from: string; after: string };

export type PlanChange = TailorChange & { op: PlanOp };

export type LibraryCourse = {
  id: string;
  topic: string;
  goal: string;
  depth: string;
  background: string;
  grounding: boolean;
  /** "outline": the Outline exists and no Lesson has been generated. */
  phase: Phase;
  createdOn: string;
  openedOn: string;
  modules: Module[];
  /** What the Tailor has drafted and is waiting on. */
  plan: PlanChange[];
};

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

const outlineOnly = (
  id: string,
  title: string,
  summary: string,
  minutes: number,
): Lesson => ({ id, title, summary, minutes, status: "unset" });

const rustModules: Module[] = [
  {
    numeral: "I",
    title: "Values and who owns them",
    lessons: [
      outlineOnly("r1", "One owner, always", "Why every value has exactly one name responsible for it, and what that buys.", 8),
      outlineOnly("r2", "Moves, not copies", "What actually happens on assignment, and why the old name stops working.", 9),
      outlineOnly("r3", "Copy, Clone, and the cost of each", "The two escape hatches, when each is honest, and when it is a shrug.", 10),
      outlineOnly("r4", "Drop and the end of a scope", "Where a value goes when its owner is finished with it.", 7),
    ],
  },
  {
    numeral: "II",
    title: "Borrowing",
    lessons: [
      outlineOnly("r5", "Reading without taking", "Shared references, and the rule that makes them free.", 9),
      outlineOnly("r6", "One writer at a time", "Mutable references, and the error you will see most often.", 11),
      outlineOnly("r7", "Why the compiler says two things overlap", "Reading the borrow checker's message as a claim about time, not about code.", 12),
      outlineOnly("r8", "Splitting a borrow", "Getting at two fields of the same struct at once, legitimately.", 10),
    ],
  },
  {
    numeral: "III",
    title: "Lifetimes, only where they show up",
    lessons: [
      outlineOnly("r9", "The lifetime you never wrote", "Elision: the three rules that hide annotations from you.", 9),
      outlineOnly("r10", "When a signature needs one", "The exact shape of function that forces you to name a lifetime.", 11),
      outlineOnly("r11", "Structs that hold references", "The annotation on a type, and why it spreads.", 10),
      outlineOnly("r12", "'static, and what it does not mean", "The lifetime everyone reaches for by mistake.", 8),
    ],
  },
  {
    numeral: "IV",
    title: "The patterns that stop the fight",
    lessons: [
      outlineOnly("r13", "Own it at the edge, borrow inside", "The single structural habit that removes most borrow errors from a CLI.", 12),
      outlineOnly("r14", "Rc, RefCell, and the price of each", "Moving a check from compile time to run time, deliberately.", 12),
      outlineOnly("r15", "Restructuring a fight you cannot win", "Three refactors that turn a borrow error into a different program.", 14),
    ],
  },
];

const k8sModules: Module[] = [
  {
    numeral: "I",
    title: "What a cluster actually runs",
    lessons: [
      outlineOnly("k1", "Containers, Pods, and the gap between them", "Why the unit you deploy is not the unit you built.", 9),
      outlineOnly("k2", "The control loop", "Desired state, observed state, and the only idea Kubernetes really has.", 10),
      outlineOnly("k3", "Reading a manifest", "The four fields every object has, and where the rest comes from.", 8),
      outlineOnly("k4", "kubectl as a debugger", "get, describe, logs, exec — the loop you will live in.", 11),
    ],
  },
  {
    numeral: "II",
    title: "Getting one service in",
    lessons: [
      outlineOnly("k5", "A Deployment for your API", "Replicas, rollouts, and what happens when you change the image.", 12),
      outlineOnly("k6", "Services and cluster DNS", "How one Pod finds another without knowing its address.", 10),
      outlineOnly("k7", "Getting traffic from outside", "Ingress, load balancers, and which one your provider gives you.", 12),
      outlineOnly("k8", "Health checks that mean something", "Liveness and readiness, and the outage caused by confusing them.", 11),
    ],
  },
  {
    numeral: "III",
    title: "Config, secrets and storage",
    lessons: [
      outlineOnly("k9", "ConfigMaps and env", "Getting settings in without rebuilding the image.", 8),
      outlineOnly("k10", "Secrets, and what they are not", "Base64 is not encryption; here is what to do about it.", 9),
      outlineOnly("k11", "Volumes for a stateless service", "The three you will still need even with the database elsewhere.", 9),
      outlineOnly("k12", "Requests, limits, and getting evicted", "Sizing one service so the scheduler keeps it.", 12),
    ],
  },
  {
    numeral: "IV",
    title: "Keeping it up",
    lessons: [
      outlineOnly("k13", "Rolling out without dropping a request", "Surge, unavailable, and the terminationGracePeriod nobody sets.", 12),
      outlineOnly("k14", "Reading a CrashLoopBackOff", "The five causes, in the order to check them.", 11),
      outlineOnly("k15", "Scaling on something real", "HPA against a metric that reflects your traffic.", 11),
      outlineOnly("k16", "What to watch, and what to ignore", "The short list of signals for one service and no platform team.", 10),
    ],
  },
];

export const library: LibraryCourse[] = [
  {
    id: course.id,
    topic: course.topic,
    goal: course.goal,
    depth: course.depth,
    background: course.background,
    grounding: course.grounding,
    phase: "reading",
    createdOn: course.startedOn,
    openedOn: "28 AUG 2026",
    modules: course.modules,
    plan: withOps(tailorPlan, {
      c1: { kind: "add", after: "l7", lesson: addedFrames },
      c2: { kind: "split", at: "l12", into: splitTies },
      c3: { kind: "move", from: "l19", after: "l4" },
      c4: {
        kind: "add",
        after: "l14",
        lesson: outlineOnly("l14b", "Percent change, and the zero underneath it", "NULLIF, and why a null is the honest answer.", 9),
      },
      c5: { kind: "move", from: "l17", after: "l8" },
      c6: {
        kind: "split",
        at: "l16",
        into: [
          outlineOnly("l16a", "Gaps and islands, the trick", "Subtract a row number from a date and read what stays constant.", 9),
          outlineOnly("l16b", "The streak report", "Start, end, length, and the one edge case that breaks it.", 9),
        ],
      },
    }),
  },
  {
    id: "rust-ownership",
    topic: "Rust ownership and borrowing",
    goal: "Get my CLI tool compiling without fighting the borrow checker every afternoon",
    depth: "Just enough to reach the Goal",
    background:
      "I have written a few thousand lines of Go. I can read Rust, and I can usually make the error go away without knowing why it went away.",
    grounding: true,
    phase: "outline",
    createdOn: "27 AUG 2026",
    openedOn: "27 AUG 2026",
    modules: rustModules,
    plan: [
      {
        id: "rc1",
        verb: "add",
        entry: "After Lesson 7",
        detail: "A Lesson on reading the borrow checker's spans",
        reason: "Your Background says the errors go away without you knowing why. The spans are where the why is.",
        op: {
          kind: "add",
          after: "r7",
          lesson: outlineOnly(
            "r7b",
            "Reading the spans in a borrow error",
            "The two underlines in the message, and what each one is claiming.",
            10,
          ),
        },
      },
      {
        id: "rc2",
        verb: "move",
        entry: "Lesson 13",
        detail: "Own it at the edge, borrow inside — earlier",
        reason: "It is the habit that prevents Module II's errors rather than explaining them afterwards.",
        op: { kind: "move", from: "r13", after: "r4" },
      },
      {
        id: "rc3",
        verb: "split",
        entry: "Lesson 10",
        detail: "Separate the signature rule from the worked examples",
        reason: "Eleven minutes is two Lessons here; the rule is short and the examples are not.",
        op: {
          kind: "split",
          at: "r10",
          into: [
            outlineOnly("r10a", "The rule that forces an annotation", "One paragraph, one signature, no examples yet.", 5),
            outlineOnly("r10b", "Four signatures that need one", "The same rule against real functions from a CLI.", 9),
          ],
        },
      },
      {
        id: "rc4",
        verb: "add",
        entry: "After Lesson 2",
        detail: "A Lesson on what Copy actually costs",
        reason: "You come from Go, where a copy is the default. The habit is worth naming before Module II leans on it.",
        op: {
          kind: "add",
          after: "r2",
          lesson: outlineOnly("r2b", "Why a move is not a copy", "What the compiler does instead, and what it refuses to do for you.", 8),
        },
      },
      {
        id: "rc5",
        verb: "split",
        entry: "Lesson 6",
        detail: "Separate the rule from the error messages",
        reason: "One writer at a time is a sentence. The errors it produces are a Lesson of their own.",
        op: {
          kind: "split",
          at: "r6",
          into: [
            outlineOnly("r6a", "One writer at a time", "The rule, and the two lines of code that break it.", 6),
            outlineOnly("r6b", "The four errors it produces", "Each message, what it is claiming, and the smallest fix.", 9),
          ],
        },
      },
      {
        id: "rc6",
        verb: "move",
        entry: "Lesson 15",
        detail: "Restructuring a fight you cannot win — after Module II",
        reason: "It is the escape hatch for the errors in Module II, and it arrives three Modules too late.",
        op: { kind: "move", from: "r15", after: "r8" },
      },
      {
        id: "rc7",
        verb: "add",
        entry: "After Lesson 11",
        detail: "A Lesson on lifetimes in a returned iterator",
        reason: "Your CLI returns iterators from parsing code. That is where the annotation bites hardest.",
        op: {
          kind: "add",
          after: "r11",
          lesson: outlineOnly("r11b", "Lifetimes on a returned iterator", "The signature that fixes it, and why the compiler asked.", 11),
        },
      },
    ],
  },
  {
    id: "one-service-k8s",
    topic: "Kubernetes for a single service",
    goal: "Run my side project's API on a managed cluster without a platform team behind me",
    depth: "Solid working knowledge",
    background: "I deploy to a PaaS today and I have never written a manifest by hand.",
    grounding: false,
    phase: "outline",
    createdOn: "24 AUG 2026",
    openedOn: "25 AUG 2026",
    modules: k8sModules,
    plan: [
      {
        id: "kc1",
        verb: "add",
        entry: "After Lesson 4",
        detail: "A Lesson on running one cluster locally",
        reason: "Everything after this needs somewhere to try it, and you said you have never written a manifest.",
        op: {
          kind: "add",
          after: "k4",
          lesson: outlineOnly("k4b", "One cluster on your own machine", "kind or k3s, and the two settings that make it behave like the real one.", 10),
        },
      },
      {
        id: "kc2",
        verb: "move",
        entry: "Lesson 12",
        detail: "Requests and limits, after the failure modes",
        reason: "Sizing reads as arbitrary until you have seen what being evicted looks like.",
        op: { kind: "move", from: "k12", after: "k16" },
      },
      {
        id: "kc3",
        verb: "add",
        entry: "After Lesson 8",
        detail: "A Lesson on the first deploy going wrong",
        reason: "Every first deploy fails on something small. Better to meet the four causes here than at midnight.",
        op: {
          kind: "add",
          after: "k8",
          lesson: outlineOnly("k8b", "Your first failed rollout", "ImagePullBackOff, a bad port, a missing secret, and a probe that lied.", 12),
        },
      },
      {
        id: "kc4",
        verb: "split",
        entry: "Lesson 5",
        detail: "Separate the Deployment object from the rollout",
        reason: "Writing one and watching one change are different sittings, and the second is where the questions are.",
        op: {
          kind: "split",
          at: "k5",
          into: [
            outlineOnly("k5a", "A Deployment for your API", "The object, field by field, with nothing you do not need.", 9),
            outlineOnly("k5b", "Watching a rollout happen", "What changes when you push a new image, in the order it changes.", 10),
          ],
        },
      },
      {
        id: "kc5",
        verb: "move",
        entry: "Lesson 9",
        detail: "ConfigMaps and env — before the first deploy",
        reason: "You will need settings in the container the first time you run it, not two Modules later.",
        op: { kind: "move", from: "k9", after: "k6" },
      },
      {
        id: "kc6",
        verb: "add",
        entry: "After Lesson 14",
        detail: "A Lesson on what to do when you are paged",
        reason: "You said no platform team. The runbook has to be in the Course, because there is nobody else to ask.",
        op: {
          kind: "add",
          after: "k14",
          lesson: outlineOnly("k14b", "Paged at midnight, alone", "The five commands, in order, and when to just roll back.", 11),
        },
      },
    ],
  },
];

function withOps(plan: TailorChange[], ops: Record<string, PlanOp>): PlanChange[] {
  return plan.map((c) => ({ ...c, op: ops[c.id] }));
}

/**
 * The Outline is derived, never mutated: base Modules plus whichever changes
 * are approved right now. Undoing one is dropping it from the set.
 */
export function applyPlan(
  modules: Module[],
  applied: ReadonlySet<string>,
  plan: PlanChange[],
): Module[] {
  const out = modules.map((m) => ({ ...m, lessons: [...m.lessons] }));
  const find = (id: string) => {
    for (const m of out) {
      const i = m.lessons.findIndex((l) => l.id === id);
      if (i !== -1) return { m, i };
    }
    return null;
  };

  for (const change of plan) {
    if (!applied.has(change.id)) continue;
    const op = change.op;
    if (op.kind === "add") {
      const at = find(op.after);
      if (at) at.m.lessons.splice(at.i + 1, 0, op.lesson);
    } else if (op.kind === "split") {
      const at = find(op.at);
      if (at) at.m.lessons.splice(at.i, 1, ...op.into);
    } else {
      const from = find(op.from);
      if (!from) continue;
      const [moved] = from.m.lessons.splice(from.i, 1);
      const to = find(op.after);
      if (to) to.m.lessons.splice(to.i + 1, 0, moved);
      else from.m.lessons.splice(from.i, 0, moved);
    }
  }
  return out;
}

export function findCourse(id: string): LibraryCourse | undefined {
  return library.find((c) => c.id === id);
}
