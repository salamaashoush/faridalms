import { changesOn } from "@faridalms/database/stores/cover";
import {
  dayPlan,
  teachingPeriodsOn,
} from "@faridalms/database/stores/day-plan";
import {
  firstRegisterIn,
  lessonsOwed,
  linkPeriod,
  periodRegister,
  periodsOfRegisters,
} from "@faridalms/database/stores/register-periods";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { periodUses } from "../timetable/period-uses";
import { registerPlans } from "./plans";

/**
 * What the timetable and registers tell each other: the periods of a day,
 * the lessons that owe a register and who covers them, and the registers a
 * change to a period may not rewrite.
 */
export const ATTENDANCE_WITH_TIMETABLE: ModuleContributions = {
  module: "attendance",
  needs: ["timetable"],
  contributions: [
    contribute(registerPlans, {
      periodsOn: async (context, day) =>
        (
          await teachingPeriodsOn(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            day,
          })
        ).map((row) => ({
          id: row.id,
          code: row.code,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          sequence: row.sequence,
          kind: row.kind === "registration" ? "registration" : "lesson",
          startTime: row.startTime,
          endTime: row.endTime,
          official: row.official,
        })),
      lessonsOn: async (context, day) =>
        lessonsOwed(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          plan: await dayPlan(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            day,
          }),
        }),
      periodsOf: (context, registerIds) =>
        periodsOfRegisters(context.tx, {
          tenantId: context.tenantId,
          registerIds,
        }),
      coveredOn: async (context, input) =>
        (
          await changesOn(context.tx, {
            tenantId: context.tenantId,
            days: [input.day],
            filter: { coverId: input.userId },
          })
        ).map((row) => ({ classId: row.classId, periodId: row.periodId })),
      registerIn: (context, input) =>
        periodRegister(context.tx, { tenantId: context.tenantId, ...input }),
      takenIn: (context, input) =>
        linkPeriod(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          ...input,
        }),
    }),
    contribute(periodUses, {
      firstUse: (context, periodIds, from) =>
        firstRegisterIn(context.tx, {
          tenantId: context.tenantId,
          periodIds,
          from,
        }),
    }),
  ],
};
