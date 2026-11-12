import type { Descriptor } from "@faridalms/database/stores/descriptors";

import { withPurpose } from "@faridalms/database/context";
import {
  courtOrderLink,
  restrictionsOf,
  saveRestriction,
  setCourtOrder,
  updateCustodyFlags,
} from "@faridalms/database/stores/custody";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  childrenOf,
  endRelationship,
  guardiansOf,
  relationshipOf,
  siblingsOf,
  studentsWithGuardians,
  syncFamilyRoles,
  updateRelationship,
} from "@faridalms/database/stores/families";
import {
  filesByIds,
  linkFiles,
  retireFile,
} from "@faridalms/database/stores/files";
import { noticesAbout } from "@faridalms/database/stores/notifications";
import { studentRoleHolders } from "@faridalms/database/stores/students";
import {
  attachCourtOrderSchema,
  childrenOfSchema,
  endRelationshipSchema,
  removeCourtOrderSchema,
  saveCustodySchema,
  saveRelationshipSchema,
} from "@faridalms/domain/families";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { modulesOf } from "../core/modules";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { withPurposeFor } from "../core/purpose";
import {
  reachesStudent,
  requirePerson,
  requireStudent,
  scopeFor,
} from "../core/reach";
import { linkGuardian, relationMeaning } from "../families/links";
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

function labelFrom(list: Descriptor[], value: string | null) {
  const found = list.find((row) => row.id === value);
  return found ? { labelEn: found.labelEn, labelAr: found.labelAr } : null;
}

const relationsOf = (context: UnitContext, includeRetired: boolean) =>
  descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "relation",
    today: context.today,
    includeRetired,
  });

/** The relations a guardian's link may name, labelled as this school labels them. */
export const relations = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "people:read", "people:manage");
  return relationsOf(context, false);
});

/** A student's guardians as the office keeps them, for staff who read contacts. */
export const ofStudent = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    if (!can(context, "contacts:read") && !can(context, "people:manage"))
      throw new ORPCError("FORBIDDEN");
    await requireStudent(context, "people", input.studentId);
    return {
      guardians: await guardiansOf(
        context.tx,
        scopeFor(context, "people"),
        input.studentId,
      ),
      access: {
        manage:
          can(context, "people:manage") || can(context, "guardians:manage"),
        custody: can(context, "custody:read"),
      },
    };
  });

/** Links a guardian to a student, or changes a link the office keeps. */
export const saveLink = writeProcedure
  .input(saveRelationshipSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "guardians:manage");
    await requireStudent(context, "people", input.studentId);
    if (!input.relationshipId)
      return { id: await linkGuardian(context, input.studentId, input) };
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
    await audit(context, {
      action: "relationship.update",
      objectType: "user_relationship",
      objectId: input.relationshipId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      change: {
        table: "core.user_relationships",
        before: {
          relationMeaning: existing.relationMeaning,
          legalGuardian: existing.legalGuardian,
          portalAccess: existing.portalAccess,
          receivesNotifications: existing.receivesNotifications,
          primaryContact: existing.primaryContact,
          emergencyContact: existing.emergencyContact,
          residence: existing.residence,
          pickup: existing.pickup,
        },
        after: { relationMeaning: meaning, ...flags },
      },
    });
    return { id: input.relationshipId };
  });

/** Ends a guardian's link today. */
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
    await audit(context, {
      action: "relationship.end",
      objectType: "user_relationship",
      objectId: input.relationshipId,
      subjectUserId: existing.studentUserId,
      studentUserId: existing.studentUserId,
    });
    return { ended: true };
  });

/** Children who share a parent with this student and whom the viewer reaches. */
export const siblings = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, "people", input.id);
    return siblingsOf(context.tx, scopeFor(context, "people"), input.id);
  });

/** What the school recently told the student's guardians about them, for the office. */
export const notices = readProcedure
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

/** The students a person is linked to, on their record, where the viewer reaches each. */
export const children = readProcedure
  .input(childrenOfSchema)
  .handler(async ({ input, context }) => {
    if (input.userId !== context.actor.userId)
      await requirePerson(context, "people", input.userId);
    const [links, named] = await Promise.all([
      childrenOf(context.tx, scopeFor(context, "people"), input.userId),
      relationsOf(context, true),
    ]);
    return links.map((link) => ({
      ...link,
      relation: labelFrom(named, link.relationId),
    }));
  });

/** How many of the school's students today have no guardian linked, for the office. */
export const withoutGuardian = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "people:read");
  const students = await studentRoleHolders(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: context.today,
  });
  const linked = await studentsWithGuardians(context.tx, {
    tenantId: context.tenantId,
    studentIds: students,
    on: context.today,
  });
  return {
    count: students.filter((studentId) => !linked.has(studentId)).length,
  };
});

function courtOrderOf(
  files: readonly {
    id: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
  }[],
  fileId: string | null,
) {
  const file = fileId ? files.find((row) => row.id === fileId) : undefined;
  return file
    ? {
        fileId: file.id,
        name: file.name,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
      }
    : null;
}

/** Each guardian link's restrictions, for staff who hold custody records. */
export const custody = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
    const links = await guardiansOf(
      context.tx,
      scopeFor(context, "people"),
      input.studentId,
    );
    const { restrictions, orders } = await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Opened the student's custody records",
        write: false,
      },
      async (tx) => {
        const found = await restrictionsOf(
          tx,
          context.tenantId,
          links.map((link) => link.relationshipId),
        );
        return {
          restrictions: found,
          orders: await filesByIds(
            tx,
            context.tenantId,
            found.flatMap((row) =>
              row.courtOrderFileId ? [row.courtOrderFileId] : [],
            ),
          ),
        };
      },
    );
    return {
      links: links.map((link) => {
        const restriction = restrictions.find(
          (row) => row.relationshipId === link.relationshipId,
        );
        return {
          relationshipId: link.relationshipId,
          version: link.version,
          fullNameEn: link.fullNameEn,
          fullNameAr: link.fullNameAr,
          pickup: link.pickup,
          educationalRights: link.educationalRights,
          communicationIsolated: link.communicationIsolated,
          portalAccess: link.portalAccess,
          relationMeaning: link.relationMeaning,
          accessBasis: link.accessBasis,
          contactRestrictions: restriction?.contactRestrictions ?? null,
          courtOrder: courtOrderOf(
            orders,
            restriction?.courtOrderFileId ?? null,
          ),
        };
      }),
      canWrite: can(context, "custody:write"),
    };
  });

/** The link a custody paper is for, one of the student's guardians. */
async function custodyLink(
  context: UnitContext,
  tx: UnitContext["tx"],
  input: { studentId: string; relationshipId: string },
) {
  const link = await courtOrderLink(tx, context.tenantId, input.relationshipId);
  if (!link || link.studentId !== input.studentId)
    throw new ORPCError("NOT_FOUND");
  return link;
}

function dropBytes(context: UnitContext, key: string | null) {
  if (key) context.afterCommit(() => context.files.remove(key));
}

/** Keeps a court order or other custody paper on a guardian's link, replacing any it held. */
export const attachCourtOrder = writeProcedure
  .input(attachCourtOrderSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "custody:write");
    await requireStudent(context, "people", input.studentId);
    const gone = await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Kept a custody paper on a guardian's link",
        write: true,
      },
      async (tx) => {
        await custodyLink(context, tx, input);
        const placed = await linkFiles(tx, {
          tenantId: context.tenantId,
          userId: context.actor.userId,
          ids: [input.order.fileId],
          purpose: "legal_document",
          host: { type: "relationship_restriction", id: input.relationshipId },
        });
        if (placed.length !== 1)
          throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
        const before = await setCourtOrder(tx, {
          tenantId: context.tenantId,
          relationshipId: input.relationshipId,
          fileId: input.order.fileId,
        });
        return before && before !== input.order.fileId
          ? retireFile(tx, {
              tenantId: context.tenantId,
              id: before,
              host: {
                type: "relationship_restriction",
                id: input.relationshipId,
              },
            })
          : null;
      },
    );
    dropBytes(context, gone);
    return { saved: true };
  });

/** Takes a guardian link's custody paper away. */
export const removeCourtOrder = writeProcedure
  .input(removeCourtOrderSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "custody:write");
    await requireStudent(context, "people", input.studentId);
    const gone = await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Removed a custody paper from a guardian's link",
        write: true,
      },
      async (tx) => {
        await custodyLink(context, tx, input);
        const before = await setCourtOrder(tx, {
          tenantId: context.tenantId,
          relationshipId: input.relationshipId,
          fileId: null,
        });
        return before
          ? retireFile(tx, {
              tenantId: context.tenantId,
              id: before,
              host: {
                type: "relationship_restriction",
                id: input.relationshipId,
              },
            })
          : null;
      },
    );
    dropBytes(context, gone);
    return { removed: true };
  });

/** Changes what a guardian's link allows, and the restriction kept on it. */
export const saveCustody = writeProcedure
  .input(saveCustodySchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
    await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Changed a guardian's custody record",
        write: true,
      },
      async (tx) => {
        const saved = await updateCustodyFlags(tx, {
          tenantId: context.tenantId,
          studentId: input.studentId,
          relationshipId: input.relationshipId,
          expectedVersion: input.expectedVersion,
          educationalRights: input.educationalRights,
          communicationIsolated: input.communicationIsolated,
          pickup: input.pickup,
        });
        if (!saved)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        await saveRestriction(tx, {
          tenantId: context.tenantId,
          relationshipId: input.relationshipId,
          contactRestrictions: input.contactRestrictions,
        });
      },
    );
    return { saved: true };
  });

// A custody paper opens for the staff who read custody records of a
// student they reach, and for nobody else; host readers answer whatever
// the school has on, so a school without families opens none.
registerHostReader(
  "relationship_restriction",
  async (context, relationshipId, file) => {
    if (!file || !can(context, "custody:read")) return false;
    if (!(await modulesOf(context)).families) return false;
    const link = await withPurpose(context.tx, "custody", (tx) =>
      courtOrderLink(tx, context.tenantId, relationshipId),
    );
    if (!link || link.fileId !== file.id) return false;
    return reachesStudent(context, "people", link.studentId);
  },
);
