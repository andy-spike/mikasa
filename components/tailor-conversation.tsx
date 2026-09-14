"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Slider } from "@base-ui/react/slider";
import { ArrowUp, ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Inline } from "@/components/workspace/prose";
import type { ReasoningEffort } from "@/lib/model";

export type Turn = { from: "learner" | "tutor" | "tailor"; text: string };

export type PlanOperation = {
  id: string;
  verb: string;
  entry: string;
  detail: string;
  status: "proposed" | "accepted" | "discarded";
};

export type PlanView = { id: string; operations: PlanOperation[] };

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.from === "learner") {
    return (
      <p className="ml-6 rounded-md bg-raised px-3 py-2 text-[0.8125rem] leading-[1.55] text-fg [overflow-wrap:anywhere]">
        {turn.text}
      </p>
    );
  }
  return (
    <p className="text-[0.8125rem] leading-[1.66] text-fg-2 [overflow-wrap:anywhere]">
      <Inline text={turn.text} />
    </p>
  );
}

const EFFORTS = ["low", "medium", "high"] as const satisfies readonly ReasoningEffort[];

export function Conversation({
  turns,
  onAsk,
  below,
  replyFrom = "tutor",
  placeholder,
  composerLabel,
  sendLabel,
  pendingText,
  failedText,
  empty,
  scrollport = true,
}: {
  turns: Turn[];
  onAsk?: (
    text: string,
    effort: ReasoningEffort,
    onDelta: (chunk: string) => void,
  ) => Promise<boolean>;
  below?: ReactNode;
  replyFrom?: "tutor" | "tailor";
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
  pendingText: string;
  failedText?: string;
  empty?: ReactNode;
  scrollport?: boolean;
}) {
  const [thread, setThread] = useState<Turn[]>(turns);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [effort, setEffort] = useState<ReasoningEffort>("low");
  const [effortOpen, setEffortOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [restored, setRestored] = useState(turns);
  const foot = useRef<HTMLDivElement>(null);
  const tail = thread[thread.length - 1]?.text.length;

  /* The server owns the thread: restored history replaces the local one
     whenever a new conversation arrives (a Lesson switch, a refresh). */
  if (turns !== restored) {
    setRestored(turns);
    setThread(turns);
    setFailed(false);
  }

  useEffect(() => {
    if (!scrollport) return;
    foot.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread.length, tail, pending, streaming, scrollport]);

  const connected = Boolean(onAsk);

  function appendChunk(chunk: string) {
    setThread((t) => {
      const copy = [...t];
      const last = copy[copy.length - 1];
      if (last && last.from === replyFrom)
        copy[copy.length - 1] = { ...last, text: last.text + chunk };
      return copy;
    });
  }

  function dropEmptyReply() {
    setThread((t) => {
      const copy = [...t];
      const last = copy[copy.length - 1];
      if (last && last.from === replyFrom && last.text === "") copy.pop();
      return copy;
    });
  }

  function trySend() {
    const text = draft.trim();
    if (text && !pending && connected) ask(text);
  }

  async function ask(text: string) {
    if (!onAsk) return;
    setThread((t) => [...t, { from: "learner", text }, { from: replyFrom, text: "" }]);
    setDraft("");
    setPending(true);
    setStreaming(false);

    let seen = false;
    const ok = await onAsk(text, effort, (chunk) => {
      if (chunk.length > 0) {
        if (!seen) {
          seen = true;
          setPending(false);
          setStreaming(true);
        }
        appendChunk(chunk);
      }
    });

    setPending(false);
    setStreaming(false);
    if (!ok) {
      dropEmptyReply();
      if (failedText) setFailed(true);
    }
  }

  return (
    <div className={scrollport ? "contents" : "flex flex-col"}>
      <div
        className={
          scrollport ? "scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 py-4" : "px-3.5 py-4"
        }
      >
        <div className="space-y-4">
          {thread.length === 0 && empty}
          {thread.map((turn, i) => (
            <TurnBubble key={i} turn={turn} />
          ))}
          {pending && (
            <p className="text-[0.8125rem] text-fg-3" aria-live="polite">
              {pendingText}
            </p>
          )}
          {failed && (
            <p className="text-[0.8125rem] text-fg-3" aria-live="polite">
              {failedText}
            </p>
          )}
        </div>
        {below}
        <div ref={foot} />
      </div>

      <form
        className="shrink-0 border-t border-hair p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          trySend();
        }}
      >
        <div className="rounded-md bg-canvas px-2.5 py-2 transition-colors focus-within:bg-raised">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                trySend();
              }
            }}
            placeholder={placeholder}
            aria-label={composerLabel}
            disabled={!connected}
            className="min-h-[2.5rem] w-full bg-transparent px-0 py-0 focus:bg-transparent disabled:opacity-60"
          />
          <div className="mt-1 flex items-center justify-between">
            <DropdownMenu open={effortOpen} onOpenChange={setEffortOpen}>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="quiet"
                    aria-label={`Reasoning effort: ${effort}`}
                    title="Gemini 3.7 Flash reasoning effort"
                    className="-ml-1 h-8 gap-1.5 px-1 text-[0.75rem] capitalize"
                  >
                    <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {effort}
                    <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
                  </Button>
                }
              />
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
            <Button
              type="submit"
              variant="icon-raised"
              disabled={!draft.trim() || pending || !connected}
              aria-label={sendLabel}
              className="disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function TailorConversation({
  turns,
  onAsk,
  plan,
  onAccept,
  onDiscard,
  onRestore,
  empty,
  applySlot,
  applyAllSlot,
  publishedSlot,
  scrollport = true,
  revisionSlot,
}: {
  turns: Turn[];
  onAsk?: (
    text: string,
    effort: ReasoningEffort,
    onDelta: (chunk: string) => void,
  ) => Promise<boolean>;
  plan?: PlanView;
  onAccept: (operationId: string) => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  empty?: ReactNode;
  applySlot?: ReactNode;
  applyAllSlot?: ReactNode;
  publishedSlot?: ReactNode;
  scrollport?: boolean;
  revisionSlot?: ReactNode;
}) {
  const open = plan?.operations ?? [];
  const acceptedCount = open.filter((o) => o.status === "accepted").length;
  const proposedCount = open.filter((o) => o.status === "proposed").length;

  return (
    <Conversation
      turns={turns}
      onAsk={onAsk}
      replyFrom="tailor"
      placeholder="Ask for a change"
      composerLabel="Tell the Tailor what to change"
      sendLabel="Tell the Tailor"
      pendingText="Working on a plan…"
      empty={empty}
      scrollport={scrollport}
      below={
        <>
          {revisionSlot}
          {open.length > 0 && (
            <div className="mt-5">
              <p className="label text-fg-3">Change plan</p>
              <ul className="-mx-3.5 mt-2 border-t border-hair">
                {open.map((operation) => (
                  <li key={operation.id} className="border-b border-hair px-3.5 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="label text-fg-3">{operation.verb}</span>
                      <span className="tnum max-w-[10rem] truncate text-[0.6875rem] text-fg-dim">
                        {operation.entry}
                      </span>
                    </div>
                    <p className="mt-2 text-[0.875rem] leading-[1.45] font-medium text-fg">
                      {operation.detail}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      {operation.status === "proposed" ? (
                        <>
                          <Button variant="compact" onClick={() => onAccept(operation.id)}>
                            Accept
                          </Button>
                          <Button
                            variant="discard"
                            onClick={() => onDiscard(operation.id)}
                            className="ml-auto"
                          >
                            Discard
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-[0.75rem] text-fg-3">
                            {operation.status === "accepted" ? "Accepted" : "Discarded"}
                          </span>
                          <Button
                            variant="quiet"
                            onClick={() => onRestore(operation.id)}
                            className="ml-auto"
                          >
                            {operation.status === "accepted" ? "Undo" : "Restore"}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {applySlot && acceptedCount > 0 && <div className="mt-4">{applySlot}</div>}
              {applyAllSlot && proposedCount > 0 && <div className="mt-4">{applyAllSlot}</div>}
            </div>
          )}
          {publishedSlot}
        </>
      }
    />
  );
}
