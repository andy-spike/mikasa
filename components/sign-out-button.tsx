"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "icon" }: { variant?: "icon" | "quiet" }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant={variant} onClick={signOut} aria-label="Sign out" title="Sign out">
      {variant === "icon" ? <LogOut className="h-4 w-4" strokeWidth={1.75} /> : "Sign out"}
    </Button>
  );
}
