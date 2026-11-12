import { studentModules } from "@faridalms/database/stores/learning";

import { reachAt } from "../core/audiences";
import { readProcedure, requireCapability } from "../core/procedure";

/** The module a student is part way through, to continue from Today. */
export const today = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "learning:read");
  const studentId = context.actor.userId;
  const reach = await reachAt(context, {
    userId: studentId,
    on: context.today,
  });
  const modules = await studentModules(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    studentId,
    classIds: reach.classIds,
  });
  const going = modules.find(
    (row) => row.lessons > 0 && row.completed < row.lessons,
  );
  return {
    module: going
      ? {
          id: going.id,
          title: going.title,
          lessons: going.lessons,
          completed: going.completed,
        }
      : null,
  };
});
