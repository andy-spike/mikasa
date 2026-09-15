"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/workspace/hint";

/* Copying mirrors the browser's own permission model: the async Clipboard API
   where the page is a secure context, and a hidden selection otherwise, so a
   block still copies from a plain-HTTP LAN preview. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the selection path. */
  }

  const focused = document.activeElement as HTMLElement | null;
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();
  const copied = document.execCommand("copy");
  scratch.remove();
  focused?.focus();
  return copied;
}

/* A chrome control on a code block, not content: the icon button carries the
   language strip's third ink and steps to raised and full ink on hover. The
   confirmation is a luminance step and a spoken line, never a second hue. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Hint label={copied ? "Copied" : "Copy code"}>
      <Button
        type="button"
        variant="icon-raised"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="p-1"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-fg" strokeWidth={1.75} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied to clipboard" : ""}
        </span>
      </Button>
    </Hint>
  );
}
