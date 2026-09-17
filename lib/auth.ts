// Google OAuth only. `createAuth` takes the Drizzle instance so tests run it against PGlite.
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "./db/schema";

export type AuthDb = Parameters<typeof drizzleAdapter>[0];

export type AuthConfig = {
  secret?: string;
  baseURL?: BetterAuthOptions["baseURL"];
  google?: { clientId: string; clientSecret: string } | false;
  trustedOrigins?: string[];
};

const DEVELOPMENT_BASE_URL: NonNullable<BetterAuthOptions["baseURL"]> = {
  allowedHosts: ["localhost:*"],
  protocol: "http",
};

function resolveBaseURL(
  baseURL: AuthConfig["baseURL"],
  env: Record<string, string | undefined>,
): BetterAuthOptions["baseURL"] {
  if (baseURL) return baseURL;
  if (env.NODE_ENV === "development") return DEVELOPMENT_BASE_URL;
  return env.BETTER_AUTH_URL;
}

function resolveGoogle(
  google: AuthConfig["google"],
  env: Record<string, string | undefined>,
): { clientId: string; clientSecret: string } | undefined {
  if (google === false) return undefined;
  return {
    clientId: google?.clientId ?? env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: google?.clientSecret ?? env.GOOGLE_CLIENT_SECRET ?? "",
  };
}

// Throws naming every missing variable, never printing a value.
export function assertAuthConfig(
  overrides: Pick<AuthConfig, "baseURL" | "secret" | "google"> = {},
  env: Record<string, string | undefined> = process.env,
): void {
  const baseURL = resolveBaseURL(overrides.baseURL, env);
  const secret = overrides.secret ?? env.BETTER_AUTH_SECRET;
  const google = resolveGoogle(overrides.google, env);
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
  const baseURL = resolveBaseURL(config.baseURL, process.env);
  const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;
  const google = resolveGoogle(config.google, process.env);

  const options: BetterAuthOptions = {
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    socialProviders: google ? { google } : {},
    trustedOrigins: config.trustedOrigins ?? (typeof baseURL === "string" ? [baseURL] : undefined),
    plugins: [nextCookies()],
  };

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
