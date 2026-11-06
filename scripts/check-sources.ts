/**
 * Gate 3: static checks on the TypeScript source and the migrations, and that
 * every error code the API raises is read in the person's language. With a
 * cell database URL it also checks the catalogue facts the source must match:
 * every unique key and exclusion constraint maps to a domain code, and every
 * descriptor namespace a generated `*_ns` column pins is seeded.
 */
import { CONFLICTS } from "@faridalms/database/errors";
import { CONFLICT_CONSTRAINTS } from "@faridalms/database/gates";
import { MIGRATIONS } from "@faridalms/database/migrate";
import {
  CATALOGUE,
  CEDS_GRADE_LEVELS,
} from "@faridalms/domain/descriptors/catalogue";
import { STAFF_ROLES } from "@faridalms/domain/workspace";
import { Glob, SQL } from "bun";

import { errorCodeProblems } from "./error-codes";
import { migrationProblems } from "./migration-checks";

const problems: string[] = [];

const SOURCE_ROOTS = [
  "apps/api/src",
  "apps/ops/src",
  "apps/web/src",
  "packages",
  "scripts",
];
const IGNORED = [
  /\/node_modules\//,
  /\/test\//,
  /\/proto\//,
  /\.gen\.ts$/,
  /\/i18n\//,
];

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
// Dates and times are shown on the school's clock, so they are written only
// by the helpers that know it; the browser's or the server's own zone shows
// a family in Cairo a time hours off. Dates and lists are also written the
// same by every engine there, so the server's page and the browser's agree.
const OWN_CLOCK =
  /Intl\.(?:DateTimeFormat|ListFormat)|\.toLocale(?:Date|Time)String\(|new Date\([^)]*\)\.toLocaleString\(|getTimezoneOffset\(/;
const TIME_HELPERS = new Set([
  "apps/web/src/utils/datetime.ts",
  "packages/domain/src/date-text.ts",
  "packages/domain/src/school.ts",
]);
// Which guardians the school may do something for, who counts as staff and
// how far a viewer reaches are each decided in one place; a pasted copy is
// how a parent the school cut off gets sent a message.
const GUARDIAN_RULE =
  /\b\w+\.(?:portal_access|receives_notifications)\s+and\b|\bnot\s+(?:coalesce\(\s*)?\w+\.communication_isolated\b/i;
const STAFF_LIST = /'teacher',\s*'aide',\s*'counselor'/;
const REACH_FLAG = /\bschoolWide\s*:/;
const PAGE_GATE = /capabilities\.includes\([^)]*\)\s*\)?\s*throw\s+redirect/;
const REACH_STORE =
  /\b(?:isVisibleStudent|reachedStudents|personReach|reachesClass|teachesClass)\b[^;]*from\s+["']@faridalms\/database\/stores\//;

const files = await sources();
for (const { path, text } of files) {
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
    path === "packages/database/src/business/client.ts" ||
    path.startsWith("scripts/");
  if (!poolAllowed && POOL.test(text))
    problems.push(`${path}: opens a database pool outside the context module`);
  if (/singletonKey\s*:/.test(text) && !path.endsWith("/jobs.ts"))
    problems.push(
      `${path}: a pg-boss singleton key not built by the tenant helper`,
    );
  if (GUARDIAN_RULE.test(text))
    problems.push(
      `${path}: writes the guardian rule out; use app.guardian_permits`,
    );
  if (
    !path.startsWith("packages/database/src/tables/") &&
    STAFF_LIST.test(text)
  )
    problems.push(`${path}: lists the staff roles; use app.staff_roles()`);
  if (
    path.startsWith("apps/api/src/") &&
    path !== "apps/api/src/core/reach.ts" &&
    (REACH_FLAG.test(text) || REACH_STORE.test(text))
  )
    problems.push(`${path}: decides reach outside core/reach.ts`);
  if (path.startsWith("apps/web/src/routes/") && PAGE_GATE.test(text))
    problems.push(`${path}: gates a page by hand; use requirePage`);
  if (
    !TIME_HELPERS.has(path) &&
    (path.startsWith("apps/") || path.startsWith("packages/editor/")) &&
    OWN_CLOCK.test(text)
  )
    problems.push(
      `${path}: formats a date, time or list outside the shared helpers`,
    );
}

// A component's props are a named interface beside it, so a screen can see
// what it may pass and a reviewer what changed; an inline object type hides
// both. The design system and both apps are held to it.
const INLINE_PROPS = [
  /function\s+[A-Z]\w*(?:<[^>(]*>)?\(\{[^)]*?\}\s*:\s*\{/s,
  /const\s+[A-Z]\w*\s*=\s*\(\{[^)]*?\}\s*:\s*\{/s,
];
const PROPS_ROOTS = ["apps/web/src", "apps/ops/src", "packages/ui/src/system"];
// What a component is goes above the component, where an editor shows it on
// hover; above its props it describes the wrong thing.
const DOC_ON_PROPS =
  /\*\/\n(?:export )?interface (\w+)Props(?:<[^>{]*>)? \{(?:\n(?!\}).*)*\n\}\n\n(?:export )?(?:default )?function \1\b/;
for (const root of PROPS_ROOTS)
  for await (const path of new Glob(`${root}/**/*.tsx`).scan(".")) {
    if (IGNORED.some((pattern) => pattern.test(path))) continue;
    const text = await Bun.file(path).text();
    if (INLINE_PROPS.some((pattern) => pattern.test(text)))
      problems.push(
        `${path}: a component types its props inline; name an interface`,
      );
    if (DOC_ON_PROPS.test(text))
      problems.push(
        `${path}: a component's doc sits above its props; move it to the component`,
      );
  }

problems.push(...errorCodeProblems(files));

// Every action the audit log records reads as words in a history, never as
// its code: an action written without a label fails here. An action chosen
// by a condition names each choice, on its line or the lines that continue
// it with `?` or `:`. Actions picked from a table are listed in one named
// `AUDIT_ACTIONS`. The business database's events are the company's own,
// read in the English-only console and never in a school's history.
const AUDITED =
  /\baction:[^\n]*(?:\n\s+[?:][^\n]*)*|\bAUDIT_ACTIONS\b[^=]*= \{[\s\S]*?\n\}/g;
const ACTION_CODE = /"([a-z_]+\.[a-z_.]+)"/g;
const labels = files.find(
  (file) => file.path === "apps/web/src/utils/audit-actions.ts",
);
const labelled = new Set(
  [...(labels?.text ?? "").matchAll(/^\s+"([a-z_.]+)":\s+m\./gm)].map(
    (match) => match[1],
  ),
);
for (const file of files) {
  if (
    !file.path.startsWith("apps/api/src/") &&
    !file.path.startsWith("packages/database/src/")
  )
    continue;
  if (file.path.endsWith(".test.ts")) continue;
  if (file.path.startsWith("packages/database/src/business/")) continue;
  for (const [written] of file.text.matchAll(AUDITED))
    for (const [, action] of written.matchAll(ACTION_CODE))
      if (action && !labelled.has(action))
        problems.push(
          `${file.path}: audits "${action}" with no label in apps/web/src/utils/audit-actions.ts`,
        );
}

// Migrations from the one reach model on call its functions rather than
// writing the rules out again.
const REACH_MODEL = "20261101163828_reach_model";
for (const folder of Object.values(MIGRATIONS))
  for await (const path of new Glob(`${folder}/*/migration.sql`).scan(".")) {
    const text = await Bun.file(path).text();
    problems.push(...migrationProblems(path, text));
    const name = path.split("/").at(-2) ?? "";
    if (
      name > REACH_MODEL &&
      (GUARDIAN_RULE.test(text) || STAFF_LIST.test(text))
    )
      problems.push(`${path}: writes the guardian rule or the staff roles out`);
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
    const [staff]: { roles: string[] }[] = await client.unsafe(
      "select app.staff_roles() as roles",
    );
    if (JSON.stringify(staff?.roles) !== JSON.stringify(STAFF_ROLES))
      problems.push("app.staff_roles() and STAFF_ROLES name different roles");
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
