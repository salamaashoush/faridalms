import { BookOpen } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

/** The gradebook's pages and links; a student's grades page is its links'. */
export const GRADEBOOK: ModuleFillings = {
  module: "gradebook",
  fillings: [
    fill(modulePages, ["/gradebook"]),
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
