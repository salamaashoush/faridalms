import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { guardiansOf } from "@faridalms/database/stores/families";

import type { UnitContext } from "../core/context";
import type { MarkedEmergencyContact } from "../people/emergency-contacts";

import { scopeFor } from "../core/reach";

/** The learner's guardians the office calls, each at their place in the order. */
export async function guardianEmergencyContacts(
  context: UnitContext,
  studentId: string,
): Promise<MarkedEmergencyContact[]> {
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
        order: link.contactPriority,
      };
    });
}
