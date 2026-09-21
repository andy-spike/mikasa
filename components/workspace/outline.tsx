"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
import { useScrollActivity } from "@/hooks/use-scroll-activity";
import { cn } from "@/lib/utils";
import type { ReadingLesson } from "@/lib/course/reading";
import { BarCover } from "./bar-cover";
import { DoneCheck, LiveMark } from "./marks";
import { Hint } from "./hint";

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

/* The Outline: every Lesson in reading order, with the live mark spent on the
   one the work sits on. Its own scroll port, so the bar rides the scroll and
   the lane stays reserved. */
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
  const port = useRef<HTMLDivElement>(null);

  useScrollActivity(port);

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
      {/* The icon rail: a way back out, and the count that fits. */}
      <div className="hidden flex-col items-center gap-1 py-3 group-data-[collapsible=icon]:flex">
        <Button
          variant="icon-raised"
          onClick={onExpand}
          aria-label="Expand the Outline"
          className="p-2"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Hint label={`${doneCount} of ${total} Lessons complete`}>
          <span className="tnum mt-1 text-[0.75rem] text-fg-dim">
            {doneCount}/{total}
          </span>
        </Hint>
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

      {/* The rail is a port like the article and the margin: the rows end at
          the lane (hence no right pad), and the hairline sits on the wrapper,
          outside the scroller, so the cover never paints over it. */}
      <div className="relative flex min-h-0 flex-1 flex-col border-t border-hair group-data-[collapsible=icon]:hidden">
        {/* The end pad lets the last Lessons come up off the viewport floor:
            scrolling to the bottom is a place, not the end of the list. */}
        <SidebarContent
          ref={port}
          className="scroll-thin gap-0 overflow-y-auto pt-2 pb-24 pl-2 [scrollbar-gutter:stable]"
        >
          {modules.map((m) => (
            <SidebarGroup key={m.numeral} className="mb-2 p-0 last:mb-0">
              <SidebarGroupLabel className="h-auto justify-start px-2 pt-4 pb-1.5 text-fg-3">
                <h2 className="grid min-w-0 grid-cols-[1.5rem_1fr] text-[0.6875rem] leading-[1.35] font-semibold tracking-[0.06em] text-fg-3 uppercase">
                  <span className="tnum">{m.numeral}</span>
                  <span>{m.title}</span>
                </h2>
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0">
                  {m.lessons.map((l) => {
                    const lessonStamp = stampFor(l.id);
                    const isOpen = l.id === openId;
                    const isLive = l.id === liveId;

                    return (
                      <SidebarMenuItem key={l.id}>
                        <Hint label={l.title} side="right">
                          <SidebarMenuButton
                            ref={isOpen ? openLessonRef : undefined}
                            isActive={isOpen}
                            aria-current={isOpen ? "page" : undefined}
                            aria-label={`${l.n}. ${l.title}${lessonStamp ? ", complete" : isLive ? ", current Lesson" : ""}`}
                            onClick={() => onOpen(l.id)}
                            className={cn(
                              "row grid h-auto grid-cols-[0.75rem_1.25rem_1fr] items-center gap-x-2 overflow-visible px-2 text-left",
                              isMobile ? "min-h-11 py-2.5" : "min-h-7 py-1",
                            )}
                          >
                            {/* The sidebar primitive sizes a descendant svg to
                                16px; the rail's mark is drawn at 10px. */}
                            <span className="flex h-4 w-3 items-center justify-center [&_svg]:size-2.5!">
                              {isLive ? (
                                <LiveMark handing={handing} />
                              ) : lessonStamp ? (
                                <span className="text-fg-3">
                                  <DoneCheck striking={justDoneId === l.id} />
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                "tnum text-[0.75rem] tabular-nums",
                                isOpen ? "text-fg-2" : "text-fg-3",
                              )}
                            >
                              {l.n}
                            </span>
                            <span
                              className={cn(
                                "truncate text-[0.8125rem] leading-5",
                                isOpen ? "font-medium text-fg" : "text-fg-2",
                              )}
                            >
                              {l.title}
                            </span>
                          </SidebarMenuButton>
                        </Hint>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <BarCover ground="panel" />
      </div>

      {resizer}
    </Sidebar>
  );
}
