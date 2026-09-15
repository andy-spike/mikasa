"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { PanelLeftOpen, PanelRight, PanelRightClose, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-mobile";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { ReadingCourse, SourceLink } from "@/lib/course/reading";
import type { CompletionActionResult } from "@/lib/actions/completion";
import {
  listPublishedPlansAction,
  findStagedPlanAction,
  reviewTailorOperationAction,
  acceptProposedOperationsAction,
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
import { Hint } from "./hint";
import { useSyncedState } from "@/hooks/use-synced-state";

const OUTLINE_MIN = 16;
const OUTLINE_MAX = 24;
const OUTLINE_DEFAULT = 18;
const PANEL_MIN = 18;
const PANEL_MAX = 26;
const PANEL_DEFAULT = 21;
const COMPACT_PANEL_MAX = 21;

const STAGE_MESSAGES: Record<string, string> = {
  lessons: "Writing the changed Lessons…",
  review: "Reviewing the Course revision…",
  publish: "Publishing the Course revision…",
};

function stageWords(stage: string | null): string {
  if (stage?.startsWith("corrections")) return "Correcting the changed Lessons…";
  return (stage && STAGE_MESSAGES[stage]) ?? "Preparing the Course revision…";
}

function revisionStatusText(
  staged: boolean,
  stagedRevision: StagedPlanView | null | undefined,
  pollFailed: boolean,
): string | null {
  if (stagedRevision?.failed) {
    return `${stageWords(stagedRevision.stage).replace("…", ":")} ${stagedRevision.error ?? "The revision did not finish."}`;
  }
  if (!staged && !stagedRevision) return null;
  return (
    stageWords(stagedRevision?.stage ?? null) +
    (pollFailed ? " Its status could not refresh just now — still trying." : "")
  );
}

function SearchStaleNotice({
  rebuilding,
  onRebuild,
}: {
  rebuilding: boolean;
  onRebuild: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hair px-3.5 py-2">
      <p className="text-[0.75rem] leading-[1.5] text-fg-3">Course search is out of date.</p>
      <Button variant="quiet" onClick={onRebuild} disabled={rebuilding} className="shrink-0">
        Rebuild
      </Button>
    </div>
  );
}

function PublishedList({
  rows,
  failed,
  onRetry,
  onUndo,
}: {
  rows: PublishedPlanRow[];
  failed: boolean;
  onRetry: () => void;
  onUndo: (planId: string) => void;
}) {
  if (rows.length === 0) {
    if (!failed) return null;
    return (
      <div className="mt-5">
        <p className="label text-fg-3">Published changes</p>
        <p className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
          Published changes could not load.
        </p>
        <Button variant="quiet" onClick={onRetry} className="mt-1 -ml-1">
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-5">
      <p className="label text-fg-3">Published changes</p>
      <ul className="mt-3 space-y-3.5">
        {rows.map((row) => (
          <li key={row.plan.id} className="text-[0.8125rem] leading-[1.5]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-fg-2">
                Revision {row.publishedRevisionNumber} · {row.plan.operations.length}{" "}
                {row.plan.operations.length === 1 ? "change" : "changes"}
              </span>
              {row.canUndo ? (
                <Button variant="quiet" onClick={() => onUndo(row.plan.id)} className="shrink-0">
                  Undo
                </Button>
              ) : (
                <span className="text-[0.75rem] text-fg-3">{row.blockedReason}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {failed && (
        <Button variant="quiet" onClick={onRetry} className="mt-2 -ml-1">
          Retry
        </Button>
      )}
    </div>
  );
}

function RevisionBanner({
  status,
  failed,
  onRetry,
  onDiscard,
}: {
  status: string;
  failed: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="-mx-3.5 mb-5 border-y border-hair bg-canvas px-3.5 py-3"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 bg-fg-3 ${failed ? "" : "animate-pulse"}`}
        />
        <div className="min-w-0">
          <p className="text-[0.8125rem] leading-[1.5] font-medium text-fg">{status}</p>
          {!failed && (
            <p className="mt-1 text-[0.75rem] leading-[1.5] text-fg-3">
              You can keep navigating the Course while this finishes.
            </p>
          )}
        </div>
      </div>

      {failed && (
        <div className="mt-3 flex items-center gap-2 pl-4">
          <Button onClick={onRetry} className="min-w-0 flex-1">
            Retry the revision
          </Button>
          <Button variant="quiet" onClick={onDiscard} className="shrink-0">
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

type Props = {
  course: ReadingCourse;
  sources?: Map<string, SourceLink>;
  onMark: (lessonId: string) => Promise<CompletionActionResult>;
  onUnmark: (lessonId: string) => Promise<CompletionActionResult>;
  tutorHistory?: Record<string, Turn[]>;
  tailorTurns?: Turn[];
  tailorPlan?: PlanView | null;
  stagedPlan?: StagedPlanView | null;
  searchStale?: boolean;
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
  const [railChoice, setRailChoice] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [lastMode, setLastMode] = useState<PanelMode>("tutor");
  const [outlineWidth, setOutlineWidth] = useState(OUTLINE_DEFAULT);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ quote: string; token: number } | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [applying, setApplying] = useState(false);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const compact = useMediaQuery("(max-width: 1279px)");
  const wide = useMediaQuery("(min-width: 1440px)", true);
  const outlineMax = wide ? OUTLINE_MAX : COMPACT_PANEL_MAX;
  const panelMax = wide ? PANEL_MAX : COMPACT_PANEL_MAX;
  const railOpen = railChoice ?? wide;
  const railOpenRef = useRef(railOpen);
  railOpenRef.current = railOpen;
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const restoreRailRef = useRef<boolean | null>(null);

  useEffect(() => {
    setOutlineWidth((width) => Math.min(width, outlineMax));
    setPanelWidth((width) => Math.min(width, panelMax));
  }, [outlineMax, panelMax]);

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
  const live = set.find((l) => !doneAt[l.id]) ?? null;
  const openIndex = flat.findIndex((l) => l.id === open.id);
  const previous =
    [...flat.slice(0, openIndex)].reverse().find((l) => l.status !== "unset") ?? null;
  const next = flat.slice(openIndex + 1).find((l) => l.status !== "unset") ?? null;

  function showPanel(mode: PanelMode) {
    if (!wide) {
      if (!compact) restoreRailRef.current = railOpenRef.current;
      setRailChoice(false);
    }
    setLastMode(mode);
    setPanel(mode);
  }

  function closePanel() {
    setPanel(null);
    if (!compact && !wide && restoreRailRef.current !== null) {
      setRailChoice(restoreRailRef.current);
    }
    restoreRailRef.current = null;
  }

  function setRailOpen(open: boolean) {
    setRailChoice(open);
    if (open && !wide && panelRef.current !== null) {
      setPanel(null);
      restoreRailRef.current = null;
    }
  }

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1439px)");
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
    setPendingAnchor(null);
    if (compact) setRailChoice(false);
  }

  /* A selection in the Lesson becomes the Tutor's next question. */
  function askAbout(text: string) {
    setPendingAnchor(text);
    setFocusToken((token) => token + 1);
    showPanel("tutor");
  }

  function revealQuote(quote: string) {
    setReveal({ quote, token: Date.now() });
  }

  function markDone() {
    setJustDone(open.id);
    startTransition(async () => {
      const result = await onMark(open.id);
      if (result.ok) {
        setDoneAt((d) => ({ ...d, [open.id]: result.stamp }));
      } else {
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

  const tutorTurnsFor = useMemo<Turn[]>(
    () => tutorHistory?.[open.id] ?? [],
    [tutorHistory, open.id],
  );

  /* Neon holds the conversation; a finished turn refreshes the server view so
     switching Lessons restores it. */
  function tutorFinished() {
    router.refresh();
  }

  const [plan, setPlan] = useSyncedState(tailorPlan);

  async function tailorFinished() {
    setPlan(await onRefreshPlan());
  }

  const [staged, setStaged] = useState(false);
  const [stagedRevision, setStagedRevision] = useSyncedState(stagedPlan);

  const [searchStaleNow, setSearchStaleNow] = useSyncedState(searchStale ?? false);
  const [rebuilding, setRebuilding] = useState(false);

  function rebuildSearch() {
    startTransition(async () => {
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
        void 0;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [rebuilding, course.id, router, setSearchStaleNow]);

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
    startTransition(async () => {
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

  function discardStaged() {
    if (!stagedRevision) return;
    startTransition(async () => {
      const result = await discardStagedRevisionAction(course.id, stagedRevision.plan.id);
      if (result.ok) {
        setStaged(false);
        setStagedRevision(null);
        router.refresh();
      }
    });
  }

  function beginRevision(planId: string) {
    setPlan(null);
    setStaged(true);
    setStagedRevision(null);
    startTransition(async () => {
      const result = await stagePlanRevisionAction(course.id, planId);
      if (!result.ok) {
        setStaged(false);
        setPlan(await onRefreshPlan());
        return;
      }
      const revision = await findStagedPlanAction(course.id);
      setStagedRevision(revision);
      if (!revision) setStaged(false);
    });
  }

  /* Applying accepts every row still standing, then stages the revision. */
  async function applyPlan() {
    if (!plan || applying) return;
    const planId = plan.id;
    setApplying(true);
    const accepted = await acceptProposedOperationsAction(planId);
    if (!accepted.ok) {
      setPlan(await onRefreshPlan());
      setApplying(false);
      return;
    }
    beginRevision(planId);
    setApplying(false);
  }

  async function reviewOperation(operationId: string, status: "discarded" | "proposed") {
    if (!plan) return;
    const result = await reviewTailorOperationAction(plan.id, operationId, status);
    if (result.ok) {
      setPlan({
        ...plan,
        operations: plan.operations.map((operation) =>
          operation.id === operationId ? { ...operation, status } : operation,
        ),
      });
    } else {
      setPlan(await onRefreshPlan());
    }
  }

  const [stagedPollFailed, setStagedPollFailed] = useState(false);
  const revisionStatus = revisionStatusText(staged, stagedRevision, stagedPollFailed);

  function retryStagedRevision() {
    if (!stagedRevision) return;
    setStagedRevision({ ...stagedRevision, failed: false, error: null, stage: "queued" });
    startTransition(async () => {
      const result = await retryPlanRevisionAction(course.id, stagedRevision.plan.id);
      if (result.ok) {
        setStagedRevision(await findStagedPlanAction(course.id));
      }
    });
  }

  useEffect(() => {
    if (!stagedRevision || stagedRevision.failed) return;
    const timer = setInterval(() => {
      findStagedPlanAction(course.id)
        .then((s) => {
          setStagedRevision(s);
          setStagedPollFailed(false);
          if (!s) {
            setStaged(false);
            setPublishedKey((key) => key + 1);
            router.refresh();
          }
        })
        .catch(() => setStagedPollFailed(true));
    }, 4000);
    return () => clearInterval(timer);
  }, [course.id, router, stagedRevision, setStagedRevision]);

  const tailorTurnsStable = useMemo<Turn[]>(() => tailorTurns ?? [], [tailorTurns]);

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
        if (next && window.matchMedia("(max-width: 1439px)").matches) {
          setPanel(null);
          restoreRailRef.current = null;
        }
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
      ...flat
        .filter((l) => l.status !== "unset")
        .map((l) => ({
          id: `go-${l.id}`,
          label: `${l.n}. ${l.title}`,
          hint: `${l.moduleNumeral}. ${l.moduleTitle}`,
          group: "Lessons",
          run: () => openLesson(l.id),
        })),
    );
    return list;
    // oxlint-disable-next-line react/exhaustive-deps
  }, [flat, open.id, open.exercise, doneAt, railOpen, router]);

  const panelLabel = panel
    ? `Close the ${panel === "tutor" ? "Tutor" : "Tailor"}`
    : `Open the ${lastMode === "tutor" ? "Tutor" : "Tailor"}`;

  return (
    <SidebarProvider
      open={railOpen}
      onOpenChange={setRailOpen}
      isMobile={compact}
      className="h-full min-h-0 overflow-hidden bg-canvas"
      style={
        {
          "--sidebar-width": `${outlineWidth}rem`,
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
            width={outlineWidth}
            min={OUTLINE_MIN}
            max={outlineMax}
            defaultWidth={OUTLINE_DEFAULT}
            onResize={setOutlineWidth}
          />
        }
      />

      <SidebarProvider
        open={panel !== null}
        onOpenChange={(o) => (o ? showPanel(lastMode) : closePanel())}
        isMobile={compact}
        className="min-h-0 min-w-0 flex-1"
        style={{ "--sidebar-width": `${panelWidth}rem` } as CSSProperties}
      >
        <SidebarInset className="min-h-0 min-w-0 bg-canvas">
          <nav
            aria-label="Course tools"
            className="relative flex h-14 w-full shrink-0 items-center gap-2 px-5 sm:px-8 lg:px-10"
          >
            <Button
              variant="icon"
              onClick={() => setRailOpen(true)}
              className={cn(!compact || railOpen ? "hidden" : "flex")}
              aria-label="Expand the Outline"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </Button>

            <div className="relative min-w-0 flex-1 md:absolute md:left-1/2 md:top-1/2 md:w-80 md:max-w-[calc(100%-9rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-none">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
                strokeWidth={1.75}
              />
              <button
                type="button"
                aria-label="Go to a Lesson"
                aria-haspopup="dialog"
                aria-expanded={paletteOpen}
                onClick={() => setPaletteOpen(true)}
                className="flex h-8 w-full min-w-0 items-center bg-panel pr-10 pl-8 text-left text-[0.8125rem] text-fg-3 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live"
              >
                Go to a Lesson
              </button>
              <kbd className="tnum pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 bg-raised px-1.5 py-0.5 font-mono text-[0.6875rem] text-fg-dim sm:block">
                ⌘ K
              </kbd>
            </div>

            <div
              className="ml-auto flex shrink-0 items-center gap-1 transition-[margin-right] duration-160 ease-expo"
              style={
                !compact && panel ? { marginRight: `calc(${panelWidth}rem - 1.5rem)` } : undefined
              }
            >
              <ThemeToggle />
              <Hint label={panelLabel}>
                <Button
                  variant="icon"
                  onClick={() => (panel ? closePanel() : showPanel(lastMode))}
                  aria-expanded={panel !== null}
                  aria-label={panelLabel}
                  className="h-8 w-8 p-2"
                >
                  {panel ? (
                    <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <PanelRight className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </Button>
              </Hint>
            </div>
          </nav>

          <div className="min-h-0 flex-1">
            <LessonPane
              key={open.id}
              lesson={open}
              total={flat.length}
              stamp={doneAt[open.id]}
              striking={justDone === open.id}
              previous={previous ? { id: previous.id, n: previous.n, title: previous.title } : null}
              next={next ? { id: next.id, n: next.n, title: next.title } : null}
              sourceFor={sources ? (ref) => sources.get(ref) : undefined}
              reveal={reveal}
              onAskAbout={askAbout}
              onMark={markDone}
              onUnmark={unmark}
              onOpen={openLesson}
            />
          </div>
        </SidebarInset>

        <Panel
          mode={panel ?? lastMode}
          courseId={course.id}
          lessonId={open.id}
          lessonTitle={open.title}
          tutorTurns={tutorTurnsFor}
          onTutorFinished={tutorFinished}
          pendingAnchor={pendingAnchor}
          onClearAnchor={() => setPendingAnchor(null)}
          onRevealAnchor={revealQuote}
          focusToken={focusToken}
          tailorTurns={tailorTurnsStable}
          onTailorFinished={tailorFinished}
          tailorPlan={plan ?? undefined}
          onMode={(m) => {
            setLastMode(m);
            setPanel(m);
          }}
          onClose={closePanel}
          onApply={() => void applyPlan()}
          applying={applying}
          onDiscard={(id) => reviewOperation(id, "discarded")}
          onRestore={(id) => reviewOperation(id, "proposed")}
          tutorNotice={
            searchStaleNow ? (
              <SearchStaleNotice rebuilding={rebuilding} onRebuild={rebuildSearch} />
            ) : null
          }
          publishedSlot={
            <PublishedList
              rows={published}
              failed={publishedFailed}
              onRetry={() => setPublishedKey((k) => k + 1)}
              onUndo={undoPlan}
            />
          }
          revisionSlot={
            revisionStatus ? (
              <RevisionBanner
                status={revisionStatus}
                failed={stagedRevision?.failed ?? false}
                onRetry={retryStagedRevision}
                onDiscard={discardStaged}
              />
            ) : null
          }
          resizer={
            <Resizer
              side="right"
              width={panelWidth}
              min={PANEL_MIN}
              max={panelMax}
              defaultWidth={PANEL_DEFAULT}
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
