import type { ExamSeries } from "@faridalms/domain/exams";
import type { HostRole } from "@faridalms/domain/hosts";
import type { SchoolEntitlements } from "@faridalms/domain/plans";

import { CERTIFIED_STATES } from "@faridalms/domain/hosts";
import { SQL } from "bun";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import type { EntitlementColumns } from "./entitlements";
import type { HostActor } from "./hosts";
import type { DirectoryTenantState } from "./schema";

import { entitlementColumns, entitledOf } from "./entitlements";
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
  loginIndex,
  schoolEntitlements,
  schools,
  schoolUsage,
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
  entitlements: SchoolEntitlements;
  tenantState: DirectoryTenantState;
  /** What the cell last measured, which soft limits are held to; null before it first reports. */
  counts: {
    students: number;
    staffAccounts: number;
    emailsThisMonth: number;
  } | null;
}

/** What the school finder may say about a school. */
export interface FinderRow {
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  listed: boolean;
  /** The school's own canonical portal host once active; null where the platform name serves it. */
  portalHost: string | null;
}

/** A school's own host that routes, with what it serves. */
export interface RoutedHost {
  school: DirectorySchool;
  role: HostRole;
}

interface EntitledRow extends Omit<DirectorySchool, "entitlements" | "hosts"> {
  portalHost: string | null;
  siteHost: string | null;
  entitlements: EntitlementColumns | null;
}

function schoolOf({
  portalHost,
  siteHost,
  entitlements,
  ...school
}: EntitledRow): DirectorySchool {
  return {
    ...school,
    hosts: { portal: portalHost, site: siteHost },
    entitlements: entitledOf(entitlements),
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

/** The tenant a cached school or routed host belongs to, if it is one. */
function tenantOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  if ("tenantId" in value && typeof value.tenantId === "string")
    return value.tenantId;
  if ("school" in value) return tenantOf(value.school);
  return null;
}

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
  const seenVersions = new Map<string, number>();
  let series: { at: number; value: ExamSeries[] } | null = null;
  // Moves whenever rows are dropped, so a lookup that began before is not
  // kept: it may have read what the drop was for.
  let generation = 0;
  const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const began = generation;
    const value = await load();
    if (began !== generation) return value;
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
        entitlements: entitlementColumns,
        tenantState: tenants.state,
        counts: {
          students: schoolUsage.students,
          staffAccounts: schoolUsage.staffAccounts,
          emailsThisMonth: schoolUsage.emailsThisMonth,
        },
      })
      .from(schools)
      .innerJoin(tenants, eq(tenants.id, schools.tenantId))
      .innerJoin(cells, eq(cells.id, tenants.cellId))
      .leftJoin(schoolEntitlements, eq(schoolEntitlements.schoolId, schools.id))
      .leftJoin(schoolUsage, eq(schoolUsage.schoolId, schools.id));
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
    /**
     * Notes the entitlements version a unit of work read from the tenant's
     * cell, and drops every row held for the tenant when it is one this
     * server has not seen: the console changed what its schools may use.
     */
    observeEntitlements: (tenantId: string, version: number) => {
      if (seenVersions.get(tenantId) === version) return;
      seenVersions.set(tenantId, version);
      generation += 1;
      for (const [key, hit] of cache)
        if (tenantOf(hit.value) === tenantId) cache.delete(key);
    },
    /** Drops what is cached about a host, after a check changed it here. */
    forgetHost: (hostname: string, slug?: string) => {
      generation += 1;
      cache.delete(`host:${hostname}`);
      cache.delete(`ask:${hostname}`);
      if (slug) cache.delete(`slug:${slug}`);
    },
    /**
     * Every school a person could sign in to now, for the school finder:
     * its code, names, canonical portal host and whether it is listed, and
     * nothing else about it. Kept like the other lookups, so the finder
     * answers from memory however often it is asked.
     */
    signInSchools: () =>
      cached("sign-in-schools", async (): Promise<FinderRow[]> =>
        db
          .select({
            slug: schools.slug,
            nameEn: schools.nameEn,
            nameAr: schools.nameAr,
            listed: schools.listed,
            portalHost: canonicalHost("portal"),
          })
          .from(schools)
          .innerJoin(tenants, eq(tenants.id, schools.tenantId))
          .where(
            and(eq(schools.placement, "cell"), eq(tenants.state, "active")),
          ),
      ),
    /**
     * The tenants holding a sign-in name, by its keyed hash. Never cached,
     * so a name a school has just given works at once.
     */
    loginTenants: async (key: Uint8Array): Promise<string[]> => {
      const rows = await db
        .select({ tenantId: loginIndex.tenantId })
        .from(loginIndex)
        .innerJoin(tenants, eq(tenants.id, loginIndex.tenantId))
        .where(
          and(
            eq(loginIndex.key, Buffer.from(key)),
            eq(tenants.state, "active"),
          ),
        );
      return rows.map((row) => row.tenantId);
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
    /**
     * Makes the directory's keyed sign-in names for a tenant exactly the
     * ones given, in one transaction, so a lookup never sees half of them.
     */
    replaceLogins: (tenantId: string, keys: readonly Uint8Array[]) =>
      client.begin(async (tx) => {
        const hex = [
          ...new Set(keys.map((key) => Buffer.from(key).toString("hex"))),
        ];
        const array = `{${hex.join(",")}}`;
        await tx`
          delete from login_index where tenant_id = ${tenantId}::uuid
            and not (encode(key, 'hex') = any(${array}::text[]))`;
        if (hex.length)
          await tx`
            insert into login_index (key, tenant_id)
            select decode(k, 'hex'), ${tenantId}::uuid from unnest(${array}::text[]) k
            on conflict do nothing`;
      }),
    reportUsage: async (
      rows: ({ schoolId: string; usedBytes: number; fileCount: number } & {
        students: number;
        staffAccounts: number;
        signedIn7d: number;
        signedIn30d: number;
        videoMinutes: number;
        emailsThisMonth: number;
        days: { day: string; emails: number; sms: number; signIns: number }[];
      })[],
      measuredAt: Date,
    ) => {
      for (const row of rows) {
        await client`
          insert into school_usage (school_id, used_bytes, file_count, students, staff_accounts,
            signed_in_7d, signed_in_30d, video_minutes, emails_this_month, measured_at)
          values (${row.schoolId}::uuid, ${row.usedBytes}, ${row.fileCount}, ${row.students},
            ${row.staffAccounts}, ${row.signedIn7d}, ${row.signedIn30d}, ${row.videoMinutes},
            ${row.emailsThisMonth}, ${measuredAt.toISOString()}::timestamptz)
          on conflict (school_id) do update set used_bytes = excluded.used_bytes,
            file_count = excluded.file_count, students = excluded.students,
            staff_accounts = excluded.staff_accounts, signed_in_7d = excluded.signed_in_7d,
            signed_in_30d = excluded.signed_in_30d, video_minutes = excluded.video_minutes,
            emails_this_month = excluded.emails_this_month, measured_at = excluded.measured_at`;
        for (const day of row.days)
          await client`
            insert into school_usage_daily (school_id, day, emails, sms, sign_ins, measured_at)
            values (${row.schoolId}::uuid, ${day.day}::date, ${day.emails}, ${day.sms},
              ${day.signIns}, ${measuredAt.toISOString()}::timestamptz)
            on conflict (school_id, day) do update set emails = excluded.emails,
              sms = excluded.sms, sign_ins = excluded.sign_ins, measured_at = excluded.measured_at`;
      }
    },
    close: () => client.close(),
  };
}
export type DirectorySync = ReturnType<typeof openDirectorySync>;
