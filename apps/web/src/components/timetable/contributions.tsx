import { Table2 } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import { classRecordTabs } from "~/components/classes/slots";
import { setupItemWords, setupStepWords } from "~/components/home/slots";
import { studentOverviewParts } from "~/components/people/slots";
import { dayPlannerParts } from "~/components/school-days/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { timetableDayPart } from "./DayParts";
import { COVER_NOTICES } from "./notices";
import { StudentToday } from "./StudentToday";
import { TIMETABLE_TODAY } from "./today";
import { ClassWeek } from "./Weeks";

/** What the timetable shows in the pages of core and other modules. */
export const TIMETABLE: ModuleFillings = {
  module: "timetable",
  fillings: [
    COVER_NOTICES,
    fill(setupStepWords, {
      id: "timetable",
      title: m.setupTimetableTitle,
      body: m.setupTimetableBody,
      capability: "timetable:manage",
      link: { to: "/timetable", search: {} },
    }),
    fill(setupItemWords, {
      item: "timetable_ready",
      label: m.onboardingTimetableReady,
    }),
    ...TIMETABLE_TODAY,
    fill(studentOverviewParts, {
      key: "today",
      place: 10,
      shows: (access) => access.timetable === true,
      Part: StudentToday,
    }),
    fill(classRecordTabs, {
      value: "timetable",
      label: m.ttTitle,
      place: 30,
      capability: "timetable:read",
      Tab: ClassWeek,
    }),
    fill(modulePages, ["/timetable", "/me/timetable", "/family/timetable"]),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/timetable",
        label: m.navTimetable,
        icon: Table2,
        capability: ["timetable:read", "timetable:manage"],
        place: 70,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/timetable",
        label: m.navTimetable,
        icon: Table2,
        capability: "timetable:read",
        place: 50,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/timetable",
        label: m.navTimetable,
        icon: Table2,
        capability: "children:read",
        place: 60,
      },
    }),
    fill(dayPlannerParts, timetableDayPart),
  ],
};
