"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeskScene } from "@/components/desk-scene";
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

const exampleOutline = [
  {
    title: "Get to know your camera",
    lessons: ["Aperture and depth of field", "Shutter speed and ISO"],
  },
  {
    title: "Find and shape natural light",
    lessons: ["Window light and open shade", "Position your subject"],
  },
  {
    title: "Make a portrait",
    lessons: ["Compose and guide a portrait", "Shoot and review a portrait series"],
  },
];

/* The landing's wayfinding mark: the same live triangle the Outline rail
   uses, one per section below the hero. */
function SectionMark() {
  return (
    <span aria-hidden className="mt-[0.4em] flex shrink-0 text-live">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d="M3 1.5 9.5 6 3 10.5 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

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
      className={
        className ?? "min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2"
      }
    >
      {children}
    </Button>
  );
}

export default function Landing() {
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
    <div className="min-h-full bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-[65rem] items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
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
          <a href="#how-it-works" className="hidden py-3 transition-colors hover:text-fg sm:block">
            How it works
          </a>
          <a href="#capabilities" className="hidden py-3 transition-colors hover:text-fg sm:block">
            Capabilities
          </a>
          <Button
            variant="quiet"
            onClick={signIn}
            disabled={signingIn}
            className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Sign in
          </Button>
          <ThemeToggle />
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-[65rem] px-5 sm:px-8 lg:px-10">
        <section className="landing-hero pb-16 pt-14 sm:pb-24 sm:pt-24" aria-labelledby="intro">
          <div aria-hidden="true" className="landing-glow" />
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-12">
            <div>
              <h1
                id="intro"
                style={{ animationDelay: "0ms" }}
                className="mk-rise max-w-[36rem] text-[2.75rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-[3.5rem] lg:text-[4rem]"
              >
                What do you want
                <br className="hidden sm:block" /> to be able to do?
              </h1>
              <p
                style={{ animationDelay: "90ms" }}
                className="mk-rise mt-6 max-w-[36rem] text-base leading-[1.72] text-fg-2"
              >
                Mikasa uses AI to turn a Goal into connected Lessons and practical Exercises
                around what you already know.
              </p>
              <div
                style={{ animationDelay: "180ms" }}
                className="mk-rise mt-7 flex flex-wrap items-center gap-x-6 gap-y-3"
              >
                <StartCourseButton signingIn={signingIn} onSignIn={signIn}>
                  <GoogleMark />
                  {signingIn ? "Connecting to Google…" : "Start a Course"}
                </StartCourseButton>
                <a
                  href="#example"
                  className="group flex min-h-11 items-center gap-2 rounded-sm text-[0.8125rem] text-fg-2 transition-colors hover:text-fg"
                >
                  See an example{" "}
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
            <Reveal className="mt-10 md:mt-0 md:max-w-none" delay={220}>
              <DeskScene className="max-w-[19rem] md:max-w-none" />
            </Reveal>
          </div>
        </section>

        <section id="example" aria-labelledby="example-title" className="scroll-mt-8 bg-panel">
          <Reveal>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair px-5 py-4 sm:px-7">
              <h2 id="example-title" className="flex items-center gap-2.5 text-[0.8125rem] font-medium">
                <span aria-hidden className="flex text-live">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 1.5 9.5 6 3 10.5 Z" fill="currentColor" />
                  </svg>
                </span>
                A Goal becomes an Outline
              </h2>
              <span className="text-xs text-fg-3">Illustrative Course</span>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="grid md:grid-cols-[1fr_1.2fr]">
              <dl className="space-y-6 p-5 sm:p-7">
                <div>
                  <dt className="label text-fg-3">Topic</dt>
                  <dd className="mt-2 text-[0.9375rem] text-fg">Photography</dd>
                </div>
                <div>
                  <dt className="label text-fg-3">Goal</dt>
                  <dd className="mt-2 max-w-[22rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance">
                    Take portraits using natural light.
                  </dd>
                </div>
                <div>
                  <dt className="label text-fg-3">Background</dt>
                  <dd className="mt-2 text-[0.8125rem] leading-[1.55] text-fg-2">
                    I use my camera on automatic. I want to understand light and choose my own
                    settings.
                  </dd>
                </div>
                <div>
                  <dt className="label text-fg-3">Depth</dt>
                  <dd className="mt-2 text-[0.8125rem] text-fg-2">Reach the Goal</dd>
                </div>
              </dl>
              <div className="border-t border-hair bg-raised p-5 sm:p-7 md:border-t-0 md:border-l">
                <p className="mb-5 text-xs text-fg-3">Example Outline before approval</p>
                <ol className="space-y-5">
                  {exampleOutline.map((module, index) => (
                    <li key={module.title}>
                      <h3 className="text-[0.8125rem] font-medium">
                        <span className="tnum mr-3 font-mono text-fg-3">0{index + 1}</span>
                        {module.title}
                      </h3>
                      <ul className="ml-7 mt-2 space-y-1.5 text-[0.8125rem] leading-[1.55] text-fg-2">
                        {module.lessons.map((lesson) => (
                          <li key={lesson}>{lesson}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 border-t border-rule pt-4 text-xs leading-normal text-fg-3">
                  You can change the Outline before any Lesson is written.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="steps-title"
          className="max-w-[44rem] scroll-mt-8 py-16 sm:py-24"
        >
          <Reveal>
            <div className="flex items-start gap-3">
              <SectionMark />
              <h2
                id="steps-title"
                className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
              >
                Your Goal sets the direction.
                <br />
                You approve the Course.
              </h2>
            </div>
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
          className="max-w-[44rem] scroll-mt-8 pb-16 sm:pb-24"
        >
          <Reveal>
            <div className="flex items-start gap-3">
              <SectionMark />
              <h2
                id="capabilities-title"
                className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
              >
                Keep learning.
                <br />
                Ask for help. Make changes.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <dl className="mt-8">
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
            <div className="flex items-start gap-3">
              <SectionMark />
              <h2
                id="details-title"
                className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
              >
                Before you start
              </h2>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <dl className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <dt className="text-base font-semibold tracking-[-0.011em]">Choose how far to go</dt>
                <dd className="mt-2 text-[0.9375rem] leading-[1.66] text-fg-2">
                  Set the Depth to reach your Goal, gain working knowledge, or work toward mastery.
                </dd>
              </div>
              <div>
                <dt className="text-base font-semibold tracking-[-0.011em]">
                  Choose your Course Language
                </dt>
                <dd className="mt-2 text-[0.9375rem] leading-[1.66] text-fg-2">
                  English, Spanish, French, German, or Portuguese. Everything in the Course
                  uses it, and it stays fixed.
                </dd>
              </div>
            </dl>
          </Reveal>
        </section>

        <section className="border-t border-hair py-16 sm:py-20" aria-labelledby="start-title">
          <Reveal>
            <div className="flex items-start gap-3">
              <SectionMark />
              <h2
                id="start-title"
                className="max-w-[36rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]"
              >
                Start with something
                <br className="hidden sm:block" /> you want to do.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <p className="mt-5 max-w-[36rem] text-base leading-[1.72] text-fg-2">
              Bring a Topic and a Goal. Shape the Outline. Then work through a Course made for you.
            </p>
            <StartCourseButton
              signingIn={signingIn}
              onSignIn={signIn}
              className="mt-7 min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {signingIn ? "Connecting to Google…" : "Start a Course"}
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </StartCourseButton>
            {failed && (
              <p role="alert" className="mt-3 text-[0.8125rem] text-fg-2">
                Sign in did not complete. Try again.
              </p>
            )}
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[65rem] flex-wrap items-center justify-between gap-4 border-t border-hair px-5 py-6 text-xs text-fg-3 sm:px-8 lg:px-10">
        <span>Mikasa</span>
        <a
          href="#main"
          className="inline-flex min-h-11 items-center rounded-sm py-2 transition-colors hover:text-fg"
        >
          Back to top
        </a>
      </footer>
    </div>
  );
}
