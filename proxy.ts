import type { NextRequest } from "next/server";
import { accessResponse } from "@/lib/access";

/* Proxy (the Next.js 16 name for Middleware) applies the route policy in
   lib/access.ts before a page renders. The matcher skips Better Auth's own
   handlers under /api and static assets; the course API handlers check the
   session for real, so the Proxy stays out of /api entirely. */
export default function proxy(request: NextRequest) {
  return accessResponse(request);
}

/* Match every page path: exclude /api, build assets, and anything with a file
   extension in its last segment (public icons, favicon, robots.txt). */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
