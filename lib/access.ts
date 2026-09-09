import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/* The route policy, in two lists. A Learner route needs a session; a Guest
   route starts one, and the landing doubles as the sign-in screen, so a
   signed-in Learner is sent to /courses instead of being offered a second
   login. Every route belongs to at most one list; anything unlisted is open
   to both. Paths match on a segment boundary, so /courses also covers
   /courses/new and /courses/:courseId without catching /courses-x. */
export const LEARNER_ROUTES = ["/courses", "/settings"];
export const GUEST_ROUTES = ["/", "/sign-in", "/sign-up"];

const LEARNER_HOME = "/courses";
const LANDING = "/";

/* requireLearner sends a failed session here. The marker keeps a Learner
   whose cookie is stale from ping-ponging: the Proxy's guest check counts
   any cookie as signed in, so without it, /courses -> / -> /courses would
   loop forever. On the marked landing the stale cookie is simply ignored. */
const SIGNED_OUT = "signedOut";

export function signedOutHref(): string {
  return `${LANDING}?${SIGNED_OUT}=1`;
}

function onRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

/* Optimistic access control for the Proxy: one cookie lookup, no database.
   A cookie that no longer matches a session still reads as signed in here,
   so the real checks in requireLearner and the API handlers stay the last
   word on who gets data. */
export function accessResponse(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (LEARNER_ROUTES.some((route) => onRoute(pathname, route))) {
    if (!hasSessionCookie) return NextResponse.redirect(new URL(LANDING, request.url));
  } else if (
    GUEST_ROUTES.some((route) => onRoute(pathname, route)) &&
    hasSessionCookie &&
    !request.nextUrl.searchParams.has(SIGNED_OUT)
  ) {
    return NextResponse.redirect(new URL(LEARNER_HOME, request.url));
  }

  return null;
}
