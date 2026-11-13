import type { ModuleFillings } from "./utils/extension";

import { ADMISSIONS } from "./components/admissions/contributions";
import { ADMISSIONS_WITH_FAMILIES } from "./components/admissions/families";
import { ADMISSIONS_BY_GRADE } from "./components/admissions/grades";
import { ADMISSIONS_IN_YEARS } from "./components/admissions/years";
import { ATTENDANCE } from "./components/attendance/contributions";
import { ATTENDANCE_WITH_FAMILIES } from "./components/attendance/families";
import { ATTENDANCE_WITH_TIMETABLE } from "./components/attendance/timetable";
import { BADGES } from "./components/badges/contributions";
import { CODING } from "./components/coding/contributions";
import { CODING_IN_LESSONS } from "./components/coding/learning";
import { COURSEWORK } from "./components/coursework/contributions";
import { COURSEWORK_WITH_FAMILIES } from "./components/coursework/family-shares";
import { CUSTOM_DOMAINS } from "./components/custom-domains/contributions";
import { EARLY_YEARS } from "./components/early-years/contributions";
import { FAMILIES } from "./components/families/contributions";
import { FAMILIES_ON_WEBSITE } from "./components/families/website";
import { FAMILIES_IN_YEARS } from "./components/families/years";
import { GRADE_LEVELS } from "./components/grade-levels/contributions";
import { GRADE_LEVELS_WITH_COURSEWORK } from "./components/grade-levels/coursework";
import { GRADE_LEVELS_IN_SETUP } from "./components/grade-levels/setup";
import { GRADE_LEVELS_ON_WEBSITE } from "./components/grade-levels/website";
import { GRADE_LEVELS_IN_YEARS } from "./components/grade-levels/years";
import { GRADEBOOK } from "./components/gradebook/contributions";
import { GRADEBOOK_WITH_STANDARDS } from "./components/gradebook/standards";
import { GRADEBOOK_IN_YEARS } from "./components/gradebook/years";
import { STUDENT_RECORDS } from "./components/health/contributions";
import { STUDENT_RECORDS_WITH_FAMILIES } from "./components/health/families";
import { HOMEROOMS } from "./components/homerooms/contributions";
import { HOMEROOMS_IN_YEARS } from "./components/homerooms/years";
import { ELEARNING } from "./components/learning/contributions";
import { ELEARNING_WITH_COURSEWORK } from "./components/learning/discussions";
import { ELEARNING_IN_YEARS } from "./components/learning/years";
import { PEER_REVIEW } from "./components/peer/contributions";
import { WEBSITE } from "./components/site/announcements";
import { STANDARDS } from "./components/standards/contributions";
import { STANDARDS_IN_LESSONS } from "./components/standards/lessons";
import { STANDARDS_IN_WORK } from "./components/standards/work";
import { TIMETABLE } from "./components/timetable/contributions";
import { SCHOOL_YEARS } from "./components/years/contributions";
import { SCHOOL_YEARS_ON_WEBSITE } from "./components/years/website";

/**
 * Every module's fillings for the slots pages declare. A slot shows only
 * those of the modules on at the school.
 */
export const MODULE_FILLINGS: readonly ModuleFillings[] = [
  ADMISSIONS,
  ADMISSIONS_BY_GRADE,
  ADMISSIONS_WITH_FAMILIES,
  ADMISSIONS_IN_YEARS,
  ATTENDANCE,
  ATTENDANCE_WITH_TIMETABLE,
  ATTENDANCE_WITH_FAMILIES,
  BADGES,
  CODING,
  CODING_IN_LESSONS,
  COURSEWORK,
  COURSEWORK_WITH_FAMILIES,
  CUSTOM_DOMAINS,
  EARLY_YEARS,
  ELEARNING,
  ELEARNING_IN_YEARS,
  ELEARNING_WITH_COURSEWORK,
  FAMILIES,
  FAMILIES_IN_YEARS,
  FAMILIES_ON_WEBSITE,
  GRADEBOOK,
  GRADEBOOK_IN_YEARS,
  GRADEBOOK_WITH_STANDARDS,
  GRADE_LEVELS,
  GRADE_LEVELS_IN_SETUP,
  GRADE_LEVELS_IN_YEARS,
  GRADE_LEVELS_ON_WEBSITE,
  GRADE_LEVELS_WITH_COURSEWORK,
  HOMEROOMS,
  HOMEROOMS_IN_YEARS,
  PEER_REVIEW,
  SCHOOL_YEARS,
  SCHOOL_YEARS_ON_WEBSITE,
  STANDARDS,
  STANDARDS_IN_LESSONS,
  STANDARDS_IN_WORK,
  STUDENT_RECORDS,
  STUDENT_RECORDS_WITH_FAMILIES,
  TIMETABLE,
  WEBSITE,
];
