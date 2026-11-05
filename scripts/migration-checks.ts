const FORBIDDEN = [
  /disable\s+row\s+level\s+security/i,
  /no\s+force\s+row\s+level\s+security/i,
  /owner\s+to\s+(?!"?cell_owner"?\b|"?directory_owner"?\b|"?business_owner"?\b)/i,
  /bypassrls/i,
];

const TABLE = String.raw`((?:"?\w+"?\.)?"?\w+"?)`;
const DROPPED_ISOLATION = new RegExp(
  String.raw`drop\s+policy\s+(?:if\s+exists\s+)?"?tenant_isolation"?\s+on\s+${TABLE}`,
  "gi",
);
const DROPPED_TABLE = new RegExp(
  String.raw`drop\s+table\s+(?:if\s+exists\s+)?${TABLE}`,
  "gi",
);

const tableName = (name: string | undefined) =>
  (name ?? "").replaceAll('"', "").toLowerCase();

/**
 * What a migration must not do to the isolation of tenants. A table's
 * `tenant_isolation` policy may be dropped only by the migration that drops
 * the table, as drizzle-kit writes it when a table leaves the schema.
 */
export function migrationProblems(path: string, text: string): string[] {
  const problems = FORBIDDEN.filter((pattern) => pattern.test(text)).map(
    (pattern) => `${path}: matches ${pattern}`,
  );
  const dropped = new Set(
    [...text.matchAll(DROPPED_TABLE)].map((match) => tableName(match[1])),
  );
  for (const match of text.matchAll(DROPPED_ISOLATION))
    if (!dropped.has(tableName(match[1])))
      problems.push(
        `${path}: drops tenant_isolation on ${match[1] ?? "a table"} and keeps the table`,
      );
  return problems;
}
