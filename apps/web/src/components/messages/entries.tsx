import type { ContactOutcome } from "@faridalms/domain/attendance";
import type { EntryKind, Mailbox } from "@faridalms/domain/messages";
import type { LucideIcon } from "lucide-react";

import {
  ArrowRightLeft,
  Mail,
  NotebookPen,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react";

import { enquiryEventText } from "~/components/admissions/labels";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

/** The internal entries a team reads in its mailbox's conversations, by kind. */
export const ENTRY_ICON: Record<Exclude<EntryKind, "message">, LucideIcon> = {
  note: NotebookPen,
  call: Phone,
  meeting: Users,
  email: Mail,
  event: ArrowRightLeft,
  held: ShieldAlert,
};

export const ENTRY_LABEL: Record<
  Exclude<EntryKind, "message">,
  () => string
> = {
  note: m.msgEntryNote,
  call: m.msgEntryCall,
  meeting: m.msgEntryMeeting,
  email: m.msgEntryEmail,
  event: m.msgEntryEvent,
  held: m.msgEntryHeld,
};

const OUTCOME_LABEL: Record<ContactOutcome, () => string> = {
  reached: m.fupReached,
  no_answer: m.fupNoAnswer,
  left_message: m.fupLeftMessage,
  messaged: m.fupMessaged,
};

/** What a recorded change says, by the system that owns the mailbox. */
const EVENTS: Record<
  Mailbox,
  (details: Record<string, unknown>) => string | null
> = {
  admissions: (details) => enquiryEventText(details, inLocale),
  attendance: () => null,
};

/** The line an internal entry is titled by: a change in words, a call's outcome, or its kind. */
export function entryTitle(
  mailbox: Mailbox | null,
  kind: Exclude<EntryKind, "message">,
  details: Record<string, unknown>,
): string {
  if (kind === "event")
    return (mailbox && EVENTS[mailbox](details)) ?? ENTRY_LABEL.event();
  if (
    kind === "call" &&
    typeof details.outcome === "string" &&
    details.outcome in OUTCOME_LABEL
  )
    return `${ENTRY_LABEL.call()}: ${OUTCOME_LABEL[details.outcome as ContactOutcome]()}`;
  if (kind === "held") {
    const from = typeof details.from === "string" ? details.from : "";
    return details.reason === "unauthenticated"
      ? m.msgHeldUnchecked({ from })
      : m.msgHeldSender({ from });
  }
  return ENTRY_LABEL[kind]();
}
