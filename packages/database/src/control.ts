import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

export function createControlDatabase(url: string) {
  return drizzle({
    client: new SQL({ url, max: 4, idleTimeout: 30, connectionTimeout: 10 }),
  });
}
export type ControlDatabase = ReturnType<typeof createControlDatabase>;
