"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { authClient } from "@/lib/auth-client";

/* The chrome the landing and the pricing page share: the fixed bar, the
   footer, and the Google sign-in they both start. */
export function useGoogleSignIn() {
  const [signingIn, setSigningIn] = useState(false);
  const [failed, setFailed] = useState(false);

  function signIn() {
    if (signingIn) return;
    setSigningIn(true);
    setFailed(false);
    authClient.signIn
      .social({ provider: "google", callbackURL: "/courses" })
      .catch(() => setFailed(true))
      .finally(() => setSigningIn(false));
  }

  return { signingIn, failed, signIn };
}

export function MarketingHeader() {
  const { signingIn, signIn } = useGoogleSignIn();

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-hair bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex max-w-[77rem] items-center gap-4 px-5 py-2.5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Mikasa home"
          className="text-[0.9375rem] font-semibold tracking-[-0.011em]"
        >
          Mikasa
        </Link>
        <nav
          aria-label="Main navigation"
          className="ml-auto flex items-center gap-5 text-[0.8125rem] text-fg-3"
        >
          <Link
            href="/pricing"
            className="inline-flex min-h-9 items-center transition-colors hover:text-fg"
          >
            Pricing
          </Link>
          <ThemeToggle />
          <Button
            variant="primary"
            onClick={signIn}
            disabled={signingIn}
            className="min-h-9 gap-2 px-4 py-1"
          >
            <GoogleMark className="block h-4 w-4" />
            Sign in
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative z-[1] mx-auto flex max-w-[77rem] flex-wrap items-center justify-between gap-4 border-t border-hair px-5 py-6 text-xs text-fg-3 sm:px-8 lg:px-10">
      <span>Mikasa</span>
      <span>© 2026 Mikasa · Developed by Andrés Sanabria</span>
      <a
        href="#top"
        className="inline-flex min-h-11 items-center rounded-sm py-2 transition-colors hover:text-fg"
      >
        Back to top
      </a>
    </footer>
  );
}
