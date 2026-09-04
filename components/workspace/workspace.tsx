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

const RAIL_MIN = 16;
const RAIL_MAX = 28;
const PANEL_MIN = 18;
const PANEL_MAX = 30;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  const [railWidth, setRailWidth] = useState(20);
  const [panelWidth, setPanelWidth] = useState(21);
  const railCustom = useRef(false);
  useIsoLayoutEffect(() => {
    if (!railCustom.current && window.matchMedia("(min-width: 1280px)").matches) {
      setRailWidth(23);
    }
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const narrow = useIsMobile();
  const railOpen = railChoice ?? !narrow;
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
  const live = set.find((l) => !doneAt[l.id]) ?? null;
  const openIndex = flat.findIndex((l) => l.id === open.id);
  const next = flat.slice(openIndex + 1).find((l) => l.status !== "unset") ?? null;

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
      return false;
    }
  }

  const tutorTurnsFor = useMemo<Turn[]>(
    () => tutorHistory?.[open.id] ?? [],
    [tutorHistory, open.id],
  );

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
      return false;
    }
  }

  const [plan, setPlan] = useState<PlanView | null | undefined>(tailorPlan);
  const [restoredPlan, setRestoredPlan] = useState(tailorPlan);
  if (tailorPlan !== restoredPlan) {
    setRestoredPlan(tailorPlan);
    setPlan(tailorPlan);
  }

  const [staged, setStaged] = useState(false);
  const [stagedRevision, setStagedRevision] = useState(stagedPlan);
  const [restoredStagedRevision, setRestoredStagedRevision] = useState(stagedPlan);
  if (stagedPlan !== restoredStagedRevision) {
    setRestoredStagedRevision(stagedPlan);
    setStagedRevision(stagedPlan);
  }
  const [, startStaging] = useTransition();

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
        void 0;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [rebuilding, course.id, router]);

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
      setPlan(await onRefreshPlan());
    }
  }

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

      <SidebarProvider
        open={panel !== null}
        onOpenChange={(o) => (o ? showPanel(lastMode) : setPanel(null))}
        className="min-h-0 min-w-0 flex-1"
        style={{ "--sidebar-width": `${panelWidth}rem` } as CSSProperties}
      >
        <SidebarInset
          className={cn(
            !panel && "mk-panel-reserve",
            "min-h-0 min-w-0 bg-canvas transition-[padding-right,padding-left] duration-200 ease-linear",
          )}
          style={
            {
              ...(!railOpen && !narrow ? { paddingLeft: `${railWidth - 2.75}rem` } : null),
              ...(!panel ? { "--mk-panel-reserve": `${panelWidth}rem` } : null),
            } as CSSProperties
          }
        >
          <div className="relative flex w-full shrink-0 items-center gap-2 px-5 py-3 sm:px-8 lg:px-10">
            <Button
              variant="icon"
              onClick={() => setRailOpen(true)}
              className={cn("md:hidden", railOpen ? "hidden" : "flex")}
              aria-label="Expand the Outline"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </Button>

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
