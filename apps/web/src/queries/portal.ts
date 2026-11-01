import { queryOptions } from "@tanstack/react-query";

import { getLocale } from "~/i18n/runtime";
import { findSchools, getPortalFace } from "~/server/portal";

export type PortalFace = NonNullable<Awaited<ReturnType<typeof getPortalFace>>>;

export const portalFaceQuery = (school: string, locale: "en" | "ar") =>
  queryOptions({
    queryKey: ["portal-face", school, locale],
    queryFn: () => getPortalFace({ data: { school, locale } }),
    staleTime: 60_000,
  });

export const schoolFinderQuery = (query: string) =>
  queryOptions({
    queryKey: ["school-finder", query],
    queryFn: () => findSchools({ data: { query } }),
    staleTime: 60_000,
  });

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The school a page before sign-in is for: the one the portal's host names,
 * otherwise the one an emailed or printed link names on the bare domain.
 */
export function linkedSchool(
  auth: { school: string | null; schoolFromHost: boolean },
  linked: string | undefined,
): string | null {
  if (auth.schoolFromHost) return auth.school;
  const slug = linked?.trim().toLowerCase();
  return slug && SLUG.test(slug) ? slug : null;
}

/** The face of a school in the reader's language, or nothing without a school. */
export const faceQueryFor = (school: string | null) =>
  school ? portalFaceQuery(school, getLocale() === "ar" ? "ar" : "en") : null;
