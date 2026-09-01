/**
 * Better Auth with Google OAuth only (ADR 0003).
 *
 * `createAuth` is a pure factory taking the Drizzle instance, so tests run
 * it against PGlite with a fake Google and no environment. The app's own
 * instance lives in `lib/session.ts`; this file never reads `next/headers`.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";
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
  /** false disables the proxy (tests); a value overrides the env pair. */
  oauthProxy?: { productionURL?: string; secret?: string } | false;
  /** Overrides the trusted origins list. */
  trustedOrigins?: string[];
};

/**
 * Every origin allowed to start or finish a sign-in: local dev, the
 * production URL, and Vercel preview deployments (which get unpredictable
 * hostnames, hence the wildcard). Values come from env names only.
 */
function defaultTrustedOrigins(): string[] {
  return [
    "http://localhost:3000",
    process.env.BETTER_AUTH_URL,
    process.env.BETTER_AUTH_PRODUCTION_URL,
    "https://*.vercel.app",
  ].filter((origin): origin is string => Boolean(origin));
}

export function createAuth(db: AuthDb, config: AuthConfig = {}) {
  const google =
    config.google === false
      ? undefined
      : {
          clientId:
            config.google?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret:
            config.google?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
        };

  const oauthProxy =
    config.oauthProxy === false
      ? []
      : [
          oAuthProxy({
            productionURL:
              config.oauthProxy?.productionURL ??
              process.env.BETTER_AUTH_PRODUCTION_URL,
            secret: config.oauthProxy?.secret ?? process.env.OAUTH_PROXY_SECRET,
          }),
        ];

  const options: BetterAuthOptions = {
    baseURL: config.baseURL ?? process.env.BETTER_AUTH_URL,
    secret: config.secret ?? process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    // No `emailAndPassword`: Google is the only way in, and the first
    // sign-in creates the account (ADR 0003).
    socialProviders: google ? { google } : {},
    trustedOrigins: config.trustedOrigins ?? defaultTrustedOrigins(),
    plugins: [...oauthProxy, nextCookies()],
  };

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
