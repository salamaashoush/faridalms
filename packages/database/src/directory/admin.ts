import type { SchoolPlan } from "@faridalms/domain/plans";

import { SQL } from "bun";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import {
  cells,
  changes,
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
  subjectType: string;
  subjectId: string;
  action: string;
  before: JsonValue;
  after: JsonValue;
  reason: string;
}

interface SchoolRow {
  id: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  placement: "legacy" | "cell";
  tenantId: string;
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
    changes: async (subjectId?: string): Promise<Change[]> => {
      const rows = await db
        .select()
        .from(changes)
        .where(subjectId ? eq(changes.subjectId, subjectId) : undefined)
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
