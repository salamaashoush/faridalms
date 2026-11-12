import type { ModuleContributions } from "./core/extension";

import { ADMISSIONS_BY_GRADE } from "./admissions/grades";
import { ADMISSIONS_IN_YEARS } from "./admissions/years";
import { ATTENDANCE } from "./attendance/contributions";
import { ATTENDANCE_WITH_TIMETABLE } from "./attendance/timetable";
import { COURSEWORK } from "./coursework/contributions";
import { GRADE_LEVELS } from "./grade-levels/contributions";
import { GRADE_LEVELS_WITH_COURSEWORK } from "./grade-levels/coursework";
import { GRADE_LEVELS_IN_YEARS } from "./grade-levels/years";
import { GRADEBOOK_IN_YEARS } from "./gradebook/years";
import { HOMEROOMS } from "./homerooms/contributions";
import { HOMEROOMS_BY_GRADE } from "./homerooms/grades";
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
  ADMISSIONS_BY_GRADE,
  ADMISSIONS_IN_YEARS,
  ATTENDANCE,
  ATTENDANCE_WITH_TIMETABLE,
  COURSEWORK,
  ELEARNING_IN_YEARS,
  ELEARNING_READINGS,
  ELEARNING_WITH_COURSEWORK,
  GRADE_LEVELS,
  GRADE_LEVELS_IN_YEARS,
  GRADE_LEVELS_WITH_COURSEWORK,
  GRADEBOOK_IN_YEARS,
  HOMEROOMS,
  HOMEROOMS_BY_GRADE,
  HOMEROOMS_IN_TIMETABLE,
  HOMEROOMS_IN_YEARS,
  SCHOOL_YEARS,
  STANDARDS_FROM_LESSONS,
  STANDARDS_FROM_WORK,
];
