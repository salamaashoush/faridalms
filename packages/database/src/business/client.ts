import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

/**
 * The business database as the operator console reaches it, as
 * `business_admin`. Nothing else connects to it.
 */
export function openBusiness(url: string) {
  const client = new SQL({
    url,
    max: 4,
    idleTimeout: 30,
    connectionTimeout: 10,
  });
  const db = drizzle({ client });
  return { db, close: () => client.close() };
}

export type BusinessDb = ReturnType<typeof openBusiness>["db"];
export type BusinessTx = Parameters<
  Parameters<BusinessDb["transaction"]>[0]
>[0];
