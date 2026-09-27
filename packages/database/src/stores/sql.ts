import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

/** A `uuid[]` literal, since the driver expands a plain array into a list. */
export function uuidArray(ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`array[]::uuid[]`;
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
}

/** A timestamp as the ISO string the API returns, whatever the session time zone. */
export const isoOf = (column: SQL) =>
  sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`array[]::text[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}::text`),
    sql`, `,
  )}]`;
}

/** The first day and the day after the last of a `[a,b)` date range. */
export function bounds(range: string): { from: string; to: string | null } {
  const match = /^\[([0-9-]+),([0-9-]*)\)$/.exec(range);
  if (!match?.[1]) throw new Error(`Unexpected range ${range}`);
  return { from: match[1], to: match[2] ? match[2] : null };
}
