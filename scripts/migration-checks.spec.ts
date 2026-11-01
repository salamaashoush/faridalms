import { describe, expect, it } from "vitest";

import { migrationProblems } from "./migration-checks";

const path = "packages/database/migrations/cell/x/migration.sql";

describe("migration checks", () => {
  it("lets a table's isolation go with the table, as drizzle-kit drops it", () => {
    expect(
      migrationProblems(
        path,
        `DROP POLICY "tenant_isolation" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."announcements";--> statement-breakpoint
DROP TABLE "core"."announcements";`,
      ),
    ).toEqual([]);
  });

  it("refuses dropping a kept table's isolation", () => {
    expect(
      migrationProblems(
        path,
        `DROP POLICY "tenant_isolation" ON "core"."announcements";
DROP TABLE "core"."site_posts";`,
      ),
    ).toEqual([
      `${path}: drops tenant_isolation on "core"."announcements" and keeps the table`,
    ]);
    expect(
      migrationProblems(
        path,
        "drop policy if exists tenant_isolation on core.users;",
      ),
    ).toHaveLength(1);
  });

  it("refuses switching isolation off or handing a table to another owner", () => {
    expect(
      migrationProblems(
        path,
        "alter table core.users no force row level security;\nalter table core.users owner to app;",
      ),
    ).toHaveLength(2);
  });
});
