"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full max-w-[40rem] flex-col justify-center px-5 py-16 sm:px-8">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em]">
        Could not load this page
      </h1>
      <p role="alert" className="mt-4 text-[0.9375rem] leading-[1.66] text-fg-2">
        Try again. If the problem continues, return to Courses and open the Course again.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={retry}>Try again</Button>
        <Button variant="quiet" render={<Link href="/courses" />}>
          Back to Courses
        </Button>
      </div>
    </main>
  );
}
