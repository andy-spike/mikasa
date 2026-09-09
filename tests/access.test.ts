// The Proxy's optimistic route policy in lib/access.ts. No database: a cookie
// string is enough, because the policy only reads its presence.
import { describe, expect, it } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { accessResponse, GUEST_ROUTES, LEARNER_ROUTES, signedOutHref } from "@/lib/access";
import { config } from "@/proxy";

const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token=one-session-id";

function request(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function redirectTarget(response: NextResponse | null): string | null {
  if (!(response instanceof Response)) return null;
  const location = new URL(response.headers.get("location") as string);
  return `${location.pathname}${location.search}`;
}

describe("accessResponse", () => {
  it("sends a visitor without a cookie off every Learner route", () => {
    for (const path of ["/courses", "/courses/new", "/courses/c-1", "/settings"]) {
      expect(redirectTarget(accessResponse(request(path))), path).toBe("/");
    }
  });

  it("sends a signed-in Learner off every Guest route", () => {
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      expect(redirectTarget(accessResponse(request(path, SESSION_COOKIE))), path).toBe("/courses");
    }
  });

  it("keeps a visitor without a cookie on the landing", () => {
    expect(accessResponse(request("/"))).toBeNull();
  });

  it("keeps a signed-in Learner on their routes", () => {
    for (const path of ["/courses", "/courses/new", "/courses/c-1", "/settings"]) {
      expect(accessResponse(request(path, SESSION_COOKIE)), path).toBeNull();
    }
  });

  it("does not read a Learner route into a similar path", () => {
    expect(accessResponse(request("/courses-x"))).toBeNull();
  });

  it("does not treat the signed-out marker as a Guest route to bounce from", () => {
    const landing = request(signedOutHref(), SESSION_COOKIE);
    expect(accessResponse(landing)).toBeNull();
  });
});

describe("proxy matcher", () => {
  it("runs on every page path", () => {
    for (const path of ["/", "/sign-in", "/courses", "/courses/c-1/outline", "/settings"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` }), path).toBe(true);
    }
  });

  it("stays out of the API, assets, and files", () => {
    for (const path of [
      "/api/auth/sign-in/social",
      "/api/auth/callback/google",
      "/api/courses/c-1/tutor",
      "/_next/static/chunk.js",
      "/_next/image?src=x",
      "/file.svg",
      "/favicon.ico",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` }), path).toBe(false);
    }
  });
});

describe("route classes", () => {
  it("never lists a route twice", () => {
    expect(GUEST_ROUTES.some((route) => LEARNER_ROUTES.includes(route))).toBe(false);
  });
});
