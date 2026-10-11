import type { Descriptor } from "@faridalms/database/stores/descriptors";
import type { Scope } from "@faridalms/database/stores/students";
import type { StudentStatus } from "@faridalms/domain/people";

import { lookupHmac } from "@faridalms/database/crypto";
import { rolesForSchool } from "@faridalms/database/stores/access";
import {
  createPasswordAccount,
  revokeAccountSessions,
  setAccountState,
  signInOf,
  updatePasswordSignIn,
} from "@faridalms/database/stores/accounts";
import { homeroomsOn } from "@faridalms/database/stores/classes";
import { photoRefusals } from "@faridalms/database/stores/consents";
import {
  descriptorId,
  descriptorsFor,
} from "@faridalms/database/stores/descriptors";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import { historyOf } from "@faridalms/database/stores/history";
import { studentsByIdentifier } from "@faridalms/database/stores/identifiers";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { noticesAbout } from "@faridalms/database/stores/notifications";
import {
  childrenOf,
  contactsOf,
  isVisiblePerson,
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
  STAFF_ROLES,
  staffDirectory,
} from "@faridalms/database/stores/staff";
import {
  accountOf,
  addContact,
  calendarFor,
  endRelationship,
  ensureStudentRole,
  guardiansOf,
  insertPerson,
  insertRelationship,
  isVisibleStudent,
  nameColumns,
  peopleByContact,
  person as readPerson,
  place,
  placements,
  referenceOf,
  refreshCustodyAlert,
  relationshipOf,
  setReference,
  studentDirectory,
  studentMatches,
  syncFamilyRoles,
  updatePerson,
  updateRelationship,
} from "@faridalms/database/stores/students";
import {
  dayIn,
  holdYear,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import { normaliseIdentifier } from "@faridalms/domain/identifiers";
import {
  addressLine,
  endRelationshipSchema,
  guardianLookupSchema,
  accountStateSchema,
  personSearchSchema,
  saveContactsSchema,
  saveRelationshipSchema,
  saveSignInSchema,
  saveStaffSchema,
  saveStudentSchema,
  setPhotoSchema,
  staffDirectorySchema,
  studentDirectorySchema,
  studentMatchesSchema,
  studentStatus,
} from "@faridalms/domain/people";
import { toE164 } from "@faridalms/domain/phone";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { guardingAccess, requireGrantable } from "../core/access";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());
const STAFF_ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES);

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "people:manage"),
  };
}

// A person's photo is seen by whoever may see the person.
registerHostReader(
  "person",
  async (context, personId) =>
    personId === context.actor.userId ||
    isVisiblePerson(context.tx, scopeOf(context), personId),
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
      if (
        !(await isVisiblePerson(context.tx, scopeOf(context), input.personId))
      )
        throw new ORPCError("NOT_FOUND");
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

async function requireStudent(context: UnitContext, studentId: string) {
  if (!(await isVisibleStudent(context.tx, scopeOf(context), studentId)))
    throw new ORPCError("NOT_FOUND");
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
  const [grades, relations, sexes, positions, religions, years] =
    await Promise.all([
      load("grade_level"),
      load("relation"),
      load("sex"),
      load("staff_position"),
      load("religion"),
      schoolYears(context.tx, context.tenantId, context.schoolId),
    ]);
  return {
    grades,
    relations,
    sexes,
    positions,
    religions,
    years,
    workingYearId: workingYear(years, context.today)?.id ?? null,
  };
});

export const students = readProcedure
  .input(studentDirectorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const working = workingYear(years, context.today);
    const year = years.find((row) => row.id === input.year) ?? working;
    if (!year) return { year: null, rows: [], total: 0, page: 1, pages: 1 };
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
      scopeOf(context),
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

/** A student's record at this school, with what the viewer may open in it. */
export const student = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, input.id);
    const scope = scopeOf(context);
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
    const [account, refusals] = await Promise.all([
      accountOf(context.tx, context.tenantId, input.id),
      photoRefusals(context.tx, {
        tenantId: context.tenantId,
        studentIds: [input.id],
      }),
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
        demographics: can(context, "demographics:read"),
        custody: can(context, "custody:read"),
        history: can(context, "people:manage") || can(context, "audit:read"),
        attendance: can(context, "attendance:read"),
        timetable: can(context, "timetable:read"),
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
    await requireStudent(context, input.id);
    const guardians = await guardiansOf(context.tx, scopeOf(context), input.id);
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
    await requireStudent(context, input.id);
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
    return studentMatches(context.tx, scopeOf(context), {
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
    const scope = scopeOf(context);
    const tx = context.tx;
    const referenceSystem = await descriptorId(
      tx,
      context.tenantId,
      "external_id_system",
      "school_reference",
    );
    let studentId: string;
    if (input.id) {
      await requireStudent(context, input.id);
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
    await requireStudent(context, input.studentId);
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
    await requireStudent(context, existing.studentUserId);
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
 * A person's record at this school: a guardian, a member of staff, or the
 * viewer themselves. Contact details show to staff who read contacts and to
 * the person; linked students only where the viewer reaches them.
 */
export const person = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const scope = scopeOf(context);
    const self = input.id === context.actor.userId;
    if (!self && !(await isVisiblePerson(context.tx, scope, input.id)))
      throw new ORPCError("NOT_FOUND");
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    const manage = can(context, "people:manage");
    const seesContacts = self || manage || can(context, "contacts:read");
    const labels = (namespace: string) =>
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace,
        today: context.today,
        includeRetired: true,
      });
    const [roles, contacts, children, account, relations, positions] =
      await Promise.all([
        rolesAt(context.tx, scope, input.id),
        seesContacts
          ? contactsOf(context.tx, context.tenantId, input.id)
          : Promise.resolve(null),
        childrenOf(context.tx, scope, input.id),
        accountOf(context.tx, context.tenantId, input.id),
        labels("relation"),
        labels("staff_position"),
      ]);
    const personal = manage || self;
    const staffMember = roles.some((role) => STAFF_ROLE_SET.has(role.role));
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
    if (!(await isVisiblePerson(context.tx, scopeOf(context), input.id)))
      throw new ORPCError("NOT_FOUND");
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
      staffDirectory(context.tx, scopeOf(context), {
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
    if (!(await isVisiblePerson(context.tx, scopeOf(context), input.id)))
      throw new ORPCError("NOT_FOUND");
    const record = await readPerson(context.tx, input.id);
    if (!record) throw new ORPCError("NOT_FOUND");
    const [roles, contacts] = await Promise.all([
      rolesAt(context.tx, scopeOf(context), input.id),
      contactsOf(context.tx, context.tenantId, input.id),
    ]);
    const staffRoles = roles.filter((role) => STAFF_ROLE_SET.has(role.role));
    const here = await schoolRoleIds(context.tx, scopeOf(context), input.id);
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
    rolesAt(context.tx, scopeOf(context), userId),
    rolesForSchool(context.tx, scopeOf(context)),
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
      if (!(await isVisiblePerson(tx, scopeOf(context), input.id)))
        throw new ORPCError("NOT_FOUND");
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
      setStaffRoles(tx, scopeOf(context), userId, {
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
  const scope = scopeOf(context);
  const reached =
    (await isVisiblePerson(context.tx, scope, userId)) ||
    (await isVisibleStudent(context.tx, scope, userId));
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

const CONTACT_LABELS = [
  "mobile",
  "home",
  "work",
  "personal",
  "emergency",
  "other",
] as const;
type ContactLabel = (typeof CONTACT_LABELS)[number];

/** Children who share a parent with this student. */
export const siblings = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, input.id);
    return siblingsOf(context.tx, scopeOf(context), input.id);
  });

/**
 * A guardian's or other adult's phone, email and home address. Staff keep
 * theirs through the staff editor, which needs the staff capability.
 */
export const saveContacts = writeProcedure
  .input(saveContactsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    const scope = scopeOf(context);
    if (!(await isVisiblePerson(context.tx, scope, input.userId)))
      throw new ORPCError("NOT_FOUND");
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
    const before = await contactsOf(context.tx, context.tenantId, input.userId);
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
    return searchReached(context.tx, scopeOf(context), input.q);
  });
