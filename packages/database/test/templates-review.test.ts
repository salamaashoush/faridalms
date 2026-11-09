import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { MIGRATIONS } from "../src/migrate";
import { harness } from "./harness";

async function renameCapability() {
  const folder = (await readdir(MIGRATIONS.cell)).find((name) =>
    name.endsWith("_templates_review"),
  );
  if (!folder) throw new Error("the templates review migration is missing");
  return Bun.file(join(MIGRATIONS.cell, folder, "migration.sql")).text();
}

async function role(tenantId: string, name: string, capabilities: string[]) {
  const [row] = (await harness().su.unsafe(
    `insert into core.access_roles (tenant_id, name_en, capabilities)
     values ($1, $2, $3) returning id`,
    [tenantId, name, capabilities],
  )) as { id: string }[];
  if (!row) throw new Error("the role was not made");
  return row.id;
}

async function capabilitiesOf(tenantId: string, id: string) {
  const [row] = (await harness().su.unsafe(
    "select capabilities from core.access_roles where tenant_id = $1 and id = $2",
    [tenantId, id],
  )) as { capabilities: string[] }[];
  return row?.capabilities;
}

describe("the template reviewer's capability", () => {
  test("is renamed in every role that held it, in its place, and nowhere else", async () => {
    const { su, a, b } = harness();
    const reviewer = await role(a.tenantId, "Head of English", [
      "people:read",
      "library:review",
      "news:manage",
    ]);
    const writer = await role(a.tenantId, "Newsletter", ["news:manage"]);
    const elsewhere = await role(b.tenantId, "Reviewer", ["library:review"]);
    try {
      const sql = await renameCapability();
      await su.unsafe(sql);
      await su.unsafe(sql);

      expect(await capabilitiesOf(a.tenantId, reviewer)).toEqual([
        "people:read",
        "templates:review",
        "news:manage",
      ]);
      expect(await capabilitiesOf(a.tenantId, writer)).toEqual(["news:manage"]);
      expect(await capabilitiesOf(b.tenantId, elsewhere)).toEqual([
        "templates:review",
      ]);
    } finally {
      await su.unsafe(
        "delete from core.access_roles where id in ($1, $2, $3)",
        [reviewer, writer, elsewhere],
      );
    }
  });
});
