/**
 * A fake Google. `fetch` is stubbed so the OAuth token exchange answers
 * locally; no request ever leaves the test process. The id_token carries
 * the profile exactly as Google's does (Better Auth decodes it), while the
 * access token is opaque.
 */
import { vi } from "vitest";

export type FakeGoogleProfile = {
  sub: string;
  name: string;
  email: string;
  email_verified?: boolean;
  picture?: string;
};

function encodePart(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** A JWT with no signature; the code under test decodes, never verifies. */
export function fakeIdToken(
  claims: FakeGoogleProfile & { iss: string; aud: string; iat: number; exp: number },
): string {
  return `${encodePart({ alg: "none", typ: "JWT" })}.${encodePart(claims)}.`;
}

export type FakeGoogle = {
  /** The profile the next sign-in will present. Change it between flows. */
  profile: FakeGoogleProfile;
  /** Every fetch the flow attempted; asserts nothing else leaked out. */
  calls: string[];
};

/** Stubs global fetch to answer Google's token endpoint and nothing else. */
export function fakeGoogle(profile: FakeGoogleProfile): FakeGoogle {
  const fake: FakeGoogle = { profile, calls: [] };
  const now = Math.floor(Date.now() / 1000);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fake.calls.push(url);

      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "fake-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
            id_token: fakeIdToken({
              iss: "https://accounts.google.com",
              aud: "test-google-client-id",
              iat: now,
              exp: now + 3600,
              ...fake.profile,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Tests must not call the network; fetch saw ${url}`);
    }),
  );

  return fake;
}

/** Every Set-Cookie flattened into one Cookie header for the next request. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
