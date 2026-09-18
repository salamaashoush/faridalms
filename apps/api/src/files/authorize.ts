import type { fileWithLinks } from "@faridalms/database/repositories/files";

import { schema } from "@faridalms/database";
import { and, eq, inArray } from "drizzle-orm";

import type { SchoolContext } from "../context";

import { visibleClassIds } from "../authorization";

type LinkedFile = NonNullable<Awaited<ReturnType<typeof fileWithLinks>>>;

async function canAssess(
  context: SchoolContext,
  offering: { classId: string; subjectId: string },
) {
  if (context.user.role === "admin")
    return context.user.permissions.includes("submissions:grade");
  if (!context.user.permissions.includes("submissions:grade")) return false;
  const row = await context.db.query.classSubjects.findFirst({
    where: {
      classId: offering.classId,
      subjectId: offering.subjectId,
      teacherId: context.user.id,
    },
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * A download is authorised by the record the file hangs off, never by the id.
 * Owners always read their own files; everyone else needs the assignment or
 * the submission to be theirs to see.
 */
export async function canReadFile(
  context: SchoolContext,
  file: LinkedFile,
): Promise<boolean> {
  const user = context.user;
  if (file.ownerId === user.id) return true;
  const familyIds = user.studentIds;

  for (const link of file.resourceLinks) {
    const assignment = link.assignment;
    if (!assignment) continue;
    if (assignment.status === "draft") {
      if (
        user.role === "admin" &&
        user.permissions.includes("assignments:author")
      )
        return true;
      continue;
    }
    if (!user.permissions.includes("assignments:read")) continue;
    if (user.role === "admin") return true;
    if (user.role === "teacher") {
      const classes = await visibleClassIds(context, user);
      if (classes.includes(assignment.classId)) return true;
      continue;
    }
    if (familyIds.length === 0) continue;
    const recipient = await context.db
      .select({ studentId: schema.assignmentRecipients.studentId })
      .from(schema.assignmentRecipients)
      .where(
        and(
          eq(schema.assignmentRecipients.assignmentId, assignment.id),
          inArray(schema.assignmentRecipients.studentId, familyIds),
        ),
      )
      .limit(1);
    if (recipient.length) return true;
  }

  for (const link of file.attemptLinks) {
    const submission = link.attempt?.submission;
    if (!submission?.assignment) continue;
    if (familyIds.includes(submission.studentId)) return true;
    if (await canAssess(context, submission.assignment)) return true;
  }

  for (const link of file.draftLinks) {
    const submission = link.submission;
    if (!submission?.assignment) continue;
    if (user.ownStudentId === submission.studentId) return true;
    if (await canAssess(context, submission.assignment)) return true;
  }

  for (const link of file.lessonLinks) {
    const module = link.lesson?.module;
    if (!module || !user.permissions.includes("assignments:read")) continue;
    if (user.role === "admin") return true;
    if (user.role === "teacher") {
      const classes = await visibleClassIds(context, user);
      if (classes.includes(module.classId)) return true;
      continue;
    }
    if (module.status !== "published" || familyIds.length === 0) continue;
    const enrolled = await context.db.query.enrolments.findFirst({
      where: {
        classId: module.classId,
        studentId: { in: familyIds },
        since: { lte: context.today },
        OR: [{ until: { isNull: true } }, { until: { gt: context.today } }],
      },
      columns: { id: true },
    });
    if (enrolled) return true;
  }

  for (const link of file.messageLinks) {
    const message = link.message;
    if (!message || !user.permissions.includes("messages:read")) continue;
    if (
      message.senderId === user.id ||
      message.recipients.some((row) => row.recipientId === user.id)
    )
      return true;
  }
  return false;
}
