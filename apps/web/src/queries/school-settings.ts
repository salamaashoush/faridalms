import { queryOptions } from "@tanstack/react-query";

import {
  getPictureSources,
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

export const pictureSourcesQuery = queryOptions({
  queryKey: ["school", "picture-sources"],
  queryFn: () => getPictureSources(),
});

export const schoolStorageQuery = queryOptions({
  queryKey: ["school", "storage"],
  queryFn: () => getSchoolStorage(),
});
