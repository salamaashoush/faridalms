import type { ModuleContributions } from "./core/extension";
import type { ModuleWorker } from "./core/workers";

import { ADMISSIONS_CLOCK } from "./admissions/clock";
import { ADMISSIONS } from "./admissions/contributions";
import { ADMISSIONS_WITH_FAMILIES } from "./admissions/families";
import { ADMISSIONS_BY_GRADE } from "./admissions/grades";
import { ADMISSIONS_HEALTH } from "./admissions/health";
import { ADMISSIONS_WEBSITE } from "./admissions/website";
import { ADMISSIONS_IN_YEARS } from "./admissions/years";
import { ATTENDANCE } from "./attendance/contributions";
import { ATTENDANCE_WITH_TIMETABLE } from "./attendance/timetable";
import { BADGES_AT_CHECK_IN } from "./badges/attendance";
import { BADGES } from "./badges/contributions";
import { BADGES_IN_YEARS } from "./badges/years";
import { COURSEWORK } from "./coursework/contributions";
import { COURSEWORK_WITH_FAMILIES } from "./coursework/family-shares";
import { EARLY_YEARS } from "./early-years/contributions";
import { EARLY_YEARS_BY_GRADE } from "./early-years/grades";
import { FAMILIES_AT_THE_FRONT_DESK } from "./families/attendance";
import { FAMILIES } from "./families/contributions";
import { GRADE_LEVELS } from "./grade-levels/contributions";
import { GRADE_LEVELS_WITH_COURSEWORK } from "./grade-levels/coursework";
import { GRADE_LEVELS_IN_YEARS } from "./grade-levels/years";
import { GRADEBOOK_IN_YEARS } from "./gradebook/years";
import { HOMEROOMS_IN_ATTENDANCE } from "./homerooms/attendance";
import { HOMEROOMS } from "./homerooms/contributions";
import { HOMEROOMS_BY_GRADE } from "./homerooms/grades";
import { HOMEROOMS_IN_TIMETABLE } from "./homerooms/timetable";
import { HOMEROOMS_IN_YEARS } from "./homerooms/years";
import { ELEARNING } from "./learning/contributions";
import { ELEARNING_WITH_COURSEWORK } from "./learning/discussions";
import { ELEARNING_READINGS } from "./learning/reading";
import { PROGRAM_RERUNS } from "./learning/rerun";
import { ELEARNING_IN_YEARS } from "./learning/years";
import { PEER_REVIEW_CLOCK } from "./peer/clock";
import { PEER_REVIEW } from "./peer/contributions";
import { QUIZ_CLOCK } from "./quizzes/clock";
import { SMS } from "./sms/contributions";
import { STANDARDS } from "./standards/contributions";
import { STANDARDS_FROM_LESSONS } from "./standards/lessons";
import { STANDARDS_FROM_WORK } from "./standards/work";
import { STUDENT_RECORDS } from "./student-records/contributions";
import { STUDENT_RECORDS_WITH_FAMILIES } from "./student-records/families";
import { TIMETABLE } from "./timetable/contributions";
import { TIMETABLE_FEED } from "./timetable/feed";
import { WEBSITE_ANNOUNCEMENTS } from "./website/announcements";
import { WEBSITE } from "./website/contributions";
import { SCHOOL_YEARS } from "./years/contributions";
import { SCHOOL_YEARS_ON_WEBSITE } from "./years/website";

/**
 * Every module's contributions to the points core and the modules declare.
 * A point yields only those of the modules on at the school.
 */
export const MODULE_EXTENSIONS: readonly ModuleContributions[] = [
  ADMISSIONS,
  ADMISSIONS_BY_GRADE,
  ADMISSIONS_HEALTH,
  ADMISSIONS_IN_YEARS,
  ADMISSIONS_WEBSITE,
  ADMISSIONS_WITH_FAMILIES,
  ATTENDANCE,
  ATTENDANCE_WITH_TIMETABLE,
  BADGES,
  BADGES_AT_CHECK_IN,
  BADGES_IN_YEARS,
  COURSEWORK,
  COURSEWORK_WITH_FAMILIES,
  EARLY_YEARS,
  EARLY_YEARS_BY_GRADE,
  ELEARNING,
  ELEARNING_IN_YEARS,
  ELEARNING_READINGS,
  ELEARNING_WITH_COURSEWORK,
  FAMILIES,
  FAMILIES_AT_THE_FRONT_DESK,
  GRADE_LEVELS,
  GRADE_LEVELS_IN_YEARS,
  GRADE_LEVELS_WITH_COURSEWORK,
  GRADEBOOK_IN_YEARS,
  HOMEROOMS,
  HOMEROOMS_IN_ATTENDANCE,
  HOMEROOMS_BY_GRADE,
  HOMEROOMS_IN_TIMETABLE,
  HOMEROOMS_IN_YEARS,
  PEER_REVIEW,
  SCHOOL_YEARS,
  SCHOOL_YEARS_ON_WEBSITE,
  SMS,
  STANDARDS,
  STANDARDS_FROM_LESSONS,
  STANDARDS_FROM_WORK,
  STUDENT_RECORDS,
  STUDENT_RECORDS_WITH_FAMILIES,
  TIMETABLE,
  TIMETABLE_FEED,
  WEBSITE,
  WEBSITE_ANNOUNCEMENTS,
];

/**
 * Every module's background worker, which the process starts with its own.
 * Each acts for a school only where its module is on.
 */
export const MODULE_WORKERS: readonly ModuleWorker[] = [
  ADMISSIONS_CLOCK,
  PEER_REVIEW_CLOCK,
  PROGRAM_RERUNS,
  QUIZ_CLOCK,
];
