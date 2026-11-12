import type { ModuleContributions } from "./core/extension";

import { ATTENDANCE } from "./attendance/contributions";
import { ATTENDANCE_WITH_TIMETABLE } from "./attendance/timetable";
import { HOMEROOMS } from "./homerooms/contributions";
import { HOMEROOMS_IN_TIMETABLE } from "./homerooms/timetable";
import { HOMEROOMS_IN_YEARS } from "./homerooms/years";
import { SCHOOL_YEARS } from "./years/contributions";

/**
 * Every module's contributions to the points core and the modules declare.
 * A point yields only those of the modules on at the school.
 */
export const MODULE_EXTENSIONS: readonly ModuleContributions[] = [
  ATTENDANCE,
  ATTENDANCE_WITH_TIMETABLE,
  HOMEROOMS,
  HOMEROOMS_IN_TIMETABLE,
  HOMEROOMS_IN_YEARS,
  SCHOOL_YEARS,
];
