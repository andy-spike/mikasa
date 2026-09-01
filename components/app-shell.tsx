import Link from "next/link";
import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./workspace/theme-toggle";
import { SignOutButton } from "./sign-out-button";

/**
 * The chrome every screen outside the workspace wears.
 *
 * The workspace has no header — its rail is the navigation — so this is not
 * a wrapper around it. It is the same system at a smaller scale: canvas
 * ground, one hairline dividing the chrome from the content, nothing boxed.
 */
export function AppShell({
  section,
  actions,
  children,
}: {
  /** Where you are, shown after the wordmark. */
  section?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-hair px-5 py-3 sm:px-8">
        <Link
          href="/courses"
          className="rounded-sm text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg"
        >
          Mikasa
        </Link>
        {section ? (
          <>
            <span aria-hidden className="text-fg-dim">
              /
            </span>
            <span className="truncate text-[0.8125rem] text-fg-2">{section}</span>
          </>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
          <ThemeToggle />
          <Button
            variant="icon"
            render={<Link href="/settings" />}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" strokeWidth={1.75} />
          </Button>
          <SignOutButton />
        </div>
      </header>

      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
