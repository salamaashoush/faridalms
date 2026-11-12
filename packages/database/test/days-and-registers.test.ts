import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import { YEAR } from "../src/seed";
import { clipCell, meetingsOn } from "../src/stores/timetable";
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

async function schoolOf() {
  const { a } = harness();
  const [row] = await harness().su.unsafe(
    `select o.id as school, c.id as class, p.id as period, p2.id as other
     from core.orgs o
     join core.classes c on c.tenant_id = o.tenant_id and c.org_id = o.id and c.status = 'active'
     join core.class_periods p on p.tenant_id = o.tenant_id and p.org_id = o.id
       and p.status = 'active' and p.bell_schedule_id is null and p.kind = 'lesson'
     join core.class_periods p2 on p2.tenant_id = o.tenant_id and p2.org_id = o.id
       and p2.status = 'active' and p2.bell_schedule_id is null and p2.kind = 'lesson' and p2.id <> p.id
     where o.tenant_id = $1 and o.type = 'school'
     order by o.created_at, c.code, p.sequence, p2.sequence limit 1`,
    [a.tenantId],
  );
  if (!row) throw new Error("a seeded school with a class and two periods");
  return {
    tenantId: a.tenantId,
    ...(row as {
      school: string;
      class: string;
      period: string;
      other: string;
    }),
  };
}

const DAY = "2026-11-05";

const register = (kind: "day" | "period", daily = kind === "day") => ({
  text: `insert into core.attendance_registers (tenant_id, org_id, class_id, kind, daily, taken_on, state, recorded_by_user_id)
         select $1, $2, $3, '${kind}', ${daily}, $4, 'in_progress', u.id from core.users u
         where u.tenant_id = $1 limit 1 returning id`,
});

describe("a school's days", () => {
  test("a school marks a day once, by date and not by year", async () => {
    const at = await schoolOf();
    const mark = {
      text: `insert into core.calendar_dates (tenant_id, org_id, day_on, event_descriptor_id)
             select $1, $2, '2031-03-03', id from core.descriptors
             where tenant_id = $1 and namespace = 'calendar_event' and code_value = 'school_holiday'`,
      params: [at.tenantId, at.school],
    };
    const twice = await probe("app", at.tenantId, [mark, mark]);
    expect(twice.error?.message).toContain("calendar_dates_day_key");
  });
});

describe("a register", () => {
  test("is one class's register of the whole day, once a day", async () => {
    const at = await schoolOf();
    const params = [at.tenantId, at.school, at.class, DAY];
    const twice = await probe("app", at.tenantId, [
      { ...register("day"), params },
      { ...register("day"), params },
    ]);
    expect(twice.error?.message).toContain("attendance_registers_day_key");
    const notDaily = await probe("app", at.tenantId, [
      { ...register("day", false), params },
    ]);
    expect(notDaily.error?.message).toContain(
      "attendance_registers_daily_check",
    );
  });

  test("taken in a period keeps that period, one register to a class's period of a day, beside its register of the day", async () => {
    const at = await schoolOf();
    const params = [at.tenantId, at.school, at.class, DAY];
    const inPeriod = (period: string) => ({
      text: `with taken as (
               insert into core.attendance_registers (tenant_id, org_id, class_id, kind, daily, taken_on, state, recorded_by_user_id)
               select $1, $2, $3, 'period', false, $4, 'in_progress', u.id from core.users u
               where u.tenant_id = $1 limit 1 returning id)
             insert into core.register_periods (tenant_id, org_id, register_id, class_id, taken_on, class_period_id)
             select $1, $2, id, $3, $4, $5 from taken`,
      params: [...params, period],
    });
    const three = await probe("app", at.tenantId, [
      { ...register("day"), params },
      inPeriod(at.period),
      inPeriod(at.other),
      { text: "set constraints all immediate" },
    ]);
    expect(three.error).toBeUndefined();
    const samePeriod = await probe("app", at.tenantId, [
      inPeriod(at.period),
      inPeriod(at.period),
    ]);
    expect(samePeriod.error?.message).toContain("register_periods_key");
  });

  test("a register taken in a period cannot stand without it, whichever modules are on, yet a tombstoned one may", async () => {
    const at = await schoolOf();
    const params = [at.tenantId, at.school, at.class, DAY];
    const bare = await probe("app", at.tenantId, [
      { ...register("period"), params },
      { text: "set constraints all immediate" },
    ]);
    expect(bare.error?.message).toContain("has no period");
    const linked = `insert into core.register_periods (tenant_id, org_id, register_id, class_id, taken_on, class_period_id)
      select $1, $2, id, $3, $4, $5 from core.attendance_registers
      where tenant_id = $1 and class_id = $3 and taken_on = $4 and kind = 'period' and status = 'active'`;
    const kept = await probe("app", at.tenantId, [
      { ...register("period"), params },
      { text: linked, params: [...params, at.period] },
      { text: "set constraints all immediate" },
      {
        text: `update core.attendance_registers set state = 'submitted', submitted_at = now(), version = version + 1
               where tenant_id = $1 and class_id = $2 and taken_on = $3`,
        params: [at.tenantId, at.class, DAY],
      },
      { text: "set constraints all immediate" },
      {
        text: `update core.attendance_registers set status = 'tobedeleted'
               where tenant_id = $1 and class_id = $2 and taken_on = $3`,
        params: [at.tenantId, at.class, DAY],
      },
      {
        text: `update core.register_periods set status = 'tobedeleted'
               where tenant_id = $1 and class_id = $2 and taken_on = $3`,
        params: [at.tenantId, at.class, DAY],
      },
      { text: "set constraints all immediate" },
    ]);
    expect(kept.error).toBeUndefined();
    const orphaned = await probe("app", at.tenantId, [
      { ...register("period"), params },
      { text: linked, params: [...params, at.period] },
      {
        text: `update core.register_periods set status = 'tobedeleted'
               where tenant_id = $1 and class_id = $2 and taken_on = $3`,
        params: [at.tenantId, at.class, DAY],
      },
      { text: "set constraints all immediate" },
    ]);
    expect(orphaned.error?.message).toContain("has no period");
  });
});

describe("the school's periods", () => {
  test("run on with no end, apart by code and order within the school, while a bell schedule's own period holds on its days alone", async () => {
    const at = await schoolOf();
    const period = (code: string, sequence: number, during: string) => ({
      text: `insert into core.class_periods (tenant_id, org_id, code, name_en, sequence, start_time, end_time, valid_during)
             values ($1, $2, '${code}', 'Late', ${sequence}, '16:00', '17:00', '${during}')`,
      params: [at.tenantId, at.school],
    });
    const open = await probe("app", at.tenantId, [
      period("late", 40, "[2040-01-01,)"),
    ]);
    expect(open.error).toBeUndefined();
    const clash = await probe("app", at.tenantId, [
      period("late", 40, "[2040-01-01,)"),
      period("late", 41, "[2045-01-01,)"),
    ]);
    expect(clash.error?.message).toContain("class_periods_code_excl");
    const extra = await probe("app", at.tenantId, [
      {
        text: `with schedule as (
                 insert into core.bell_schedules (tenant_id, org_id, name_en, times)
                 values ($1, $2, 'Exams', '[]') returning id)
               insert into core.class_periods (tenant_id, org_id, code, name_en, sequence, start_time, end_time, valid_during, bell_schedule_id)
               select $1, $2, 'exam', 'Exam', 30, '09:00', '11:00', '[2040-01-01,2040-02-01)', id from schedule`,
        params: [at.tenantId, at.school],
      },
    ]);
    expect(extra.error?.message).toContain("class_periods_valid_during_check");
  });

  test("a date runs on a bell schedule or as another day once", async () => {
    const at = await schoolOf();
    const day = {
      text: `insert into core.timetable_days (tenant_id, org_id, day_on, runs_as) values ($1, $2, '2031-03-03', 2)`,
      params: [at.tenantId, at.school],
    };
    const twice = await probe("app", at.tenantId, [day, day]);
    expect(twice.error?.message).toContain("timetable_days_day_key");
    const empty = await probe("app", at.tenantId, [
      {
        text: `insert into core.timetable_days (tenant_id, org_id, day_on) values ($1, $2, '2031-03-04')`,
        params: [at.tenantId, at.school],
      },
    ]);
    expect(empty.error?.message).toContain("timetable_days_shape_check");
  });
});

describe("a lesson on the timetable", () => {
  test("is held only on days its class runs, and placing in its cell clips one whose class ended while the timetable was off", async () => {
    await inSchool(async (tx, { tenantId, schoolId }) => {
      const [meeting] = await tx.execute<{
        id: string;
        class_id: string;
        timetable_id: string;
        weekday: number;
        class_period_id: string;
      }>(sql`
        select m.id, m.class_id, m.timetable_id, m.weekday, m.class_period_id
        from core.class_meetings m
        where m.tenant_id = ${tenantId}::uuid and m.org_id = ${schoolId}::uuid and m.status = 'active'
        order by m.id limit 1`);
      if (!meeting) throw new Error("the seed plans no lessons");
      const fortnight = Array.from({ length: 14 }, (_, index) =>
        addDays(YEAR.start, 21 + index),
      );
      const heldOn = async (days: readonly string[]) =>
        (
          await meetingsOn(tx, {
            tenantId,
            schoolId,
            on: days[0] ?? YEAR.start,
            days,
            filter: { classIds: [meeting.class_id] },
          })
        )
          .filter((row) => row.id === meeting.id)
          .map((row) => row.on);
      const held = await heldOn(fortnight);
      const [first, second] = held;
      if (!first || !second)
        throw new Error("the lesson is held twice in a fortnight");
      // Core ends the class while the timetable is off; nothing of the
      // timetable refuses it.
      await tx.execute(sql`
        update core.enrollments set status = 'tobedeleted'
        where tenant_id = ${tenantId}::uuid and class_id = ${meeting.class_id}::uuid
          and status = 'active' and lower(valid_during) >= ${second}::date`);
      await tx.execute(sql`
        update core.enrollments set valid_during = daterange(lower(valid_during), ${second}::date)
        where tenant_id = ${tenantId}::uuid and class_id = ${meeting.class_id}::uuid
          and status = 'active' and valid_during @> ${second}::date`);
      await tx.execute(sql`
        update core.classes set runs = daterange(lower(runs), ${second}::date)
        where tenant_id = ${tenantId}::uuid and id = ${meeting.class_id}::uuid`);
      expect(await heldOn(fortnight)).toEqual(
        held.filter((day) => day < second),
      );
      const [stale] = await tx.execute<{ until: string | null }>(sql`
        select to_char(upper(valid_during), 'YYYY-MM-DD') as until from core.class_meetings
        where tenant_id = ${tenantId}::uuid and id = ${meeting.id}::uuid`);
      expect(stale?.until === null || (stale?.until ?? "") > second).toBe(true);
      await clipCell(tx, {
        tenantId,
        timetableId: meeting.timetable_id,
        weekday: meeting.weekday,
        periodId: meeting.class_period_id,
      });
      const [clipped] = await tx.execute<{ until: string; status: string }>(sql`
        select to_char(upper(valid_during), 'YYYY-MM-DD') as until, status from core.class_meetings
        where tenant_id = ${tenantId}::uuid and id = ${meeting.id}::uuid`);
      expect(clipped).toEqual({ until: second, status: "active" });
    });
  });
});
