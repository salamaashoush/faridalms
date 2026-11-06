import type { Change } from "@faridalms/database/directory/admin";

import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";

import { formatBytes, formatDay, formatWhen, moduleName } from "../format";

const LABEL: Record<string, string> = {
  poolBytes: "School pool",
  classBytes: "Each class",
  moduleBytes: "Each module",
  personBytes: "Each person",
  modules: "Modules",
  keepUntil: "Keep until",
  retired: "Retired",
  role: "Serves",
  state: "State",
  canonical: "Main host",
};

function describe(value: unknown, key: string): string {
  if (value === null || value === undefined) return "default";
  if (key === "modules" && Array.isArray(value))
    return value.map((module) => moduleName(String(module))).join(", ");
  if (typeof value === "number") return formatBytes(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (key === "keepUntil" && typeof value === "string") return formatDay(value);
  return JSON.stringify(value);
}

/** What changed, field by field, from the change log's snapshots. */
function differences(change: Change): string[] {
  const from = (change.before ?? {}) as Record<string, unknown>;
  const to = (change.after ?? {}) as Record<string, unknown>;
  const created = change.action.endsWith(".create");
  return Object.keys(LABEL).flatMap((key) => {
    if (created)
      return key in to ? [`${LABEL[key]}: ${describe(to[key], key)}`] : [];
    return JSON.stringify(from[key] ?? null) === JSON.stringify(to[key] ?? null)
      ? []
      : [
          `${LABEL[key]}: ${describe(from[key], key)} → ${describe(to[key], key)}`,
        ];
  });
}

export interface ChangeListProps {
  changes: Change[];
  /** Names the record each change is about, where a list spans records. */
  subjectName?: (id: string) => string;
}

/** The change log, newest first: who did what, what moved, and why. */
export function ChangeList({ changes, subjectName }: ChangeListProps) {
  if (changes.length === 0) return <RecordEmpty>No changes yet.</RecordEmpty>;
  return (
    <RecordList>
      {changes.map((change) => {
        const moved = differences(change);
        return (
          <li key={change.id} className="grid gap-1 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm leading-5 font-medium">
                {subjectName ? `${subjectName(change.subjectId)}: ` : ""}
                {change.action}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {formatWhen(change.occurredAt)} · {change.actor}
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
