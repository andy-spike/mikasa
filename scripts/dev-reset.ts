// Explicit development reset for stale Course specifications.
// Old specs without exampleStart/exampleEnd/sourceRefs block testing after
// the v1 generation change. Development data is disposable, but nothing
// deletes automatically: run this by hand, never in production.
//
// Usage: bun run scripts/dev-reset.ts [--yes]
// Without --yes it only reports what would go.
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL_DEV first.");
  process.exit(1);
}
if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  console.error("Refusing to run a development reset against production.");
  process.exit(1);
}

const yes = process.argv.includes("--yes");
const sql = postgres(connectionString, { max: 1 });

const stale = await sql`
  select id, spec from course_specs
  where spec->'alignment' @> '[{"exampleStart": null}]'
     or not (spec->'alignment' @> '[{"exampleStart": ""}]')
     or spec->'alignment' is null
  limit 20
`.catch(() => [] as unknown[]);

console.log(`Found ${stale.length} possibly stale spec row(s) in preview (max 20 shown).`);
if (!yes) {
  console.log("Dry run. Re-run with --yes to delete development candidate data for those Courses.");
  console.log(
    "This deletes lessons, review runs, generation runs, and specs for stale Courses only.",
  );
  await sql.end();
  process.exit(0);
}

const ids = await sql`select distinct course_id as id from course_specs`.catch(() => []);
console.log(
  `Resetting ${ids.length} Course(s) with specs. This keeps Courses, Outlines, and Sources; it clears generated Lessons, reviews, and runs.`,
);
for (const row of ids as { id: string }[]) {
  const courseId = row.id;
  await sql`delete from lessons where course_id = ${courseId}`;
  await sql`delete from review_runs where course_id = ${courseId}`;
  await sql`delete from generation_runs where course_id = ${courseId}`;
  await sql`delete from code_verifications where course_id = ${courseId}`;
}
await sql.end();
console.log("Done. Re-approve Outlines to regenerate with the new specification shape.");
