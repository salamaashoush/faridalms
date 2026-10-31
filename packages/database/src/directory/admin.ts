import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";
import type { SchoolPlan } from "@faridalms/domain/plans";

import { seriesId } from "@faridalms/domain/exams";
import { SQL } from "bun";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import type { DirectoryTenantState } from "./schema";

import {
  cells,
  changes,
  examSeries,
  schoolPlans,
  schools,
  schoolUsage,
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
  cellId: string;
  region: string;
  plan: SchoolPlan | null;
  usage: { usedBytes: number; fileCount: number; measuredAt: string } | null;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
  plan: SchoolPlan | null;
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
  cellId: string;
  region: string;
  planned: string | null;
  poolBytes: number | null;
  classBytes: number | null;
  moduleBytes: number | null;
  personBytes: number | null;
  modules: string[] | null;
  usedBytes: number | null;
  fileCount: number | null;
  measuredAt: Date | null;
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
    cellId: row.cellId,
    region: row.region,
    plan: row.planned
      ? {
          poolBytes: row.poolBytes,
          classBytes: row.classBytes,
          moduleBytes: row.moduleBytes,
          personBytes: row.personBytes,
          modules: row.modules,
        }
      : null,
    usage:
      row.usedBytes !== null && row.fileCount !== null && row.measuredAt
        ? {
            usedBytes: row.usedBytes,
            fileCount: row.fileCount,
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
        cellId: cells.id,
        region: cells.region,
        planned: schoolPlans.schoolId,
        poolBytes: schoolPlans.poolBytes,
        classBytes: schoolPlans.classBytes,
        moduleBytes: schoolPlans.moduleBytes,
        personBytes: schoolPlans.personBytes,
        modules: schoolPlans.modules,
        usedBytes: schoolUsage.usedBytes,
        fileCount: schoolUsage.fileCount,
        measuredAt: schoolUsage.measuredAt,
      })
      .from(schools)
      .innerJoin(tenants, eq(tenants.id, schools.tenantId))
      .innerJoin(cells, eq(cells.id, tenants.cellId))
      .leftJoin(schoolPlans, eq(schoolPlans.schoolId, schools.id))
      .leftJoin(schoolUsage, eq(schoolUsage.schoolId, schools.id));
  return {
    schools: async () => (await select().orderBy(schools.slug)).map(schoolOf),
    school: async (id: string) => {
      const [row] = await select().where(eq(schools.id, id));
      return row ? schoolOf(row) : null;
    },
    /** Sets a school's plan, or returns it to the defaults with null. */
    savePlan: async (input: {
      schoolId: string;
      plan: SchoolPlan | null;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schoolPlans)
          .where(eq(schoolPlans.schoolId, input.schoolId))
          .for("update");
        if (input.plan === null)
          await tx
            .delete(schoolPlans)
            .where(eq(schoolPlans.schoolId, input.schoolId));
        else
          await tx
            .insert(schoolPlans)
            .values({ schoolId: input.schoolId, ...input.plan })
            .onConflictDoUpdate({
              target: schoolPlans.schoolId,
              set: { ...input.plan, updatedAt: new Date() },
            });
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "school",
          subjectId: input.schoolId,
          action: "plan.update",
          before: before
            ? {
                poolBytes: before.poolBytes,
                classBytes: before.classBytes,
                moduleBytes: before.moduleBytes,
                personBytes: before.personBytes,
                modules: before.modules,
              }
            : null,
          after: input.plan,
          reason: input.reason,
        });
      }),
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
          const plan = input.plan;
          const plans = async (schoolIds: string[]) => {
            if (!plan) return;
            await tx
              .insert(schoolPlans)
              .values(schoolIds.map((schoolId) => ({ schoolId, ...plan })))
              .onConflictDoUpdate({
                target: schoolPlans.schoolId,
                set: { ...plan, updatedAt: new Date() },
              });
          };
          const after = {
            kind: input.kind,
            cellId: input.cellId,
            schools: slugs,
            plan: input.plan,
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
            await plans(input.schools.map((school) => school.id));
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
          await plans(ids);
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
    series: async (): Promise<ExamSeries[]> =>
      db
        .select({
          id: examSeries.id,
          board: examSeries.board,
          sitsIn: examSeries.sitsIn,
          keepUntil: examSeries.keepUntil,
          retired: examSeries.retired,
        })
        .from(examSeries)
        .orderBy(asc(examSeries.sitsIn), asc(examSeries.board)),
    /** Adds an official session or changes its dates, named by board and month. */
    saveSeries: async (input: {
      board: ExamBoard;
      sitsIn: string;
      keepUntil: string;
      retired: boolean;
      operatorId: string;
      reason: string;
    }) =>
      db.transaction(async (tx) => {
        const id = seriesId(input.board, input.sitsIn);
        const [before] = await tx
          .select()
          .from(examSeries)
          .where(eq(examSeries.id, id))
          .for("update");
        const after = { keepUntil: input.keepUntil, retired: input.retired };
        await tx
          .insert(examSeries)
          .values({
            id,
            board: input.board,
            sitsIn: input.sitsIn,
            ...after,
          })
          .onConflictDoUpdate({
            target: examSeries.id,
            set: { ...after, updatedAt: new Date() },
          });
        await tx.insert(changes).values({
          actor: `operator:${input.operatorId}`,
          subjectType: "exam_series",
          subjectId: id,
          action: before ? "series.update" : "series.create",
          before: before
            ? { keepUntil: before.keepUntil, retired: before.retired }
            : null,
          after,
          reason: input.reason,
        });
        return id;
      }),
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
    close: () => db.$client.close(),
  };
}

export type DirectoryAdmin = ReturnType<typeof openDirectoryAdmin>;
