import type { ModuleFillings } from "~/utils/extension";

import { GoalsReport } from "~/components/standards/Goals";
import { SkillsSection } from "~/components/standards/Progress";
import { goalsReportQuery, studentProgressQuery } from "~/queries/standards";
import { fill } from "~/utils/extension";

import { gradesSections } from "./slots";

/** A student's grades page shows their skills, and their family the goals report, where standards are kept. */
export const GRADEBOOK_WITH_STANDARDS: ModuleFillings = {
  module: "gradebook",
  needs: ["standards"],
  fillings: [
    fill(gradesSections, {
      key: "goals",
      place: 10,
      followersOnly: true,
      query: (studentId) => goalsReportQuery(studentId),
      Section: GoalsReport,
    }),
    fill(gradesSections, {
      key: "skills",
      place: 30,
      query: (studentId) => studentProgressQuery(studentId),
      Section: SkillsSection,
    }),
  ],
};
