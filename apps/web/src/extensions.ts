import type { ModuleFillings } from "./utils/extension";

import { GRADEBOOK_IN_YEARS } from "./components/gradebook/years";
import { HOMEROOMS } from "./components/homerooms/contributions";
import { HOMEROOMS_IN_YEARS } from "./components/homerooms/years";
import { ELEARNING } from "./components/learning/contributions";
import { ELEARNING_WITH_COURSEWORK } from "./components/learning/discussions";
import { TIMETABLE } from "./components/timetable/contributions";
import { SCHOOL_YEARS } from "./components/years/contributions";

/**
 * Every module's fillings for the slots pages declare. A slot shows only
 * those of the modules on at the school.
 */
export const MODULE_FILLINGS: readonly ModuleFillings[] = [
  ELEARNING,
  ELEARNING_WITH_COURSEWORK,
  GRADEBOOK_IN_YEARS,
  HOMEROOMS,
  HOMEROOMS_IN_YEARS,
  SCHOOL_YEARS,
  TIMETABLE,
];
