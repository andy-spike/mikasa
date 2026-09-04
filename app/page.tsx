"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { authClient } from "@/lib/auth-client";

export default function Landing() {
  const [signingIn, setSigningIn] = useState(false);
  const [failed, setFailed] = useState(false);

  function signIn() {
    if (signingIn) return;
    setSigningIn(true);
    setFailed(false);
    authClient.signIn
      .social({ provider: "google", callbackURL: "/courses" })
      .then(
        () => {},
        () => setFailed(true),
      )
      .finally(() => setSigningIn(false));
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-2.5 px-5 py-3 sm:px-8">
        <span className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
          Mikasa
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-5">
        <div className="-mt-16 w-full max-w-[22rem]">
          <p className="text-[0.9375rem] leading-[1.66] text-fg-2">
            Mikasa generates structured courses from a Topic and a Goal.
          </p>
          <Button variant="hero" onClick={signIn} disabled={signingIn} className="mt-6 w-full">
            <GoogleMark />
            Continue with Google
          </Button>
          {failed ? (
            <p role="alert" className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
              Sign in did not complete. Try again.
            </p>
          ) : null}
        </div>
      </main>

      <footer className="flex shrink-0 items-center px-5 py-4 sm:px-8">
        <span className="text-[0.75rem] text-fg-dim">Mikasa</span>
      </footer>
    </div>
  );
}
