import { enrolledStudents } from "@faridalms/database/stores/consents";
import {
  actorsOf,
  custodyAlerts,
  followsAtSchool,
  guardianColumn,
  guardianColumnOrder,
  guardianRecipients,
  guardiansAmong,
  guardiansLinked,
  guardiansOpenedTo,
  guardiansReachable,
  guardiansToCall,
  keepConsentLink,
  learnersOf,
  ownersToFamilies,
  restrictedLinks,
  setToFamilies,
  studentsByGuardianPhone,
  studentsWithGuardians,
  toFamilies,
} from "@faridalms/database/stores/families";
import { orgPath } from "@faridalms/database/stores/identity";
import { signedInAs } from "@faridalms/database/stores/onboarding";
import { familyPartSchema } from "@faridalms/domain/families";
import { FAMILY_ROLES } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { audienceKinds } from "../core/audiences";
import { contribute } from "../core/extension";
import { portalAudiences } from "../core/portal-face";
import { can } from "../core/procedure";
import { peopleOpened } from "../core/reach";
import { setupMeasures } from "../core/setup";
import { usageFacts } from "../core/usage";
import { fileHosts } from "../files/authorize";
import { recipientSources } from "../messages/reach";
import { contextOpeners } from "../people/access";
import {
  actingFor,
  actorsFor,
  consentLinks,
  learnersActedFor,
} from "../people/acting";
import { callableActors } from "../people/contacting";
import { markedEmergencyContacts } from "../people/emergency-contacts";
import {
  studentAlerts,
  studentColumns,
  studentFormParts,
  studentPhones,
} from "../people/points";
import { guardianEmergencyContacts } from "./emergency-contacts";
import { FAMILIES_HOSTS } from "./hosts";
import { linkGuardian } from "./links";

const families = (context: { tenantId: string; schoolId: string }) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

/**
 * What families tells the rest of the product: who acts for a learner and
 * for what, the family workspace, the guardians staff reach and write to,
 * the student list's guardian column, phone and custody flag, guardians on
 * a new student, the families audience, and the setup steps and counts
 * that are about guardians.
 */
export const FAMILIES: ModuleContributions = {
  module: "families",
  contributions: [
    contribute(fileHosts, FAMILIES_HOSTS),
    contribute(portalAudiences, { audience: "families" }),
    contribute(markedEmergencyContacts, {
      contactsOf: guardianEmergencyContacts,
    }),
    // Every custody restriction and "do not contact" rule holds here, in
    // `app.guardian_permits`, so a restricted guardian is never offered.
    contribute(callableActors, {
      callableOf: async (context, input) =>
        (
          await guardiansToCall(context.tx, {
            tenantId: context.tenantId,
            studentIds: input.studentIds,
            day: input.on,
          })
        ).map(({ userId, ...row }) => ({ ...row, id: userId })),
    }),
    contribute(actingFor, {
      learnersOf: (scope, input) =>
        learnersOf(scope.tx, { tenantId: scope.tenantId, ...input }),
      actorsOf: (scope, input) =>
        actorsOf(scope.tx, { tenantId: scope.tenantId, ...input }),
    }),
    // Someone holding a family role opens the family workspace while a link
    // lets them follow a student at the school.
    contribute(contextOpeners, {
      context: "family",
      opens: async (scope, input) =>
        input.roles.some((role) =>
          (FAMILY_ROLES as readonly string[]).includes(role),
        ) &&
        followsAtSchool(scope.tx, {
          tenantId: scope.tenantId,
          userId: input.userId,
          path: await orgPath(scope.tx, scope.tenantId, scope.schoolId),
          on: input.today,
        }),
    }),
    contribute(peopleOpened, {
      among: (context, scope, userIds) =>
        guardiansAmong(context.tx, scope, userIds),
      all: (context, scope) => guardiansOpenedTo(context.tx, scope),
    }),
    contribute(studentColumns, {
      key: "guardian",
      valuesOn: async (context, on) => {
        const values = await guardianColumn(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          on,
        });
        return { order: guardianColumnOrder(values), values };
      },
    }),
    contribute(studentPhones, {
      studentsWith: (context, phone) =>
        studentsByGuardianPhone(context.tx, {
          tenantId: context.tenantId,
          phone,
        }),
    }),
    contribute(studentAlerts, {
      alertsOf: async (context, studentIds, on) =>
        new Map(
          [
            ...(await custodyAlerts(context.tx, {
              tenantId: context.tenantId,
              studentIds,
              on,
            })),
          ].map((id) => [id, "custody"] as const),
        ),
    }),
    // Whether a student has a guardian is told only to staff who read contacts.
    contribute(studentAlerts, {
      alertsOf: async (context, studentIds, on) => {
        if (!can(context, "contacts:read") && !can(context, "people:manage"))
          return new Map();
        const linked = await studentsWithGuardians(context.tx, {
          tenantId: context.tenantId,
          studentIds,
          on,
        });
        return new Map(
          studentIds
            .filter((id) => !linked.has(id))
            .map((id) => [id, "no_guardian"] as const),
        );
      },
    }),
    contribute(studentFormParts, {
      key: "families",
      save: async (context, input) => {
        const read = v.safeParse(familyPartSchema, input.value);
        if (!read.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        for (const link of read.output)
          await linkGuardian(context, input.studentId, link);
      },
    }),
    contribute(recipientSources, {
      rows: (context, reach, filter) =>
        guardianRecipients(context.tx, reach, filter),
      reachable: (context, reach, userIds) =>
        guardiansReachable(context.tx, reach, userIds),
    }),
    contribute(audienceKinds, {
      scope: "families",
      choices: async () => [{ id: "", labelEn: null, labelAr: null }],
      targetsOf: async (context, owner) =>
        (await toFamilies(context.tx, {
          tenantId: context.tenantId,
          kind: owner.kind,
          id: owner.id,
        }))
          ? [{ id: "", labelEn: null, labelAr: null }]
          : [],
      save: async (context, owner, targetIds) => {
        if (targetIds.some((id) => id !== ""))
          throw new ORPCError("BAD_REQUEST", {
            message: "announcements.audience_target",
          });
        await setToFamilies(context.tx, {
          tenantId: context.tenantId,
          kind: owner.kind,
          id: owner.id,
          on: targetIds.length > 0,
        });
      },
      classesOf: async () => [],
      ownersCovering: async () => [],
      peopleOf: async (context, owner, on) => {
        if (
          !(await toFamilies(context.tx, {
            tenantId: context.tenantId,
            kind: owner.kind,
            id: owner.id,
          }))
        )
          return [];
        const students = await enrolledStudents(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: on,
        });
        return (
          await actorsFor(context, {
            studentIds: students,
            on,
            purpose: "contact",
          })
        ).map((link) => link.userId);
      },
      ownersNaming: async (context, kind, input) =>
        (
          await learnersActedFor(context, {
            userId: input.userId,
            on: input.on,
            purpose: "contact",
          })
        ).length > 0
          ? ownersToFamilies(context.tx, { tenantId: context.tenantId, kind })
          : [],
    }),
    contribute(setupMeasures, {
      item: "guardians_linked",
      seen: (scope) => guardiansLinked(scope.tx, families(scope)),
    }),
    contribute(setupMeasures, {
      item: "families_signed_in",
      seen: (scope) =>
        signedInAs(scope.tx, { ...families(scope), roles: FAMILY_ROLES }),
    }),
    contribute(consentLinks, {
      keep: (context, input) =>
        keepConsentLink(context.tx, {
          tenantId: context.tenantId,
          consentId: input.consentId,
          relationshipId: input.linkId,
        }),
    }),
    contribute(usageFacts, {
      key: "restricted_guardian_links",
      measure: (scope, today) =>
        restrictedLinks(scope.tx, {
          tenantId: scope.tenantId,
          schoolId: scope.schoolId,
          on: today,
        }),
    }),
  ],
};
