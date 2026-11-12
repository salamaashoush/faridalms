import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { guardiansOf } from "@faridalms/database/stores/families";
import {
  contactChangesOf,
  guardianSummary,
  keepContactChange,
} from "@faridalms/database/stores/guardian-health";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { scopeFor } from "../core/reach";
import { learnersActedFor } from "../people/acting";
import { emergencyContacts, summaryReaders } from "./points";

/** The learner's guardians the office calls, in the order it calls them. */
async function guardianContacts(context: UnitContext, studentId: string) {
  const [links, relations] = await Promise.all([
    guardiansOf(context.tx, scopeFor(context, "people"), studentId),
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "relation",
      today: context.today,
      includeRetired: true,
    }),
  ]);
  return links
    .filter((link) => link.emergencyContact)
    .toSorted((a, b) => (a.contactPriority ?? 99) - (b.contactPriority ?? 99))
    .map((link) => {
      const relation = relations.find((row) => row.id === link.relationId);
      const phone = link.contacts.find((contact) => contact.kind === "phone");
      return {
        id: link.relationshipId,
        userId: link.userId,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
        relation: relation
          ? { labelEn: relation.labelEn, labelAr: relation.labelAr }
          : null,
        phone: phone?.value ?? null,
        phoneLabel: phone?.label ?? null,
      };
    });
}

/**
 * The medical summary as guardians read it: a guardian whose link permits
 * it reads the summary of a learner they follow and may ask for changes,
 * and the learner's emergency contacts are their guardians.
 */
export const STUDENT_RECORDS_WITH_FAMILIES: ModuleContributions = {
  module: "student_records",
  needs: ["families"],
  contributions: [
    contribute(summaryReaders, {
      readerOf: async (context, studentId) => {
        const follows = await learnersActedFor(context, {
          userId: context.actor.userId,
          on: context.today,
          purpose: "health",
        });
        return follows.some((link) => link.studentId === studentId)
          ? guardianSummary({
              tenantId: context.tenantId,
              viewerId: context.actor.userId,
              today: context.today,
            })
          : null;
      },
    }),
    contribute(emergencyContacts, {
      contactsOf: guardianContacts,
      keepChange: (context, tx, input) =>
        keepContactChange(tx, {
          tenantId: context.tenantId,
          changeId: input.changeId,
          relationshipId: input.contactId,
        }),
      changesOf: (context, tx, changeIds) =>
        contactChangesOf(tx, { tenantId: context.tenantId, changeIds }),
    }),
  ],
};
