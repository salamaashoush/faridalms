import { BookOpen } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import { gradingSettingsSections } from "~/components/grading/slots";
import * as m from "~/i18n/messages";
import { runningGradesQuery } from "~/queries/gradebook";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { RunningDefault } from "./RunningChoice";
import { RunningGrades } from "./RunningGrades";
import { gradesSections } from "./slots";

/**
 * The gradebook's pages and links, a learner's running grades on their
 * Grades page, and the school's default for new classes among its grading
 * settings.
 */
export const GRADEBOOK: ModuleFillings = {
  module: "gradebook",
  fillings: [
    fill(modulePages, ["/gradebook", "/me/grades", "/family/grades"]),
    fill(gradesSections, {
      key: "running",
      place: 25,
      query: (studentId) => runningGradesQuery(studentId),
      Section: RunningGrades,
    }),
    fill(gradingSettingsSections, { key: "running", Section: RunningDefault }),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/gradebook",
        label: m.navGradebook,
        icon: BookOpen,
        capability: "submissions:grade",
        place: 40,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/grades",
        label: m.navGrades,
        icon: BookOpen,
        capability: "grades:read",
        place: 30,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/grades",
        label: m.navGrades,
        icon: BookOpen,
        capability: "children:read",
        place: 40,
      },
    }),
  ],
};
