/**
 * Server boot checks (bug 15): a deployment with missing auth
 * configuration refuses to start here, naming the missing variables,
 * instead of failing on the first request that touches auth. Node
 * runtime only — the auth stack is Node-only, and the Edge runtime
 * never creates sessions.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertAuthConfig } = await import("@/lib/auth");
  assertAuthConfig();
}
