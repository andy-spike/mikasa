import "server-only";

// Checks live close to the data, not in layouts, which do not re-render on navigation.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createAuth, type Auth } from "@/lib/auth";
import { signedOutHref } from "@/lib/access";
import { findOwnedCourse } from "@/lib/db/courses";

export const auth: Auth = createAuth(db);

export async function requireLearner(): Promise<
  NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signedOutHref());
  return session;
}

export async function requireOwnedCourse(courseId: string) {
  const { user } = await requireLearner();
  const course = await findOwnedCourse(db, user.id, courseId);
  return { user, course };
}
