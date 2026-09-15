"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/workspace/hint";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "icon" }: { variant?: "icon" | "quiet" }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  const button = (
    <Button variant={variant} onClick={signOut} aria-label="Sign out">
      {variant === "icon" ? <LogOut className="h-4 w-4" strokeWidth={1.75} /> : "Sign out"}
    </Button>
  );

  /* The quiet variant carries its own words; only the icon has to name itself. */
  return variant === "icon" ? <Hint label="Sign out">{button}</Hint> : button;
}
