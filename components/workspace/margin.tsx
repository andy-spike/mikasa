"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { ArrowUp, History, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EffortControl } from "@/components/effort-control";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Hint } from "@/components/workspace/hint";
import { Inline } from "@/components/workspace/prose";
import { useScrollActivity } from "@/hooks/use-scroll-activity";
import { cn } from "@/lib/utils";
import type { PublishedPlanRow } from "@/lib/actions/tailor";
import type { ChatView } from "@/lib/course/tutor";
import type { ReasoningEffort } from "@/lib/model";
import type { PlanView, Turn } from "../tailor-conversation";
import { BarCover } from "./bar-cover";

export type MarginMode = "tutor" | "tailor";

/** A chat as the margin reads it: an id, the day it began, and its turns. */
export type MarginChatView = ChatView;

/* A question the margin cannot afford to show: past this the ask line scrolls. */
const ASK_MAX_HEIGHT = 120;

const MODES: Record<MarginMode, { placeholder: string; composerLabel: string; sendLabel: string }> =
  {
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

/* The switch sits on the vendored toggle, whose outline reset would swallow
   the global focus ring; the margin restates it so keyboard focus shows. */
const RING =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

/* The passage rides in the message's own metadata, so an answered question
   keeps its quote without another server round trip. */
function anchorOf(message: UIMessage | undefined): string | null {
  if (!message || typeof message.metadata !== "object" || message.metadata === null) return null;
  const anchor = (message.metadata as { anchor?: unknown }).anchor;
  return typeof anchor === "string" && anchor.length > 0 ? anchor : null;
}

function seedMessages(turns: Turn[]): UIMessage[] {
  return turns.map((turn, index) => ({
    id: `seed-${index}`,
    role: turn.from === "learner" ? "user" : "assistant",
    metadata: turn.from === "learner" && turn.anchor ? { anchor: turn.anchor } : undefined,
    parts: [{ type: "text", text: turn.text }],
  }));
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

/* The chat engine is the same one the panel used: the server owns the stored
   conversation, so a request carries the new turn alone, and a cleanly
   finished stream is what the margin lists. */
function useMarginChat({
  chatKey,
  endpoint,
  turns,
  onFinished,
}: {
  chatKey: string;
  endpoint: string;
  turns: Turn[];
  onFinished: () => void | Promise<void>;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: endpoint,
        prepareSendMessagesRequest: ({ messages, body: fields }) => {
          const lastUser = [...messages].reverse().find((message) => message.role === "user");
          return { body: { ...fields, message: lastUser ? messageText(lastUser) : "" } };
        },
      }),
    [endpoint],
  );

  const seeded = useMemo(() => seedMessages(turns), [turns]);

  const { messages, sendMessage, status, stop, regenerate } = useChat({
    id: chatKey,
    messages: seeded,
    transport,
    throttle: 50,
    onFinish: (event) => {
      if (event.isAbort || event.isError) return;
      void onFinished();
    },
  });

  return {
    messages,
    sendMessage,
    regenerate,
    stop,
    streaming: status === "submitted" || status === "streaming",
    failed: status === "error",
  };
}

type Thread = {
  id: string;
  anchor: string | null;
  turns: { from: string; text: string; anchor: string | null }[];
  /** The answer is still being written: show the working line, no caret. */
  writing: boolean;
};

function threadsOf(messages: UIMessage[], replyFrom: MarginMode, streaming: boolean): Thread[] {
  const threads: Thread[] = [];
  for (const message of messages) {
    const text = messageText(message);
    if (message.role === "user") {
      threads.push({
        id: message.id,
        anchor: anchorOf(message),
        turns: [{ from: "learner", text, anchor: anchorOf(message) }],
        writing: false,
      });
      continue;
    }
    const current = threads[threads.length - 1];
    if (!current) continue;
    current.turns.push({ from: replyFrom, text, anchor: null });
  }
  if (streaming) {
    const last = threads[threads.length - 1];
    if (last && last.turns[last.turns.length - 1]?.from === "learner") last.writing = true;
    else if (last && last.turns[last.turns.length - 1]?.text === "") last.writing = true;
  }
  for (const thread of threads) {
    if (thread.turns[thread.turns.length - 1]?.text !== "") thread.writing = false;
  }
  return threads;
}

function ThreadView({
  thread,
  replyLabel,
  onRevealQuote,
}: {
  thread: Thread;
  replyLabel: string;
  onRevealQuote?: (quote: string) => void;
}) {
  return (
    <article className="border-t border-hair py-4 first:border-t-0 first:pt-0 last:pb-0">
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
            <span className="sr-only">{replyLabel} replied: </span>
            {turn.text ? <Inline text={turn.text} /> : null}
          </p>
        ),
      )}

      {thread.writing ? (
        <p className="mt-4 text-[0.75rem] text-fg-dim" aria-live="polite">
          {replyLabel === "The Tailor" ? "Working on a plan…" : "Working on an answer…"}
        </p>
      ) : null}
    </article>
  );
}

/* A chat's body: a ruled column of turns over the ask line that both modes
   share. Only the copy and what fills the port differ. */
function TurnPort({
  className,
  isEmpty,
  empty,
  placeholder,
  composerLabel,
  sendLabel,
  stopLabel,
  pendingAnchor,
  draft,
  streaming,
  failed,
  failedText,
  retryLabel,
  focusToken,
  /** Changes whenever the margin grew, so the port can follow the newest turn. */
  follow,
  effort,
  onEffort,
  onDraft,
  onSend,
  onClearAnchor,
  onStop,
  onRetry,
  children,
}: {
  className?: string;
  isEmpty: boolean;
  empty: ReactNode;
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
  stopLabel: string;
  pendingAnchor: string | null;
  draft: string;
  streaming: boolean;
  failed: boolean;
  failedText: string;
  retryLabel: string;
  focusToken: number;
  follow: string;
  effort: ReasoningEffort;
  onEffort: (effort: ReasoningEffort) => void;
  onDraft: (text: string) => void;
  onSend: () => void;
  onClearAnchor: () => void;
  onStop: () => void;
  onRetry: () => void;
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

          {failed ? (
            <div aria-live="polite" className="mt-4 flex items-baseline gap-3">
              <p className="text-[0.8125rem] text-fg-3">{failedText}</p>
              <Button variant="quiet" onClick={onRetry} className="shrink-0">
                {retryLabel}
              </Button>
            </div>
          ) : null}
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
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            aria-label={composerLabel}
            className="min-h-10 min-w-0 flex-1 resize-none overflow-y-hidden border-b border-rule bg-transparent px-0 py-2.5 text-[0.8125rem] leading-[1.55] text-fg transition-colors outline-none placeholder:text-fg-dim focus:border-fg-3"
          />
          <EffortControl effort={effort} onEffort={onEffort} className="ml-0" />
          {streaming ? (
            <Hint label={stopLabel}>
              <Button
                type="button"
                variant="icon-raised"
                onClick={onStop}
                aria-label={stopLabel}
                className="h-9 w-9 shrink-0 p-2"
              >
                <Square className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
              </Button>
            </Hint>
          ) : (
            <Button
              type="submit"
              variant="icon-raised"
              disabled={!draft.trim()}
              aria-label={sendLabel}
              className="h-9 w-9 shrink-0 p-2 disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/* The Change plan: what the Tailor proposes, and the one decision per row.
   Discard first, apply second — nothing is written until it is applied. */
function ChangePlan({
  operations,
  applying,
  onDiscard,
  onRestore,
  onApply,
}: {
  operations: PlanView["operations"];
  applying: boolean;
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
          <Button onClick={onApply} disabled={applying} className="w-full">
            {applying ? "Applying the changes…" : "Apply the changes"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* A revision in flight. The published Course stays readable, so the status
   is a line and a pulse, not a wall. */
function RevisionStatus({
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
    <div role="status" aria-live="polite" className="mt-5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 bg-fg-3", !failed && "animate-pulse")}
        />
        <div className="min-w-0">
          <p className="text-[0.8125rem] leading-[1.5] font-medium text-fg">{status}</p>
          {!failed ? (
            <p className="mt-1 text-[0.75rem] leading-[1.5] text-fg-3">
              You can keep navigating the Course while this finishes.
            </p>
          ) : null}
        </div>
      </div>
      {failed ? (
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={onRetry} className="min-w-0 flex-1">
            Retry the revision
          </Button>
          <Button variant="quiet" onClick={onDiscard} className="shrink-0">
            Discard
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* Revisions already published, each with its own Undo. */
function PublishedChanges({
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
  if (rows.length === 0 && !failed) return null;

  return (
    <section className="mt-5">
      <p className="label text-fg-3">Published changes</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
          Published changes could not load.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li
              key={row.plan.id}
              className="flex items-baseline justify-between gap-3 text-[0.8125rem] leading-[1.5]"
            >
              <span className="text-fg-2">
                Revision {row.publishedRevisionNumber} · {row.plan.operations.length}{" "}
                {row.plan.operations.length === 1 ? "change" : "changes"}
              </span>
              {row.canUndo ? (
                <Button
                  variant="quiet"
                  onClick={() => onUndo(row.plan.id)}
                  className="-my-1 shrink-0 py-1"
                >
                  Undo
                </Button>
              ) : (
                <span className="text-[0.75rem] text-fg-3">{row.blockedReason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {failed ? (
        <Button variant="quiet" onClick={onRetry} className="mt-2 -ml-1">
          Retry
        </Button>
      ) : null}
    </section>
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
  chats: MarginChatView[];
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
                    {chat.turns.find((turn) => turn.from === "learner" && turn.text.trim())?.text ??
                      "Untitled chat"}
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
   Sidebar the real Panel used. */
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
  mode: MarginMode;
  onMode: (mode: MarginMode) => void;
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
      reserveSpace={false}
      role="complementary"
      aria-label={mode === "tutor" ? "Tutor for this Lesson" : "Tailor for this Course"}
      className="border-hair duration-160 ease-expo"
    >
      <SidebarHeader className="gap-0 border-b border-hair px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            multiple={false}
            value={[mode]}
            onValueChange={(value) => onMode((value[0] as MarginMode) ?? mode)}
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

type Props = {
  courseId: string;
  lessonId: string;
  mode: MarginMode;
  onMode: (mode: MarginMode) => void;
  /** The open Lesson's chats, oldest first. */
  tutorChats: MarginChatView[];
  /** The Course's chats with the Tailor, oldest first. */
  tailorChats: MarginChatView[];
  pendingAnchor: string | null;
  onClearAnchor: () => void;
  onRevealAnchor: (anchor: string) => void;
  focusToken: number;
  searchStale: boolean;
  rebuilding: boolean;
  onRebuild: () => void;
  plan: PlanView | null;
  applying: boolean;
  onApply: () => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  revisionStatus: string | null;
  revisionFailed: boolean;
  onRetryRevision: () => void;
  onDiscardRevision: () => void;
  published: PublishedPlanRow[];
  publishedFailed: boolean;
  onRetryPublished: () => void;
  onUndo: (planId: string) => void;
  onFinished: () => void;
  onClose: () => void;
  resizer?: ReactNode;
};

export function Margin({
  courseId,
  lessonId,
  mode,
  onMode,
  tutorChats,
  tailorChats,
  pendingAnchor,
  onClearAnchor,
  onRevealAnchor,
  focusToken,
  searchStale,
  rebuilding,
  onRebuild,
  plan,
  applying,
  onApply,
  onDiscard,
  onRestore,
  revisionStatus,
  revisionFailed,
  onRetryRevision,
  onDiscardRevision,
  published,
  publishedFailed,
  onRetryPublished,
  onUndo,
  onFinished,
  onClose,
  resizer,
}: Props) {
  /* Which chat each mode sits on. `null` is the newest; a `…New` list holds
     the chats that were already there when a fresh one was opened, so the
     chat the first turn creates is adopted the moment the server view
     carries it. The seat is stamped with its Lesson, so changing Lesson
     starts on the newest chat again without an effect. */
  type Seat = {
    lesson: string;
    tutor: string | null;
    tailor: string | null;
    tutorNew: string[] | null;
    tailorNew: string[] | null;
    chats: MarginMode | null;
  };
  const [seat, setSeat] = useState<Seat>({
    lesson: lessonId,
    tutor: null,
    tailor: null,
    tutorNew: null,
    tailorNew: null,
    chats: null,
  });
  const current: Seat =
    seat.lesson === lessonId
      ? seat
      : {
          lesson: lessonId,
          tutor: null,
          tailor: null,
          tutorNew: null,
          tailorNew: null,
          chats: null,
        };

  const tutorFresh =
    current.tutorNew === null
      ? null
      : (tutorChats.find((chat) => !current.tutorNew?.includes(chat.id)) ?? null);
  const tutorActive =
    tutorFresh?.id ??
    (current.tutorNew !== null
      ? null
      : (current.tutor ?? tutorChats[tutorChats.length - 1]?.id ?? null));
  const tutorChat = tutorChats.find((chat) => chat.id === tutorActive) ?? null;
  const tutorConversationId = tutorFresh?.id ?? (current.tutorNew !== null ? null : tutorActive);

  const tailorFresh =
    current.tailorNew === null
      ? null
      : (tailorChats.find((chat) => !current.tailorNew?.includes(chat.id)) ?? null);
  const tailorActive =
    tailorFresh?.id ??
    (current.tailorNew !== null
      ? null
      : (current.tailor ?? tailorChats[tailorChats.length - 1]?.id ?? null));
  const tailorChat = tailorChats.find((chat) => chat.id === tailorActive) ?? null;
  const tailorConversationId =
    tailorFresh?.id ?? (current.tailorNew !== null ? null : tailorActive);

  const [tutorDraft, setTutorDraft] = useState("");
  const [tailorDraft, setTailorDraft] = useState("");
  /* One setting for both modes: the effort belongs to the question, not to
     who is being asked, and it survives a Lesson change. */
  const [effort, setEffort] = useState<ReasoningEffort>("low");

  const tutor = useMarginChat({
    chatKey: `${courseId}:tutor:${lessonId}:${tutorActive ?? "new"}`,
    endpoint: `/api/courses/${courseId}/tutor`,
    turns: tutorChat?.turns ?? [],
    onFinished,
  });
  const tailor = useMarginChat({
    chatKey: `${courseId}:tailor:${tailorActive ?? "new"}`,
    endpoint: `/api/courses/${courseId}/tailor`,
    turns: tailorChat?.turns ?? [],
    onFinished,
  });

  function sendTutor() {
    const text = tutorDraft.trim();
    if (!text || tutor.streaming) return;
    const anchor = pendingAnchor;
    setTutorDraft("");
    onClearAnchor();
    void tutor.sendMessage(
      { text, metadata: anchor ? { anchor } : undefined },
      {
        body: {
          lessonId,
          anchor: anchor ?? undefined,
          effort,
          conversationId: tutorConversationId ?? undefined,
        },
      },
    );
  }

  function retryTutor() {
    const lastUser = [...tutor.messages].reverse().find((message) => message.role === "user");
    void tutor.regenerate({
      body: {
        lessonId,
        anchor: anchorOf(lastUser) ?? undefined,
        effort,
        conversationId: tutorConversationId ?? undefined,
      },
    });
  }

  function sendTailor() {
    const text = tailorDraft.trim();
    if (!text || tailor.streaming) return;
    setTailorDraft("");
    void tailor.sendMessage(
      { text },
      { body: { effort, conversationId: tailorConversationId ?? undefined } },
    );
  }

  function retryTailor() {
    void tailor.regenerate({
      body: { effort, conversationId: tailorConversationId ?? undefined },
    });
  }

  function newChat() {
    if (mode === "tutor") {
      setSeat({
        ...current,
        tutorNew: tutorChats.map((chat) => chat.id),
        chats: null,
      });
      setTutorDraft("");
      onClearAnchor();
    } else {
      setSeat({
        ...current,
        tailorNew: tailorChats.map((chat) => chat.id),
        chats: null,
      });
      setTailorDraft("");
    }
  }

  function openChat(id: string) {
    setSeat(
      mode === "tutor"
        ? { ...current, tutor: id, tutorNew: null, chats: null }
        : { ...current, tailor: id, tailorNew: null, chats: null },
    );
  }

  const tutorThreads = threadsOf(tutor.messages, "tutor", tutor.streaming);
  const tailorThreads = threadsOf(tailor.messages, "tailor", tailor.streaming);
  const tutorTail = tutorThreads.reduce(
    (sum, thread) => sum + thread.turns.reduce((n, turn) => n + turn.text.length, 0),
    0,
  );
  const tailorTail = tailorThreads.reduce(
    (sum, thread) => sum + thread.turns.reduce((n, turn) => n + turn.text.length, 0),
    0,
  );

  const tutorList = tutorChats.filter((chat) => chat.id !== tutorActive);
  const tailorList = tailorChats.filter((chat) => chat.id !== tailorActive);
  const tailorIsEmpty =
    tailorThreads.length === 0 &&
    !plan?.operations.length &&
    published.length === 0 &&
    !revisionStatus;

  return (
    <MarginRail
      mode={mode}
      onMode={onMode}
      chatsOpen={current.chats === mode}
      onToggleChats={() => setSeat({ ...current, chats: current.chats === mode ? null : mode })}
      onNewChat={newChat}
      onClose={onClose}
      resizer={resizer}
    >
      <div className={mode === "tutor" ? "contents" : "hidden"} inert={mode !== "tutor"}>
        {searchStale ? (
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-hair pb-3">
            <p className="text-[0.75rem] leading-[1.5] text-fg-3">Course search is out of date.</p>
            <Button variant="quiet" onClick={onRebuild} disabled={rebuilding} className="shrink-0">
              Rebuild
            </Button>
          </div>
        ) : null}
        {current.chats === "tutor" && mode === "tutor" ? (
          <ChatList heading="Chats about this Lesson" chats={tutorList} onOpen={openChat} />
        ) : (
          <TurnPort
            className="w-full"
            effort={effort}
            onEffort={setEffort}
            isEmpty={tutorThreads.length === 0}
            empty={
              <p className="text-[0.8125rem] leading-[1.66] text-fg-3">
                Select a passage to ask about it. The answer stays here, beside the Lesson.
              </p>
            }
            placeholder={MODES.tutor.placeholder}
            composerLabel={MODES.tutor.composerLabel}
            sendLabel={MODES.tutor.sendLabel}
            stopLabel="Stop the Tutor"
            pendingAnchor={pendingAnchor}
            draft={tutorDraft}
            streaming={tutor.streaming}
            failed={tutor.failed}
            failedText="The Tutor could not answer just now."
            retryLabel="Retry"
            focusToken={focusToken}
            follow={`${tutorThreads.length}:${tutorTail}`}
            onDraft={setTutorDraft}
            onSend={sendTutor}
            onClearAnchor={onClearAnchor}
            onStop={() => void tutor.stop()}
            onRetry={retryTutor}
          >
            {tutorThreads.map((thread) => (
              <ThreadView
                key={thread.id}
                thread={thread}
                replyLabel="The Tutor"
                onRevealQuote={onRevealAnchor}
              />
            ))}
          </TurnPort>
        )}
      </div>

      <div className={mode === "tailor" ? "contents" : "hidden"} inert={mode !== "tailor"}>
        {current.chats === "tailor" && mode === "tailor" ? (
          <ChatList heading="Chats about this Course" chats={tailorList} onOpen={openChat} />
        ) : (
          <TurnPort
            className="w-full"
            effort={effort}
            onEffort={setEffort}
            isEmpty={tailorIsEmpty}
            empty={
              <p className="text-[0.8125rem] leading-[1.66] text-fg-3">
                Ask for a change. The Tailor answers with a Change plan you can discard or apply.
              </p>
            }
            placeholder={MODES.tailor.placeholder}
            composerLabel={MODES.tailor.composerLabel}
            sendLabel={MODES.tailor.sendLabel}
            stopLabel="Stop the Tailor"
            pendingAnchor={null}
            draft={tailorDraft}
            streaming={tailor.streaming}
            failed={tailor.failed}
            failedText="The Tailor could not answer just now."
            retryLabel="Retry"
            focusToken={0}
            follow={`${tailorThreads.length}:${tailorTail}:${plan?.operations.length ?? 0}:${published.length}:${revisionStatus ?? ""}`}
            onDraft={setTailorDraft}
            onSend={sendTailor}
            onClearAnchor={() => {}}
            onStop={() => void tailor.stop()}
            onRetry={retryTailor}
          >
            {tailorThreads.map((thread) => (
              <ThreadView key={thread.id} thread={thread} replyLabel="The Tailor" />
            ))}
            {revisionStatus ? (
              <RevisionStatus
                status={revisionStatus}
                failed={revisionFailed}
                onRetry={onRetryRevision}
                onDiscard={onDiscardRevision}
              />
            ) : null}
            {plan && plan.operations.length > 0 ? (
              <ChangePlan
                operations={plan.operations}
                applying={applying}
                onDiscard={onDiscard}
                onRestore={onRestore}
                onApply={onApply}
              />
            ) : null}
            <PublishedChanges
              rows={published}
              failed={publishedFailed}
              onRetry={onRetryPublished}
              onUndo={onUndo}
            />
          </TurnPort>
        )}
      </div>
    </MarginRail>
  );
}
