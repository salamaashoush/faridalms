import { queryOptions } from "@tanstack/react-query";

import { getPortalFace } from "~/server/portal";

export type PortalFace = NonNullable<Awaited<ReturnType<typeof getPortalFace>>>;

export const portalFaceQuery = (school: string) =>
  queryOptions({
    queryKey: ["portal-face", school],
    queryFn: () => getPortalFace({ data: { school } }),
    staleTime: 60_000,
  });

/** The face of a school's portal, or nothing without a school. */
export const faceQueryFor = (school: string | null) =>
  school ? portalFaceQuery(school) : null;
