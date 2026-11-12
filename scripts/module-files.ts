import type { ModuleId } from "@faridalms/domain/modules";

import { MODULES } from "@faridalms/domain/modules";
import { guaranteedBy } from "@faridalms/domain/ownership";
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
    "apps/web/src/routes/_app/family/timetable.tsx",
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
    "apps/api/src/coursework/",
    "apps/api/src/quizzes/",
    "apps/api/src/systems/coursework.ts",
    "apps/api/src/systems/grading.ts",
    "apps/api/src/systems/bank.ts",
    "apps/api/src/systems/reading.ts",
  ],
  peer_review: [
    "packages/database/src/stores/peer-reviews.ts",
    "apps/api/src/peer/",
    "apps/api/src/systems/peer.ts",
  ],
  gradebook: [
    "packages/database/src/stores/gradebook.ts",
    "apps/api/src/gradebook/",
    "apps/api/src/systems/gradebook.ts",
  ],
  elearning: [
    "packages/database/src/tables/learning.ts",
    "packages/database/src/stores/learning.ts",
    "apps/api/src/learning/",
    "apps/api/src/systems/learning.ts",
  ],
  standards: [
    "packages/database/src/tables/standards.ts",
    "packages/database/src/stores/standards.ts",
    "apps/api/src/standards/",
    "apps/api/src/systems/standards.ts",
  ],
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
  "apps/api/src/homerooms/years.ts": {
    owner: "homerooms",
    needs: ["school_years"],
  },
  "apps/web/src/components/homerooms/years.tsx": {
    owner: "homerooms",
    needs: ["school_years"],
  },
  "apps/api/src/homerooms/timetable.ts": {
    owner: "homerooms",
    needs: ["timetable"],
  },
  "apps/api/src/attendance/timetable.ts": {
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
 * Files outside a module that still import its files, as `path -> module`,
 * by the change that removes them. The source check refuses an import
 * missing here and an entry that no longer occurs, so the list only
 * shrinks.
 */
export const PENDING_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "grade levels and admissions": [
    "apps/api/src/core/enrolment.ts -> school_years",
    "apps/api/src/systems/applications.ts -> school_years",
    "apps/api/src/systems/decisions.ts -> school_years",
    "apps/api/src/systems/home.ts -> school_years",
    "apps/api/src/systems/intakes.ts -> school_years",
  ],
  badges: ["apps/api/src/core/badges.ts -> school_years"],
  surfaces: [
    "apps/api/src/calendar/lessons.ts -> timetable",
    "apps/api/src/coding/rerun.ts -> elearning",
    "apps/api/src/files/exports.ts -> coursework",
    "apps/api/src/index.ts -> coursework",
    "apps/api/src/index.ts -> peer_review",
    "apps/api/src/systems/coursework.ts -> peer_review",
    "apps/api/src/systems/home.ts -> coursework",
    "apps/api/src/systems/home.ts -> elearning",
    "apps/api/src/systems/home.ts -> timetable",
    "apps/api/src/systems/records.ts -> coursework",
    "apps/api/src/systems/templates.ts -> elearning",
    "apps/web/src/components/classes/ClassRecord.tsx -> timetable",
    "apps/web/src/components/people/StudentOverview.tsx -> timetable",
    "packages/database/src/stores/search.ts -> elearning",
  ],
};

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

/**
 * Imports of a carved module's files from where they may not be imported,
 * and pending imports that no longer occur.
 */
export function moduleImportProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  const pending = new Set(Object.values(PENDING_IMPORTS).flat());
  const seen = new Set<string>();
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
      const entry = `${path} -> ${owner}`;
      if (pending.has(entry)) {
        seen.add(entry);
        continue;
      }
      problems.push(
        `${path}: imports ${specifier}, which belongs to the ${owner} module`,
      );
    }
  }
  for (const entry of pending)
    if (!seen.has(entry))
      problems.push(`${entry}: listed as pending but no longer imported`);
  return problems;
}
