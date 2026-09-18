import type { SaveStudentGroupInput } from "@faridalms/domain/assignment";

import { and, eq, inArray } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { ManagementError } from "./management";

export async function listGroups(db: Database, classId: string) {
  const rows = await db.query.studentGroups.findMany({
    where: { classId },
    with: { members: { columns: { studentId: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    classId: row.classId,
    name: row.name,
    studentIds: row.members.map((member) => member.studentId),
  }));
}

/** Members are checked against the roster active today, so a group cannot smuggle in a student from another class. */
export async function saveGroup(
  db: Database,
  input: SaveStudentGroupInput,
  createdById: string,
  today: string,
) {
  return db.transaction(async (tx) => {
    const enrolled = await tx.query.enrolments.findMany({
      where: {
        classId: input.classId,
        studentId: { in: input.studentIds },
        since: { lte: today },
        OR: [{ until: { isNull: true } }, { until: { gt: today } }],
      },
      columns: { studentId: true },
    });
    const roster = new Set(enrolled.map((row) => row.studentId));
    if (input.studentIds.some((id) => !roster.has(id)))
      throw new ManagementError("BAD_REQUEST", "group.student_not_enrolled");
    const duplicate = await tx.query.studentGroups.findFirst({
      where: {
        classId: input.classId,
        name: input.name,
        ...(input.id ? { id: { ne: input.id } } : {}),
      },
      columns: { id: true },
    });
    if (duplicate) throw new ManagementError("CONFLICT", "group.name_conflict");
    let id = input.id;
    if (id) {
      const [updated] = await tx
        .update(schema.studentGroups)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentGroups.id, id),
            eq(schema.studentGroups.classId, input.classId),
          ),
        )
        .returning({ id: schema.studentGroups.id });
      if (!updated) throw new ManagementError("NOT_FOUND", "group.not_found");
      await tx
        .delete(schema.studentGroupMembers)
        .where(eq(schema.studentGroupMembers.groupId, id));
    } else {
      const [created] = await tx
        .insert(schema.studentGroups)
        .values({ classId: input.classId, name: input.name, createdById })
        .returning({ id: schema.studentGroups.id });
      if (!created) throw new Error("group.create_failed");
      id = created.id;
    }
    await tx.insert(schema.studentGroupMembers).values(
      [...new Set(input.studentIds)].map((studentId) => ({
        groupId: id,
        studentId,
      })),
    );
    return {
      id,
      name: input.name,
      classId: input.classId,
      studentIds: input.studentIds,
    };
  });
}

export async function deleteGroup(db: Database, id: string, classId: string) {
  const rows = await db
    .delete(schema.studentGroups)
    .where(
      and(
        eq(schema.studentGroups.id, id),
        eq(schema.studentGroups.classId, classId),
      ),
    )
    .returning({ id: schema.studentGroups.id });
  if (rows.length === 0)
    throw new ManagementError("NOT_FOUND", "group.not_found");
}

export async function groupMembers(
  db: Database | DatabaseTransaction,
  classId: string,
  groupIds: string[],
) {
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({ studentId: schema.studentGroupMembers.studentId })
    .from(schema.studentGroupMembers)
    .innerJoin(
      schema.studentGroups,
      eq(schema.studentGroups.id, schema.studentGroupMembers.groupId),
    )
    .where(
      and(
        inArray(schema.studentGroupMembers.groupId, groupIds),
        eq(schema.studentGroups.classId, classId),
      ),
    );
  return [...new Set(rows.map((row) => row.studentId))];
}
