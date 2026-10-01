import type { SchoolPlan } from "@faridalms/domain/plans";

import { SQL } from "bun";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import { cells, hosts, schoolPlans, schools, tenants } from "./schema";

export interface DirectorySchool {
  schoolId: string;
  tenantId: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  cellId: string;
  appHost: string;
  /** Null when the school runs on the platform's defaults. */
  plan: SchoolPlan | null;
}

interface PlannedRow extends Omit<DirectorySchool, "plan"> {
  planned: string | null;
  poolBytes: number | null;
  classBytes: number | null;
  moduleBytes: number | null;
  personBytes: number | null;
  modules: string[] | null;
}

function schoolOf({
  planned,
  poolBytes,
  classBytes,
  moduleBytes,
  personBytes,
  modules,
  ...school
}: PlannedRow): DirectorySchool {
  return {
    ...school,
    plan: planned
      ? { poolBytes, classBytes, moduleBytes, personBytes, modules }
      : null,
  };
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
        planned: schoolPlans.schoolId,
        poolBytes: schoolPlans.poolBytes,
        classBytes: schoolPlans.classBytes,
        moduleBytes: schoolPlans.moduleBytes,
        personBytes: schoolPlans.personBytes,
        modules: schoolPlans.modules,
      })
      .from(schools)
      .innerJoin(tenants, eq(tenants.id, schools.tenantId))
      .innerJoin(cells, eq(cells.id, tenants.cellId))
      .leftJoin(schoolPlans, eq(schoolPlans.schoolId, schools.id));
  return {
    bySlug: (slug: string) =>
      cached(`slug:${slug}`, async () => {
        const [row] = await select().where(
          and(eq(schools.slug, slug), eq(schools.placement, "cell")),
        );
        return row ? schoolOf(row) : null;
      }),
    byHost: (hostname: string) =>
      cached(`host:${hostname}`, async () => {
        const [row] = await select()
          .innerJoin(hosts, eq(hosts.schoolId, schools.id))
          .where(
            and(eq(hosts.hostname, hostname), isNotNull(hosts.verifiedAt)),
          );
        return row ? schoolOf(row) : null;
      }),
    schoolsOfTenant: async (tenantId: string) =>
      (await select().where(eq(schools.tenantId, tenantId))).map(schoolOf),
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

/**
 * The cell's narrow write access to the directory: copying what the
 * directory shows about its schools, never routing or plans.
 */
export function openDirectorySync(url: string) {
  const client = new SQL({
    url,
    max: 2,
    idleTimeout: 30,
    connectionTimeout: 10,
  });
  return {
    reportUsage: async (
      rows: { schoolId: string; usedBytes: number; fileCount: number }[],
      measuredAt: Date,
    ) => {
      for (const row of rows)
        await client`
          insert into school_usage (school_id, used_bytes, file_count, measured_at)
          values (${row.schoolId}::uuid, ${row.usedBytes}, ${row.fileCount},
            ${measuredAt.toISOString()}::timestamptz)
          on conflict (school_id) do update set used_bytes = excluded.used_bytes,
            file_count = excluded.file_count, measured_at = excluded.measured_at`;
    },
    close: () => client.close(),
  };
}
export type DirectorySync = ReturnType<typeof openDirectorySync>;
