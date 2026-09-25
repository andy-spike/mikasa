"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion, useAnimate, useInView, type Easing, type Transition } from "motion/react";
import { MousePointer2 } from "lucide-react";
import { LiveMark } from "@/components/workspace/marks";
import { cn } from "@/lib/utils";

/* The landing's one story: notes and line drawings made straight onto the
   page's ruling, going Goal → Outline → Course → Lesson as the visitor reads
   four short steps beside them. Every line is one rule tall, so the notes sit
   on the paper instead of in a box. It is a drawing, not the product, and
   hidden from assistive tech; the step copy carries the story as text.
   Nothing plays until the first step's copy reaches the reading line. */

/* ── One hand ─────────────────────────────────────────────────────────────
   Everything on the notes moves by the same few rules, so the story reads as
   drawn by one hand:
   - Strokes and words ink in at one speed with one easing, so a long line
     takes longer than a short one, the way a pen would.
   - Things arrive by being drawn, written, or typed, and leave by fading.
   - Rows opening and folding, the title rising, and the triangle travelling
     all share one move.
   ------------------------------------------------------------------------ */

const EASE = [0.2, 0, 0, 1] as const; // --ease: moves and arrivals
const PEN = [0.45, 0, 0.2, 1] as const; // a hand that speeds up, then settles
const EXIT = 0.25; // every leave is the same short fade
const MOVE = 0.5; // rows opening and folding, the title, the triangle
const BEAT = 0.75; // one Lesson of progress: a move, then a rest
const PEN_SPEED = 480; // px per second, for every stroke on the notes
const WRITE_SPEED = 60; // characters per second, for every written word
const TYPE_SPEED = 32; // characters per second, for the Learner's own typing
const OVERLAP = 0.6; // the next stroke starts before the last one lifts
const ROW = 32 / PEN_SPEED; // one line of spine at pen speed

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const penTime = (px: number) => clamp(px / PEN_SPEED, 0.16, 0.8);
const writeTime = (chars: number) => clamp(chars / WRITE_SPEED, 0.25, 0.6);
const moveCss = `${MOVE}s cubic-bezier(${EASE.join(", ")})`;

// Arriving: appear at the start, then reveal `key` over the duration.
function arrive(key: string, duration: number, delay: number, ease: Easing = PEN): Transition {
  return { [key]: { duration, ease, delay }, opacity: { duration: 0, delay } };
}
// Leaving: fade, then reset out of sight so the next arrival starts clean.
function leave(key: string): Transition {
  return { opacity: { duration: EXIT, ease: EASE }, [key]: { duration: 0, delay: EXIT } };
}

/* ── The illustrative Course ───────────────────────────────────────────── */

const goal = "Take portraits using natural light.";

const modules = [
  { title: "Know your camera", lessons: ["Aperture and depth of field", "Shutter speed and ISO"] },
  {
    title: "Learn to see light",
    lessons: ["Window light and open shade", "Position your subject"],
  },
  { title: "Make a portrait", lessons: ["Compose a portrait", "Shoot a portrait series"] },
];
// The Lesson the Learner adds while shaping the Outline.
const added = { module: 0, title: "Read the light meter" };
// Lessons finished in the Course step; the next one is where the Learner is.
const doneCount = 3;
const currentModule = 1;

type Row =
  | { kind: "module"; module: number; title: string; lessons: number; order: number }
  | { kind: "lesson"; module: number; index: number; title: string; added: boolean; order: number };

// The Outline as rows in reading order. `order` is when the pen reaches the
// row while drafting; the added Lesson is not drafted, the Learner adds it.
const rows: Row[] = [];
let drafted = 0;
for (let m = 0, index = 0; m < modules.length; m++) {
  const lessons = m === added.module ? [...modules[m].lessons, added.title] : modules[m].lessons;
  rows.push({
    kind: "module",
    module: m,
    title: modules[m].title,
    lessons: lessons.length,
    order: drafted++,
  });
  for (const title of lessons) {
    const isAdded = title === added.title;
    rows.push({
      kind: "lesson",
      module: m,
      index: index++,
      title,
      added: isAdded,
      order: isAdded ? drafted : drafted++,
    });
  }
}
const draftedRows = drafted;

type Stroke = { d: string; tone?: "ink" | "soft" | "strong"; dashed?: boolean };
const tone = { ink: "stroke-fg-2", soft: "stroke-fg-3", strong: "stroke-fg" };

// A full circle as one stroke, starting at its left edge.
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;

// Step one: the Topic, drawn as a rangefinder seen from the front. It sits on
// the paper the way the words do: the body's top, seam, and bottom lie on
// the rules of its four lines, and everything inside keeps one rhythm, 12
// in from each edge and 8 between parts, with the lens centred in the lower
// body. The pen builds the body, then the lens ring by ring; window light
// falls toward it from the upper right, and the glass catches it last.
const camera: Stroke[] = [
  {
    d: "M30 31.5 H194 Q200 31.5 200 37.5 V121.5 Q200 127.5 194 127.5 H30 Q24 127.5 24 121.5 V37.5 Q24 31.5 30 31.5 Z",
  },
  { d: "M24 63.5 H200", tone: "soft" },
  { d: "M36 31.5 V25.5 Q36 23.5 38 23.5 H46 Q48 23.5 48 25.5 V31.5" },
  { d: "M56 31.5 V26.5 H80 V31.5" },
  { d: "M100 31.5 V28.5 H124 V31.5" },
  { d: "M176 31.5 V26.5 H188 V31.5" },
  { d: "M24 43.5 H19 V51.5 H24 M200 43.5 H205 V51.5 H200" },
  { d: "M36 41.5 H64 V53.5 H36 Z" },
  { d: "M176 43.5 H188 V51.5 H176 Z", tone: "soft" },
  { d: circle(112, 95.5, 24) },
  { d: circle(112, 95.5, 19), tone: "soft" },
  { d: circle(112, 95.5, 12) },
  { d: "M252 4 L228 20", tone: "soft", dashed: true },
  { d: "M258 18 L234 34", tone: "soft", dashed: true },
  { d: "M256 34 L232 50", tone: "soft", dashed: true },
  // The glint: a short arc high on the glass, on the side the light comes from.
  { d: "M116 88.6 A8 8 0 0 1 119.3 92.1", tone: "soft" },
];

// Step four: the Exercise itself. One window and three portraits at three
// distances; the far side of each face hatches darker the further it stands
// from the glass, and the softest portrait gets circled.
const busts = [
  { x: 130, hatches: 1 },
  { x: 212, hatches: 3 },
  { x: 294, hatches: 5 },
];
// Like the camera, the scene stands on the paper: the window and the three
// sitters rest on the bottom rule, and the light falls toward face height.
const face = 88;
const hatch = (x: number, n: number) =>
  Array.from({ length: n }, (_, k) => {
    const dx = 3 + k * 2;
    const h = Math.sqrt(13 * 13 - dx * dx) - 1.5;
    return `M${x + dx} ${(face - h).toFixed(1)} V${(face + h).toFixed(1)}`;
  }).join(" ");
const portraits: Stroke[] = [
  { d: "M12 31.5 H52 V127.5 H12 Z" },
  { d: "M32 31.5 V127.5 M12 79.5 H52" },
  { d: "M6 127.5 H58", tone: "soft" },
  { d: "M58 48 L84 58", tone: "soft", dashed: true },
  { d: "M58 72 L86 76", tone: "soft", dashed: true },
  { d: "M58 96 L84 94", tone: "soft", dashed: true },
  ...busts.flatMap(({ x, hatches }): Stroke[] => [
    { d: circle(x, face, 13) },
    { d: `M${x - 26} 127.5 C${x - 24} 103.5 ${x + 24} 103.5 ${x + 26} 127.5` },
    { d: hatch(x, hatches), tone: "soft" },
  ]),
  // The softest portrait, circled by hand around the face.
  {
    d: "M112 70 C126 58 156 62 157 88 C158 112 130 116 114 108 C100 100 100 78 110 70 C114 66 120 64 126 63",
    tone: "strong",
  },
];

const steps = [
  {
    title: "Say what you want to do.",
    body: "Name a Topic and a Goal, and add what you already know. The Course starts from where you are.",
  },
  {
    title: "Shape the Outline first.",
    body: "Mikasa drafts the Outline before it writes a word. Add, move, or cut Lessons, then approve it.",
  },
  {
    title: "Learn it as one Course.",
    body: "Mikasa writes every Lesson in order, so each one builds on the last. Your place is always marked.",
  },
  {
    title: "Finish each Lesson by doing.",
    body: "Every Lesson ends with one Exercise. Mark it done and the next Lesson is waiting. Stuck? Ask the Tutor.",
  },
];

export function LandingStory() {
  // The story stands at the last step whose copy has crossed the reading
  // line, so a jump, an anchor, or a restored scroll lands on the right step
  // as surely as scrolling through does.
  const [crossed, setCrossed] = useState(() => steps.map(() => false));
  const step = crossed.lastIndexOf(true);
  const onCrossed = useCallback(
    (index: number, value: boolean) =>
      setCrossed((c) => (c[index] === value ? c : c.map((v, i) => (i === index ? value : v)))),
    [],
  );

  return (
    <section
      id="how"
      aria-label="How Mikasa works"
      className="relative mx-auto max-w-[64rem] scroll-mt-14 lg:grid lg:grid-cols-[1fr_26rem] lg:gap-x-20"
    >
      <div
        aria-hidden="true"
        className="landing-ruled story-pin sticky z-10 -mx-5 px-5 py-(--pitch) sm:-mx-8 sm:px-8 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:mx-0 lg:self-start lg:bg-none lg:bg-transparent lg:px-0 lg:py-0"
      >
        <Sheet step={step} />
      </div>
      {steps.map((s, i) => (
        <Step key={s.title} index={i} active={step === i} onCrossed={onCrossed} {...s} />
      ))}
    </section>
  );
}

// The reading line: just past the middle of the viewport on desktop, and on
// phones low enough to sit below the pinned notes, where the step copy is
// actually visible. The root reaches far above the viewport, so copy that has
// scrolled past the line still counts as crossed.
const readingLine = {
  wide: "1000% 0px -45% 0px",
  narrow: "1000% 0px -20% 0px",
} as const;

function Step({
  index,
  title,
  body,
  active,
  onCrossed,
}: {
  index: number;
  title: string;
  body: string;
  active: boolean;
  onCrossed: (index: number, crossed: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [margin] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024
      ? readingLine.narrow
      : readingLine.wide,
  );
  // Watch the copy itself, not its tall block, so a step starts only once
  // its words are where the eye is.
  const inView = useInView(ref, { margin });
  useEffect(() => {
    onCrossed(index, inView);
  }, [inView, index, onCrossed]);

  return (
    <div
      style={{ gridRowStart: index + 1 }}
      className="flex min-h-[48svh] flex-col justify-center lg:col-start-1 lg:min-h-svh lg:pt-14"
    >
      <motion.div
        ref={ref}
        animate={{ opacity: active ? 1 : 0.28, y: active ? 0 : 6 }}
        transition={{ duration: MOVE, ease: EASE }}
        className="max-w-[26rem]"
      >
        <h2 className="text-[1.75rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]">
          {title}
        </h2>
        <p className="mt-4 text-base leading-[1.72] text-fg-2">{body}</p>
      </motion.div>
    </div>
  );
}

/* ── The pen's vocabulary ──────────────────────────────────────────────── */

/* One rule of the paper. Text sits just above the line below it, the way
   handwriting does. The optional spine carries the Outline's tree through
   the row's left edge. */
function Line({
  open = true,
  openDelay = 0,
  spine,
  className,
  children,
}: {
  open?: boolean;
  openDelay?: number;
  spine?: { up: boolean; down: boolean; drawn: boolean; at: number };
  className?: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
      transition={
        open
          ? {
              height: { duration: MOVE, ease: EASE, delay: openDelay },
              opacity: { duration: 0, delay: openDelay },
            }
          : { height: { duration: MOVE, ease: EASE }, opacity: { duration: EXIT, ease: EASE } }
      }
      className="relative overflow-hidden"
    >
      {spine && <Spine {...spine} />}
      <div
        className={cn(
          "relative flex h-(--pitch) translate-y-[0.3rem] items-center gap-3 leading-(--pitch)",
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* The tree's spine through one row, drawn top to bottom at pen speed. Each
   row carries the stroke on from the row above, so the whole spine reads
   as one continuous line. */
function Spine({
  up,
  down,
  drawn,
  at,
}: {
  up: boolean;
  down: boolean;
  drawn: boolean;
  at: number;
}) {
  const half = ROW / 2;
  return (
    <>
      <motion.span
        initial={false}
        animate={drawn && up ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
        transition={drawn && up ? arrive("scaleY", half, at, "linear") : leave("scaleY")}
        className="absolute top-0 left-[5.5px] h-[calc(50%+0.3rem)] w-px origin-top bg-rule"
      />
      <motion.span
        initial={false}
        animate={drawn && down ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
        transition={drawn && down ? arrive("scaleY", half, at + half, "linear") : leave("scaleY")}
        className="absolute top-[calc(50%+0.3rem)] bottom-0 left-[5.5px] w-px origin-top bg-rule"
      />
    </>
  );
}

/* Words written left to right under a soft edge, like ink taking. */
const WIPE = "linear-gradient(90deg, #000 45%, transparent 55%)";
function Write({
  text,
  shown,
  delay = 0,
  className,
}: {
  text: string;
  shown: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.span
      initial={false}
      animate={
        shown ? { maskPosition: "0% 0%", opacity: 1 } : { maskPosition: "100% 0%", opacity: 0 }
      }
      transition={
        shown ? arrive("maskPosition", writeTime(text.length), delay) : leave("maskPosition")
      }
      style={{ maskImage: WIPE, maskSize: "250% 100%", maskRepeat: "no-repeat" }}
      className={cn("inline-block whitespace-nowrap", className)}
    >
      {text}
    </motion.span>
  );
}

/* The done mark, stroked by the same pen. */
function Check({
  drawn,
  delay = 0,
  className,
}: {
  drawn: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <motion.path
        d="M1.5 6.4 4.4 9.3 10.5 2.9"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="square"
        initial={false}
        animate={drawn ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={drawn ? arrive("pathLength", penTime(13), delay) : leave("pathLength")}
      />
    </svg>
  );
}

/* A Lesson's mark before it is started: a small dot at the end of its branch. */
function Dot({ shown, delay }: { shown: boolean; delay: number }) {
  return (
    <motion.span
      initial={false}
      animate={shown ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
      transition={shown ? { duration: 0.3, ease: EASE, delay } : { duration: EXIT, ease: EASE }}
      className="size-[5px] rounded-full bg-mark"
    />
  );
}

/* A line drawing inked stroke by stroke. Each stroke takes as long as its
   length needs at pen speed, and the next begins as the last one lifts.
   Dashed strokes are revealed through a drawn mask so they keep their dash. */
function Drawing({
  strokes,
  drawn,
  delay,
  viewBox,
  onDrawn,
}: {
  strokes: Stroke[];
  drawn: boolean;
  delay: number;
  viewBox: string;
  onDrawn?: () => void;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const [lengths, setLengths] = useState<number[]>([]);
  useEffect(() => {
    setLengths(paths.current.map((p) => p?.getTotalLength() ?? 0));
  }, []);

  const times: { at: number; dur: number }[] = [];
  for (let i = 0, t = delay; i < strokes.length; i++) {
    const dur = penTime(lengths[i] ?? 60);
    times.push({ at: t, dur });
    t += dur * OVERLAP;
  }

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMinYMid meet"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-auto max-w-full overflow-visible"
    >
      {strokes.map((s, i) => {
        const { at, dur } = times[i];
        const reveal = drawn ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 };
        const transition = drawn ? arrive("pathLength", dur, at) : leave("pathLength");
        const done =
          i === strokes.length - 1 && onDrawn ? () => (drawn ? onDrawn() : undefined) : undefined;
        const measure = (p: SVGPathElement | null) => {
          paths.current[i] = p;
        };
        if (!s.dashed)
          return (
            <motion.path
              key={i}
              ref={measure}
              d={s.d}
              className={tone[s.tone ?? "ink"]}
              initial={false}
              animate={reveal}
              transition={transition}
              onAnimationComplete={done}
            />
          );
        return (
          <g key={i}>
            <mask id={`${id}-${i}`} maskUnits="userSpaceOnUse">
              <motion.path
                d={s.d}
                stroke="#fff"
                strokeWidth={4}
                initial={false}
                animate={reveal}
                transition={transition}
                onAnimationComplete={done}
              />
            </mask>
            <path
              ref={measure}
              d={s.d}
              strokeDasharray="3 5"
              mask={`url(#${id}-${i})`}
              className={tone[s.tone ?? "soft"]}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* The Learner's hand: the same pointer drags the added Lesson in and, later,
   marks the Exercise done. */
function Hand() {
  return <MousePointer2 size={16} strokeWidth={1.75} className="fill-canvas text-fg" />;
}

/* A stage of the notes. Stages share one grid cell and cross by fading. */
function Stage({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: visible ? 0.35 : EXIT, ease: EASE }}
      className="col-start-1 row-start-1"
    >
      {children}
    </motion.div>
  );
}

/* ── The notes ─────────────────────────────────────────────────────────── */

const TYPE_DELAY = 0.3;
const typingTime = TYPE_DELAY + goal.length / TYPE_SPEED;

// The Learner types the Goal once, the first time the story starts, and it
// stays typed from then on.
function useTyped(text: string, start: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let n = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    const wait = setTimeout(() => {
      tick = setInterval(() => {
        n += 1;
        setCount(n);
        if (n >= text.length) clearInterval(tick);
      }, 1000 / TYPE_SPEED);
    }, TYPE_DELAY * 1000);
    return () => {
      clearTimeout(wait);
      clearInterval(tick);
    };
  }, [start, text]);
  return count;
}

function Sheet({ step }: { step: number }) {
  // Where the story came from decides how a step arrives: forwards plays its
  // whole sequence, backwards returns to its settled state.
  const [current, setCurrent] = useState(step);
  const [from, setFrom] = useState(-1);
  if (step !== current) {
    setFrom(current);
    setCurrent(step);
  }

  const started = step >= 0;
  const drafting = step >= 1;
  const course = step >= 2;
  const reading = step >= 3;

  // Step one: the Learner types the Goal, then the Topic is drawn.
  const [begun, setBegun] = useState(false);
  if (started && !begun) setBegun(true);
  const typed = useTyped(goal, begun);
  const typingLeft =
    typed < goal.length ? (typed === 0 ? typingTime : (goal.length - typed) / TYPE_SPEED) : 0;
  const cameraAt = typingLeft ? typingLeft + 0.2 : EXIT;

  // Step two: the pen drafts the tree top to bottom, then the Learner drags
  // one Lesson in.
  const treeAt = typingLeft || EXIT;
  const addAt = treeAt + draftedRows * ROW + 0.55;
  const DRAG = 0.7;
  const dropAt = addAt + DRAG;
  const dragging = step === 1 && from < 1;

  // Step three: progress plays out. Lessons check off one by one as the
  // triangle walks down; then finished modules fold away.
  const lead = from < 1 ? dropAt + 0.5 : 0.35;
  const leadRef = useRef(lead);
  useEffect(() => {
    leadRef.current = lead;
  });
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!course) return;
    const timers = Array.from({ length: doneCount + 2 }, (_, k) =>
      setTimeout(() => setProgress(k + 1), (leadRef.current + BEAT * k) * 1000),
    );
    return () => {
      timers.forEach(clearTimeout);
      setProgress(0);
    };
  }, [course]);
  const liveIndex = progress >= 1 ? Math.min(progress - 1, doneCount) : -1;
  const doneBefore = Math.min(progress - 1, doneCount);
  const folded = progress > doneCount + 1;

  // Step four: the Lesson opens, its Exercise is drawn, the Learner marks it
  // done, and the triangle hands off to the next Lesson.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!reading) return;
    return () => setPhase(0);
  }, [reading]);
  useEffect(() => {
    if (!reading || phase === 0 || phase >= 3) return;
    const t = setTimeout(() => setPhase((p) => p + 1), phase === 1 ? 900 : 600);
    return () => clearTimeout(t);
  }, [reading, phase]);

  // Lines of the Outline as they stand now: where the triangle is, and which
  // row closes the spine.
  let liveLine = 0;
  let lastRow = 0;
  for (let i = 0, line = 0; i < rows.length; i++) {
    const r = rows[i];
    const visible = r.kind === "module" || !folded || r.module === currentModule;
    if (!visible) continue;
    if (r.kind === "lesson" && r.index === liveIndex) liveLine = line;
    lastRow = i;
    line += 1;
  }
  const triangleLine = reading ? (phase >= 3 ? 7 : 0) : liveLine;

  // When the triangle travels to a new Lesson it lifts, glides over whatever
  // lies between, and settles; when it rides with its row (the fold, the
  // title rising) it stays put on the page.
  const [marker, animateMarker] = useAnimate<HTMLSpanElement>();
  const travel = reading && phase >= 3 ? "next" : String(liveIndex);
  const lastTravel = useRef(travel);
  useEffect(() => {
    const prev = lastTravel.current;
    lastTravel.current = travel;
    if (prev === travel || prev === "-1" || travel === "-1") return;
    animateMarker(
      marker.current,
      { opacity: [1, 0.25, 1], scale: [1, 0.8, 1] },
      { duration: MOVE, ease: EASE },
    );
  }, [travel, animateMarker, marker]);

  const outline = rows.map((r, i) => {
    const at = treeAt + r.order * ROW;
    const spine = {
      up: i > 0,
      down: i !== lastRow,
      drawn: drafting,
      at: r.kind === "lesson" && r.added ? addAt : at,
    };
    const wordsAt = at + ROW / 2 + 0.06;

    if (r.kind === "module") {
      const done = folded && r.module < currentModule;
      return (
        <Line key={r.title} spine={spine} className="justify-between">
          <span className="flex items-center gap-3">
            <span className="flex w-3 justify-center">
              <motion.span
                initial={false}
                animate={drafting ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                transition={
                  drafting
                    ? { duration: 0.3, ease: EASE, delay: at + ROW / 2 }
                    : { duration: EXIT, ease: EASE }
                }
                style={{ transition: `background-color ${moveCss}` }}
                className={cn("size-[7px] border border-fg-3", done ? "bg-fg-3" : "bg-canvas")}
              />
            </span>
            <Write
              text={r.title}
              shown={drafting}
              delay={wordsAt}
              className="text-[0.9375rem] font-semibold"
            />
          </span>
          <span className="flex items-center gap-0.5 text-xs text-fg-dim">
            {r.module < currentModule ? (
              Array.from({ length: r.lessons }, (_, k) => (
                <Check key={k} drawn={done} delay={0.25 + k * 0.12} className="text-fg-3" />
              ))
            ) : (
              <Write
                text={`${r.lessons} Lessons`}
                shown={folded && r.module !== currentModule}
                delay={0.25}
              />
            )}
          </span>
        </Line>
      );
    }

    const open = !folded || r.module === currentModule;
    const done = r.index < doneBefore;
    const live = r.index === liveIndex;
    const markAt = r.added ? dropAt : at + ROW / 2;
    return (
      <Line
        key={r.title}
        open={open && (!r.added || drafting)}
        openDelay={r.added && from < 1 ? addAt : 0}
        spine={spine}
        className={cn(
          "text-[0.9375rem] transition-colors duration-500",
          live ? "text-fg" : "text-fg-2",
        )}
      >
        {/* The branch from the spine to this Lesson's mark. */}
        <motion.span
          initial={false}
          animate={drafting ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          transition={drafting ? arrive("scaleX", penTime(18), markAt) : leave("scaleX")}
          className="absolute left-[6px] h-px w-[18px] origin-left bg-rule"
        />
        <span className="w-3 shrink-0" />
        <span className="relative flex size-3 shrink-0 items-center justify-center">
          <Dot shown={drafting && !done && !live} delay={markAt + 0.12} />
          <Check drawn={done} delay={0.05} className="absolute inset-0 text-fg-3" />
        </span>
        {r.added ? (
          <Dragged text={r.title} play={dragging} at={addAt} duration={DRAG} />
        ) : (
          // The live row hands its words to the rising title in the last step.
          <motion.span
            initial={false}
            animate={{ opacity: reading && live ? 0 : 1 }}
            transition={{ duration: 0, delay: reading ? 0 : MOVE }}
          >
            <Write text={r.title} shown={drafting} delay={markAt + 0.12} />
          </motion.span>
        )}
      </Line>
    );
  });

  return (
    <div>
      <p className="translate-y-[0.35rem] text-xl leading-(--pitch) font-semibold tracking-[-0.02em] text-balance sm:text-2xl">
        {goal.slice(0, typed)}
        <motion.span
          animate={{
            opacity: step !== 0 ? 0 : typed < goal.length ? 1 : [1, 1, 0, 0],
          }}
          transition={
            step === 0 && typed >= goal.length
              ? { duration: 1.1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }
              : { duration: step === 0 ? 0 : EXIT }
          }
          className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.12em] bg-live"
        />
        <span className="opacity-0">{goal.slice(typed)}</span>
      </p>

      {/* Reserve the tallest state, the full Outline, so the notes never change
          height and nothing scrolls half-hidden beneath them on phones. */}
      <div className="relative mt-(--pitch) grid min-h-[calc(var(--pitch)*10)] content-start">
        <Stage visible={step === 0}>
          <div className="h-[calc(var(--pitch)*4)]">
            <Drawing strokes={camera} drawn={step === 0} delay={cameraAt} viewBox="0 0 260 128" />
          </div>
        </Stage>

        <Stage visible={drafting && !reading}>{outline}</Stage>

        <Stage visible={reading}>
          <Line className="justify-end">
            <Write
              text="4 of 7"
              shown={reading}
              delay={MOVE}
              className="text-xs text-fg-dim tabular-nums"
            />
          </Line>
          <div className="h-[calc(var(--pitch)*4)] pl-12">
            <Drawing
              strokes={portraits}
              drawn={reading}
              delay={MOVE * 0.8}
              viewBox="0 0 340 128"
              onDrawn={() => setPhase((p) => Math.max(p, 1))}
            />
          </div>
          <Line className="justify-between">
            <span className="flex items-center gap-3">
              <span className="w-3" />
              <span className="w-3" />
              <Write
                text="One window. Three portraits."
                shown={phase >= 1}
                delay={0.05}
                className="text-[0.9375rem] text-fg-2"
              />
            </span>
            <Write text="Exercise" shown={phase >= 1} delay={0.3} className="text-xs text-fg-dim" />
          </Line>
          <Line>
            <span className="w-3" />
            <span className="flex size-3 items-center justify-center">
              <Check drawn={phase >= 2} delay={0.12} className="text-fg-3" />
            </span>
            <MarkDone phase={phase} />
          </Line>
          <Line className="justify-between">
            <span className="flex items-center gap-3">
              <span className="w-3" />
              <span className="w-3" />
              <Write
                text="Position your subject"
                shown={phase >= 3}
                delay={MOVE * 0.6}
                className="text-[0.9375rem] text-fg"
              />
            </span>
            <Write
              text="Next"
              shown={phase >= 3}
              delay={MOVE * 0.6 + 0.2}
              className="text-xs text-fg-dim"
            />
          </Line>
        </Stage>

        {/* The Lesson's title rises out of its row in the Outline to head the
            Lesson, and settles back when the story is scrolled up. */}
        <div
          style={{
            transform: `translateY(calc(var(--pitch) * ${reading ? 0 : liveLine}))`,
            transition: `transform ${moveCss}`,
          }}
          className="pointer-events-none absolute inset-x-0 top-0"
        >
          <motion.div
            initial={false}
            animate={{ opacity: reading ? 1 : 0 }}
            transition={{ duration: 0, delay: reading ? 0 : MOVE }}
            className={cn(
              "flex h-(--pitch) translate-y-[0.3rem] items-center gap-3 text-[0.9375rem] leading-(--pitch) transition-colors duration-500",
              phase >= 3 ? "text-fg-2" : "text-fg",
            )}
          >
            <span className="w-3" />
            <span className="w-3" />
            Window light and open shade
          </motion.div>
        </div>

        {/* One triangle for the whole story: it walks down the tree, rises with
            the Lesson, and hands off to the next one. */}
        <motion.span
          initial={false}
          animate={
            reading || liveIndex >= 0 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }
          }
          transition={{ duration: 0.35, ease: EASE }}
          style={{
            top: `calc(var(--pitch) * ${triangleLine})`,
            transition: `top ${moveCss}`,
          }}
          className="absolute left-6 flex h-(--pitch) w-3 translate-y-[0.3rem] items-center justify-center"
        >
          <span ref={marker} className="flex">
            <LiveMark />
          </span>
        </motion.span>
      </div>
    </div>
  );
}

/* The added Lesson, lifted off the page and dragged in by the Learner's hand,
   then set down in its place. */
function Dragged({
  text,
  play,
  at,
  duration,
}: {
  text: string;
  play: boolean;
  at: number;
  duration: number;
}) {
  const total = duration + 0.45;
  const drop = duration / total;
  return (
    <motion.span
      initial={false}
      animate={{ x: play ? [72, 0] : 0 }}
      transition={play ? { duration, ease: EASE, delay: at } : { duration: 0 }}
      className="relative inline-flex items-center"
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: play ? [0, 1, 1, 0] : 0 }}
        transition={
          play
            ? { duration: total, times: [0, 0.08, drop, 1], ease: "easeOut", delay: at }
            : { duration: EXIT }
        }
        className="lift absolute -inset-x-2 inset-y-[0.35rem] bg-float"
      />
      <span className="relative">{text}</span>
      <motion.span
        initial={false}
        animate={
          play
            ? {
                opacity: [0, 1, 1, 0],
                scale: [1, 0.86, 0.86, 1],
                x: [0, 0, 0, 10],
                y: [0, 0, 0, 8],
              }
            : { opacity: 0 }
        }
        transition={
          play ? { duration: total, times: [0, 0.08, drop, 1], delay: at } : { duration: EXIT }
        }
        className="absolute top-1/2 -right-3 flex"
      >
        <Hand />
      </motion.span>
    </motion.span>
  );
}

/* Marking the Exercise done: the hand comes in, presses, and the control
   settles into a finished line. */
function MarkDone({ phase }: { phase: number }) {
  const done = phase >= 2;
  return (
    <motion.span
      initial={false}
      animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase === 2 ? [1, 0.96, 1] : 1 }}
      transition={{
        opacity: { duration: phase >= 1 ? 0.35 : EXIT, ease: EASE, delay: phase >= 1 ? 0.3 : 0 },
        scale: { duration: 0.28, ease: EASE },
      }}
      className="relative text-[0.8125rem]"
    >
      <span
        aria-hidden="true"
        style={{ opacity: done ? 0 : 1, transition: `opacity ${moveCss}` }}
        className="absolute -inset-x-2 inset-y-[0.35rem] bg-over"
      />
      <span className="relative grid">
        <span
          style={{ opacity: done ? 0 : 1, transition: `opacity ${moveCss}` }}
          className="col-start-1 row-start-1 text-fg"
        >
          Mark done
        </span>
        <span
          style={{ opacity: done ? 1 : 0, transition: `opacity ${moveCss}` }}
          className="col-start-1 row-start-1 text-fg-3"
        >
          Done
        </span>
      </span>
      <motion.span
        initial={false}
        animate={
          phase >= 3
            ? { opacity: 0, x: 12, y: 10, scale: 1 }
            : phase === 2
              ? { opacity: 1, x: 0, y: 0, scale: [1, 0.82, 1] }
              : phase === 1
                ? { opacity: 1, x: 0, y: 0, scale: 1 }
                : { opacity: 0, x: 56, y: 28, scale: 1 }
        }
        transition={
          phase >= 3
            ? { duration: EXIT, ease: EASE }
            : phase === 2
              ? { duration: 0.28, ease: EASE }
              : phase === 1
                ? { duration: 0.7, ease: EASE, delay: 0.2 }
                : { duration: 0 }
        }
        className="absolute top-1/2 left-[60%] flex"
      >
        <Hand />
      </motion.span>
    </motion.span>
  );
}
