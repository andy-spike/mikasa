/**
 * An in-process Postgres for tests (PGlite, per the implementation
 * conventions): real SQL, real migrations, no Docker, no network.
 *
 * The pgvector extension rides along (the aliased `pglite-vector` build,
 * which bundles it), so ticket #11's exact vector retrieval runs the real
 * `<=>` operator against real 1536-dimension columns in tests. Production
 * runs pgvector on Neon; see drizzle/0009 for the CREATE EXTENSION.
 */
import { PGlite } from "pglite-vector";
import { vector as vectorExtension } from "pglite-vector/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import * as schema from "@/lib/db/schema";

export async function makeTestDb() {
  const client = new PGlite({ extensions: { vector: vectorExtension } });
  /* The two builds differ only in their (private-brand) types; the
     surface drizzle drives is the same. */
  const db = drizzle(client as unknown as PGliteType, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
