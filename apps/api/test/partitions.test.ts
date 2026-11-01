import { describe, expect, test } from "bun:test";

import { seeded } from "./harness";

describe("partition upkeep", () => {
  test("the worker makes the months ahead that migrations did not, once", async () => {
    const { cell } = seeded();
    // Migrations made about a year ahead; asking for two makes the gap.
    const made = await cell.ensurePartitions(24);
    expect(made).toBeGreaterThan(0);
    expect(await cell.ensurePartitions(24)).toBe(0);
  });
});
