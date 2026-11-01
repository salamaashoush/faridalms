import type { CellTransaction } from "@faridalms/database/context";

import { writeAudit } from "@faridalms/database/audit";
import {
  linkEnquiriesToFamily,
  openApplicantRole,
} from "@faridalms/database/stores/admissions";
import { confirmEmail } from "@faridalms/database/stores/students";

export interface ConfirmedFamily {
  tenantId: string;
  schoolId: string;
  userId: string;
  /** The address the family proved is theirs by using the link sent to it. */
  email: string;
  today: string;
}

/**
 * Joins a family whose address is now confirmed to what the school already
 * holds under that address: each open enquiry they made names them as its
 * family. This is the one place that happens, so anything else filed under
 * a family's address before they had an account, such as the conversations
 * the Messages system keeps with outside participants, is adopted here too.
 */
export async function adoptFamilyRecords(
  tx: CellTransaction,
  family: ConfirmedFamily,
) {
  const linked = await linkEnquiriesToFamily(tx, {
    tenantId: family.tenantId,
    orgId: family.schoolId,
    email: family.email,
    familyUserId: family.userId,
  });
  for (const enquiryId of linked)
    await writeAudit(tx, family.tenantId, {
      action: "enquiry.family",
      objectType: "site_enquiry",
      objectId: enquiryId,
      orgId: family.schoolId,
      subjectUserId: family.userId,
    });
}

/**
 * What using the link from a family's registration email does beside
 * choosing the password: the address is now known to be theirs, they become
 * an applying family of the school from today, and what the school holds
 * under their address becomes theirs.
 */
export async function confirmRegistration(
  tx: CellTransaction,
  family: ConfirmedFamily,
) {
  await confirmEmail(tx, family);
  const opened = await openApplicantRole(tx, {
    tenantId: family.tenantId,
    orgId: family.schoolId,
    userId: family.userId,
    today: family.today,
  });
  if (opened)
    await writeAudit(tx, family.tenantId, {
      action: "user_role.create",
      objectType: "user_role",
      orgId: family.schoolId,
      subjectUserId: family.userId,
      details: { role: "applicant_family", source: "registration" },
    });
  await adoptFamilyRecords(tx, family);
}
