import type { TeacherListQuery } from "@faridalms/domain/coursework";

import { queryOptions } from "@tanstack/react-query";

import {
  getSharedWork,
  getAssignmentEditor,
  getAssignmentRecord,
  getChildBrief,
  getChildCoursework,
  getStudentCoursework,
  getClassGroups,
  getCoursework,
  getCourseworkOptions,
  getCommentBank,
  getDiscussion,
  getGrading,
  getQuizAnswers,
  getQuizPollResults,
  getMyCoursework,
  getMyPeerReviews,
  getMyWork,
  getPeerOverview,
  getReusable,
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

export const myCourseworkQuery = queryOptions({
  queryKey: ["coursework", "mine"],
  queryFn: () => getMyCoursework(),
});

export const sharedWorkQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["coursework", "shared", studentId],
    queryFn: () => getSharedWork({ data: { studentId } }),
  });

export const childBriefQuery = (studentId: string, assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "child-brief", studentId, assignmentId],
    queryFn: () => getChildBrief({ data: { studentId, assignmentId } }),
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

export const peerOverviewQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "peer", assignmentId],
    queryFn: () => getPeerOverview({ data: { assignmentId } }),
  });

export const myPeerReviewsQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["coursework", "peer", "mine", assignmentId],
    queryFn: () => getMyPeerReviews({ data: { assignmentId } }),
  });
