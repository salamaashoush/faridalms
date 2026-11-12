import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { EnquiryPurpose } from "@faridalms/domain/enquiries";

import { writeAudit } from "@faridalms/database/audit";
import { capabilityHolders } from "@faridalms/database/stores/access";
import { openEnquiryConversation } from "@faridalms/database/stores/enquiries";
import { schoolDate } from "@faridalms/domain/school";

import type { RequestContext } from "../core/context";

import { notifyIn } from "../core/notify";
import { schoolZone } from "../core/procedure";

/**
 * Records that a family sent an enquiry from the website, opens its
 * conversation in the admissions mailbox with the family's words as its
 * first message, and tells everyone who works enquiries at the school. It
 * runs after the visitor's row is committed, in its own unit, because the
 * site role that wrote it may write neither the audit log, conversations
 * nor notifications. A failure here is logged; the enquiry is kept, waits
 * in the inbox, and gets its conversation when staff first work it.
 */
export async function announceEnquiry(
  context: RequestContext,
  school: DirectorySchool,
  enquiry: {
    id: string;
    name: string;
    purpose: EnquiryPurpose;
    message: string;
  },
): Promise<void> {
  try {
    await context.cell.withTenant(
      {
        tenantId: school.tenantId,
        requestId: context.requestId,
        actor: { kind: "system" },
      },
      "write",
      async (tx, _lifecycle, now) => {
        await openEnquiryConversation(tx, {
          tenantId: school.tenantId,
          enquiryId: enquiry.id,
        });
        await writeAudit(tx, school.tenantId, {
          action: "enquiry.receive",
          objectType: "site_enquiry",
          objectId: enquiry.id,
          orgId: school.schoolId,
          details: { source: "website", purpose: enquiry.purpose },
        });
        const today = schoolDate(await schoolZone(tx, school.schoolId), now);
        const staff = await capabilityHolders(tx, {
          tenantId: school.tenantId,
          schoolId: school.schoolId,
          today,
          capability: "admissions:manage",
        });
        await notifyIn(
          {
            tx,
            tenantId: school.tenantId,
            schoolId: school.schoolId,
            actorUserId: null,
            now,
            channels: context.channels,
          },
          staff.map((row) => row.id),
          {
            kind: "enquiry",
            subject: { type: "site_enquiry", id: enquiry.id },
            params: {
              title: enquiry.name,
              purpose: enquiry.purpose,
              ...(enquiry.message
                ? { preview: enquiry.message.slice(0, 140) }
                : {}),
            },
            needsAction: true,
          },
        );
      },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        requestId: context.requestId,
        enquiry: enquiry.id,
        announce: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
