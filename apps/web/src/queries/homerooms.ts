import type { Views } from "@faridalms/domain/classes";
import type { HomeroomDirectoryQuery } from "@faridalms/domain/homerooms";

import { queryOptions } from "@tanstack/react-query";

import {
  getHomeroomDirectory,
  getHomeroomHistory,
  getHomeroomOfClass,
  getUnstaffedHomerooms,
} from "~/server/homerooms";

export const homeroomDirectoryQuery = (
  query: HomeroomDirectoryQuery,
  views: Views,
) => {
  const data = {
    q: query.q,
    grade: query.grade,
    ended: query.ended,
    views,
  };
  return queryOptions({
    queryKey: ["classes", "homerooms", data],
    queryFn: () => getHomeroomDirectory({ data }),
  });
};

export const homeroomOfClassQuery = (classId: string, on = "") => ({
  queryKey: ["classes", "homeroom-of", classId, on],
  queryFn: () => getHomeroomOfClass({ data: { classId, on } }),
});

export const homeroomHistoryQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["classes", "homeroom-history", studentId],
    queryFn: () => getHomeroomHistory({ data: { studentId } }),
  });

export const unstaffedHomeroomsQuery = {
  queryKey: ["classes", "homerooms-unstaffed"],
  queryFn: () => getUnstaffedHomerooms(),
};
