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

/** Imports of a carved module's files from where they may not be imported. */
export function moduleImportProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    if (COMPOSITION_ROOTS.includes(path) || TESTS.test(path)) continue;
    const own = ownerOf(path);
    const allowed = new Set<ModuleId>(
      own ? [own, ...guaranteedBy(own, MODULES)] : [],
    );
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      if (!specifier) continue;
      const target = resolved(path, specifier);
      if (target === null) continue;
      const owner = ownerOf(target);
      if (owner && !allowed.has(owner))
        problems.push(
          `${path}: imports ${specifier}, which belongs to the ${owner} module`,
        );
    }
  }
  return problems;
}
