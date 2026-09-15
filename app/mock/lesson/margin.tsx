"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Hint } from "@/components/workspace/hint";
import { CommandPalette, type Command } from "@/components/workspace/palette";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { DoneCheck, LiveMark } from "@/components/workspace/marks";
import { Inline, LessonBlock } from "@/components/workspace/prose";
import { Resizer } from "@/components/workspace/resizer";
import { useMediaQuery } from "@/hooks/use-mobile";
import type { ReadingBlock } from "@/lib/course/reading";
import { cn } from "@/lib/utils";
import {
  DONE,
  GOAL,
  LESSONS,
  MODULE_ROWS,
  OPEN_ID,
  PUBLISHED,
  TAILOR_CHATS,
  TAILOR_PLAN,
  TAILOR_THREADS,
  THREADS,
  TODAY,
  TOPIC,
  TOTAL,
  TUTOR_CHATS,
  blockText,
  chunksOf,
  replyFor,
  tailorReplyFor,
  type LessonDoc,
  type MockChange,
  type MockChat,
  type MockRevision,
  type MockThread,
} from "./fixture";
import { useScrollActivity } from "./use-scroll-activity";
import fade from "./scroll-fade.module.css";

const WIDE = "(min-width: 1440px)";
const COMPACT = "(max-width: 1023px)";
/* How much the rails may be dragged: enough to fit different habits, never
   enough to crowd the 41rem Lesson box out of the room. The shipped
   workspace's own range, so porting this is a lift. */
const OUTLINE_MIN = 16;
const OUTLINE_MAX = 24;
const OUTLINE_DEFAULT = 18;
const MARGIN_MIN = 18;
const MARGIN_MAX = 26;
const MARGIN_DEFAULT = 20;
/* Under 1440 both rails share the room with the Lesson; neither grows past
   this there. */
const COMPACT_RAIL_MAX = 21;
/* A question the margin cannot afford to show: past this the ask line scrolls. */
const ASK_MAX_HEIGHT = 120;
/* The switch sits on the vendored toggle, whose outline reset would swallow
   the global focus ring; the mock restates it so keyboard focus shows. */
const RING =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

type Mode = "tutor" | "tailor";

type ModeCopy = {
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
};

/* What each mode asks for. */
const MODES: Record<Mode, ModeCopy> = {
  tutor: {
    placeholder: "Ask about this Lesson",
    composerLabel: "Ask the Tutor about this Lesson",
    sendLabel: "Ask the Tutor",
  },
  tailor: {
    placeholder: "Ask for a change",
    composerLabel: "Tell the Tailor what to change",
    sendLabel: "Tell the Tailor",
  },
};

/* Motion's own useReducedMotion can return null on the first paint in
   Next's SSR path; this reads the query on the client instead. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

function composeBody(doc: LessonDoc, rendered: ReadingBlock[]): ReadingBlock[] {
  return [
    ...rendered,
    { kind: "note", title: "Recall", text: doc.recall },
    { kind: "note", title: "Explain it to yourself", text: doc.explain },
    { kind: "p", text: doc.bridge },
  ];
}

type Picked = { text: string; x: number; y: number };

function ThreadView({
  thread,
  onRevealQuote,
}: {
  thread: MockThread;
  onRevealQuote?: (quote: string) => void;
}) {
  const last = thread.turns[thread.turns.length - 1];
  const writing = Boolean(last && last.from !== "learner" && last.text === "");

  return (
    <article
      data-thread={thread.id}
      className="border-t border-hair py-4 first:border-t-0 first:pt-0 last:pb-0"
    >
      {thread.anchor && onRevealQuote ? (
        <Hint label="Show in the Lesson">
          <button
            type="button"
            onClick={() => onRevealQuote(thread.anchor ?? "")}
            className="ml-auto -my-0.5 block w-fit max-w-[85%] border-r border-rule pr-3 text-right text-[0.75rem] leading-[1.55] text-fg-3 transition-colors [overflow-wrap:anywhere] hover:border-fg-3 hover:text-fg-2"
          >
            “{thread.anchor}”
          </button>
        </Hint>
      ) : null}

      {thread.turns.map((turn, i) =>
        turn.from === "learner" ? (
          <p
            key={i}
            className="mt-2.5 ml-auto w-fit max-w-[85%] rounded-md rounded-tr-none bg-raised px-3 py-2 text-[0.8125rem] leading-[1.55] font-medium text-fg first:mt-0 [overflow-wrap:anywhere]"
          >
            <span className="sr-only">You asked: </span>
            {turn.text}
          </p>
        ) : (
          <p
            key={i}
            className="mt-4 text-[0.8125rem] leading-[1.66] text-fg-2 [overflow-wrap:anywhere]"
          >
            <span className="sr-only">
              {turn.from === "tailor" ? "The Tailor replied: " : "The Tutor answered: "}
            </span>
            {turn.text ? <Inline text={turn.text} /> : null}
          </p>
        ),
      )}

      {writing ? (
        <p className="mt-4 text-[0.75rem] text-fg-dim" aria-live="polite">
          {last.from === "tailor" ? "Working on a plan…" : "Working on an answer…"}
        </p>
      ) : null}
    </article>
  );
}

/* The lane cover that lets a scroll port's bar fade: engines do not animate
   scrollbar pseudo-elements, so the native thumb is hidden under a cover in
   the port's own ground instead, and `useScrollActivity` fades the cover away
   while the port moves. The width is the lane `::-webkit-scrollbar` reserves
   in globals.css, and the cover must be the port's next sibling. */
function BarCover({ ground }: { ground: "canvas" | "panel" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-2.5",
        ground === "canvas" ? "bg-canvas" : "bg-panel",
        fade.cover,
      )}
    />
  );
}

/* The margin itself: a ruled column of turns over the ask line that both
   modes share. Only the copy and what fills the port differ. */
function Margin({
  className,
  isEmpty,
  empty,
  placeholder,
  composerLabel,
  sendLabel,
  pendingAnchor,
  draft,
  streaming,
  focusToken,
  follow,
  onDraft,
  onSend,
  onClearAnchor,
  children,
}: {
  className?: string;
  isEmpty: boolean;
  empty: ReactNode;
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
  pendingAnchor: string | null;
  draft: string;
  streaming: boolean;
  focusToken: number;
  /** Changes whenever the margin grew, so the port can follow the newest turn. */
  follow: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  onClearAnchor: () => void;
  children: ReactNode;
}) {
  const port = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useScrollActivity(port);

  useEffect(() => {
    const el = port.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [follow]);

  useEffect(() => {
    if (focusToken > 0) input.current?.focus();
  }, [focusToken]);

  /* The ask line grows with the question and only then scrolls, so what is
     being asked is never hidden inside a one-line box. The field's rule sits
     inside its border box, so that hairline is added back before the height
     is set: without it the field is always a pixel short and the scrollbar
     shows at rest. Overflow stays hidden until the line reaches its cap. */
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    const rule = el.offsetHeight - el.clientHeight;
    const grown = el.scrollHeight + rule;
    const capped = grown > ASK_MAX_HEIGHT;
    el.style.height = `${Math.min(grown, ASK_MAX_HEIGHT)}px`;
    el.style.overflowY = capped ? "auto" : "";
  }, [draft]);

  return (
    <div className={cn("flex min-h-0 w-full flex-1 flex-col", className)}>
      <div className="relative min-h-0 flex-1">
        <div ref={port} className="scroll-thin h-full overflow-y-auto [scrollbar-gutter:stable]">
          {isEmpty ? empty : children}
        </div>
        <BarCover ground="panel" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="mt-4 shrink-0 border-t border-hair pt-3"
      >
        {pendingAnchor ? (
          <div className="mb-2.5 flex items-start gap-2 border-l border-rule pl-2.5">
            <p className="min-w-0 flex-1 text-[0.75rem] leading-[1.55] text-fg-3 [overflow-wrap:anywhere]">
              “{pendingAnchor}”
            </p>
            <button
              type="button"
              onClick={onClearAnchor}
              aria-label="Clear the passage"
              className="-my-1 -mr-1 shrink-0 p-1.5 text-fg-dim transition-colors hover:text-fg-2"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-1">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            aria-label={composerLabel}
            className="min-h-10 w-full resize-none overflow-y-hidden border-b border-rule bg-transparent px-0 py-2.5 text-[0.8125rem] leading-[1.55] text-fg transition-colors outline-none placeholder:text-fg-dim focus:border-fg-3"
          />
          <Button
            type="submit"
            variant="icon-raised"
            disabled={!draft.trim() || streaming}
            aria-label={sendLabel}
            className="h-9 w-9 shrink-0 p-2 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </form>
    </div>
  );
}

/* The Change plan: what the Tailor proposes, and the one decision per row.
   Discard first, apply second — nothing is written until it is applied. */
function ChangePlan({
  operations,
  onDiscard,
  onRestore,
  onApply,
}: {
  operations: MockChange[];
  onDiscard: (id: string) => void;
  onRestore: (id: string) => void;
  onApply: () => void;
}) {
  const live = operations.filter((operation) => operation.status !== "discarded").length;

  return (
    <section className="mt-5">
      <p className="label text-fg-3">Change plan</p>
      <ul className="mt-2 border-t border-hair">
        {operations.map((operation) => {
          const discarded = operation.status === "discarded";
          return (
            <li key={operation.id} className="border-b border-hair py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label text-fg-3">{operation.verb}</span>
                <span className="tnum max-w-[10rem] truncate text-[0.6875rem] text-fg-dim">
                  {operation.entry}
                </span>
              </div>
              <p
                className={cn(
                  "mt-2 text-[0.875rem] leading-[1.45] font-medium [overflow-wrap:anywhere]",
                  discarded ? "text-fg-3 line-through" : "text-fg",
                )}
              >
                {operation.detail}
              </p>
              <div className="mt-3 flex items-center gap-3">
                {discarded ? (
                  <>
                    <span className="text-[0.75rem] text-fg-3">Discarded</span>
                    <Button
                      variant="quiet"
                      onClick={() => onRestore(operation.id)}
                      className="-my-1 ml-auto py-1"
                    >
                      Restore
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="discard"
                    onClick={() => onDiscard(operation.id)}
                    className="-my-1 ml-auto py-1"
                  >
                    Discard
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {live > 0 ? (
        <div className="mt-4">
          <Button onClick={onApply} className="w-full">
            Apply the changes
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* A revision in flight. The published Course stays readable, so the status
   is a line and a pulse, not a wall. */
function RevisionStatus({ status, pulse }: { status: string; pulse: boolean }) {
  return (
    <div role="status" aria-live="polite" className="mt-5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 bg-fg-3", pulse && "animate-pulse")}
        />
        <div className="min-w-0">
          <p className="text-[0.8125rem] leading-[1.5] font-medium text-fg">{status}</p>
          <p className="mt-1 text-[0.75rem] leading-[1.5] text-fg-3">
            You can keep navigating the Course while this finishes.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Revisions already published, each with its own Undo. */
function PublishedChanges({
  revisions,
  onUndo,
}: {
  revisions: MockRevision[];
  onUndo: (id: string) => void;
}) {
  return (
    <section className="mt-5">
      <p className="label text-fg-3">Published changes</p>
      <ul className="mt-3 space-y-3">
        {revisions.map((revision) => (
          <li
            key={revision.id}
            className="flex items-baseline justify-between gap-3 text-[0.8125rem] leading-[1.5]"
          >
            <span className="text-fg-2">
              Revision {revision.n} · {revision.count} {revision.count === 1 ? "change" : "changes"}
            </span>
            <Button
              variant="quiet"
              onClick={() => onUndo(revision.id)}
              className="-my-1 shrink-0 py-1"
            >
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NavButton({
  direction,
  nav,
  onOpen,
}: {
  direction: "previous" | "next";
  nav: { id: string; n: number; title: string };
  onOpen: (id: string) => void;
}) {
  const backward = direction === "previous";
  const Icon = backward ? ArrowLeft : ArrowRight;
  return (
    <Button
      variant="bare"
      onClick={() => onOpen(nav.id)}
      className="group flex min-w-0 items-center gap-3 px-3 py-3 text-left hover:bg-panel"
    >
      {backward ? (
        <Icon
          className="h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:-translate-x-1"
          strokeWidth={1.75}
        />
      ) : null}
      <span className="min-w-0">
        <span className="label block text-fg-dim">{backward ? "Previous" : "Next"}</span>
        <span className="mt-1 block truncate text-[0.9375rem] text-fg-2 group-hover:text-fg">
          <span className="tnum mr-2 text-fg-3">{nav.n}</span>
          {nav.title}
        </span>
      </span>
      {!backward ? (
        <Icon
          className="ml-auto h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:translate-x-1"
          strokeWidth={1.75}
        />
      ) : null}
    </Button>
  );
}

/* The left rail, on the vendored shadcn Sidebar like the real Outline.
   It is always open on the desktop; only the mobile sheet closes it. */
function OutlineRail({
  topic,
  goal,
  openId,
  liveId,
  handing,
  justDoneId,
  stampFor,
  onOpen,
  onClose,
  resizer,
}: {
  topic: string;
  goal: string;
  openId: string;
  liveId: string | null;
  handing: boolean;
  justDoneId: string | null;
  stampFor: (id: string) => string | undefined;
  onOpen: (id: string) => void;
  onClose: () => void;
  resizer?: ReactNode;
}) {
  const { isMobile } = useSidebar();
  const openLessonRef = useRef<HTMLButtonElement>(null);
  const port = useRef<HTMLDivElement>(null);

  useScrollActivity(port);

  useEffect(() => {
    openLessonRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  return (
    <Sidebar
      side="left"
      collapsible="icon"
      aria-label="Outline"
      className="border-hair duration-160 ease-expo"
    >
      <SidebarHeader className="gap-0 px-4 pt-2 pb-3">
        <div className="flex h-9 items-center justify-between gap-3">
          <Link
            href="/courses"
            className="-ml-2 flex h-9 items-center gap-1 rounded-sm px-2 text-[0.75rem] text-fg-dim transition-colors hover:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live"
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={1.75} />
            Courses
          </Link>
          {isMobile ? (
            <Button
              variant="icon"
              onClick={onClose}
              aria-label="Close the Outline"
              className="-mr-2 h-9 w-9 p-2"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          ) : null}
        </div>

        <h1 className="mt-1 text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
          {topic}
        </h1>
        <p className="mt-2 text-[0.8125rem] leading-[1.5] text-fg-3">{goal}</p>
      </SidebarHeader>

      {/* The rail is a port like the article and the margin: its bar rides the
          scroll and its lane stays reserved, so nothing shifts when the bar
          comes and goes. The rows end at the lane (hence no right pad), and the
          hairline sits on the wrapper, outside the scroller, so the cover never
          paints over it. */}
      <div className="relative flex min-h-0 flex-1 flex-col border-t border-hair">
        {/* The end pad lets the last Lessons come up off the viewport floor:
            scrolling to the bottom is a place, not the end of the list. */}
        <SidebarContent
          ref={port}
          className="scroll-thin gap-0 overflow-y-auto pt-2 pb-24 pl-2 [scrollbar-gutter:stable]"
        >
          {MODULE_ROWS.map((m) => (
            <SidebarGroup key={m.numeral} className="mb-2 p-0 last:mb-0">
              <SidebarGroupLabel className="h-auto justify-start px-2 pt-4 pb-1.5 text-fg-3">
                <h2 className="grid min-w-0 grid-cols-[1.5rem_1fr] text-[0.6875rem] leading-[1.35] font-semibold tracking-[0.06em] text-fg-3 uppercase">
                  <span className="tnum">{m.numeral}</span>
                  <span>{m.title}</span>
                </h2>
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0">
                  {m.lessons.map((l) => {
                    const lessonStamp = stampFor(l.id);
                    const isOpen = l.id === openId;
                    const isLive = l.id === liveId;

                    return (
                      <SidebarMenuItem key={l.id}>
                        <Hint label={l.title} side="right">
                          <SidebarMenuButton
                            ref={isOpen ? openLessonRef : undefined}
                            isActive={isOpen}
                            aria-current={isOpen ? "page" : undefined}
                            aria-label={`${l.n}. ${l.title}${lessonStamp ? ", complete" : isLive ? ", current Lesson" : ""}`}
                            onClick={() => onOpen(l.id)}
                            className="row grid h-auto min-h-7 grid-cols-[0.75rem_1.25rem_1fr] items-center gap-x-2 overflow-visible px-2 py-1 text-left"
                          >
                            {/* The sidebar primitive sizes a descendant svg to
                              16px; the rail's mark is drawn at 10px. */}
                            <span className="flex h-4 w-3 items-center justify-center [&_svg]:size-2.5!">
                              {isLive ? (
                                <LiveMark handing={handing} />
                              ) : lessonStamp ? (
                                <span className="text-fg-3">
                                  <DoneCheck striking={justDoneId === l.id} />
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                "tnum text-[0.75rem]",
                                isOpen ? "text-fg-2" : "text-fg-3",
                              )}
                            >
                              {l.n}
                            </span>
                            <span
                              className={cn(
                                "truncate text-[0.8125rem] leading-5",
                                isOpen ? "font-medium text-fg" : "text-fg-2",
                              )}
                            >
                              {l.title}
                            </span>
                          </SidebarMenuButton>
                        </Hint>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <BarCover ground="panel" />
      </div>

      {resizer}
    </Sidebar>
  );
}

/* The conversations this Lesson (or the Course) has already had, newest
   first. The one on screen is not listed: these are what it moved aside. */
function ChatList({
  heading,
  chats,
  onOpen,
}: {
  heading: string;
  chats: MockChat[];
  onOpen: (id: string) => void;
}) {
  const port = useRef<HTMLDivElement>(null);
  useScrollActivity(port);

  return (
    <div className="relative min-h-0 w-full flex-1">
      <div
        ref={port}
        className="scroll-thin h-full w-full overflow-y-auto [scrollbar-gutter:stable]"
      >
        <p className="label text-fg-3">{heading}</p>

        {chats.length > 0 ? (
          <ul className="mt-2 border-t border-hair">
            {chats.map((chat) => (
              <li key={chat.id} className="border-b border-hair">
                <button
                  type="button"
                  onClick={() => onOpen(chat.id)}
                  className="group block w-full py-3 text-left"
                >
                  <span className="block truncate text-[0.8125rem] leading-5 text-fg-2 transition-colors group-hover:text-fg">
                    {chat.title}
                  </span>
                  <span className="mt-1 block text-[0.75rem] leading-[1.5] text-fg-3">
                    {chat.date}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-[1.66] text-fg-3">No earlier chats yet.</p>
        )}
      </div>
      <BarCover ground="panel" />
    </div>
  );
}

/* The right rail: Tutor and Tailor as one margin, on the same offcanvas
   Sidebar the real Panel uses. */
function MarginRail({
  mode,
  onMode,
  chatsOpen,
  onToggleChats,
  onNewChat,
  onClose,
  resizer,
  children,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  chatsOpen: boolean;
  onToggleChats: () => void;
  onNewChat: () => void;
  onClose: () => void;
  resizer?: ReactNode;
  children: ReactNode;
}) {
  const { isMobile } = useSidebar();
  const modeName = mode === "tutor" ? "Tutor" : "Tailor";
  const iconControl = isMobile ? "h-11 w-11" : "h-8 w-8";

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      role="complementary"
      aria-label={mode === "tutor" ? "Tutor for this Lesson" : "Tailor for this Course"}
      className="border-hair duration-160 ease-expo"
    >
      <SidebarHeader className="gap-0 border-b border-hair px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            multiple={false}
            value={[mode]}
            onValueChange={(value) => onMode((value[0] as Mode) ?? mode)}
            aria-label="Tutor or Tailor"
            size="sm"
            className="bg-canvas"
          >
            <ToggleGroupItem value="tutor" className={cn(isMobile ? "h-11" : "h-7", RING)}>
              Tutor
            </ToggleGroupItem>
            <ToggleGroupItem value="tailor" className={cn(isMobile ? "h-11" : "h-7", RING)}>
              Tailor
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex shrink-0 items-center gap-1">
            <Hint label="Previous chats">
              <Button
                variant="icon-raised"
                onClick={onToggleChats}
                aria-expanded={chatsOpen}
                aria-label="Previous chats"
                className={cn(iconControl, "p-0", chatsOpen && "bg-raised text-fg")}
              >
                <History className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </Hint>
            <Hint label="New chat">
              <Button
                variant="icon-raised"
                onClick={onNewChat}
                aria-label="New chat"
                className={cn(iconControl, "p-0", isMobile ? null : "-mr-1")}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </Hint>
            {isMobile ? (
              <Button
                variant="icon-raised"
                onClick={onClose}
                aria-label={`Close the ${modeName}`}
                className="-mr-1 h-11 w-11 p-2"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            ) : null}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden px-4 pt-4 pb-5">{children}</SidebarContent>

      {resizer}
    </Sidebar>
  );
}

export function MarginMock({
  bodies,
  empty,
  initialMode = "tutor",
}: {
  bodies: Record<string, ReadingBlock[]>;
  empty: boolean;
  initialMode?: Mode;
}) {
  const wide = useMediaQuery(WIDE, true);
  const compact = useMediaQuery(COMPACT);
  const reduce = usePrefersReducedMotion();
  const outlineMax = wide ? OUTLINE_MAX : COMPACT_RAIL_MAX;
  const marginMax = wide ? MARGIN_MAX : COMPACT_RAIL_MAX;

  const [outlinePref, setOutlinePref] = useState(OUTLINE_DEFAULT);
  const [marginPref, setMarginPref] = useState(MARGIN_DEFAULT);
  /* The constraint lives in the render, not in a state reset: a width at
     home over 1440 is clamped only while the viewport cannot afford it, and
     the preference returns when the room does. */
  const outlineWidth = Math.min(outlinePref, outlineMax);
  const marginWidth = Math.min(marginPref, marginMax);
  const [done, setDone] = useState<Record<string, string>>(DONE);
  const [openId, setOpenId] = useState(OPEN_ID);
  const [threads, setThreads] = useState<Record<string, MockThread[]>>(() =>
    empty ? {} : THREADS,
  );
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [railSheetOpen, setRailSheetOpen] = useState(false);
  const [tutorChoice, setTutorChoice] = useState<boolean | null>(null);
  const [flashQuote, setFlashQuote] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tailorThreads, setTailorThreads] = useState<MockThread[]>(() =>
    empty ? [] : TAILOR_THREADS,
  );
  const [tailorDraft, setTailorDraft] = useState("");
  const [tailorStreaming, setTailorStreaming] = useState(false);
  const [plan, setPlan] = useState<MockChange[]>(() => (empty ? [] : TAILOR_PLAN));
  const [published, setPublished] = useState<MockRevision[]>(() => (empty ? [] : PUBLISHED));
  const [revisionStatus, setRevisionStatus] = useState<string | null>(null);
  const [tutorChats, setTutorChats] = useState<Record<string, MockChat[]>>(() =>
    empty ? {} : TUTOR_CHATS,
  );
  const [tailorChats, setTailorChats] = useState<MockChat[]>(() => (empty ? [] : TAILOR_CHATS));
  const [chatsOpen, setChatsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const tutorOpen = tutorChoice ?? wide;
  const modeName = mode === "tutor" ? "Tutor" : "Tailor";

  const articleRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const replyIndex = useRef(0);
  const quoteTimer = useRef<number | null>(null);
  const revisionTimers = useRef<number[]>([]);
  /* The conversation on screen, when it came from the list: archiving it
     again must not restamp a chat that began days ago. */
  const loadedChat = useRef<MockChat | null>(null);
  /* The fixture plan is proposed once; after that the Tailor answers. */
  const proposed = useRef(!empty);

  useScrollActivity(scrollRef);

  /* A new Lesson starts at its head: whether it arrived from the rail or from
     the foot of the last one, the reading column glides back to the title
     rather than landing wherever the last Lesson was left. The preference is
     read here, not taken from the hook: flipping it must not scroll the
     Lesson out from under the reader. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [openId]);

  /* ⌘K is the palette's own door here too, so the box in the chrome and the
     shortcut answer the same way they do in the workspace. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    alive.current = true;
    /* The array identity never changes, so the cleanup sees every timer. */
    const timers = revisionTimers.current;
    return () => {
      alive.current = false;
      if (quoteTimer.current) window.clearTimeout(quoteTimer.current);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const lesson = LESSONS.find((l) => l.id === openId) ?? LESSONS[0];
  const lessonIndex = LESSONS.indexOf(lesson);
  const previous = LESSONS[lessonIndex - 1] ?? null;
  const next = LESSONS[lessonIndex + 1] ?? null;
  const live = LESSONS.find((l) => !done[l.id]) ?? null;
  const lessonThreads = threads[lesson.id] ?? [];
  const tutorTail = lessonThreads.reduce(
    (sum, thread) => sum + thread.turns.reduce((n, turn) => n + turn.text.length, 0),
    0,
  );
  const tailorTail = tailorThreads.reduce(
    (sum, thread) => sum + thread.turns.reduce((n, turn) => n + turn.text.length, 0),
    0,
  );
  const anchors = useMemo(
    () => (threads[lesson.id] ?? []).map((t) => t.anchor).filter((a): a is string => Boolean(a)),
    [threads, lesson.id],
  );
  const body = useMemo(() => composeBody(lesson.doc, bodies[lesson.id] ?? []), [lesson, bodies]);

  const stamp = done[lesson.id];

  function quoteForBlock(block: ReadingBlock): string | null {
    const text = normalize(blockText(block));
    return anchors.find((anchor) => text.includes(normalize(anchor))) ?? null;
  }

  function openLesson(id: string) {
    setOpenId(id);
    setJustDone(null);
    setPendingAnchor(null);
    setPicked(null);
    if (compact) setRailSheetOpen(false);
  }

  /* The rail opens from the chrome in whichever mode was last used; asking
     from the text always brings the Tutor forward. Either way it lands on
     the conversation, not on the list of earlier ones. */
  function showRail(next?: Mode) {
    if (compact) setRailSheetOpen(false);
    if (next) setMode(next);
    setChatsOpen(false);
    setTutorChoice(true);
  }

  function closeRail() {
    setTutorChoice(false);
  }

  function markDone() {
    setJustDone(lesson.id);
    setDone((d) => ({ ...d, [lesson.id]: TODAY }));
  }

  function unmark() {
    setJustDone(null);
    setDone((d) => {
      const copy = { ...d };
      delete copy[lesson.id];
      return copy;
    });
  }

  /* A selection inside the article raises the bracket and its Ask. */
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
    setFocusToken((t) => t + 1);
    showRail("tutor");
  }

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;
    const anchor = pendingAnchor;
    const lessonId = lesson.id;
    const threadId = `t-${lessonId}-${Date.now()}`;

    setDraft("");
    setPendingAnchor(null);
    setThreads((prev) => ({
      ...prev,
      [lessonId]: [
        ...(prev[lessonId] ?? []),
        {
          id: threadId,
          anchor,
          turns: [
            { from: "learner", text },
            { from: "tutor", text: "" },
          ],
        },
      ],
    }));

    const answer = replyFor(anchor, text, replyIndex.current++);
    setStreaming(threadId);
    for (const piece of chunksOf(answer)) {
      if (!alive.current) return;
      if (!reduce) await new Promise((resolve) => setTimeout(resolve, 110));
      setThreads((prev) => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                turns: thread.turns.map((turn, i) =>
                  i === thread.turns.length - 1 ? { ...turn, text: turn.text + piece } : turn,
                ),
              }
            : thread,
        ),
      }));
    }
    if (alive.current) setStreaming(null);
  }

  /* The Tailor answers first and proposes second, the way the real one does. */
  async function sendTailor() {
    const text = tailorDraft.trim();
    if (!text || tailorStreaming) return;
    const threadId = `t-${Date.now()}`;

    setTailorDraft("");
    setTailorThreads((prev) => [
      ...prev,
      {
        id: threadId,
        anchor: null,
        turns: [
          { from: "learner", text },
          { from: "tailor", text: "" },
        ],
      },
    ]);

    const reply = tailorReplyFor(replyIndex.current++);
    setTailorStreaming(true);
    for (const piece of chunksOf(reply)) {
      if (!alive.current) return;
      if (!reduce) await new Promise((resolve) => setTimeout(resolve, 110));
      setTailorThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                turns: thread.turns.map((turn, i) =>
                  i === thread.turns.length - 1 ? { ...turn, text: turn.text + piece } : turn,
                ),
              }
            : thread,
        ),
      );
    }
    if (!alive.current) return;
    setTailorStreaming(false);
    if (!proposed.current) {
      proposed.current = true;
      setPlan(TAILOR_PLAN.map((operation) => ({ ...operation })));
    }
  }

  function discardChange(id: string) {
    setPlan((prev) =>
      prev.map((operation) =>
        operation.id === id ? { ...operation, status: "discarded" as const } : operation,
      ),
    );
  }

  function restoreChange(id: string) {
    setPlan((prev) =>
      prev.map((operation) =>
        operation.id === id ? { ...operation, status: "open" as const } : operation,
      ),
    );
  }

  /* Applying accepts every row still standing, stages the revision, and
     publishes it while the Course stays readable. */
  function applyPlan() {
    const live = plan.filter((operation) => operation.status !== "discarded").length;
    if (live === 0) return;
    setPlan([]);
    setRevisionStatus("Reviewing the Course revision…");
    revisionTimers.current.push(
      window.setTimeout(() => {
        if (!alive.current) return;
        setRevisionStatus("Publishing the Course revision…");
        revisionTimers.current.push(
          window.setTimeout(() => {
            if (!alive.current) return;
            setRevisionStatus(null);
            setPublished((prev) => [
              { id: `r-${Date.now()}`, n: (prev[0]?.n ?? 0) + 1, count: live },
              ...prev,
            ]);
          }, 1300),
        );
      }, 1500),
    );
  }

  function undoRevision(id: string) {
    setPublished((prev) => prev.filter((revision) => revision.id !== id));
  }

  /* Conversations are kept, not replaced: the margin holds one at a time and
     Previous chats lists the rest. A chat is named by its first question. */
  function archived(threads: MockThread[]): MockChat | null {
    if (loadedChat.current && threads === loadedChat.current.threads) {
      const chat = loadedChat.current;
      loadedChat.current = null;
      return chat;
    }
    const ask = threads
      .flatMap((thread) => thread.turns)
      .find((turn) => turn.from === "learner" && turn.text.trim() !== "");
    if (!ask) return null;
    return { id: `chat-${Date.now()}`, title: ask.text.trim(), date: TODAY, threads };
  }

  /* The Tailor's plan and published list belong to the chat that made them,
     so they travel with it in and out of the list. */
  function archivedTailor(): MockChat | null {
    const kept = archived(tailorThreads);
    if (!kept) return null;
    return {
      ...kept,
      plan: plan.length > 0 ? plan : undefined,
      published: published.length > 0 ? published : undefined,
    };
  }

  function newChat() {
    if (mode === "tutor") {
      const kept = archived(lessonThreads);
      if (kept) {
        setTutorChats((prev) => ({
          ...prev,
          [lesson.id]: [kept, ...(prev[lesson.id] ?? [])],
        }));
        setThreads((prev) => ({ ...prev, [lesson.id]: [] }));
        setPendingAnchor(null);
      }
    } else {
      const kept = archivedTailor();
      if (kept) {
        setTailorChats((prev) => [kept, ...prev]);
        setTailorThreads([]);
        setPlan([]);
        setPublished([]);
        setRevisionStatus(null);
        proposed.current = false;
      }
    }
    setChatsOpen(false);
  }

  /* Picking an earlier conversation swaps it for the one on screen. */
  function openChat(id: string) {
    const chat =
      mode === "tutor"
        ? (tutorChats[lesson.id] ?? []).find((c) => c.id === id)
        : tailorChats.find((c) => c.id === id);
    if (!chat) return;
    const kept = mode === "tutor" ? archived(lessonThreads) : archivedTailor();

    if (mode === "tutor") {
      setTutorChats((prev) => ({
        ...prev,
        [lesson.id]: [
          ...(kept ? [kept] : []),
          ...(prev[lesson.id] ?? []).filter((c) => c.id !== id),
        ],
      }));
      setThreads((prev) => ({ ...prev, [lesson.id]: chat.threads }));
      setPendingAnchor(null);
    } else {
      setTailorChats([...(kept ? [kept] : []), ...tailorChats.filter((c) => c.id !== id)]);
      setTailorThreads(chat.threads);
      setPlan(chat.plan ?? []);
      setPublished(chat.published ?? []);
      setRevisionStatus(null);
      /* A chat that already carries a plan has had its offer; one that does
         not gets the fixture's plan on the next ask, which is what the
         Tailor's reply promises. */
      proposed.current = (chat.plan?.length ?? 0) > 0;
    }
    loadedChat.current = chat;
    setChatsOpen(false);
  }

  function flashQuoteFor(quote: string) {
    setFlashQuote(quote);
    if (quoteTimer.current) window.clearTimeout(quoteTimer.current);
    quoteTimer.current = window.setTimeout(() => setFlashQuote(null), 1400);
  }

  function revealQuote(quote: string) {
    const article = articleRef.current;
    if (!article) return;
    for (const el of article.querySelectorAll<HTMLElement>("[data-quote]")) {
      if (el.dataset.quote && normalize(el.dataset.quote) === normalize(quote)) {
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        flashQuoteFor(quote);
        return;
      }
    }
  }

  /* The palette carries the workspace's own two groups over this Lesson: what
     you can do, then where you can go. */
  const commands: Command[] = [
    ...(lesson.doc.exercise
      ? [
          done[lesson.id]
            ? { id: "cmd-unmark", label: "Undo this Exercise", group: "Actions", run: unmark }
            : { id: "cmd-mark", label: "Mark the Exercise done", group: "Actions", run: markDone },
        ]
      : []),
    { id: "cmd-tutor", label: "Open the Tutor", group: "Actions", run: () => showRail("tutor") },
    { id: "cmd-tailor", label: "Open the Tailor", group: "Actions", run: () => showRail("tailor") },
    ...LESSONS.map((l) => ({
      id: `go-${l.id}`,
      label: `${l.n}. ${l.title}`,
      hint: `${l.moduleNumeral}. ${l.moduleTitle}`,
      group: "Lessons",
      run: () => openLesson(l.id),
    })),
  ];

  const tutorMargin = (
    <Margin
      className="w-full"
      isEmpty={lessonThreads.length === 0}
      empty={
        <p className="text-[0.8125rem] leading-[1.66] text-fg-3">
          Select a passage to ask about it. The answer stays here, beside the Lesson.
        </p>
      }
      placeholder={MODES.tutor.placeholder}
      composerLabel={MODES.tutor.composerLabel}
      sendLabel={MODES.tutor.sendLabel}
      pendingAnchor={pendingAnchor}
      draft={draft}
      streaming={streaming !== null}
      focusToken={focusToken}
      follow={`${lessonThreads.length}:${tutorTail}`}
      onDraft={setDraft}
      onSend={() => void send()}
      onClearAnchor={() => setPendingAnchor(null)}
    >
      {lessonThreads.map((thread) => (
        <ThreadView key={thread.id} thread={thread} onRevealQuote={revealQuote} />
      ))}
    </Margin>
  );

  const tailorIsEmpty =
    tailorThreads.length === 0 && plan.length === 0 && published.length === 0 && !revisionStatus;

  const tailorMargin = (
    <Margin
      className="w-full"
      isEmpty={tailorIsEmpty}
      empty={
        <p className="text-[0.8125rem] leading-[1.66] text-fg-3">
          Ask for a change. The Tailor answers with a Change plan you can discard or apply.
        </p>
      }
      placeholder={MODES.tailor.placeholder}
      composerLabel={MODES.tailor.composerLabel}
      sendLabel={MODES.tailor.sendLabel}
      pendingAnchor={null}
      draft={tailorDraft}
      streaming={tailorStreaming}
      focusToken={0}
      follow={`${tailorThreads.length}:${tailorTail}:${plan.length}:${published.length}:${revisionStatus ?? ""}`}
      onDraft={setTailorDraft}
      onSend={() => void sendTailor()}
      onClearAnchor={() => {}}
    >
      {tailorThreads.map((thread) => (
        <ThreadView key={thread.id} thread={thread} />
      ))}
      {revisionStatus ? <RevisionStatus status={revisionStatus} pulse={!reduce} /> : null}
      {plan.length > 0 ? (
        <ChangePlan
          operations={plan}
          onDiscard={discardChange}
          onRestore={restoreChange}
          onApply={applyPlan}
        />
      ) : null}
      {published.length > 0 ? (
        <PublishedChanges revisions={published} onUndo={undoRevision} />
      ) : null}
    </Margin>
  );

  return (
    <SidebarProvider
      open={compact ? railSheetOpen : true}
      onOpenChange={setRailSheetOpen}
      isMobile={compact}
      className="h-full min-h-0 overflow-hidden bg-canvas"
      style={
        {
          "--sidebar-width": `${outlineWidth}rem`,
          "--sidebar-width-icon": "2.75rem",
        } as CSSProperties
      }
    >
      <OutlineRail
        topic={TOPIC}
        goal={GOAL}
        openId={lesson.id}
        liveId={live?.id ?? null}
        handing={justDone !== null}
        justDoneId={justDone}
        stampFor={(id) => done[id]}
        onOpen={openLesson}
        onClose={() => setRailSheetOpen(false)}
        resizer={
          <Resizer
            side="left"
            width={outlineWidth}
            min={OUTLINE_MIN}
            max={outlineMax}
            defaultWidth={OUTLINE_DEFAULT}
            onResize={setOutlinePref}
          />
        }
      />

      <SidebarProvider
        open={tutorOpen}
        onOpenChange={(open) => (open ? showRail() : closeRail())}
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
              onClick={() => setRailSheetOpen(true)}
              aria-label="Expand the Outline"
              className={cn(!compact ? "hidden" : "flex")}
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

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <Hint label={`${tutorOpen ? "Close" : "Open"} the ${modeName}`}>
                <Button
                  variant="icon"
                  onClick={() => (tutorOpen ? closeRail() : showRail())}
                  aria-expanded={tutorOpen}
                  aria-label={`${tutorOpen ? "Close" : "Open"} the ${modeName}`}
                  className="h-8 w-8 p-2"
                >
                  {tutorOpen ? (
                    <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <PanelRight className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </Button>
              </Hint>
            </div>
          </nav>

          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              className="scroll-thin h-full overflow-y-auto [scrollbar-gutter:stable]"
            >
              <article
                ref={articleRef}
                className="mx-auto w-full max-w-[41rem] px-5 pt-6 pb-20 sm:px-8 sm:pt-9 lg:px-10"
              >
                <p className="tnum text-[0.75rem] text-fg-3">
                  Lesson {lesson.n} of {TOTAL}
                </p>

                <h2 className="mt-2.5 max-w-[22ch] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg sm:text-[2.25rem]">
                  {lesson.title}
                </h2>

                <div className="mt-9 space-y-6">
                  {body.map((block, i) => {
                    const quote = quoteForBlock(block);
                    const flashed = Boolean(
                      quote && flashQuote && normalize(quote) === normalize(flashQuote),
                    );
                    return (
                      <div
                        key={i}
                        data-quote={quote ?? undefined}
                        className={cn(
                          "relative -mx-2 rounded-sm px-2 transition-colors duration-200",
                          flashed && "bg-raised",
                        )}
                      >
                        <LessonBlock block={block} />
                      </div>
                    );
                  })}
                </div>

                {lesson.doc.exercise ? (
                  <section className="mt-12 max-w-(--measure) border-t border-hair pt-7">
                    <h3 className="label text-fg-3">Exercise</h3>
                    <p className="mt-3.5 text-[1rem] leading-[1.7] text-fg">
                      <Inline text={lesson.doc.exercise.task} />
                    </p>
                    <p className="mt-3 text-[0.9375rem] leading-[1.62] text-fg-3">
                      <Inline text={lesson.doc.exercise.check} />
                    </p>

                    <div className="mt-7">
                      {stamp ? (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                          <span className="flex items-center gap-2 rounded-sm bg-panel px-3 py-2 text-[0.8125rem] text-fg-2">
                            <span className="text-fg-2">
                              <DoneCheck striking={justDone === lesson.id} />
                            </span>
                            Done <span className="tnum text-fg-3">{stamp}</span>
                          </span>
                          <Button variant="quiet" onClick={unmark}>
                            Undo
                          </Button>
                        </div>
                      ) : (
                        <Button onClick={markDone}>Mark the Exercise done</Button>
                      )}
                    </div>
                  </section>
                ) : null}

                <footer
                  className={cn(
                    "mt-12 grid max-w-(--measure) gap-3 border-t border-hair pt-4",
                    previous && next ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {previous ? (
                    <NavButton direction="previous" nav={previous} onOpen={openLesson} />
                  ) : null}
                  {next ? <NavButton direction="next" nav={next} onOpen={openLesson} /> : null}
                </footer>
              </article>
            </div>
            <BarCover ground="canvas" />
          </div>
        </SidebarInset>

        <MarginRail
          mode={mode}
          onMode={setMode}
          chatsOpen={chatsOpen}
          onToggleChats={() => setChatsOpen((open) => !open)}
          onNewChat={newChat}
          onClose={closeRail}
          resizer={
            <Resizer
              side="right"
              width={marginWidth}
              min={MARGIN_MIN}
              max={marginMax}
              defaultWidth={MARGIN_DEFAULT}
              onResize={setMarginPref}
            />
          }
        >
          <div className={mode === "tutor" ? "contents" : "hidden"} inert={mode !== "tutor"}>
            {chatsOpen ? (
              <ChatList
                heading="Chats about this Lesson"
                chats={tutorChats[lesson.id] ?? []}
                onOpen={openChat}
              />
            ) : (
              tutorMargin
            )}
          </div>
          <div className={mode === "tailor" ? "contents" : "hidden"} inert={mode !== "tailor"}>
            {chatsOpen ? (
              <ChatList heading="Chats about this Course" chats={tailorChats} onOpen={openChat} />
            ) : (
              tailorMargin
            )}
          </div>
        </MarginRail>
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
