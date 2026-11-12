import type { ModuleFillings } from "~/utils/extension";

import { dayPlannerParts } from "~/components/school-days/slots";
import { fill } from "~/utils/extension";

import { timetableDayPart } from "./DayParts";

/** What the timetable shows in the pages of core and other modules. */
export const TIMETABLE: ModuleFillings = {
  module: "timetable",
  fillings: [fill(dayPlannerParts, timetableDayPart)],
};
