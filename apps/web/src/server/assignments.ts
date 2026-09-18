import {
  assessAttemptSchema,
  assignmentRevisionSchema,
  saveAssignmentSchema,
  saveStudentGroupSchema,
  saveSubmissionDraftSchema,
  submitAttemptSchema,
} from "@faridalms/domain/assignment";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";

const id = v.pipe(v.string(), v.uuid());

export const getAuthoringContext = createServerFn({ method: "GET" })
  .inputValidator(v.object({ classId: v.optional(v.string(), "") }))
  .handler(({ data }) => backend().getAuthoringContext(data));
export const getAuthoringAssignment = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id }))
  .handler(({ data }) => record(backend().getAuthoringAssignment(data)));
export const saveAssignment = createServerFn({ method: "POST" })
  .inputValidator(saveAssignmentSchema)
  .handler(({ data }) => backend().saveAssignment(data));
export const publishAssignment = createServerFn({ method: "POST" })
  .inputValidator(assignmentRevisionSchema)
  .handler(({ data }) => backend().publishAssignment(data));
export const archiveAssignment = createServerFn({ method: "POST" })
  .inputValidator(assignmentRevisionSchema)
  .handler(({ data }) => backend().archiveAssignment(data));
export const deleteDraftAssignment = createServerFn({ method: "POST" })
  .inputValidator(assignmentRevisionSchema)
  .handler(({ data }) => backend().deleteDraftAssignment(data));
export const getAssignmentWorkspace = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id }))
  .handler(({ data }) => record(backend().getAssignmentWorkspace(data)));
export const getAttemptForReview = createServerFn({ method: "GET" })
  .inputValidator(v.object({ attemptId: id }))
  .handler(({ data }) => record(backend().getAttemptForReview(data)));
export const assessAttempt = createServerFn({ method: "POST" })
  .inputValidator(assessAttemptSchema)
  .handler(({ data }) => backend().assessAttempt(data));
export const getLearnerAssignment = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id, studentId: v.optional(v.string(), "") }))
  .handler(({ data }) => record(backend().getLearnerAssignment(data)));
export const saveSubmissionDraft = createServerFn({ method: "POST" })
  .inputValidator(saveSubmissionDraftSchema)
  .handler(({ data }) => backend().saveSubmissionDraft(data));
export const submitAttempt = createServerFn({ method: "POST" })
  .inputValidator(submitAttemptSchema)
  .handler(({ data }) => backend().submitAttempt(data));
export const getStudentGroups = createServerFn({ method: "GET" })
  .inputValidator(v.object({ classId: id }))
  .handler(({ data }) => backend().getStudentGroups(data));
export const saveStudentGroup = createServerFn({ method: "POST" })
  .inputValidator(saveStudentGroupSchema)
  .handler(({ data }) => backend().saveStudentGroup(data));
export const deleteStudentGroup = createServerFn({ method: "POST" })
  .inputValidator(v.object({ id, classId: id }))
  .handler(({ data }) => backend().deleteStudentGroup(data));
