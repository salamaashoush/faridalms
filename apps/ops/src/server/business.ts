import type { BusinessDb } from "@faridalms/database/business/client";

import { openBusiness } from "@faridalms/database/business/client";

import { opsEnv } from "./env";

let opened: ReturnType<typeof openBusiness> | null = null;

/** The business database, or null where the console runs without one. */
export function businessDb(): BusinessDb | null {
  const url = opsEnv().BUSINESS_DATABASE_URL;
  if (!url) return null;
  opened ??= openBusiness(url);
  return opened.db;
}

/** The business database, for what the console offers only with one. */
export function requireBusiness(): BusinessDb {
  const db = businessDb();
  if (!db) throw new Error("NO_BUSINESS");
  return db;
}
