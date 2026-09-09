"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ReasoningEffort } from "@/lib/model";
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
  lessonTitle: string;
  tutorTurns?: Turn[];
  onAsk?: (
    text: string,
    effort: ReasoningEffort,
    onDelta: (chunk: string) => void,
  ) => Promise<boolean>;
  tailorTurns?: Turn[];
  onTailorAsk?: (
    text: string,
    effort: ReasoningEffort,
    onDelta: (chunk: string) => void,
  ) => Promise<boolean>;
  tailorPlan?: PlanView;
  onAccept: (operationId: string) => void;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  tailorApply?: ReactNode;
  revisionSlot?: ReactNode;
  tutorNotice?: ReactNode;
  publishedSlot?: ReactNode;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
  resizer?: ReactNode;
};

export function Panel({
  mode,
  lessonTitle,
  tutorTurns,
  onAsk,
  tailorTurns,
  onTailorAsk,
  tailorPlan,
  onAccept,
  onDiscard,
  onRestore,
  tailorApply,
  revisionSlot,
  tutorNotice,
  publishedSlot,
  onMode,
  onClose,
  resizer,
}: Props) {
  const { isMobile } = useSidebar();

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      reserveSpace={false}
      role="complementary"
      aria-label={mode === "tutor" ? "Tutor" : "Tailor"}
      className="border-hair duration-160 ease-expo"
    >
      <SidebarHeader className="gap-0 border-b border-hair px-3 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            multiple={false}
            value={[mode]}
            onValueChange={(v) => onMode((v[0] as PanelMode) ?? mode)}
            aria-label="Tutor or Tailor"
            className="bg-canvas"
          >
            <ToggleGroupItem value="tutor" className={isMobile ? "h-11" : "h-9"}>
              Tutor
            </ToggleGroupItem>
            <ToggleGroupItem value="tailor" className={isMobile ? "h-11" : "h-9"}>
              Tailor
            </ToggleGroupItem>
          </ToggleGroup>
          {isMobile ? (
            <Button
              variant="icon"
              onClick={onClose}
              aria-label={mode === "tutor" ? "Close the Tutor" : "Close the Tailor"}
              className="-mr-1 h-11 w-11 p-2"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          ) : null}
        </div>
        <p className="mt-2.5 truncate text-[0.75rem] leading-[1.5] text-fg-3">
          {mode === "tutor"
            ? `This Lesson · ${lessonTitle}`
            : "Course · Changes require your approval."}
        </p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        <div className={mode === "tutor" ? "contents" : "hidden"} inert={mode !== "tutor"}>
          {tutorNotice}
          <Conversation
            turns={tutorTurns ?? []}
            onAsk={onAsk}
            placeholder="Ask about this Lesson"
            composerLabel="Ask the Tutor about this Lesson"
            sendLabel="Ask the Tutor"
            pendingText="Working on an answer…"
            failedText="The Tutor could not answer just now — ask again."
            empty={
              <div className="max-w-[15rem] py-8">
                <p className="text-[0.875rem] font-medium text-fg">Ask about this Lesson</p>
                <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">
                  Clarify an idea, work through the Exercise, or check your understanding.
                </p>
              </div>
            }
          />
        </div>
        <div className={mode === "tailor" ? "contents" : "hidden"} inert={mode !== "tailor"}>
          <TailorConversation
            turns={tailorTurns ?? []}
            onAsk={onTailorAsk}
            plan={tailorPlan}
            onAccept={onAccept}
            onDiscard={onDiscard}
            onRestore={onRestore}
            empty={
              <div className="max-w-[15rem] py-8">
                <p className="text-[0.875rem] font-medium text-fg">Shape the Course</p>
                <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">
                  Ask for a change. The Tailor prepares a Change plan for you to review.
                </p>
              </div>
            }
            applySlot={tailorApply}
            revisionSlot={revisionSlot}
            publishedSlot={publishedSlot}
          />
        </div>
      </SidebarContent>

      {resizer}
    </Sidebar>
  );
}
