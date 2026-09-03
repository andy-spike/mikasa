"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { readTheme, serverTheme, setTheme, subscribeTheme, type ThemeChoice } from "@/lib/theme";

/** A settings row: name, value, and whatever changes it. No boxes. */
function Row({ name, hint, children }: { name: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hair py-5">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium text-fg">{name}</p>
        {hint ? (
          <p className="mt-1 max-w-[26rem] text-[0.75rem] leading-[1.5] text-fg-3">{hint}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export function SettingsView({ email, courseCount }: { email: string; courseCount: number }) {
  /* The class on <html> is the theme's only state, and "system" is the
     absence of a stored choice, so this reads the store rather than React.
     The server snapshot is "system", which is also what the header switch
     assumes before it has looked. */
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

  return (
    <div className="mx-auto w-full max-w-[42rem] px-5 pt-10 pb-24 sm:px-8">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
        Settings
      </h1>

      <section className="mt-10">
        <h2 className="label border-b border-hair pb-2 text-fg-3">Account</h2>
        <Row name="Google" hint="The only way into Mikasa.">
          <span className="text-[0.8125rem] text-fg-2">{email}</span>
        </Row>
      </section>

      <section className="mt-12">
        <h2 className="label border-b border-hair pb-2 text-fg-3">Appearance</h2>
        <Row name="Ground" hint="With no choice stored, your operating system decides.">
          <ToggleGroup
            multiple={false}
            value={[theme]}
            onValueChange={(v) => setTheme((v[0] as ThemeChoice) ?? theme)}
            aria-label="Ground"
          >
            {(["system", "light", "dark"] as const satisfies ThemeChoice[]).map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c === "system" ? "System" : c === "light" ? "Paper" : "Graphite"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
      </section>

      <section className="mt-12">
        <h2 className="label border-b border-hair pb-2 text-fg-3">Your data</h2>
        <Row name="Courses">
          <span className="tnum text-[0.8125rem] text-fg-2">{courseCount}</span>
          <Button variant="quiet" render={<Link href="/courses" />}>
            Open
          </Button>
        </Row>
        <Row name="Sign out">
          <SignOutButton variant="quiet" />
        </Row>
      </section>
    </div>
  );
}
