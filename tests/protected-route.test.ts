/**
 * Auth-protected route behavior. `requireLearner` is what every signed-in
 * page calls first: signed out, it sends the visitor to the sign-in
 * experience (the landing); signed in, it hands over the Learner.
 *
 * The signed-in case runs the real Google flow against a fake Google, so
 * the session cookie is one Better Auth itself issued.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.current }));

const navigation = vi.hoisted(() => ({
  redirect: (url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/navigation", () => navigation);

const { auth, requireLearner } = await import("@/lib/session");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");

const ORIGIN = "http://localhost:3000";

/** Signs a Learner in through the full fake-Google flow, returns the cookies. */
async function signInWithGoogle(email: string): Promise<string> {
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

beforeEach(() => {
  headerState.current = new Headers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requireLearner", () => {
  it("sends a signed-out visitor to sign in", async () => {
    await expect(requireLearner()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("ignores a stale cookie once the session is gone", async () => {
    const cookie = await signInWithGoogle("stale@example.com");
    await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-out`, { method: "POST", headers: { cookie } }),
    );

    headerState.current = new Headers({ cookie });
    await expect(requireLearner()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("hands the session to a signed-in Learner", async () => {
    const cookie = await signInWithGoogle("learner@example.com");
    headerState.current = new Headers({ cookie });

    const session = await requireLearner();
    expect(session.user.email).toBe("learner@example.com");
  });
});
