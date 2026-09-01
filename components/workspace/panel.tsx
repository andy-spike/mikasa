"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Conversation,
  TailorConversation,
  type PlanView,
  type Turn,
} from "@/components/tailor-conversation";

export type PanelMode = "tutor" | "tailor";
export type { PlanView, Turn } from "@/components/tailor-conversation";

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
  /** Staging a revision (#14): the reading page's apply action. */
  tailorApply?: ReactNode;
  /** One line of pane-level status, e.g. that a revision is staging. */
  tailorStatus?: string;
  /** The published changes and their undo affordances (#15). */
  publishedSlot?: ReactNode;
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
  tailorApply,
  tailorStatus,
  publishedSlot,
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
          {tailorStatus ??
            (mode === "tutor"
              ? "Changes nothing in the Course."
              : "Nothing is written until you apply it.")}
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
          <TailorConversation
            turns={tailorTurns ?? []}
            onAsk={onTailorAsk}
            plan={tailorPlan}
            onAccept={onAccept}
            onDiscard={onDiscard}
            onRestore={onRestore}
            applySlot={tailorApply}
            publishedSlot={publishedSlot}
          />
        )}
      </SidebarContent>

      {/* Sits on the panel's inner edge, over the fixed container. */}
      {resizer}
    </Sidebar>
  );
}
