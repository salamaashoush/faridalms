import type { Descriptor } from "@faridalms/database/stores/descriptors";
import type { Scope } from "@faridalms/database/stores/students";
import type { StudentStatus } from "@faridalms/domain/people";

import {
  descriptorId,
  descriptorsFor,
} from "@faridalms/database/stores/descriptors";
import { historyOf } from "@faridalms/database/stores/history";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  childrenOf,
  contactsOf,
  isVisiblePerson,
  rolesAt,
} from "@faridalms/database/stores/persons";
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
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import {
  endRelationshipSchema,
  guardianLookupSchema,
  saveRelationshipSchema,
  saveStudentSchema,
  studentDirectorySchema,
  studentMatchesSchema,
  studentStatus,
} from "@faridalms/domain/people";
import { toE164 } from "@faridalms/domain/phone";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const id = v.pipe(v.string(), v.uuid());

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "people:manage"),
  };
}

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
  const [grades, relations, sexes, positions, years] = await Promise.all([
    load("grade_level"),
    load("relation"),
    load("sex"),
    load("staff_position"),
    schoolYears(context.tx, context.tenantId, context.schoolId),
  ]);
  return {
    grades,
    relations,
    sexes,
    positions,
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
    const { rows, total } = await studentDirectory(
      context.tx,
      scopeOf(context),
      {
        yearId: year.id,
        working: year.id === working?.id,
        q: input.q,
        phone,
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
    const account = await accountOf(context.tx, context.tenantId, input.id);
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
      access: {
        manage: can(context, "people:manage"),
        contacts: guardians !== null,
        health: can(context, "health:read"),
        demographics: can(context, "demographics:read"),
        custody: can(context, "custody:read"),
        history: can(context, "people:manage") || can(context, "audit:read"),
      },
    };
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
    requireCapability(context, "people:manage", "guardians:manage");
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

export const school = readProcedure.handler(async ({ context }) => {
  const profile = await schoolProfile(context.tx, context.schoolId);
  if (!profile) throw new ORPCError("NOT_FOUND");
  return profile;
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
        manage || self
          ? accountOf(context.tx, context.tenantId, input.id)
          : Promise.resolve(null),
        labels("relation"),
        labels("staff_position"),
      ]);
    const personal = manage || self;
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
      account,
      today: context.today,
      access: {
        self,
        manage,
        history: manage || can(context, "audit:read"),
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
