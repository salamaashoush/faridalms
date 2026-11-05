import type { Descriptor } from "@faridalms/database/stores/descriptors";
import type { PersonReach } from "@faridalms/database/stores/persons";
import type { SignInRefusal } from "@faridalms/domain/first-sign-in";
import type { ContactLabel, StudentStatus } from "@faridalms/domain/people";

import { lookupHmac } from "@faridalms/database/crypto";
import { rolesForSchool } from "@faridalms/database/stores/access";
import {
  createPasswordAccount,
  revokeAccountSessions,
  setAccountState,
  signInOf,
  takenLoginNames,
  updatePasswordSignIn,
} from "@faridalms/database/stores/accounts";
import { lastMarkFrom } from "@faridalms/database/stores/attendance";
import { badgesOf, issueBadge } from "@faridalms/database/stores/badges";
import {
  classesTaughtBy,
  endStudentEnrollmentsFrom,
  homeroomsOn,
  reopenStudentEnrollments,
  teachersOf,
} from "@faridalms/database/stores/classes";
import { photoRefusals } from "@faridalms/database/stores/consents";
import {
  descriptorId,
  descriptorsFor,
} from "@faridalms/database/stores/descriptors";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import { historyOf } from "@faridalms/database/stores/history";
import { studentsByIdentifier } from "@faridalms/database/stores/identifiers";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  decidingGuardians,
  issueInvite,
  reserveLoginName,
  settleInvites,
  voidInvite,
} from "@faridalms/database/stores/invites";
import { unreachable } from "@faridalms/database/stores/messages";
import {
  noticesAbout,
  reachability,
} from "@faridalms/database/stores/notifications";
import {
  childrenOf,
  contactsOf,
  replaceAddress,
  replaceContact,
  rolesAt,
  searchReached,
  setPhoto as storePhoto,
  siblingsOf,
} from "@faridalms/database/stores/persons";
import {
  schoolRoleIds,
  setStaffRoles,
  staffDirectory,
} from "@faridalms/database/stores/staff";
import {
  accountOf,
  addContact,
  calendarFor,
  endPlacement,
  endRelationship,
  endStudentRole,
  ensureStudentRole,
  guardiansOf,
  insertPerson,
  insertRelationship,
  nameColumns,
  peopleByContact,
  person as readPerson,
  place,
  placements,
  referenceOf,
  refreshCustodyAlert,
  relationshipOf,
  reopenPlacement,
  saveArrival as storeArrival,
  setReference,
  signInSeeds,
  studentDirectory,
  studentRoleEnd,
  studentMatches,
  syncFamilyRoles,
  updatePerson,
  updateRelationship,
  voidPlacementsFrom,
  youngStudents,
} from "@faridalms/database/stores/students";
import {
  dayIn,
  holdYear,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  createSignInsSchema,
  firstPassword,
  freeLoginName,
  INVITE_DAYS,
  loginNameChoices,
  sendSignInLinkSchema,
} from "@faridalms/domain/first-sign-in";
import { normaliseIdentifier } from "@faridalms/domain/identifiers";
import {
  addressLine,
  cancelLeavingSchema,
  CONTACT_LABELS,
  endRelationshipSchema,
  guardianLookupSchema,
  accountStateSchema,
  leaverAccessEnd,
  personSearchSchema,
  recordLeavingSchema,
  saveArrivalSchema,
  saveContactsSchema,
  saveRelationshipSchema,
  saveSignInSchema,
  saveStaffSchema,
  saveStudentSchema,
  setPhotoSchema,
  shownContacts,
  staffDirectorySchema,
  studentDirectorySchema,
  studentMatchesSchema,
  studentStatus,
} from "@faridalms/domain/people";
import { toE164 } from "@faridalms/domain/phone";
import { addDays } from "@faridalms/domain/school";
import { STAFF_ROLES } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { guardingAccess, requireGrantable } from "../core/access";
import { badgeTerm } from "../core/badges";
import { refreshLoginsAfter } from "../core/login-index";
import { welcomeLink } from "../core/portal";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  reachesClass,
  reachesPerson,
  reachesStudent,
  requirePerson,
  requireStudent,
  scopeFor,
} from "../core/reach";
import { issueBadgeSecret } from "../core/session";
import { emailSignInLink } from "../core/sign-in-link";
import { yearOf } from "../core/years";
import { registerHostReader } from "../files/authorize";
import { inviteMessage } from "../notifications/templates";

const id = v.pipe(v.string(), v.uuid());
const STAFF_ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES);

// A person's photo is seen by whoever may see the person.
registerHostReader(
  "person",
  async (context, personId) =>
    personId === context.actor.userId ||
    (await reachesPerson(context, "people", personId)) !== null,
);

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Puts a photo on a person or takes it away. Grown-ups keep their own; a
 * student's is kept by staff who manage people, as the school's record of
 * who the child is.
 */
export const setPhoto = writeProcedure
  .input(setPhotoSchema)
  .handler(async ({ input, context }) => {
    const own =
      input.personId === context.actor.userId &&
      context.actor.workspace !== "me";
    if (!own) {
      requireCapability(context, "people:manage", "staff:manage");
      await requirePerson(context, "people", input.personId);
    }
    if (input.fileId) {
      const [file] = await filesByIds(context.tx, context.tenantId, [
        input.fileId,
      ]);
      if (
        !file ||
        file.purpose !== "avatar" ||
        !PHOTO_TYPES.has(file.mediaType)
      )
        throw new ORPCError("BAD_REQUEST", { message: "validation.file_type" });
      const linked = await linkFiles(context.tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        ids: [input.fileId],
        purpose: "avatar",
        host: { type: "person", id: input.personId },
      });
      if (linked.length !== 1)
        throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
    }
    await storePhoto(context.tx, {
      tenantId: context.tenantId,
      userId: input.personId,
      fileId: input.fileId,
    });
    await audit(context, {
      action: input.fileId ? "person.photo_set" : "person.photo_removed",
      objectType: "user",
      objectId: input.personId,
      subjectUserId: input.personId,
    });
    return { photoFileId: input.fileId };
  });

async function countryOf(context: UnitContext) {
  return (
    (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG"
  );
}

/** The choices the people forms offer, labelled as this school labels them. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "people:read", "people:manage");
  const load = (namespace: string) =>
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace,
      today: context.today,
    });
  const [
    grades,
    relations,
    sexes,
    positions,
    religions,
    entryTypes,
    exitTypes,
    years,
  ] = await Promise.all([
    load("grade_level"),
    load("relation"),
    load("sex"),
    load("staff_position"),
    load("religion"),
    load("school_entry_type"),
    load("school_exit_type"),
    schoolYears(context.tx, context.tenantId, context.schoolId),
  ]);
  return {
    grades,
    relations,
    sexes,
    positions,
    religions,
    entryTypes,
    exitTypes,
    years,
    workingYearId: workingYear(years, context.today)?.id ?? null,
  };
});

export const students = readProcedure
  .input(studentDirectorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    const { years, year } = await yearOf(context, input.year);
    const working = workingYear(years, context.today);
    if (!year)
      return {
        year: null,
        today: context.today,
        rows: [],
        total: 0,
        page: 1,
        pages: 1,
      };
    const grades = await descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "grade_level",
      today: context.today,
      includeRetired: true,
    });
    const phone = /^[+0-9 ()-]{7,}$/.test(input.q)
      ? toE164(input.q, await countryOf(context))
      : null;
    const number = normaliseIdentifier(input.q);
    const documentHolders =
      /^[A-Z0-9]{5,64}$/.test(number) &&
      (can(context, "people:manage") || can(context, "identifiers:read"))
        ? await studentsByIdentifier(context.tx, {
            tenantId: context.tenantId,
            plain: number,
            hmac: await lookupHmac(
              (
                await context.keys.active(
                  context.tx,
                  context.tenantId,
                  "identifier_lookup",
                )
              ).key,
              number,
            ),
          })
        : [];
    const { rows, total } = await studentDirectory(
      context.tx,
      scopeFor(context, "people"),
      {
        yearId: year.id,
        working: year.id === working?.id,
        q: input.q,
        phone,
        documentHolders,
        gradeIds: input.grade,
        statuses: input.status,
        missingGuardian: input.missing.includes("guardian"),
        missingAccount: input.missing.includes("account"),
        sort: input.sort,
        dir: input.dir,
        locale: localeOf(context),
        gradeOrder: grades.map((grade) => grade.id),
        page: input.page,
        pageSize: input.pageSize,
      },
    );
    const byId = new Map(grades.map((grade) => [grade.id, grade]));
    const homerooms = await homeroomsOn(
      context.tx,
      context,
      rows.map((row) => row.id),
      dayIn(year, context.today),
    );
    return {
      year: {
        id: year.id,
        titleEn: year.titleEn,
        titleAr: year.titleAr,
        lifecycle: year.lifecycle,
      },
      today: context.today,
      rows: rows.map((row) => {
        const grade = row.gradeId ? byId.get(row.gradeId) : undefined;
        return {
          ...row,
          grade: grade
            ? { id: grade.id, labelEn: grade.labelEn, labelAr: grade.labelAr }
            : null,
          homeroom: homerooms.get(row.id) ?? null,
        };
      }),
      total,
      page: input.page,
      pages: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  });

/** The class a student is in today and the teachers who keep it. */
async function homeroomOf(context: UnitContext, studentId: string) {
  const homeroom = (
    await homeroomsOn(context.tx, context, [studentId], context.today)
  ).get(studentId);
  if (!homeroom) return null;
  const teachers =
    (
      await teachersOf(
        context.tx,
        context.tenantId,
        [homeroom.classId],
        context.today,
      )
    ).get(homeroom.classId) ?? [];
  return {
    ...homeroom,
    teachers: teachers
      .filter((teacher) => teacher.role === "teacher")
      .map((teacher) => ({
        userId: teacher.userId,
        fullNameEn: teacher.fullNameEn,
        fullNameAr: teacher.fullNameAr,
      })),
  };
}

/** A student's record at this school, with what the viewer may open in it. */
export const student = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, "people", input.id);
    const scope = scopeFor(context, "people");
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    const [reference, history, guardians, years] = await Promise.all([
      referenceOf(context.tx, scope, input.id),
      placements(context.tx, scope, input.id),
      can(context, "contacts:read") || can(context, "people:manage")
        ? guardiansOf(context.tx, scope, input.id)
        : Promise.resolve(null),
      schoolYears(context.tx, context.tenantId, context.schoolId),
    ]);
    const current = history.find(
      (row) => row.from <= context.today && context.today < row.to,
    );
    const [account, refusals, accessUntil, homeroom] = await Promise.all([
      accountOf(context.tx, context.tenantId, input.id),
      photoRefusals(context.tx, {
        tenantId: context.tenantId,
        studentIds: [input.id],
      }),
      studentRoleEnd(context.tx, scope, input.id),
      homeroomOf(context, input.id),
    ]);
    const status: StudentStatus = studentStatus(
      history.map((row) => ({
        validFrom: row.from,
        validTo: row.to,
        exitMeaning: row.exitMeaning,
      })),
      context.today,
    );
    return {
      ...record,
      reference: reference?.identifier ?? null,
      status,
      placement: current ?? null,
      placements: history,
      homeroom,
      /** For a leaver, the day they and their family stop reading the record. */
      accessUntil,
      guardians,
      account,
      workingYearId: workingYear(years, context.today)?.id ?? null,
      today: context.today,
      noPhotos: refusals.has(input.id),
      access: {
        manage: can(context, "people:manage"),
        consents:
          can(context, "people:manage") || can(context, "privacy:manage"),
        identifiers:
          can(context, "people:manage") || can(context, "identifiers:read"),
        contacts: guardians !== null,
        health: can(context, "health:read"),
        support: can(context, "people:read") || can(context, "support:manage"),
        demographics: can(context, "demographics:read"),
        custody: can(context, "custody:read"),
        history: can(context, "people:manage") || can(context, "audit:read"),
        attendance: can(context, "attendance:read"),
        timetable: can(context, "timetable:read"),
        message: can(context, "messages:send"),
        coursework:
          can(context, "people:read") && can(context, "assignments:read"),
      },
    };
  });

/** What the school recently told the student's guardians about them, for the office. */
export const studentNotices = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    await requireStudent(context, "people", input.id);
    const guardians = await guardiansOf(
      context.tx,
      scopeFor(context, "people"),
      input.id,
    );
    return noticesAbout(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentId: input.id,
      userIds: guardians.map((guardian) => guardian.userId),
      limit: 6,
    });
  });

export const studentHistory = readProcedure
  .input(
    v.object({ id, before: v.optional(v.pipe(v.string(), v.isoTimestamp())) }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "audit:read");
    await requireStudent(context, "people", input.id);
    return historyOf(context.tx, context.tenantId, input.id, {
      limit: 50,
      before: input.before,
    });
  });

export const matches = readProcedure
  .input(studentMatchesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const columns = nameColumns(input.names);
    return studentMatches(context.tx, scopeFor(context, "people"), {
      fullNameEn: columns.fullNameEn,
      fullNameAr: columns.fullNameAr,
      birthDate: input.birthDate,
      exceptId: input.exceptId,
    });
  });

/**
 * People already holding a phone or email, so a guardian is linked rather
 * than created twice. A match known only at another school of the group shows
 * a minimal card: name, photo and year of birth.
 */
export const findGuardians = readProcedure
  .input(guardianLookupSchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "people:manage",
      "guardians:manage",
      "staff:manage",
    );
    if (input.phone) {
      const normalized = toE164(input.phone, await countryOf(context));
      return normalized
        ? peopleByContact(context.tx, context.tenantId, {
            kind: "phone",
            normalized,
          })
        : [];
    }
    if (input.email)
      return peopleByContact(context.tx, context.tenantId, {
        kind: "email",
        normalized: input.email.toLowerCase(),
      });
    return [];
  });

async function relationMeaning(context: UnitContext, relationId: string) {
  const relations = await descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "relation",
    today: context.today,
  });
  const relation = relations.find((row) => row.id === relationId);
  if (!relation?.meaning)
    throw new ORPCError("BAD_REQUEST", {
      message: "relationship.relation_invalid",
    });
  return relation.meaning;
}

async function createGuardian(
  context: UnitContext,
  person: v.InferOutput<typeof saveRelationshipSchema>["person"],
) {
  if (!person)
    throw new ORPCError("BAD_REQUEST", { message: "validation.required" });
  const created = await insertPerson(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    names: person.names,
  });
  const country = await countryOf(context);
  if (person.phone) {
    const normalized = toE164(person.phone, country);
    if (!normalized)
      throw new ORPCError("BAD_REQUEST", {
        message: "contact_point.phone_invalid",
      });
    await addContact(context.tx, {
      tenantId: context.tenantId,
      userId: created.id,
      kind: "phone",
      value: person.phone,
      normalized,
      label: "mobile",
    });
  }
  if (person.email)
    await addContact(context.tx, {
      tenantId: context.tenantId,
      userId: created.id,
      kind: "email",
      value: person.email,
      normalized: person.email.toLowerCase(),
      label: "personal",
    });
  await audit(context, {
    action: "user.create",
    objectType: "user",
    objectId: created.id,
    subjectUserId: created.id,
    change: {
      table: "core.users",
      before: null,
      after: nameColumns(person.names),
    },
  });
  return created.id;
}

async function linkGuardian(
  context: UnitContext,
  studentId: string,
  link: {
    existingUserId?: string;
    person?: v.InferOutput<typeof saveRelationshipSchema>["person"];
    flags: v.InferOutput<typeof saveRelationshipSchema>["flags"];
  },
) {
  const relatedUserId =
    link.existingUserId ?? (await createGuardian(context, link.person));
  if (relatedUserId === studentId)
    throw new ORPCError("BAD_REQUEST", { message: "relationship.self" });
  const meaning = await relationMeaning(context, link.flags.relationId);
  const { relationId, ...flags } = link.flags;
  const relationshipId = await insertRelationship(context.tx, {
    tenantId: context.tenantId,
    studentId,
    relatedUserId,
    relationId,
    relationMeaning: meaning,
    flags,
    from: context.today,
    verifiedByUserId: context.actor.userId,
  });
  await syncFamilyRoles(
    context.tx,
    context.tenantId,
    relatedUserId,
    context.today,
  );
  await audit(context, {
    action: "relationship.create",
    objectType: "user_relationship",
    objectId: relationshipId,
    subjectUserId: studentId,
    studentUserId: studentId,
    change: {
      table: "core.user_relationships",
      before: null,
      after: { relatedUserId, relationMeaning: meaning, ...flags },
    },
  });
  return relationshipId;
}

export const saveStudent = writeProcedure
  .input(saveStudentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const scope = scopeFor(context, "people");
    const tx = context.tx;
    const referenceSystem = await descriptorId(
      tx,
      context.tenantId,
      "external_id_system",
      "school_reference",
    );
    let studentId: string;
    if (input.id) {
      await requireStudent(context, "people", input.id);
      const before = await readPerson(tx, input.id);
      if (!before) throw new ORPCError("NOT_FOUND");
      const updated = await updatePerson(tx, {
        tenantId: context.tenantId,
        userId: input.id,
        expectedVersion: input.expectedVersion ?? 0,
        names: input.names,
        preferredGivenName: input.preferredName,
        birthDate: input.birthDate || null,
        sexId: input.sexId || null,
      });
      if (!updated)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      studentId = input.id;
      await audit(context, {
        action: "user.update",
        objectType: "user",
        objectId: studentId,
        subjectUserId: studentId,
        studentUserId: studentId,
        change: {
          table: "core.users",
          before: {
            ...nameColumns({
              ar: {
                given: before.givenNameAr,
                middle: before.middleNameAr,
                family: before.familyNameAr,
              },
              en: {
                given: before.givenNameEn,
                middle: before.middleNameEn,
                family: before.familyNameEn,
              },
            }),
            birthDate: before.birthDate,
            sexDescriptorId: before.sexId,
            preferredGivenName: before.preferredGivenName,
          },
          after: {
            ...nameColumns(input.names),
            birthDate: input.birthDate || null,
            sexDescriptorId: input.sexId || null,
            preferredGivenName: input.preferredName,
          },
        },
      });
    } else {
      const created = await insertPerson(tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        names: input.names,
        preferredGivenName: input.preferredName,
        birthDate: input.birthDate || null,
        sexId: input.sexId || null,
      });
      studentId = created.id;
      await ensureStudentRole(tx, scope, studentId, context.today);
      await audit(context, {
        action: "user.create",
        objectType: "user",
        objectId: studentId,
        subjectUserId: studentId,
        studentUserId: studentId,
        change: {
          table: "core.users",
          before: null,
          after: {
            ...nameColumns(input.names),
            birthDate: input.birthDate || null,
          },
        },
      });
    }
    await setReference(tx, scope, {
      userId: studentId,
      reference: input.reference,
      systemId: referenceSystem,
    });
    if (input.gradeId) {
      const years = await schoolYears(tx, context.tenantId, context.schoolId);
      const year = workingYear(years, context.today);
      if (!year)
        throw new ORPCError("BAD_REQUEST", { message: "school_year.missing" });
      if ((await holdYear(tx, context.tenantId, year.id)) === "closed")
        throw new ORPCError("CONFLICT", { message: "school_year.closed" });
      const result = await place(tx, scope, {
        studentId,
        year,
        gradeId: input.gradeId,
        calendarId: await calendarFor(tx, context.tenantId, year.id),
      });
      if (result.changed)
        await audit(context, {
          action: "placement.change",
          objectType: "student_school_year",
          subjectUserId: studentId,
          studentUserId: studentId,
          details: { gradeId: input.gradeId, schoolYearId: year.id },
        });
    }
    if (!input.id)
      for (const link of input.guardians)
        await linkGuardian(context, studentId, link);
    const saved = await readPerson(tx, studentId);
    return { id: studentId, version: saved?.version ?? 1 };
  });

export const saveRelationship = writeProcedure
  .input(saveRelationshipSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    await requireStudent(context, "people", input.studentId);
    if (!input.relationshipId) {
      const relationshipId = await linkGuardian(
        context,
        input.studentId,
        input,
      );
      await refreshCustodyAlert(
        context.tx,
        context.tenantId,
        input.studentId,
        context.today,
      );
      return { id: relationshipId };
    }
    const existing = await relationshipOf(
      context.tx,
      context.tenantId,
      input.relationshipId,
    );
    if (!existing || existing.studentUserId !== input.studentId)
      throw new ORPCError("NOT_FOUND");
    const meaning = await relationMeaning(context, input.flags.relationId);
    const { relationId, ...flags } = input.flags;
    const updated = await updateRelationship(context.tx, {
      tenantId: context.tenantId,
      relationshipId: input.relationshipId,
      expectedVersion: input.expectedVersion ?? 0,
      relationId,
      relationMeaning: meaning,
      flags,
      editorId: context.actor.userId,
    });
    if (!updated)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await syncFamilyRoles(
      context.tx,
      context.tenantId,
      updated.relatedUserId,
      context.today,
    );
    await refreshCustodyAlert(
      context.tx,
      context.tenantId,
      input.studentId,
      context.today,
    );
    await audit(context, {
      action: "relationship.update",
      objectType: "user_relationship",
      objectId: input.relationshipId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      change: {
        table: "core.user_relationships",
        before: null,
        after: { relationMeaning: meaning, ...flags },
      },
    });
    return { id: input.relationshipId };
  });

export const endLink = writeProcedure
  .input(endRelationshipSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    const existing = await relationshipOf(
      context.tx,
      context.tenantId,
      input.relationshipId,
    );
    if (!existing) throw new ORPCError("NOT_FOUND");
    await requireStudent(context, "people", existing.studentUserId);
    const ended = await endRelationship(context.tx, {
      tenantId: context.tenantId,
      relationshipId: input.relationshipId,
      expectedVersion: input.expectedVersion,
      today: context.today,
    });
    if (!ended)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await syncFamilyRoles(
      context.tx,
      context.tenantId,
      ended.related_user_id,
      context.today,
    );
    await refreshCustodyAlert(
      context.tx,
      context.tenantId,
      existing.studentUserId,
      context.today,
    );
    await audit(context, {
      action: "relationship.end",
      objectType: "user_relationship",
      objectId: input.relationshipId,
      subjectUserId: existing.studentUserId,
      studentUserId: existing.studentUserId,
    });
    return { ended: true };
  });

function labelFrom(list: Descriptor[], value: string | null) {
  const found = list.find((row) => row.id === value);
  return found ? { labelEn: found.labelEn, labelAr: found.labelAr } : null;
}

/**
 * The classes a member of staff teaches or assists in the working year, as
 * they stand today or on the year's nearest day, each marked with whether
 * the viewer may open it. A profile lists only the classes the viewer, or a
 * child they follow, is in, and opens none of them: families and students
 * keep to their own pages.
 */
async function teachingOf(
  context: UnitContext,
  userId: string,
  subjects: Descriptor[],
  view: PersonReach,
) {
  const year = workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
  if (!year) return null;
  const on = dayIn(year, context.today);
  const taught = await classesTaughtBy(context.tx, context, {
    userId,
    yearId: year.id,
    on,
  });
  const reached = await Promise.all(
    taught.map((row) =>
      reachesClass(context, view === "record" ? "classes" : "own", row.id, on),
    ),
  );
  return {
    year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
    classes: taught.flatMap((row, index) =>
      view === "record" || reached[index]
        ? [
            {
              id: row.id,
              code: row.code,
              titleEn: row.titleEn,
              titleAr: row.titleAr,
              classType: row.classType,
              role: row.role,
              homeroomTitleEn: row.homeroomTitleEn,
              homeroomTitleAr: row.homeroomTitleAr,
              subject: labelFrom(subjects, row.subjectId),
              canOpen: view === "record" && (reached[index] ?? false),
            },
          ]
        : [],
    ),
  };
}

const labelsOf = (context: UnitContext, namespace: string) =>
  descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace,
    today: context.today,
    includeRetired: true,
  });

/**
 * The limited profile a family or a student opens for a teacher of their
 * classes, or for someone they share a conversation with: who they are,
 * what they teach the viewer's children and whether the viewer may write to
 * them, never the rest of the record. Anyone the viewer reaches at all has
 * one.
 */
export const profile = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    if (
      input.id !== context.actor.userId &&
      !(await reachesPerson(context, "people", input.id))
    )
      throw new ORPCError("NOT_FOUND");
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    return profileOf(context, record);
  });

async function profileOf(
  context: UnitContext,
  record: NonNullable<Awaited<ReturnType<typeof readPerson>>>,
) {
  const [roles, positions] = await Promise.all([
    rolesAt(context.tx, context, record.id),
    labelsOf(context, "staff_position"),
  ]);
  const current = roles.filter(
    (role) => role.from <= context.today && STAFF_ROLE_SET.has(role.role),
  );
  const teaching = current.length
    ? await teachingOf(
        context,
        record.id,
        await labelsOf(context, "subject"),
        "profile",
      )
    : null;
  const message =
    record.id !== context.actor.userId &&
    can(context, "messages:send") &&
    (await unreachable(context.tx, scopeFor(context, "classes"), [record.id]))
      .length === 0;
  return {
    id: record.id,
    givenNameAr: record.givenNameAr,
    familyNameAr: record.familyNameAr,
    fullNameAr: record.fullNameAr,
    givenNameEn: record.givenNameEn,
    familyNameEn: record.familyNameEn,
    fullNameEn: record.fullNameEn,
    preferredGivenName: record.preferredGivenName,
    photoFileId: record.photoFileId,
    roles: current.map((role) => ({
      id: role.id,
      role: role.role,
      titleEn: role.titleEn,
      titleAr: role.titleAr,
      position: labelFrom(positions, role.positionId),
    })),
    teaching,
    access: { message },
  };
}

/**
 * A person's record at this school: a guardian, a member of staff, or the
 * viewer themselves. Contact details show to staff who read contacts and to
 * the person; linked students only where the viewer reaches them. Someone
 * the viewer reaches only as far as a profile is not found here.
 */
export const person = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const scope = scopeFor(context, "people");
    const self = input.id === context.actor.userId;
    if (!self) await requirePerson(context, "people", input.id);
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    const manage = can(context, "people:manage");
    const seesContacts = self || manage || can(context, "contacts:read");
    const [roles, contacts, children, account, relations, positions] =
      await Promise.all([
        rolesAt(context.tx, scope, input.id),
        seesContacts
          ? contactsOf(context.tx, context.tenantId, input.id)
          : Promise.resolve(null),
        childrenOf(context.tx, scope, input.id),
        accountOf(context.tx, context.tenantId, input.id),
        labelsOf(context, "relation"),
        labelsOf(context, "staff_position"),
      ]);
    const personal = manage || self;
    const staffMember = roles.some((role) => STAFF_ROLE_SET.has(role.role));
    const teaching = staffMember
      ? await teachingOf(
          context,
          input.id,
          await labelsOf(context, "subject"),
          "record",
        )
      : null;
    const signIn =
      !self && (staffMember ? can(context, "staff:manage") : manage);
    return {
      id: record.id,
      version: record.version,
      givenNameAr: record.givenNameAr,
      middleNameAr: record.middleNameAr,
      familyNameAr: record.familyNameAr,
      fullNameAr: record.fullNameAr,
      givenNameEn: record.givenNameEn,
      middleNameEn: record.middleNameEn,
      familyNameEn: record.familyNameEn,
      fullNameEn: record.fullNameEn,
      preferredGivenName: record.preferredGivenName,
      photoFileId: record.photoFileId,
      birthDate: personal ? record.birthDate : null,
      roles: roles.map((role) => ({
        ...role,
        position: labelFrom(positions, role.positionId),
      })),
      contacts,
      children: children.map((child) => ({
        ...child,
        relation: labelFrom(relations, child.relationId),
      })),
      account: personal || signIn ? account : null,
      teaching,
      today: context.today,
      access: {
        self,
        manage,
        signIn,
        staff: staffMember && can(context, "staff:manage"),
        roles: staffMember && can(context, "access:manage"),
        history: manage || can(context, "audit:read"),
        photo: self || manage || (staffMember && can(context, "staff:manage")),
        contacts:
          !self &&
          !staffMember &&
          !roles.some((role) => role.role === "student") &&
          (manage || can(context, "guardians:manage")),
      },
    };
  });

export const personHistory = readProcedure
  .input(
    v.object({ id, before: v.optional(v.pipe(v.string(), v.isoTimestamp())) }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "audit:read");
    await requirePerson(context, "people", input.id);
    return historyOf(context.tx, context.tenantId, input.id, {
      limit: 50,
      before: input.before,
    });
  });

export const staff = readProcedure
  .input(staffDirectorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "staff:manage");
    const phone = /^[+0-9 ()-]{7,}$/.test(input.q)
      ? toE164(input.q, await countryOf(context))
      : null;
    const [{ rows, total }, positions] = await Promise.all([
      staffDirectory(context.tx, scopeFor(context, "people"), {
        q: input.q,
        phone,
        roles: input.role,
        sort: input.sort,
        dir: input.dir,
        page: input.page,
        pageSize: input.pageSize,
        locale: localeOf(context),
      }),
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace: "staff_position",
        today: context.today,
        includeRetired: true,
      }),
    ]);
    const manage = can(context, "staff:manage");
    const contacts = manage || can(context, "contacts:read");
    return {
      rows: rows.map((row) => ({
        id: row.id,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
        photoFileId: row.photoFileId,
        roles: row.roles,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        position: labelFrom(positions, row.positionId),
        email: contacts ? row.email : null,
        phone: contacts ? row.phone : null,
        account: manage
          ? { state: row.accountState, lastSignInAt: row.lastSignInAt }
          : null,
      })),
      total,
      page: input.page,
      pages: Math.max(1, Math.ceil(total / input.pageSize)),
      manage,
    };
  });

/** What the staff editor starts from: names, work contacts and the roles held here. */
export const staffMember = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "staff:manage");
    await requirePerson(context, "people", input.id);
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    const [roles, contacts] = await Promise.all([
      rolesAt(context.tx, scopeFor(context, "people"), input.id),
      contactsOf(context.tx, context.tenantId, input.id),
    ]);
    const staffRoles = roles.filter((role) => STAFF_ROLE_SET.has(role.role));
    const here = await schoolRoleIds(
      context.tx,
      scopeFor(context, "people"),
      input.id,
    );
    const first = staffRoles.find((role) => here.has(role.id));
    return {
      id: record.id,
      version: record.version,
      fullNameEn: record.fullNameEn,
      fullNameAr: record.fullNameAr,
      givenNameAr: record.givenNameAr,
      middleNameAr: record.middleNameAr,
      familyNameAr: record.familyNameAr,
      givenNameEn: record.givenNameEn,
      middleNameEn: record.middleNameEn,
      familyNameEn: record.familyNameEn,
      email: contacts.find((contact) => contact.kind === "email")?.value ?? "",
      phone: contacts.find((contact) => contact.kind === "phone")?.value ?? "",
      roles: staffRoles
        .filter((role) => here.has(role.id))
        .map((role) => role.role),
      groupRoles: staffRoles
        .filter((role) => !here.has(role.id))
        .map((role) => role.role),
      positionId: first?.positionId ?? "",
      titleEn: first?.titleEn ?? "",
      titleAr: first?.titleAr ?? "",
    };
  });

/**
 * A natural role brings its built-in access role, so adding one must not
 * give anyone more than the person adding it holds.
 */
async function requireRolesGrantable(
  context: UnitContext,
  userId: string,
  roles: readonly string[],
) {
  const [held, builtins] = await Promise.all([
    rolesAt(context.tx, scopeFor(context, "people"), userId),
    rolesForSchool(context.tx, scopeFor(context, "people")),
  ]);
  const current = new Set(held.map((row) => row.role));
  for (const added of roles.filter((role) => !current.has(role)))
    requireGrantable(
      context,
      builtins.find((row) => row.builtinKey === added)?.capabilities ?? [],
    );
}

export const saveStaff = writeProcedure
  .input(saveStaffSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "staff:manage");
    const tx = context.tx;
    const country = await countryOf(context);
    const phone = input.phone ? toE164(input.phone, country) : null;
    if (input.phone && !phone)
      throw new ORPCError("BAD_REQUEST", {
        message: "contact_point.phone_invalid",
      });
    let userId: string;
    if (input.id) {
      await requirePerson(context, "people", input.id);
      const before = await readPerson(tx, input.id);
      if (!before) throw new ORPCError("NOT_FOUND");
      const updated = await updatePerson(tx, {
        tenantId: context.tenantId,
        userId: input.id,
        expectedVersion: input.expectedVersion ?? 0,
        names: input.names,
        preferredGivenName: before.preferredGivenName,
        birthDate: before.birthDate,
        sexId: before.sexId,
      });
      if (!updated)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      userId = input.id;
      await audit(context, {
        action: "user.update",
        objectType: "user",
        objectId: userId,
        subjectUserId: userId,
        change: {
          table: "core.users",
          before: nameColumns({
            ar: {
              given: before.givenNameAr,
              middle: before.middleNameAr,
              family: before.familyNameAr,
            },
            en: {
              given: before.givenNameEn,
              middle: before.middleNameEn,
              family: before.familyNameEn,
            },
          }),
          after: nameColumns(input.names),
        },
      });
    } else if (input.existingUserId) {
      const existing = await readPerson(tx, input.existingUserId);
      if (!existing) throw new ORPCError("NOT_FOUND");
      userId = existing.id;
    } else {
      const created = await insertPerson(tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        names: input.names,
      });
      userId = created.id;
      await audit(context, {
        action: "user.create",
        objectType: "user",
        objectId: userId,
        subjectUserId: userId,
        change: {
          table: "core.users",
          before: null,
          after: nameColumns(input.names),
        },
      });
    }
    await replaceContact(tx, {
      tenantId: context.tenantId,
      userId,
      kind: "email",
      label: "work",
      value: input.email,
      normalized: input.email,
    });
    if (input.phone || input.id)
      await replaceContact(tx, {
        tenantId: context.tenantId,
        userId,
        kind: "phone",
        label: "mobile",
        value: input.phone,
        normalized: phone,
      });
    await requireRolesGrantable(context, userId, input.roles);
    await guardingAccess(context, () =>
      setStaffRoles(tx, scopeFor(context, "people"), userId, {
        roles: input.roles,
        positionId: input.positionId || null,
        titleEn: input.titleEn,
        titleAr: input.titleAr,
      }),
    );
    await audit(context, {
      action: "role.change",
      objectType: "user",
      objectId: userId,
      subjectUserId: userId,
      details: { roles: input.roles, positionId: input.positionId || null },
    });
    const saved = await readPerson(tx, userId);
    return { id: userId, version: saved?.version ?? 1 };
  });

/**
 * Who may change a person's sign-in: staff managers for staff, people
 * managers for everyone else, and nobody for their own account here.
 */
async function requireSignInManager(context: UnitContext, userId: string) {
  const scope = scopeFor(context, "people");
  const reached =
    (await reachesPerson(context, "people", userId)) === "record" ||
    (await reachesStudent(context, "people", userId));
  if (!reached) throw new ORPCError("NOT_FOUND");
  if (userId === context.actor.userId)
    throw new ORPCError("FORBIDDEN", { message: "account.self" });
  const roles = await rolesAt(context.tx, scope, userId);
  if (roles.some((role) => STAFF_ROLE_SET.has(role.role)))
    requireCapability(context, "staff:manage");
  else requireCapability(context, "people:manage");
}

export const saveSignIn = writeProcedure
  .input(saveSignInSchema)
  .handler(async ({ input, context }) => {
    await requireSignInManager(context, input.userId);
    const current = await signInOf(context.tx, context.tenantId, input.userId);
    refreshLoginsAfter(context);
    const secretHash = input.password
      ? await Bun.password.hash(input.password, { algorithm: "argon2id" })
      : null;
    if (!current) {
      if (!secretHash)
        throw new ORPCError("BAD_REQUEST", {
          message: "validation.new_password",
        });
      const accountId = await createPasswordAccount(context.tx, {
        tenantId: context.tenantId,
        userId: input.userId,
        loginName: input.loginName,
        secretHash,
        linkedByUserId: context.actor.userId,
      });
      await audit(context, {
        action: "account.create",
        objectType: "account",
        objectId: accountId,
        subjectUserId: input.userId,
        details: { method: "password", linkMethod: "admin" },
      });
      return { accountId };
    }
    const saved = await updatePasswordSignIn(context.tx, {
      tenantId: context.tenantId,
      userId: input.userId,
      accountId: current.accountId,
      identityId: current.identityId,
      loginName: input.loginName,
      secretHash,
      linkedByUserId: context.actor.userId,
    });
    if (!saved)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.new_password",
      });
    if (secretHash)
      await settleInvites(context.tx, {
        tenantId: context.tenantId,
        accountId: current.accountId,
      });
    if (secretHash)
      await revokeAccountSessions(
        context.tx,
        context.tenantId,
        current.accountId,
      );
    await audit(context, {
      action: secretHash ? "account.password_set" : "account.login_name_change",
      objectType: "account",
      objectId: current.accountId,
      subjectUserId: input.userId,
      details: { loginNameChanged: current.loginName !== input.loginName },
    });
    return { accountId: current.accountId };
  });

/**
 * Emails an adult a link to choose their own password, so nobody else ever
 * knows it; see `emailSignInLink`.
 */
export const sendSignInLink = writeProcedure
  .input(sendSignInLinkSchema)
  .handler(async ({ input, context }) => {
    await requireSignInManager(context, input.userId);
    const mail = context.mail;
    if (!mail) throw new ORPCError("CONFLICT", { message: "sign_in.no_email" });
    const sent = await emailSignInLink(context.tx, {
      tenantId: context.tenantId,
      userId: input.userId,
      school: context.school,
      domains: context.domains,
      loginName: input.loginName,
      linkedByUserId: context.actor.userId,
      mail,
      now: context.now,
    });
    await audit(context, {
      action: sent.created ? "account.create" : "account.invite",
      objectType: "account",
      objectId: sent.accountId,
      subjectUserId: input.userId,
      details: {
        method: "invite",
        purpose: sent.reset ? "reset" : "invite",
      },
    });
    return { sent: true, loginName: sent.loginName };
  });

type SignInSeed = Awaited<ReturnType<typeof signInSeeds>>[number];
type Refused = { studentId: string; reason: SignInRefusal };

// An account opened by a link that nobody has used yet is not turned off.
const turnedOff = (seed: SignInSeed) =>
  seed.accountState !== null &&
  seed.accountState !== "active" &&
  seed.accountState !== "invited";

/**
 * Who of the students picked gets a slip, under which sign-in name, and who
 * is left out: those who have a password already, and those nothing names.
 */
async function slipsPlan(context: UnitContext, seeds: readonly SignInSeed[]) {
  const refused: Refused[] = [];
  const nameable: { seed: SignInSeed; choices: string[] }[] = [];
  for (const seed of seeds.filter((row) => !row.loginName)) {
    // A name kept for the student by a link sent earlier stays theirs.
    const choices = seed.reservedName
      ? [seed.reservedName]
      : loginNameChoices(seed);
    if (turnedOff(seed))
      refused.push({ studentId: seed.userId, reason: "disabled" });
    else if (choices.length === 0)
      refused.push({ studentId: seed.userId, reason: "no_name" });
    else nameable.push({ seed, choices });
  }
  const fresh = nameable.filter((row) => !row.seed.reservedName);
  const taken = await takenLoginNames(context.tx, context.tenantId, {
    names: fresh.flatMap((row) => row.choices),
    numbered: fresh.flatMap((row) => row.choices.at(-1) ?? []),
  });
  const ready = nameable.flatMap(({ seed, choices }) => {
    const loginName = seed.reservedName ?? freeLoginName(choices, taken);
    if (!loginName) {
      refused.push({ studentId: seed.userId, reason: "no_name" });
      return [];
    }
    taken.add(loginName);
    return [{ seed, loginName }];
  });
  return {
    ready,
    had: seeds.filter((row) => row.loginName).map((row) => row.userId),
    refused,
  };
}

/**
 * Who of the students picked gets a badge: young children who hold none
 * that works. A working badge is kept, since a new one would stop the card
 * in the child's bag.
 */
async function badgesPlan(context: UnitContext, seeds: readonly SignInSeed[]) {
  const ids = seeds.map((row) => row.userId);
  const [young, held] = await Promise.all([
    youngStudents(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userIds: ids,
      today: context.today,
    }),
    badgesOf(context.tx, context.tenantId, ids),
  ]);
  const now = context.now.toISOString();
  const works = (seed: SignInSeed) =>
    (held.get(seed.userId)?.expiresAt ?? "") > now;
  const refusal = (seed: SignInSeed): SignInRefusal | null =>
    young.has(seed.userId)
      ? turnedOff(seed)
        ? "disabled"
        : null
      : "not_young";
  return {
    ready: seeds
      .filter((seed) => !refusal(seed) && !works(seed))
      .map((seed) => ({ seed })),
    had: seeds
      .filter((seed) => !refusal(seed) && works(seed))
      .map((seed) => seed.userId),
    refused: seeds.flatMap((seed) => {
      const reason = refusal(seed);
      return reason ? [{ studentId: seed.userId, reason }] : [];
    }),
  };
}

/**
 * Who of the students picked can have a link sent: those slips would name,
 * who have a guardian that decides for them, takes the school's notices and
 * has an email address the school may write to.
 */
async function emailPlan(context: UnitContext, seeds: readonly SignInSeed[]) {
  if (!context.mail)
    throw new ORPCError("CONFLICT", { message: "sign_in.no_email" });
  const plan = await slipsPlan(context, seeds);
  const guardians = await decidingGuardians(context.tx, {
    tenantId: context.tenantId,
    studentIds: plan.ready.map((row) => row.seed.userId),
    today: context.today,
  });
  const reached = new Map(
    (
      await reachability(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        userIds: [...new Set(guardians.map((row) => row.guardianId))],
      })
    ).map((row) => [row.userId, row]),
  );
  const ready = plan.ready.map((row) => ({
    ...row,
    recipients: guardians.flatMap((link) => {
      const guardian = reached.get(link.guardianId);
      return link.studentId === row.seed.userId && guardian?.email
        ? [
            {
              guardianId: link.guardianId,
              address: guardian.email,
              locale: guardian.locale,
            },
          ]
        : [];
    }),
  }));
  return {
    ready: ready.filter((row) => row.recipients.length > 0),
    had: plan.had,
    refused: [
      ...plan.refused,
      ...ready
        .filter((row) => row.recipients.length === 0)
        .map((row) => ({
          studentId: row.seed.userId,
          reason: "no_email" as const,
        })),
    ],
  };
}

async function pickedSeeds(context: UnitContext, studentIds: string[]) {
  requireCapability(context, "people:manage");
  const wanted = [...new Set(studentIds)];
  const seeds = await signInSeeds(
    context.tx,
    scopeFor(context, "people"),
    wanted,
  );
  if (seeds.length !== wanted.length) throw new ORPCError("NOT_FOUND");
  return seeds;
}

/**
 * What opening sign-ins for the students picked would do, before it is done:
 * who gets one, who has one already, and who cannot be given one and why.
 */
export const signInsPlan = readProcedure
  .input(createSignInsSchema)
  .handler(async ({ input, context }) => {
    const seeds = await pickedSeeds(context, input.studentIds);
    const plan =
      input.way === "badges"
        ? await badgesPlan(context, seeds)
        : input.way === "email"
          ? await emailPlan(context, seeds)
          : await slipsPlan(context, seeds);
    return {
      ready: plan.ready.map((row) => row.seed.userId),
      had: plan.had,
      refused: plan.refused,
    };
  });

/** A name and a first password for each student who has no password yet. */
async function openSlips(context: UnitContext, seeds: readonly SignInSeed[]) {
  const plan = await slipsPlan(context, seeds);
  const slips = plan.ready.map((row) => ({
    ...row,
    password: firstPassword(randomInt),
  }));
  refreshLoginsAfter(context);
  const hashes = await Promise.all(
    slips.map((row) =>
      Bun.password.hash(row.password, { algorithm: "argon2id" }),
    ),
  );
  for (const [index, { seed, loginName }] of slips.entries()) {
    const secretHash = hashes[index] ?? "";
    const accountId =
      seed.accountId ??
      (await createPasswordAccount(context.tx, {
        tenantId: context.tenantId,
        userId: seed.userId,
        loginName,
        secretHash,
        linkedByUserId: context.actor.userId,
      }));
    // A child who signs in with a badge, or whose guardians were sent a
    // link, already holds an account.
    if (seed.accountId) {
      await updatePasswordSignIn(context.tx, {
        tenantId: context.tenantId,
        userId: seed.userId,
        accountId,
        identityId: null,
        loginName,
        secretHash,
        linkedByUserId: context.actor.userId,
      });
      await settleInvites(context.tx, {
        tenantId: context.tenantId,
        accountId,
      });
    }
    await audit(context, {
      action: seed.accountId ? "account.password_set" : "account.create",
      objectType: "account",
      objectId: accountId,
      subjectUserId: seed.userId,
      details: { method: "password", linkMethod: "admin", printed: true },
    });
  }
  return {
    slips: slips.map(({ seed, loginName, password }) => ({
      studentId: seed.userId,
      loginName,
      password,
    })),
    badges: [],
    invited: [],
    had: plan.had,
    refused: plan.refused,
  };
}

/** A badge for each young student who holds none that works. */
async function openBadges(context: UnitContext, seeds: readonly SignInSeed[]) {
  const [plan, term] = await Promise.all([
    badgesPlan(context, seeds),
    badgeTerm(context),
  ]);
  const refused = [...plan.refused];
  const badges: { studentId: string; secret: string }[] = [];
  for (const { seed } of plan.ready) {
    const studentId = seed.userId;
    const { secret, secretHash } = issueBadgeSecret();
    const account = await issueBadge(context.tx, {
      tenantId: context.tenantId,
      userId: studentId,
      secretHash,
      ...term,
      linkedByUserId: context.actor.userId,
    });
    // Turned off between the plan and now.
    if (!account) {
      refused.push({ studentId, reason: "disabled" });
      continue;
    }
    await audit(context, {
      action: account.created ? "account.create" : "account.badge_issue",
      objectType: "account",
      objectId: account.accountId,
      subjectUserId: studentId,
      details: { method: "badge" },
    });
    badges.push({ studentId, secret });
  }
  return { slips: [], badges, invited: [], had: plan.had, refused };
}

/**
 * A link for each student's guardians to choose the student's password.
 * The account is opened without one and keeps its sign-in name; the secret
 * in each link is sent as it is made and only its hash is kept. A link that
 * the gateway would not take is stopped, so none is left that nobody holds:
 * this is why the email goes before the unit commits, its outcome being
 * part of what is stored, and a link whose unit failed opens nothing.
 */
async function openLinks(context: UnitContext, seeds: readonly SignInSeed[]) {
  const plan = await emailPlan(context, seeds);
  const mail = context.mail;
  if (!mail) throw new ORPCError("CONFLICT", { message: "sign_in.no_email" });
  const expiresAt = new Date(context.now.getTime() + INVITE_DAYS * 86_400_000);
  const refused = [...plan.refused];
  const invited: string[] = [];
  for (const { seed, loginName, recipients } of plan.ready) {
    const delivered = await Promise.all(
      recipients.map(async (recipient) => {
        const { secret, secretHash } = issueBadgeSecret();
        const invite = await issueInvite(context.tx, {
          tenantId: context.tenantId,
          userId: seed.userId,
          secretHash,
          expiresAt,
          sentToUserId: recipient.guardianId,
          linkedByUserId: context.actor.userId,
        });
        if (!invite) return null;
        const arabic = recipient.locale === "ar";
        const message = inviteMessage({
          locale: recipient.locale,
          school:
            (arabic ? context.school.nameAr : context.school.nameEn) ??
            context.school.nameEn ??
            "",
          student:
            (arabic ? seed.givenNameAr : seed.givenNameEn) ??
            seed.givenNameEn ??
            seed.givenNameAr ??
            loginName,
          loginName,
          link: welcomeLink(context.school, context.domains, secret),
          days: INVITE_DAYS,
        });
        const sent = await mail
          .send({ to: recipient.address, ...message })
          .then(
            () => true,
            () => false,
          );
        if (!sent)
          await voidInvite(context.tx, context.tenantId, invite.identityId);
        return { ...invite, sent };
      }),
    );
    const opened = delivered.filter((row) => row !== null);
    const [first] = opened;
    if (!first) {
      refused.push({ studentId: seed.userId, reason: "disabled" });
      continue;
    }
    await reserveLoginName(context.tx, {
      tenantId: context.tenantId,
      userId: seed.userId,
      loginName,
    });
    const reached = opened.filter((row) => row.sent).length;
    if (reached === 0)
      refused.push({ studentId: seed.userId, reason: "not_sent" });
    else invited.push(seed.userId);
    await audit(context, {
      action: opened.some((row) => row.created)
        ? "account.create"
        : "account.invite",
      objectType: "account",
      objectId: first.accountId,
      subjectUserId: seed.userId,
      details: { method: "invite", links: reached },
    });
  }
  return { slips: [], badges: [], invited, had: plan.had, refused };
}

/**
 * Opens a sign-in for each student picked who has none, in the way the
 * office chose: a name and a first password to print on a slip, or a badge
 * for a young child. Passwords and badge secrets leave the API only in this
 * response, so what is lost before it is printed is made again, never shown
 * again.
 */
export const createSignIns = writeProcedure
  .input(createSignInsSchema)
  .handler(async ({ input, context }) => {
    const seeds = await pickedSeeds(context, input.studentIds);
    if (input.way === "badges") return openBadges(context, seeds);
    return input.way === "email"
      ? openLinks(context, seeds)
      : openSlips(context, seeds);
  });

export const setSignInState = writeProcedure
  .input(accountStateSchema)
  .handler(async ({ input, context }) => {
    await requireSignInManager(context, input.userId);
    const current = await signInOf(context.tx, context.tenantId, input.userId);
    if (!current) throw new ORPCError("NOT_FOUND");
    await guardingAccess(context, () =>
      setAccountState(context.tx, {
        tenantId: context.tenantId,
        accountId: current.accountId,
        state: input.state,
        reason: input.reason,
        byUserId: context.actor.userId,
      }),
    );
    await audit(context, {
      action: input.state === "disabled" ? "account.disable" : "account.enable",
      objectType: "account",
      objectId: current.accountId,
      subjectUserId: input.userId,
    });
    return { state: input.state };
  });

/**
 * The school year a student's placement is in, held open for the change:
 * a closed year's enrolment is its record and is not rewritten.
 */
async function openYearOf(context: UnitContext, yearId: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = years.find((row) => row.id === yearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  if ((await holdYear(context.tx, context.tenantId, year.id)) === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  return { years, year };
}

/**
 * Records how a student came to a placement: as a new entrant, a transfer
 * and the like, and the school they came from, which a school that takes a
 * transfer is asked to keep with the papers that prove it.
 */
export const saveArrival = writeProcedure
  .input(saveArrivalSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const scope = scopeFor(context, "people");
    await requireStudent(context, "people", input.studentId);
    const placement = (
      await placements(context.tx, scope, input.studentId)
    ).find((row) => row.id === input.placementId);
    if (!placement) throw new ORPCError("NOT_FOUND");
    await openYearOf(context, placement.schoolYearId);
    const entryTypeId = input.entryTypeId || null;
    if (
      entryTypeId &&
      !(
        await descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "school_entry_type",
          today: context.today,
        })
      ).some((row) => row.id === entryTypeId)
    )
      throw new ORPCError("NOT_FOUND");
    await storeArrival(context.tx, {
      tenantId: context.tenantId,
      placementId: placement.id,
      entryTypeId,
      previousSchool: input.previousSchool,
    });
    await audit(context, {
      action: "placement.change",
      objectType: "user",
      objectId: input.studentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { placementId: placement.id, entryTypeId },
    });
    return { saved: true };
  });

/**
 * Records that a student has left the school. Their placement ends after
 * the last day with the reason and where they went, their classes end with
 * it, and a placement they were to take up later is dropped. The record
 * stays the school's for good; the student and their family keep reading it
 * until the role ends. A register that marks the student after the last day
 * refuses it, since it says they were still here.
 */
export const recordLeaving = writeProcedure
  .input(recordLeavingSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const scope = scopeFor(context, "people");
    await requireStudent(context, "people", input.studentId);
    const placement = (
      await placements(context.tx, scope, input.studentId)
    ).find((row) => row.from <= input.lastDay && input.lastDay < row.to);
    if (!placement)
      throw new ORPCError("BAD_REQUEST", { message: "leaving.not_enrolled" });
    const { years, year } = await openYearOf(context, placement.schoolYearId);
    const reasons = await descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "school_exit_type",
      today: context.today,
    });
    if (!reasons.some((row) => row.id === input.exitTypeId))
      throw new ORPCError("NOT_FOUND");
    const left = addDays(input.lastDay, 1);
    const marked = await lastMarkFrom(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId: input.studentId,
      from: left,
    });
    if (marked)
      throw new ORPCError("CONFLICT", {
        message: `enrollment.registers_after:${marked}`,
      });
    const ended = await endStudentEnrollmentsFrom(context.tx, scope, {
      studentId: input.studentId,
      on: left,
    });
    const dropped = await voidPlacementsFrom(context.tx, scope, {
      studentId: input.studentId,
      from: left,
    });
    await endPlacement(context.tx, {
      tenantId: context.tenantId,
      placementId: placement.id,
      on: left,
      exitTypeId: input.exitTypeId,
      destination: input.destination,
    });
    const accessUntil = leaverAccessEnd({
      years,
      year,
      left,
      access: input.access,
    });
    await endStudentRole(context.tx, scope, {
      studentId: input.studentId,
      until: accessUntil,
    });
    await audit(context, {
      action: "student.leave",
      objectType: "user",
      objectId: input.studentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: {
        lastDay: input.lastDay,
        exitTypeId: input.exitTypeId,
        accessUntil,
        ended,
        dropped,
      },
    });
    return { lastDay: input.lastDay, accessUntil };
  });

/**
 * Takes a recorded departure back, for one recorded by mistake or a student
 * who stays after all: the placement runs to the end of its year again, the
 * classes that ended with it are given back, and the student's role no
 * longer ends. A placement dropped for a later year is not made again.
 */
export const cancelLeaving = writeProcedure
  .input(cancelLeavingSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const scope = scopeFor(context, "people");
    await requireStudent(context, "people", input.studentId);
    const [latest] = await placements(context.tx, scope, input.studentId);
    if (!latest?.exitTypeId)
      throw new ORPCError("BAD_REQUEST", { message: "leaving.none" });
    const { year } = await openYearOf(context, latest.schoolYearId);
    await reopenPlacement(context.tx, {
      tenantId: context.tenantId,
      placementId: latest.id,
      endsBefore: year.endsBefore,
    });
    const restored = await reopenStudentEnrollments(context.tx, scope, {
      studentId: input.studentId,
      yearId: year.id,
      endedOn: latest.to,
      endsBefore: year.endsBefore,
    });
    await ensureStudentRole(context.tx, scope, input.studentId, latest.from);
    await audit(context, {
      action: "student.return",
      objectType: "user",
      objectId: input.studentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { placementId: latest.id, restored },
    });
    return { restored: restored.length };
  });

/** Children who share a parent with this student. */
export const siblings = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, "people", input.id);
    return siblingsOf(context.tx, scopeFor(context, "people"), input.id);
  });

/**
 * A guardian's or other adult's phone, email and home address. Staff keep
 * theirs through the staff editor, which needs the staff capability.
 */
export const saveContacts = writeProcedure
  .input(saveContactsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    const scope = scopeFor(context, "people");
    await requirePerson(context, "people", input.userId);
    const roles = await rolesAt(context.tx, scope, input.userId);
    if (
      roles.some((role) => role.role === "student") ||
      (roles.some((role) => STAFF_ROLE_SET.has(role.role)) &&
        !can(context, "staff:manage"))
    )
      throw new ORPCError("FORBIDDEN");
    const phone = input.phone
      ? toE164(input.phone, await countryOf(context))
      : null;
    if (input.phone && !phone)
      throw new ORPCError("BAD_REQUEST", {
        message: "contact_point.phone_invalid",
      });
    // One save of a person's contacts at a time, each against what it read.
    await context.tx.execute(sql`
      select 1 from core.users
      where tenant_id = ${context.tenantId}::uuid and id = ${input.userId}::uuid
      for update`);
    const before = await contactsOf(context.tx, context.tenantId, input.userId);
    const held = shownContacts(before);
    if (
      held.phone !== input.expected.phone ||
      held.email !== input.expected.email ||
      held.address !== input.expected.address
    )
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    // The sheet shows a person's first phone and email, so a save replaces
    // those rows under whatever label they were recorded with.
    const labelOf = (kind: "phone" | "email", fallback: ContactLabel) => {
      const label = before.find((row) => row.kind === kind)?.label;
      return CONTACT_LABELS.find((known) => known === label) ?? fallback;
    };
    await replaceContact(context.tx, {
      tenantId: context.tenantId,
      userId: input.userId,
      kind: "phone",
      label: labelOf("phone", "mobile"),
      value: input.phone,
      normalized: phone,
    });
    await replaceContact(context.tx, {
      tenantId: context.tenantId,
      userId: input.userId,
      kind: "email",
      label: labelOf("email", "personal"),
      value: input.email,
      normalized: input.email || null,
    });
    const { address } = input;
    const line = addressLine(address);
    await replaceAddress(context.tx, {
      tenantId: context.tenantId,
      userId: input.userId,
      value: line,
      postal: line
        ? {
            lines: address.lines.filter((part) => part !== ""),
            ...(address.city ? { city: address.city } : {}),
            ...(address.region ? { region: address.region } : {}),
            ...(address.postalCode ? { postal_code: address.postalCode } : {}),
            ...(address.country ? { country: address.country } : {}),
          }
        : null,
    });
    await audit(context, {
      action: "contacts.update",
      objectType: "user",
      objectId: input.userId,
      subjectUserId: input.userId,
      change: {
        table: "core.contact_points",
        before: {
          phone: before.find((row) => row.kind === "phone")?.value ?? null,
          email: before.find((row) => row.kind === "email")?.value ?? null,
          address: before.find((row) => row.kind === "postal")?.value ?? null,
        },
        after: {
          phone: input.phone || null,
          email: input.email || null,
          address: line || null,
        },
      },
    });
    return { saved: true };
  });

export const searchPeople = readProcedure
  .input(personSearchSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    return searchReached(context.tx, scopeFor(context, "people"), input.q);
  });
