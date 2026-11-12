import type {
  ApplicationRow,
  IntakeRow,
} from "@faridalms/database/stores/admissions";

import {
  adoptApplicant,
  adoptHealthRecords,
  closeApplicantRole,
} from "@faridalms/database/stores/admission-decisions";
import { descriptorId } from "@faridalms/database/stores/descriptors";
import {
  person as readPerson,
  referenceOf,
  setReference,
  ensureStudentRole,
} from "@faridalms/database/stores/students";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { audit } from "../core/procedure";
import { withPurposeFor } from "../core/purpose";
import { scopeFor } from "../core/reach";
import { admissionScope, moveApplication } from "./decisions";
import { enrolParts, filingModule } from "./points";

/**
 * Whom an accepted applicant becomes: themself, or the school's own
 * student matching found when the application was sent, which the office
 * confirms is the same child. Only a match found then can be named.
 */
function studentOf(row: ApplicationRow, named: string): string {
  if (!named || named === row.applicantUserId) return row.applicantUserId;
  if (!(row.matches.students ?? []).some((match) => match.id === named))
    throw new ORPCError("BAD_REQUEST", { message: "enrol.not_matched" });
  // Joining retires the applicant person, who for someone who applied for
  // themself is the account they sign in with.
  if (row.filedByUserId === row.applicantUserId)
    throw new ORPCError("BAD_REQUEST", { message: "enrol.self_matched" });
  return named;
}

/**
 * A former student applying again keeps one record: what the application
 * kept on the applicant (their identity document, consents, health and
 * needs, and what links people to them) becomes the student's, and the
 * applicant person is retired as the duplicate it is.
 */
async function joinRecords(
  context: UnitContext,
  row: ApplicationRow,
  studentId: string,
) {
  const tx = context.tx;
  await withPurposeFor(
    context,
    {
      purpose: "health",
      subjectUserId: studentId,
      reason: "Joined an applicant's health and needs to the student",
      write: true,
      capabilities: ["admissions:decide"],
    },
    (purposeTx) =>
      adoptHealthRecords(purposeTx, {
        tenantId: context.tenantId,
        fromUserId: row.applicantUserId,
        toUserId: studentId,
      }),
  );
  const consentIds = await adoptApplicant(tx, {
    tenantId: context.tenantId,
    fromUserId: row.applicantUserId,
    toUserId: studentId,
  });
  await (
    await filingModule(context)
  )?.joined(context, {
    fromId: row.applicantUserId,
    toId: studentId,
    consentIds,
  });
  await audit(context, {
    action: "user.join",
    objectType: "user",
    objectId: studentId,
    subjectUserId: studentId,
    studentUserId: studentId,
    details: { from: row.applicantUserId, applicationId: row.id },
  });
}

/**
 * Enrols an accepted applicant, all in the caller's one transaction: the
 * applicant becomes a student with the school's reference, or the existing
 * student is kept; the identity document, health and needs and consents
 * stay with them, as they were kept on them from the first save; they are
 * the school's student from the intake's first day, and each module
 * records its part (the year and grade the intake admits into, how they
 * came, and for someone who applied for them, what their links now open);
 * the applying role ends the day they start; and the application is
 * closed, read-only and linked to the student, with the welcome letter
 * sent.
 */
export async function enrol(
  context: UnitContext,
  input: {
    row: ApplicationRow;
    intake: IntakeRow;
    expectedVersion: number;
    studentId: string;
    reference: string;
  },
) {
  const { row, intake } = input;
  if (row.state !== "accepted")
    throw new ORPCError("CONFLICT", { message: "application.state" });
  const tx = context.tx;
  const scope = scopeFor(context, "school");
  const studentId = studentOf(row, input.studentId);
  const returning = studentId !== row.applicantUserId;
  if (!(await readPerson(tx, studentId))) throw new ORPCError("NOT_FOUND");
  if (returning) await joinRecords(context, row, studentId);

  if (!(await referenceOf(tx, scope, studentId))) {
    const reference = input.reference || row.reference;
    if (!reference)
      throw new ORPCError("BAD_REQUEST", { message: "validation.reference" });
    await setReference(tx, scope, {
      userId: studentId,
      reference,
      systemId: await descriptorId(
        tx,
        context.tenantId,
        "external_id_system",
        "school_reference",
      ),
    });
  }

  await ensureStudentRole(tx, scope, studentId, intake.startsOn);
  const previous = row.form.schools[0]?.name ?? null;
  const entry = returning
    ? "re_entry"
    : previous
      ? "transfer_in"
      : "first_enrolment";
  await enrolParts(context, {
    intakeId: intake.id,
    studentId,
    startsOn: intake.startsOn,
    entry,
    previousSchool: previous?.slice(0, 160) ?? null,
    applicationId: row.id,
  });

  // The role enrolment gives opens the filer's workspace once the student
  // starts; until then the applying role keeps it open.
  const endsOn =
    intake.startsOn > context.today ? intake.startsOn : context.today;
  if (
    await closeApplicantRole(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userId: row.filedByUserId,
      endsOn,
    })
  )
    await audit(context, {
      action: "user_role.end",
      objectType: "user_role",
      subjectUserId: row.filedByUserId,
      details: { endsOn, applicationId: row.id },
    });

  const version = await moveApplication(admissionScope(context), {
    row,
    intake,
    to: "enrolled",
    expectedVersion: input.expectedVersion,
    studentUserId: studentId,
    details: { studentId, returning },
  });
  if (version === null)
    throw new ORPCError("CONFLICT", { message: "conflict.version" });
  return { studentId, version };
}
