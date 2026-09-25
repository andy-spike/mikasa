"use client";

import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingStory } from "@/components/landing-story";
import "./landing.css";
import { Reveal } from "@/components/reveal";
import { GoogleMark } from "@/components/google-mark";
import { MarketingFooter, MarketingHeader, useGoogleSignIn } from "@/components/marketing-chrome";

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
  const { signingIn, failed, signIn } = useGoogleSignIn();

  return (
    <div id="top" className="landing-page relative min-h-full bg-canvas">
      <div aria-hidden="true" className="landing-paper" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        Skip to content
      </a>
      <MarketingHeader />

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
                className="mk-rise mx-auto mt-6 max-w-[34rem] text-base leading-[1.72] text-balance text-fg-2"
              >
                Tell Mikasa what you want to learn. You shape the Outline, then it writes the whole
                Course around your Goal.
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
                  href="#how"
                  className="group flex min-h-11 items-center gap-2 rounded-sm text-[0.8125rem] text-fg-2 transition-colors hover:text-fg"
                >
                  How it works{" "}
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

        <LandingStory />

        <section
          id="start"
          className="mx-auto max-w-[64rem] py-28 sm:py-40"
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
            <p className="mt-5 max-w-[36rem] text-base leading-[1.72] text-pretty text-fg-2">
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

      <MarketingFooter />
    </div>
  );
}
