"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, X } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Inline } from "./prose";

export type PanelMode = "tutor" | "tailor";

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

type Props = {
  mode: PanelMode;
  /** The restored conversation for the open Lesson; server-owned history. */
  tutorTurns?: Turn[];
  /**
   * Sends one Learner message and streams the Tutor's answer through
   * `onDelta`; resolves true when the answer completed. Absent until the
   * Tutor is wired: the composer then stands down.
   */
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  /** The Tailor's conversation, restored from the server (#12). */
  tailorTurns?: Turn[];
  /** Streams one Tailor turn; resolves true when it completed. */
  onTailorAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  /** The Change plan under review, if one is proposed. */
  tailorPlan?: PlanView;
  onAccept: (operationId: string) => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
  /** the drag strip on the panel's inner edge; the workspace owns the width */
  resizer?: ReactNode;
};

export function Panel({
  mode,
  tutorTurns,
  onAsk,
  tailorTurns,
  onTailorAsk,
  tailorPlan,
  onAccept,
  onDiscard,
  onRestore,
  onMode,
  onClose,
  resizer,
}: Props) {
  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      aria-label={mode === "tutor" ? "Tutor" : "Tailor"}
      className="border-hair"
    >
      <SidebarHeader className="gap-0 border-b border-hair px-3 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          {/* The panel sits on --panel, so its switch track insets to the
              canvas rather than to --panel. */}
          <ToggleGroup
            multiple={false}
            value={[mode]}
            onValueChange={(v) => onMode((v[0] as PanelMode) ?? mode)}
            aria-label="Panel mode"
            className="bg-canvas"
          >
            <ToggleGroupItem value="tutor">Tutor</ToggleGroupItem>
            <ToggleGroupItem value="tailor">Tailor</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="icon-raised" onClick={onClose} aria-label="Close the panel">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
        <p className="mt-2.5 text-[0.75rem] leading-[1.5] text-fg-3">
          {mode === "tutor"
            ? "Changes nothing in the Course."
            : "Nothing is written until you apply it."}
        </p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        {mode === "tutor" ? (
          <Conversation
            turns={tutorTurns ?? []}
            onAsk={onAsk}
            placeholder="Ask about this Lesson"
            composerLabel="Ask the Tutor about this Lesson"
            sendLabel="Ask the Tutor"
            pendingText="Working on an answer…"
            failedText="The Tutor could not answer just now — ask again."
          />
        ) : (
          <TailorPane
            turns={tailorTurns ?? []}
            onAsk={onTailorAsk}
            plan={tailorPlan}
            onAccept={onAccept}
            onDiscard={onDiscard}
            onRestore={onRestore}
          />
        )}
      </SidebarContent>

      {/* Sits on the panel's inner edge, over the fixed container. */}
      {resizer}
    </Sidebar>
  );
}

/**
 * The conversation both panes share: a scrolling thread, a pending marker
 * until the first word arrives, and the composer. The answer grows in
 * place, in the turn that was opened for it. `below` renders inside the
 * scroll area under the thread — the Tailor's plan lives there.
 */
function Conversation({
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
 * Course until the accepted operations are applied.
 */
function TailorPane({
  turns,
  onAsk,
  plan,
  onAccept,
  onDiscard,
  onRestore,
}: {
  turns: Turn[];
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  plan?: PlanView;
  onAccept: (operationId: string) => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
}) {
  const open = plan?.operations ?? [];

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
          </div>
        ) : null
      }
    />
  );
}
