import type { PortalDoor } from "@faridalms/domain/site-sections";

import { queryOptions } from "@tanstack/react-query";

import { getLocale } from "~/i18n/runtime";
import { getPortalFace } from "~/server/portal";

export type PortalFace = NonNullable<Awaited<ReturnType<typeof getPortalFace>>>;

export const portalFaceQuery = (
  school: string,
  locale: "en" | "ar",
  door: PortalDoor = "sign-in",
) =>
  queryOptions({
    queryKey: ["portal-face", school, locale, door],
    queryFn: () => getPortalFace({ data: { school, locale, door } }),
    staleTime: 60_000,
  });

/** The face of a school at one of its doors in the reader's language, or nothing without a school. */
export const faceQueryFor = (
  school: string | null,
  door: PortalDoor = "sign-in",
) =>
  school
    ? portalFaceQuery(school, getLocale() === "ar" ? "ar" : "en", door)
    : null;
