import type { ContactOutcome } from "@faridalms/domain/attendance";
import type { EntryKind, Mailbox } from "@faridalms/domain/messages";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  ArrowRightLeft,
  Mail,
  NotebookPen,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react";

import type { RecordLink } from "~/components/people/PersonLink";
import type { InWords } from "~/utils/words";

import { enquiryEventText } from "~/components/admissions/labels";
import { PersonLink } from "~/components/people/PersonLink";
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
  (details: Record<string, unknown>, words: InWords) => string | null
> = {
  admissions: (details, words) => enquiryEventText(details, inLocale, words),
  attendance: () => null,
};

/** The line an internal entry is titled by: a change in words, a call's outcome, or its kind. */
export function entryTitle(
  mailbox: Mailbox | null,
  kind: Exclude<EntryKind, "message">,
  details: Record<string, unknown>,
  words: InWords,
): string {
  if (kind === "event")
    return (mailbox && EVENTS[mailbox](details, words)) ?? ENTRY_LABEL.event();
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

export interface NameLinkProps {
  userId: string | null;
  link: RecordLink;
  children: ReactNode;
  className?: string;
}

/**
 * A name in a conversation, leading to the student's record, the person's
 * record or their profile as far as the server says the viewer reaches
 * them, and plain text everywhere else.
 */
export function NameLink({ userId, link, children, className }: NameLinkProps) {
  const style = cn(
    "underline-offset-2 hover:underline focus-visible:underline",
    className,
  );
  if (!userId || !link) return <bdi className={className}>{children}</bdi>;
  return (
    <PersonLink userId={userId} link={link} className={style}>
      <bdi>{children}</bdi>
    </PersonLink>
  );
}
