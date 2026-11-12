import { ListTree } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import { classRecordTabs } from "~/components/classes/slots";
import { studentRecordTabs } from "~/components/people/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { ClassGoals } from "./Goals";
import { ClassSkills, StudentSkills } from "./Progress";

/** Standards' pages and links. */
export const STANDARDS: ModuleFillings = {
  module: "standards",
  fillings: [
    fill(studentRecordTabs, {
      value: "skills",
      label: m.skillsTab,
      place: 70,
      shows: (access) => access.skills === true,
      Tab: StudentSkills,
    }),
    fill(classRecordTabs, {
      value: "skills",
      label: m.skillsTab,
      place: 50,
      capability: "submissions:grade",
      Tab: ClassSkills,
    }),
    fill(classRecordTabs, {
      value: "goals",
      label: m.goalsTab,
      place: 60,
      capability: "submissions:grade",
      shows: (record) => record.young,
      Tab: ClassGoals,
    }),
    fill(modulePages, ["/standards"]),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/standards",
        label: m.navStandards,
        icon: ListTree,
        capability: ["learning:author", "standards:manage"],
        more: true,
        place: 80,
      },
    }),
  ],
};
