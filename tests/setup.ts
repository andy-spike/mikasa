/**
 * Test-only environment. Tests must never reach a real service, so every
 * provider-facing variable gets a dummy value. PGlite replaces Postgres,
 * and the fake Google lives in `tests/helpers/fake-google.ts`.
 */

const REQUIRED = {
  DATABASE_URL: "postgres://localhost:5432/mikasa_test",
  BETTER_AUTH_SECRET: "test-secret-not-used-anywhere-real",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
} as const;

for (const [name, value] of Object.entries(REQUIRED)) {
  process.env[name] ??= value;
}
