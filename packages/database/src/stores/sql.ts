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

/** Text matched literally inside a LIKE pattern, its wildcards escaped. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/gu, "\\$&");

/**
 * Whether any of the columns holds what someone typed, read the way people
 * search: case, the forms of alef, yeh and teh marbuta, and vowel marks are
 * folded on both sides, and the typed text is taken literally. Nothing
 * typed matches everything.
 */
export function holds(typed: string, columns: readonly SQL[]): SQL {
  const words = typed.trim();
  if (!words || columns.length === 0) return sql`true`;
  const needle = sql`'%' || app.normalize_name(${escapeLike(words)}) || '%'`;
  return sql`(${sql.join(
    columns.map((column) => sql`app.normalize_name(${column}) like ${needle}`),
    sql` or `,
  )})`;
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

export function intArray(values: readonly number[]): SQL {
  if (values.length === 0) return sql`array[]::int[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}::int`),
    sql`, `,
  )}]`;
}

/** The first day and the day after the last of a `[a,b)` date range. */
export function bounds(range: string): { from: string; to: string | null } {
  const match = /^\[([0-9-]+),([0-9-]*)\)$/.exec(range);
  if (!match?.[1]) throw new Error(`Unexpected range ${range}`);
  return { from: match[1], to: match[2] ? match[2] : null };
}
