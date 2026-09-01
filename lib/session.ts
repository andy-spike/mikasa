import "server-only";

/**
 * The app's auth instance and the session checks pages use.
 *
 * Pages call `requireLearner()` directly (checks live close to the data,
 * not in layouts, which do not re-render on navigation). A signed-out
 * visitor lands on the sign-in experience, which is the landing page.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createAuth, type Auth } from "@/lib/auth";

export const auth: Auth = createAuth(db);

/**
 * The session for this request, or the caller is sent to sign in.
 * The return is narrowed to a real session after the redirect.
 */
export async function requireLearner(): Promise<
  NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  return session;
}
