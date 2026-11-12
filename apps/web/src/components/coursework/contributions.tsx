import { ClipboardCheck, ClipboardList, ListTodo } from "lucide-react";

import type { ClassRecordSectionProps } from "~/components/classes/slots";
import type { ModuleFillings } from "~/utils/extension";

import { settingsTabs } from "~/components/admin/slots";
import { navItems } from "~/components/app/navigation";
import { searchKindWords } from "~/components/app/SearchResults";
import { classRecordSections } from "~/components/classes/slots";
import { ClassGradingSection } from "~/components/grading/ClassGrading";
import { GradingSettings } from "~/components/grading/GradingSettings";
import { setupItemWords } from "~/components/home/slots";
import { studentRecordTabs } from "~/components/people/slots";
import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { gradingOverviewQuery } from "~/queries/grading";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { StudentCoursework } from "./StudentCoursework";
import { COURSEWORK_TODAY } from "./today";

/** How the class is graded, for its teachers and whoever keeps the school's classes or grading. */
function ClassGrading({ classId, manages }: ClassRecordSectionProps) {
  const setsUpGrading = useCapability("grading:manage");
  const keepsClasses = useCapability("classes:manage");
  const teaches = useCapability("assignments:author");
  const keepsGrading = setsUpGrading || keepsClasses;
  if (!keepsGrading && !teaches) return null;
  return (
    <ClassGradingSection classId={classId} canEdit={keepsGrading && manages} />
  );
}

/** Coursework's pages, links, settings and parts of the class record. */
export const COURSEWORK: ModuleFillings = {
  module: "coursework",
  fillings: [
    fill(searchKindWords, {
      kind: "assignments",
      label: m.searchKindAssignments,
      icon: ClipboardList,
      linkOf: (hit) => ({
        to: "/assignments/$assignmentId",
        params: { assignmentId: hit.id },
      }),
    }),
    fill(setupItemWords, {
      item: "first_assignment",
      label: m.onboardingFirstAssignment,
    }),
    ...COURSEWORK_TODAY,
    fill(studentRecordTabs, {
      value: "coursework",
      label: m.courseworkRecordTab,
      place: 60,
      shows: (access) => access.coursework === true,
      Tab: StudentCoursework,
    }),
    fill(classRecordSections, {
      key: "grading",
      place: 100,
      Section: ClassGrading,
    }),
    fill(settingsTabs, {
      value: "grading",
      label: m.gradingTitle,
      place: 50,
      capability: "grading:manage",
      queries: () => [gradingOverviewQuery],
      Tab: GradingSettings,
    }),
    fill(modulePages, [
      "/assignments",
      "/assignment-editor",
      "/grading",
      "/me/assignments",
      "/family/assignments",
      "/exports/assignments",
      "/exports/students",
    ]),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/grading",
        label: m.navToReview,
        icon: ClipboardCheck,
        capability: "submissions:grade",
        place: 20,
        mobile: 30,
      },
    }),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/assignments",
        label: m.navCoursework,
        icon: ClipboardList,
        capability: ["assignments:author", "submissions:grade"],
        place: 30,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/assignments",
        label: m.navToDo,
        icon: ListTodo,
        capability: "own-work:read",
        place: 20,
        mobile: 20,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/assignments",
        label: m.navCoursework,
        icon: ClipboardList,
        capability: "children:read",
        place: 30,
        mobile: 20,
      },
    }),
  ],
};
