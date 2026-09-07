/**
 * Signs a Learner in through the real Better Auth handler, with only the
 * Google token exchange faked. Returns the session cookie string.
 */
import { expect } from "vitest";
import { cookieHeader, fakeGoogle } from "./fake-google";

const ORIGIN = "http://localhost:3000";

export async function signInWithGoogle(email: string): Promise<string> {
  const { auth } = await import("@/lib/session");
  fakeGoogle({ sub: `sub-${email}`, name: "A Learner", email, email_verified: true });

  const signIn = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/courses" }),
    }),
  );
  const { url } = (await signIn.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") as string;

  const callback = await auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/google?code=one-time-code&state=${state}`, {
      headers: { cookie: cookieHeader(signIn) },
    }),
  );
  expect(callback.status).toBe(302);
  return cookieHeader(callback);
}
