import { queryOptions } from "@tanstack/react-query";

import { getClassBook, getStudentGrades } from "~/server/gradebook";

export const classBookQuery = (classId: string, periodId = "") =>
  queryOptions({
    queryKey: ["gradebook", "class", classId, periodId],
    queryFn: () => getClassBook({ data: { classId, periodId } }),
  });

export const studentGradesQuery = (studentId = "") =>
  queryOptions({
    queryKey: ["gradebook", "student", studentId],
    queryFn: () => getStudentGrades({ data: studentId ? { studentId } : {} }),
  });
