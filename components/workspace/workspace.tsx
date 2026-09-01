"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { PanelLeftOpen, PanelRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReadingCourse, SourceLink } from "@/lib/course/reading";
import type { CompletionActionResult } from "@/lib/actions/completion";
import { reviewTailorOperationAction, stagePlanRevisionAction } from "@/lib/actions/tailor";
import type { PlanView, Turn } from "./panel";
import { Outline, type ModuleView } from "./outline";
import { LessonPane } from "./lesson";
import { Panel, type PanelMode } from "./panel";
import { Resizer } from "./resizer";
import { CommandPalette, type Command } from "./palette";
import { ThemeToggle } from "./theme-toggle";

/** Real completions carry the day the learner marked one; the server returns it. */

/* The two rails. The Outline opens at 20rem and leaves a 2.75rem stub behind;
   the panel opens at 21rem. Both are learner-resizable within the bounds
   below, and the widths ride CSS variables, so the classes stay literal. */

const RAIL_MIN = 16;
const RAIL_MAX = 28;
const PANEL_MIN = 18;
const PANEL_MAX = 30;

type Props = {
  /** The published Course, in reading order (lib/course/reading). */
  course: ReadingCourse;
  /** The Course's Sources, for the Lesson's inline links. */
  sources?: Map<string, SourceLink>;
  /** Marks a Lesson's Exercise done on the server; returns the stamp. */
  onMark: (lessonId: string) => Promise<CompletionActionResult>;
  /** Undoes one Exercise's completion on the server. */
  onUnmark: (lessonId: string) => Promise<CompletionActionResult>;
  /** The Tutor's restored conversations, keyed by the Lesson id (#10). */
  tutorHistory?: Record<string, Turn[]>;
  /** The Tailor's restored conversation (#12). */
  tailorTurns?: Turn[];
  /** The Change plan under review, as the server has it. */
  tailorPlan?: PlanView | null;
  /** The plan as the server has it now, after a turn may have proposed one. */
  onRefreshPlan: () => Promise<PlanView | null>;
};

export function Workspace({
  course,
  sources,
  onMark,
  onUnmark,
  tutorHistory,
  tailorTurns,
  tailorPlan,
  onRefreshPlan,
}: Props) {
  const [doneAt, setDoneAt] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const m of course.modules)
      for (const l of m.lessons) if (l.stampedOn) seed[l.id] = l.stampedOn;
    return seed;
  });
  const [openId, setOpenId] = useState<string | null>(null);
  /* null until the learner collapses or expands; the width decides until then. */
  const [railChoice, setRailChoice] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [lastMode, setLastMode] = useState<PanelMode>("tutor");
  /* The rails' widths, in rem. Held here so the resizer and the reading
     column's reserves read the same numbers. */
  const [railWidth, setRailWidth] = useState(20);
  const [panelWidth, setPanelWidth] = useState(21);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* transient: the handoff plays on the mark, never on a revisit */
  const [justDone, setJustDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const narrow = useIsMobile();
  const railOpen = railChoice ?? !narrow;

  const modules: ModuleView[] = useMemo(() => {
    let n = 0;
    return course.modules.map((m) => ({
      numeral: m.numeral,
      title: m.title,
      lessons: m.lessons.map((l) => ({ ...l, n: ++n })),
    }));
  }, [course]);

  const flat = useMemo(
    () =>
      modules.flatMap((m) =>
        m.lessons.map((l) => ({
          ...l,
          moduleNumeral: m.numeral,
          moduleTitle: m.title,
        })),
      ),
    [modules],
  );

  const open = flat.find((l) => l.id === openId) ?? flat[0];
  const set = flat.filter((l) => l.status !== "unset");
  const doneCount = flat.filter((l) => doneAt[l.id]).length;
  /* The accent means one thing: the Lesson you are up to. Which Lesson is
     open is carried by a raised ground in the rail, never by colour. */
  const live = set.find((l) => !doneAt[l.id]) ?? null;
  const openIndex = flat.findIndex((l) => l.id === open.id);
  const next =
    flat.slice(openIndex + 1).find((l) => l.status !== "unset") ?? null;

  function showPanel(mode: PanelMode) {
    setLastMode(mode);
    setPanel(mode);
  }

  function openLesson(id: string) {
    setOpenId(id);
    setJustDone(null);
    if (narrow) setRailChoice(false);
  }

  function markDone() {
    setJustDone(open.id);
    startTransition(async () => {
      const result = await onMark(open.id);
      if (result.ok) {
        setDoneAt((d) => ({ ...d, [open.id]: result.stamp }));
      } else {
        /* The mark did not land (stale revision, lost session): drop the
           handoff so the Lesson reads exactly as the server has it. */
        setJustDone(null);
        router.refresh();
      }
    });
  }

  function unmark() {
    setJustDone(null);
    startTransition(async () => {
      const result = await onUnmark(open.id);
      if (result.ok) {
        setDoneAt((d) => {
          const copy = { ...d };
          delete copy[open.id];
          return copy;
        });
      } else {
        router.refresh();
      }
    });
  }

  /* The Tutor's turn (#10): the client posts only the Lesson it is
     reading and the message; the server owns the conversation, the
     history, and the authorization. The answer streams back as plain
     text and grows in the pane's open turn. */
  async function askTutor(
    lessonId: string,
    text: string,
    onDelta: (chunk: string) => void,
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/courses/${course.id}/tutor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, message: text }),
      });
      if (!response.ok || !response.body) return false;

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return true;
        if (value) onDelta(value);
      }
    } catch {
      /* Network dropped mid-stream: the turn is not stored server-side,
         and the pane says so. */
      return false;
    }
  }

  /* The open Lesson's restored conversation, identity-stable between
     renders so the pane's live thread survives a re-render mid-stream. */
  const tutorTurnsFor = useMemo<Turn[]>(
    () => tutorHistory?.[open.id] ?? [],
    [tutorHistory, open.id],
  );

  /* The Tailor's turn (#12): one conversation for the whole Course, the
     server owns its history. When a turn completes, the server may have
     proposed a plan, so the review refreshes from it. */
  async function askTailor(
    text: string,
    onDelta: (chunk: string) => void,
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/courses/${course.id}/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) return false;

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          const fresh = await onRefreshPlan();
          setPlan(fresh);
          return true;
        }
        if (value) onDelta(value);
      }
    } catch {
      /* Network dropped mid-stream: the turn is not stored server-side,
         and the pane says so. */
      return false;
    }
  }

  /* The plan under review: server-restored, then locally amended by the
     review actions. A router refresh delivers the server's truth again. */
  const [plan, setPlan] = useState<PlanView | null | undefined>(tailorPlan);
  const [restoredPlan, setRestoredPlan] = useState(tailorPlan);
  if (tailorPlan !== restoredPlan) {
    setRestoredPlan(tailorPlan);
    setPlan(tailorPlan);
  }

  /* Staging a revision (#14): the accepted operations become a candidate
     the durable engine regenerates; the current Course stays readable. */
  const [staged, setStaged] = useState(false);
  const [, startStaging] = useTransition();

  async function reviewOperation(
    operationId: string,
    status: "accepted" | "discarded" | "proposed",
  ) {
    if (!plan) return;
    const result = await reviewTailorOperationAction(plan.id, operationId, status);
    if (result.ok) {
      setPlan((p) =>
        p
          ? {
              ...p,
              operations: p.operations.map((o) =>
                o.id === operationId ? { ...o, status } : o,
              ),
            }
          : p,
      );
    } else {
      /* The review did not land (plan applied elsewhere, lost session):
         the server's state wins. */
      setPlan(await onRefreshPlan());
    }
  }

  const tailorStatus = staged
    ? "A revision is being prepared from your accepted changes. The Course reads as it is until it publishes."
    : null;

  const tailorTurnsStable = useMemo<Turn[]>(() => tailorTurns ?? [], [tailorTurns]);

  /* Two keys, and both are navigation: the palette, and the Outline. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (key === "b") {
        e.preventDefault();
        setRailChoice((r) => !(r ?? !window.matchMedia("(max-width: 767px)").matches));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [];
    if (open.exercise) {
      list.push(
        doneAt[open.id]
          ? {
              id: "cmd-unmark",
              label: "Undo this Exercise",
              group: "Actions",
              run: unmark,
            }
          : {
              id: "cmd-mark",
              label: "Mark the Exercise done",
              group: "Actions",
              run: markDone,
            },
      );
    }
    list.push(
      {
        id: "cmd-tutor",
        label: "Open the Tutor",
        group: "Actions",
        run: () => showPanel("tutor"),
      },
      {
        id: "cmd-tailor",
        label: "Open the Tailor",
        group: "Actions",
        run: () => showPanel("tailor"),
      },
      {
        id: "cmd-rail",
        label: railOpen ? "Collapse the Outline" : "Expand the Outline",
        group: "Actions",
        run: () => setRailChoice(!railOpen),
      },
      {
        id: "cmd-outline",
        label: "Shape the Outline",
        group: "Actions",
        run: () => router.push(`/courses/${course.id}/outline`),
      },    );
    for (const l of flat) {
      if (l.status === "unset") continue;
      list.push({
        id: `go-${l.id}`,
        label: `${l.n}. ${l.title}`,
        hint: `${l.moduleNumeral}. ${l.moduleTitle}`,
        group: "Lessons",
        run: () => openLesson(l.id),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, open.id, open.exercise, doneAt, railOpen, router]);

  return (
    <SidebarProvider
      open={railOpen}
      onOpenChange={setRailChoice}
      className="h-full min-h-0 overflow-hidden bg-canvas"
      style={
        {
          "--sidebar-width": `${railWidth}rem`,
          "--sidebar-width-icon": "2.75rem",
        } as CSSProperties
      }
    >
      <Outline
        topic={course.topic}
        goal={course.goal}
        modules={modules}
        openId={open.id}
        liveId={live?.id ?? null}
        handing={justDone !== null}
        justDoneId={justDone}
        stampFor={(id) => doneAt[id]}
        onOpen={openLesson}
        onCollapse={() => setRailChoice(false)}
        onExpand={() => setRailChoice(true)}
        total={flat.length}
        doneCount={doneCount}
        resizer={
          <Resizer
            side="left"
            width={railWidth}
            min={RAIL_MIN}
            max={RAIL_MAX}
            onResize={setRailWidth}
          />
        }
      />

      {/* The panel is a rail of its own, so it gets its own provider: one
          open state each, and neither can close the other by accident. */}
      <SidebarProvider
        open={panel !== null}
        onOpenChange={(o) => (o ? showPanel(lastMode) : setPanel(null))}
        /* min-w-0: without it this wrapper's own min-content floor (the
           capped blocks plus the panel gap) overflows the row, and the
           fixed-position panel lands on top of the content. */
        className="min-h-0 min-w-0 flex-1"
        style={{ "--sidebar-width": `${panelWidth}rem` } as CSSProperties}
      >
        {/* Standard behaviour: the reading column sits centred in whatever
            room the open rails leave, at its default width, and only
            narrows when a rail actually crowds it. min-w-0 lets it give
            up ground all the way, instead of overflowing under the
            fixed-positioned rails. */}
        <SidebarInset className="min-h-0 min-w-0 bg-canvas">
          {/* the only chrome: what opens the palette, the panel, and the ground */}
          {/* the only chrome: what opens the palette, the panel, and the ground.
              It spans the region, not the reading column: the search sits
              centred over the sentence, the actions pin to the right edge. */}
          <div className="relative flex w-full shrink-0 items-center gap-2 px-5 py-3 sm:px-8 lg:px-10">
            <Button
              variant="icon"
              onClick={() => setRailChoice(true)}
              className={cn("md:hidden", railOpen ? "hidden" : "flex")}
              aria-label="Expand the Outline"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </Button>

            {/* A real input, but a doorway: focusing it hands off to the
                palette, which owns the typing. Centred over the column on
                desktop, in the flow beside the buttons on a phone. */}
            <div className="relative min-w-0 flex-1 md:absolute md:left-1/2 md:top-1/2 md:w-80 md:max-w-[calc(100%-9rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-none">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
                strokeWidth={1.75}
              />
              <Input
                readOnly
                placeholder="Go to a Lesson"
                aria-label="Go to a Lesson"
                onFocus={() => setPaletteOpen(true)}
                className="h-auto rounded-md border-transparent border-b-transparent bg-panel py-1.5 pr-10 pl-8 text-[0.8125rem] text-fg-3 hover:bg-raised"
              />
              <kbd className="tnum pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[0.6875rem] text-fg-dim sm:block">
                ⌘K
              </kbd>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <ThemeToggle />
              {panel ? null : (
                <Button
                  variant="icon"
                  onClick={() => showPanel(lastMode)}
                  aria-expanded={false}
                  aria-label={
                    lastMode === "tutor" ? "Open the Tutor" : "Open the Tailor"
                  }
                  title={lastMode === "tutor" ? "Open the Tutor" : "Open the Tailor"}
                  className="p-2"
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <LessonPane
              key={open.id}
              lesson={open}
              total={flat.length}
              stamp={doneAt[open.id]}
              striking={justDone === open.id}
              next={next ? { id: next.id, n: next.n, title: next.title } : null}
              sourceFor={sources ? (ref) => sources.get(ref) : undefined}
              onMark={markDone}
              onUnmark={unmark}
              onOpen={openLesson}
            />
          </div>
        </SidebarInset>

        <Panel
          mode={panel ?? lastMode}
          tutorTurns={tutorTurnsFor}
          onAsk={(text, onDelta) => askTutor(open.id, text, onDelta)}
          tailorTurns={tailorTurnsStable}
          onTailorAsk={askTailor}
          tailorPlan={plan ?? undefined}
          onMode={(m) => {
            setLastMode(m);
            setPanel(m);
          }}
          onClose={() => setPanel(null)}
          onAccept={(id) => reviewOperation(id, "accepted")}
          onDiscard={(id) => reviewOperation(id, "discarded")}
          onRestore={(id) => reviewOperation(id, "proposed")}
          tailorStatus={tailorStatus ?? undefined}
          tailorApply={
            plan ? (
              <Button
                onClick={() =>
                  startStaging(async () => {
                    const result = await stagePlanRevisionAction(course.id, plan.id);
                    if (result.ok) {
                      setPlan(null);
                      setStaged(true);
                    } else {
                      setPlan(await onRefreshPlan());
                    }
                  })
                }
                className="w-full"
              >
                Stage as a new revision
              </Button>
            ) : null
          }
          resizer={
            <Resizer
              side="right"
              width={panelWidth}
              min={PANEL_MIN}
              max={PANEL_MAX}
              onResize={setPanelWidth}
            />
          }
        />
      </SidebarProvider>

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
    </SidebarProvider>
  );
}
