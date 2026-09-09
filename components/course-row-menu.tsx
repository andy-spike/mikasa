"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteCourseAction } from "@/lib/actions/courses";

/**
 * The row menu on the Courses list. Delete opens a centered confirm
 * dialog; the Course goes on the second click.
 */
export function CourseRowMenu({ courseId, topic }: { courseId: string; topic: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="icon"
              size="icon"
              aria-label={`Course options: ${topic}`}
              disabled={pending}
            >
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={2}>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 strokeWidth={1.75} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (pending) return;
          setConfirming(open);
        }}
      >
        <DialogContent showCloseButton={false} className="gap-5 sm:max-w-[26rem]">
          <DialogHeader>
            <DialogTitle>Delete this Course?</DialogTitle>
            <DialogDescription>
              Deleting &ldquo;{topic}&rdquo; removes its Sources, Outline, Lessons and progress.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="discard"
              onClick={() => {
                startTransition(async () => {
                  await deleteCourseAction(courseId);
                  setConfirming(false);
                });
              }}
              disabled={pending}
              className="px-4 py-2.5"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
