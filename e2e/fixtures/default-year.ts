import { createDatabase, schema } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { applyDefaultAcademicYear } from "@faridalms/database/repositories/academic-years";
import { eq } from "drizzle-orm";

/**
 * Switches the default year inside a transaction and rolls it back, so the
 * real statements and constraints run while every other test keeps seeing
 * the school's actual default.
 */
class RolledBack extends Error {}

const controlUrl = process.env.CONTROL_DATABASE_URL;
if (
  !controlUrl ||
  !/^\/northwind_test_control_[a-z0-9]+$/.test(new URL(controlUrl).pathname)
) {
  throw new Error("Default year fixtures require an isolated test database");
}
const control = createControlDatabase(controlUrl);
try {
  const [school] = await control
    .select()
    .from(schools)
    .where(eq(schools.slug, "northwind"));
  if (
    !school ||
    !/^\/northwind_test_northwind_[a-z0-9]+$/.test(new URL(school.databaseUrl).pathname)
  ) {
    throw new Error("Default year fixtures require an isolated school");
  }
  const db = createDatabase(school.databaseUrl);
  let observed: Record<string, unknown> = {};
  try {
    await db.transaction(async (tx) => {
      const admin = await tx.query.users.findFirst({
        where: { email: "admin@example.com" },
      });
      const previous = await tx.query.schoolYears.findFirst({
        where: { isCurrent: true },
      });
      if (!admin || !previous) throw new Error("Missing seeded year or admin");
      const [planned] = await tx
        .insert(schema.schoolYears)
        .values({
          name: `D${crypto.randomUUID().slice(0, 8)}`,
          startsOn: "2040-09-01",
          endsOn: "2041-06-30",
          status: "planning",
        })
        .returning();
      if (!planned) throw new Error("Missing planned year");
      let refusal = "";
      await tx
        .transaction(async (inner) => {
          await applyDefaultAcademicYear(
            inner,
            { id: planned.id, expectedRevision: planned.revision },
            admin.id,
          );
        })
        .catch((error: unknown) => {
          refusal = error instanceof Error ? error.message : String(error);
        });
      await tx
        .update(schema.schoolYears)
        .set({ status: "active" })
        .where(eq(schema.schoolYears.id, planned.id));
      const switched = await applyDefaultAcademicYear(
        tx,
        { id: planned.id, expectedRevision: planned.revision },
        admin.id,
      );
      const current = await tx.query.schoolYears.findMany({
        where: { isCurrent: true },
        columns: { id: true },
      });
      const formerDefault = await tx.query.schoolYears.findFirst({
        where: { id: previous.id },
        columns: { isCurrent: true, revision: true },
      });
      const events = await tx.query.schoolYearEvents.findMany({
        where: { schoolYearId: planned.id },
        columns: { action: true },
      });
      let closingDefault = "";
      await tx
        .transaction(async (inner) => {
          await inner
            .update(schema.schoolYears)
            .set({ status: "closed" })
            .where(eq(schema.schoolYears.id, planned.id));
        })
        .catch((error: unknown) => {
          closingDefault = String(
            (error as { cause?: { constraint?: string } }).cause?.constraint ??
              (error instanceof Error ? error.message : error),
          );
        });
      observed = {
        refusal,
        switchedIsCurrent: switched?.isCurrent,
        currentIds: current.map((row) => row.id),
        plannedId: planned.id,
        previousId: previous.id,
        formerDefault,
        previousRevision: previous.revision,
        events: events.map((row) => row.action),
        closingDefault,
      };
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  }
  const after = await db.query.schoolYears.findFirst({
    where: { isCurrent: true },
    columns: { id: true },
  });
  console.log(JSON.stringify({ ...observed, defaultAfterRollback: after?.id }));
  await db.$client.close();
} finally {
  await control.$client.close();
}
