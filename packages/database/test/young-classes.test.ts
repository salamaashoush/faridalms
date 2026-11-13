import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import {
  learnersOfYoungClasses,
  markedYoung,
  markYoung,
} from "../src/stores/young-classes";
import { harness, urlFor } from "./harness";

class Undone extends Error {}

interface TwoClasses {
  tenantId: string;
  orgId: string;
  studentId: string;
  young: string;
  other: string;
  on: string;
}

/** Runs the work as the owner on a student learning in two classes on one day, then undoes it. */
async function inTwoClasses(
  work: (tx: CellTransaction, found: TwoClasses) => Promise<void>,
) {
  const { a } = harness();
  const owner = openOwner(urlFor(null));
  try {
    await owner.asOwner(a.tenantId, "test", async (tx) => {
      const [row] = await tx.execute<{
        org_id: string;
        student_id: string;
        one: string;
        two: string;
        on: string;
      }>(sql`
        select c1.org_id, e1.user_id as student_id, c1.id as one, c2.id as two,
          greatest(lower(e1.valid_during), lower(e2.valid_during), lower(c1.runs), lower(c2.runs))::text as on
        from core.enrollments e1
        join core.classes c1 on c1.tenant_id = e1.tenant_id and c1.id = e1.class_id and c1.status = 'active'
        join core.enrollments e2 on e2.tenant_id = e1.tenant_id and e2.user_id = e1.user_id
          and e2.class_id <> e1.class_id and e2.role = 'student' and e2.status = 'active'
        join core.classes c2 on c2.tenant_id = e2.tenant_id and c2.id = e2.class_id
          and c2.status = 'active' and c2.org_id = c1.org_id
        where e1.tenant_id = ${a.tenantId}::uuid and e1.role = 'student' and e1.status = 'active'
          and (e1.valid_during * e2.valid_during * c1.runs * c2.runs) @>
            greatest(lower(e1.valid_during), lower(e2.valid_during), lower(c1.runs), lower(c2.runs))
        order by c1.code, c2.code limit 1`);
      if (!row) throw new Error("a seeded student in two classes at once");
      await markYoung(tx, {
        tenantId: a.tenantId,
        orgId: row.org_id,
        classIds: [row.one, row.two],
        young: false,
      });
      await work(tx, {
        tenantId: a.tenantId,
        orgId: row.org_id,
        studentId: row.student_id,
        young: row.one,
        other: row.two,
        on: row.on,
      });
      throw new Undone();
    });
  } catch (error) {
    if (!(error instanceof Undone)) throw error;
  } finally {
    await owner.close();
  }
}

describe("a class for young children", () => {
  test("is marked once, and unmarked, answering only the classes it changed", async () => {
    await inTwoClasses(async (tx, found) => {
      const school = { tenantId: found.tenantId, orgId: found.orgId };
      expect(
        await markYoung(tx, {
          ...school,
          classIds: [found.young],
          young: true,
        }),
      ).toEqual([found.young]);
      expect(
        await markYoung(tx, {
          ...school,
          classIds: [found.young],
          young: true,
        }),
      ).toEqual([]);
      expect(
        await markedYoung(tx, found.tenantId, [found.young, found.other]),
      ).toEqual(new Set<string>([found.young]));
      expect(
        await markYoung(tx, {
          ...school,
          classIds: [found.young],
          young: false,
        }),
      ).toEqual([found.young]);
      expect(await markedYoung(tx, found.tenantId, [found.young])).toEqual(
        new Set<string>(),
      );
    });
  });

  test("makes a learner young while any class they learn in that day is young", async () => {
    await inTwoClasses(async (tx, found) => {
      const school = { tenantId: found.tenantId, orgId: found.orgId };
      const youngOn = (on: string) =>
        learnersOfYoungClasses(tx, {
          ...school,
          userIds: [found.studentId],
          on,
        });
      expect(await youngOn(found.on)).toEqual(new Set<string>());
      await markYoung(tx, { ...school, classIds: [found.young], young: true });
      expect(await youngOn(found.on)).toEqual(new Set([found.studentId]));
      expect(await youngOn("1990-01-01")).toEqual(new Set<string>());
      await markYoung(tx, { ...school, classIds: [found.other], young: true });
      await markYoung(tx, { ...school, classIds: [found.young], young: false });
      expect(await youngOn(found.on)).toEqual(new Set([found.studentId]));
      await markYoung(tx, { ...school, classIds: [found.other], young: false });
      expect(await youngOn(found.on)).toEqual(new Set<string>());
    });
  });
});
