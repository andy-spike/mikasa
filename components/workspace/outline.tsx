"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  topic: string;
  goal: string;
  modules: ModuleView[];
  openId: string;
  liveId: string | null;
  handing: boolean;
  justDoneId: string | null;
  stampFor: (id: string) => string | undefined;
  onOpen: (id: string) => void;
  onCollapse: () => void;
  onExpand: () => void;
  total: number;
  doneCount: number;
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
  const { isMobile } = useSidebar();
  const openLessonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openLessonRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  return (
    <Sidebar
      side="left"
      collapsible="icon"
      reserveSpace={false}
      aria-label="Outline"
      className="border-hair duration-160 ease-expo"
    >
      <div className="hidden flex-col items-center gap-1 py-3 group-data-[collapsible=icon]:flex">
        <Button
          variant="icon-raised"
          onClick={onExpand}
          aria-label="Expand the Outline"
          className="p-2"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <span
          className="tnum mt-1 text-[0.75rem] text-fg-dim"
          title={`${doneCount} of ${total} Lessons complete`}
        >
          {doneCount}/{total}
        </span>
      </div>

      <SidebarHeader className="gap-0 px-4 pt-2 pb-3 group-data-[collapsible=icon]:hidden">
        <div className="flex h-9 items-center justify-between gap-3">
          <Link
            href="/courses"
            className="-ml-2 flex h-9 items-center gap-1 rounded-sm px-2 text-[0.75rem] text-fg-dim transition-colors hover:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live"
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={1.75} />
            Courses
          </Link>
          <Button
            variant="icon"
            onClick={onCollapse}
            aria-label={isMobile ? "Close the Outline" : "Collapse the Outline"}
            className="-mr-2 h-9 w-9 p-2"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>

        <h1 className="mt-1 text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
          {topic}
        </h1>
        <p className="mt-2 text-[0.8125rem] leading-[1.5] text-fg-3">{goal}</p>
      </SidebarHeader>

      <SidebarContent className="scroll-thin gap-0 overflow-y-auto border-t border-hair px-2 py-2 group-data-[collapsible=icon]:hidden">
        {modules.map((m) => {
          return (
            <SidebarGroup key={m.numeral} className="mb-2 p-0 last:mb-0">
              <SidebarGroupLabel className="h-auto justify-start px-2 pt-4 pb-1.5 text-fg-3">
                <h2 className="grid min-w-0 grid-cols-[1.5rem_1fr] text-[0.6875rem] leading-[1.35] font-semibold tracking-[0.06em] uppercase">
                  <span className="tnum">{m.numeral}</span>
                  <span>{m.title}</span>
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
                          ref={isOpen ? openLessonRef : undefined}
                          isActive={isOpen}
                          render={ghost ? <div /> : undefined}
                          aria-disabled={ghost || undefined}
                          aria-current={isOpen ? "page" : undefined}
                          aria-label={`${l.n}. ${l.title}${stamp ? ", complete" : isLive ? ", current Lesson" : ""}`}
                          title={l.title}
                          onClick={ghost ? undefined : () => onOpen(l.id)}
                          className={cn(
                            "row grid h-auto grid-cols-[0.75rem_1.25rem_1fr] items-center gap-x-2 overflow-visible px-2 text-left aria-disabled:opacity-100",
                            isMobile ? "min-h-11 py-2.5" : "min-h-7 py-1",
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

      {resizer}
    </Sidebar>
  );
}
