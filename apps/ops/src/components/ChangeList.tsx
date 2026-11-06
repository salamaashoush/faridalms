import type { Change, JsonValue } from "@faridalms/database/directory/admin";

import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";

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
  retired: { label: "Retired", value: (v) => (v === true ? "yes" : "no") },
};

const fieldsOf = (value: JsonValue): Fields =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

/** What changed, field by field, from the change log's snapshots. */
function differences(change: Change): string[] {
  const from = fieldsOf(change.before);
  const to = fieldsOf(change.after);
  return Object.entries(FIELDS).flatMap(([key, field]) => {
    const after = to[key];
    if (after === undefined) return [];
    const before = from[key];
    if (before === undefined) return [`${field.label}: ${field.value(after)}`];
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [`${field.label}: ${field.value(before)} → ${field.value(after)}`];
  });
}

/** Who made a change: an operator by name, or the cell that reported it. */
function actorName(actor: string, names: Record<string, string>): string {
  const [kind, id = ""] = actor.split(":", 2);
  if (kind === "operator") return names[id] ?? "A former operator";
  if (kind === "cell") return `Cell ${id}`;
  return actor;
}

export interface ChangeListProps {
  changes: Change[];
  /** Operators' names by id, so a change reads as a person's. */
  names: Record<string, string>;
  /** Names the record each change is about, where a list spans records. */
  subjectName?: (change: Change) => string;
}

/** The change log, newest first: who did what, what moved, and why. */
export function ChangeList({ changes, names, subjectName }: ChangeListProps) {
  if (changes.length === 0) return <RecordEmpty>No changes yet.</RecordEmpty>;
  return (
    <RecordList>
      {changes.map((change) => {
        const moved = differences(change);
        return (
          <li key={change.id} className="grid gap-1 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm leading-5 font-medium">
                {subjectName ? `${subjectName(change)}: ` : ""}
                {CHANGE_ACTION_NAMES[change.action] ?? change.action}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {formatWhen(change.occurredAt)} ·{" "}
                {actorName(change.actor, names)}
              </span>
            </div>
            {moved.length ? (
              <ul className="grid gap-0.5 text-[13px] leading-[18px] text-muted-foreground">
                {moved.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm leading-5">{change.reason}</p>
          </li>
        );
      })}
    </RecordList>
  );
}
