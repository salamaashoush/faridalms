import { writeAudit } from "@faridalms/database/audit";
import { markAddressUnreachable } from "@faridalms/database/stores/notifications";
import { mailboxAddress } from "@faridalms/domain/email-replies";

import type { RequestContext } from "../core/context";

export type ReportOutcome = "unreachable" | "transient" | "unknown_tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A bounce or a complaint Resend reported for mail the platform sent. The
 * tenant it was sent for travels as the `tenant` tag (deliver.ts), so the
 * report reaches only that tenant's rows, and only of this cell. A bounce
 * that may yet clear (Resend's `Transient` and `Undetermined`) changes
 * nothing; a permanent one or a complaint marks every contact and person
 * at the address unreachable, audited.
 */
export async function takeDeliveryReport(
  context: RequestContext,
  type: "email.bounced" | "email.complained",
  data: Record<string, unknown>,
): Promise<ReportOutcome> {
  if (type === "email.bounced") {
    const bounce = data.bounce as { type?: unknown } | undefined;
    if (bounce?.type !== "Permanent") return "transient";
  }
  const tags = data.tags as Record<string, unknown> | undefined;
  const tenantId = typeof tags?.tenant === "string" ? tags.tenant : "";
  if (!UUID.test(tenantId)) return "unknown_tenant";
  if (
    !(await context.directory.tenantsOfCell(context.cellId)).includes(tenantId)
  )
    return "unknown_tenant";
  const addresses = (Array.isArray(data.to) ? data.to : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => (mailboxAddress(item) ?? item).trim().toLowerCase())
    .filter((item) => item.includes("@"));
  const reason = type === "email.bounced" ? "bounced" : "complained";
  await context.cell.withTenant(
    {
      tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "write",
    async (tx) => {
      for (const address of new Set(addresses)) {
        const marked = await markAddressUnreachable(tx, {
          tenantId,
          address,
          reason,
        });
        for (const contactId of marked.contactIds)
          await writeAudit(tx, tenantId, {
            action: "message_contact.unreachable",
            objectType: "message_contact",
            objectId: contactId,
            details: { reason },
          });
        for (const userId of marked.people)
          await writeAudit(tx, tenantId, {
            action: "contact_point.unreachable",
            objectType: "user",
            objectId: userId,
            subjectUserId: userId,
            details: { reason },
          });
      }
    },
  );
  return "unreachable";
}
