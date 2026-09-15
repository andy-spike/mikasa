"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, type ChatTransport, type UIMessage } from "ai";
import { Slider } from "@base-ui/react/slider";
import { ArrowDown, ArrowUp, ChevronDown, Square, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/workspace/hint";
import { Inline } from "@/components/workspace/prose";
import type { ReasoningEffort } from "@/lib/model";

export type Turn = { from: "learner" | "tutor" | "tailor"; text: string; anchor?: string | null };

export type PlanOperation = {
  id: string;
  verb: string;
  entry: string;
  detail: string;
  status: "proposed" | "accepted" | "discarded";
};

export type PlanView = { id: string; operations: PlanOperation[] };

const EFFORTS = ["low", "medium", "high"] as const satisfies readonly ReasoningEffort[];
/* The route schema refuses a longer turn, so the field refuses to grow one. */
const DRAFT_LIMIT = 4000;
const DRAFT_LIMIT_WARN = 200;
const DRAFT_MAX_HEIGHT = 160;
const NEAR_BOTTOM = 48;

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

/** The quoted passage above its question. Clicking it finds the sentence
 *  in the Lesson; without a handler it is just the record of the ask. */
function AnchorQuote({
  anchor,
  onReveal,
}: {
  anchor: string;
  onReveal?: (anchor: string) => void;
}) {
  const shared =
    "border-l border-rule pl-3 text-left text-[0.75rem] leading-[1.55] text-fg-3 [overflow-wrap:anywhere]";

  if (!onReveal) return <p className={shared}>“{anchor}”</p>;

  return (
    <Hint label="Show in the Lesson">
      <button
        type="button"
        onClick={() => onReveal(anchor)}
        className={`${shared} -my-0.5 block w-full transition-colors hover:border-fg-3 hover:text-fg-2`}
      >
        “{anchor}”
      </button>
    </Hint>
  );
}

function TurnRow({
  message,
  speaker,
  caret,
  onRevealAnchor,
}: {
  message: UIMessage;
  speaker: string;
  caret: boolean;
  onRevealAnchor?: (anchor: string) => void;
}) {
  const text = messageText(message);
  if (!text) return null; // an answer stopped before it began

  if (message.role === "user") {
    const anchor = anchorOf(message);
    return (
      <div className="mt-4 border-t border-hair pt-4 first:mt-0 first:border-t-0 first:pt-0">
        {anchor && <AnchorQuote anchor={anchor} onReveal={onRevealAnchor} />}
        <p className="mt-3 text-[0.8125rem] leading-[1.55] font-medium whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
          <span className="sr-only">You asked: </span>
          {text}
        </p>
      </div>
    );
  }

  return (
    <p className="mt-2 text-[0.8125rem] leading-[1.66] whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">
      <span className="sr-only">{speaker} answered: </span>
      <Inline text={text} />
      {caret && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.1em] bg-fg-3 motion-safe:animate-pulse"
        />
      )}
    </p>
  );
}

type ConversationProps = {
  /** Keys the chat: changing it starts a fresh thread, one per Lesson. */
  chatId: string;
  /** POST target for the AI SDK transport. Not used when `transport` is given. */
  endpoint?: string;
  /** A caller-supplied transport, so fixtures can stream without a route. */
  transport?: ChatTransport<UIMessage>;
  /** Extra request-body fields, sent with every turn (for example the Lesson id). */
  body?: Record<string, unknown>;
  turns: Turn[];
  replyFrom?: "tutor" | "tailor";
  replyName?: string;
  /** The passage a selection grew the next question from; cleared on send. */
  pendingAnchor?: string | null;
  onClearAnchor?: () => void;
  /** Finds the quoted passage in the Lesson; omit when there is no reading pane. */
  onRevealAnchor?: (anchor: string) => void;
  /** Bump to focus the composer (for example when Ask opens the Tutor). */
  focusToken?: number;
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
  stopLabel: string;
  retryLabel: string;
  pendingText: string;
  failedText?: string;
  empty?: ReactNode;
  below?: ReactNode;
  scrollport?: boolean;
  onFinish?: () => void | Promise<void>;
};

export function Conversation({
  chatId,
  endpoint,
  transport: suppliedTransport,
  body,
  turns,
  replyFrom = "tutor",
  replyName,
  pendingAnchor,
  onClearAnchor,
  onRevealAnchor,
  focusToken,
  placeholder,
  composerLabel,
  sendLabel,
  stopLabel,
  retryLabel,
  pendingText,
  failedText,
  empty,
  below,
  scrollport = true,
  onFinish,
}: ConversationProps) {
  const connected = Boolean(suppliedTransport || endpoint);
  const speaker = replyName ?? (replyFrom === "tailor" ? "The Tailor" : "The Tutor");

  const [draft, setDraft] = useState("");
  const [effort, setEffort] = useState<ReasoningEffort>("low");
  const [effortOpen, setEffortOpen] = useState(false);
  const [pinned, setPinned] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      suppliedTransport ??
      new DefaultChatTransport({
        api: endpoint,
        /* The server owns the stored conversation, so a request carries the
           new turn alone; the session signs it and the route schema holds it. */
        prepareSendMessagesRequest: ({ messages, body: fields }) => {
          const lastUser = [...messages].reverse().find((message) => message.role === "user");
          return {
            body: {
              ...fields,
              message: lastUser ? messageText(lastUser) : "",
            },
          };
        },
      }),
    [suppliedTransport, endpoint],
  );

  const seeded = useMemo(() => seedMessages(turns), [turns]);

  const { messages, sendMessage, status, stop, regenerate } = useChat({
    id: chatId,
    messages: seeded,
    transport,
    throttle: 50,
    onFinish: (event) => {
      if (event.isAbort || event.isError) return;
      void onFinish?.();
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  const failed = status === "error";
  const last = messages[messages.length - 1];
  const lastText = last ? messageText(last) : "";
  /* The tool call writes no prose, so the answer is still "being worked on". */
  const awaitingText =
    status === "submitted" ||
    (status === "streaming" && (!last || last.role !== "assistant" || lastText.length === 0));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, DRAFT_MAX_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    if (!scrollport) return;
    const el = scrollRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, lastText.length, status, pinned, scrollport]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM);
  }

  function jumpToLatest() {
    setPinned(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function submit() {
    const text = draft.trim();
    if (!text || !connected || streaming) return;
    const anchor = pendingAnchor ?? undefined;
    setDraft("");
    setPinned(true);
    onClearAnchor?.();
    void sendMessage(
      { text, metadata: anchor ? { anchor } : undefined },
      { body: { ...body, effort, anchor } },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  function retry() {
    setPinned(true);
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    void regenerate({ body: { ...body, effort, anchor: anchorOf(lastUser) ?? undefined } });
  }

  return (
    <div className={scrollport ? "flex min-h-0 flex-1 flex-col" : "flex flex-col"}>
      <div
        ref={scrollRef}
        onScroll={scrollport ? onScroll : undefined}
        className={
          scrollport ? "scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 py-4" : "px-3.5 py-4"
        }
      >
        <div>
          {messages.length === 0 && empty}
          {messages.map((message, index) => (
            <TurnRow
              key={message.id}
              message={message}
              speaker={speaker}
              caret={status === "streaming" && index === messages.length - 1 && lastText.length > 0}
              onRevealAnchor={onRevealAnchor}
            />
          ))}
          {awaitingText && (
            <p aria-live="polite" className="mt-3 text-[0.8125rem] text-fg-3">
              {pendingText}
            </p>
          )}
          {failed && failedText && (
            <div aria-live="polite" className="mt-3 flex items-baseline gap-3">
              <p className="text-[0.8125rem] text-fg-3">{failedText}</p>
              <Button variant="quiet" onClick={retry} className="shrink-0">
                {retryLabel}
              </Button>
            </div>
          )}
        </div>

        {below}

        {scrollport && !pinned && (
          <div className="pointer-events-none sticky bottom-2 z-10 flex justify-center pt-4">
            <Hint label="Jump to the latest answer">
              <Button
                variant="icon-raised"
                onClick={jumpToLatest}
                aria-label="Jump to the latest answer"
                className="pointer-events-auto h-8 w-8 rounded-md bg-over p-2 text-fg hover:bg-rule"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </Hint>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-hair p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {pendingAnchor && (
          <div className="mb-2.5 flex items-start gap-2 border-l border-rule pl-2.5">
            <p className="min-w-0 flex-1 text-[0.75rem] leading-[1.55] text-fg-3">
              “{pendingAnchor}”
            </p>
            <button
              type="button"
              onClick={onClearAnchor}
              aria-label="Clear the passage"
              className="-mt-0.5 shrink-0 p-0.5 text-fg-dim transition-colors hover:text-fg-2"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="rounded-md bg-canvas px-2.5 py-2 transition-colors focus-within:bg-raised">
          <Textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={DRAFT_LIMIT}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={composerLabel}
            disabled={!connected}
            className="max-h-40 min-h-[1.55rem] w-full resize-none overflow-y-auto bg-transparent px-0 py-0 leading-[1.55] focus:bg-transparent disabled:opacity-60"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <DropdownMenu open={effortOpen} onOpenChange={setEffortOpen}>
              <Hint label="Gemini 3.7 Flash reasoning effort">
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`Reasoning effort: ${effort}`}
                      className="-ml-1 h-8 gap-1.5 px-1 text-[0.75rem] capitalize"
                    >
                      <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {effort}
                      <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
                    </Button>
                  }
                />
              </Hint>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-60 p-3"
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    event.stopPropagation();
                }}
              >
                <div className="flex items-center gap-2 text-[0.8125rem] text-fg">
                  <Zap className="h-3.5 w-3.5 text-fg-3" strokeWidth={1.75} />
                  <span className="font-medium">Gemini 3.7 Flash</span>
                  <span className="ml-auto capitalize text-fg-3">{effort}</span>
                </div>
                <Slider.Root
                  value={EFFORTS.indexOf(effort)}
                  min={0}
                  max={2}
                  step={1}
                  onValueChange={(value) => setEffort(EFFORTS[value])}
                  onValueCommitted={() => setEffortOpen(false)}
                  className="mt-4"
                >
                  <Slider.Control className="relative mx-2.5 flex h-6 touch-none items-center">
                    <Slider.Track className="relative h-1.5 w-full overflow-hidden bg-raised">
                      <Slider.Indicator className="h-full bg-fg-3" />
                    </Slider.Track>
                    {EFFORTS.map((value, index) => (
                      <span
                        key={value}
                        className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 bg-panel ring-1 ring-fg-3"
                        style={{ left: `${index * 50}%` }}
                      />
                    ))}
                    <Slider.Thumb
                      getAriaLabel={() => "Reasoning effort"}
                      getAriaValueText={(_, value) => EFFORTS[value]}
                      className="h-5 w-5 bg-fg outline-none ring-canvas focus-visible:ring-2"
                    />
                  </Slider.Control>
                </Slider.Root>
                <div className="mt-1 flex justify-between text-[0.6875rem] capitalize text-fg-dim">
                  {EFFORTS.map((value) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2">
              {draft.length > DRAFT_LIMIT - DRAFT_LIMIT_WARN && (
                <span className="tnum text-[0.6875rem] text-fg-dim">
                  {draft.length}/{DRAFT_LIMIT}
                </span>
              )}
              {streaming ? (
                <Hint label={stopLabel}>
                  <Button
                    type="button"
                    variant="icon-raised"
                    onClick={() => void stop()}
                    aria-label={stopLabel}
                    className="h-8 w-8 p-2"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                  </Button>
                </Hint>
              ) : (
                <Hint label={sendLabel}>
                  <Button
                    type="submit"
                    variant="icon-raised"
                    disabled={!draft.trim() || !connected}
                    aria-label={sendLabel}
                    className="h-8 w-8 p-2 disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </Hint>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export function TailorConversation({
  chatId,
  endpoint,
  transport,
  turns,
  onFinish,
  plan,
  onDiscard,
  onRestore,
  onApply,
  applying,
  empty,
  publishedSlot,
  scrollport = true,
  revisionSlot,
}: {
  chatId: string;
  endpoint?: string;
  transport?: ChatTransport<UIMessage>;
  turns: Turn[];
  onFinish?: () => void | Promise<void>;
  plan?: PlanView;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  /** Accepts every row still standing and starts the revision. */
  onApply: () => void;
  applying?: boolean;
  empty?: ReactNode;
  publishedSlot?: ReactNode;
  scrollport?: boolean;
  revisionSlot?: ReactNode;
}) {
  const open = plan?.operations ?? [];
  const liveCount = open.filter((operation) => operation.status !== "discarded").length;

  return (
    <Conversation
      chatId={chatId}
      endpoint={endpoint}
      transport={transport}
      turns={turns}
      onFinish={onFinish}
      replyFrom="tailor"
      placeholder="Ask for a change"
      composerLabel="Tell the Tailor what to change"
      sendLabel="Tell the Tailor"
      stopLabel="Stop the Tailor"
      retryLabel="Retry"
      pendingText="Working on a plan…"
      failedText="The Tailor could not answer just now."
      empty={empty}
      scrollport={scrollport}
      below={
        <>
          {revisionSlot}
          {open.length > 0 && (
            <div className="mt-5">
              <p className="label text-fg-3">Change plan</p>
              <ul className="-mx-3.5 mt-2 border-t border-hair">
                {open.map((operation) => {
                  const discarded = operation.status === "discarded";
                  return (
                    <li key={operation.id} className="border-b border-hair px-3.5 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="label text-fg-3">{operation.verb}</span>
                        <span className="tnum max-w-[10rem] truncate text-[0.6875rem] text-fg-dim">
                          {operation.entry}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-2 text-[0.875rem] leading-[1.45] font-medium",
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
                              className="ml-auto"
                            >
                              Restore
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="discard"
                            onClick={() => onDiscard(operation.id)}
                            className="ml-auto"
                          >
                            Discard
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {liveCount > 0 && (
                <div className="mt-4">
                  <Button onClick={onApply} disabled={applying} className="w-full">
                    {applying ? "Applying the changes…" : "Apply the changes"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {publishedSlot}
        </>
      }
    />
  );
}
