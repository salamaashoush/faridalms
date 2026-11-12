import { queryOptions } from "@tanstack/react-query";

import {
  getClassBook,
  getStudentGrades,
  getWorkTerm,
} from "~/server/gradebook";

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

/** The terms work in a class counts toward, and the one an assignment counts toward. */
export const workTermQuery = (classId: string, assignmentId = "") =>
  queryOptions({
    queryKey: ["gradebook", "work-term", classId, assignmentId],
    queryFn: () => getWorkTerm({ data: { classId, assignmentId } }),
  });
