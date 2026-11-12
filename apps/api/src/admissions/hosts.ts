import { itemHolder } from "@faridalms/database/stores/admissions";

import type { FileHost } from "../files/authorize";
import type { MailboxHooks } from "../messages/conversations";

/** The kinds of record this module keeps files and documents in, filled as its systems load. */
export const ADMISSIONS_HOSTS: FileHost[] = [
  // A document the filer uploaded for a checklist step is theirs and the
  // office's to open.
  {
    hostType: "admission_item",
    read: async (context, itemId) => {
      const holder = await itemHolder(context.tx, {
        tenantId: context.tenantId,
        itemId,
      });
      if (holder?.orgId !== context.schoolId) return false;
      return (
        holder.filedByUserId === context.actor.userId ||
        context.actor.capabilities.has("admissions:read") ||
        context.actor.capabilities.has("admissions:manage")
      );
    },
  },
];

/** What this module does as its mailbox's conversations change. */
export const ADMISSIONS_MAILBOXES: MailboxHooks[] = [];
