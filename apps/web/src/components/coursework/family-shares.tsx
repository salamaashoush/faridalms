import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { getSharedStudents, shareWork } from "~/server/family-shares";
import { fill } from "~/utils/extension";

import { workSharing } from "./slots";

/** Teachers pass handed-in work on to the families who follow its students. */
export const COURSEWORK_WITH_FAMILIES: ModuleFillings = {
  module: "coursework",
  needs: ["families"],
  fillings: [
    fill(workSharing, {
      query: (assignmentId) => ({
        queryKey: ["coursework", "shared", "assignment", assignmentId],
        queryFn: () => getSharedStudents({ data: { assignmentId } }),
      }),
      share: (input) => shareWork({ data: input }),
      words: {
        share: m.courseworkShare,
        unshare: m.courseworkUnshare,
        mark: m.courseworkSharedMark,
        shared: m.courseworkSharedDone,
        unshared: m.courseworkUnsharedDone,
      },
    }),
  ],
};
