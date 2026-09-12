import { drizzle } from "drizzle-orm/bun-sql";

import { env } from "~/env";

import { relations } from "./relations";
import * as schema from "./schema";

/**
 * One pool per process, created on first use.
 *
 * A module-level `drizzle(...)` would open a connection during import, which
 * also happens in the client build graph analysis and in unit tests that never
 * touch the database.
 */
let instance: ReturnType<typeof create> | undefined;

function create() {
  return drizzle({
    connection: { url: env.DATABASE_URL },
    // Carries the tables too, which is why `schema` is not also passed:
    // the driver overload accepts one or the other.
    //
    // Drizzle v1 dropped the `casing` option, so every multi-word column names
    // its snake_case counterpart explicitly in schema.ts.
    relations,
  });
}

export function getDb() {
  instance ??= create();
  return instance;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
