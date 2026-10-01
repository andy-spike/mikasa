import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-[40rem] flex-col justify-center px-5 py-16 sm:px-8">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em]">
        Page not found
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-[1.66] text-fg-2">
        This page is unavailable. A Course may have been removed or may belong to another Learner.
      </p>
      <Button render={<Link href="/courses" />} className="mt-6 self-start">
        Back to Courses
      </Button>
    </main>
  );
}
