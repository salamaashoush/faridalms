import {
  learningAmong,
  learningReached,
} from "@faridalms/database/stores/learning-search";

import type { SearchSource } from "../search/points";

import { can, localeOf } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { learnerClasses, learnersOf } from "../search/points";

/** Modules and lessons, for those who write them and those who study them. */
export const LEARNING_SEARCH: SearchSource = {
  kind: "learning",
  targets: { learning_module: "module", lesson: "lesson" },
  mentions: ["module", "lesson"],
  resolver: async (context, q) => {
    const learnerIds = can(context, "learning:read")
      ? await learnersOf(context)
      : [];
    const access = {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      teaching: can(context, "learning:author")
        ? scopeFor(context, "teaching")
        : null,
      learnerClassIds: await learnerClasses(context, learnerIds),
      learnerIds,
    };
    return {
      within: learningReached(access),
      resolve: (ids) =>
        learningAmong(context.tx, {
          ...access,
          q,
          ar: localeOf(context) === "ar",
          ids,
        }),
    };
  },
};
