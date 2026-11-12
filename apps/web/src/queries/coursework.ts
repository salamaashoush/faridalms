import type { TeacherListQuery } from "@faridalms/domain/coursework";

import { queryOptions } from "@tanstack/react-query";

import {
  getAssignmentEditor,
  getAssignmentRecord,
  getChildBrief,
  getChildCoursework,
  getClassGroups,
  getCommentBank,
  getCoursework,
  getCourseworkOptions,
  getCourseworkToday,
  getDiscussion,
  getGrading,
  getMyCoursework,
  getMyWork,
  getQuizAnswers,
  getQuizPollResults,
  getReusable,
  getStudentCoursework,
} from "~/server/coursework";

import type { PollCounts } from "./learning";

/** How a student's class answered a quiz's poll, asked again now and then as others answer. */
export const quizPollResultsQuery = (assignmentId: string, blockId: string) =>
  queryOptions<PollCounts>({
    queryKey: ["coursework", "poll", assignmentId, blockId],
    queryFn: () => getQuizPollResults({ data: { assignmentId, blockId } }),
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
  });

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

export const discussionQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "discussion", assignmentId],
    queryFn: () => getDiscussion({ data: { assignmentId } }),
  });

export const myWorkQuery = (id: string) =>
  queryOptions({
    queryKey: ["coursework", "work", id],
    queryFn: () => getMyWork({ data: { id } }),
  });

/** A student's own work: in their classes now, or with `ended` in those over. */
export const myCourseworkQuery = (ended = false) =>
  queryOptions({
    queryKey: ["coursework", "mine", ended],
    queryFn: () => getMyCoursework({ data: { ended } }),
  });

export const childBriefQuery = (studentId: string, assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "child-brief", studentId, assignmentId],
    queryFn: () => getChildBrief({ data: { studentId, assignmentId } }),
  });

export const childCourseworkQuery = (studentId: string, ended = false) =>
  queryOptions({
    queryKey: ["coursework", "child", studentId, ended],
    queryFn: () => getChildCoursework({ data: { studentId, ended } }),
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

/** What coursework says of today for Today: the viewer's own, or a learner's they follow. */
export const courseworkTodayQuery = (studentId = "") => ({
  queryKey: ["coursework", "today", studentId],
  queryFn: () => getCourseworkToday({ data: { studentId } }),
});
