import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { relations } from "./relations";
import * as schema from "./schema";

export function createDatabase(url: string, max = 4) {
  const client = new SQL({ url, max, idleTimeout: 30, connectionTimeout: 10 });
  return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDatabase>;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export { schema };
