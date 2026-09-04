import "server-only";

// Checks live close to the data, not in layouts, which do not re-render on navigation.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createAuth, type Auth } from "@/lib/auth";

export const auth: Auth = createAuth(db);

export async function requireLearner(): Promise<
  NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  return session;
}
