import { queryOptions } from "@tanstack/react-query";

import {
  getAdminHome,
  getFamilyHome,
  getStudentHome,
  getTeacherHome,
} from "~/server/home";

export const teacherHomeQuery = queryOptions({
  queryKey: ["home", "teacher"],
  queryFn: () => getTeacherHome(),
});

export const familyHomeQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["home", "family", studentId],
    queryFn: () => getFamilyHome({ data: { studentId } }),
    placeholderData: (previous) => previous,
  });

export const studentHomeQuery = queryOptions({
  queryKey: ["home", "student"],
  queryFn: () => getStudentHome(),
});

export const adminHomeQuery = queryOptions({
  queryKey: ["home", "admin"],
  queryFn: () => getAdminHome(),
});
