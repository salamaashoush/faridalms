import type { SiteLocale } from "@faridalms/domain/website";

import { isNotFound, notFound, redirect } from "@tanstack/react-router";

import { getPublicRedirect } from "~/server/site";

import { siteHref } from "./render/parts";

function redirectHref(school: string, to: string, lang?: SiteLocale) {
  if (!to.startsWith("/")) return to;
  const query = lang && !to.includes("?") ? `?lang=${lang}` : "";
  return siteHref(school, to, query);
}

/**
 * Sends a visitor whose address found nothing on to where the school
 * redirected it, permanently, or answers not found. A visitor reading the
 * other language keeps it.
 */
export async function followRedirect(
  school: string,
  path: string,
  lang?: SiteLocale,
): Promise<never> {
  const { to } = await getPublicRedirect({ data: { school, path } });
  if (!to) throw notFound();
  throw redirect({ href: redirectHref(school, to, lang), statusCode: 301 });
}

/** What a loader found, or the redirect of the address that found nothing. */
export async function orRedirect<T>(
  load: Promise<T>,
  school: string,
  path: string,
  lang?: SiteLocale,
): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return followRedirect(school, path, lang);
  }
}
