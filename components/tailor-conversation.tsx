"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Inline } from "@/components/workspace/prose";

/** One side of a pane conversation, as the panes render it. */
export type Turn = { from: "learner" | "tutor" | "tailor"; text: string };

/** One operation of a Change plan under review (ticket #12). */
export type PlanOperation = {
  id: string;
  verb: string;
  entry: string;
  detail: string;
  status: "proposed" | "accepted" | "discarded";
};

export type PlanView = { id: string; operations: PlanOperation[] };

/**
 * The conversation the Tutor and Tailor panes share: a scrolling thread,
 * a pending marker until the first word arrives, and the composer. The
 * answer grows in place, in the turn that was opened for it. `below`
 * renders inside the scroll area under the thread — the Tailor's plan
 * lives there.
 */
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
}: {
  turns: Turn[];
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  below?: ReactNode;
  replyFrom?: "tutor" | "tailor";
  placeholder: string;
  composerLabel: string;
  sendLabel: string;
  pendingText: string;
  failedText?: string;
}) {
  const [thread, setThread] = useState<Turn[]>(turns);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
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
    foot.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread.length, tail, pending, streaming]);

  const connected = Boolean(onAsk);

  async function ask(text: string) {
    if (!onAsk) return;
    setThread((t) => [...t, { from: "learner", text }, { from: replyFrom, text: "" }]);
    setDraft("");
    setPending(true);
    setStreaming(false);

    let seen = false;
    const ok = await onAsk(text, (chunk) => {
      if (chunk.length > 0) {
        if (!seen) {
          seen = true;
          setPending(false);
          setStreaming(true);
        }
        /* The answer grows in place, in the turn that was opened for it. */
        setThread((t) => {
          const copy = [...t];
          const last = copy[copy.length - 1];
          if (last && last.from === replyFrom) copy[copy.length - 1] = { ...last, text: last.text + chunk };
          return copy;
        });
      }
    });

    setPending(false);
    setStreaming(false);
    if (!ok) {
      /* The turn never completed: nothing was stored. Drop the empty
         reply and say so, rather than leaving a hole in the thread. */
      setThread((t) => {
        const copy = [...t];
        const last = copy[copy.length - 1];
        if (last && last.from === replyFrom && last.text === "") copy.pop();
        return copy;
      });
      if (failedText) setFailed(true);
    }
  }

  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        <div className="space-y-4">
          {thread.map((turn, i) =>
            turn.from === "learner" ? (
              /* The learner's own words sit one step up, right-shouldered. */
              <p
                key={i}
                className="ml-6 rounded-md bg-raised px-3 py-2 text-[0.8125rem] leading-[1.55] text-fg"
              >
                {turn.text}
              </p>
            ) : (
              <p
                key={i}
                className="text-[0.8125rem] leading-[1.66] text-fg-2"
              >
                <Inline text={turn.text} />
              </p>
            ),
          )}
          {pending ? (
            <p className="text-[0.8125rem] text-fg-3" aria-live="polite">
              {pendingText}
            </p>
          ) : null}
          {failed ? (
            <p className="text-[0.8125rem] text-fg-3" aria-live="polite">
              {failedText}
            </p>
          ) : null}
        </div>
        {below}
        <div ref={foot} />
      </div>

      <form
        className="shrink-0 border-t border-hair p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (text && !pending && connected) ask(text);
        }}
      >
        <div className="flex items-end gap-2 rounded-md bg-canvas px-2.5 py-2 transition-colors focus-within:bg-raised">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const text = draft.trim();
                if (text && !pending && connected) ask(text);
              }
            }}
            placeholder={placeholder}
            aria-label={composerLabel}
            disabled={!connected}
            className="min-h-[2.5rem] flex-1 bg-transparent px-0 py-0 focus:bg-transparent disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="icon-raised"
            disabled={!draft.trim() || pending || !connected}
            aria-label={sendLabel}
            className="mb-0.5 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * The Tailor: the shared conversation, with the Change plan under review
 * below the thread. Each operation is decided on its own — accepting or
 * discarding one never touches the others, and nothing reaches the
 * Course until the accepted operations are applied. `applySlot` (the
 * Outline checkpoint's Apply action, #13) renders under the plan.
 */
export function TailorConversation({
  turns,
  onAsk,
  plan,
  onAccept,
  onDiscard,
  onRestore,
  applySlot,
}: {
  turns: Turn[];
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  plan?: PlanView;
  onAccept: (operationId: string) => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  applySlot?: ReactNode;
}) {
  const open = plan?.operations ?? [];
  const acceptedCount = open.filter((o) => o.status === "accepted").length;

  return (
    <Conversation
      turns={turns}
      onAsk={onAsk}
      replyFrom="tailor"
      placeholder="Ask for a change"
      composerLabel="Tell the Tailor what to change"
      sendLabel="Tell the Tailor"
      pendingText="Working on a plan…"
      below={
        open.length > 0 ? (
          <div className="mt-5">
            <p className="label text-fg-3">Change plan</p>
            <ul className="-mx-3.5 mt-2 border-t border-hair">
              {open.map((operation) => (
                <li
                  key={operation.id}
                  className="border-b border-hair px-3.5 py-3.5"
                >
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
                    {operation.status === "accepted" ? (
                      <>
                        <span className="text-[0.75rem] text-fg-3">Accepted</span>
                        <Button
                          variant="quiet"
                          onClick={() => onRestore(operation.id)}
                          className="ml-auto"
                        >
                          Undo
                        </Button>
                      </>
                    ) : operation.status === "discarded" ? (
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
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {applySlot && acceptedCount > 0 ? <div className="mt-4">{applySlot}</div> : null}
          </div>
        ) : null
      }
    />
  );
}
