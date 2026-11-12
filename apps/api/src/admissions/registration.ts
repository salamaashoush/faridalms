import { writeAudit } from "@faridalms/database/audit";
import {
  linkEnquiriesToAccount,
  openApplicantRole,
} from "@faridalms/database/stores/admissions";
import {
  APPLICANT_ROLE,
  SELF_APPLICANT_ROLE,
} from "@faridalms/domain/workspace";

import type { AddressConfirmation } from "../core/confirmed";

/**
 * Someone who registered to apply confirmed their address: each open
 * enquiry they made under it names them as its enquirer, and they become
 * an applicant of the school from today, for themself or for another
 * person, as they registered.
 */
export const confirmApplicant: AddressConfirmation["confirmed"] = async (
  scope,
  input,
) => {
  const linked = await linkEnquiriesToAccount(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.schoolId,
    email: input.email,
    userId: input.userId,
  });
  for (const enquiryId of linked)
    await writeAudit(scope.tx, scope.tenantId, {
      action: "enquiry.enquirer",
      objectType: "site_enquiry",
      objectId: enquiryId,
      orgId: scope.schoolId,
      subjectUserId: input.userId,
    });
  const role =
    input.applyingFor === "other" ? APPLICANT_ROLE : SELF_APPLICANT_ROLE;
  if (
    await openApplicantRole(scope.tx, {
      tenantId: scope.tenantId,
      orgId: scope.schoolId,
      userId: input.userId,
      today: input.today,
      role,
    })
  )
    await writeAudit(scope.tx, scope.tenantId, {
      action: "user_role.create",
      objectType: "user_role",
      orgId: scope.schoolId,
      subjectUserId: input.userId,
      details: { role, source: "registration" },
    });
};
