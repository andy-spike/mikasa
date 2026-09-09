"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { authClient } from "@/lib/auth-client";

const steps = [
  {
    title: "Start with your Goal",
    body: "Tell Mikasa what you want to learn and what you want to do with it. Add your Background, choose the Depth, and set your Course Language.",
  },
  {
    title: "Make the Outline yours",
    body: "Review the Modules and Lessons before generation starts. Edit the Outline yourself or ask the Tailor to propose changes. You decide when it is ready.",
  },
  {
    title: "Learn through a complete Course",
    body: "Approve the Outline. Mikasa writes and reviews the Course as a whole, with connected examples and Exercises that build toward your Goal.",
  },
];

const capabilities = [
  {
    title: "Lessons that build on each other",
    body: "Each Lesson includes an explanation, a worked example, recall and self-explanation prompts, and one Exercise. Mark the Exercise done when you finish.",
  },
  {
    title: "A Tutor for your questions",
    body: "Ask about the Lesson you have open or revisit an earlier idea. The Tutor uses your Course and can search the web for Sources. It answers questions without changing your Course.",
  },
  {
    title: "A Tailor for changes",
    body: "Need another example or a different sequence? The Tailor proposes a Change plan. Review what will change, then accept or discard it. Your current Course stays readable while an approved Course revision is prepared.",
  },
  {
    title: "Sources when you need them",
    body: "Keep Grounding on to use current Sources when creating your Course. Lessons and Tutor answers link to relevant Sources so you can read further.",
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
      className={className ?? "focus-visible:outline-2 focus-visible:outline-offset-2"}
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
          <a href="#how-it-works" className="hidden py-3 hover:text-fg sm:block">
            How it works
          </a>
          <a href="#capabilities" className="hidden py-3 hover:text-fg sm:block">
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
        <section className="pb-14 pt-16 sm:pb-20 sm:pt-24" aria-labelledby="intro">
          <h1
            id="intro"
            className="max-w-[36rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]"
          >
            What do you want
            <br className="hidden sm:block" /> to be able to do?
          </h1>
          <p className="mt-6 max-w-[36rem] text-base leading-[1.72] text-fg-2">
            Turn that Goal into a Course. Mikasa uses AI to create connected Lessons and practical
            Exercises around what you want to learn and what you already know.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <StartCourseButton signingIn={signingIn} onSignIn={signIn}>
              <GoogleMark />
              {signingIn ? "Connecting to Google…" : "Start a Course"}
            </StartCourseButton>
            <a
              href="#example"
              className="flex min-h-11 items-center gap-2 text-[0.8125rem] text-fg-2 hover:text-fg"
            >
              See an example <ArrowDown size={14} strokeWidth={1.75} aria-hidden="true" />
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
        </section>

        <section id="example" aria-labelledby="example-title" className="scroll-mt-8 bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair px-5 py-4 sm:px-7">
            <h2 id="example-title" className="text-[0.8125rem] font-medium">
              A Goal becomes an Outline
            </h2>
            <span className="text-xs text-fg-3">Illustrative Course</span>
          </div>
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
            <div className="bg-raised p-5 sm:p-7">
              <p className="mb-5 text-xs text-fg-3">Example Outline before approval</p>
              <ol className="space-y-5">
                {exampleOutline.map((module, index) => (
                  <li key={module.title}>
                    <h3 className="text-[0.8125rem] font-medium">
                      <span className="mr-3 font-mono text-fg-3">0{index + 1}</span>
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
        </section>

        <section
          id="how-it-works"
          aria-labelledby="steps-title"
          className="max-w-[44rem] scroll-mt-8 py-16 sm:py-24"
        >
          <h2
            id="steps-title"
            className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
          >
            Your Goal sets the direction.
            <br />
            You approve the Course.
          </h2>
          <ol className="mt-8">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[2rem_1fr] gap-3 border-t border-hair py-6 sm:gap-6"
              >
                <span className="pt-1 font-mono text-[0.8125rem] text-fg-3">0{index + 1}</span>
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
          <p className="max-w-[36rem] text-[0.8125rem] leading-[1.55] text-fg-3">
            Course generation can take several minutes. You can follow its progress or return later.
          </p>
        </section>

        <section
          id="capabilities"
          aria-labelledby="capabilities-title"
          className="max-w-[44rem] scroll-mt-8 pb-16 sm:pb-24"
        >
          <h2
            id="capabilities-title"
            className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance sm:text-[2.25rem]"
          >
            Keep learning.
            <br />
            Ask for help. Make changes.
          </h2>
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
        </section>

        <section aria-labelledby="details-title" className="max-w-[44rem] pb-16 sm:pb-24">
          <h2
            id="details-title"
            className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] sm:text-[2.25rem]"
          >
            Before you start
          </h2>
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
                English, Spanish, French, German, or Portuguese. The Course and its conversations
                use that language. It stays fixed after creation.
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-t border-hair py-16 sm:py-20" aria-labelledby="start-title">
          <h2
            id="start-title"
            className="max-w-[36rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]"
          >
            Start with something
            <br className="hidden sm:block" /> you want to do.
          </h2>
          <p className="mt-5 max-w-[36rem] text-base leading-[1.72] text-fg-2">
            Bring a Topic and a Goal. Shape the Outline. Then work through a Course made for you.
          </p>
          <StartCourseButton
            signingIn={signingIn}
            onSignIn={signIn}
            className="mt-7 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {signingIn ? "Connecting to Google…" : "Start a Course"}
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </StartCourseButton>
          {failed && (
            <p className="mt-3 text-[0.8125rem] text-fg-2">Sign in did not complete. Try again.</p>
          )}
        </section>
      </main>

      <footer className="mx-auto flex max-w-[65rem] flex-wrap items-center justify-between gap-4 border-t border-hair px-5 py-6 text-xs text-fg-3 sm:px-8 lg:px-10">
        <span>Mikasa</span>
        <a href="#main" className="py-2 hover:text-fg">
          Back to top
        </a>
      </footer>
    </div>
  );
}
