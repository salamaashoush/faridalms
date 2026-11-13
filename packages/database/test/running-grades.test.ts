import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import {
  classesShowingRunning,
  classResults,
  gradebookSettingsOf,
  runningShownOf,
  saveRunningDefault,
  setRunningShown,
} from "../src/stores/gradebook";
import { harness, urlFor } from "./harness";

class Undone extends Error {}

interface School {
  tenantId: string;
  orgId: string;
  classId: string;
  otherClassId: string;
  studentId: string;
  today: string;
}

/** Runs the work as the owner with a running class of a student, and another class, then undoes it. */
async function inSchool(
  work: (tx: CellTransaction, school: School) => Promise<void>,
) {
  const { a } = harness();
  const owner = openOwner(urlFor(null));
  try {
    await owner.asOwner(a.tenantId, "test", async (tx) => {
      const [row] = await tx.execute<{
        org_id: string;
        class_id: string;
        other_class_id: string;
        student_id: string;
        today: string;
      }>(sql`
        select c.org_id, c.id as class_id, o.id as other_class_id,
          s.user_id as student_id, current_date::text as today
        from core.classes c
        join core.classes o on o.tenant_id = c.tenant_id and o.org_id = c.org_id
          and o.id <> c.id and o.status = 'active' and o.runs @> current_date
        join core.enrollments s on s.tenant_id = c.tenant_id and s.class_id = c.id
          and s.role = 'student' and s.status = 'active' and s.valid_during @> current_date
        where c.tenant_id = ${a.tenantId}::uuid and c.status = 'active'
          and c.runs @> current_date
          and not exists (select 1 from core.enrollments x where x.tenant_id = o.tenant_id
            and x.class_id = o.id and x.user_id = s.user_id and x.status = 'active')
        order by c.code, o.code limit 1`);
      if (!row) throw new Error("a seeded running class with a student");
      await tx.execute(sql`
        update core.class_running_grades set status = 'tobedeleted'
        where tenant_id = ${a.tenantId}::uuid and status = 'active'`);
      await tx.execute(sql`
        update core.gradebook_settings set status = 'tobedeleted'
        where tenant_id = ${a.tenantId}::uuid and status = 'active'`);
      await work(tx, {
        tenantId: a.tenantId,
        orgId: row.org_id,
        classId: row.class_id,
        otherClassId: row.other_class_id,
        studentId: row.student_id,
        today: row.today,
      });
      throw new Undone();
    });
  } catch (error) {
    if (!(error instanceof Undone)) throw error;
  } finally {
    await owner.close();
  }
}

describe("running grades", () => {
  test("a class shows nothing until its teacher or the school says so, and a stale choice is refused", async () => {
    await inSchool(async (tx, school) => {
      const scope = { tenantId: school.tenantId, orgId: school.orgId };
      expect(await gradebookSettingsOf(tx, scope)).toEqual({
        runningShown: false,
        version: 0,
      });
      const before = await runningShownOf(tx, {
        ...scope,
        classId: school.classId,
      });
      expect(before).toEqual({ shown: false, version: 0 });
      expect(await classesShowingRunning(tx, { ...scope, ...school })).toEqual(
        [],
      );

      const version = await setRunningShown(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        shown: true,
        expectedVersion: 0,
      });
      expect(version).toBeNumber();
      expect(
        await setRunningShown(tx, {
          tenantId: school.tenantId,
          classId: school.classId,
          shown: false,
          expectedVersion: 0,
        }),
      ).toBeNull();
      expect(
        await runningShownOf(tx, { ...scope, classId: school.classId }),
      ).toEqual({ shown: true, version: version ?? -1 });
      // Only the classes the student is in, and only those shown.
      expect(
        await classesShowingRunning(tx, {
          ...scope,
          studentId: school.studentId,
          today: school.today,
        }),
      ).toEqual([school.classId]);
      await setRunningShown(tx, {
        tenantId: school.tenantId,
        classId: school.otherClassId,
        shown: true,
        expectedVersion: 0,
      });
      expect(
        await classesShowingRunning(tx, {
          ...scope,
          studentId: school.studentId,
          today: school.today,
        }),
      ).toEqual([school.classId]);
    });
  });

  test("a new default reaches only classes made after it", async () => {
    await inSchool(async (tx, school) => {
      const scope = { tenantId: school.tenantId, orgId: school.orgId };
      const saved = await saveRunningDefault(tx, {
        ...scope,
        runningShown: true,
        expectedVersion: 0,
      });
      expect(saved?.kept).toBeGreaterThan(1);
      expect(
        await saveRunningDefault(tx, {
          ...scope,
          runningShown: false,
          expectedVersion: 0,
        }),
      ).toBeNull();
      expect((await gradebookSettingsOf(tx, scope)).runningShown).toBe(true);
      expect(
        (await runningShownOf(tx, { ...scope, classId: school.classId })).shown,
      ).toBe(false);

      const [made] = await tx.execute<{ id: string }>(sql`
        insert into core.classes (tenant_id, org_id, code, title_en, runs)
        values (${school.tenantId}::uuid, ${school.orgId}::uuid, 'RUN-NEW', 'A new class',
          daterange(current_date, null))
        returning id`);
      expect(
        await runningShownOf(tx, { ...scope, classId: made?.id ?? "" }),
      ).toEqual({ shown: true, version: 0 });
    });
  });

  test("a class's results are read for one student alone", async () => {
    await inSchool(async (tx, school) => {
      const [pair] = await tx.execute<{
        class_id: string;
        student_id: string;
      }>(sql`
        select a.class_id, r.student_user_id as student_id
        from core.assignment_recipients r
        join core.assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
        where r.tenant_id = ${school.tenantId}::uuid and r.status = 'active'
          and a.status = 'active' and a.state <> 'draft'
        order by a.class_id, r.student_user_id limit 1`);
      if (!pair) throw new Error("seeded work with a recipient");
      const all = await classResults(tx, school.tenantId, pair.class_id);
      const mine = await classResults(
        tx,
        school.tenantId,
        pair.class_id,
        pair.student_id,
      );
      expect(mine.length).toBeGreaterThan(0);
      expect(mine).toEqual(
        all.filter((row) => row.studentId === pair.student_id),
      );
      expect(mine.length).toBeLessThan(all.length);
    });
  });
});
