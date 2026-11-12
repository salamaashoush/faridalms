import { ERASURE_RULES } from "@faridalms/database/erasure-rules";
import { CATALOGUE_CHECK } from "@faridalms/database/gates";
import {
  ownershipProblems,
  readOwnership,
} from "@faridalms/database/ownership-gate";
import { SQL } from "bun";

const url = process.argv[2] ?? process.env.CELL_CHECK_URL;
if (!url) {
  console.error("Usage: bun scripts/check-rls.ts <cell database url>");
  process.exit(2);
}
const client = new SQL(url);
try {
  const problems: { name: string; problem: string }[] =
    await client.unsafe(CATALOGUE_CHECK);
  // Every table that names a person says what erasing them does to it.
  const named: { name: string; erased: boolean }[] = await client.unsafe(`
    select n.nspname || '.' || c.relname as name,
      exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('w', 'd')
        and p.polroles @> array[(select oid from pg_roles where rolname = 'retention')]) as erased
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('core', 'health', 'audit') and c.relkind in ('r', 'p') and not c.relispartition
      and exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
        and k.confrelid = 'core.users'::regclass)`);
  for (const { name, erased } of named) {
    const rule = ERASURE_RULES[name];
    if (!rule)
      problems.push({
        name,
        problem: "names a person without an erasure rule",
      });
    else if (rule.rule === "erased" && !erased)
      problems.push({ name, problem: "is erased but retention has no policy" });
  }
  for (const name of Object.keys(ERASURE_RULES))
    if (!named.some((row) => row.name === name))
      problems.push({
        name,
        problem: "has an erasure rule but names no person",
      });
  // Every table belongs to core or one module, and reaches only what that allows.
  problems.push(...ownershipProblems(await readOwnership(client)));
  if (problems.length > 0) {
    for (const row of problems) console.error(`${row.name}: ${row.problem}`);
    console.error(`Catalogue check: ${problems.length} problems.`);
    process.exitCode = 1;
  } else console.info("Catalogue check: no problems.");
} finally {
  await client.close();
}
