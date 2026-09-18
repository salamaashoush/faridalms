import type { Database } from "@faridalms/database";

import { schools } from "@faridalms/database/control-schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { ApiContext } from "./context";

type School = typeof schools.$inferSelect;

/**
 * The public site has no session, so the school comes from the URL. The lease
 * is released whether the handler returns or throws, like `authenticate`.
 */
export async function withPublicSchool<T>(
  context: ApiContext,
  slug: string,
  handler: (db: Database, school: School) => Promise<T>,
): Promise<T> {
  const [school] = await context.control
    .select()
    .from(schools)
    .where(and(eq(schools.slug, slug), eq(schools.isActive, true)));
  if (!school) throw new ORPCError("NOT_FOUND");
  const lease = await context.pools.acquire(school);
  try {
    return await handler(lease.db, school);
  } finally {
    lease.release();
  }
}

export async function schoolForHost(
  context: ApiContext,
  host: string,
): Promise<{ slug: string; name: string } | null> {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) return null;
  const [school] = await context.control
    .select({ slug: schools.slug, name: schools.name })
    .from(schools)
    .where(and(eq(schools.publicDomain, hostname), eq(schools.isActive, true)));
  return school ?? null;
}
