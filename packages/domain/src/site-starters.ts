import type { ModuleId } from "./modules";
import type {
  BuiltStarter,
  SiteModules,
  Starter,
  StarterPage,
} from "./site-templates";

import { pageFits } from "./site-templates";

/** A page of the school's own, as a starter's page meets it. */
export interface SchoolPage {
  id: string;
  slug: string;
  isHome: boolean;
}

/**
 * What a starter's page meets at a school: nothing, so it is made new; the
 * school's own page at its address, which the school keeps or replaces; or
 * a module the school does not have, so it is left out.
 */
export type StarterPageFate = "new" | "taken" | "without";

export interface StarterPageReview {
  page: StarterPage;
  fate: StarterPageFate;
  /** The school's page at its address, when it has one. */
  pageId: string | null;
  /** The modules it is about that the school does not have. */
  missing: ModuleId[];
}

/**
 * The school's page a starter's page would meet: a home page meets the
 * school's home, whatever its slug, since both are the site's address "/";
 * any other meets the page at its slug.
 */
export function pageMet(
  page: StarterPage,
  pages: readonly SchoolPage[],
): SchoolPage | null {
  return (
    (page.home ? pages.find((row) => row.isHome) : undefined) ??
    pages.find((row) => row.slug === page.slug) ??
    null
  );
}

/** Each of a starter's pages, in order, as a school with these modules and pages meets it. */
export function reviewStarter(
  starter: Starter,
  modules: SiteModules,
  pages: readonly SchoolPage[],
): StarterPageReview[] {
  return starter.pages.map((page) => {
    const missing = (page.needs ?? []).filter((module) => !modules[module]);
    const met = pageFits(page, modules) ? pageMet(page, pages) : null;
    return {
      page,
      fate: missing.length ? "without" : met ? "taken" : "new",
      pageId: met?.id ?? null,
      missing,
    };
  });
}

type Planned = BuiltStarter["pages"][number];

export interface StarterWork {
  /** Pages whose address is free, made as drafts. */
  create: Planned[];
  /** The school's pages it chose to replace, each with the starter's words for it. */
  replace: { pageId: string; planned: Planned }[];
  /** Pages asked to be replaced that the starter does not build here, or the school does not have. */
  refused: string[];
}

/**
 * What applying a built starter does to a school's pages: each of its pages
 * whose address is free is made, each the school chose to replace by its
 * address gets the starter's words, and every other page the school has is
 * left as it is.
 */
export function starterWork(
  built: BuiltStarter,
  pages: readonly SchoolPage[],
  replace: readonly string[],
): StarterWork {
  const work: StarterWork = { create: [], replace: [], refused: [] };
  const met = new Map<string, string>();
  for (const planned of built.pages) {
    const page = pageMet(planned.plan, pages);
    if (!page) work.create.push(planned);
    else {
      met.set(planned.plan.slug, page.id);
      if (replace.includes(planned.plan.slug))
        work.replace.push({ pageId: page.id, planned });
    }
  }
  work.refused = [...new Set(replace)].filter((slug) => !met.has(slug));
  return work;
}
