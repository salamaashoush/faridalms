import type { ModuleContributions } from "./core/extension";

import { ATTENDANCE } from "./attendance/contributions";
import { ATTENDANCE_WITH_TIMETABLE } from "./attendance/timetable";
import { COURSEWORK } from "./coursework/contributions";
import { GRADEBOOK_IN_YEARS } from "./gradebook/years";
import { HOMEROOMS } from "./homerooms/contributions";
import { HOMEROOMS_IN_TIMETABLE } from "./homerooms/timetable";
import { HOMEROOMS_IN_YEARS } from "./homerooms/years";
import { ELEARNING_WITH_COURSEWORK } from "./learning/discussions";
import { ELEARNING_READINGS } from "./learning/reading";
import { ELEARNING_IN_YEARS } from "./learning/years";
import { STANDARDS_FROM_LESSONS } from "./standards/lessons";
import { STANDARDS_FROM_WORK } from "./standards/work";
import { SCHOOL_YEARS } from "./years/contributions";

/**
 * Every module's contributions to the points core and the modules declare.
 * A point yields only those of the modules on at the school.
 */
export const MODULE_EXTENSIONS: readonly ModuleContributions[] = [
  ATTENDANCE,
  ATTENDANCE_WITH_TIMETABLE,
  COURSEWORK,
  ELEARNING_IN_YEARS,
  ELEARNING_READINGS,
  ELEARNING_WITH_COURSEWORK,
  GRADEBOOK_IN_YEARS,
  HOMEROOMS,
  HOMEROOMS_IN_TIMETABLE,
  HOMEROOMS_IN_YEARS,
  SCHOOL_YEARS,
  STANDARDS_FROM_LESSONS,
  STANDARDS_FROM_WORK,
];
