import { redirect } from "@tanstack/react-router";

import { hostView, portalHref } from "./host";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A school's code as a link names it, or nothing when it names none. */
export function linkedSlug(value: string | undefined): string | undefined {
  const slug = value?.trim().toLowerCase();
  return slug && SLUG.test(slug) ? slug : undefined;
}

/**
 * The bare portal domain signs nobody in, so each school's sessions stay on
 * its own origin. A portal page reached there goes on to that page of the
 * school a link names, else of the school the browser signed in to there
 * last. Without either it stays, or goes to `otherwise` when given.
 */
export function leaveBareDomain(
  auth: { remembered?: string },
  path: string,
  options: { linked?: string; otherwise?: "/sign-in" } = {},
) {
  if (!hostView().bare) return;
  const school = options.linked ?? auth.remembered;
  if (school) throw redirect({ href: portalHref(school, path) });
  if (options.otherwise) throw redirect({ to: options.otherwise });
}
