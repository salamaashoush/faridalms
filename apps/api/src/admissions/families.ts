import type { ApplicationForm } from "@faridalms/domain/admissions";

import { applicationById } from "@faridalms/database/stores/admissions";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  currentChildrenOf,
  guardiansOf,
  insertRelationship,
  relinkConsents,
  syncFamilyRoles,
  updateRelationship,
} from "@faridalms/database/stores/families";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  addContact,
  insertPerson,
  nameColumns,
} from "@faridalms/database/stores/students";
import { toE164 } from "@faridalms/domain/phone";
import { APPLICANT_ROLE } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import { contextOpeners } from "../people/access";
import { enrolmentParts, filingForOthers } from "./points";

const LINK_FLAGS = {
  legalGuardian: null,
  portalAccess: false,
  receivesNotifications: false,
  primaryContact: false,
  emergencyContact: false,
  residence: null,
  pickup: null,
} as const;

async function relationsOf(context: UnitContext) {
  return descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "relation",
    today: context.today,
  });
}

/**
 * The filer's link to the applicant, as legal guardian and first contact,
 * and the other adult the form names, as a person of the school linked to
 * the applicant, both still to be confirmed by the office.
 */
async function linkFiled(
  context: UnitContext,
  input: { applicantId: string; form: ApplicationForm },
) {
  const { form } = input;
  const relations = await relationsOf(context);
  const relation = relations.find((each) => each.id === form.relationId);
  if (!relation?.meaning)
    throw new ORPCError("BAD_REQUEST", { message: "application.relation" });
  if (!form.responsible)
    throw new ORPCError("BAD_REQUEST", {
      message: "application.responsible",
    });
  const other = form.other;
  const otherRelation = other
    ? relations.find((each) => each.id === other.relationId)
    : null;
  if (other && !otherRelation?.meaning)
    throw new ORPCError("BAD_REQUEST", { message: "application.relation" });
  const linkId = await insertRelationship(context.tx, {
    tenantId: context.tenantId,
    studentId: input.applicantId,
    relatedUserId: context.actor.userId,
    relationId: relation.id,
    relationMeaning: relation.meaning,
    flags: { ...LINK_FLAGS, legalGuardian: true, primaryContact: true },
    from: context.today,
    verifiedByUserId: null,
  });
  if (!other || !otherRelation?.meaning) return { linkId, otherId: null };
  const country =
    (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG";
  const created = await insertPerson(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    names: other.names,
  });
  const phone = other.phone ? toE164(other.phone, country) : null;
  if (other.phone && phone)
    await addContact(context.tx, {
      tenantId: context.tenantId,
      userId: created.id,
      kind: "phone",
      value: other.phone,
      normalized: phone,
      label: "mobile",
      source: "self_service",
    });
  if (other.email)
    await addContact(context.tx, {
      tenantId: context.tenantId,
      userId: created.id,
      kind: "email",
      value: other.email,
      normalized: other.email,
      label: "personal",
      source: "self_service",
    });
  await insertRelationship(context.tx, {
    tenantId: context.tenantId,
    studentId: input.applicantId,
    relatedUserId: created.id,
    relationId: otherRelation.id,
    relationMeaning: otherRelation.meaning,
    flags: {
      ...LINK_FLAGS,
      residence: other.livesWithChild ? "primary" : null,
    },
    from: context.today,
    verifiedByUserId: null,
  });
  await audit(context, {
    action: "user.create",
    objectType: "user",
    objectId: created.id,
    subjectUserId: created.id,
    change: {
      table: "core.users",
      before: null,
      after: nameColumns(other.names),
    },
  });
  return { linkId, otherId: created.id };
}

/** The applicant's links that the student they are lacks, each linked to the student too. */
async function joinLinks(
  context: UnitContext,
  input: { fromId: string; toId: string; consentIds: readonly string[] },
) {
  const scope = { tenantId: context.tenantId, today: context.today };
  const [theirs, held] = await Promise.all([
    guardiansOf(context.tx, scope, input.fromId),
    guardiansOf(context.tx, scope, input.toId),
  ]);
  for (const link of theirs) {
    if (held.some((each) => each.userId === link.userId)) continue;
    await insertRelationship(context.tx, {
      tenantId: context.tenantId,
      studentId: input.toId,
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
  await relinkConsents(context.tx, {
    tenantId: context.tenantId,
    studentId: input.toId,
    consentIds: input.consentIds,
  });
}

/**
 * Once the applicant is the school's student, the filer follows them in the
 * portal and takes the school's notices, and the family role each link
 * gives replaces the applying role.
 */
async function openToFiler(
  context: UnitContext,
  input: { studentId: string; applicationId: string },
) {
  const row = await applicationById(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id: input.applicationId,
  });
  if (!row || row.filedByUserId === row.applicantUserId) return;
  const links = await guardiansOf(
    context.tx,
    { tenantId: context.tenantId, today: context.today },
    input.studentId,
  );
  for (const link of links) {
    const filer = link.userId === row.filedByUserId;
    const updated = await updateRelationship(context.tx, {
      tenantId: context.tenantId,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      relationId: link.relationId,
      relationMeaning: link.relationMeaning,
      flags: {
        legalGuardian: link.legalGuardian,
        portalAccess: link.portalAccess || filer,
        receivesNotifications: link.receivesNotifications || filer,
        primaryContact: link.primaryContact,
        emergencyContact: link.emergencyContact,
        residence: link.residence,
        pickup: link.pickup,
      },
      editorId: context.actor.userId,
    });
    if (!updated)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await syncFamilyRoles(
      context.tx,
      context.tenantId,
      link.userId,
      context.today,
    );
    await audit(context, {
      action: "relationship.update",
      objectType: "user_relationship",
      objectId: link.relationshipId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { relatedUserId: link.userId, applicationId: row.id },
      change: {
        table: "core.user_relationships",
        before: {
          portalAccess: link.portalAccess,
          receivesNotifications: link.receivesNotifications,
        },
        after: {
          portalAccess: link.portalAccess || filer,
          receivesNotifications: link.receivesNotifications || filer,
        },
      },
    });
  }
}

/** Applying for another person, which only families make possible. */
export const ADMISSIONS_WITH_FAMILIES: ModuleContributions = {
  module: "admissions",
  needs: ["families"],
  contributions: [
    contribute(filingForOthers, {
      sent: linkFiled,
      relatives: (context, parentIds) =>
        currentChildrenOf(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          parentIds,
          today: context.today,
        }),
      joined: joinLinks,
    }),
    contribute(enrolmentParts, {
      enrolled: (context, input) => openToFiler(context, input),
    }),
    // Someone applying for another person works in the family workspace
    // until the person they applied for is enrolled.
    contribute(contextOpeners, {
      context: "family",
      opens: async (_scope, input) => input.roles.includes(APPLICANT_ROLE),
    }),
  ],
};
