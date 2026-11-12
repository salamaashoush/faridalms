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
};

/**
 * A module's files that contribute to the points or fill the slots of a
 * module it does not require: the code's link table between the two. Such
 * a file belongs to its owner and may import what its needs own as well;
 * only the composition roots import it, and its contributions run where
 * the owner and its needs are on.
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
};

/**
 * Files outside a module that still import its files, as `path -> module`,
 * by the change that removes them. The source check refuses an import
 * missing here and an entry that no longer occurs, so the list only
 * shrinks.
 */
export const PENDING_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "periods and days": [
    "apps/api/src/calendar/lessons.ts -> school_years",
    "apps/api/src/systems/absence-reports.ts -> school_years",
    "apps/api/src/systems/attendance.ts -> school_years",
    "apps/api/src/systems/cover.ts -> school_years",
    "apps/api/src/systems/follow-up.ts -> school_years",
    "apps/api/src/systems/front-desk.ts -> school_years",
    "apps/api/src/systems/periods.ts -> school_years",
    "apps/api/src/systems/school-days.ts -> school_years",
    "apps/api/src/systems/timetable.ts -> school_years",
    "apps/web/src/components/attendance/Board.tsx -> school_years",
    "apps/web/src/components/attendance/FollowUp.tsx -> school_years",
    "apps/web/src/components/attendance/MyRegisters.tsx -> school_years",
    "apps/web/src/components/timetable/Cover.tsx -> school_years",
    "apps/web/src/components/timetable/WeekGrid.tsx -> school_years",
    "apps/web/src/routes/_app/_staff/timetable.tsx -> school_years",
    "packages/database/src/stores/day-plan.ts -> school_years",
  ],
  "coursework, e-learning and gradebook": [
    "apps/api/src/core/coursework-access.ts -> school_years",
    "apps/api/src/core/module-discussions.ts -> school_years",
    "apps/api/src/systems/coursework.ts -> school_years",
    "apps/api/src/systems/gradebook.ts -> school_years",
    "apps/api/src/systems/learning.ts -> school_years",
    "apps/api/src/systems/reading.ts -> school_years",
    "apps/api/src/systems/standards.ts -> school_years",
    "apps/web/src/components/grading/RegradeSheet.tsx -> school_years",
    "apps/web/src/routes/_app/_staff/modules.tsx -> school_years",
    "apps/web/src/routes/_app/_staff/year-map.tsx -> school_years",
  ],
  "grade levels and admissions": [
    "apps/api/src/core/enrolment.ts -> school_years",
    "apps/api/src/systems/applications.ts -> school_years",
    "apps/api/src/systems/decisions.ts -> school_years",
    "apps/api/src/systems/home.ts -> school_years",
    "apps/api/src/systems/intakes.ts -> school_years",
  ],
  badges: ["apps/api/src/core/badges.ts -> school_years"],
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
      if (link && link !== path) {
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
