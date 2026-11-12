import type { saveRelationshipSchema } from "@faridalms/domain/families";
import type * as v from "valibot";

import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  insertRelationship,
  syncFamilyRoles,
} from "@faridalms/database/stores/families";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  addContact,
  insertPerson,
  nameColumns,
} from "@faridalms/database/stores/students";
import { toE164 } from "@faridalms/domain/phone";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { audit } from "../core/procedure";

type LinkInput = v.InferOutput<typeof saveRelationshipSchema>;

export async function countryOf(context: UnitContext) {
  return (
    (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG"
  );
}

/** The relation's fixed meaning, or refused when the school offers no such relation. */
export async function relationMeaning(
  context: UnitContext,
  relationId: string,
) {
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
  person: LinkInput["person"],
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

/** Links a guardian, existing or new, to a student from today, as the office confirms it. */
export async function linkGuardian(
  context: UnitContext,
  studentId: string,
  link: {
    existingUserId?: string;
    person?: LinkInput["person"];
    flags: LinkInput["flags"];
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
