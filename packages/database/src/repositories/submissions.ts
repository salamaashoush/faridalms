import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type {
  AssessAttemptInput,
  SaveSubmissionDraftInput,
} from "@faridalms/domain/assignment";

import {
  assignmentWindow,
  canSubmitNow,
  effectiveScore,
  learnerState,
  rubricTotal,
} from "@faridalms/domain/assignment";
import { contentPlainText } from "@faridalms/domain/content";
import { and, eq, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { assessmentFilter, audienceIncludes } from "./academics";
import { fileSummary, ownedReadyFiles } from "./files";
import { ManagementError } from "./management";
import { recordEvent, studentAudience } from "./notifications";

/** The learner's view of one assignment: brief, resources and their own work. */
export async function learnerAssignment(
  db: Database,
  assignmentId: string,
  studentId: string,
  now: Date,
  today: string,
) {
  const row = await db.query.assignments.findFirst({
    where: {
      id: assignmentId,
      status: { ne: "draft" },
      RAW: (table) => audienceIncludes(table, studentId, today),
    },
    with: {
      class: { columns: { id: true, name: true } },
      subject: { columns: { id: true, name: true, nameAr: true, icon: true } },
      author: { columns: { id: true, name: true } },
      week: { columns: { number: true } },
      resources: { with: { file: true }, orderBy: { position: "asc" } },
      submissions: {
        where: { studentId },
        with: {
          draftFiles: { with: { file: true }, orderBy: { position: "asc" } },
          attempts: {
            with: {
              files: { with: { file: true }, orderBy: { position: "asc" } },
              assessment: true,
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });
  if (!row) return undefined;
  const submission = row.submissions[0];
  const attempts = submission?.attempts ?? [];
  const latest = attempts.at(-1);
  const window =
    row.status === "archived" ? "closed" : assignmentWindow(row, now);
  const released = Boolean(latest?.assessment?.releasedAt);
  const canSubmit =
    row.status === "published" && canSubmitNow(row, attempts.length, now);
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    description: row.description,
    type: row.type,
    status: row.status,
    class: row.class,
    subject: row.subject,
    author: row.author,
    week: row.week,
    availableFrom: row.availableFrom,
    dueAt: row.dueAt,
    dueDate: row.dueDate,
    closesAt: row.closesAt,
    latePolicy: row.latePolicy,
    lateDeductionPercent: row.lateDeductionPercent,
    submissionFormat: row.submissionFormat,
    maxAttachments: row.maxAttachments,
    maxAttachmentBytes: row.maxAttachmentBytes,
    resubmission: row.resubmission,
    maxScore: row.maxScore,
    rubric: row.rubric,
    resources: row.resources.flatMap((link) =>
      link.file ? [fileSummary(link.file)] : [],
    ),
    window,
    isLateNow: window === "late",
    canSubmit,
    state: learnerState({
      window,
      hasDraft: Boolean(submission?.draft || submission?.draftFiles.length),
      attempts: attempts.length,
      released,
    }),
    submission: {
      revision: submission?.revision ?? 0,
      draft: submission?.draft ?? null,
      draftFiles: (submission?.draftFiles ?? []).flatMap((link) =>
        link.file ? [fileSummary(link.file)] : [],
      ),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        number: attempt.number,
        submittedAt: attempt.submittedAt,
        isLate: attempt.isLate,
        content: attempt.content,
        plainText: attempt.plainText,
        files: attempt.files.flatMap((link) =>
          link.file ? [fileSummary(link.file)] : [],
        ),
        assessment: attempt.assessment?.releasedAt
          ? {
              score: attempt.assessment.score,
              effectiveScore: attempt.assessment.effectiveScore,
              rubricScores: attempt.assessment.rubricScores,
              feedback: attempt.assessment.feedback,
              feedbackText: attempt.assessment.feedbackText,
              releasedAt: attempt.assessment.releasedAt,
            }
          : null,
      })),
    },
  };
}

async function lockedSubmissionContext(
  tx: DatabaseTransaction,
  assignmentId: string,
  studentId: string,
  today: string,
) {
  const assignment = await tx.query.assignments.findFirst({
    where: {
      id: assignmentId,
      status: "published",
      RAW: (table) => audienceIncludes(table, studentId, today),
    },
  });
  if (!assignment)
    throw new ManagementError("NOT_FOUND", "assignment.not_found");
  const [submission] = await tx
    .select()
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.assignmentId, assignmentId),
        eq(schema.submissions.studentId, studentId),
      ),
    )
    .for("update");
  const [attempts] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.submissionAttempts)
    .where(
      submission
        ? eq(schema.submissionAttempts.submissionId, submission.id)
        : sql`false`,
    );
  return { assignment, submission, attemptCount: attempts?.n ?? 0 };
}

function requireOpen(
  assignment: Parameters<typeof canSubmitNow>[0],
  attemptCount: number,
  now: Date,
) {
  const window = assignmentWindow(assignment, now);
  if (window === "scheduled")
    throw new ManagementError("BAD_REQUEST", "submission.scheduled");
  if (window === "closed")
    throw new ManagementError("BAD_REQUEST", "submission.closed");
  if (!canSubmitNow(assignment, attemptCount, now))
    throw new ManagementError("CONFLICT", "submission.resubmission_closed");
  return window;
}

export async function saveSubmissionDraft(
  db: Database,
  input: SaveSubmissionDraftInput,
  actor: { userId: string; studentId: string },
  now: Date,
  today: string,
) {
  return db.transaction(async (tx) => {
    const { assignment, submission, attemptCount } =
      await lockedSubmissionContext(
        tx,
        input.assignmentId,
        actor.studentId,
        today,
      );
    requireOpen(assignment, attemptCount, now);
    if (input.content && assignment.submissionFormat === "files")
      throw new ManagementError(
        "BAD_REQUEST",
        "submission.written_not_accepted",
      );
    if (input.fileIds.length && assignment.submissionFormat === "written")
      throw new ManagementError("BAD_REQUEST", "submission.files_not_accepted");
    if (input.fileIds.length > assignment.maxAttachments)
      throw new ManagementError("BAD_REQUEST", "submission.too_many_files");
    const files = await ownedReadyFiles(
      tx,
      actor.userId,
      input.fileIds,
      "submission_attachment",
    );
    if (files.length !== input.fileIds.length)
      throw new ManagementError("BAD_REQUEST", "submission.file_missing");
    if (files.some((file) => file.sizeBytes > assignment.maxAttachmentBytes))
      throw new ManagementError("BAD_REQUEST", "submission.file_too_large");
    const draft =
      input.content && contentPlainText(input.content).trim().length
        ? input.content
        : null;
    let submissionId: string;
    let revision: number;
    if (!submission) {
      if (input.expectedRevision !== 0)
        throw new ManagementError("CONFLICT", "submission.revision_conflict");
      const [created] = await tx
        .insert(schema.submissions)
        .values({
          assignmentId: input.assignmentId,
          studentId: actor.studentId,
          state: "draft",
          draft,
        })
        .returning({
          id: schema.submissions.id,
          revision: schema.submissions.revision,
        });
      if (!created) throw new Error("submission.create_failed");
      submissionId = created.id;
      revision = created.revision;
    } else {
      if (submission.revision !== input.expectedRevision)
        throw new ManagementError("CONFLICT", "submission.revision_conflict");
      const [updated] = await tx
        .update(schema.submissions)
        .set({
          draft,
          state: attemptCount === 0 ? "draft" : submission.state,
          revision: submission.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.submissions.id, submission.id))
        .returning({
          id: schema.submissions.id,
          revision: schema.submissions.revision,
        });
      if (!updated) throw new Error("submission.update_failed");
      submissionId = updated.id;
      revision = updated.revision;
      await tx
        .delete(schema.submissionDraftFiles)
        .where(eq(schema.submissionDraftFiles.submissionId, submissionId));
    }
    if (input.fileIds.length)
      await tx.insert(schema.submissionDraftFiles).values(
        input.fileIds.map((fileId, position) => ({
          submissionId,
          fileId,
          position,
        })),
      );
    return { submissionId, revision };
  });
}

/**
 * Cuts an immutable attempt from the draft. A retry that carries the same
 * revision finds the attempt it already created instead of making a second one.
 */
export async function submitAttempt(
  db: Database,
  input: { assignmentId: string; expectedRevision: number },
  actor: { userId: string; studentId: string },
  now: Date,
  today: string,
) {
  return db.transaction(async (tx) => {
    const { assignment, submission, attemptCount } =
      await lockedSubmissionContext(
        tx,
        input.assignmentId,
        actor.studentId,
        today,
      );
    if (!submission)
      throw new ManagementError("BAD_REQUEST", "submission.empty");
    const existing = await tx.query.submissionAttempts.findFirst({
      where: {
        submissionId: submission.id,
        sourceRevision: input.expectedRevision,
      },
      columns: { id: true, number: true },
    });
    if (existing)
      return {
        attemptId: existing.id,
        number: existing.number,
        revision: submission.revision,
      };
    if (submission.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "submission.revision_conflict");
    const window = requireOpen(assignment, attemptCount, now);
    const draftFiles = await tx.query.submissionDraftFiles.findMany({
      where: { submissionId: submission.id },
      orderBy: { position: "asc" },
    });
    const plainText = submission.draft
      ? contentPlainText(submission.draft).trim()
      : "";
    if (!plainText && draftFiles.length === 0)
      throw new ManagementError("BAD_REQUEST", "submission.empty");
    if (
      assignment.submissionFormat === "written_and_files" &&
      (!plainText || draftFiles.length === 0)
    )
      throw new ManagementError("BAD_REQUEST", "submission.both_required");
    const [attempt] = await tx
      .insert(schema.submissionAttempts)
      .values({
        submissionId: submission.id,
        number: attemptCount + 1,
        sourceRevision: submission.revision,
        content: submission.draft,
        plainText: plainText || null,
        isLate: window === "late",
        submittedAt: now,
        submittedById: actor.userId,
      })
      .returning({
        id: schema.submissionAttempts.id,
        number: schema.submissionAttempts.number,
      });
    if (!attempt) throw new Error("submission.attempt_failed");
    if (draftFiles.length)
      await tx.insert(schema.submissionAttemptFiles).values(
        draftFiles.map((link) => ({
          attemptId: attempt.id,
          fileId: link.fileId,
          position: link.position,
        })),
      );
    await tx
      .delete(schema.submissionDraftFiles)
      .where(eq(schema.submissionDraftFiles.submissionId, submission.id));
    const [updated] = await tx
      .update(schema.submissions)
      .set({
        state: "submitted",
        revision: submission.revision + 1,
        draft: null,
        currentAttemptId: attempt.id,
        content: plainText || null,
        submittedAt: now,
        score: null,
        feedback: null,
        gradedById: null,
        gradedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.submissions.id, submission.id))
      .returning({ revision: schema.submissions.revision });
    return {
      attemptId: attempt.id,
      number: attempt.number,
      revision: updated?.revision ?? submission.revision + 1,
    };
  });
}

/** Scores an attempt. Releasing copies the result onto the submission so lists and the learner see it. */
export async function assessAttempt(
  db: Database,
  input: AssessAttemptInput,
  grader: { userId: string; name?: string; scope: AssessmentScope },
  now: Date,
) {
  return db.transaction(async (tx) => {
    const attempt = await tx.query.submissionAttempts.findFirst({
      where: {
        id: input.attemptId,
        submission: {
          assignment: { RAW: (table) => assessmentFilter(table, grader.scope) },
        },
      },
      with: {
        submission: {
          columns: { id: true, currentAttemptId: true, studentId: true },
          with: {
            assignment: {
              columns: {
                id: true,
                title: true,
                maxScore: true,
                rubric: true,
                latePolicy: true,
                lateDeductionPercent: true,
              },
            },
          },
        },
      },
    });
    const assignment = attempt?.submission?.assignment;
    if (!attempt?.submission || !assignment)
      throw new ManagementError("NOT_FOUND", "assessment.not_found");
    if (input.score > assignment.maxScore)
      throw new ManagementError("BAD_REQUEST", "assessment.score_range");
    if (assignment.rubric.length) {
      const total = rubricTotal(assignment.rubric, input.rubricScores);
      if (total === null || total !== input.score)
        throw new ManagementError("BAD_REQUEST", "assessment.rubric_mismatch");
    }
    const effective = effectiveScore(input.score, attempt.isLate, assignment);
    const feedbackText = input.feedback
      ? contentPlainText(input.feedback).trim() || null
      : null;
    const previous = await tx.query.assessments.findFirst({
      where: { attemptId: attempt.id },
      columns: { releasedAt: true },
    });
    const [assessment] = await tx
      .insert(schema.assessments)
      .values({
        attemptId: attempt.id,
        score: input.score,
        effectiveScore: effective,
        rubricScores: input.rubricScores,
        feedback: input.feedback,
        feedbackText,
        gradedById: grader.userId,
        gradedAt: now,
        releasedAt: input.release ? now : null,
      })
      .onConflictDoUpdate({
        target: schema.assessments.attemptId,
        set: {
          score: input.score,
          effectiveScore: effective,
          rubricScores: input.rubricScores,
          feedback: input.feedback,
          feedbackText,
          gradedById: grader.userId,
          gradedAt: now,
          releasedAt: input.release
            ? sql`coalesce(${schema.assessments.releasedAt}, ${now})`
            : schema.assessments.releasedAt,
          revision: sql`${schema.assessments.revision} + 1`,
        },
      })
      .returning();
    if (!assessment) throw new Error("assessment.save_failed");
    if (
      assessment.releasedAt &&
      attempt.submission.currentAttemptId === attempt.id
    ) {
      await tx
        .update(schema.submissions)
        .set({
          state: "returned",
          score: effective,
          feedback: feedbackText,
          gradedById: grader.userId,
          gradedAt: now,
          updatedAt: new Date(),
        })
        .where(eq(schema.submissions.id, attempt.submission.id));
    }
    if (assessment.releasedAt && !previous?.releasedAt) {
      const audience = await studentAudience(tx, attempt.submission.studentId);
      await recordEvent(tx, {
        type: "assessment_released",
        subjectId: assignment.id,
        actorId: grader.userId,
        payload: {
          title: assignment.title,
          preview: `${effective} / ${assignment.maxScore}`,
          actorName: grader.name ?? null,
          studentName: audience.name,
          link: {
            kind: "assignment",
            id: assignment.id,
            studentId: attempt.submission.studentId,
          },
        },
        recipientIds: audience.userIds,
      });
    }
    return {
      id: assessment.id,
      releasedAt: assessment.releasedAt,
      effectiveScore: assessment.effectiveScore,
    };
  });
}
