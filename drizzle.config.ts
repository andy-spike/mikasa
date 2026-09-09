import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

/* drizzle-kit evaluates this file outside Next, so .env.local is not loaded
   yet. Next-style precedence: .env.local first, .env fills any gaps. */
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const target = process.env.DATABASE_TARGET ?? "dev";
const url = target === "main" ? process.env.DATABASE_URL_MAIN : process.env.DATABASE_URL_DEV;
if (!url) throw new Error(`DATABASE_URL_${target.toUpperCase()} is not set. Add it to .env.local.`);

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
