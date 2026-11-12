import {
  assignmentsAmong,
  assignmentsReached,
} from "@faridalms/database/stores/coursework-search";

import type { SearchSource } from "../search/points";

import { can, localeOf } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { learnersOf } from "../search/points";

/** Assignments, for those who set them and those they are set for. */
export const ASSIGNMENT_SEARCH: SearchSource = {
  kind: "assignments",
  targets: { assignment: "assignment" },
  mentions: ["assignment"],
  resolver: async (context, q) => {
    const access = {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      teaching: can(context, "assignments:author")
        ? scopeFor(context, "teaching")
        : null,
      learners: await learnersOf(context),
    };
    return {
      within: assignmentsReached(access),
      resolve: (ids) =>
        assignmentsAmong(context.tx, {
          ...access,
          q,
          ar: localeOf(context) === "ar",
          ids,
        }),
    };
  },
};
