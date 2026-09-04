// Google OAuth only. `createAuth` takes the Drizzle instance so tests run it against PGlite.
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "./db/schema";

export type AuthDb = Parameters<typeof drizzleAdapter>[0];

export type AuthConfig = {
  secret?: string;
  baseURL?: string;
  google?: { clientId: string; clientSecret: string } | false;
  trustedOrigins?: string[];
};

// Throws naming every missing variable, never printing a value.
export function assertAuthConfig(
  overrides: Pick<AuthConfig, "baseURL" | "secret" | "google"> = {},
  env: Record<string, string | undefined> = process.env,
): void {
  const baseURL = overrides.baseURL ?? env.BETTER_AUTH_URL;
  const secret = overrides.secret ?? env.BETTER_AUTH_SECRET;
  const google =
    overrides.google === false
      ? undefined
      : {
          clientId: overrides.google?.clientId ?? env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: overrides.google?.clientSecret ?? env.GOOGLE_CLIENT_SECRET ?? "",
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
}

export function createAuth(db: AuthDb, config: AuthConfig = {}) {
  assertAuthConfig(config);
  const baseURL = config.baseURL ?? process.env.BETTER_AUTH_URL;
  const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;
  const google =
    config.google === false
      ? undefined
      : {
          clientId: config.google?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: config.google?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
        };

  const options: BetterAuthOptions = {
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    socialProviders: google ? { google } : {},
    trustedOrigins: config.trustedOrigins ?? [baseURL!],
    plugins: [nextCookies()],
  };

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
