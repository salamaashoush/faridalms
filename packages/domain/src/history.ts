import * as v from "valibot";

import { keysetField } from "./paging";

export const historyQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  after: keysetField,
});
export type HistoryQuery = v.InferInput<typeof historyQuerySchema>;

export type HistoryValueKind =
  | "text"
  | "phone"
  | "date"
  | "boolean"
  | "count"
  | "choice";

/**
 * The columns whose old and new values a history shows, by audited table.
 * Everything else a payload keeps stays in it: a history is read by the
 * office as well as by auditors, and a grade, a note or an address it once
 * held is not theirs to see there.
 */
export const HISTORY_FIELDS = {
  "core.users": {
    given_name_en: "text",
    middle_name_en: "text",
    family_name_en: "text",
    given_name_ar: "text",
    middle_name_ar: "text",
    family_name_ar: "text",
    preferred_given_name: "text",
    birth_date: "date",
  },
  "core.user_relationships": {
    relation_meaning: "choice",
    legal_guardian: "boolean",
    portal_access: "boolean",
    receives_notifications: "boolean",
    primary_contact: "boolean",
    emergency_contact: "boolean",
    residence: "choice",
    pickup: "choice",
  },
  "core.contact_points": { phone: "phone" },
  "core.academic_sessions": {
    title_en: "text",
    title_ar: "text",
    starts_on: "date",
    ends_on: "date",
    terms: "count",
    lifecycle: "choice",
  },
  "core.attendance_events": { meaning: "choice" },
} as const satisfies Record<string, Record<string, HistoryValueKind>>;

type Fields = typeof HISTORY_FIELDS;
export type HistoryField = {
  [Table in keyof Fields]: `${Table}.${keyof Fields[Table] & string}`;
}[keyof Fields];

export type HistoryValue = string | number | boolean | null;

export interface HistoryChange {
  field: HistoryField;
  kind: HistoryValueKind;
  before: HistoryValue;
  after: HistoryValue;
}

const shown = (value: unknown): HistoryValue =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? value
    : null;

/**
 * What an update changed, among the columns its table shows. A creation has
 * no before and lists nothing: the entry itself says what was made.
 */
export function historyChanges(
  table: string | undefined,
  changed: readonly string[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): HistoryChange[] {
  if (!table || !before || !(table in HISTORY_FIELDS)) return [];
  const fields: Record<string, HistoryValueKind> =
    HISTORY_FIELDS[table as keyof Fields];
  return Object.entries(fields)
    .filter(([column]) => changed.includes(column))
    .map(([column, kind]) => ({
      field: `${table}.${column}` as HistoryField,
      kind,
      before: shown(before[column]),
      after: shown(after?.[column]),
    }));
}
