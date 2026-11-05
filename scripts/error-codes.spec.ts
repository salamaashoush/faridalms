import { describe, expect, it } from "vitest";

import type { Source } from "./error-codes";

import { errorCodeProblems, raisedCodes } from "./error-codes";

const reader = (cases: string, internal = "") => ({
  path: "apps/web/src/utils/error.ts",
  text: `
const REGISTERS_AFTER = "enrollment.registers_after:";
const INTERNAL_CODES = new Set([${internal}]);
export function getMessageFromError(error: { message: string }) {
  switch (error.message) {
${cases}
  }
  if (error.message.startsWith("validation.")) return validationMessage(error);
  if (error.message.startsWith(REGISTERS_AFTER)) return "registers";
  if (error.message.endsWith(".reference_invalid")) return "gone";
  return "generic";
}`,
});

const validation = {
  path: "apps/web/src/utils/validation.ts",
  text: `
export function validationMessage(issue: { message?: string }) {
  switch (issue.message) {
    case "validation.end_date":
      return "end";
  }
  switch (issue.type) {
    case "min_length":
      return "short";
  }
}`,
};

const api: Source[] = [
  {
    path: "apps/api/src/systems/classes.ts",
    text: `
import { ORPCError } from "@orpc/server";
import { CODE_TAKEN } from "./codes";
const LOCKED = { closed: "attendance.closed" } as const;
function refuse(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}
export async function save(input: { code: string; last: string }) {
  if (!input.code) throw new ORPCError("BAD_REQUEST", { message: "class.code_needed" });
  if (input.code === "class.reserved") refuse(CODE_TAKEN);
  if (input.last)
    throw new ORPCError("CONFLICT", {
      message: \`enrollment.registers_after:\${input.last}\`,
    });
  await audit({
    action: input.code ? "class.update" : "class.create",
    table: "core.classes",
  });
  await tx.execute(sql\`select * from core.classes where code = 'class.sql'\`);
  return { file: "index.html", host: "youtube.com", locked: LOCKED.closed };
}
const AUDIT_ACTIONS = { read: "class.read", write: "class.write" } as const;`,
  },
  {
    path: "packages/database/src/errors.ts",
    text: `
const DENIED_TABLES = new Set(["health.records"]);
export const CONFLICTS = { classes_code_key: "class.code_taken" };
export const mapDatabaseError = (table: string) => ({
  code: \`\${table}.reference_invalid\`,
});`,
  },
  {
    path: "packages/domain/src/classes.ts",
    text: `
import * as v from "valibot";
export const CODE_TAKEN = "class.code_taken";
export const schema = v.pipe(
  v.object({ startsOn: v.string(), endsOn: v.string() }),
  v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
);
export function nameIssue(name: string): "class.name_needed" | null {
  return name ? null : "class.name_needed";
}`,
  },
  {
    path: "packages/domain/src/classes.test.ts",
    text: `expect(issue).toBe("class.only_in_a_test");`,
  },
];

const web: Source = {
  path: "apps/web/src/components/Upload.tsx",
  text: `export const fail = () => { throw new Error("file.failed"); };`,
};

const READ = [
  "class.code_needed",
  "class.code_taken",
  "class.name_needed",
  "file.failed",
]
  .map((code) => `    case "${code}":\n      return "${code}";`)
  .join("\n");

const check = (cases: string, internal = "", more: Source[] = []) =>
  errorCodeProblems([
    reader(cases, internal),
    validation,
    ...api,
    web,
    ...more,
  ]);

describe("the error code check", () => {
  it("finds codes however the API writes them", () => {
    const raised = raisedCodes(
      api.filter((source) => !source.path.includes(".test.")),
    );
    expect([...raised.codes.keys()].toSorted()).toEqual([
      "attendance.closed",
      "class.code_needed",
      "class.code_taken",
      "class.name_needed",
      "validation.end_date",
    ]);
    expect([...raised.parametrised.keys()]).toEqual([
      "enrollment.registers_after:",
    ]);
    expect([...raised.suffixes.keys()]).toEqual([".reference_invalid"]);
  });

  it("passes when every raised code is read and every case is raised", () => {
    expect(check(READ, `"attendance.closed"`)).toEqual([]);
  });

  it("names a code nobody reads, where it is raised and what to do", () => {
    expect(check(READ)).toEqual([
      "attendance.closed (raised at apps/api/src/systems/classes.ts:4) is not read in apps/web/src/utils/error.ts: add a case that returns copy from messages/en.json and messages/ar.json, or list it in INTERNAL_CODES if no person can act on it",
    ]);
  });

  it("names a case for a code nothing raises", () => {
    expect(
      check(
        `${READ}\n    case "class.retired":\n      return "x";`,
        `"attendance.closed"`,
      ),
    ).toEqual([
      "class.retired is read in apps/web/src/utils/error.ts but nothing raises it: remove it and the copy only it uses",
    ]);
  });

  it("does not count a code that only a test mentions as raised", () => {
    expect(
      check(
        `${READ}\n    case "class.only_in_a_test":\n      return "x";`,
        `"attendance.closed"`,
      ),
    ).toEqual([
      "class.only_in_a_test is read in apps/web/src/utils/error.ts but nothing raises it: remove it and the copy only it uses",
    ]);
  });

  it("refuses a code that is both read and internal", () => {
    expect(check(READ, `"attendance.closed", "class.code_taken"`)).toEqual([
      "class.code_taken has a case and is in INTERNAL_CODES in apps/web/src/utils/error.ts: keep one",
    ]);
  });

  it("asks for a branch for a code that carries a value or names a table", () => {
    const bare = reader(READ, `"attendance.closed"`);
    bare.text = bare.text
      .replace(/.*REGISTERS_AFTER\)\).*\n/, "")
      .replace(/.*reference_invalid.*\n/, "");
    expect(errorCodeProblems([bare, validation, ...api, web])).toEqual([
      "enrollment.registers_after:… (raised at apps/api/src/systems/classes.ts:13) is not read in apps/web/src/utils/error.ts: add a startsWith branch for it",
      "….reference_invalid (raised at packages/database/src/errors.ts:5) is not read in apps/web/src/utils/error.ts: add an endsWith branch for it",
    ]);
  });

  it("refuses a code assembled from a variable", () => {
    expect(
      check(READ, `"attendance.closed"`, [
        {
          path: "apps/api/src/systems/quota.ts",
          text: [
            "export const full = (scope: string) => `file.quota_${scope}`;",
            'export const gone = (reason: string) => "file." + reason;',
          ].join("\n"),
        },
      ]),
    ).toEqual([
      'apps/api/src/systems/quota.ts:1 assembles a code from "file.quota_" and a variable: write each code as a literal, so this check can see it',
      'apps/api/src/systems/quota.ts:2 assembles a code from "file." and a variable: write each code as a literal, so this check can see it',
    ]);
  });
});
