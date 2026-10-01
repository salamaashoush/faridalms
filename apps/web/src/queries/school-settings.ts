import { queryOptions } from "@tanstack/react-query";

import {
  getSchoolFeatures,
  getSchoolProfile,
  getSchoolStorage,
} from "~/server/school-settings";

export const schoolProfileQuery = queryOptions({
  queryKey: ["school", "profile"],
  queryFn: () => getSchoolProfile(),
});

export const schoolFeaturesQuery = queryOptions({
  queryKey: ["school", "features"],
  queryFn: () => getSchoolFeatures(),
});

export const schoolStorageQuery = queryOptions({
  queryKey: ["school", "storage"],
  queryFn: () => getSchoolStorage(),
});
