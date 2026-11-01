import {
  attendanceCodes,
  setStudentMark,
  settingsOf,
  studentRegistersOn,
} from "@faridalms/database/stores/attendance";
import {
  findStudents,
  insertMovement,
  movementsOn,
  pickupContacts,
} from "@faridalms/database/stores/front-desk";
import {
  dayIn,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  findStudentSchema,
  frontDeskQuerySchema,
  minutesLate,
  pickupQuerySchema,
  signInSchema,
  signOutSchema,
} from "@faridalms/domain/attendance";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

async function requireOnRoll(context: UnitContext, studentId: string) {
  await requireStudent(context, "school", studentId);
}

async function reasonIdOf(context: UnitContext, reasonId: string) {
  if (!reasonId) return null;
  const codes = await attendanceCodes(context.tx, context.tenantId);
  if (!codes.reasons.some((row) => row.id === reasonId))
    throw new ORPCError("BAD_REQUEST", { message: "attendance.reason" });
  return reasonId;
}

async function categoryOf(
  context: UnitContext,
  meaning: "present" | "late" | "left_early",
) {
  const codes = await attendanceCodes(context.tx, context.tenantId);
  const row = codes.categories.find((entry) => entry.meaning === meaning);
  if (!row) throw new Error(`No attendance category means ${meaning}`);
  return row.id;
}

/** Reception's day: who came in late and who left early, and why. */
export const day = readProcedure
  .input(frontDeskQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const year = workingYear(
      await schoolYears(context.tx, context.tenantId, context.schoolId),
      context.today,
    );
    const date = year
      ? dayIn(year, input.date || context.today)
      : context.today;
    const [movements, codes] = await Promise.all([
      movementsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day: date,
      }),
      attendanceCodes(context.tx, context.tenantId),
    ]);
    return {
      date,
      today: context.today,
      year: year
        ? { startsOn: year.startsOn, endsBefore: year.endsBefore }
        : null,
      movements,
      reasons: codes.reasons.map((row) => ({
        id: row.id,
        code: row.code,
        labelEn: row.labelEn,
        labelAr: row.labelAr,
      })),
    };
  });

/** Students on roll whose name matches, for reception to pick. */
export const find = readProcedure
  .input(findStudentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    return findStudents(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      day: context.today,
      q: input.q,
    });
  });

/** Who may collect a child, and who must not. */
export const pickup = readProcedure
  .input(pickupQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    await requireOnRoll(context, input.studentId);
    return pickupContacts(context.tx, {
      tenantId: context.tenantId,
      studentId: input.studentId,
      day: context.today,
    });
  });

/**
 * Signs a late child in. Today's registers whose period has started take
 * the arrival: the daily register always, a lesson only while it runs.
 * A child already marked there keeps their mark.
 */
export const signIn = writeProcedure
  .input(signInSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    await requireOnRoll(context, input.studentId);
    const reasonId = await reasonIdOf(context, input.reasonId);
    const [registers, settings] = await Promise.all([
      studentRegistersOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        studentId: input.studentId,
        day: context.today,
      }),
      settingsOf(context.tx, context.tenantId, context.schoolId),
    ]);
    const id = await insertMovement(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId: input.studentId,
      day: context.today,
      direction: "in",
      at: input.at,
      reasonId,
      collectedById: null,
      collectedByName: null,
      note: input.note || null,
      actorId: context.actor.userId,
    });
    let marked = 0;
    for (const register of registers) {
      const start = register.startTime;
      if (!start || minutesOf(start) > minutesOf(input.at)) continue;
      const running =
        register.official ||
        (register.endTime !== null &&
          minutesOf(input.at) < minutesOf(register.endTime));
      if (!running) continue;
      if (register.meaning === "present" || register.meaning === "late")
        continue;
      const late = minutesLate(start, input.at, settings.lateAfterMinutes);
      const meaning = late === null ? "present" : "late";
      await setStudentMark(context.tx, {
        tenantId: context.tenantId,
        registerId: register.registerId,
        day: context.today,
        studentId: input.studentId,
        markId: register.markId,
        categoryId: await categoryOf(context, meaning),
        meaning,
        minutes: late,
        reasonId: meaning === "late" ? reasonId : null,
        note: null,
        actorId: context.actor.userId,
      });
      marked += 1;
    }
    await audit(context, {
      action: "attendance.sign_in",
      objectType: "student_movement",
      objectId: id,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { at: input.at, marked },
    });
    return { id, marked };
  });

/**
 * Signs a child out early, with who collected them; a contact the school
 * holds as not allowed to collect is refused. The lesson running then takes
 * the early leave; later registers open with the child marked away.
 */
export const signOut = writeProcedure
  .input(signOutSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    await requireOnRoll(context, input.studentId);
    if (!input.collectedById && !input.collectedByName)
      throw new ORPCError("BAD_REQUEST", { message: "attendance.pickup_who" });
    if (input.collectedById) {
      const contacts = await pickupContacts(context.tx, {
        tenantId: context.tenantId,
        studentId: input.studentId,
        day: context.today,
      });
      const contact = contacts.find(
        (row) => row.userId === input.collectedById,
      );
      if (!contact) throw new ORPCError("NOT_FOUND");
      if (contact.pickup === "not_allowed")
        throw new ORPCError("FORBIDDEN", {
          message: "attendance.pickup_not_allowed",
        });
    }
    const reasonId = await reasonIdOf(context, input.reasonId);
    const registers = await studentRegistersOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId: input.studentId,
      day: context.today,
    });
    const id = await insertMovement(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId: input.studentId,
      day: context.today,
      direction: "out",
      at: input.at,
      reasonId,
      collectedById: input.collectedById || null,
      collectedByName: input.collectedById ? null : input.collectedByName,
      note: input.note || null,
      actorId: context.actor.userId,
    });
    let marked = 0;
    for (const register of registers) {
      const { startTime: start, endTime: end } = register;
      if (!start || !end) continue;
      const at = minutesOf(input.at);
      if (at < minutesOf(start) || at >= minutesOf(end)) continue;
      if (
        register.meaning !== null &&
        register.meaning !== "present" &&
        register.meaning !== "late"
      )
        continue;
      await setStudentMark(context.tx, {
        tenantId: context.tenantId,
        registerId: register.registerId,
        day: context.today,
        studentId: input.studentId,
        markId: register.markId,
        categoryId: await categoryOf(context, "left_early"),
        meaning: "left_early",
        minutes: minutesOf(end) - at,
        reasonId,
        note: null,
        actorId: context.actor.userId,
      });
      marked += 1;
    }
    await audit(context, {
      action: "attendance.sign_out",
      objectType: "student_movement",
      objectId: id,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: {
        at: input.at,
        marked,
        collectedById: input.collectedById || null,
      },
    });
    return { id, marked };
  });
