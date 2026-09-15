"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
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

function EmptyCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[15rem] py-8">
      <p className="text-[0.875rem] font-medium text-fg">{title}</p>
      <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">{body}</p>
    </div>
  );
}

type Props = {
  mode: PanelMode;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  tutorTurns?: Turn[];
  onTutorFinished?: () => void | Promise<void>;
  /** The passage a selection grew the next Tutor question from. */
  pendingAnchor?: string | null;
  onClearAnchor?: () => void;
  onRevealAnchor?: (anchor: string) => void;
  /** Bump to focus the Tutor's composer. */
  focusToken?: number;
  tailorTurns?: Turn[];
  onTailorFinished?: () => void | Promise<void>;
  tailorPlan?: PlanView;
  onApply: () => void;
  applying?: boolean;
  onDiscard: (operationId: string) => void;
  onRestore: (operationId: string) => void;
  revisionSlot?: ReactNode;
  tutorNotice?: ReactNode;
  publishedSlot?: ReactNode;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
  resizer?: ReactNode;
};

export function Panel({
  mode,
  courseId,
  lessonId,
  lessonTitle,
  tutorTurns,
  onTutorFinished,
  pendingAnchor,
  onClearAnchor,
  onRevealAnchor,
  focusToken,
  tailorTurns,
  onTailorFinished,
  tailorPlan,
  onApply,
  applying,
  onDiscard,
  onRestore,
  revisionSlot,
  tutorNotice,
  publishedSlot,
  onMode,
  onClose,
  resizer,
}: Props) {
  const { isMobile } = useSidebar();
  const subtitle =
    mode === "tutor"
      ? "Answers about this Lesson and the Course. Changes nothing."
      : "Proposes changes to the Course. Nothing is written until you apply.";

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
          {isMobile && (
            <Button
              variant="icon"
              onClick={onClose}
              aria-label={mode === "tutor" ? "Close the Tutor" : "Close the Tailor"}
              className="-mr-1 h-11 w-11 p-2"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>
        <p className="mt-2.5 truncate text-[0.75rem] leading-[1.5] text-fg-3">{subtitle}</p>
        {mode === "tutor" && (
          <p className="mt-1 truncate text-[0.75rem] leading-[1.5] text-fg-dim">
            This Lesson · {lessonTitle}
          </p>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        <div className={mode === "tutor" ? "contents" : "hidden"} inert={mode !== "tutor"}>
          {tutorNotice}
          <Conversation
            chatId={lessonId}
            endpoint={`/api/courses/${courseId}/tutor`}
            body={{ lessonId }}
            turns={tutorTurns ?? []}
            onFinish={onTutorFinished}
            pendingAnchor={pendingAnchor}
            onClearAnchor={onClearAnchor}
            onRevealAnchor={onRevealAnchor}
            focusToken={focusToken}
            placeholder="Ask about this Lesson"
            composerLabel="Ask the Tutor about this Lesson"
            sendLabel="Ask the Tutor"
            stopLabel="Stop the Tutor"
            retryLabel="Retry"
            pendingText="Working on an answer…"
            failedText="The Tutor could not answer just now."
            empty={
              <EmptyCopy
                title="Ask about this Lesson"
                body="Clarify an idea, work through the Exercise, or check your understanding."
              />
            }
          />
        </div>
        <div className={mode === "tailor" ? "contents" : "hidden"} inert={mode !== "tailor"}>
          <TailorConversation
            chatId={courseId}
            endpoint={`/api/courses/${courseId}/tailor`}
            turns={tailorTurns ?? []}
            onFinish={onTailorFinished}
            plan={tailorPlan}
            onApply={onApply}
            applying={applying}
            onDiscard={onDiscard}
            onRestore={onRestore}
            empty={
              <EmptyCopy
                title="Shape the Course"
                body="Ask for a change. The Tailor prepares a Change plan for you to review."
              />
            }
            revisionSlot={revisionSlot}
            publishedSlot={publishedSlot}
          />
        </div>
      </SidebarContent>

      {resizer}
    </Sidebar>
  );
}
