import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { can } from "../core/procedure";
import { studentRecordAccess } from "../people/points";

/** What standards lets a viewer open on a student's record: their skills. */
export const STANDARDS: ModuleContributions = {
  module: "standards",
  contributions: [
    contribute(studentRecordAccess, {
      key: "skills",
      may: (context) =>
        can(context, "people:read") && can(context, "assignments:read"),
    }),
  ],
};
