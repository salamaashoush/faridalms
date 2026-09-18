import type { SaveTimetableInput } from "@faridalms/domain/timetable";

import { collidingSlots, slotsCollide } from "@faridalms/domain/timetable";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "../index";

import { schema as s } from "../index";
import { ACADEMIC_STRUCTURE_LOCK } from "../locks";
import { ManagementError } from "./management";

export function timetableForManagement(
  db: Database,
  classId: string,
  schoolYearId: string,
) {
  return db.query.classes.findFirst({
    where: { id: classId, schoolYearId },
    columns: { id: true, name: true, revision: true },
    with: {
      classSubjects: {
        with: {
          subject: {
            columns: { id: true, name: true, nameAr: true, icon: true },
          },
          teacher: { columns: { id: true, name: true } },
        },
      },
      timetableSlots: {
        orderBy: { weekday: "asc", startTime: "asc" },
        with: {
          subject: {
            columns: { name: true, nameAr: true, slug: true, icon: true },
          },
          teacher: { columns: { id: true, name: true } },
        },
      },
    },
  });
}

const clock = (value: string) => value.slice(0, 5);

/**
 * Replaces a class's week. Every slot must be a subject the class offers, an
 * empty teacher falls back to the offering's teacher, and a teacher cannot be
 * in two classes at once anywhere in the year.
 */
export async function saveTimetable(
  db: Database,
  input: SaveTimetableInput,
  schoolYearId: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const [existing] = await tx
      .select({ id: s.classes.id, revision: s.classes.revision })
      .from(s.classes)
      .where(
        and(
          eq(s.classes.id, input.classId),
          eq(s.classes.schoolYearId, schoolYearId),
        ),
      )
      .for("update");
    if (!existing)
      throw new ManagementError("NOT_FOUND", "timetable.class_not_found");
    if (existing.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "timetable.revision_conflict");
    if (collidingSlots(input.slots).length > 0)
      throw new ManagementError("BAD_REQUEST", "timetable.overlap");
    const offerings = await tx.query.classSubjects.findMany({
      where: { classId: input.classId },
      columns: { subjectId: true, teacherId: true },
    });
    const slots = input.slots.map((slot) => {
      const offering = offerings.find(
        (row) => row.subjectId === slot.subjectId,
      );
      if (!offering)
        throw new ManagementError(
          "BAD_REQUEST",
          "timetable.subject_not_offered",
        );
      return {
        classId: input.classId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId || offering.teacherId,
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room?.trim() || null,
      };
    });
    const teacherIds = [
      ...new Set(
        slots.flatMap((slot) => (slot.teacherId ? [slot.teacherId] : [])),
      ),
    ];
    if (teacherIds.length > 0) {
      const teachers = await tx.query.users.findMany({
        where: { id: { in: teacherIds }, role: "teacher", isActive: true },
        columns: { id: true },
      });
      if (teachers.length !== teacherIds.length)
        throw new ManagementError("BAD_REQUEST", "timetable.teacher_not_found");
      const elsewhere = await tx
        .select({
          teacherId: s.timetableSlots.teacherId,
          weekday: s.timetableSlots.weekday,
          startTime: s.timetableSlots.startTime,
          endTime: s.timetableSlots.endTime,
        })
        .from(s.timetableSlots)
        .innerJoin(s.classes, eq(s.classes.id, s.timetableSlots.classId))
        .where(
          and(
            inArray(s.timetableSlots.teacherId, teacherIds),
            ne(s.timetableSlots.classId, input.classId),
            eq(s.classes.schoolYearId, schoolYearId),
          ),
        );
      const busy = slots.some((slot) =>
        elsewhere.some(
          (other) =>
            other.teacherId === slot.teacherId &&
            slotsCollide(slot, {
              weekday: other.weekday,
              startTime: clock(other.startTime),
              endTime: clock(other.endTime),
            }),
        ),
      );
      if (busy) throw new ManagementError("CONFLICT", "timetable.teacher_busy");
    }
    await tx
      .delete(s.timetableSlots)
      .where(eq(s.timetableSlots.classId, input.classId));
    if (slots.length > 0) await tx.insert(s.timetableSlots).values(slots);
    const [updated] = await tx
      .update(s.classes)
      .set({ revision: sql`${s.classes.revision} + 1`, updatedAt: new Date() })
      .where(eq(s.classes.id, input.classId))
      .returning({ revision: s.classes.revision });
    return { classId: input.classId, revision: updated?.revision ?? 0 };
  });
}
