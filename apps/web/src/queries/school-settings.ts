import { queryOptions } from "@tanstack/react-query";

import { getSchoolFeatures, getSchoolProfile } from "~/server/school-settings";

export const schoolProfileQuery = queryOptions({
  queryKey: ["school", "profile"],
  queryFn: () => getSchoolProfile(),
});

export const schoolFeaturesQuery = queryOptions({
  queryKey: ["school", "features"],
  queryFn: () => getSchoolFeatures(),
});
