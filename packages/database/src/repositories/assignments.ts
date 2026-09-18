import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type {
  AssignmentRecipientsInput,
  PublishIssue,
  SaveAssignmentOutput,
} from "@faridalms/domain/assignment";

import { canAssessOffering } from "@faridalms/domain/academic-access";
import {
  assignmentPublishIssues,
  assignmentWindow,
  learnerState,
} from "@faridalms/domain/assignment";
import { contentPlainText } from "@faridalms/domain/content";
import { schoolDate, weekForDate } from "@faridalms/domain/school";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { assessmentFilter, listWeeks } from "./academics";
import { fileSummary, ownedReadyFiles } from "./files";
import { groupMembers } from "./groups";
import { ManagementError } from "./management";

type Executor = Database | DatabaseTransaction;

export interface AuthoringActor {
  userId: string;
  scope: AssessmentScope;
}

export interface AuthoringContext {
  today: string;
  timeZone: string;
}

async function enrolledStudentIds(
  db: Executor,
  classId: string,
  today: string,
) {
  const rows = await db.query.enrolments.findMany({
    where: {
      classId,
      since: { lte: today },
      OR: [{ until: { isNull: true } }, { until: { gt: today } }],
    },
    columns: { studentId: true },
  });
  return new Set(rows.map((row) => row.studentId));
}

/** The audience a recipient choice resolves to, restricted to the class roster. */
export async function resolveRecipients(
  db: Executor,
  classId: string,
  recipients: AssignmentRecipientsInput,
  today: string,
): Promise<Map<string, string>> {
  const roster = await enrolledStudentIds(db, classId, today);
  const resolved = new Map<string, string>();
  if (recipients.mode === "class") {
    for (const id of roster) resolved.set(id, "class");
  } else if (recipients.mode === "groups") {
    const members = await groupMembers(db, classId, recipients.groupIds);
    for (const id of members) if (roster.has(id)) resolved.set(id, "group");
  } else {
    for (const id of recipients.studentIds)
      if (roster.has(id)) resolved.set(id, "student");
  }
  return resolved;
}

async function offeringFor(
  db: Executor,
  classId: string,
  subjectId: string,
  actor: AuthoringActor,
) {
  const offering = await db.query.classSubjects.findFirst({
    where: { classId, subjectId },
    with: { class: { columns: { schoolYearId: true } } },
  });
  const schoolClass = offering?.class;
  if (!offering || !schoolClass)
    throw new ManagementError("BAD_REQUEST", "assignment.subject_not_taught");
  if (!canAssessOffering(actor.scope, offering.teacherId))
    throw new ManagementError("FORBIDDEN", "assignment.responsibility");
  return { ...offering, class: schoolClass };
}

export async function saveAssignment(
  db: Database,
  input: SaveAssignmentOutput,
  actor: AuthoringActor,
  context: AuthoringContext,
) {
  return db.transaction(async (tx) => {
    const offering = await offeringFor(
      tx,
      input.classId,
      input.subjectId,
      actor,
    );
    const dueDate = schoolDate(context.timeZone, new Date(input.dueAt));
    const week = weekForDate(
      await listWeeks(tx, offering.class.schoolYearId),
      dueDate,
    );
    const values = {
      classId: input.classId,
      subjectId: input.subjectId,
      weekId: week?.id ?? null,
      title: input.title,
      instructions: input.instructions,
      description: contentPlainText(input.instructions).slice(0, 20000) || null,
      type: input.type,
      dueDate,
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
      dueAt: new Date(input.dueAt),
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      latePolicy: input.latePolicy,
      lateDeductionPercent: input.lateDeductionPercent,
      submissionFormat: input.submissionFormat,
      maxAttachments: input.maxAttachments,
      maxAttachmentBytes: input.maxAttachmentBytes,
      resubmission: input.resubmission,
      maxScore: input.maxScore,
      rubric: input.rubric,
      audience: input.recipients.mode,
      updatedById: actor.userId,
    };
    let saved: {
      id: string;
      revision: number;
      status: "draft" | "published" | "archived";
    };
    let existingResourceIds = new Set<string>();
    let protectedStudentIds = new Set<string>();
    if (input.expectedRevision === 0) {
      const [created] = await tx
        .insert(schema.assignments)
        .values({
          ...values,
          id: input.id,
          authorId: actor.userId,
          status: "draft",
          assignedOn: context.today,
        })
        .onConflictDoNothing()
        .returning({
          id: schema.assignments.id,
          revision: schema.assignments.revision,
          status: schema.assignments.status,
        });
      if (!created)
        throw new ManagementError("CONFLICT", "assignment.revision_conflict");
      saved = created;
    } else {
      const [current] = await tx
        .select({
          id: schema.assignments.id,
          revision: schema.assignments.revision,
          status: schema.assignments.status,
          classId: schema.assignments.classId,
        })
        .from(schema.assignments)
        .where(eq(schema.assignments.id, input.id))
        .for("update");
      if (!current)
        throw new ManagementError("NOT_FOUND", "assignment.not_found");
      if (current.revision !== input.expectedRevision)
        throw new ManagementError("CONFLICT", "assignment.revision_conflict");
      if (current.status === "archived")
        throw new ManagementError("BAD_REQUEST", "assignment.archived");
      if (current.classId !== input.classId)
        throw new ManagementError("BAD_REQUEST", "assignment.class_changed");
      const [updated] = await tx
        .update(schema.assignments)
        .set({
          ...values,
          revision: current.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.assignments.id, input.id))
        .returning({
          id: schema.assignments.id,
          revision: schema.assignments.revision,
          status: schema.assignments.status,
        });
      if (!updated)
        throw new ManagementError("NOT_FOUND", "assignment.not_found");
      saved = updated;
      existingResourceIds = new Set(
        (
          await tx
            .select({ fileId: schema.assignmentResources.fileId })
            .from(schema.assignmentResources)
            .where(eq(schema.assignmentResources.assignmentId, input.id))
        ).map((row) => row.fileId),
      );
      if (current.status === "published") {
        protectedStudentIds = new Set(
          (
            await tx
              .select({ studentId: schema.submissions.studentId })
              .from(schema.submissions)
              .where(
                and(
                  eq(schema.submissions.assignmentId, input.id),
                  sql`exists (select 1 from ${schema.submissionAttempts} a where a.submission_id = ${schema.submissions.id})`,
                ),
              )
          ).map((row) => row.studentId),
        );
      }
    }

    const newResourceIds = input.resourceFileIds.filter(
      (id) => !existingResourceIds.has(id),
    );
    const owned = await ownedReadyFiles(
      tx,
      actor.userId,
      newResourceIds,
      "assignment_resource",
    );
    if (owned.length !== newResourceIds.length)
      throw new ManagementError("BAD_REQUEST", "assignment.resource_missing");
    await tx
      .delete(schema.assignmentResources)
      .where(eq(schema.assignmentResources.assignmentId, input.id));
    if (input.resourceFileIds.length)
      await tx.insert(schema.assignmentResources).values(
        input.resourceFileIds.map((fileId, position) => ({
          assignmentId: input.id,
          fileId,
          position,
        })),
      );

    const audience = await resolveRecipients(
      tx,
      input.classId,
      input.recipients,
      context.today,
    );
    for (const id of protectedStudentIds)
      if (!audience.has(id)) audience.set(id, "kept");
    const keep = [...audience.keys()];
    await tx
      .delete(schema.assignmentRecipients)
      .where(
        keep.length
          ? and(
              eq(schema.assignmentRecipients.assignmentId, input.id),
              notInArray(schema.assignmentRecipients.studentId, keep),
            )
          : eq(schema.assignmentRecipients.assignmentId, input.id),
      );
    if (keep.length)
      await tx
        .insert(schema.assignmentRecipients)
        .values(
          keep.map((studentId) => ({
            assignmentId: input.id,
            studentId,
            source: audience.get(studentId) ?? "class",
          })),
        )
        .onConflictDoNothing();
    return { ...saved, recipientCount: keep.length };
  });
}

async function lockedAssignment(
  tx: DatabaseTransaction,
  id: string,
  expectedRevision: number,
  actor: AuthoringActor,
) {
  const [current] = await tx
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.id, id))
    .for("update");
  if (!current) throw new ManagementError("NOT_FOUND", "assignment.not_found");
  await offeringFor(tx, current.classId, current.subjectId, actor);
  if (current.revision !== expectedRevision)
    throw new ManagementError("CONFLICT", "assignment.revision_conflict");
  return current;
}

export async function publishAssignment(
  db: Database,
  id: string,
  expectedRevision: number,
  actor: AuthoringActor,
) {
  return db.transaction(async (tx) => {
    const current = await lockedAssignment(tx, id, expectedRevision, actor);
    if (current.status === "archived")
      throw new ManagementError("BAD_REQUEST", "assignment.archived");
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.assignmentRecipients)
      .where(eq(schema.assignmentRecipients.assignmentId, id));
    const issues: PublishIssue[] = assignmentPublishIssues({
      title: current.title,
      instructions: current.instructions ?? {
        root: { type: "root", version: 1, children: [] },
      },
      recipients: { mode: "students", groupIds: [], studentIds: [] },
      rubric: current.rubric,
    }).filter((issue) => issue !== "recipients");
    if ((count?.n ?? 0) === 0 && current.audience !== "class")
      issues.push("recipients");
    if (issues.length)
      throw new ManagementError(
        "BAD_REQUEST",
        `assignment.incomplete:${issues.join(",")}`,
      );
    const [updated] = await tx
      .update(schema.assignments)
      .set({
        status: "published",
        publishedAt: current.publishedAt ?? new Date(),
        revision: current.revision + 1,
        updatedById: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.assignments.id, id))
      .returning({
        id: schema.assignments.id,
        revision: schema.assignments.revision,
        status: schema.assignments.status,
      });
    if (!updated)
      throw new ManagementError("NOT_FOUND", "assignment.not_found");
    return updated;
  });
}

export async function archiveAssignment(
  db: Database,
  id: string,
  expectedRevision: number,
  actor: AuthoringActor,
) {
  return db.transaction(async (tx) => {
    const current = await lockedAssignment(tx, id, expectedRevision, actor);
    const [updated] = await tx
      .update(schema.assignments)
      .set({
        status: "archived",
        archivedAt: new Date(),
        revision: current.revision + 1,
        updatedById: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.assignments.id, id))
      .returning({
        id: schema.assignments.id,
        revision: schema.assignments.revision,
        status: schema.assignments.status,
      });
    if (!updated)
      throw new ManagementError("NOT_FOUND", "assignment.not_found");
    return updated;
  });
}

export async function deleteDraftAssignment(
  db: Database,
  id: string,
  expectedRevision: number,
  actor: AuthoringActor,
) {
  return db.transaction(async (tx) => {
    const current = await lockedAssignment(tx, id, expectedRevision, actor);
    if (current.status !== "draft")
      throw new ManagementError("BAD_REQUEST", "assignment.not_draft");
    await tx.delete(schema.assignments).where(eq(schema.assignments.id, id));
    return { id };
  });
}

/** Everything the designer needs to reopen a draft or a published assignment. */
export async function authoringAssignment(
  db: Database,
  id: string,
  scope: AssessmentScope,
) {
  const row = await db.query.assignments.findFirst({
    where: { id, RAW: (table) => assessmentFilter(table, scope) },
    with: {
      class: { columns: { id: true, name: true, schoolYearId: true } },
      subject: { columns: { id: true, name: true, nameAr: true, icon: true } },
      resources: {
        with: { file: true },
        orderBy: { position: "asc" },
      },
      recipients: { columns: { studentId: true, source: true } },
    },
  });
  if (!row) return undefined;
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    classId: row.classId,
    className: row.class?.name ?? null,
    subjectId: row.subjectId,
    subject: row.subject,
    type: row.type,
    title: row.title,
    instructions: row.instructions,
    description: row.description,
    availableFrom: row.availableFrom,
    dueAt: row.dueAt,
    closesAt: row.closesAt,
    latePolicy: row.latePolicy,
    lateDeductionPercent: row.lateDeductionPercent,
    submissionFormat: row.submissionFormat,
    maxAttachments: row.maxAttachments,
    maxAttachmentBytes: row.maxAttachmentBytes,
    resubmission: row.resubmission,
    maxScore: row.maxScore,
    rubric: row.rubric,
    publishedAt: row.publishedAt,
    resources: row.resources.flatMap((link) =>
      link.file ? [fileSummary(link.file)] : [],
    ),
    recipientMode: row.audience,
    recipientStudentIds: row.recipients.map((link) => link.studentId),
  };
}

/** The assessor's view: the brief plus where every recipient stands. */
export async function assignmentWorkspace(
  db: Database,
  id: string,
  scope: AssessmentScope,
  now: Date,
  today: string,
) {
  const row = await db.query.assignments.findFirst({
    where: { id },
    extras: { canAssess: (table) => assessmentFilter(table, scope) },
    with: {
      class: { columns: { id: true, name: true } },
      subject: { columns: { id: true, name: true, nameAr: true, icon: true } },
      author: { columns: { id: true, name: true } },
      week: { columns: { number: true, startsOn: true, endsOn: true } },
      resources: { with: { file: true }, orderBy: { position: "asc" } },
      recipients: {
        with: {
          student: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
            },
          },
        },
      },
      submissions: {
        with: {
          attempts: {
            columns: {
              id: true,
              number: true,
              submittedAt: true,
              isLate: true,
            },
            with: {
              assessment: {
                columns: {
                  id: true,
                  score: true,
                  effectiveScore: true,
                  releasedAt: true,
                },
              },
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });
  if (!row) return undefined;
  const window = assignmentWindow(row, now);
  const byStudent = new Map(
    row.submissions.map((submission) => [submission.studentId, submission]),
  );
  const recipients = [...row.recipients];
  if (row.audience === "class") {
    const known = new Set(recipients.map((link) => link.studentId));
    const roster = await db.query.enrolments.findMany({
      where: {
        classId: row.classId,
        since: { lte: today },
        OR: [{ until: { isNull: true } }, { until: { gt: today } }],
      },
      with: {
        student: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        },
      },
    });
    for (const enrolment of roster) {
      if (enrolment.student && !known.has(enrolment.studentId))
        recipients.push({
          assignmentId: row.id,
          studentId: enrolment.studentId,
          source: "class",
          createdAt: enrolment.createdAt,
          student: enrolment.student,
        });
    }
  }
  const learners = recipients
    .flatMap((link) => {
      if (!link.student) return [];
      const submission = byStudent.get(link.studentId);
      const attempts = submission?.attempts ?? [];
      const latest = attempts.at(-1) ?? null;
      const released = Boolean(latest?.assessment?.releasedAt);
      return [
        {
          student: link.student,
          source: link.source,
          submissionId: submission?.id ?? null,
          hasDraft: Boolean(submission?.draft),
          state: learnerState({
            window,
            hasDraft: Boolean(submission?.draft),
            attempts: attempts.length,
            released,
          }),
          latestAttempt: latest
            ? {
                id: latest.id,
                number: latest.number,
                submittedAt: latest.submittedAt,
                isLate: latest.isLate,
                assessed: Boolean(latest.assessment),
                released,
                score: latest.assessment?.effectiveScore ?? null,
              }
            : null,
          attemptCount: attempts.length,
        },
      ];
    })
    .toSorted((a, b) =>
      `${a.student.firstName} ${a.student.lastName}`.localeCompare(
        `${b.student.firstName} ${b.student.lastName}`,
      ),
    );
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    title: row.title,
    instructions: row.instructions,
    description: row.description,
    type: row.type,
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
    publishedAt: row.publishedAt,
    canAssess: row.canAssess,
    window,
    resources: row.resources.flatMap((link) =>
      link.file ? [fileSummary(link.file)] : [],
    ),
    learners,
  };
}

/** One attempt with everything an assessor reads and writes. */
export async function attemptForReview(
  db: Database,
  attemptId: string,
  scope: AssessmentScope,
) {
  const attempt = await db.query.submissionAttempts.findFirst({
    where: {
      id: attemptId,
      submission: {
        assignment: { RAW: (table) => assessmentFilter(table, scope) },
      },
    },
    with: {
      files: { with: { file: true }, orderBy: { position: "asc" } },
      assessment: true,
      submittedBy: { columns: { id: true, name: true } },
      submission: {
        columns: {
          id: true,
          studentId: true,
          assignmentId: true,
          currentAttemptId: true,
        },
        with: {
          student: { columns: { id: true, firstName: true, lastName: true } },
          assignment: {
            columns: {
              id: true,
              title: true,
              maxScore: true,
              rubric: true,
              latePolicy: true,
              lateDeductionPercent: true,
              classId: true,
            },
          },
          attempts: {
            columns: {
              id: true,
              number: true,
              submittedAt: true,
              isLate: true,
            },
            with: {
              assessment: {
                columns: { releasedAt: true, effectiveScore: true },
              },
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });
  if (!attempt?.submission?.assignment || !attempt.submission.student)
    return undefined;
  return {
    id: attempt.id,
    number: attempt.number,
    content: attempt.content,
    plainText: attempt.plainText,
    isLate: attempt.isLate,
    submittedAt: attempt.submittedAt,
    submittedBy: attempt.submittedBy,
    files: attempt.files.flatMap((link) =>
      link.file ? [fileSummary(link.file)] : [],
    ),
    assessment: attempt.assessment,
    isCurrent: attempt.submission.currentAttemptId === attempt.id,
    student: attempt.submission.student,
    submissionId: attempt.submission.id,
    assignment: attempt.submission.assignment,
    history: attempt.submission.attempts.map((row) => ({
      id: row.id,
      number: row.number,
      submittedAt: row.submittedAt,
      isLate: row.isLate,
      released: Boolean(row.assessment?.releasedAt),
      score: row.assessment?.effectiveScore ?? null,
    })),
  };
}

export async function assignmentClassIds(db: Database, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.assignments.id, classId: schema.assignments.classId })
    .from(schema.assignments)
    .where(inArray(schema.assignments.id, ids));
  return new Map(rows.map((row) => [row.id, row.classId]));
}
