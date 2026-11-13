import type { ModuleId } from "@faridalms/domain/modules";
import type { Ownership } from "@faridalms/domain/ownership";

import { TABLE_OWNERS } from "@faridalms/database/ownership";
import { MODULE_IDS, MODULES } from "@faridalms/domain/modules";
import { guaranteedBy, presentWith } from "@faridalms/domain/ownership";
import { dirname, join, normalize } from "node:path";

/**
 * The files each module carved out of core keeps for itself, by path or by
 * folder (ending in a slash). Nothing else imports them but the module's
 * own files, a module that requires it in every alternative, and the
 * composition roots.
 */
export const MODULE_FILES: Partial<Record<ModuleId, readonly string[]>> = {
  school_years: [
    "packages/database/src/tables/school-years.ts",
    "packages/database/src/stores/years.ts",
    "packages/database/src/stores/placements.ts",
    "packages/database/src/stores/rollovers.ts",
    "packages/domain/src/years.ts",
    "packages/domain/src/rollover.ts",
    "apps/api/src/years/",
    "apps/api/src/systems/years.ts",
    "apps/api/src/systems/rollover.ts",
    "apps/web/src/components/years/",
    "apps/web/src/server/years.ts",
    "apps/web/src/server/rollover.ts",
    "apps/web/src/queries/years.ts",
    "apps/web/src/queries/rollover.ts",
    "apps/web/src/routes/_app/_staff/academic-years.tsx",
    "apps/web/src/routes/_app/_staff/academic-year-editor.tsx",
    "apps/web/src/routes/_app/_staff/rollover.tsx",
    "apps/web/src/routes/_app/years.$yearId.tsx",
  ],
  grade_levels: [
    "packages/database/src/tables/grade-levels.ts",
    "packages/database/src/stores/class-grades.ts",
    "packages/database/src/stores/student-grades.ts",
    "packages/database/src/stores/grade-audiences.ts",
    "packages/database/src/stores/grade-words.ts",
    "packages/domain/src/grade-levels.ts",
    "apps/api/src/grade-levels/",
    "apps/api/src/systems/grade-levels.ts",
    "apps/web/src/components/grade-levels/",
    "apps/web/src/server/grade-levels.ts",
    "apps/web/src/queries/grade-levels.ts",
  ],
  families: [
    "packages/database/src/tables/families.ts",
    "packages/database/src/stores/families.ts",
    "packages/database/src/stores/custody.ts",
    "packages/domain/src/families.ts",
    "packages/domain/src/family-roles.ts",
    "apps/api/src/families/",
    "apps/api/src/systems/guardians.ts",
    "apps/web/src/components/families/",
    "apps/web/src/server/families.ts",
    "apps/web/src/queries/families.ts",
    "apps/web/src/routes/_app/family.tsx",
    "apps/web/src/routes/_app/family/index.tsx",
    "apps/web/src/routes/_app/family/children.tsx",
    "apps/web/src/routes/_app/family/details.tsx",
    "apps/web/src/routes/_app/family/consents.tsx",
    "apps/web/src/routes/_app/family/messages.tsx",
  ],
  homerooms: [
    "packages/database/src/tables/homerooms.ts",
    "packages/database/src/stores/homerooms.ts",
    "packages/domain/src/homerooms.ts",
    "apps/api/src/homerooms/",
    "apps/api/src/systems/homerooms.ts",
    "apps/web/src/components/homerooms/",
    "apps/web/src/server/homerooms.ts",
    "apps/web/src/queries/homerooms.ts",
    "apps/web/src/routes/_app/_staff/homeroom-editor.tsx",
  ],
  timetable: [
    "packages/database/src/tables/timetable.ts",
    "packages/database/src/stores/timetable.ts",
    "packages/database/src/stores/cover.ts",
    "packages/database/src/stores/day-plan.ts",
    "packages/database/src/stores/periods.ts",
    "packages/database/src/stores/bell-schedules.ts",
    "packages/domain/src/timetable.ts",
    "packages/domain/src/cycle.ts",
    "apps/api/src/timetable/",
    "apps/api/src/systems/timetable.ts",
    "apps/api/src/systems/cover.ts",
    "apps/api/src/systems/periods.ts",
    "apps/web/src/components/timetable/",
    "apps/web/src/server/timetable.ts",
    "apps/web/src/server/periods.ts",
    "apps/web/src/queries/timetable.ts",
    "apps/web/src/queries/periods.ts",
    "apps/web/src/routes/_app/_staff/timetable.tsx",
    "apps/web/src/routes/_app/me/timetable.tsx",
  ],
  coursework: [
    "packages/database/src/tables/coursework.ts",
    "packages/database/src/tables/grading.ts",
    "packages/database/src/tables/programmes.ts",
    "packages/database/src/stores/coursework.ts",
    "packages/database/src/stores/grading.ts",
    "packages/database/src/stores/quizzes.ts",
    "packages/database/src/stores/bank.ts",
    "packages/database/src/stores/reading.ts",
    "packages/database/src/stores/coursework-search.ts",
    "apps/api/src/coursework/",
    "apps/api/src/quizzes/",
    "apps/api/src/systems/coursework.ts",
    "apps/api/src/systems/grading.ts",
    "apps/api/src/systems/bank.ts",
    "apps/api/src/systems/reading.ts",
    "apps/web/src/components/coursework/",
    "apps/web/src/components/grading/",
    "apps/web/src/components/reading/",
    "apps/web/src/server/coursework.ts",
    "apps/web/src/server/grading.ts",
    "apps/web/src/server/reading.ts",
    "apps/web/src/server/bank.ts",
    "apps/web/src/queries/coursework.ts",
    "apps/web/src/queries/grading.ts",
    "apps/web/src/queries/reading.ts",
    "apps/web/src/routes/_app/_staff/assignments.tsx",
    "apps/web/src/routes/_app/_staff/assignment-editor.tsx",
    "apps/web/src/routes/_app/_staff/grading.tsx",
    "apps/web/src/routes/_app/assignments/",
    "apps/web/src/routes/_app/me/assignments.tsx",
    "apps/web/src/routes/exports/assignments.$assignmentId.ts",
    "apps/web/src/routes/exports/students.$studentId.ts",
  ],
  peer_review: [
    "packages/database/src/tables/peer-reviews.ts",
    "packages/database/src/stores/peer-reviews.ts",
    "packages/domain/src/peer-review.ts",
    "apps/api/src/peer/",
    "apps/api/src/systems/peer.ts",
    "apps/web/src/components/peer/",
    "apps/web/src/server/peer.ts",
    "apps/web/src/queries/peer.ts",
  ],
  gradebook: [
    "packages/database/src/tables/gradebook.ts",
    "packages/database/src/stores/gradebook.ts",
    "apps/api/src/gradebook/",
    "apps/api/src/systems/gradebook.ts",
    "apps/web/src/components/gradebook/",
    "apps/web/src/server/gradebook.ts",
    "apps/web/src/queries/gradebook.ts",
    "apps/web/src/routes/_app/_staff/gradebook.tsx",
    "apps/web/src/routes/_app/me/grades.tsx",
  ],
  elearning: [
    "packages/database/src/tables/learning.ts",
    "packages/database/src/stores/learning.ts",
    "packages/database/src/stores/learning-search.ts",
    "apps/api/src/learning/",
    "apps/api/src/systems/learning.ts",
    "apps/web/src/components/learning/",
    "apps/web/src/server/learning.ts",
    "apps/web/src/queries/learning.ts",
    "apps/web/src/routes/_app/_staff/modules.tsx",
    "apps/web/src/routes/_app/_staff/module-editor.tsx",
    "apps/web/src/routes/_app/_staff/module-plan.tsx",
    "apps/web/src/routes/_app/_staff/lesson-editor.tsx",
    "apps/web/src/routes/_app/_staff/board.$pacedId.tsx",
    "apps/web/src/routes/_app/_staff/live.$pacedId.tsx",
    "apps/web/src/routes/_app/modules/",
    "apps/web/src/routes/_app/me/modules.tsx",
    "apps/web/src/routes/_app/lessons.$lessonId.tsx",
    "apps/web/src/routes/_app/lesson-frame.$lessonId.tsx",
    "apps/web/src/routes/_app/practice.$moduleId.tsx",
  ],
  standards: [
    "packages/database/src/tables/standards.ts",
    "packages/database/src/stores/standards.ts",
    "apps/api/src/standards/",
    "apps/api/src/systems/standards.ts",
    "apps/web/src/components/standards/",
    "apps/web/src/server/standards.ts",
    "apps/web/src/queries/standards.ts",
    "apps/web/src/routes/_app/standards/",
  ],
  admissions: [
    "packages/database/src/tables/admissions.ts",
    "packages/database/src/stores/admissions.ts",
    "packages/database/src/stores/admission-decisions.ts",
    "packages/database/src/stores/enquiries.ts",
    "apps/api/src/admissions/",
    "apps/api/src/systems/admissions.ts",
    "apps/api/src/systems/intakes.ts",
    "apps/api/src/systems/applications.ts",
    "apps/api/src/systems/applying.ts",
    "apps/api/src/systems/decisions.ts",
    "apps/web/src/components/admissions/",
    "apps/web/src/server/admissions.ts",
    "apps/web/src/queries/admissions.ts",
    "apps/web/src/routes/_app/admissions/",
    "apps/web/src/routes/_app/me/applications.tsx",
    "apps/web/src/routes/_app/family/applications.tsx",
    "apps/web/src/routes/apply.tsx",
    "apps/web/src/routes/_auth/register.tsx",
  ],
  attendance: [
    "packages/database/src/tables/attendance.ts",
    "packages/database/src/stores/attendance.ts",
    "packages/database/src/stores/absence-reports.ts",
    "packages/database/src/stores/front-desk.ts",
    "packages/database/src/stores/follow-up.ts",
    "apps/api/src/attendance/",
    "apps/api/src/systems/attendance.ts",
    "apps/api/src/systems/absence-reports.ts",
    "apps/api/src/systems/front-desk.ts",
    "apps/api/src/systems/follow-up.ts",
    "apps/web/src/components/attendance/",
    "apps/web/src/server/attendance.ts",
    "apps/web/src/queries/attendance.ts",
    "apps/web/src/routes/_app/_staff/attendance.tsx",
    "apps/web/src/routes/_app/registers.$classId.tsx",
    "apps/web/src/routes/_app/me/attendance.tsx",
  ],
  website: [
    "packages/database/src/tables/site.ts",
    "packages/database/src/stores/site.ts",
    "packages/database/src/stores/site-classes.ts",
    "apps/api/src/website/",
    "apps/api/src/systems/site.ts",
    "apps/web/src/components/site/",
    "apps/web/src/server/site.ts",
    "apps/web/src/queries/site.ts",
    "apps/web/src/routes/_app/_staff/website.tsx",
    "apps/web/src/routes/_app/_staff/site-page-editor.tsx",
    "apps/web/src/routes/site/",
  ],
  student_records: [
    "packages/database/src/tables/student-records.ts",
    "packages/database/src/stores/records.ts",
    "packages/database/src/stores/arrangements.ts",
    "apps/api/src/student-records/",
    "apps/api/src/systems/records.ts",
    "apps/web/src/components/health/",
    "apps/web/src/server/records.ts",
    "apps/web/src/queries/records.ts",
    "apps/web/src/routes/_app/health-changes.tsx",
    "apps/web/src/routes/_app/me/health.tsx",
  ],
  badges: [
    "packages/database/src/stores/badges.ts",
    "apps/api/src/badges/",
    "apps/api/src/systems/badges.ts",
    "apps/web/src/components/badges/",
    "apps/web/src/server/badges.ts",
    "apps/web/src/queries/badges.ts",
    "apps/web/src/routes/_app/badges.$classId.tsx",
    "apps/web/src/routes/badge.tsx",
  ],
  early_years: [
    "packages/database/src/tables/early-years.ts",
    "packages/database/src/stores/young-classes.ts",
    "packages/domain/src/early-years.ts",
    "apps/api/src/early-years/",
    "apps/api/src/systems/early-years.ts",
    "apps/web/src/components/early-years/",
    "apps/web/src/server/early-years.ts",
    "apps/web/src/queries/early-years.ts",
  ],
  coding: ["apps/web/src/components/coding/"],
  custom_domains: ["apps/web/src/components/custom-domains/"],
  sso: ["packages/database/src/tables/sso.ts"],
  sms: ["apps/api/src/sms/"],
};

/**
 * A module's files that contribute to the points or fill the slots of a
 * module it does not require: the code's link table between the two. Such
 * a file belongs to its owner and may import what its needs own as well;
 * only the composition roots and the owner's other link files with the
 * same needs import it, and its contributions run where the owner and its
 * needs are on.
 */
export const LINK_FILES: Readonly<
  Record<string, { owner: ModuleId; needs: readonly ModuleId[] }>
> = {
  "apps/api/src/badges/attendance.ts": {
    owner: "badges",
    needs: ["attendance"],
  },
  "apps/api/src/badges/years.ts": {
    owner: "badges",
    needs: ["school_years"],
  },
  "packages/database/src/stores/young-grades.ts": {
    owner: "early_years",
    needs: ["grade_levels"],
  },
  "apps/api/src/early-years/grades.ts": {
    owner: "early_years",
    needs: ["grade_levels"],
  },
  "apps/web/src/components/early-years/learning.tsx": {
    owner: "early_years",
    needs: ["elearning"],
  },
  "apps/api/src/homerooms/years.ts": {
    owner: "homerooms",
    needs: ["school_years"],
  },
  "apps/web/src/components/homerooms/years.tsx": {
    owner: "homerooms",
    needs: ["school_years"],
  },
  "apps/api/src/homerooms/attendance.ts": {
    owner: "homerooms",
    needs: ["attendance"],
  },
  "apps/api/src/homerooms/timetable.ts": {
    owner: "homerooms",
    needs: ["timetable"],
  },
  "apps/api/src/admissions/health.ts": {
    owner: "admissions",
    needs: ["student_records"],
  },
  "apps/api/src/admissions/website.ts": {
    owner: "admissions",
    needs: ["website"],
  },
  "apps/api/src/attendance/timetable.ts": {
    owner: "attendance",
    needs: ["timetable"],
  },
  "apps/web/src/components/attendance/timetable.tsx": {
    owner: "attendance",
    needs: ["timetable"],
  },
  "packages/database/src/tables/register-periods.ts": {
    owner: "attendance",
    needs: ["timetable"],
  },
  "packages/database/src/stores/register-periods.ts": {
    owner: "attendance",
    needs: ["timetable"],
  },
  "packages/database/src/tables/term-grades.ts": {
    owner: "gradebook",
    needs: ["school_years"],
  },
  "packages/database/src/stores/term-grades.ts": {
    owner: "gradebook",
    needs: ["school_years"],
  },
  "apps/api/src/gradebook/years.ts": {
    owner: "gradebook",
    needs: ["school_years"],
  },
  "apps/web/src/components/gradebook/years.tsx": {
    owner: "gradebook",
    needs: ["school_years"],
  },
  "apps/web/src/components/gradebook/RegradeSheet.tsx": {
    owner: "gradebook",
    needs: ["school_years"],
  },
  "packages/database/src/tables/module-discussions.ts": {
    owner: "elearning",
    needs: ["coursework"],
  },
  "packages/database/src/stores/module-discussions.ts": {
    owner: "elearning",
    needs: ["coursework"],
  },
  "apps/api/src/learning/discussions.ts": {
    owner: "elearning",
    needs: ["coursework"],
  },
  "apps/api/src/learning/years.ts": {
    owner: "elearning",
    needs: ["school_years"],
  },
  "apps/api/src/learning/reading.ts": {
    owner: "elearning",
    needs: ["coursework"],
  },
  "apps/web/src/components/learning/discussions.tsx": {
    owner: "elearning",
    needs: ["coursework"],
  },
  "apps/web/src/routes/_app/_staff/year-map.tsx": {
    owner: "elearning",
    needs: ["school_years"],
  },
  "packages/database/src/tables/lesson-sittings.ts": {
    owner: "standards",
    needs: ["elearning"],
  },
  "packages/database/src/stores/lesson-sittings.ts": {
    owner: "standards",
    needs: ["elearning"],
  },
  "apps/api/src/standards/lessons.ts": {
    owner: "standards",
    needs: ["elearning"],
  },
  "packages/database/src/tables/work-sittings.ts": {
    owner: "standards",
    needs: ["coursework"],
  },
  "packages/database/src/stores/work-sittings.ts": {
    owner: "standards",
    needs: ["coursework"],
  },
  "apps/api/src/standards/work.ts": {
    owner: "standards",
    needs: ["coursework"],
  },
  "packages/database/src/tables/programme-grades.ts": {
    owner: "grade_levels",
    needs: ["coursework"],
  },
  "packages/database/src/stores/programme-grades.ts": {
    owner: "grade_levels",
    needs: ["coursework"],
  },
  "apps/api/src/grade-levels/coursework.ts": {
    owner: "grade_levels",
    needs: ["coursework"],
  },
  "apps/web/src/components/grade-levels/coursework.tsx": {
    owner: "grade_levels",
    needs: ["coursework"],
  },
  "apps/web/src/components/grade-levels/coursework-years.tsx": {
    owner: "grade_levels",
    needs: ["coursework", "school_years"],
  },
  "apps/api/src/grade-levels/years.ts": {
    owner: "grade_levels",
    needs: ["school_years"],
  },
  "apps/web/src/components/grade-levels/years.tsx": {
    owner: "grade_levels",
    needs: ["school_years"],
  },
  "apps/web/src/components/grade-levels/families.tsx": {
    owner: "grade_levels",
    needs: ["families"],
  },
  "apps/web/src/components/grade-levels/website.tsx": {
    owner: "grade_levels",
    needs: ["website"],
  },
  "apps/api/src/years/website.ts": {
    owner: "school_years",
    needs: ["website"],
  },
  "apps/web/src/components/years/website.tsx": {
    owner: "school_years",
    needs: ["website"],
  },
  "apps/api/src/homerooms/grades.ts": {
    owner: "homerooms",
    needs: ["grade_levels"],
  },
  "apps/web/src/components/homerooms/grades.tsx": {
    owner: "homerooms",
    needs: ["grade_levels"],
  },
  "packages/database/src/tables/intake-years.ts": {
    owner: "admissions",
    needs: ["school_years"],
  },
  "packages/database/src/stores/intake-years.ts": {
    owner: "admissions",
    needs: ["school_years"],
  },
  "apps/api/src/admissions/years.ts": {
    owner: "admissions",
    needs: ["school_years"],
  },
  "apps/web/src/components/admissions/years.tsx": {
    owner: "admissions",
    needs: ["school_years"],
  },
  "packages/database/src/tables/intake-grades.ts": {
    owner: "admissions",
    needs: ["grade_levels"],
  },
  "packages/database/src/stores/intake-grades.ts": {
    owner: "admissions",
    needs: ["grade_levels"],
  },
  "apps/api/src/admissions/grades.ts": {
    owner: "admissions",
    needs: ["grade_levels"],
  },
  "apps/web/src/components/admissions/grades.tsx": {
    owner: "admissions",
    needs: ["grade_levels"],
  },
  "apps/web/src/components/admissions/grades-years.tsx": {
    owner: "admissions",
    needs: ["grade_levels", "school_years"],
  },
  "apps/web/src/components/admissions/grades-families.tsx": {
    owner: "admissions",
    needs: ["grade_levels", "families"],
  },
  "apps/web/src/components/admissions/grades-families-years.tsx": {
    owner: "admissions",
    needs: ["grade_levels", "families", "school_years"],
  },
  "apps/web/src/components/admissions/grades-website.tsx": {
    owner: "admissions",
    needs: ["grade_levels", "website"],
  },
  "apps/api/src/admissions/families.ts": {
    owner: "admissions",
    needs: ["families"],
  },
  "apps/web/src/components/admissions/families.tsx": {
    owner: "admissions",
    needs: ["families"],
  },
  "apps/api/src/families/attendance.ts": {
    owner: "families",
    needs: ["attendance"],
  },
  "apps/web/src/components/families/website.tsx": {
    owner: "families",
    needs: ["website"],
  },
  "apps/web/src/components/families/years.tsx": {
    owner: "families",
    needs: ["school_years"],
  },
  "apps/web/src/components/attendance/families.tsx": {
    owner: "attendance",
    needs: ["families"],
  },
  "packages/database/src/tables/family-shares.ts": {
    owner: "coursework",
    needs: ["families"],
  },
  "packages/database/src/stores/family-shares.ts": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/api/src/coursework/family-shares.ts": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/api/src/systems/family-shares.ts": {
    owner: "coursework",
    needs: ["families"],
  },
  "packages/database/src/tables/contact-changes.ts": {
    owner: "student_records",
    needs: ["families"],
  },
  "packages/database/src/stores/guardian-health.ts": {
    owner: "student_records",
    needs: ["families"],
  },
  "apps/api/src/student-records/families.ts": {
    owner: "student_records",
    needs: ["families"],
  },
  "apps/web/src/components/health/families.tsx": {
    owner: "student_records",
    needs: ["families"],
  },
  "apps/web/src/routes/_app/family/health.tsx": {
    owner: "student_records",
    needs: ["families"],
  },
  "apps/web/src/server/family-shares.ts": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/web/src/components/coursework/family-shares.tsx": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/web/src/components/coursework/SharedWork.tsx": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/web/src/routes/_app/family/assignments.tsx": {
    owner: "coursework",
    needs: ["families"],
  },
  "apps/web/src/routes/_app/family/grades.tsx": {
    owner: "gradebook",
    needs: ["families"],
  },
  "apps/web/src/components/gradebook/standards.tsx": {
    owner: "gradebook",
    needs: ["standards"],
  },
  "apps/web/src/routes/_app/family/timetable.tsx": {
    owner: "timetable",
    needs: ["families"],
  },
  "apps/web/src/routes/_app/family/attendance.tsx": {
    owner: "attendance",
    needs: ["families"],
  },
  "apps/web/src/routes/_app/family/modules.tsx": {
    owner: "elearning",
    needs: ["families"],
  },
  "apps/web/src/components/standards/lessons.tsx": {
    owner: "standards",
    needs: ["elearning"],
  },
  "apps/web/src/components/standards/PlanCoverage.tsx": {
    owner: "standards",
    needs: ["elearning"],
  },
  "apps/web/src/components/standards/work.tsx": {
    owner: "standards",
    needs: ["coursework"],
  },
  "apps/web/src/components/coding/learning.tsx": {
    owner: "coding",
    needs: ["elearning"],
  },
  "apps/web/src/components/coding/ProjectGallery.tsx": {
    owner: "coding",
    needs: ["elearning"],
  },
  "apps/web/src/components/coding/LiveProjects.tsx": {
    owner: "coding",
    needs: ["elearning"],
  },
};

/** Whether a link file may import another: one link between the same modules, split over files. */
function sameLink(from: string, to: string): boolean {
  const a = LINK_FILES[from];
  const b = LINK_FILES[to];
  return (
    a !== undefined &&
    b !== undefined &&
    a.owner === b.owner &&
    b.needs.every((need) => a.needs.includes(need))
  );
}

/**
 * Where every module's parts are put together: the API's router and
 * contributions, the web's contributions, the schema's table list, and the
 * seed and demonstration that fill a school with every module's records.
 */
export const COMPOSITION_ROOTS: readonly string[] = [
  "apps/api/src/router.ts",
  "apps/api/src/extensions.ts",
  "apps/web/src/extensions.ts",
  "packages/database/src/tables/index.ts",
  "packages/database/src/seed.ts",
  "packages/database/src/demo.ts",
];

const TESTS = /\.(?:test|spec)\.tsx?$/;

const SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

const PACKAGES: Record<string, string> = {
  "@faridalms/database/": "packages/database/src/",
  "@faridalms/domain/": "packages/domain/src/",
  "@faridalms/ui/": "packages/ui/src/",
  "@faridalms/editor/": "packages/editor/src/",
};

/** The repository path an import names, without its extension, or null for a package outside it. */
function resolved(from: string, specifier: string): string | null {
  for (const [prefix, folder] of Object.entries(PACKAGES))
    if (specifier.startsWith(prefix))
      return folder + specifier.slice(prefix.length);
  if (specifier.startsWith("~/") && from.startsWith("apps/web/"))
    return `apps/web/src/${specifier.slice(2)}`;
  if (specifier.startsWith("."))
    return normalize(join(dirname(from), specifier));
  return null;
}

const withoutExtension = (path: string) => path.replace(/\.tsx?$/, "");

function ownerOf(path: string): ModuleId | null {
  const link = LINK_FILES[path];
  if (link) return link.owner;
  for (const [module, owned] of Object.entries(MODULE_FILES))
    if (
      owned.some((entry) =>
        entry.endsWith("/")
          ? path.startsWith(entry)
          : withoutExtension(path) === withoutExtension(entry),
      )
    )
      return module as ModuleId;
  return null;
}

const linkOf = (path: string) =>
  Object.keys(LINK_FILES).find(
    (link) => withoutExtension(link) === withoutExtension(path),
  );

/** What a file may import of the modules' files: its own, what its module requires, and a link file's needs. */
function allowedFor(path: string): Set<ModuleId> {
  const own = ownerOf(path);
  const allowed = new Set<ModuleId>();
  for (const module of [
    ...(own ? [own] : []),
    ...(LINK_FILES[path]?.needs ?? []),
  ]) {
    allowed.add(module);
    for (const id of guaranteedBy(module, MODULES)) allowed.add(id);
  }
  return allowed;
}

/** Imports of a carved module's files from where they may not be imported. */
export function moduleImportProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    if (COMPOSITION_ROOTS.includes(path) || TESTS.test(path)) continue;
    const allowed = allowedFor(path);
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      if (!specifier) continue;
      const target = resolved(path, specifier);
      if (target === null) continue;
      const link = linkOf(target);
      if (link && link !== path && !sameLink(path, link)) {
        problems.push(`${path}: imports ${specifier}, a link file`);
        continue;
      }
      const owner = ownerOf(target);
      if (!owner || allowed.has(owner)) continue;
      problems.push(
        `${path}: imports ${specifier}, which belongs to the ${owner} module`,
      );
    }
  }
  return problems;
}

/**
 * Web files that may name every module the product has, each with why. A
 * file that names one module may only where it may import that module's
 * files.
 */
export const MODULE_CATALOGUES: Readonly<Record<string, string>> = {
  "apps/web/src/components/admin/FeaturesCard.tsx":
    "A school's plan card weighs every module, naming those it has and those on offer, so its administrators know what they hold and can ask about one they lack.",
};

const NAMED_MODULE = new RegExp(
  String.raw`\bmodules\??\.(${MODULE_IDS.join("|")})\b|\bmodules\[["'](${MODULE_IDS.join("|")})["']\]`,
  "g",
);
const EVERY_MODULE = /\b(?:MODULE_IDS|SWITCHED_MODULES|MODULE_LABEL)\b/;

/**
 * Web files that ask whether a module is on, or list every module, where
 * they may not: a module's word is read through the slot it fills.
 */
export function moduleNameProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    if (
      !path.startsWith("apps/web/src/") ||
      COMPOSITION_ROOTS.includes(path) ||
      TESTS.test(path)
    )
      continue;
    if (path in MODULE_CATALOGUES) continue;
    if (EVERY_MODULE.test(text))
      problems.push(`${path}: lists every module, which only a catalogue may`);
    const allowed = allowedFor(path);
    for (const match of text.matchAll(NAMED_MODULE)) {
      const id = (match[1] ?? match[2]) as ModuleId;
      if (!allowed.has(id))
        problems.push(
          `${path}: asks whether the ${id} module is on; read it through a slot the module fills`,
        );
    }
  }
  return problems;
}

/**
 * Modules whose tables and functions only their own files, link files that
 * need them and the composition roots name in SQL: where a reach rule lives,
 * a copy elsewhere would keep granting with the module off.
 */
export const SQL_CARVED: readonly ModuleId[] = [
  "families",
  "attendance",
  "website",
  "student_records",
  "badges",
  "coursework",
  "elearning",
  "school_years",
  "timetable",
  "admissions",
  "early_years",
];

/**
 * Files that name a carved module's tables for every module at once, each
 * with why it may.
 */
export const SQL_READERS: Readonly<Record<string, string>> = {
  "packages/database/src/stores/erasure.ts":
    "Erasure must reach a switched-off module's rows, which the law asks gone whatever the school has on.",
  "packages/database/src/gates.ts":
    "The retention and purpose registries list every table the catalogue gate checks.",
  "packages/database/src/audit.ts":
    "The audit registry lists every table whose changes are kept.",
  "packages/database/src/ownership.ts":
    "The ownership registry names every table with its owner.",
  "packages/database/src/erasure-rules.ts":
    "The erasure registry names every table that keys a person.",
};

/** Functions in the migrations that belong to a module, as tables do; the rest are core's. */
export const FUNCTION_OWNERS: Readonly<Record<string, Ownership>> = {
  "app.guardian_permits": { owner: "families" },
  "app.change_year_span": { owner: "school_years" },
  "app.register_period_held": { owner: "attendance", needs: ["timetable"] },
  "app.programme_of": { owner: "coursework" },
  "app.site_classes": { owner: "website" },
  "app.scale_version_of": { owner: "coursework" },
};

const ownershipOf = (name: string): Ownership =>
  TABLE_OWNERS[name] ?? FUNCTION_OWNERS[name] ?? { owner: "core" };

/** Whether rows a reader runs with exist wherever the table's rows can. */
const reaches = (reader: Ownership, table: Ownership) => {
  const present = presentWith(reader, MODULES);
  return [...presentWith(table, MODULES)].every((id) => present.has(id));
};

const carved = (table: Ownership) =>
  [...presentWith(table, MODULES)].some((id) => SQL_CARVED.includes(id));

const SQL_NAME = /\b(?:core|health)\.[a-z_]+\b|\bapp\.[a-z_]+(?=\s*\()/g;

/**
 * Names in SQL of a carved module's tables and functions from a file that
 * may not import the module: only its files, its link files, the
 * composition roots and the registries that span every module may.
 */
export function sqlNameProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    if (
      COMPOSITION_ROOTS.includes(path) ||
      TESTS.test(path) ||
      path in SQL_READERS ||
      !(
        path.startsWith("packages/database/src/") ||
        path.startsWith("apps/api/src/")
      )
    )
      continue;
    const allowed = allowedFor(path);
    const named = new Set(text.match(SQL_NAME) ?? []);
    for (const name of named) {
      const table = TABLE_OWNERS[name] ?? FUNCTION_OWNERS[name];
      if (!table || !carved(table)) continue;
      if ([...presentWith(table, MODULES)].every((id) => allowed.has(id)))
        continue;
      problems.push(
        `${path}: names ${name} in SQL, which only the module that owns it and its links may`,
      );
    }
  }
  return problems;
}

const FUNCTION =
  /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi;

/** Tables a migration's function names that its owner may not reach. */
export function functionBodyProblems(
  migrations: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  for (const { path, text } of migrations)
    for (const [, name, signature, body] of text.matchAll(FUNCTION)) {
      if (!name) continue;
      const reader = ownershipOf(name);
      for (const table of new Set(
        `${signature}${body}`.match(/\b(?:core|health|audit)\.[a-z_]+\b/g) ??
          [],
      )) {
        const owned = TABLE_OWNERS[table];
        if (!owned || reaches(reader, owned)) continue;
        problems.push(
          `${path}: ${name} names ${table}, which its owner may not reach`,
        );
      }
    }
  return problems;
}
