import { queryOptions } from "@tanstack/react-query";

import {
  getClassBook,
  getRunningDefault,
  getRunningGrades,
  getRunningShown,
  getStudentGrades,
  getWorkTerm,
} from "~/server/gradebook";

export const classBookQuery = (classId: string, periodId = "") =>
  queryOptions({
    queryKey: ["gradebook", "class", classId, periodId],
    queryFn: () => getClassBook({ data: { classId, periodId } }),
  });

export const studentGradesQuery = (studentId = "") => ({
  queryKey: ["gradebook", "student", studentId],
  queryFn: () => getStudentGrades({ data: studentId ? { studentId } : {} }),
});

/** The terms work in a class counts toward, and the one an assignment counts toward. */
export const workTermQuery = (classId: string, assignmentId = "") =>
  queryOptions({
    queryKey: ["gradebook", "work-term", classId, assignmentId],
    queryFn: () => getWorkTerm({ data: { classId, assignmentId } }),
  });

/** A learner's running grades in every class that shows them; empty for the viewer's own. */
export const runningGradesQuery = (studentId = "") => ({
  queryKey: ["gradebook", "running", studentId],
  queryFn: () => getRunningGrades({ data: studentId ? { studentId } : {} }),
});

export const runningShownQuery = (classId: string) =>
  queryOptions({
    queryKey: ["gradebook", "running-shown", classId],
    queryFn: () => getRunningShown({ data: { classId } }),
  });

export const runningDefaultQuery = queryOptions({
  queryKey: ["gradebook", "running-default"],
  queryFn: () => getRunningDefault(),
});
