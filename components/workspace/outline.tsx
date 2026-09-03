"use client";

import Link from "next/link";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ReadingLesson } from "@/lib/course/reading";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DoneCheck, LiveMark, UnsetMark } from "./marks";

export type ModuleView = {
  numeral: string;
  title: string;
  lessons: (ReadingLesson & { n: number })[];
};

type Props = {
  /** The Course's own header: the rail carries it, there is no other chrome. */
  topic: string;
  goal: string;
  modules: ModuleView[];
  openId: string;
  liveId: string | null;
  /** true only just after a mark handed the accent to a new Lesson */
  handing: boolean;
  justDoneId: string | null;
  stampFor: (id: string) => string | undefined;
  onOpen: (id: string) => void;
  onCollapse: () => void;
  onExpand: () => void;
  total: number;
  doneCount: number;
  /** the drag strip on the rail's inner edge; the workspace owns the width */
  resizer?: ReactNode;
};

export function Outline({
  topic,
  goal,
  modules,
  openId,
  liveId,
  handing,
  justDoneId,
  stampFor,
  onOpen,
  onCollapse,
  onExpand,
  total,
  doneCount,
  resizer,
}: Props) {
  /* On a phone the Sidebar is a sheet, and a row is something you hit with
     a thumb rather than scan with an eye. */
  const { isMobile } = useSidebar();

  return (
    <Sidebar side="left" collapsible="icon" aria-label="Outline" className="border-hair">
      {/* Collapsed, the rail keeps the shell's left edge and the one number
          worth carrying at 44px wide. */}
      <div className="hidden flex-col items-center gap-1 py-3 group-data-[collapsible=icon]:flex">
        <Button
          variant="icon-raised"
          onClick={onExpand}
          aria-label="Expand the Outline"
          className="p-2"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <span className="tnum mt-1 text-[0.75rem] text-fg-dim">
          {doneCount}/{total}
        </span>
      </div>

      <SidebarHeader className="gap-0 px-4 pt-3 pb-3 group-data-[collapsible=icon]:hidden">
        {/* The way back out of the shell. The workspace has no header row,
            so the rail carries it. */}
        <Link
          href="/courses"
          className="mb-2 -ml-1 flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-[0.75rem] text-fg-dim transition-colors hover:text-fg-2"
        >
          <ChevronLeft className="h-3 w-3" strokeWidth={1.75} />
          Courses
        </Link>

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
            {topic}
          </h1>
          <Button
            variant="icon-raised"
            onClick={onCollapse}
            aria-label={isMobile ? "Close the Outline" : "Collapse the Outline"}
            className="-mt-0.5 -mr-1"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>

        {/* The Goal, unlabelled: under a Course title it cannot read as
            anything else. Depth, Grounding and the done count were creation
            settings and a number the checks already tell you. */}
        <p className="mt-2 text-[0.8125rem] leading-[1.5] text-fg-3">{goal}</p>
      </SidebarHeader>

      <SidebarContent className="scroll-thin gap-0 overflow-y-auto border-t border-hair px-2 py-2 group-data-[collapsible=icon]:hidden">
        {modules.map((m) => {
          return (
            <SidebarGroup key={m.numeral} className="mb-2 p-0 last:mb-0">
              <SidebarGroupLabel className="label h-auto justify-start px-2 pt-4 pb-2 tracking-[0.06em] text-fg-3">
                <h2>
                  {m.numeral}. {m.title}
                </h2>
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0">
                  {m.lessons.map((l) => {
                    const stamp = stampFor(l.id);
                    const ghost = l.status === "unset";
                    const isOpen = l.id === openId;
                    const isLive = l.id === liveId;

                    return (
                      <SidebarMenuItem key={l.id}>
                        <SidebarMenuButton
                          isActive={isOpen}
                          /* An unset Lesson has nothing to open. It is not a
                             disabled button, it is not a button at all. */
                          render={ghost ? <div /> : undefined}
                          aria-disabled={ghost || undefined}
                          aria-current={isOpen ? "true" : undefined}
                          onClick={ghost ? undefined : () => onOpen(l.id)}
                          className={cn(
                            "row grid h-auto grid-cols-[0.75rem_1.25rem_1fr] items-center gap-x-2 overflow-visible px-2 text-left aria-disabled:opacity-100",
                            isMobile ? "py-3" : "py-1.5",
                            ghost && "hover:bg-transparent",
                          )}
                        >
                          <span className="flex h-4 w-3 items-center justify-center">
                            {isLive ? (
                              <LiveMark handing={handing} />
                            ) : stamp ? (
                              <span className="text-fg-3">
                                <DoneCheck striking={justDoneId === l.id} />
                              </span>
                            ) : ghost ? (
                              <UnsetMark />
                            ) : null}
                          </span>

                          <span
                            className={cn(
                              "tnum text-[0.75rem] tabular-nums",
                              ghost ? "text-fg-dim" : isOpen ? "text-fg-2" : "text-fg-3",
                            )}
                          >
                            {l.n}
                          </span>

                          <span
                            className={cn(
                              "truncate text-[0.8125rem] leading-5",
                              ghost ? "text-fg-3" : isOpen ? "font-medium text-fg" : "text-fg-2",
                            )}
                          >
                            {l.title}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* Sits on the rail's inner edge, over the fixed container. */}
      {resizer}
    </Sidebar>
  );
}
