import type {
  ApplicationRow,
  IntakeRow,
} from "@faridalms/database/stores/admissions";
import type { Scope } from "@faridalms/database/stores/students";

import {
  adoptApplicant,
  adoptHealthRecords,
  closeApplicantRole,
} from "@faridalms/database/stores/admission-decisions";
import {
  descriptorId,
  descriptorsFor,
} from "@faridalms/database/stores/descriptors";
import {
  calendarFor,
  guardiansOf,
  insertRelationship,
  person as readPerson,
  place,
  placements,
  referenceOf,
  refreshCustodyAlert,
  saveArrival,
  setReference,
  syncFamilyRoles,
  updateRelationship,
} from "@faridalms/database/stores/students";
import { holdYear, schoolYears } from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { admissionScope, moveApplication } from "./decisions";
import { audit } from "./procedure";
import { withPurposeFor } from "./purpose";

/**
 * Whom an accepted applicant becomes: themself, or the school's own
 * student matching found when the application was sent, which the office
 * confirms is the same child. Only a match found then can be named.
 */
function studentOf(row: ApplicationRow, named: string): string {
  if (!named || named === row.applicantUserId) return row.applicantUserId;
  if (!(row.matches.students ?? []).some((match) => match.id === named))
    throw new ORPCError("BAD_REQUEST", { message: "enrol.not_matched" });
  return named;
}

/**
 * A former student applying again keeps one record: what the application
 * kept on the applicant (their identity document, consents, health and
 * needs, and the family's links) becomes the student's, and the applicant
 * person is retired as the duplicate it is.
 */
async function joinRecords(
  context: UnitContext,
  row: ApplicationRow,
  studentId: string,
) {
  const tx = context.tx;
  const scope = { tenantId: context.tenantId, today: context.today };
  const [theirs, held] = await Promise.all([
    guardiansOf(tx, scope, row.applicantUserId),
    guardiansOf(tx, scope, studentId),
  ]);
  for (const link of theirs) {
    if (held.some((each) => each.userId === link.userId)) continue;
    await insertRelationship(tx, {
      tenantId: context.tenantId,
      studentId,
      relatedUserId: link.userId,
      relationId: link.relationId,
      relationMeaning: link.relationMeaning,
      flags: {
        legalGuardian: link.legalGuardian,
        portalAccess: link.portalAccess,
        receivesNotifications: link.receivesNotifications,
        primaryContact: link.primaryContact,
        emergencyContact: link.emergencyContact,
        residence: link.residence,
        pickup: link.pickup,
      },
      from: context.today,
      verifiedByUserId: null,
    });
  }
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
  await adoptApplicant(tx, {
    tenantId: context.tenantId,
    fromUserId: row.applicantUserId,
    toUserId: studentId,
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
 * student is kept; the guardians the family named are linked with their
 * relationship and legal-guardian flags, the applying parent now with the
 * portal and notices; the identity document, health and needs and consents
 * stay with the child, as they were kept on them from the first save; a
 * placement for the intake's year and grade starts on its first day with
 * how the child came; the family role their links now give replaces the
 * applying role, which ends the day the child starts; and the application
 * is closed, read-only and linked to the student, with the welcome letter
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
  const scope: Scope = {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: true,
  };
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

  const year = (await schoolYears(tx, context.tenantId, context.schoolId)).find(
    (each) => each.id === intake.schoolYearId,
  );
  if (!year)
    throw new ORPCError("BAD_REQUEST", { message: "school_year.missing" });
  if ((await holdYear(tx, context.tenantId, year.id)) === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  await place(tx, scope, {
    studentId,
    year,
    gradeId: intake.gradeId,
    calendarId: await calendarFor(tx, context.tenantId, year.id),
    from: year.startsOn,
    source: "admission",
  });
  const entryTypes = await descriptorsFor(tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "school_entry_type",
    today: context.today,
  });
  const previous = row.form.schools[0]?.name ?? null;
  const entry = returning
    ? "re_entry"
    : previous
      ? "transfer_in"
      : "first_enrolment";
  const placement = (await placements(tx, scope, studentId)).find(
    (each) => each.schoolYearId === year.id && each.from === year.startsOn,
  );
  if (placement)
    await saveArrival(tx, {
      tenantId: context.tenantId,
      placementId: placement.id,
      entryTypeId:
        entryTypes.find((each) => each.meaning === entry)?.id ?? null,
      previousSchool: previous?.slice(0, 160) ?? null,
    });
  await audit(context, {
    action: "placement.change",
    objectType: "student_school_year",
    objectId: placement?.id ?? null,
    subjectUserId: studentId,
    studentUserId: studentId,
    details: {
      gradeId: intake.gradeId,
      schoolYearId: year.id,
      entry,
      applicationId: row.id,
    },
  });

  const links = await guardiansOf(
    tx,
    { tenantId: context.tenantId, today: context.today },
    studentId,
  );
  for (const link of links) {
    const applying = link.userId === row.familyUserId;
    const updated = await updateRelationship(tx, {
      tenantId: context.tenantId,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      relationId: link.relationId,
      relationMeaning: link.relationMeaning,
      flags: {
        legalGuardian: link.legalGuardian,
        portalAccess: link.portalAccess || applying,
        receivesNotifications: link.receivesNotifications || applying,
        primaryContact: link.primaryContact,
        emergencyContact: link.emergencyContact,
        residence: link.residence,
        pickup: link.pickup,
      },
      editorId: context.actor.userId,
    });
    if (!updated)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await syncFamilyRoles(tx, context.tenantId, link.userId, context.today);
    await audit(context, {
      action: "relationship.update",
      objectType: "user_relationship",
      objectId: link.relationshipId,
      subjectUserId: studentId,
      studentUserId: studentId,
      details: {
        relatedUserId: link.userId,
        relationMeaning: link.relationMeaning,
        legalGuardian: link.legalGuardian,
        portalAccess: link.portalAccess || applying,
        applicationId: row.id,
      },
    });
  }
  await refreshCustodyAlert(tx, context.tenantId, studentId, context.today);
  // The family role the links give opens the family workspace once the
  // child is a student today; until then the applying role keeps it open.
  const endsOn = year.startsOn > context.today ? year.startsOn : context.today;
  if (
    await closeApplicantRole(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userId: row.familyUserId,
      endsOn,
    })
  )
    await audit(context, {
      action: "user_role.end",
      objectType: "user_role",
      subjectUserId: row.familyUserId,
      details: { role: "applicant_family", endsOn, applicationId: row.id },
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
