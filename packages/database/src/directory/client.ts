import { SQL } from "bun";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import { cells, hosts, schools, tenants } from "./schema";

export interface DirectorySchool {
  schoolId: string;
  tenantId: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  cellId: string;
  appHost: string;
}

/**
 * Read access to the global directory: which tenant and cell serve a school
 * slug or a school's own host. Rows are cached for a minute, as the directory
 * changes only through the operator tool.
 */
export function openDirectory(url: string, ttlMs = 60_000) {
  const db = drizzle({
    client: new SQL({ url, max: 4, idleTimeout: 30, connectionTimeout: 10 }),
  });
  const cache = new Map<
    string,
    { at: number; value: DirectorySchool | null }
  >();
  const cached = async (
    key: string,
    load: () => Promise<DirectorySchool | null>,
  ) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  const select = () =>
    db
      .select({
        schoolId: schools.id,
        tenantId: schools.tenantId,
        slug: schools.slug,
        nameEn: schools.nameEn,
        nameAr: schools.nameAr,
        cellId: tenants.cellId,
        appHost: cells.appHost,
      })
      .from(schools)
      .innerJoin(tenants, eq(tenants.id, schools.tenantId))
      .innerJoin(cells, eq(cells.id, tenants.cellId));
  return {
    bySlug: (slug: string) =>
      cached(`slug:${slug}`, async () => {
        const [row] = await select().where(
          and(eq(schools.slug, slug), eq(schools.placement, "cell")),
        );
        return row ?? null;
      }),
    byHost: (hostname: string) =>
      cached(`host:${hostname}`, async () => {
        const [row] = await select()
          .innerJoin(hosts, eq(hosts.schoolId, schools.id))
          .where(
            and(eq(hosts.hostname, hostname), isNotNull(hosts.verifiedAt)),
          );
        return row ?? null;
      }),
    schoolsOfTenant: async (tenantId: string) =>
      select().where(eq(schools.tenantId, tenantId)),
    /** The tenants a cell serves, for its background passes. */
    tenantsOfCell: async (cellId: string) => {
      const rows = await db
        .selectDistinct({ tenantId: tenants.id })
        .from(tenants)
        .where(eq(tenants.cellId, cellId));
      return rows.map((row) => row.tenantId);
    },
    forget: () => cache.clear(),
    close: () => db.$client.close(),
  };
}

export type Directory = ReturnType<typeof openDirectory>;
