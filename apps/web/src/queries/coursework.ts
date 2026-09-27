import type { TeacherListQuery } from "@faridalms/domain/coursework";

import { queryOptions } from "@tanstack/react-query";

import {
  getAssignmentEditor,
  getAssignmentRecord,
  getChildCoursework,
  getStudentCoursework,
  getClassGroups,
  getCoursework,
  getCourseworkOptions,
  getGrading,
  getMyCoursework,
  getMyWork,
} from "~/server/coursework";

export const courseworkOptionsQuery = queryOptions({
  queryKey: ["coursework", "options"],
  queryFn: () => getCourseworkOptions(),
});

export const courseworkListQuery = (query: TeacherListQuery) =>
  queryOptions({
    queryKey: ["coursework", "list", query],
    queryFn: () => getCoursework({ data: query }),
  });

export const assignmentEditorQuery = (id: string) =>
  queryOptions({
    queryKey: ["coursework", "editor", id],
    queryFn: () => getAssignmentEditor({ data: { id } }),
  });

export const assignmentRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["coursework", "record", id],
    queryFn: () => getAssignmentRecord({ data: { id } }),
  });

export const gradingQuery = (assignmentId: string, studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "grading", assignmentId, studentId],
    queryFn: () => getGrading({ data: { assignmentId, studentId } }),
  });

export const myWorkQuery = (id: string) =>
  queryOptions({
    queryKey: ["coursework", "work", id],
    queryFn: () => getMyWork({ data: { id } }),
  });

export const myCourseworkQuery = queryOptions({
  queryKey: ["coursework", "mine"],
  queryFn: () => getMyCoursework(),
});

export const childCourseworkQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "child", studentId],
    queryFn: () => getChildCoursework({ data: { studentId } }),
  });

export const studentCourseworkQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "student", studentId],
    queryFn: () => getStudentCoursework({ data: { studentId } }),
  });

export const classGroupsQuery = (classId: string) =>
  queryOptions({
    queryKey: ["coursework", "groups", classId],
    queryFn: () => getClassGroups({ data: { classId } }),
  });
