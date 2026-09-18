import { queryOptions } from "@tanstack/react-query";

import {
  getAssignmentWorkspace,
  getAttemptForReview,
  getAuthoringAssignment,
  getAuthoringContext,
  getLearnerAssignment,
  getStudentGroups,
} from "~/server/assignments";

export const authoringContextQuery = (classId: string) =>
  queryOptions({
    queryKey: ["assignments", "authoring-context", classId],
    queryFn: () => getAuthoringContext({ data: { classId } }),
  });
export const authoringAssignmentQuery = (id: string) =>
  queryOptions({
    queryKey: ["assignments", "authoring", id],
    queryFn: () => getAuthoringAssignment({ data: { id } }),
  });
export const assignmentWorkspaceQuery = (id: string) =>
  queryOptions({
    queryKey: ["assignments", "workspace", id],
    queryFn: () => getAssignmentWorkspace({ data: { id } }),
  });
export const attemptReviewQuery = (attemptId: string) =>
  queryOptions({
    queryKey: ["assignments", "attempt", attemptId],
    queryFn: () => getAttemptForReview({ data: { attemptId } }),
  });
export const learnerAssignmentQuery = (id: string, studentId: string) =>
  queryOptions({
    queryKey: ["assignments", "learner", id, studentId],
    queryFn: () => getLearnerAssignment({ data: { id, studentId } }),
  });
export const studentGroupsQuery = (classId: string) =>
  queryOptions({
    queryKey: ["assignments", "groups", classId],
    queryFn: () => getStudentGroups({ data: { classId } }),
  });
