"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { PanelLeftOpen, PanelRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReadingCourse, SourceLink } from "@/lib/course/reading";
import type { CompletionActionResult } from "@/lib/actions/completion";
import {
  listPublishedPlansAction,
  findStagedPlanAction,
  reviewTailorOperationAction,
  retryPlanRevisionAction,
  discardStagedRevisionAction,
  stagePlanRevisionAction,
  undoPlanRevisionAction,
  type PublishedPlanRow,
  type StagedPlanView,
} from "@/lib/actions/tailor";
import { rebuildFragmentsAction, searchIsIncompleteAction } from "@/lib/actions/courses";
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

/* useLayoutEffect runs before paint on the client and warns on the server;
   read the width where it lives instead. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  /** The one staged Course revision, if the Tailor has one. */
  stagedPlan?: StagedPlanView | null;
  /** Whether the Tutor's search index lags the published Course (bug 9). */
  searchStale?: boolean;
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
  stagedPlan,
  searchStale,
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
  /* A drag wins over the spec default below. */
  const railCustom = useRef(false);
  /* The rail opens at 20rem, 23rem from xl up. Before paint on the client,
     so an xl load never flashes the narrow rail. */
  useIsoLayoutEffect(() => {
    if (!railCustom.current && window.matchMedia("(min-width: 1280px)").matches) {
      setRailWidth(23);
    }
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* transient: the handoff plays on the mark, never on a revisit */
  const [justDone, setJustDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const narrow = useIsMobile();
  const railOpen = railChoice ?? !narrow;
  /* The keyboard and viewport listeners outlive a render, so they read
     the rails through refs instead of closing over stale state. */
  const railOpenRef = useRef(railOpen);
  railOpenRef.current = railOpen;
  const panelRef = useRef(panel);
  panelRef.current = panel;

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
  const next = flat.slice(openIndex + 1).find((l) => l.status !== "unset") ?? null;

  /* Below 1280 the shell shows two regions at most: opening the panel
     collapses the rail, and expanding the rail closes the panel. The
     most recent action wins. Crossing the breakpoint with both open
     collapses the rail — the panel was the deliberate action. */
  const below1279 = () => window.matchMedia("(max-width: 1279px)").matches;

  function showPanel(mode: PanelMode) {
    if (below1279()) setRailChoice(false);
    setLastMode(mode);
    setPanel(mode);
  }

  function setRailOpen(open: boolean) {
    setRailChoice(open);
    if (open && below1279() && panelRef.current !== null) setPanel(null);
  }

  /* Crossing the breakpoint enforces the same invariant: shrunk below
     1280 with both open, the rail gives way (the panel was the
     deliberate action). Growing changes nothing. */
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches && railOpenRef.current && panelRef.current !== null) {
        setRailChoice(false);
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

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
  async function askTailor(text: string, onDelta: (chunk: string) => void): Promise<boolean> {
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
  const [stagedRevision, setStagedRevision] = useState(stagedPlan);
  const [restoredStagedRevision, setRestoredStagedRevision] = useState(stagedPlan);
  if (stagedPlan !== restoredStagedRevision) {
    setRestoredStagedRevision(stagedPlan);
    setStagedRevision(stagedPlan);
  }
  const [, startStaging] = useTransition();

  /* The Tutor's search index (bug 9): the server's staleness verdict,
     locally amended while a rebuild runs. The strip clears itself when
     the repair's re-embed lands. */
  const [searchStaleNow, setSearchStaleNow] = useState(searchStale ?? false);
  const [restoredStale, setRestoredStale] = useState(searchStale);
  if (searchStale !== restoredStale) {
    setRestoredStale(searchStale);
    setSearchStaleNow(searchStale ?? false);
  }
  const [rebuilding, setRebuilding] = useState(false);

  function rebuildSearch() {
    startStaging(async () => {
      const result = await rebuildFragmentsAction(course.id);
      if (result.ok) {
        setRebuilding(true);
        router.refresh();
      }
    });
  }

  useEffect(() => {
    if (!rebuilding) return;
    const timer = setInterval(async () => {
      try {
        if (!(await searchIsIncompleteAction(course.id))) {
          setRebuilding(false);
          setSearchStaleNow(false);
          router.refresh();
        }
      } catch {
        /* A failed poll changes nothing; the next one re-checks. */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [rebuilding, course.id, router]);

  /* The published changes, with their undo availability (#15). */
  const [published, setPublished] = useState<PublishedPlanRow[]>([]);
  const [publishedFailed, setPublishedFailed] = useState(false);
  const [publishedKey, setPublishedKey] = useState(0);
  useEffect(() => {
    let live = true;
    listPublishedPlansAction(course.id)
      .then((rows) => {
        if (!live) return;
        setPublished(rows);
        setPublishedFailed(false);
      })
      .catch(() => {
        if (live) setPublishedFailed(true);
      });
    return () => {
      live = false;
    };
  }, [course.id, publishedKey]);

  function undoPlan(planId: string) {
    startStaging(async () => {
      const result = await undoPlanRevisionAction(course.id, planId);
      if (result.ok) {
        setStaged(false);
        setPublishedKey((k) => k + 1);
        router.refresh();
      }
      try {
        setPublished(await listPublishedPlansAction(course.id));
      } catch {
        setPublishedFailed(true);
      }
    });
  }

  /* A failed staged revision can be given up on (bug 10): the plan is
     superseded, the staged view clears, and the Tailor can propose a
     fresh plan. Nothing published changes. */
  function discardStaged() {
    if (!stagedRevision) return;
    startStaging(async () => {
      const result = await discardStagedRevisionAction(course.id, stagedRevision.plan.id);
      if (result.ok) {
        setStaged(false);
        setStagedRevision(null);
        router.refresh();
      }
    });
  }

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
              operations: p.operations.map((o) => (o.id === operationId ? { ...o, status } : o)),
            }
          : p,
      );
    } else {
      /* The review did not land (plan applied elsewhere, lost session):
         the server's state wins. */
      setPlan(await onRefreshPlan());
    }
  }

  /* The failed stage, in Learner words: the line names where the
     revision died, so a retry's promise ("keeps the finished work") is
     legible (bug 2). */
  const stageWords = (stage: string | null): string | null => {
    if (!stage || stage === "queued") return null;
    if (stage === "lessons") return "writing the Lessons";
    if (stage.startsWith("corrections")) return "correcting the Lessons";
    if (stage === "review") return "reviewing";
    if (stage === "publish") return "publishing";
    return null;
  };

  const [stagedPollFailed, setStagedPollFailed] = useState(false);
  const tailorStatus = stagedRevision?.failed
    ? `The staged revision failed while ${
        stageWords(stagedRevision.stage) ?? "it was being prepared"
      }: ${stagedRevision.error ?? "The revision did not finish."}`
    : staged || stagedRevision
      ? "A revision is being prepared from your accepted changes. The Course reads as it is until it publishes." +
        (stagedPollFailed ? " Its status could not refresh just now — still trying." : "")
      : null;

  useEffect(() => {
    if (!stagedRevision || stagedRevision.failed) return;
    const timer = setInterval(() => {
      findStagedPlanAction(course.id)
        .then((s) => {
          setStagedRevision(s);
          setStagedPollFailed(false);
        })
        .catch(() => setStagedPollFailed(true));
    }, 4000);
    return () => clearInterval(timer);
  }, [course.id, stagedRevision]);

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
        const next = !railOpenRef.current;
        setRailChoice(next);
        if (next && window.matchMedia("(max-width: 1279px)").matches) setPanel(null);
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
        run: () => setRailOpen(!railOpen),
      },
      {
        id: "cmd-outline",
        label: "Shape the Outline",
        group: "Actions",
        run: () => router.push(`/courses/${course.id}/outline`),
      },
    );
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
    // oxlint-disable-next-line react/exhaustive-deps
  }, [flat, open.id, open.exercise, doneAt, railOpen, router]);

  return (
    <SidebarProvider
      open={railOpen}
      onOpenChange={setRailOpen}
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
        onExpand={() => setRailOpen(true)}
        total={flat.length}
        doneCount={doneCount}
        resizer={
          <Resizer
            side="left"
            width={railWidth}
            min={RAIL_MIN}
            max={RAIL_MAX}
            onResize={(w) => {
              railCustom.current = true;
              setRailWidth(w);
            }}
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
        <SidebarInset
          className={cn(
            /* From 2xl up the closed panel keeps its width in reserve as a
               right pad; open, the offcanvas gap already holds that space,
               so the sentence never moves either way. */
            !panel && "mk-panel-reserve",
            "min-h-0 min-w-0 bg-canvas transition-[padding-right,padding-left] duration-200 ease-linear",
          )}
          style={
            {
              /* Collapsed, the rail keeps a 2.75rem stub: the region takes
                 the rest of the rail back as a left pad, so the sentence
                 holds still. A sheet has no stub, so this stays a desktop
                 rule. */
              ...(!railOpen && !narrow ? { paddingLeft: `${railWidth - 2.75}rem` } : null),
              ...(!panel ? { "--mk-panel-reserve": `${panelWidth}rem` } : null),
            } as CSSProperties
          }
        >
          {/* the only chrome: what opens the palette, the panel, and the ground.
              It spans the region, not the reading column: the search sits
              centred over the sentence, the actions pin to the right edge. */}
          <div className="relative flex w-full shrink-0 items-center gap-2 px-5 py-3 sm:px-8 lg:px-10">
            <Button
              variant="icon"
              onClick={() => setRailOpen(true)}
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
                  aria-label={lastMode === "tutor" ? "Open the Tutor" : "Open the Tailor"}
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
          tutorNotice={
            searchStaleNow ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hair px-3.5 py-2">
                <p className="text-[0.75rem] leading-[1.5] text-fg-3">
                  Course search is out of date.
                </p>
                <Button
                  variant="quiet"
                  onClick={rebuildSearch}
                  disabled={rebuilding}
                  className="shrink-0"
                >
                  Rebuild
                </Button>
              </div>
            ) : null
          }
          publishedSlot={
            publishedFailed && published.length === 0 ? (
              <div className="mt-5">
                <p className="label text-fg-3">Published changes</p>
                <p className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
                  Published changes could not load.
                </p>
                <Button
                  variant="quiet"
                  onClick={() => setPublishedKey((k) => k + 1)}
                  className="mt-1 -ml-1"
                >
                  Retry
                </Button>
              </div>
            ) : published.length > 0 ? (
              <div className="mt-5">
                <p className="label text-fg-3">Published changes</p>
                <ul className="mt-3 space-y-3.5">
                  {published.map((row) => (
                    <li key={row.plan.id} className="text-[0.8125rem] leading-[1.5]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-fg-2">
                          Revision {row.publishedRevisionNumber} · {row.plan.operations.length}{" "}
                          {row.plan.operations.length === 1 ? "change" : "changes"}
                        </span>
                        {row.canUndo ? (
                          <Button
                            variant="quiet"
                            onClick={() => undoPlan(row.plan.id)}
                            className="shrink-0"
                          >
                            Undo
                          </Button>
                        ) : (
                          <span className="text-[0.75rem] text-fg-3">{row.blockedReason}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {publishedFailed ? (
                  <Button
                    variant="quiet"
                    onClick={() => setPublishedKey((k) => k + 1)}
                    className="mt-2 -ml-1"
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null
          }
          tailorApply={
            plan ? (
              <Button
                onClick={() =>
                  startStaging(async () => {
                    const result = await stagePlanRevisionAction(course.id, plan.id);
                    if (result.ok) {
                      setPlan(null);
                      setStaged(true);
                      setStagedRevision(await findStagedPlanAction(course.id));
                      setPublishedKey((k) => k + 1);
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
          stagedFailedSlot={
            stagedRevision?.failed ? (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() =>
                    startStaging(async () => {
                      const result = await retryPlanRevisionAction(
                        course.id,
                        stagedRevision.plan.id,
                      );
                      if (result.ok) setStagedRevision(await findStagedPlanAction(course.id));
                    })
                  }
                  className="min-w-0 flex-1"
                >
                  Retry the revision
                </Button>
                <Button variant="quiet" onClick={discardStaged} className="shrink-0">
                  Discard
                </Button>
              </div>
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
