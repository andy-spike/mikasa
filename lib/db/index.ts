import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL_DEV is not set. Add it to .env.local (name only, see docs).");
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };
