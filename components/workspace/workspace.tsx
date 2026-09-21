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
import type { PlanView } from "@/components/tailor-conversation";
import { Outline, type ModuleView } from "./outline";
import { LessonPane } from "./lesson";
import { Margin, type MarginChatView, type MarginMode } from "./margin";
import { Resizer } from "./resizer";
import { CommandPalette, type Command } from "./palette";
import { ThemeToggle } from "./theme-toggle";
import { Hint } from "./hint";
import { useSyncedState } from "@/hooks/use-synced-state";

const OUTLINE_MIN = 16;
const OUTLINE_MAX = 24;
const OUTLINE_DEFAULT = 18;
const MARGIN_MIN = 18;
const MARGIN_MAX = 26;
const MARGIN_DEFAULT = 20;
/* Below 1440 a rail may not claim more than this. */
const COMPACT_RAIL_MAX = 21;

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

type Props = {
  course: ReadingCourse;
  sources?: Map<string, SourceLink>;
  onMark: (lessonId: string) => Promise<CompletionActionResult>;
  onUnmark: (lessonId: string) => Promise<CompletionActionResult>;
  /** The open Lesson's chats with the Tutor, oldest first, keyed by Lesson. */
  tutorChats?: Record<string, MarginChatView[]>;
  /** The Course's chats with the Tailor, oldest first. */
  tailorChats?: MarginChatView[];
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
  tutorChats,
  tailorChats,
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
  /* `undefined` is "no choice yet", so the shell opens with both rails;
     `null` is a learner who closed the margin. */
  const [marginChoice, setMarginChoice] = useState<MarginMode | null | undefined>(undefined);
  const [lastMode, setLastMode] = useState<MarginMode>("tutor");
  const [outlineWidth, setOutlineWidth] = useState(OUTLINE_DEFAULT);
  const [marginWidth, setMarginWidth] = useState(MARGIN_DEFAULT);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ text: string; x: number; y: number } | null>(null);
  const [reveal, setReveal] = useState<{ quote: string; token: number } | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [applying, setApplying] = useState(false);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const compact = useMediaQuery("(max-width: 1279px)");
  const wide = useMediaQuery("(min-width: 1440px)", true);
  const outlineMax = wide ? OUTLINE_MAX : COMPACT_RAIL_MAX;
  const marginMax = wide ? MARGIN_MAX : COMPACT_RAIL_MAX;
  /* Both rails open with a Course wherever the shell can hold them, from
     1280 up: the Outline on the left and the margin on the right. Below that
     each is a sheet, and a sheet opens only on a tap. */
  const railOpen = railChoice ?? !compact;
  const margin = marginChoice === undefined ? (compact ? null : lastMode) : marginChoice;
  const railOpenRef = useRef(railOpen);
  railOpenRef.current = railOpen;
  const marginRef = useRef(margin);
  marginRef.current = margin;

  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOutlineWidth((width) => Math.min(width, outlineMax));
    setMarginWidth((width) => Math.min(width, marginMax));
  }, [outlineMax, marginMax]);

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

  /* The passages this Lesson's threads grew from: each block holding one is
     addressable by Show in the Lesson. */
  const anchors = useMemo(
    () =>
      (tutorChats?.[open.id] ?? []).flatMap((chat) =>
        chat.turns.map((turn) => turn.anchor).filter((anchor): anchor is string => Boolean(anchor)),
      ),
    [tutorChats, open.id],
  );

  function showMargin(mode: MarginMode) {
    /* One sheet at a time: a compact screen has room for one overlay. */
    if (compact) setRailChoice(false);
    setLastMode(mode);
    setMarginChoice(mode);
  }

  function closeMargin() {
    setMarginChoice(null);
  }

  /* One sheet at a time: a compact screen has room for one overlay, so
     opening the rail closes the margin, and never the other way round. */
  function setRailOpen(open: boolean) {
    setRailChoice(open);
    if (open && compact && marginRef.current !== null) setMarginChoice(null);
  }

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      /* The shell just became compact: no sheet opens itself. */
      setRailChoice(false);
      setMarginChoice(null);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function openLesson(id: string) {
    setOpenId(id);
    setJustDone(null);
    setPendingAnchor(null);
    setPicked(null);
    if (compact) setRailChoice(false);
  }

  /* A selection in the Lesson raises the bracket and its Ask. */
  useEffect(() => {
    function readSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPicked(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const article = articleRef.current;
      if (!article || !article.contains(range.commonAncestorContainer)) {
        setPicked(null);
        return;
      }
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (text.length < 2) {
        setPicked(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPicked({
        text: text.slice(0, 600),
        x: Math.min(rect.right + 10, window.innerWidth - 152),
        y: Math.min(rect.bottom + 8, window.innerHeight - 44),
      });
    }
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const clear = () => setPicked(null);
    el.addEventListener("scroll", clear, { passive: true });
    return () => el.removeEventListener("scroll", clear);
  }, []);

  function askAboutSelection() {
    if (!picked) return;
    setPendingAnchor(picked.text);
    setPicked(null);
    window.getSelection()?.removeAllRanges();
    setFocusToken((token) => token + 1);
    showMargin("tutor");
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

  const [plan, setPlan] = useSyncedState(tailorPlan);

  /* A finished turn refreshes the server view, so switching Lessons or chats
     restores it; the Tailor's turns can also leave a plan behind. */
  async function marginFinished() {
    setPlan(await onRefreshPlan());
    router.refresh();
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

  const tutorChatsHere = useMemo<MarginChatView[]>(
    () => tutorChats?.[open.id] ?? [],
    [tutorChats, open.id],
  );
  const tailorChatsStable = useMemo<MarginChatView[]>(() => tailorChats ?? [], [tailorChats]);

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
        if (next && window.matchMedia("(max-width: 1279px)").matches) {
          setMarginChoice(null);
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
        run: () => showMargin("tutor"),
      },
      {
        id: "cmd-tailor",
        label: "Open the Tailor",
        group: "Actions",
        run: () => showMargin("tailor"),
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

  const modeName = lastMode === "tutor" ? "Tutor" : "Tailor";
  const marginLabel = margin ? `Close the ${modeName}` : `Open the ${modeName}`;

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
        open={margin !== null}
        onOpenChange={(o) => (o ? showMargin(lastMode) : closeMargin())}
        isMobile={compact}
        className="min-h-0 min-w-0 flex-1"
        style={{ "--sidebar-width": `${marginWidth}rem` } as CSSProperties}
      >
        <SidebarInset className="min-h-0 min-w-0 bg-canvas">
          <nav
            aria-label="Course tools"
            className="relative flex h-14 w-full shrink-0 items-center gap-2 px-5 sm:px-8 lg:px-10"
          >
            <Button
              variant="icon"
              onClick={() => setRailOpen(true)}
              aria-label="Expand the Outline"
              className={cn(!compact || railOpen ? "hidden" : "flex")}
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </Button>

            <div className="relative min-w-0 flex-1 md:absolute md:top-1/2 md:left-1/2 md:w-80 md:max-w-[calc(100%-9rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-none">
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

            {/* With the margin open the cluster steps clear of it, so the
                shell keeps a live control where the rail cannot cover it. */}
            <div
              className="ml-auto flex shrink-0 items-center gap-1 transition-[margin-right] duration-160 ease-expo"
              style={
                !compact && margin ? { marginRight: `calc(${marginWidth}rem - 1.5rem)` } : undefined
              }
            >
              <ThemeToggle />
              <Hint label={marginLabel}>
                <Button
                  variant="icon"
                  onClick={() => (margin ? closeMargin() : showMargin(lastMode))}
                  aria-expanded={margin !== null}
                  aria-label={marginLabel}
                  className="h-8 w-8 p-2"
                >
                  {margin ? (
                    <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <PanelRight className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </Button>
              </Hint>
            </div>
          </nav>

          <LessonPane
            key={open.id}
            lesson={open}
            total={flat.length}
            stamp={doneAt[open.id]}
            striking={justDone === open.id}
            anchors={anchors}
            previous={previous ? { id: previous.id, n: previous.n, title: previous.title } : null}
            next={next ? { id: next.id, n: next.n, title: next.title } : null}
            sourceFor={sources ? (ref) => sources.get(ref) : undefined}
            reveal={reveal}
            portRef={scrollRef}
            articleRef={articleRef}
            onMark={markDone}
            onUnmark={unmark}
            onOpen={openLesson}
          />
        </SidebarInset>

        <Margin
          courseId={course.id}
          lessonId={open.id}
          mode={margin ?? lastMode}
          onMode={(m) => {
            setLastMode(m);
            setMarginChoice(m);
          }}
          tutorChats={tutorChatsHere}
          tailorChats={tailorChatsStable}
          pendingAnchor={pendingAnchor}
          onClearAnchor={() => setPendingAnchor(null)}
          onRevealAnchor={revealQuote}
          focusToken={focusToken}
          searchStale={searchStaleNow}
          rebuilding={rebuilding}
          onRebuild={rebuildSearch}
          plan={plan ?? null}
          applying={applying}
          onApply={() => void applyPlan()}
          onDiscard={(id) => reviewOperation(id, "discarded")}
          onRestore={(id) => reviewOperation(id, "proposed")}
          revisionStatus={revisionStatus}
          revisionFailed={stagedRevision?.failed ?? false}
          onRetryRevision={retryStagedRevision}
          onDiscardRevision={discardStaged}
          published={published}
          publishedFailed={publishedFailed}
          onRetryPublished={() => setPublishedKey((k) => k + 1)}
          onUndo={undoPlan}
          onFinished={() => void marginFinished()}
          onClose={closeMargin}
          resizer={
            <Resizer
              side="right"
              width={marginWidth}
              min={MARGIN_MIN}
              max={marginMax}
              defaultWidth={MARGIN_DEFAULT}
              onResize={setMarginWidth}
            />
          }
        />
      </SidebarProvider>

      {picked ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={askAboutSelection}
          style={{ left: picked.x, top: picked.y }}
          className="fixed z-50 flex items-center gap-2 rounded-sm border border-hair bg-float px-2 py-1 text-[0.75rem] text-fg-2 transition-colors hover:text-fg"
        >
          <span aria-hidden className="block h-3.5 w-px bg-rule" />
          Ask the Tutor
        </button>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
    </SidebarProvider>
  );
}
