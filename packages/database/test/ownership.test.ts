import { describe, expect, test } from "bun:test";

import type { OwnershipViolations } from "../src/ownership";
import type {
  OwnershipCatalogue,
  OwnershipRegistry,
} from "../src/ownership-gate";

import {
  COLUMN_OWNERS,
  NAMESPACE_OWNERS,
  TABLE_OWNERS,
} from "../src/ownership";
import {
  ownershipProblems,
  readOwnership,
  violationOf,
} from "../src/ownership-gate";
import { OWNERSHIP_VIOLATIONS } from "../src/ownership-violations";
import { harness } from "./harness";

const registry: OwnershipRegistry = {
  tables: TABLE_OWNERS,
  namespaces: NAMESPACE_OWNERS,
  columns: COLUMN_OWNERS,
  violations: OWNERSHIP_VIOLATIONS,
};

const PROBE = "core.ownership_probe";

/**
 * The catalogue with one more table, which keeps a school year, a grade
 * level and a period as core may not, the period without a key. The table exists only inside a transaction rolled
 * back once the catalogue is read.
 */
async function withProbe(): Promise<OwnershipCatalogue> {
  const conn = await harness().su.reserve();
  try {
    await conn.unsafe("begin");
    await conn.unsafe(`
      create table ${PROBE} (
        tenant_id uuid not null,
        school_year_id uuid,
        class_period_id uuid,
        grade_level_ns text not null generated always as ('grade_level') stored,
        constraint ownership_probe_school_year_fkey foreign key (tenant_id, school_year_id)
          references core.academic_sessions (tenant_id, id))`);
    return await readOwnership(conn);
  } finally {
    await conn.unsafe("rollback");
    await conn.release();
  }
}

const probeKey = violationOf(
  { table: PROBE, via: "ownership_probe_school_year_fkey" },
  "core.academic_sessions",
);
const probeNamespace = violationOf(
  { table: PROBE, via: "grade_level_ns" },
  "grade_level",
);
const probeYear = violationOf(
  { table: PROBE, via: "school_year_id" },
  "school_years",
);
const probePeriod = violationOf(
  { table: PROBE, via: "class_period_id" },
  "timetable",
);

function listing(extra: OwnershipViolations): OwnershipViolations {
  const merged: Record<string, string[]> = {};
  for (const source of [OWNERSHIP_VIOLATIONS, extra])
    for (const [module, entries = []] of Object.entries(source))
      merged[module] = [...(merged[module] ?? []), ...entries].toSorted();
  return merged;
}

describe("the ownership gate", () => {
  test("finds the cell as built in agreement with the registry", async () => {
    expect(ownershipProblems(await readOwnership(harness().su))).toEqual([]);
  });

  test("refuses a table without an owner, and an owner without a table", async () => {
    const { "core.classes": _classes, ...tables } = TABLE_OWNERS;
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      tables: { ...tables, "core.nothing": { owner: "core" } },
    });
    expect(problems).toContainEqual({
      name: "core.classes",
      problem: "has no owner",
    });
    expect(problems).toContainEqual({
      name: "core.nothing",
      problem: "has an owner but is not a table",
    });
  });

  test("refuses a descriptor namespace without an owner", async () => {
    const { grade_level: _grade, ...namespaces } = NAMESPACE_OWNERS;
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      namespaces,
    });
    expect(problems).toContainEqual({
      name: "namespace grade_level",
      problem: "has no owner",
    });
    expect(problems).toContainEqual({
      name: "core.class_grades",
      problem: "grade_level_ns pins grade_level, which has no owner",
    });
  });

  test("refuses a concept column no table has", async () => {
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      columns: { ...COLUMN_OWNERS, term_id: "school_years" },
    });
    expect(problems).toEqual([
      { name: "column term_id", problem: "has an owner but no table has it" },
    ]);
  });

  test("refuses a need its owner already has", async () => {
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      tables: {
        ...TABLE_OWNERS,
        "core.peer_reviews": { owner: "peer_review", needs: ["coursework"] },
      },
    });
    expect(problems).toEqual([
      {
        name: "core.peer_reviews",
        problem: "needs coursework, which its owner peer_review already has",
      },
    ]);
  });

  test("refuses a key, a namespace column and concept columns a core table may not reach", async () => {
    const problems = ownershipProblems(await withProbe(), {
      ...registry,
      tables: { ...TABLE_OWNERS, [PROBE]: { owner: "core" } },
    });
    expect(problems).toEqual([
      {
        name: PROBE,
        problem:
          "ownership_probe_school_year_fkey reaches core.academic_sessions, owned by school_years, which a table of core may not reach",
      },
      {
        name: PROBE,
        problem:
          "grade_level_ns reaches grade_level, owned by grade_levels, which a table of core may not reach",
      },
      {
        name: PROBE,
        problem:
          "class_period_id reaches timetable, owned by timetable, which a table of core may not reach",
      },
      {
        name: PROBE,
        problem:
          "school_year_id reaches school_years, owned by school_years, which a table of core may not reach",
      },
    ]);
  });

  test("allows what the table's owner and needs reach", async () => {
    const problems = ownershipProblems(await withProbe(), {
      ...registry,
      tables: {
        ...TABLE_OWNERS,
        [PROBE]: {
          owner: "school_years",
          needs: ["grade_levels", "timetable"],
        },
      },
    });
    expect(problems).toEqual([]);
  });

  test("accepts a violation listed under the module it reaches", async () => {
    const catalogue = await withProbe();
    const tables = { ...TABLE_OWNERS, [PROBE]: { owner: "core" as const } };
    expect(
      ownershipProblems(catalogue, {
        ...registry,
        tables,
        violations: listing({
          school_years: [probeKey, probeYear],
          grade_levels: [probeNamespace],
          timetable: [probePeriod],
        }),
      }),
    ).toEqual([]);
    expect(
      ownershipProblems(catalogue, {
        ...registry,
        tables,
        violations: listing({
          timetable: [probeKey, probeNamespace, probeYear, probePeriod],
        }),
      }),
    ).toEqual([
      {
        name: PROBE,
        problem:
          "ownership_probe_school_year_fkey is listed under timetable but reaches school_years",
      },
      {
        name: PROBE,
        problem:
          "grade_level_ns is listed under timetable but reaches grade_levels",
      },
      {
        name: PROBE,
        problem:
          "school_year_id is listed under timetable but reaches school_years",
      },
    ]);
  });

  test("refuses a listed violation that no longer occurs", async () => {
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      violations: listing({ school_years: [probeKey] }),
    });
    expect(problems).toEqual([
      {
        name: probeKey,
        problem: "is listed under school_years but no longer occurs",
      },
    ]);
  });

  test("refuses a list out of order, or one listing an entry twice", async () => {
    const [entry] = OWNERSHIP_VIOLATIONS.website ?? [];
    if (!entry) throw new Error("a violation still listed is needed");
    const problems = ownershipProblems(await readOwnership(harness().su), {
      ...registry,
      violations: { ...OWNERSHIP_VIOLATIONS, website: [entry, entry] },
    });
    expect(problems).toEqual([
      {
        name: "violations reaching website",
        problem: "are not sorted, or list one twice",
      },
    ]);
  });
});
