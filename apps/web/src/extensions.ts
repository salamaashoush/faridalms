import type { ModuleFillings } from "./utils/extension";

import { ADMISSIONS_BY_GRADE } from "./components/admissions/grades";
import { ADMISSIONS_IN_YEARS } from "./components/admissions/years";
import { COURSEWORK_WITH_FAMILIES } from "./components/coursework/family-shares";
import { FAMILIES } from "./components/families/contributions";
import { GRADE_LEVELS } from "./components/grade-levels/contributions";
import { GRADE_LEVELS_WITH_COURSEWORK } from "./components/grade-levels/coursework";
import { GRADE_LEVELS_IN_YEARS } from "./components/grade-levels/years";
import { GRADEBOOK_IN_YEARS } from "./components/gradebook/years";
import { HOMEROOMS } from "./components/homerooms/contributions";
import { HOMEROOMS_IN_YEARS } from "./components/homerooms/years";
import { ELEARNING } from "./components/learning/contributions";
import { ELEARNING_WITH_COURSEWORK } from "./components/learning/discussions";
import { PEER_REVIEW } from "./components/peer/contributions";
import { WEBSITE } from "./components/site/announcements";
import { TIMETABLE } from "./components/timetable/contributions";
import { SCHOOL_YEARS } from "./components/years/contributions";

/**
 * Every module's fillings for the slots pages declare. A slot shows only
 * those of the modules on at the school.
 */
export const MODULE_FILLINGS: readonly ModuleFillings[] = [
  ADMISSIONS_BY_GRADE,
  ADMISSIONS_IN_YEARS,
  COURSEWORK_WITH_FAMILIES,
  ELEARNING,
  ELEARNING_WITH_COURSEWORK,
  FAMILIES,
  GRADE_LEVELS,
  GRADE_LEVELS_IN_YEARS,
  GRADE_LEVELS_WITH_COURSEWORK,
  GRADEBOOK_IN_YEARS,
  HOMEROOMS,
  HOMEROOMS_IN_YEARS,
  PEER_REVIEW,
  SCHOOL_YEARS,
  TIMETABLE,
  WEBSITE,
];
