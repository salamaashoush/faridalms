import type { SQL } from "drizzle-orm";
import type { PgColumn, PgPolicyToOption } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  integer,
  jsonb,
  pgPolicy,
  pgRole,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const core = pgSchema("core").existing();
export const health = pgSchema("health").existing();
export const audit = pgSchema("audit").existing();
export const ops = pgSchema("ops").existing();

export const roles = {
  cellOwner: pgRole("cell_owner").existing(),
  app: pgRole("app").existing(),
  site: pgRole("site").existing(),
  integration: pgRole("integration").existing(),
  worker: pgRole("worker").existing(),
  collab: pgRole("collab").existing(),
  cellIo: pgRole("cell_io").existing(),
  retention: pgRole("retention").existing(),
};

/** A half-open `[lower,upper)` range in Postgres text form. */
export const daterange = customType<{ data: string; driverData: string }>({
  dataType: () => "daterange",
});

/** Whole numbers as a set of half-open ranges, in Postgres text form. */
export const int4multirange = customType<{ data: string; driverData: string }>({
  dataType: () => "int4multirange",
});

export const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

export const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

const NAMEDATALEN = 64;

/**
 * Postgres' `makeObjectName`: the default name it gives a constraint or index,
 * truncating the two parts in turn until the whole fits in 63 bytes. Names are
 * part of the API (errors map from them), so they follow Postgres exactly.
 */
export function makeObjectName(
  name1: string,
  name2: string | null,
  label: string | null,
): string {
  let name1chars = name1.length;
  let name2chars = name2?.length ?? 0;
  const overhead = (name2 ? 1 : 0) + (label ? label.length + 1 : 0);
  const available = NAMEDATALEN - 1 - overhead;
  while (name1chars + name2chars > available) {
    if (name1chars > name2chars) name1chars -= 1;
    else name2chars -= 1;
  }
  let result = name1.slice(0, name1chars);
  if (name2) result += `_${name2.slice(0, name2chars)}`;
  if (label) result += `_${label}`;
  return result;
}

/** Postgres' `ChooseForeignKeyConstraintNameAddition` and `ChooseIndexNameAddition`. */
function columnAddition(columns: readonly string[]): string {
  let buffer = "";
  for (const column of columns) {
    if (buffer.length > 0) buffer += "_";
    buffer += column.slice(0, NAMEDATALEN - 1);
    if (buffer.length >= NAMEDATALEN) break;
  }
  return buffer;
}

type Column = PgColumn | { name: string };

const names = (columns: readonly Column[]) =>
  columns.map((column) => column.name);

export function fk(
  table: string,
  columns: [Column, ...Column[]],
  foreignColumns: [Column, ...Column[]],
  suffix = "",
) {
  return foreignKey({
    name: makeObjectName(
      table,
      columnAddition(names(columns)),
      `fkey${suffix}`,
    ),
    columns: columns as [PgColumn, ...PgColumn[]],
    foreignColumns: foreignColumns as [PgColumn, ...PgColumn[]],
  });
}

export function uq(table: string, ...columns: [PgColumn, ...PgColumn[]]) {
  return unique(
    makeObjectName(table, columnAddition(names(columns)), "key"),
  ).on(...columns);
}

export function pk(table: string, ...columns: [PgColumn, ...PgColumn[]]) {
  return primaryKey({ name: `${table}_pkey`, columns });
}

/** A column check, named as Postgres names an inline `check` on that column. */
export function ck(table: string, column: string, condition: SQL) {
  return check(makeObjectName(table, column, "check"), condition);
}

export const tenantColumns = () => ({
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
});

export const entityColumns = () => ({
  status: text("status").notNull().default("active"),
  dateLastModified: instant("date_last_modified")
    .notNull()
    .default(sql`statement_timestamp()`),
  version: integer("version").notNull().default(1),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`),
});

interface EntityShape {
  tenantId: PgColumn;
  status: PgColumn;
  version: PgColumn;
  metadata: PgColumn;
}

/** The tenant reference and the checks of the base columns (section 4.4). */
export function baseConstraints(
  table: string,
  t: EntityShape,
  tenants: { tenantId: PgColumn },
) {
  return [
    fk(table, [t.tenantId], [tenants.tenantId]),
    ck(table, "status", sql`status in ('active', 'tobedeleted')`),
    ck(table, "version", sql`version > 0`),
    ck(
      table,
      "metadata",
      sql`jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384`,
    ),
  ];
}

export const range = {
  /** Bounded, non-empty and half-open: sessions, weeks, placements. */
  bounded: (column: string) => {
    const c = sql.identifier(column);
    return sql`not isempty(${c}) and not lower_inf(${c}) and not upper_inf(${c}) and lower_inc(${c}) and not upper_inc(${c})`;
  },
  /** Non-empty, half-open, with an open end allowed: roles, relationships. */
  started: (column: string) => {
    const c = sql.identifier(column);
    return sql`not isempty(${c}) and not lower_inf(${c}) and lower_inc(${c}) and not upper_inc(${c})`;
  },
};

const tenantMatch = sql`tenant_id = (select app.tenant_id())`;
const everyone: PgPolicyToOption = "public";

/** Section 5: every table in `core`, `audit` and `health`. */
export function isolation() {
  return [
    pgPolicy("tenant_isolation", {
      as: "restrictive",
      for: "all",
      to: everyone,
      using: tenantMatch,
      withCheck: tenantMatch,
    }),
    pgPolicy("owner_all", {
      for: "all",
      to: roles.cellOwner,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ];
}

const purposeSetTo = {
  health: sql`(select current_setting('app.purpose', true)) = 'health'`,
  demographics: sql`(select current_setting('app.purpose', true)) = 'demographics'`,
  custody: sql`(select current_setting('app.purpose', true)) = 'custody'`,
};

export function purposeGate(purpose: keyof typeof purposeSetTo) {
  return pgPolicy("purpose_gate", {
    as: "restrictive",
    for: "all",
    to: everyone,
    using: purposeSetTo[purpose],
    withCheck: purposeSetTo[purpose],
  });
}

export function integrationRead() {
  return pgPolicy("p_integration_select", {
    for: "select",
    to: roles.integration,
    using: sql`true`,
  });
}

const read = [roles.app, roles.worker, roles.cellIo, roles.retention];
const write = [roles.app, roles.worker, roles.cellIo];

export function entityProfile(
  options: {
    integration?: boolean;
    insert?: typeof write;
    update?: typeof write;
  } = {},
) {
  return [
    ...isolation(),
    pgPolicy("p_select", { for: "select", to: read, using: sql`true` }),
    pgPolicy("p_insert", {
      for: "insert",
      to: options.insert ?? write,
      withCheck: sql`true`,
    }),
    pgPolicy("p_update", {
      for: "update",
      to: options.update ?? write,
      using: sql`true`,
      withCheck: sql`true`,
    }),
    ...(options.integration ? [integrationRead()] : []),
  ];
}

export function ledgerProfile(
  options: { integration?: boolean; insert?: typeof write } = {},
) {
  return [
    ...isolation(),
    pgPolicy("p_select", { for: "select", to: read, using: sql`true` }),
    pgPolicy("p_insert", {
      for: "insert",
      to: options.insert ?? write,
      withCheck: sql`true`,
    }),
    ...(options.integration ? [integrationRead()] : []),
  ];
}

export function ephemeralProfile(expiry: SQL) {
  return [
    ...isolation(),
    pgPolicy("p_select", {
      for: "select",
      to: [roles.app, roles.worker, roles.retention],
      using: sql`true`,
    }),
    pgPolicy("p_insert", {
      for: "insert",
      to: [roles.app, roles.worker],
      withCheck: sql`true`,
    }),
    pgPolicy("p_update", {
      for: "update",
      to: [roles.app, roles.worker],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy("p_delete", { for: "delete", to: roles.retention, using: expiry }),
  ];
}

/** Erase: tombstone and null the personal columns; the row stays. */
export function erase(who: SQL) {
  return [
    pgPolicy("p_erase_update", {
      for: "update",
      to: roles.retention,
      using: who,
      withCheck: sql`status = 'tobedeleted'`,
    }),
  ];
}

/** Erase and delete: as erase, then remove the tombstoned row. */
export function eraseAndDelete(who: SQL) {
  return [
    ...erase(who),
    pgPolicy("p_erase_delete", {
      for: "delete",
      to: roles.retention,
      using: sql`status = 'tobedeleted' and (${who})`,
    }),
  ];
}

/**
 * Erase by emptying: a ledger row that stays for what the school counts
 * from it, with whatever the person wrote in it gone. The table says with
 * a check what a row with `redacted_at` set no longer holds.
 */
export function redact(who: SQL) {
  return [
    pgPolicy("p_erase_update", {
      for: "update",
      to: roles.retention,
      using: who,
      withCheck: sql`redacted_at is not null`,
    }),
  ];
}

/** Erase by removing: a ledger row that is only about the person. */
export function eraseLedger(who: SQL) {
  return [
    pgPolicy("p_erase_delete", {
      for: "delete",
      to: roles.retention,
      using: who,
    }),
  ];
}

export const erasureOf = (column: string) =>
  sql`app.erasure_approved(tenant_id, ${sql.identifier(column)})`;

export const erasureListed = (type: "file" | "document", column: string) => {
  const kind = {
    file: sql`'file'`,
    document: sql`'document'`,
  }[type];
  return sql`app.erasure_listed(tenant_id, ${kind}, ${sql.identifier(column)})`;
};

/** `<holder erased>`: rows owned through an account. */
export const holderErased = (table: string) => {
  const t = sql.identifier(table);
  return sql`exists (select 1 from core.accounts a where a.tenant_id = ${t}.tenant_id and a.id = ${t}.account_id and app.erasure_approved(a.tenant_id, a.user_id))`;
};
