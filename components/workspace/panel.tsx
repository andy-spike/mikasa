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
import type { TailorChange } from "@/lib/demo-course";

export type PanelMode = "tutor" | "tailor";

/** One side of the Tutor conversation, as the pane renders it. */
export type TutorTurn = { from: "learner" | "tutor"; text: string };

type Props = {
  mode: PanelMode;
  /** The restored conversation for the open Lesson; server-owned history. */
  tutorTurns?: TutorTurn[];
  /**
   * Sends one Learner message and streams the Tutor's answer through
   * `onDelta`; resolves true when the answer completed. Absent until the
   * Tutor is wired: the composer then stands down.
   */
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
  /** The Tailor's pending changes; empty until ticket #12. */
  tailorPlan?: TailorChange[];
  applied: ReadonlySet<string>;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
  onApprove: (id: string) => void;
  onUndo: (id: string) => void;
  /** the drag strip on the panel's inner edge; the workspace owns the width */
  resizer?: ReactNode;
};

export function Panel({
  mode,
  tutorTurns,
  onAsk,
  tailorPlan,
  applied,
  onMode,
  onClose,
  onApprove,
  onUndo,
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
            : "Nothing is written until you approve it."}
        </p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        {mode === "tutor" ? (
          <TutorPane turns={tutorTurns ?? []} onAsk={onAsk} />
        ) : (
          <TailorPane plan={tailorPlan ?? []} applied={applied} onApprove={onApprove} onUndo={onUndo} />
        )}
      </SidebarContent>

      {/* Sits on the panel's inner edge, over the fixed container. */}
      {resizer}
    </Sidebar>
  );
}

function TutorPane({
  turns,
  onAsk,
}: {
  turns: TutorTurn[];
  onAsk?: (text: string, onDelta: (chunk: string) => void) => Promise<boolean>;
}) {
  const [thread, setThread] = useState<TutorTurn[]>(turns);
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
    setThread((t) => [...t, { from: "learner", text }, { from: "tutor", text: "" }]);
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
          if (last && last.from === "tutor") copy[copy.length - 1] = { ...last, text: last.text + chunk };
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
        if (last && last.from === "tutor" && last.text === "") copy.pop();
        return copy;
      });
      setFailed(true);
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
              Working on an answer…
            </p>
          ) : null}
          {failed ? (
            <p className="text-[0.8125rem] text-fg-3" aria-live="polite">
              The Tutor could not answer just now — ask again.
            </p>
          ) : null}
        </div>
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
            placeholder="Ask about this Lesson"
            aria-label="Ask the Tutor about this Lesson"
            disabled={!connected}
            className="min-h-[2.5rem] flex-1 bg-transparent px-0 py-0 focus:bg-transparent disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="icon-raised"
            disabled={!draft.trim() || pending || !connected}
            aria-label="Ask the Tutor"
            className="mb-0.5 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </form>
    </>
  );
}

function TailorPane({
  plan,
  applied,
  onApprove,
  onUndo,
}: {
  plan: TailorChange[];
  applied: ReadonlySet<string>;
  onApprove: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const [discarded, setDiscarded] = useState<string[]>([]);
  const open = plan.filter((c) => !discarded.includes(c.id));

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
      <p className="mb-4 text-[0.8125rem] leading-[1.6] text-fg-2">
        {open.length > 0
          ? "Here is what I would change. Any of them can be undone later."
          : "Nothing pending. Ask for a change and I will draft it."}
      </p>

      {/* Hairline-divided rows on the panel's own ground. A stack of
          identically shaped boxes would be a card list, which this world
          does not have — the Outline already set the grammar. */}
      <ul className="-mx-3.5 border-t border-hair">
        {open.map((change) => {
          const bound = applied.has(change.id);
          return (
            <li
              key={change.id}
              className="border-b border-hair px-3.5 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="label text-fg-3">{change.verb}</span>
                <span className="tnum text-[0.6875rem] text-fg-dim">
                  {change.entry}
                </span>
              </div>
              <p className="mt-2 text-[0.875rem] leading-[1.45] font-medium text-fg">
                {change.detail}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-[1.5] text-fg-3">
                {change.reason}
              </p>

              <div className="mt-3 flex items-center gap-3">
                {bound ? (
                  <>
                    <span className="text-[0.75rem] text-fg-3">Applied</span>
                    <Button variant="quiet" onClick={() => onUndo(change.id)} className="ml-auto">
                      Undo
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="compact" onClick={() => onApprove(change.id)}>
                      Approve
                    </Button>
                    <Button
                      variant="discard"
                      onClick={() => setDiscarded((d) => [...d, change.id])}
                      className="ml-auto"
                    >
                      Discard
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
