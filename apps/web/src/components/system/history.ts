import type {
  ChangeEntry,
  ChangeLogLabels,
} from "@faridalms/ui/system/change-log";

import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { auditActionLabel } from "~/utils/audit-actions";
import { formatInstant } from "~/utils/datetime";
import { slot } from "~/utils/extension";

/**
 * How a module's own audit entries read where it is on: in the word the
 * school uses now, and from an entry's details where they name what
 * changed.
 */
export interface AuditLabel {
  action: string;
  label: (details: Readonly<Record<string, unknown>>) => string;
}

export const auditLabels = slot<AuditLabel>("audit labels");

/** A change log's words in the reader's language, around what this log is of. */
export function historyLabels(log: {
  caption: string;
  empty: string;
  emptyHint?: string;
  /** Where the log spans records, so each change names the one it was made to. */
  spans?: boolean;
}): ChangeLogLabels {
  return {
    caption: log.caption,
    what: m.historyColChange(),
    why: m.historyColWhy(),
    who: m.historyColWho(),
    when: m.historyColWhen(),
    empty: log.empty,
    ...(log.emptyHint ? { emptyHint: log.emptyHint } : {}),
    ...(log.spans ? { record: m.historyColRecord() } : {}),
  };
}

/** What every audit entry says the same way: the action, who did it and when. */
export function useHistoryEntry() {
  const labels = useSlot(auditLabels);
  return (entry: {
    id: string;
    action: string;
    occurredAt: string;
    actorEn: string | null;
    actorAr: string | null;
    details?: Readonly<Record<string, unknown>>;
  }): Pick<ChangeEntry, "id" | "what" | "who" | "when" | "at"> => ({
    id: entry.id,
    what:
      labels
        .find((each) => each.action === entry.action)
        ?.label(entry.details ?? {}) ?? auditActionLabel(entry.action),
    who:
      entry.actorEn || entry.actorAr
        ? inLocale(entry.actorEn, entry.actorAr)
        : m.historySystem(),
    when: formatInstant(entry.occurredAt, "medium"),
    at: entry.occurredAt,
  });
}
