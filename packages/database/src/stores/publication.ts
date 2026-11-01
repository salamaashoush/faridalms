import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

/**
 * Whether a publication is out on the database's clock: published, and its
 * time has come. Published with its time still ahead is scheduled.
 */
export const liveSql = (state: SQL, publishAt: SQL): SQL =>
  sql`(${state} = 'published' and ${publishAt} <= statement_timestamp())`;

export const scheduledSql = (state: SQL, publishAt: SQL): SQL =>
  sql`(${state} = 'published' and ${publishAt} > statement_timestamp())`;
