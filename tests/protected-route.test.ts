// The signed-in case runs the real Google flow, so the session cookie is one
// Better Auth itself issued.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

vi.mock("next/headers", async () => {
  const { headerState } = await import("./helpers/request-context");
  return { headers: async () => headerState.current };
});

const navigation = vi.hoisted(() => ({
  redirect: (url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/navigation", () => navigation);

const { auth, requireLearner } = await import("@/lib/session");
const { signInWithGoogle } = await import("./helpers/auth");
const { setRequestCookie } = await import("./helpers/request-context");

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  setRequestCookie(null);
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

    setRequestCookie(cookie);
    await expect(requireLearner()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("hands the session to a signed-in Learner", async () => {
    const cookie = await signInWithGoogle("learner@example.com");
    setRequestCookie(cookie);

    const session = await requireLearner();
    expect(session.user.email).toBe("learner@example.com");
  });
});
