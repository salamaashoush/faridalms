import type { ModuleId } from "@faridalms/domain/modules";
import type { OperatorItem } from "@faridalms/domain/onboarding";
import type {
  EntitlementsInput,
  SchoolAccess,
  SchoolEntitlements,
} from "@faridalms/domain/plans";

import { SQL } from "bun";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import type { JsonValue } from "../json";
import type { EntitlementColumns } from "./entitlements";
import type { DirectoryTenantState } from "./schema";

import { escapeLike } from "../stores/sql";
import { entitlementColumns, entitledOf } from "./entitlements";
import {
  addHost,
  makeCanonical,
  removeHost,
  requestCheck,
  schoolHosts,
} from "./hosts";
import {
  cells,
  changes,
  hosts,
  moduleOffers,
  schoolEntitlements,
  schoolOnboarding,
  schools,
  schoolUsage,
  ssoDomains,
  tenants,
} from "./schema";

export interface OperatorSchool {
  id: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  placement: "legacy" | "cell";
  tenantId: string;
  tenantKind: "school_group" | "school";
  tenantState: DirectoryTenantState;
  tenantNameEn: string | null;
  tenantNameAr: string | null;
  /** The countries the tenant's data is held under; the first is its own. */
  tenantJurisdictions: string[];
  cellId: string;
  region: string;
  entitlements: SchoolEntitlements;
  createdAt: string;
  usage: {
    usedBytes: number;
    fileCount: number;
    students: number;
    staffAccounts: number;
    signedIn7d: number;
    signedIn30d: number;
    videoMinutes: number;
    schoolDays7d: number;
    failedDeliveries1d: number;
    /** What each module counts at the school, by its key. */
    facts: Record<string, number>;
    measuredAt: string;
  } | null;
}

export type { JsonValue };

export interface Change {
  id: string;
  occurredAt: string;
  actor: string;
  subjectType: (typeof changes.$inferSelect)["subjectType"];
  subjectId: string;
  action: string;
  before: JsonValue;
  after: JsonValue;
  reason: string;
}

/** A change in the whole log, with the school or tenant a host's or domain's change belongs to. */
export interface LoggedChange extends Change {
  schoolId: string | null;
  tenantId: string | null;
}

export interface ChangeLogFilter {
  actions?: readonly string[];
  actors?: readonly string[];
  since?: Date;
  /** Matched in the reason and the subject's own id, such as a hostname. */
  words?: string;
  /**
   * Records whose names the words matched, which the log cannot see: their
   * changes match too, and so do those of their hosts and sign-in domains.
   */
  named?: {
    schools: readonly string[];
    tenants: readonly string[];
    subjects: readonly string[];
  };
  offset: number;
  limit: number;
}

export interface ChangeLogPage {
  changes: LoggedChange[];
  /** How many changes the filter matches across every page. */
  total: number;
}

export interface OpenCell {
  id: string;
  region: string;
  appHost: string;
}

/** A tenant the console is creating, with the ids it chose for it. */
export interface NewTenant {
  tenantId: string;
  kind: "school_group" | "school";
  nameEn: string | null;
  nameAr: string | null;
  cellId: string;
  jurisdictions: string[];
  schools: {
    id: string;
    slug: string;
    nameEn: string | null;
    nameAr: string | null;
  }[];
  entitlements: EntitlementsInput;
  operatorId: string;
}

/**
 * Some of the addresses asked for already name a school. `pending` says they
 * belong to a tenant still being created whose details differ from the
 * request, rather than to a school in use.
 */
export class SlugTakenError extends Error {
  constructor(
    readonly slugs: string[],
    readonly pending = false,
  ) {
    super("school.slug_taken");
    this.name = "SlugTakenError";
  }
}

const isSlugConflict = (error: unknown) => {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== "object") return false;
    const candidate = current as { errno?: string; constraint?: string };
    if (candidate.errno === "23505")
      return candidate.constraint === "schools_slug_key";
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

interface SchoolRow {
  id: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  placement: "legacy" | "cell";
  tenantId: string;
  tenantKind: "school_group" | "school";
  tenantState: DirectoryTenantState;
  tenantNameEn: string | null;
  tenantNameAr: string | null;
  tenantJurisdictions: string[];
  cellId: string;
  region: string;
  entitlements: EntitlementColumns | null;
  usedBytes: number | null;
  fileCount: number | null;
  students: number | null;
  staffAccounts: number | null;
  signedIn7d: number | null;
  signedIn30d: number | null;
  videoMinutes: number | null;
  schoolDays7d: number | null;
  failedDeliveries1d: number | null;
  facts: Record<string, number> | null;
  measuredAt: Date | null;
  createdAt: Date;
}

function schoolOf(row: SchoolRow): OperatorSchool {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    placement: row.placement,
    tenantId: row.tenantId,
    tenantKind: row.tenantKind,
    tenantState: row.tenantState,
    tenantNameEn: row.tenantNameEn,
    tenantNameAr: row.tenantNameAr,
    tenantJurisdictions: row.tenantJurisdictions,
    cellId: row.cellId,
    region: row.region,
    entitlements: entitledOf(row.entitlements),
    createdAt: row.createdAt.toISOString(),
    usage:
      row.usedBytes !== null && row.fileCount !== null && row.measuredAt
        ? {
            usedBytes: row.usedBytes,
            fileCount: row.fileCount,
            students: row.students ?? 0,
            staffAccounts: row.staffAccounts ?? 0,
            signedIn7d: row.signedIn7d ?? 0,
            signedIn30d: row.signedIn30d ?? 0,
            videoMinutes: row.videoMinutes ?? 0,
            schoolDays7d: row.schoolDays7d ?? 0,
            failedDeliveries1d: row.failedDeliveries1d ?? 0,
            facts: row.facts ?? {},
            measuredAt: row.measuredAt.toISOString(),
          }
        : null,
  };
}

/**
 * The operator console's access to the directory, as `directory_admin`.
 * Every change it makes writes a `changes` row in the same transaction,
 * naming the operator by an opaque id and the reason they gave.
 */
export function openDirectoryAdmin(url: string) {
  const db = drizzle({
    client: new SQL({ url, max: 4, idleTimeout: 30, connectionTimeout: 10 }),
  });
  const select = () =>
    db
      .select({
        id: schools.id,
        slug: schools.slug,
        nameEn: schools.nameEn,
        nameAr: schools.nameAr,
        placement: schools.placement,
        tenantId: tenants.id,
        tenantKind: tenants.kind,
        tenantState: tenants.state,
        tenantNameEn: tenants.nameEn,
        tenantNameAr: tenants.nameAr,
        tenantJurisdictions: tenants.jurisdictions,
        cellId: cells.id,
        region: cells.region,
        entitlements: entitlementColumns,
        usedBytes: schoolUsage.usedBytes,
        fileCount: schoolUsage.fileCount,
        students: schoolUsage.students,
        staffAccounts: schoolUsage.staffAccounts,
        signedIn7d: schoolUsage.signedIn7d,
        signedIn30d: schoolUsage.signedIn30d,
        videoMinutes: schoolUsage.videoMinutes,
        schoolDays7d: schoolUsage.schoolDays7d,
        failedDeliveries1d: schoolUsage.failedDeliveries1d,
        facts: schoolUsage.facts,
        measuredAt: schoolUsage.measuredAt,
        createdAt: schools.createdAt,
      })
      .from(schools)
      .innerJoin(tenants, eq(tenants.id, schools.tenantId))
      .innerJoin(cells, eq(cells.id, tenants.cellId))
      .leftJoin(schoolEntitlements, eq(schoolEntitlements.schoolId, schools.id))
      .leftJoin(schoolUsage, eq(schoolUsage.schoolId, schools.id));
  return {
    schools: async () => (await select().orderBy(schools.slug)).map(schoolOf),
    school: async (id: string) => {
      const [row] = await select().where(eq(schools.id, id));
      return row ? schoolOf(row) : null;
    },
    /**
     * Sets what a school is entitled to. Access is the lifecycle's and
     * stays as it is; each save takes the next revision.
     */
    saveEntitlements: async (input: {
      schoolId: string;
      entitlements: EntitlementsInput;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select(entitlementColumns)
          .from(schoolEntitlements)
          .where(eq(schoolEntitlements.schoolId, input.schoolId))
          .for("update");
        const [saved] = await tx
          .insert(schoolEntitlements)
          .values({ schoolId: input.schoolId, ...input.entitlements })
          .onConflictDoUpdate({
            target: schoolEntitlements.schoolId,
            set: {
              ...input.entitlements,
              revision: sql`${schoolEntitlements.revision} + 1`,
              updatedAt: new Date(),
            },
          })
          .returning({ revision: schoolEntitlements.revision });
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "school",
          subjectId: input.schoolId,
          action: "entitlements.update",
          before: before ?? null,
          after: { ...input.entitlements, revision: saved?.revision ?? 1 },
          reason: input.reason,
        });
      }),
    /** The modules the operator has decided on, each with whether it is on offer and since when. */
    offers: () =>
      db
        .select({
          module: moduleOffers.module,
          offered: moduleOffers.offered,
          updatedAt: moduleOffers.updatedAt,
        })
        .from(moduleOffers),
    /**
     * Puts a module on offer to schools that do not have it, or takes it
     * off; false when it already stood that way.
     */
    setOffer: (input: {
      module: ModuleId;
      offered: boolean;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ offered: moduleOffers.offered })
          .from(moduleOffers)
          .where(eq(moduleOffers.module, input.module))
          .for("update");
        if ((before?.offered ?? true) === input.offered) return false;
        await tx
          .insert(moduleOffers)
          .values({ module: input.module, offered: input.offered })
          .onConflictDoUpdate({
            target: moduleOffers.module,
            set: { offered: input.offered, updatedAt: new Date() },
          });
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "module",
          subjectId: input.module,
          action: input.offered ? "module.offer" : "module.withdraw",
          before: { offered: before?.offered ?? true },
          after: { offered: input.offered },
          reason: input.reason,
        });
        return true;
      }),
    /** Every school's onboarding steps, each with the day it was first taken. */
    onboarding: () =>
      db
        .select({
          schoolId: schoolOnboarding.schoolId,
          item: schoolOnboarding.item,
          reachedAt: schoolOnboarding.reachedAt,
          operatorId: schoolOnboarding.operatorId,
        })
        .from(schoolOnboarding),
    /**
     * Ticks or unticks a step only an operator can see taken, logged with
     * the operator; false when it already stood that way.
     */
    markOnboarding: (input: {
      schoolId: string;
      item: OperatorItem;
      done: boolean;
      operatorId: string;
    }) =>
      db.transaction(async (tx) => {
        const changed = input.done
          ? await tx
              .insert(schoolOnboarding)
              .values({
                schoolId: input.schoolId,
                item: input.item,
                reachedAt: new Date(),
                operatorId: input.operatorId,
              })
              .onConflictDoNothing()
              .returning({ item: schoolOnboarding.item })
          : await tx
              .delete(schoolOnboarding)
              .where(
                and(
                  eq(schoolOnboarding.schoolId, input.schoolId),
                  eq(schoolOnboarding.item, input.item),
                ),
              )
              .returning({ item: schoolOnboarding.item });
        if (changed.length === 0) return false;
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "school",
          subjectId: input.schoolId,
          action: input.done ? "onboarding.done" : "onboarding.undone",
          before: null,
          after: { item: input.item },
          reason: input.done ? "Ticked off" : "Ticked in error",
        });
        return true;
      }),
    /** Notes a step the console's billing sees taken, from the day it was. */
    reachOnboarding: async (input: {
      schoolIds: readonly string[];
      item: "first_invoice_paid";
      at: Date;
    }) => {
      if (input.schoolIds.length === 0) return;
      await db
        .insert(schoolOnboarding)
        .values(
          input.schoolIds.map((schoolId) => ({
            schoolId,
            item: input.item,
            reachedAt: input.at,
          })),
        )
        .onConflictDoNothing();
    },
    /** The schools with a host of their own whose records the checks no longer find. */
    failingHosts: async (): Promise<Set<string>> =>
      new Set(
        (
          await db
            .selectDistinct({ schoolId: hosts.schoolId })
            .from(hosts)
            .where(eq(hosts.state, "failing"))
        ).map((row) => row.schoolId),
      ),
    /** The cells open for new tenants. */
    openCells: async (): Promise<OpenCell[]> =>
      db
        .select({ id: cells.id, region: cells.region, appHost: cells.appHost })
        .from(cells)
        .where(eq(cells.state, "open"))
        .orderBy(asc(cells.id)),
    /**
     * Writes a new tenant and its schools as provisioning, before its cell
     * creates them. Asked again with the same addresses while the tenant is
     * still provisioning, it keeps the ids it gave the first time and takes
     * the new names, so a failed attempt can be retried as it was.
     */
    beginTenant: async (
      input: NewTenant,
    ): Promise<{ tenantId: string; schoolIds: string[]; retry: boolean }> => {
      const slugs = input.schools.map((school) => school.slug);
      try {
        return await db.transaction(async (tx) => {
          const [cell] = await tx
            .select({ state: cells.state })
            .from(cells)
            .where(eq(cells.id, input.cellId));
          if (cell?.state !== "open") throw new Error("cell.not_open");
          const held = await tx
            .select({
              slug: schools.slug,
              schoolId: schools.id,
              tenantId: tenants.id,
              state: tenants.state,
              kind: tenants.kind,
              cellId: tenants.cellId,
            })
            .from(schools)
            .innerJoin(tenants, eq(tenants.id, schools.tenantId))
            .where(inArray(schools.slug, slugs))
            .for("update");
          const entitle = async (schoolIds: string[]) => {
            await tx
              .insert(schoolEntitlements)
              .values(
                schoolIds.map((schoolId) => ({
                  schoolId,
                  ...input.entitlements,
                })),
              )
              .onConflictDoUpdate({
                target: schoolEntitlements.schoolId,
                set: { ...input.entitlements, updatedAt: new Date() },
              });
          };
          const after = {
            kind: input.kind,
            cellId: input.cellId,
            schools: slugs,
            entitlements: input.entitlements,
          };
          if (held.length === 0) {
            await tx.insert(tenants).values({
              id: input.tenantId,
              kind: input.kind,
              nameEn: input.nameEn,
              nameAr: input.nameAr,
              cellId: input.cellId,
              jurisdictions: input.jurisdictions,
              state: "provisioning",
            });
            await tx.insert(schools).values(
              input.schools.map((school) => ({
                id: school.id,
                tenantId: input.tenantId,
                slug: school.slug,
                nameEn: school.nameEn,
                nameAr: school.nameAr,
                placement: "cell" as const,
              })),
            );
            await entitle(input.schools.map((school) => school.id));
            await tx.insert(changes).values({
              actor: `operator:${input.operatorId}`,
              subjectType: "tenant",
              subjectId: input.tenantId,
              action: "tenant.create",
              before: null,
              after,
              reason: "Created in the operator console",
            });
            return {
              tenantId: input.tenantId,
              schoolIds: input.schools.map((school) => school.id),
              retry: false,
            };
          }
          const first = held[0];
          const ours =
            first !== undefined &&
            first.state === "provisioning" &&
            held.every((row) => row.tenantId === first.tenantId);
          if (!first || !ours)
            throw new SlugTakenError(held.map((row) => row.slug));
          const all = await tx
            .select({ id: schools.id, slug: schools.slug })
            .from(schools)
            .where(eq(schools.tenantId, first.tenantId));
          const bySlug = new Map(all.map((row) => [row.slug, row.id]));
          const schoolIds = slugs.map((slug) => bySlug.get(slug));
          if (
            first.kind !== input.kind ||
            first.cellId !== input.cellId ||
            all.length !== slugs.length ||
            schoolIds.some((id) => id === undefined)
          )
            throw new SlugTakenError(
              held.map((row) => row.slug),
              true,
            );
          const ids = schoolIds.filter((id): id is string => id !== undefined);
          await tx
            .update(tenants)
            .set({
              nameEn: input.nameEn,
              nameAr: input.nameAr,
              jurisdictions: input.jurisdictions,
              updatedAt: new Date(),
            })
            .where(eq(tenants.id, first.tenantId));
          for (const [index, school] of input.schools.entries()) {
            const id = ids[index];
            if (id)
              await tx
                .update(schools)
                .set({
                  nameEn: school.nameEn,
                  nameAr: school.nameAr,
                  updatedAt: new Date(),
                })
                .where(eq(schools.id, id));
          }
          await entitle(ids);
          await tx.insert(changes).values({
            actor: `operator:${input.operatorId}`,
            subjectType: "tenant",
            subjectId: first.tenantId,
            action: "tenant.retry",
            before: null,
            after,
            reason: "Retried in the operator console",
          });
          return { tenantId: first.tenantId, schoolIds: ids, retry: true };
        });
      } catch (error) {
        // Two consoles creating the same address at once: the second loses.
        if (isSlugConflict(error)) throw new SlugTakenError(slugs);
        throw error;
      }
    },
    /** Marks a tenant active once its cell has created it. */
    activateTenant: async (input: { tenantId: string; operatorId: string }) =>
      db.transaction(async (tx) => {
        const updated = await tx
          .update(tenants)
          .set({ state: "active", updatedAt: new Date() })
          .where(
            and(
              eq(tenants.id, input.tenantId),
              eq(tenants.state, "provisioning"),
            ),
          )
          .returning({ id: tenants.id });
        if (updated.length === 0) return false;
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "tenant",
          subjectId: input.tenantId,
          action: "tenant.activate",
          before: { state: "provisioning" },
          after: { state: "active" },
          reason: "Its cell created the tenant and emailed its administrator",
        });
        return true;
      }),
    /**
     * Records a tenant paused, suspended or reopened, after its cell has
     * moved it: the tenant's state, and its schools' access, which the
     * portal reads to explain it.
     */
    setTenantState: async (input: {
      tenantId: string;
      state: "active" | "read_only" | "suspended";
      access: SchoolAccess;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ state: tenants.state })
          .from(tenants)
          .where(eq(tenants.id, input.tenantId))
          .for("update");
        if (!before) return false;
        await tx
          .update(tenants)
          .set({ state: input.state, updatedAt: new Date() })
          .where(eq(tenants.id, input.tenantId));
        await tx
          .update(schoolEntitlements)
          .set({
            access: input.access,
            revision: sql`${schoolEntitlements.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              schoolEntitlements.schoolId,
              tx
                .select({ id: schools.id })
                .from(schools)
                .where(eq(schools.tenantId, input.tenantId)),
            ),
          );
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "tenant",
          subjectId: input.tenantId,
          action: "tenant.lifecycle",
          before: { state: before.state },
          after: { state: input.state, access: input.access },
          reason: input.reason,
        });
        return true;
      }),
    /** A school's own hosts, as the console lists them. */
    hosts: (schoolId: string) => schoolHosts(db, schoolId),
    /** The domains a tenant's people sign in with through its identity provider. */
    ssoDomains: (tenantId: string) =>
      db
        .select({
          domain: ssoDomains.domain,
          verificationMethod: ssoDomains.verificationMethod,
          verifiedAt: ssoDomains.verifiedAt,
        })
        .from(ssoDomains)
        .where(eq(ssoDomains.tenantId, tenantId))
        .orderBy(asc(ssoDomains.domain)),
    /**
     * Records a domain a tenant's people sign in with, unverified until its
     * DNS record is found. Answers false when another tenant holds it.
     */
    addSsoDomain: (input: {
      tenantId: string;
      domain: string;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const [held] = await tx
          .select({ tenantId: ssoDomains.tenantId })
          .from(ssoDomains)
          .where(eq(ssoDomains.domain, input.domain));
        if (held) return held.tenantId === input.tenantId;
        await tx.insert(ssoDomains).values({
          domain: input.domain,
          tenantId: input.tenantId,
          verificationMethod: "dns_txt",
        });
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "sso_domain",
          subjectId: input.domain,
          action: "sso_domain.add",
          before: null,
          after: { tenantId: input.tenantId, verificationMethod: "dns_txt" },
          reason: input.reason,
        });
        return true;
      }),
    addHost: (input: {
      schoolId: string;
      hostname: string;
      role: "site" | "portal";
      challenge: string;
      operatorId: string;
      reason: string;
    }) => addHost(db, { ...input, actor: `operator:${input.operatorId}` }),
    removeHost: (input: {
      schoolId: string;
      hostname: string;
      operatorId: string;
      reason: string;
    }) => removeHost(db, { ...input, actor: `operator:${input.operatorId}` }),
    makeCanonical: (input: {
      schoolId: string;
      hostname: string;
      operatorId: string;
      reason: string;
    }) =>
      makeCanonical(db, { ...input, actor: `operator:${input.operatorId}` }),
    /** Asks the cells' worker to check a host on its next pass. */
    requestCheck: (input: { schoolId: string; hostname: string }) =>
      requestCheck(db, input),
    /** Records that a school's administrator was sent a new link. */
    recordInvite: async (input: { schoolId: string; operatorId: string }) => {
      await db.insert(changes).values({
        actor: `operator:${input.operatorId}`,
        subjectType: "school",
        subjectId: input.schoolId,
        action: "administrator.invite",
        before: null,
        after: null,
        reason: "Sent the school's administrator a new link",
      });
    },
    changes: async (
      subject: { id?: string; type?: Change["subjectType"] } = {},
    ): Promise<Change[]> => {
      const rows = await db
        .select()
        .from(changes)
        .where(
          and(
            subject.id ? eq(changes.subjectId, subject.id) : undefined,
            subject.type ? eq(changes.subjectType, subject.type) : undefined,
          ),
        )
        .orderBy(desc(changes.occurredAt))
        .limit(200);
      return rows.map((row) => ({
        ...row,
        before: (row.before ?? null) as JsonValue,
        after: (row.after ?? null) as JsonValue,
        occurredAt: row.occurredAt.toISOString(),
      }));
    },
    /**
     * One page of the whole change log, newest first, narrowed on the
     * server so a filter reaches past the page. A host's and a sign-in
     * domain's changes carry the school or tenant they belong to.
     */
    changeLog: async (filter: ChangeLogFilter): Promise<ChangeLogPage> => {
      const words = filter.words?.trim();
      const like = words ? `%${escapeLike(words)}%` : null;
      const named = filter.named ?? { schools: [], tenants: [], subjects: [] };
      const rows = await db
        .select({
          change: changes,
          hostSchoolId: hosts.schoolId,
          domainTenantId: ssoDomains.tenantId,
          total: sql<number>`count(*) over ()`.mapWith(Number),
        })
        .from(changes)
        .leftJoin(
          hosts,
          and(
            eq(changes.subjectType, "host"),
            eq(hosts.hostname, changes.subjectId),
          ),
        )
        .leftJoin(
          ssoDomains,
          and(
            eq(changes.subjectType, "sso_domain"),
            eq(ssoDomains.domain, changes.subjectId),
          ),
        )
        .where(
          and(
            filter.actions?.length
              ? inArray(changes.action, filter.actions)
              : undefined,
            filter.actors?.length
              ? inArray(changes.actor, filter.actors)
              : undefined,
            filter.since ? gte(changes.occurredAt, filter.since) : undefined,
            like
              ? or(
                  ilike(changes.reason, like),
                  ilike(changes.subjectId, like),
                  named.subjects.length
                    ? inArray(changes.subjectId, named.subjects)
                    : undefined,
                  named.schools.length
                    ? inArray(hosts.schoolId, named.schools)
                    : undefined,
                  named.tenants.length
                    ? inArray(ssoDomains.tenantId, named.tenants)
                    : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(desc(changes.occurredAt), desc(changes.id))
        .limit(filter.limit)
        .offset(filter.offset);
      return {
        total: rows[0]?.total ?? 0,
        changes: rows.map(({ change, hostSchoolId, domainTenantId }) => ({
          ...change,
          before: (change.before ?? null) as JsonValue,
          after: (change.after ?? null) as JsonValue,
          occurredAt: change.occurredAt.toISOString(),
          schoolId: hostSchoolId,
          tenantId: domainTenantId,
        })),
      };
    },
    /** How many changes the log holds, of each kind and by each actor. */
    changeCounts: async () => {
      const [byAction, byActor] = await Promise.all([
        db
          .select({
            value: changes.action,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(changes)
          .groupBy(changes.action),
        db
          .select({
            value: changes.actor,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(changes)
          .groupBy(changes.actor),
      ]);
      return {
        total: byAction.reduce((sum, row) => sum + row.count, 0),
        actions: byAction,
        actors: byActor,
      };
    },
    close: () => db.$client.close(),
  };
}

export type DirectoryAdmin = ReturnType<typeof openDirectoryAdmin>;
