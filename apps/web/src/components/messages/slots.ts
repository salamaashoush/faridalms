import type { Mailbox } from "@faridalms/domain/messages";

import type { InWords } from "~/utils/words";

import { slot } from "~/utils/extension";

/** How a module's mailbox words the entries its own work records in a conversation. */
export interface MailboxWords {
  mailbox: Mailbox;
  /** What a recorded change says, or null where it says nothing of its own. */
  event(details: Record<string, unknown>, words: InWords): string | null;
  /** What a logged call came to, by the outcome its work records. */
  outcomes?: Readonly<Record<string, () => string>>;
}

export const mailboxWords = slot<MailboxWords>("mailbox words");
