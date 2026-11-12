import type { ModuleId } from "@faridalms/domain/modules";
import type { Owner, Ownership } from "@faridalms/domain/ownership";
import type { SQL } from "bun";

import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import { MODULES } from "@faridalms/domain/modules";
import { guaranteedBy, mayReach } from "@faridalms/domain/ownership";

import type { OwnershipViolations } from "./ownership";

import { COLUMN_OWNERS, NAMESPACE_OWNERS, TABLE_OWNERS } from "./ownership";
import { OWNERSHIP_VIOLATIONS } from "./ownership-violations";

const TENANT_TABLE = `n.nspname in ('core', 'health', 'audit') and c.relkind in ('r', 'p') and not c.relispartition`;

const TABLES = `
select n.nspname || '.' || c.relname as name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where ${TENANT_TABLE}
order by 1`;

const KEYS = `
select n.nspname || '.' || c.relname as "table", k.conname as via,
  rn.nspname || '.' || r.relname as reaches
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_class r on r.oid = k.confrelid
join pg_namespace rn on rn.oid = r.relnamespace
where k.contype = 'f' and k.conparentid = 0 and ${TENANT_TABLE}
order by 1, 2`;

const COLUMNS = `
select n.nspname || '.' || c.relname as "table", a.attname as via
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where ${TENANT_TABLE} and a.attnum > 0 and not a.attisdropped
order by 1, 2`;

const NAMESPACE_COLUMNS = `
select n.nspname || '.' || c.relname as "table", a.attname as via,
  substring(pg_get_expr(d.adbin, d.adrelid) from '^''([a-z_]+)''::text$') as namespace
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where ${TENANT_TABLE} and a.attnum > 0 and not a.attisdropped and a.attname like '%\\_ns'
order by 1, 2`;

interface Reach {
  table: string;
  /** The key's name, or the column's. */
  via: string;
}

/** What the gate reads from a cell: its tables, their keys and their columns. */
export interface OwnershipCatalogue {
  tables: string[];
  keys: (Reach & { reaches: string })[];
  columns: Reach[];
  namespaceColumns: (Reach & { namespace: string | null })[];
}

export async function readOwnership(
  sql: Pick<SQL, "unsafe">,
): Promise<OwnershipCatalogue> {
  const tables: { name: string }[] = await sql.unsafe(TABLES);
  return {
    tables: tables.map((row) => row.name),
    keys: await sql.unsafe(KEYS),
    columns: await sql.unsafe(COLUMNS),
    namespaceColumns: await sql.unsafe(NAMESPACE_COLUMNS),
  };
}

export interface OwnershipRegistry {
  tables: Readonly<Record<string, Ownership>>;
  namespaces: Readonly<Record<string, Owner>>;
  columns: Readonly<Record<string, ModuleId>>;
  violations: OwnershipViolations;
}

const REGISTRY: OwnershipRegistry = {
  tables: TABLE_OWNERS,
  namespaces: NAMESPACE_OWNERS,
  columns: COLUMN_OWNERS,
  violations: OWNERSHIP_VIOLATIONS,
};

/** How a violation is listed: the table, the key or column, and what it reaches. */
export const violationOf = (reach: Reach, reaches: string) =>
  `${reach.table}: ${reach.via} -> ${reaches}`;

const ownerOf = (ownership: Ownership | undefined) =>
  !ownership || ownership.owner === "core"
    ? "core"
    : [ownership.owner, ...(ownership.needs ?? [])].join(" with ");

/**
 * Every way the catalogue and the registry disagree: a table or namespace
 * without an owner, an owner for a table, namespace or concept column that
 * does not exist, a key, namespace column or concept column that reaches
 * what its table's owner may not and is not listed, and a listed violation
 * that no longer occurs or sits under the wrong module.
 */
export function ownershipProblems(
  catalogue: OwnershipCatalogue,
  registry: OwnershipRegistry = REGISTRY,
): { name: string; problem: string }[] {
  const problems: { name: string; problem: string }[] = [];
  const present = new Set(catalogue.tables);
  for (const name of catalogue.tables)
    if (!registry.tables[name])
      problems.push({ name, problem: "has no owner" });
  for (const [name, ownership] of Object.entries(registry.tables)) {
    if (!present.has(name))
      problems.push({ name, problem: "has an owner but is not a table" });
    if (ownership.owner === "core") continue;
    const has = guaranteedBy(ownership.owner, MODULES);
    for (const need of ownership.needs ?? [])
      if (need === ownership.owner || has.has(need))
        problems.push({
          name,
          problem: `needs ${need}, which its owner ${ownership.owner} already has`,
        });
  }

  const seeded = new Set(CATALOGUE.map((namespace) => namespace.namespace));
  for (const namespace of seeded)
    if (!registry.namespaces[namespace])
      problems.push({
        name: `namespace ${namespace}`,
        problem: "has no owner",
      });
  for (const namespace of Object.keys(registry.namespaces))
    if (!seeded.has(namespace))
      problems.push({
        name: `namespace ${namespace}`,
        problem: "has an owner but is not a descriptor namespace",
      });

  const found = new Map<
    string,
    { from: Reach; reaches: string; owner: Owner }
  >();
  const reach = (from: Reach, reaches: string, owner: Owner | undefined) => {
    const ownership = registry.tables[from.table];
    if (!ownership || !owner || mayReach(ownership, owner, MODULES)) return;
    found.set(violationOf(from, reaches), { from, reaches, owner });
  };
  for (const key of catalogue.keys)
    reach(key, key.reaches, registry.tables[key.reaches]?.owner);
  for (const column of catalogue.namespaceColumns) {
    if (column.namespace === null) {
      problems.push({
        name: column.table,
        problem: `${column.via} pins no descriptor namespace`,
      });
      continue;
    }
    const owner = registry.namespaces[column.namespace];
    if (!owner)
      problems.push({
        name: column.table,
        problem: `${column.via} pins ${column.namespace}, which has no owner`,
      });
    reach(column, column.namespace, owner);
  }
  const named = new Set(catalogue.columns.map((column) => column.via));
  for (const name of Object.keys(registry.columns))
    if (!named.has(name))
      problems.push({
        name: `column ${name}`,
        problem: "has an owner but no table has it",
      });
  for (const column of catalogue.columns) {
    const owner = registry.columns[column.via];
    if (owner) reach(column, owner, owner);
  }

  const listed = new Map<string, string>();
  for (const [module, entries = []] of Object.entries(registry.violations)) {
    if (entries.some((entry, i) => i > 0 && (entries[i - 1] ?? "") >= entry))
      problems.push({
        name: `violations reaching ${module}`,
        problem: "are not sorted, or list one twice",
      });
    for (const entry of entries) listed.set(entry, module);
  }
  for (const [violation, { from, reaches, owner }] of found) {
    const under = listed.get(violation);
    if (under === undefined)
      problems.push({
        name: from.table,
        problem: `${from.via} reaches ${reaches}, owned by ${owner}, which a table of ${ownerOf(registry.tables[from.table])} may not reach`,
      });
    else if (under !== owner)
      problems.push({
        name: from.table,
        problem: `${from.via} is listed under ${under} but reaches ${owner}`,
      });
  }
  for (const [violation, module] of listed)
    if (!found.has(violation))
      problems.push({
        name: violation,
        problem: `is listed under ${module} but no longer occurs`,
      });
  return problems;
}
