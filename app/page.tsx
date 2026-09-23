"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingWalk } from "@/components/landing-walk";
import { ReadingProgress } from "@/components/landing-motion";
import "./landing.css";
import { Reveal } from "@/components/reveal";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { authClient } from "@/lib/auth-client";

function StartCourseButton({
  signingIn,
  onSignIn,
  className,
  children,
}: {
  signingIn: boolean;
  onSignIn: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="hero"
      onClick={onSignIn}
      disabled={signingIn}
      aria-busy={signingIn || undefined}
      className={className ?? "min-h-11 active:translate-y-px"}
    >
      {children}
    </Button>
  );
}

export default function Landing() {
  const [selectedSubject, setSelectedSubject] = useState(0);
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

  return (
    <div id="top" className="landing-page min-h-full bg-canvas">
      <div aria-hidden="true" className="landing-texture pointer-events-none fixed inset-0 z-0" />
      <ReadingProgress />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        Skip to content
      </a>
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
            <a href="#walk" className="hidden py-2 transition-colors hover:text-fg sm:block">
              Walk
            </a>
            <a href="#start" className="hidden py-2 transition-colors hover:text-fg sm:block">
              Start
            </a>
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

      <main
        id="main"
        className="relative z-[1] mx-auto max-w-[77rem] px-5 pt-[3.5rem] sm:px-8 lg:px-10"
      >
        <section
          className="grid min-h-[calc(100dvh-3.5rem)] place-content-center pt-[4.5rem] pb-24 text-center max-sm:pt-12 max-sm:pb-[4.5rem]"
          aria-labelledby="intro"
        >
          <div className="mx-auto max-w-[58rem]">
            <div>
              <h1
                id="intro"
                className="animate-[hero-typeset_800ms_var(--ease)_both] text-[clamp(3.25rem,7.1vw,6rem)] leading-[1.04] font-semibold tracking-[-0.04em] max-sm:text-[clamp(2.75rem,11.4vw,4.5rem)]"
              >
                Create a course
                <br />
                about{" "}
                <span className="relative whitespace-nowrap">
                  anything
                  <svg
                    viewBox="0 0 440 18"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="absolute bottom-[-0.06em] left-0 h-[0.18em] w-full fill-none stroke-live stroke-2"
                  >
                    <path
                      pathLength="1"
                      d="M3 12 Q180 1 437 8 M35 16 Q235 7 404 12"
                      className="animate-[hero-underline_850ms_var(--ease)_250ms_both] [stroke-dasharray:1]"
                    />
                  </svg>
                </span>
                .
              </h1>
              <p
                style={{ animationDelay: "90ms" }}
                className="mk-rise mx-auto mt-6 max-w-[36rem] text-base leading-[1.72] text-fg-2"
              >
                The thing you have always wanted to understand. The skill you finally want to learn.
                Turn it into a complete AI-generated course, built around your goal and what you
                already know.
              </p>
              <div
                style={{ animationDelay: "180ms" }}
                className="mk-rise mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
              >
                <StartCourseButton signingIn={signingIn} onSignIn={signIn}>
                  <GoogleMark />
                  {signingIn ? "Connecting to Google…" : "Create your course"}
                </StartCourseButton>
                <a
                  href="#walk"
                  className="group flex min-h-11 items-center gap-2 rounded-sm text-[0.8125rem] text-fg-2 transition-colors hover:text-fg"
                >
                  Walk through it{" "}
                  <ArrowDown
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:translate-y-0.5"
                  />
                </a>
              </div>
              <p
                style={{ animationDelay: "260ms" }}
                className="mk-rise mt-3 text-xs leading-normal text-fg-3"
              >
                Continue with Google. Your Courses are private and self-paced.
              </p>
              {failed && (
                <p role="alert" className="mt-3 text-[0.8125rem] text-fg-2">
                  Sign in did not complete. Try again.
                </p>
              )}
            </div>
          </div>
        </section>

        <LandingWalk selected={selectedSubject} onSelect={setSelectedSubject} />

        <section
          id="start"
          className="scroll-mt-24 border-t border-hair py-16 sm:py-20"
          aria-labelledby="start-title"
        >
          <Reveal>
            <h2
              id="start-title"
              className="max-w-[36rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]"
            >
              Start with something
              <br className="hidden sm:block" /> you want to do.
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <p className="mt-5 max-w-[36rem] text-base leading-[1.72] text-fg-2">
              Bring a Topic and a Goal. Shape the Outline. Then work through a Course made for you.
            </p>
            <StartCourseButton signingIn={signingIn} onSignIn={signIn} className="mt-7 min-h-11">
              <GoogleMark />
              {signingIn ? "Connecting to Google…" : "Create your course"}
            </StartCourseButton>
            {failed && (
              <p role="alert" className="mt-3 text-[0.8125rem] text-fg-2">
                Sign in did not complete. Try again.
              </p>
            )}
          </Reveal>
        </section>
      </main>

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
    </div>
  );
}
