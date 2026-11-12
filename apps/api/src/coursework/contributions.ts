import { joinOpenWork } from "@faridalms/database/stores/coursework";

import type { ModuleContributions } from "../core/extension";

import { classJoins } from "../classes/points";
import { contribute } from "../core/extension";

/** What coursework keeps in step with the classes it is set in. */
export const COURSEWORK: ModuleContributions = {
  module: "coursework",
  contributions: [
    // A student joining a class is given the work still open in it.
    contribute(classJoins, {
      joined: async (context, joins) => {
        for (const [classId, studentIds] of joins)
          await joinOpenWork(context.tx, {
            tenantId: context.tenantId,
            studentIds,
            classId,
          });
      },
    }),
  ],
};
