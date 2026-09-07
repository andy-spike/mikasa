/**
 * The object each test file wires into `next/headers` with vi.mock. Server
 * actions and routes read their cookies from here, so a test aims it at a
 * Learner's cookie (or none) before acting.
 */
export const headerState = { current: new Headers() };

export function setRequestCookie(cookie: string | null): void {
  headerState.current = cookie ? new Headers({ cookie }) : new Headers();
}
