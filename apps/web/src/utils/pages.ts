import type { ModuleId } from "@faridalms/domain/modules";

import type { ModuleFillings } from "./extension";

import { filled, fillingsOf, slot } from "./extension";

/**
 * The pages a module owns, by the start of their path. The navigation hides
 * what a school does not have and the app answers its pages as not found,
 * both from these declarations, so a page and its link cannot disagree.
 */
export const modulePages = slot<readonly string[]>("module pages");

/** The pages every school has, by the start of their path. */
export const CORE_PAGES: readonly string[] = [
  "/",
  "/today",
  "/classes",
  "/class-editor",
  "/students",
  "/student-editor",
  "/staff",
  "/staff-editor",
  "/people",
  "/profiles",
  "/messages",
  "/announcements",
  "/announcement-editor",
  "/calendar",
  "/event-editor",
  "/templates",
  "/media",
  "/settings",
  "/school-days",
  "/billing",
  "/privacy",
  "/consent-form-editor",
  "/notification-audit",
  "/notification-preferences",
  "/notifications",
  "/search",
  "/me",
  "/me/details",
  "/me/consents",
  "/me/messages",
  "/sign-in",
  "/forgot-password",
  "/auth",
  "/another-account",
  "/welcome",
  "/admin",
  "/teach",
  "/api",
  "/assistant",
  "/files",
  "/public-media",
  "/feeds",
  "/exports/media",
];

export const matchesPage = (path: string, prefix: string) =>
  prefix === "/"
    ? path === "/"
    : path === prefix || path.startsWith(`${prefix}/`);

/**
 * Whether a school shows a page: every declared start of its path is core's
 * or declared by a module filling that is on there. A family's view of
 * attendance sits under the family's pages, so it needs both.
 */
export function pageOn(
  extensions: readonly ModuleFillings[],
  modules: Readonly<Record<ModuleId, boolean>>,
  path: string,
): boolean {
  // Which pages a module has does not depend on the words a school chose.
  const on = new Set(
    filled(extensions, { modules, wording: {} }, modulePages).flat(),
  );
  const all = new Set(
    extensions.flatMap((entry) =>
      fillingsOf(entry, {})
        .filter((filling) => filling.slot === modulePages)
        .flatMap((filling) => filling.value as readonly string[]),
    ),
  );
  return [...all]
    .filter((prefix) => matchesPage(path, prefix))
    .every((prefix) => on.has(prefix));
}

/**
 * Who declares a page: core, or the module fillings whose prefix is the
 * most specific start of its path. Empty for a page nobody declares.
 */
export function pageOwnersOf(
  extensions: readonly ModuleFillings[],
  path: string,
): { core: boolean; modules: ModuleId[] } {
  const declared = extensions.flatMap((entry) =>
    fillingsOf(entry, {})
      .filter((filling) => filling.slot === modulePages)
      .flatMap((filling) =>
        (filling.value as readonly string[]).map((prefix) => ({
          prefix,
          module: entry.module,
        })),
      ),
  );
  const core = CORE_PAGES.filter((prefix) => matchesPage(path, prefix));
  const owned = declared.filter(({ prefix }) => matchesPage(path, prefix));
  const longest = Math.max(
    0,
    ...core.map((prefix) => prefix.length),
    ...owned.map(({ prefix }) => prefix.length),
  );
  return {
    core: core.some((prefix) => prefix.length === longest),
    modules: [
      ...new Set(
        owned
          .filter(({ prefix }) => prefix.length === longest)
          .map(({ module }) => module),
      ),
    ],
  };
}
