import { queryOptions } from "@tanstack/react-query";

import {
  getClassProgress,
  getFramework,
  getFrameworks,
  getStudentProgress,
} from "~/server/standards";

export const frameworksQuery = queryOptions({
  queryKey: ["standards", "frameworks"],
  queryFn: () => getFrameworks(),
});

export const frameworkQuery = (id: string) =>
  queryOptions({
    queryKey: ["standards", "framework", id],
    queryFn: () => getFramework({ data: { id } }),
  });

export const classProgressQuery = (classId: string) =>
  queryOptions({
    queryKey: ["standards", "class", classId],
    queryFn: () => getClassProgress({ data: { classId } }),
  });

export const studentProgressQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["standards", "student", studentId],
    queryFn: () => getStudentProgress({ data: { studentId } }),
  });
