"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/google-mark";
import { ThemeToggle } from "@/components/workspace/theme-toggle";

/**
 * The door, not a pitch.
 *
 * There is one provider and one action, so there is one control. This is
 * also the sign-in page — /sign-in and /sign-up both land here rather than
 * repeating the same button under a different heading.
 */
export default function Landing() {
  const router = useRouter();

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
          <Button
            variant="hero"
            onClick={() => router.push("/courses")}
            className="mt-6 w-full"
          >
            <GoogleMark />
            Continue with Google
          </Button>
        </div>
      </main>

      <footer className="flex shrink-0 items-center px-5 py-4 sm:px-8">
        <span className="text-[0.75rem] text-fg-dim">Mikasa</span>
      </footer>
    </div>
  );
}
