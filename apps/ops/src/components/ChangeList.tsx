import type { Change } from "@faridalms/database/directory/admin";

import { formatBytes, formatWhen, MODULE_NAMES } from "../format";

const LABEL: Record<string, string> = {
  poolBytes: "School pool",
  classBytes: "Each class",
  moduleBytes: "Each module",
  personBytes: "Each person",
  modules: "Modules",
};

function describe(value: unknown, key: string): string {
  if (value === null || value === undefined) return "default";
  if (key === "modules" && Array.isArray(value))
    return value
      .map((module) => MODULE_NAMES[String(module)] ?? module)
      .join(", ");
  if (typeof value === "number") return formatBytes(value);
  return JSON.stringify(value);
}

/** What changed in a plan, field by field, from the change log's snapshots. */
function differences(before: unknown, after: unknown): string[] {
  const from = (before ?? {}) as Record<string, unknown>;
  const to = (after ?? {}) as Record<string, unknown>;
  return Object.keys(LABEL).flatMap((key) =>
    JSON.stringify(from[key] ?? null) === JSON.stringify(to[key] ?? null)
      ? []
      : [
          `${LABEL[key]}: ${describe(from[key], key)} → ${describe(to[key], key)}`,
        ],
  );
}

export function ChangeList({
  changes,
  schoolName,
}: {
  changes: Change[];
  schoolName?: (id: string) => string;
}) {
  if (changes.length === 0)
    return <p className="text-sm text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="divide-y rounded-lg border">
      {changes.map((change) => (
        <li key={change.id} className="grid gap-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {schoolName ? `${schoolName(change.subjectId)}: ` : ""}
              {change.action}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatWhen(change.occurredAt)} · {change.actor}
            </span>
          </div>
          <ul className="text-muted-foreground">
            {differences(change.before, change.after).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{change.reason}</p>
        </li>
      ))}
    </ol>
  );
}
