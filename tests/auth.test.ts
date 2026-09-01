/**
 * Sign-in against a fake Google, end to end: the route handler, the real
 * Better Auth flow, and the Drizzle schema on PGlite. First sign-in creates
 * the Learner; the next one restores the same account; sign-out ends it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth, type Auth, type AuthDb } from "@/lib/auth";
import { accounts, sessions, users } from "@/lib/db/schema";
import { makeTestDb } from "./helpers/test-db";
import { cookieHeader, fakeGoogle } from "./helpers/fake-google";

const ORIGIN = "http://localhost:3000";

function testAuth(db: AuthDb): Auth {
  return createAuth(db, {
    secret: "test-secret-not-used-anywhere-real",
    baseURL: ORIGIN,
    google: { clientId: "test-google-client-id", clientSecret: "test-google-client-secret" },
    // The proxy only matters across local/preview/production; here the
    // callback is answered locally.
    oauthProxy: false,
    trustedOrigins: [ORIGIN],
  });
}

/** Asks the handler for a Google authorize URL, like the landing button. */
async function startGoogleSignIn(auth: Auth, callbackURL = "/courses") {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { url: string; redirect: boolean };
  expect(body.redirect).toBe(true);
  // The authorize URL must aim at Google and carry our client id; nothing
  // here follows it, so no network call happens.
  const authorize = new URL(body.url);
  expect(authorize.origin + authorize.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(authorize.searchParams.get("client_id")).toBe("test-google-client-id");
  const state = authorize.searchParams.get("state");
  expect(state).toBeTruthy();
  return { response, authorize, state: state as string };
}

/** Completes the round trip: Google "calls back" with a code and the state. */
async function finishGoogleSignIn(auth: Auth, state: string, start: Response, code: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/google?code=${code}&state=${state}`, {
      headers: { cookie: cookieHeader(start) },
    }),
  );
}

async function sessionUser(auth: Auth, cookie: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }),
  );
  if (response.status !== 200) return null;
  return (await response.json()) as { user: { id: string; email: string }; session: { id: string } } | null;
}

let db: Awaited<ReturnType<typeof makeTestDb>>;
let auth: Auth;

beforeEach(async () => {
  db = await makeTestDb();
  auth = testAuth(db);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("first sign-in", () => {
  it("creates the Learner, a Google account, and a session", async () => {
    fakeGoogle({
      sub: "google-sub-1",
      name: "Andy Spike",
      email: "andy@example.com",
      email_verified: true,
    });

    const { response, state } = await startGoogleSignIn(auth);
    const callback = await finishGoogleSignIn(auth, state, response, "one-time-code");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/courses");

    const cookie = cookieHeader(callback);
    const session = await sessionUser(auth, cookie);
    expect(session?.user.email).toBe("andy@example.com");

    const learners = await db.select().from(users);
    expect(learners).toHaveLength(1);
    expect(learners[0].email).toBe("andy@example.com");

    const googleAccounts = await db.select().from(accounts);
    expect(googleAccounts).toHaveLength(1);
    expect(googleAccounts[0].providerId).toBe("google");
    expect(googleAccounts[0].accountId).toBe("google-sub-1");
    expect(googleAccounts[0].userId).toBe(learners[0].id);
  });
});

describe("returning sign-in", () => {
  it("restores the same account instead of creating a second one", async () => {
    fakeGoogle({
      sub: "google-sub-1",
      name: "Andy Spike",
      email: "andy@example.com",
      email_verified: true,
    });

    const first = await startGoogleSignIn(auth);
    const firstCallback = await finishGoogleSignIn(auth, first.state, first.response, "code-1");
    const firstSession = await sessionUser(auth, cookieHeader(firstCallback));
    expect(firstSession).not.toBeNull();

    // New consent round: a fresh state and code, the same Google subject.
    const second = await startGoogleSignIn(auth);
    const secondCallback = await finishGoogleSignIn(auth, second.state, second.response, "code-2");
    const secondSession = await sessionUser(auth, cookieHeader(secondCallback));
    expect(secondSession).not.toBeNull();

    expect(secondSession?.user.id).toBe(firstSession?.user.id);
    expect((await db.select().from(users)).length).toBe(1);
    expect((await db.select().from(accounts)).length).toBe(1);
  });
});

describe("sign-out", () => {
  it("deletes the session, so the cookie no longer names a Learner", async () => {
    fakeGoogle({
      sub: "google-sub-1",
      name: "Andy Spike",
      email: "andy@example.com",
      email_verified: true,
    });

    const { response, state } = await startGoogleSignIn(auth);
    const callback = await finishGoogleSignIn(auth, state, response, "one-time-code");
    const cookie = cookieHeader(callback);
    expect(await sessionUser(auth, cookie)).not.toBeNull();

    const signOut = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-out`, { method: "POST", headers: { cookie } }),
    );
    expect(signOut.status).toBe(200);

    expect((await db.select().from(sessions)).length).toBe(0);
    expect(await sessionUser(auth, cookie)).toBeNull();
  });
});

describe("isolation of the schema", () => {
  it("keeps a second Learner's account separate", async () => {
    fakeGoogle({
      sub: "google-sub-2",
      name: "Someone Else",
      email: "else@example.com",
      email_verified: true,
    });
    const { response, state } = await startGoogleSignIn(auth);
    const callback = await finishGoogleSignIn(auth, state, response, "one-time-code");
    const session = await sessionUser(auth, cookieHeader(callback));
    expect(session?.user.email).toBe("else@example.com");

    const rows = await db.select().from(users).where(eq(users.email, "andy@example.com"));
    expect(rows).toHaveLength(0);
  });
});
