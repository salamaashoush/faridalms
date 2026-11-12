import {
  lastMarkFrom,
  lastMarkInClass,
  lastMarkInClasses,
  registerOutside,
  registerTaken,
} from "@faridalms/database/stores/attendance";

import type { ModuleContributions } from "../core/extension";

import { classGuards } from "../classes/points";
import { contribute } from "../core/extension";
import { setupMeasures } from "../core/setup";
import { fileHosts } from "../files/authorize";
import { leavingGuards } from "../people/sign-in-ways";
import { ATTENDANCE_HOSTS } from "./hosts";

/** What attendance tells the rest of the product, wherever it asks. */
export const ATTENDANCE: ModuleContributions = {
  module: "attendance",
  contributions: [
    contribute(fileHosts, ATTENDANCE_HOSTS),
    // A register that marks a student after their last day says they were
    // still here.
    contribute(leavingGuards, {
      refuses: async (context, input) => {
        const marked = await lastMarkFrom(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          studentId: input.studentId,
          from: input.leftOn,
        });
        return marked ? `enrollment.registers_after:${marked}` : null;
      },
    }),
    contribute(setupMeasures, {
      item: "first_register",
      seen: (scope) =>
        registerTaken(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
        }),
    }),
    contribute(classGuards, {
      // Ending enrolments on a day before a register that already marks the
      // student would leave that register counting someone no longer in
      // the class.
      refusesLeaving: async (context, input) => {
        const last = await lastMarkInClasses(context.tx, {
          tenantId: context.tenantId,
          ...input,
        });
        return last ? `enrollment.registers_after:${last}` : null;
      },
      refusesRuns: async (context, classId, runs) => {
        if (runs.to !== null) {
          const last = await lastMarkInClass(context.tx, {
            tenantId: context.tenantId,
            classId,
            from: runs.to,
          });
          if (last) return `class.registers_after:${last}`;
        }
        const day = await registerOutside(context.tx, {
          tenantId: context.tenantId,
          classId,
          runs,
        });
        return day ? `class.registers_outside:${day}` : null;
      },
    }),
  ],
};
