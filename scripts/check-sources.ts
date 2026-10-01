/**
 * Gate 3: static checks on the TypeScript source and the migrations. With a
 * cell database URL it also checks the catalogue facts the source must match:
 * every unique key and exclusion constraint maps to a domain code, and every
 * descriptor namespace a generated `*_ns` column pins is seeded.
 */
import { CONFLICTS } from "@faridalms/database/errors";
import { CONFLICT_CONSTRAINTS } from "@faridalms/database/gates";
import {
  CATALOGUE,
  CEDS_GRADE_LEVELS,
} from "@faridalms/domain/descriptors/catalogue";
import { Glob, SQL } from "bun";

const problems: string[] = [];

const SOURCE_ROOTS = ["apps/api/src", "apps/web/src", "packages", "scripts"];
const IGNORED = [
  /\/node_modules\//,
  /\/test\//,
  /\/proto\//,
  /\.gen\.ts$/,
  /\/i18n\//,
];

/** Files of the per-school model that remain until their systems are rewritten. */
const LEGACY_POOLS = new Set([
  "packages/database/src/index.ts",
  "packages/database/src/control.ts",
]);

async function sources(): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const root of SOURCE_ROOTS)
    for await (const path of new Glob(`${root}/**/*.{ts,tsx}`).scan(".")) {
      if (IGNORED.some((pattern) => pattern.test(path))) continue;
      files.push({ path, text: await Bun.file(path).text() });
    }
  return files;
}

const SESSION_SETTING = /\bset_config\s*\([^)]*,\s*false\s*\)/i;
const SET_STATEMENT =
  /[`'"]\s*(?:set\s+(?:local\s+|session\s+)?(?:role\b|[a-z_]+\.[a-z_]+|[a-z_]+\s*(?:=|to\b))|reset\s+(?:all|role|[a-z_]+\.[a-z_]+)\b)/i;
const RAW_SQL = /\bsql\.raw\s*\(/;
const POOL = /from\s+["']drizzle-orm\/bun-sql|new\s+SQL\s*\(/;

for (const { path, text } of await sources()) {
  if (path === "scripts/check-sources.ts") continue;
  const context = path === "packages/database/src/context.ts";
  const runner = path === "packages/database/src/migrate.ts";
  if (!context && SESSION_SETTING.test(text))
    problems.push(`${path}: set_config(..., false) outside the unit of work`);
  if (
    !context &&
    !runner &&
    !path.startsWith("scripts/") &&
    SET_STATEMENT.test(text)
  )
    problems.push(`${path}: SET or RESET outside the unit of work`);
  if (RAW_SQL.test(text)) problems.push(`${path}: sql.raw outside migrations`);
  const poolAllowed =
    context ||
    runner ||
    path.startsWith("packages/database/src/directory/") ||
    path.startsWith("scripts/") ||
    LEGACY_POOLS.has(path);
  if (!poolAllowed && POOL.test(text))
    problems.push(`${path}: opens a database pool outside the context module`);
  if (/singletonKey\s*:/.test(text) && !path.endsWith("/jobs.ts"))
    problems.push(
      `${path}: a pg-boss singleton key not built by the tenant helper`,
    );
}

const FORBIDDEN_IN_MIGRATIONS = [
  /disable\s+row\s+level\s+security/i,
  /no\s+force\s+row\s+level\s+security/i,
  /drop\s+policy\s+(?:if\s+exists\s+)?"?tenant_isolation"?/i,
  /owner\s+to\s+(?!"?cell_owner"?\b|"?directory_owner"?\b)/i,
  /bypassrls/i,
];
for (const folder of ["drizzle", "drizzle-directory"])
  for await (const path of new Glob(`${folder}/*/migration.sql`).scan(".")) {
    const text = await Bun.file(path).text();
    for (const pattern of FORBIDDEN_IN_MIGRATIONS)
      if (pattern.test(text)) problems.push(`${path}: matches ${pattern}`);
  }

for (const namespace of CATALOGUE)
  for (const value of namespace.values) {
    if (!value.en || !value.ar)
      problems.push(
        `descriptor ${namespace.namespace}/${value.code} lacks a label`,
      );
    if (namespace.meaningRequired && !value.meaning)
      problems.push(
        `descriptor ${namespace.namespace}/${value.code} lacks a meaning`,
      );
    if (value.code.includes("#"))
      problems.push(
        `descriptor ${namespace.namespace}/${value.code} contains #`,
      );
    if (
      namespace.namespace === "grade_level" &&
      !(CEDS_GRADE_LEVELS as readonly string[]).includes(value.oneroster ?? "")
    )
      problems.push(`grade ${value.code} has no CEDS entry grade level`);
  }

const url = process.argv[2];
if (url) {
  const client = new SQL(url);
  try {
    const constraints: { name: string }[] =
      await client.unsafe(CONFLICT_CONSTRAINTS);
    for (const { name } of constraints)
      if (!(name in CONFLICTS))
        problems.push(`constraint ${name} has no error mapping`);
    const pinned: { ns: string }[] = await client.unsafe(`
      select distinct trim(both '''' from split_part(pg_get_expr(d.adbin, d.adrelid), '::', 1)) as ns
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname in ('core', 'health') and a.attgenerated = 's' and a.attname like '%\\_ns'`);
    const seeded = new Set(CATALOGUE.map((namespace) => namespace.namespace));
    for (const { ns } of pinned)
      if (!seeded.has(ns))
        problems.push(`namespace ${ns} is pinned but not seeded`);
  } finally {
    await client.close();
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`Source checks: ${problems.length} problems.`);
  process.exit(1);
}
console.info("Source checks: no problems.");
