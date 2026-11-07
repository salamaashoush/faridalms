import type { Change, JsonValue } from "@faridalms/database/directory/admin";
import type { ChangeLogLabels } from "@faridalms/ui/system/change-log";
import type { DataTablePagination } from "@faridalms/ui/system/data-table";
import type { IndexToolbarProps } from "@faridalms/ui/system/index-toolbar";
import type { ReactNode } from "react";

import { ChangeLog } from "@faridalms/ui/system/change-log";

import {
  CHANGE_ACTION_NAMES,
  formatBytes,
  formatDay,
  formatWhen,
  HOST_STATE_NAMES,
  moduleName,
  ONBOARDING_ITEM_NAMES,
  STANDING_NAMES,
  TENANT_STATE_NAMES,
} from "../format";

type Fields = Record<string, JsonValue>;

/** A snapshot's value as plain text, whatever JSON it holds. */
function textOf(value: JsonValue): string {
  if (value === null) return "none";
  if (Array.isArray(value)) return value.map(textOf).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const named =
  (names: Record<string, string>) =>
  (value: JsonValue): string =>
    typeof value === "string" ? (names[value] ?? value) : textOf(value);

const bytes = (value: JsonValue) =>
  typeof value === "number" ? formatBytes(value) : "default";

/** A field a change log shows: its label, and how its value reads. */
interface ChangeField {
  label: string;
  value: (value: JsonValue) => string;
  /** Whether a record's first value says anything, where its default does not. */
  telling?: (value: JsonValue) => boolean;
}

const FIELDS: Record<string, ChangeField> = {
  poolBytes: { label: "School pool", value: bytes },
  classBytes: { label: "Each class", value: bytes },
  moduleBytes: { label: "Each module", value: bytes },
  personBytes: { label: "Each person", value: bytes },
  modules: {
    label: "Modules",
    value: (v) =>
      Array.isArray(v)
        ? v.map((module) => moduleName(textOf(module))).join(", ")
        : "default",
  },
  schools: {
    label: "Schools",
    value: textOf,
  },
  item: { label: "Step", value: named(ONBOARDING_ITEM_NAMES) },
  state: {
    label: "State",
    value: named({ ...HOST_STATE_NAMES, ...TENANT_STATE_NAMES }),
  },
  access: { label: "Access", value: named(STANDING_NAMES) },
  canonical: {
    label: "Main host",
    value: (v) => (typeof v === "string" ? v : "none"),
  },
  keepUntil: {
    label: "Keep until",
    value: (v) => (typeof v === "string" ? formatDay(v) : "none"),
  },
  retired: {
    label: "Retired",
    value: (v) => (v === true ? "yes" : "no"),
    telling: (v) => v === true,
  },
};

const fieldsOf = (value: JsonValue): Fields =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

/** The fields as a log reads them, naming schools where it knows their names. */
function fieldsFor(schoolNames?: Record<string, string>) {
  if (!schoolNames) return FIELDS;
  const nameOf = named(schoolNames);
  return {
    ...FIELDS,
    schools: {
      label: "Schools",
      value: (v: JsonValue) =>
        Array.isArray(v) ? v.map(nameOf).join(", ") : textOf(v),
    },
  };
}

/** What changed, field by field, from the change log's snapshots. */
function differences(
  change: Change,
  fields: Record<string, ChangeField>,
): string[] {
  const from = fieldsOf(change.before);
  const to = fieldsOf(change.after);
  return Object.entries(fields).flatMap(([key, field]) => {
    const after = to[key];
    if (after === undefined) return [];
    const before = from[key];
    if (before === undefined)
      return field.telling && !field.telling(after)
        ? []
        : [`${field.label}: ${field.value(after)}`];
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [`${field.label}: ${field.value(before)} → ${field.value(after)}`];
  });
}

/** Who made a change: an operator by name, or the cell that reported it. */
export function actorName(
  actor: string,
  names: Record<string, string>,
): string {
  const [kind, id = ""] = actor.split(":", 2);
  if (kind === "operator") return names[id] ?? "A former operator";
  if (kind === "cell") return `Cell ${id}`;
  return actor;
}

export interface ChangeListProps<T extends Change> {
  changes: T[];
  /** Operators' names by id, so a change reads as a person's. */
  names: Record<string, string>;
  /**
   * The record each change was made to, where the list spans records,
   * linked to it where it can be opened.
   */
  record?: (change: T) => ReactNode;
  /** Schools' names by slug, so a new tenant's schools read by name. */
  schoolNames?: Record<string, string>;
  toolbar?: IndexToolbarProps;
  pagination?: DataTablePagination;
}

const LABELS: ChangeLogLabels = {
  caption: "Changes",
  what: "Change",
  why: "Why",
  who: "By",
  when: "When",
  empty: "No changes yet.",
  emptyHint: "Each change shows here with who made it and why.",
};

const SPANNING: ChangeLogLabels = {
  ...LABELS,
  record: "Record",
  empty: "Nothing has been changed yet",
  emptyHint:
    "Each change an operator or a cell makes to a school, its addresses or an exam session shows here, with who made it and why.",
};

/**
 * The change log as an audit table, newest first: what was done and what it
 * moved, why, by whom and when, and the record it was made to where the
 * list spans records. On a phone each change is a card.
 */
export function ChangeList<T extends Change>({
  changes,
  names,
  record,
  schoolNames,
  toolbar,
  pagination,
}: ChangeListProps<T>) {
  const fields = fieldsFor(schoolNames);
  return (
    <ChangeLog
      labels={record ? SPANNING : LABELS}
      toolbar={toolbar}
      pagination={pagination}
      entries={changes.map((change) => ({
        id: change.id,
        what: CHANGE_ACTION_NAMES[change.action] ?? change.action,
        details: differences(change, fields),
        why: change.reason,
        who: actorName(change.actor, names),
        when: formatWhen(change.occurredAt),
        at: change.occurredAt,
        record: record?.(change),
      }))}
    />
  );
}
