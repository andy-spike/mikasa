import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

/* drizzle-kit evaluates this file outside Next, so .env.local is not loaded
   yet. Next-style precedence: .env.local first, .env fills any gaps. */
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Add it to .env.local.");

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
