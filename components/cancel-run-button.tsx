"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./ui/button";
import type { CancelResult } from "@/lib/actions/courses";

type Props = {
  idleLabel: string;
  /** Optional mark before the idle label, for callers that pair it with a sign. */
  idleIcon?: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  keepLabel?: string;
  onConfirm: () => Promise<CancelResult>;
  onDone: (result: CancelResult) => void;
};

/** Two clicks to discard: arm, then confirm. Stays quiet until armed. */
export function CancelRunButton({
  idleLabel,
  idleIcon,
  confirmLabel,
  pendingLabel,
  keepLabel = "Keep waiting",
  onConfirm,
  onDone,
}: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      onDone(await onConfirm());
    });
  }

  if (!armed) {
    return (
      <Button variant="discard" onClick={() => setArmed(true)}>
        {idleIcon}
        {idleLabel}
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Button variant="discard" onClick={confirm} disabled={pending}>
        {pending ? pendingLabel : confirmLabel}
      </Button>
      <Button variant="quiet" onClick={() => setArmed(false)} disabled={pending}>
        {keepLabel}
      </Button>
    </span>
  );
}
