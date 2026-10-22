import type { TeacherListQuery } from "@faridalms/domain/coursework";

import { queryOptions } from "@tanstack/react-query";

import {
  getSharedWork,
  getAssignmentEditor,
  getAssignmentRecord,
  getChildCoursework,
  getStudentCoursework,
  getClassGroups,
  getCoursework,
  getCourseworkOptions,
  getCommentBank,
  getGrading,
  getQuizAnswers,
  getMyCoursework,
  getMyWork,
  getReusable,
} from "~/server/coursework";

export const courseworkOptionsQuery = queryOptions({
  queryKey: ["coursework", "options"],
  queryFn: () => getCourseworkOptions(),
});

export const reusableQuery = (q: string) =>
  queryOptions({
    queryKey: ["coursework", "reusable", q],
    queryFn: () => getReusable({ data: { q } }),
    placeholderData: (previous) => previous,
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

export const commentBankQuery = queryOptions({
  queryKey: ["coursework", "comment-bank"],
  queryFn: () => getCommentBank(),
});

export const gradingQuery = (assignmentId: string, studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "grading", assignmentId, studentId],
    queryFn: () => getGrading({ data: { assignmentId, studentId } }),
  });

export const quizAnswersQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "quiz-answers", assignmentId],
    queryFn: () => getQuizAnswers({ data: { assignmentId } }),
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

export const sharedWorkQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "shared", studentId],
    queryFn: () => getSharedWork({ data: { studentId } }),
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
