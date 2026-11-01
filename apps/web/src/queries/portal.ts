import { queryOptions } from "@tanstack/react-query";

import { getLocale } from "~/i18n/runtime";
import { getPortalFace } from "~/server/portal";

export type PortalFace = NonNullable<Awaited<ReturnType<typeof getPortalFace>>>;

export const portalFaceQuery = (school: string, locale: "en" | "ar") =>
  queryOptions({
    queryKey: ["portal-face", school, locale],
    queryFn: () => getPortalFace({ data: { school, locale } }),
    staleTime: 60_000,
  });

/** The face of a school in the reader's language, or nothing without a school. */
export const faceQueryFor = (school: string | null) =>
  school ? portalFaceQuery(school, getLocale() === "ar" ? "ar" : "en") : null;
