import type {
  ChangeEntry,
  ChangeLogLabels,
} from "@faridalms/ui/system/change-log";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { auditActionLabel } from "~/utils/audit-actions";
import { formatInstant } from "~/utils/datetime";

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
export function historyEntry(entry: {
  id: string;
  action: string;
  occurredAt: string;
  actorEn: string | null;
  actorAr: string | null;
}): Pick<ChangeEntry, "id" | "what" | "who" | "when" | "at"> {
  return {
    id: entry.id,
    what: auditActionLabel(entry.action),
    who:
      entry.actorEn || entry.actorAr
        ? inLocale(entry.actorEn, entry.actorAr)
        : m.historySystem(),
    when: formatInstant(entry.occurredAt, "medium"),
    at: entry.occurredAt,
  };
}
