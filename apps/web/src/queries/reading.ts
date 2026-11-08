import { queryOptions } from "@tanstack/react-query";

import {
  getMyReading,
  getReadingNorms,
  getStudentReading,
} from "~/server/reading";

export const readingNormsQuery = queryOptions({
  queryKey: ["reading", "norms"],
  queryFn: () => getReadingNorms(),
});

export const studentReadingQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["reading", "student", studentId],
    queryFn: () => getStudentReading({ data: { studentId } }),
  });

export const myReadingQuery = queryOptions({
  queryKey: ["reading", "mine"],
  queryFn: () => getMyReading(),
});
