import type { ExamSeries } from "@faridalms/domain/exams";
import type { HostRole } from "@faridalms/domain/hosts";
import type { SchoolPlan } from "@faridalms/domain/plans";

import { CERTIFIED_STATES } from "@faridalms/domain/hosts";
import { SQL } from "bun";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import type { HostActor } from "./hosts";

import {
  addHost,
  claimDue,
  claimHost,
  makeCanonical,
  recordCheck,
  removeHost,
  requestCheck,
  schoolHosts,
} from "./hosts";
import {
  cells,
  examSeries,
  hosts,
  schoolPlans,
  schools,
  tenants,
} from "./schema";

export interface DirectorySchool {
  schoolId: string;
  tenantId: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  cellId: string;
  appHost: string;
  /**
   * The school's own canonical host for each role once it is active, which
   * links and redirects use; null where the platform name serves it.
   */
  hosts: { portal: string | null; site: string | null };
  /** Null when the school runs on the platform's defaults. */
  plan: SchoolPlan | null;
}

/** A school's own host that routes, with what it serves. */
export interface RoutedHost {
  school: DirectorySchool;
  role: HostRole;
}

interface PlannedRow extends Omit<DirectorySchool, "plan" | "hosts"> {
  portalHost: string | null;
  siteHost: string | null;
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
  portalHost,
  siteHost,
  ...school
}: PlannedRow): DirectorySchool {
  return {
    ...school,
    hosts: { portal: portalHost, site: siteHost },
    plan: planned
      ? { poolBytes, classBytes, moduleBytes, personBytes, modules }
      : null,
  };
}

const canonicalHost = (role: HostRole) =>
  sql<
    string | null
  >`(select h.hostname from hosts h where h.school_id = ${schools.id}
    and h.role = ${role} and h.canonical and h.state = 'active')`;

// Hostnames come from requests, so the cache must not grow with whatever
// names a client makes up.
const MAX_CACHED = 10_000;

/**
 * Read access to the global directory: which tenant and cell serve a school
 * slug or a school's own host. Rows are cached for a minute, as the directory
 * changes only through the operator tool and the cells' host checks.
 */
export function openDirectory(url: string, ttlMs = 60_000) {
  const db = drizzle({
    client: new SQL({ url, max: 4, idleTimeout: 30, connectionTimeout: 10 }),
  });
  const cache = new Map<string, { at: number; value: unknown }>();
  let series: { at: number; value: ExamSeries[] } | null = null;
  const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await load();
    cache.delete(key);
    if (cache.size >= MAX_CACHED) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
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
        portalHost: canonicalHost("portal"),
        siteHost: canonicalHost("site"),
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
    /** The school a host of its own serves, once the host is active. */
    byHost: (hostname: string) =>
      cached(`host:${hostname}`, async (): Promise<RoutedHost | null> => {
        const [host] = await db
          .select({ schoolId: hosts.schoolId, role: hosts.role })
          .from(hosts)
          .where(and(eq(hosts.hostname, hostname), eq(hosts.state, "active")));
        if (!host) return null;
        const [row] = await select().where(
          and(eq(schools.id, host.schoolId), eq(schools.placement, "cell")),
        );
        return row ? { school: schoolOf(row), role: host.role } : null;
      }),
    /**
     * Whether the edge may hold a certificate for a host: one indexed lookup
     * of a verified or active host, answered from the cache when it can be.
     */
    askAllowed: (hostname: string) =>
      cached(`ask:${hostname}`, async () => {
        const [row] = await db
          .select({ hostname: hosts.hostname })
          .from(hosts)
          .where(
            and(
              eq(hosts.hostname, hostname),
              inArray(hosts.state, [...CERTIFIED_STATES]),
            ),
          );
        return row !== undefined;
      }),
    /** Drops what is cached about a host, after a check changed it here. */
    forgetHost: (hostname: string, slug?: string) => {
      cache.delete(`host:${hostname}`);
      cache.delete(`ask:${hostname}`);
      if (slug) cache.delete(`slug:${slug}`);
    },
    schoolsOfTenant: async (tenantId: string) =>
      (await select().where(eq(schools.tenantId, tenantId))).map(schoolOf),
    /**
     * The tenants a cell serves, for its background passes. One still being
     * provisioned may not exist in the cell yet, so it is left out until the
     * console marks it active.
     */
    tenantsOfCell: async (cellId: string) => {
      const rows = await db
        .selectDistinct({ tenantId: tenants.id })
        .from(tenants)
        .where(
          and(eq(tenants.cellId, cellId), ne(tenants.state, "provisioning")),
        );
      return rows.map((row) => row.tenantId);
    },
    /** The official exam sessions, kept briefly like the school lookups. */
    examSeries: async (): Promise<ExamSeries[]> => {
      if (series && Date.now() - series.at < ttlMs) return series.value;
      const value = await db
        .select({
          id: examSeries.id,
          board: examSeries.board,
          sitsIn: examSeries.sitsIn,
          keepUntil: examSeries.keepUntil,
          retired: examSeries.retired,
        })
        .from(examSeries)
        .orderBy(asc(examSeries.sitsIn), asc(examSeries.board));
      series = { at: Date.now(), value };
      return value;
    },
    forget: () => {
      cache.clear();
      series = null;
    },
    /** Liveness of the directory, for readiness probes. */
    ping: async () => {
      await db.$client`select 1`;
    },
    close: () => db.$client.close(),
  };
}

export type Directory = ReturnType<typeof openDirectory>;

/**
 * The cell's narrow write access to the directory: copying what the
 * directory shows about its schools, and its schools' own hosts as their
 * site managers bind them and its worker checks them. It can never move a
 * host to another school, and never touches plans.
 */
export function openDirectorySync(url: string, actor: HostActor) {
  const client = new SQL({
    url,
    max: 2,
    idleTimeout: 30,
    connectionTimeout: 10,
  });
  const db = drizzle({ client });
  return {
    hosts: {
      list: (schoolId: string) => schoolHosts(db, schoolId),
      add: (input: Omit<Parameters<typeof addHost>[1], "actor">) =>
        addHost(db, { ...input, actor }),
      remove: (input: Omit<Parameters<typeof removeHost>[1], "actor">) =>
        removeHost(db, { ...input, actor }),
      makeCanonical: (
        input: Omit<Parameters<typeof makeCanonical>[1], "actor">,
      ) => makeCanonical(db, { ...input, actor }),
      requestCheck: (input: Parameters<typeof requestCheck>[1]) =>
        requestCheck(db, input),
      claimDue: (input: Parameters<typeof claimDue>[1]) => claimDue(db, input),
      claim: (input: Parameters<typeof claimHost>[1]) => claimHost(db, input),
      record: (input: Omit<Parameters<typeof recordCheck>[1], "actor">) =>
        recordCheck(db, { ...input, actor }),
    },
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
