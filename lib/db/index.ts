/**
 * The Postgres client (ADR 0004). Neon through the `postgres` driver.
 *
 * The client connects lazily, so importing this module is safe at build
 * time; the first query is what needs the database. Tests build their own
 * Drizzle instance over PGlite instead of using this file.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (name only, see docs).");
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

/** Any Drizzle Postgres instance; tests pass the PGlite one. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };
