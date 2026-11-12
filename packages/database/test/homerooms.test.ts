import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import { YEAR } from "../src/seed";
import {
  endEnrollment,
  endStudentEnrollmentsFrom,
  insertClass,
  restoreStudentEnrollments,
} from "../src/stores/classes";
import {
  followHomeroom,
  linkClass,
  placeMember,
} from "../src/stores/homerooms";
import { harness, probe, urlFor } from "./harness";

class Undone extends Error {}

/** Runs the work in the standalone school as its owner, then undoes it. */
async function inSchool(
  work: (
    tx: CellTransaction,
    school: { tenantId: string; schoolId: string },
  ) => Promise<void>,
) {
  const { b } = harness();
  const schoolId = b.schools[0]?.id;
  if (!schoolId) throw new Error("the standalone school");
  const owner = openOwner(urlFor(null));
  try {
    await owner.asOwner(b.tenantId, "test", async (tx) => {
      await work(tx, { tenantId: b.tenantId, schoolId });
      throw new Undone();
    });
  } catch (error) {
    if (!(error instanceof Undone)) throw error;
  } finally {
    await owner.close();
  }
}

interface Seat {
  homeroom: string;
  student: string;
  enrollment: string;
  from: string;
}

/** Two of the school's homerooms and a student in the first. */
async function seats(tx: CellTransaction, tenantId: string) {
  const rows = await tx.execute<Seat>(sql`
    select m.homeroom_class_id as homeroom,
      m.student_user_id as student, m.enrollment_id as enrollment,
      to_char(lower(m.valid_during), 'YYYY-MM-DD') as "from"
    from core.homeroom_members m
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.homeroom_class_id
    where m.tenant_id = ${tenantId}::uuid and m.status = 'active'
    order by c.code, m.student_user_id`);
  const first = rows[0];
  const other = rows.find((row) => row.homeroom !== first?.homeroom);
  if (!first || !other) throw new Error("the seed gives two homerooms");
  return { first, other };
}

/**
 * Where a homeroom's subject classes disagree with its places: an
 * enrollment the homeroom wrote that no place gives, or a place with no
 * such enrollment.
 */
async function drift(tx: CellTransaction, tenantId: string, homeroom: string) {
  return tx.execute<{ class_id: string; user_id: string; days: string }>(sql`
    with wanted as (
      select k.class_id, m.student_user_id as user_id,
        daterange(greatest(lower(m.valid_during), k.linked_on), upper(m.valid_during)) as days
      from core.homeroom_classes k
      join core.homeroom_members m on m.tenant_id = k.tenant_id
        and m.homeroom_class_id = k.homeroom_class_id and m.status = 'active'
      where k.tenant_id = ${tenantId}::uuid and k.homeroom_class_id = ${homeroom}::uuid
        and k.status = 'active'
        and greatest(lower(m.valid_during), k.linked_on) < upper(m.valid_during)
    ), written as (
      select e.class_id, e.user_id, e.valid_during as days from core.enrollments e
      join core.homeroom_classes k on k.tenant_id = e.tenant_id and k.class_id = e.class_id
        and k.status = 'active'
      where e.tenant_id = ${tenantId}::uuid and k.homeroom_class_id = ${homeroom}::uuid
        and e.source = 'homeroom' and e.status = 'active'
    )
    select class_id, user_id, days::text from (
      (select * from wanted except select * from written)
      union all
      (select * from written except select * from wanted)) d`);
}

async function placeOf(
  tx: CellTransaction,
  tenantId: string,
  enrollment: string,
) {
  const [row] = await tx.execute<{ days: string; status: string }>(sql`
    select valid_during::text as days, status from core.homeroom_members
    where tenant_id = ${tenantId}::uuid and enrollment_id = ${enrollment}::uuid`);
  return row;
}

describe("a homeroom's subject classes follow its places", () => {
  test("the seed's homerooms agree with their subject classes", async () => {
    await inSchool(async (tx, { tenantId }) => {
      const { first, other } = await seats(tx, tenantId);
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
      expect(await drift(tx, tenantId, other.homeroom)).toEqual([]);
    });
  });

  test("a move ends the old classes on the day and starts the new ones", async () => {
    await inSchool(async (tx, { tenantId, schoolId }) => {
      const { first, other } = await seats(tx, tenantId);
      const day = "2026-11-01";
      await endEnrollment(tx, {
        tenantId,
        id: first.enrollment,
        starts: first.from,
        on: day,
      });
      expect(await placeOf(tx, tenantId, first.enrollment)).toEqual({
        days: `[${first.from},${day})`,
        status: "active",
      });
      await followHomeroom(tx, { tenantId, homeroomClassId: first.homeroom });
      await placeMember(tx, {
        tenantId,
        orgId: schoolId,
        homeroomClassId: other.homeroom,
        studentId: first.student,
        from: day,
        endsBefore: YEAR.end,
        source: "manual",
      });
      const added = await followHomeroom(tx, {
        tenantId,
        homeroomClassId: other.homeroom,
      });
      expect([...added.values()].flat()).toContain(first.student);
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
      expect(await drift(tx, tenantId, other.homeroom)).toEqual([]);
    });
  });

  test("a second place over the same days is refused", async () => {
    await inSchool(async (tx, { tenantId, schoolId }) => {
      const { first, other } = await seats(tx, tenantId);
      const refused = await placeMember(tx, {
        tenantId,
        orgId: schoolId,
        homeroomClassId: other.homeroom,
        studentId: first.student,
        from: "2026-11-01",
        endsBefore: YEAR.end,
        source: "manual",
      }).then(
        () => null,
        (error: Error) =>
          error.cause instanceof Error ? error.cause.message : error.message,
      );
      expect(refused).toContain("homeroom_members_excl");
    });
  });

  test("a subject class joining later takes the members from its day", async () => {
    await inSchool(async (tx, { tenantId, schoolId }) => {
      const { first } = await seats(tx, tenantId);
      const made = await insertClass(tx, {
        tenantId,
        orgId: schoolId,
        runs: { from: YEAR.start, to: YEAR.end },
        code: "LATE-1",
        titleEn: "Late",
        titleAr: null,
        courseId: null,
        subjectId: null,
        locationId: null,
      });
      await linkClass(tx, {
        tenantId,
        orgId: schoolId,
        homeroomClassId: first.homeroom,
        classId: made.id,
        linkedOn: "2026-12-01",
      });
      const added = await followHomeroom(tx, {
        tenantId,
        homeroomClassId: first.homeroom,
      });
      expect(added.get(made.id)).toContain(first.student);
      const [row] = await tx.execute<{ days: string }>(sql`
        select valid_during::text as days from core.enrollments
        where tenant_id = ${tenantId}::uuid and class_id = ${made.id}::uuid
          and user_id = ${first.student}::uuid`);
      expect(row?.days).toBe(`[2026-12-01,${YEAR.end})`);
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
    });
  });

  test("leaving the school and coming back move the place with the enrollments", async () => {
    await inSchool(async (tx, { tenantId, schoolId }) => {
      const { first } = await seats(tx, tenantId);
      const left = "2026-11-15";
      const ended = await endStudentEnrollmentsFrom(
        tx,
        { tenantId, schoolId },
        { studentId: first.student, on: left },
      );
      expect((await placeOf(tx, tenantId, first.enrollment))?.days).toBe(
        `[${first.from},${left})`,
      );
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
      await restoreStudentEnrollments(
        tx,
        { tenantId, schoolId },
        { studentId: first.student, ...ended },
      );
      expect((await placeOf(tx, tenantId, first.enrollment))?.days).toBe(
        `[${first.from},${YEAR.end})`,
      );
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
    });
  });

  test("an enrollment ended while the module was off is written again", async () => {
    await inSchool(async (tx, { tenantId }) => {
      const { first } = await seats(tx, tenantId);
      await tx.execute(sql`
        update core.enrollments set status = 'tobedeleted'
        where tenant_id = ${tenantId}::uuid and user_id = ${first.student}::uuid
          and source = 'homeroom' and class_id <> ${first.homeroom}::uuid`);
      expect(await drift(tx, tenantId, first.homeroom)).not.toEqual([]);
      await followHomeroom(tx, { tenantId, homeroomClassId: first.homeroom });
      expect(await drift(tx, tenantId, first.homeroom)).toEqual([]);
    });
  });
});

describe("a place is tied to its enrollment", () => {
  test("the application ending the enrollment moves the place, under row security", async () => {
    const { b } = harness();
    const [seat] = await harness().su.unsafe(
      `select enrollment_id, lower(valid_during)::text as starts from core.homeroom_members
       where tenant_id = $1 and status = 'active' order by enrollment_id limit 1`,
      [b.tenantId],
    );
    const result = await probe<{ days: string }>("app", b.tenantId, [
      {
        text: `update core.enrollments set valid_during = daterange(lower(valid_during), '2026-10-01')
               where tenant_id = $1 and id = $2`,
        params: [b.tenantId, seat.enrollment_id],
      },
      {
        text: `select valid_during::text as days from core.homeroom_members
               where tenant_id = $1 and enrollment_id = $2`,
        params: [b.tenantId, seat.enrollment_id],
      },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.days).toBe(`[${seat.starts},2026-10-01)`);
  });

  test("a place cannot be changed apart from its enrollment", async () => {
    const { b } = harness();
    const result = await probe("app", b.tenantId, [
      {
        text: `update core.homeroom_members set valid_during = '[2026-09-13,2026-10-01)'
               where tenant_id = $1`,
        params: [b.tenantId],
      },
    ]);
    expect(result.error?.code).toBe("23503");
  });
});
