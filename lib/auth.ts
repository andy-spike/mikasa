/**
 * Better Auth with Google OAuth only (ADR 0003).
 *
 * `createAuth` is a pure factory taking the Drizzle instance, so tests run
 * it against PGlite with a fake Google and no environment. The app's own
 * instance lives in `lib/session.ts`; this file never reads `next/headers`.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "./db/schema";

/** Any Drizzle instance the adapter accepts; the real one is `lib/db`. */
export type AuthDb = Parameters<typeof drizzleAdapter>[0];

export type AuthConfig = {
  /** Overrides BETTER_AUTH_SECRET. Tests set their own. */
  secret?: string;
  /** Overrides BETTER_AUTH_URL. Left unset, Better Auth infers it. */
  baseURL?: string;
  /** false removes the provider (tests); a value overrides the env pair. */
  google?: { clientId: string; clientSecret: string } | false;
  /** Overrides the trusted origins list. */
  trustedOrigins?: string[];
};

export function createAuth(db: AuthDb, config: AuthConfig = {}) {
  const baseURL = config.baseURL ?? process.env.BETTER_AUTH_URL;
  const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;
  const google =
    config.google === false
      ? undefined
      : {
          clientId:
            config.google?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret:
            config.google?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
        };
  const missing = [
    !baseURL && "BETTER_AUTH_URL",
    !secret && "BETTER_AUTH_SECRET",
    google && !google.clientId && "GOOGLE_CLIENT_ID",
    google && !google.clientSecret && "GOOGLE_CLIENT_SECRET",
  ].filter((name): name is string => Boolean(name));
  if (missing.length) {
    throw new Error(`Missing required auth configuration: ${missing.join(", ")}`);
  }

  const options: BetterAuthOptions = {
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    // No `emailAndPassword`: Google is the only way in, and the first
    // sign-in creates the account (ADR 0003).
    socialProviders: google ? { google } : {},
    trustedOrigins: config.trustedOrigins ?? [baseURL!],
    plugins: [nextCookies()],
  };

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
