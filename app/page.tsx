"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingCourseDemo } from "@/components/landing-course-demo";
import { QualityItem, QualityList, ReadingProgress } from "@/components/landing-motion";
import "./landing.css";
import { Reveal } from "@/components/reveal";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { authClient } from "@/lib/auth-client";

const steps = [
  {
    title: "Start with your Goal",
    body: "Name what you want to do. Add your Background, pick a Depth, and set the Course Language.",
  },
  {
    title: "Make the Outline yours",
    body: "Review the Modules and Lessons before anything is written. Edit the Outline yourself or ask the Tailor to propose changes. Nothing starts until you approve.",
  },
  {
    title: "Learn through a complete Course",
    body: "Approve the Outline. Mikasa writes the Course as one unit and reviews it, with examples and Exercises that build toward your Goal.",
  },
];

const capabilities = [
  {
    title: "Lessons that build on each other",
    body: "Each Lesson has an explanation, a worked example, recall and self-explanation prompts, and one Exercise. Mark it done to complete the Lesson.",
  },
  {
    title: "A Tutor for your questions",
    body: "Ask about the open Lesson or an earlier idea. The Tutor reads your Course and can search the web. It never changes your Course.",
  },
  {
    title: "A Tailor for changes",
    body: "Ask for another example or a new sequence. The Tailor proposes a Change plan you accept or discard. Your Course stays readable while a revision is prepared.",
  },
  {
    title: "Sources when you need them",
    body: "Leave Grounding on to build from current Sources. Lessons and Tutor answers link back to them.",
  },
];

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
        <div className="mx-auto flex max-w-[65rem] items-center gap-4 px-5 py-2.5 sm:px-8 lg:px-10">
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
            <a
              href="#how-it-works"
              className="hidden py-2 transition-colors hover:text-fg sm:block"
            >
              How it works
            </a>
            <a
              href="#capabilities"
              className="hidden py-2 transition-colors hover:text-fg sm:block"
            >
              Capabilities
            </a>
            <Button variant="quiet" onClick={signIn} disabled={signingIn} className="min-h-9 gap-2">
              <GoogleMark className="block h-4 w-4" />
              Sign in
            </Button>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="relative z-[1] mx-auto max-w-[77rem] px-5 pt-[3.5rem] sm:px-8 lg:px-10">
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
              <p className="mx-auto mt-6 max-w-[36rem] text-base leading-[1.72] text-fg-2">
                The thing you have always wanted to understand. The skill you finally want to learn.
                Turn it into a complete AI-generated course, built around your goal and what you
                already know.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <StartCourseButton signingIn={signingIn} onSignIn={signIn}>
                  <GoogleMark />
                  {signingIn ? "Connecting to Google…" : "Create your course"}
                </StartCourseButton>
                <a
                  href="#example"
                  className="group flex min-h-11 items-center gap-2 rounded-sm text-[0.8125rem] text-fg-2 transition-colors hover:text-fg"
                >
                  Explore the possibilities{" "}
                  <ArrowDown
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:translate-y-0.5"
                  />
                </a>
              </div>
              <p className="mt-3 text-xs leading-normal text-fg-3">
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

        <LandingCourseDemo selected={selectedSubject} onSelect={setSelectedSubject} />

        <section
          id="quality"
          className="grid scroll-mt-[5.5rem] grid-cols-[1fr_1.2fr] gap-20 py-28 max-[1000px]:gap-10 max-sm:grid-cols-1 max-sm:py-16"
          aria-labelledby="quality-title"
        >
          <div>
            <h2
              id="quality-title"
              className="text-[clamp(2rem,3.5vw,3rem)] leading-[1.12] font-medium tracking-[-0.03em] text-balance"
            >
              Anything you want to learn.
              <br />
              <span className="text-fg-3">A high bar for how.</span>
            </h2>
            <p className="mt-6 max-w-[25rem] text-base leading-[1.72] text-fg-2">
              Good teaching takes more than a list of topics. Mikasa plans the whole course around
              what you want to be able to do.
            </p>
          </div>
          <QualityList>
            <QualityItem>
              <dt className="text-lg font-medium">Connected by design</dt>
              <dd className="mt-2.5 text-[0.9375rem] leading-[1.72] text-fg-2">
                Each lesson builds on the lessons before it, with shared vocabulary and examples
                that lead toward your final exercise.
              </dd>
            </QualityItem>
            <QualityItem>
              <dt className="text-lg font-medium">Understanding you can put to work</dt>
              <dd className="mt-2.5 text-[0.9375rem] leading-[1.72] text-fg-2">
                Worked examples show you how. Recall and self-explanation prompts help you think it
                through. Every lesson ends with an exercise.
              </dd>
            </QualityItem>
            <QualityItem>
              <dt className="text-lg font-medium">Reviewed before you begin</dt>
              <dd className="mt-2.5 text-[0.9375rem] leading-[1.72] text-fg-2">
                Mikasa checks the complete course for structure and critical factual accuracy, then
                makes targeted corrections before publication.
              </dd>
            </QualityItem>
            <QualityItem>
              <dt className="text-lg font-medium">Sources you can follow</dt>
              <dd className="mt-2.5 text-[0.9375rem] leading-[1.72] text-fg-2">
                Keep Grounding on to build with current sources and follow the links in your lessons
                when you want to go deeper.
              </dd>
            </QualityItem>
          </QualityList>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="steps-title"
          className="scroll-mt-24 border-t border-hair pt-16 pb-16 sm:pb-24"
        >
          <Reveal>
            <h2
              id="steps-title"
              className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
            >
              Your Goal sets the direction.
              <br />
              You approve the Course.
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <ol className="mt-8">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[2rem_1fr] gap-3 border-t border-hair py-6 sm:gap-6"
                >
                  <span className="tnum pt-1 font-mono text-[0.8125rem] text-fg-3">
                    0{index + 1}
                  </span>
                  <div>
                    <h3 className="text-base leading-[1.72] font-semibold tracking-[-0.011em]">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-[36rem] text-[0.9375rem] leading-[1.66] text-fg-2">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={140}>
            <p className="max-w-[36rem] text-[0.8125rem] leading-[1.55] text-fg-3">
              Course generation can take several minutes. You can follow its progress or return
              later.
            </p>
          </Reveal>
        </section>

        <section
          id="capabilities"
          aria-labelledby="capabilities-title"
          className="scroll-mt-24 border-t border-hair pt-16 pb-16 sm:pb-24"
        >
          <Reveal>
            <h2
              id="capabilities-title"
              className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
            >
              Keep learning.
              <br />
              Ask for help. Make changes.
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <dl className="mt-8 grid gap-x-16 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <div key={capability.title} className="border-t border-hair py-6">
                  <dt className="text-base leading-[1.72] font-semibold tracking-[-0.011em]">
                    {capability.title}
                  </dt>
                  <dd className="mt-2 max-w-[36rem] text-[0.9375rem] leading-[1.66] text-fg-2">
                    {capability.body}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section aria-labelledby="details-title" className="max-w-[44rem] pb-16 sm:pb-24">
          <Reveal>
            <h2
              id="details-title"
              className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
            >
              Before you start
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <dl className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <dt className="text-base font-semibold tracking-[-0.011em]">
                  Choose how far to go
                </dt>
                <dd className="mt-2 text-[0.9375rem] leading-[1.66] text-fg-2">
                  Set the Depth to reach your Goal, gain working knowledge, or work toward mastery.
                </dd>
              </div>
              <div>
                <dt className="text-base font-semibold tracking-[-0.011em]">
                  Choose your Course Language
                </dt>
                <dd className="mt-2 text-[0.9375rem] leading-[1.66] text-fg-2">
                  English, Spanish, French, German, or Portuguese. Everything in the Course uses it,
                  and it stays fixed.
                </dd>
              </div>
            </dl>
          </Reveal>
        </section>

        <section className="border-t border-hair py-16 sm:py-20" aria-labelledby="start-title">
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
