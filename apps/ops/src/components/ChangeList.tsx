import type { Change } from "@faridalms/database/directory/admin";

import { formatBytes, formatDay, formatWhen, MODULE_NAMES } from "../format";

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
    return value
      .map((module) => MODULE_NAMES[String(module)] ?? module)
      .join(", ");
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

export function ChangeList({
  changes,
  subjectName,
}: {
  changes: Change[];
  subjectName?: (id: string) => string;
}) {
  if (changes.length === 0)
    return <p className="text-sm text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="divide-y rounded-lg border">
      {changes.map((change) => (
        <li key={change.id} className="grid gap-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {subjectName ? `${subjectName(change.subjectId)}: ` : ""}
              {change.action}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatWhen(change.occurredAt)} · {change.actor}
            </span>
          </div>
          <ul className="text-muted-foreground">
            {differences(change).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{change.reason}</p>
        </li>
      ))}
    </ol>
  );
}
