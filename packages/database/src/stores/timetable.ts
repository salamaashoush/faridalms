import type { OpenSpan } from "@faridalms/domain/school";
import type { Cycle } from "@faridalms/domain/timetable";
import type { SQL } from "drizzle-orm";

import { MAX_CYCLE_DAY, WEEKLY } from "@faridalms/domain/timetable";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { DayPlan } from "./day-plan";

import { rangeOf } from "./classes";
import { dayPlan, dayPlans } from "./day-plan";
import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface GridOwner {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}

/** The classes running over some of the days a timetable is planned by, but those planned in another's grid. */
export async function gridOwners(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    during: OpenSpan;
    except: readonly string[];
  },
): Promise<GridOwner[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.runs && ${rangeOf(input.during)}::daterange and c.status = 'active'
      and c.id <> all(${uuidArray(input.except)})
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export interface GridClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  subjectId: string | null;
  teachers: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
    isPrimary: boolean;
  }[];
}

/** The classes a grid places, with their teachers on the date, primary first. */
export async function gridClasses(
  tx: Tx,
  input: { tenantId: string; classIds: readonly string[]; on: string },
): Promise<GridClass[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    subject_descriptor_id: string | null;
    teachers: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
      is_primary: boolean;
    }[];
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar, c.subject_descriptor_id,
           coalesce((select jsonb_agg(jsonb_build_object(
               'user_id', u.id, 'full_name_en', u.full_name_en, 'full_name_ar', u.full_name_ar,
               'is_primary', e.is_primary) order by e.is_primary desc, u.full_name_en)
             from core.enrollments e
             join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id
             where e.tenant_id = c.tenant_id and e.class_id = c.id and e.status = 'active'
               and e.role in ('teacher', 'aide') and e.valid_during @> ${input.on}::date), '[]'::jsonb)
             as teachers
    from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.status = 'active'
      and c.id = any(${uuidArray(input.classIds)})
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    subjectId: row.subject_descriptor_id,
    teachers: row.teachers.map((teacher) => ({
      userId: teacher.user_id,
      fullNameEn: teacher.full_name_en,
      fullNameAr: teacher.full_name_ar,
      isPrimary: teacher.is_primary,
    })),
  }));
}

export interface MeetingRow {
  id: string;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  timetableId: string;
  /** The day of its timetable's cycle; the ISO weekday in an ordinary week. */
  weekday: number;
  periodId: string;
  teacherId: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  roomId: string | null;
  roomCode: string | null;
  roomNameEn: string | null;
  roomNameAr: string | null;
  from: string;
  /** The date the meeting was read on. */
  on: string;
  clashAccepted: boolean;
  /** Another meeting shares this teacher or room at the same time. */
  clashing: boolean;
  /**
   * A lesson held that day alone, in a period of the day's bell schedule:
   * its change says who takes it and where, and its id is the change's.
   */
  oneDay: boolean;
}

type MeetingFilter =
  | { classIds: readonly string[] }
  | { teacherId: string }
  | { teacherIds: readonly string[] }
  | { roomId: string }
  | { schoolId: string; clashesOnly?: boolean };

function filterOf(filter: MeetingFilter): SQL {
  if ("teacherId" in filter)
    return sql`m.teacher_user_id = ${filter.teacherId}::uuid`;
  if ("teacherIds" in filter)
    return sql`m.teacher_user_id = any(${uuidArray(filter.teacherIds)})`;
  if ("roomId" in filter) return sql`m.location_id = ${filter.roomId}::uuid`;
  if ("schoolId" in filter)
    return filter.clashesOnly
      ? sql`m.org_id = ${filter.schoolId}::uuid and m.clash_accepted`
      : sql`m.org_id = ${filter.schoolId}::uuid`;
  return sql`m.class_id = any(${uuidArray(filter.classIds)})`;
}

/** Which one-day lessons a meeting filter reaches: by class, by room, or the school's. */
function oneDayFilterOf(filter: MeetingFilter): SQL {
  if ("teacherId" in filter || "teacherIds" in filter) return sql`false`;
  if ("roomId" in filter) return sql`x.location_id = ${filter.roomId}::uuid`;
  if ("schoolId" in filter)
    return filter.clashesOnly
      ? sql`false`
      : sql`x.org_id = ${filter.schoolId}::uuid`;
  return sql`x.class_id = any(${uuidArray(filter.classIds)})`;
}

/**
 * The one-day lessons a filter reaches in the periods only a day's bell
 * schedule holds, as meetings of that day. Their teacher and room are their
 * change's, so the rows carry neither.
 */
async function oneDayLessons(
  tx: Tx,
  input: { tenantId: string; schoolId: string; filter: MeetingFilter },
  plans: readonly DayPlan[],
): Promise<MeetingRow[]> {
  const slots = plans.flatMap((plan) =>
    plan.periods
      .filter((period) => period.scheduleId !== null)
      .map((period) => ({ plan, periodId: period.id })),
  );
  if (slots.length === 0) return [];
  const planOf = new Map(plans.map((plan) => [plan.day, plan]));
  const rows = await tx.execute<{
    id: string;
    class_id: string;
    class_code: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    class_period_id: string;
    day_on: string;
  }>(sql`
    select x.id, x.class_id, c.code as class_code, c.title_en as class_title_en,
           c.title_ar as class_title_ar, x.class_period_id,
           to_char(x.day_on, 'YYYY-MM-DD') as day_on
    from core.lesson_changes x
    join unnest(${textArray(slots.map((slot) => slot.plan.day))}::date[],
        ${uuidArray(slots.map((slot) => slot.periodId))}) as w(d, p)
      on x.day_on = w.d and x.class_period_id = w.p
    join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    where x.tenant_id = ${input.tenantId}::uuid and x.org_id = ${input.schoolId}::uuid
      and x.status = 'active' and not x.cancelled and ${oneDayFilterOf(input.filter)}
    order by x.day_on, c.code`);
  return rows.map((row) => {
    const plan = planOf.get(row.day_on);
    return {
      id: row.id,
      classId: row.class_id,
      classCode: row.class_code,
      classTitleEn: row.class_title_en,
      classTitleAr: row.class_title_ar,
      timetableId: plan?.timetable?.id ?? "",
      weekday: plan?.cycleDay ?? 0,
      periodId: row.class_period_id,
      teacherId: null,
      teacherNameEn: null,
      teacherNameAr: null,
      roomId: null,
      roomCode: null,
      roomNameEn: null,
      roomNameAr: null,
      from: row.day_on,
      on: row.day_on,
      clashAccepted: false,
      clashing: false,
      oneDay: true,
    };
  });
}

const everyRow = () => true;

const smallints = (values: readonly number[]) => `{${values.join(",")}}`;

/**
 * The meetings for a grid, a teacher, a room or a student at a school: those
 * of the timetable followed on `on` and in force then, or with `days`, those
 * held on each of them, on its day of the cycle and in a period it keeps,
 * with the one-day lessons of the periods only their bell schedule holds.
 */
export async function meetingsOn(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    on: string;
    filter: MeetingFilter;
    days?: readonly string[];
  },
): Promise<MeetingRow[]> {
  let day: SQL;
  let keeps: (row: { on: string; periodId: string }) => boolean = everyRow;
  let oneDay: MeetingRow[] = [];
  if (input.days) {
    const plans = await dayPlans(tx, {
      tenantId: input.tenantId,
      schoolId: input.schoolId,
      days: input.days,
    });
    oneDay = await oneDayLessons(tx, input, [...plans.values()]);
    const held = [...plans.values()].flatMap((plan) =>
      plan.timetable && plan.cycleDay !== null
        ? [
            {
              day: plan.day,
              timetableId: plan.timetable.id,
              cycleDay: plan.cycleDay,
            },
          ]
        : [],
    );
    if (held.length === 0) return oneDay;
    day = sql`join unnest(${textArray(held.map((row) => row.day))}::date[],
        ${uuidArray(held.map((row) => row.timetableId))},
        ${smallints(held.map((row) => row.cycleDay))}::smallint[]) as w(d, t, k)
        on m.valid_during @> w.d and m.timetable_id = w.t and m.weekday = w.k`;
    keeps = (row) =>
      plans.get(row.on)?.periods.some((period) => period.id === row.periodId) ??
      false;
  } else {
    const plan = await dayPlan(tx, {
      tenantId: input.tenantId,
      schoolId: input.schoolId,
      day: input.on,
    });
    if (!plan.timetable) return [];
    day = sql`join (select ${input.on}::date as d) w on m.valid_during @> w.d
      and m.timetable_id = ${plan.timetable.id}::uuid`;
  }
  const rows = await tx.execute<{
    id: string;
    class_id: string;
    class_code: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    timetable_id: string;
    weekday: number;
    class_period_id: string;
    teacher_user_id: string | null;
    teacher_en: string | null;
    teacher_ar: string | null;
    location_id: string | null;
    room_code: string | null;
    room_en: string | null;
    room_ar: string | null;
    from_day: string;
    day_on: string;
    clash_accepted: boolean;
    clashing: boolean;
  }>(sql`
    select m.id, m.class_id, c.code as class_code, c.title_en as class_title_en,
           c.title_ar as class_title_ar, m.timetable_id, m.weekday,
           m.class_period_id,
           m.teacher_user_id, u.full_name_en as teacher_en, u.full_name_ar as teacher_ar,
           m.location_id, l.code as room_code, l.name_en as room_en, l.name_ar as room_ar,
           to_char(lower(m.valid_during), 'YYYY-MM-DD') as from_day,
           to_char(w.d, 'YYYY-MM-DD') as day_on, m.clash_accepted,
           exists (select 1 from core.class_meetings o
             where o.tenant_id = m.tenant_id and o.id <> m.id and o.status = 'active'
               and o.timetable_id = m.timetable_id and o.weekday = m.weekday
               and o.class_period_id = m.class_period_id and o.valid_during @> w.d
               and ((m.teacher_user_id is not null and o.teacher_user_id = m.teacher_user_id)
                    or (m.location_id is not null and o.location_id = m.location_id))) as clashing
    from core.class_meetings m
    ${day}
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.class_id
    left join core.users u on u.tenant_id = m.tenant_id and u.id = m.teacher_user_id
    left join core.locations l on l.tenant_id = m.tenant_id and l.id = m.location_id
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and ${filterOf(input.filter)}
    order by w.d, m.weekday, m.class_period_id, c.code`);
  const meetings = rows.flatMap((row) => {
    const meeting: MeetingRow = {
      id: row.id,
      classId: row.class_id,
      classCode: row.class_code,
      classTitleEn: row.class_title_en,
      classTitleAr: row.class_title_ar,
      timetableId: row.timetable_id,
      weekday: row.weekday,
      periodId: row.class_period_id,
      teacherId: row.teacher_user_id,
      teacherNameEn: row.teacher_en,
      teacherNameAr: row.teacher_ar,
      roomId: row.location_id,
      roomCode: row.room_code,
      roomNameEn: row.room_en,
      roomNameAr: row.room_ar,
      from: row.from_day,
      on: row.day_on,
      clashAccepted: row.clash_accepted,
      clashing: row.clashing,
      oneDay: false,
    };
    return keeps(meeting) ? [meeting] : [];
  });
  return [...meetings, ...oneDay];
}

export interface Booking {
  id: string;
  kind: "teacher" | "room";
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  from: string;
}

/**
 * Meetings of other grids that already hold a teacher or room at this time
 * on some day from `from` to the end of the year.
 */
export async function bookingsAt(
  tx: Tx,
  input: {
    tenantId: string;
    timetableId: string;
    /** The classes of the grid being planned. */
    gridClassIds: readonly string[];
    weekday: number;
    periodId: string;
    from: string;
    teacherId: string | null;
    roomId: string | null;
  },
): Promise<Booking[]> {
  if (!input.teacherId && !input.roomId) return [];
  const rows = await tx.execute<{
    id: string;
    kind: "teacher" | "room";
    code: string;
    title_en: string | null;
    title_ar: string | null;
    from_day: string;
  }>(sql`
    select m.id,
           case when m.teacher_user_id = ${input.teacherId}::uuid then 'teacher' else 'room' end as kind,
           c.code, c.title_en, c.title_ar, to_char(lower(m.valid_during), 'YYYY-MM-DD') as from_day
    from core.class_meetings m
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.class_id
    where m.tenant_id = ${input.tenantId}::uuid and m.status = 'active'
      and m.class_id <> all(${uuidArray(input.gridClassIds)})
      and m.timetable_id = ${input.timetableId}::uuid and m.weekday = ${input.weekday} and m.class_period_id = ${input.periodId}::uuid
      and upper(m.valid_during) > ${input.from}::date
      and (m.teacher_user_id = ${input.teacherId}::uuid or m.location_id = ${input.roomId}::uuid)
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    from: row.from_day,
  }));
}

/**
 * Ends meetings from a day: one that started earlier keeps its past days and
 * stops there; one that had not started yet is tombstoned.
 */
async function endFrom(tx: Tx, tenantId: string, where: SQL, from: string) {
  await tx.execute(sql`
    update core.class_meetings m set status = 'tobedeleted'
    where m.tenant_id = ${tenantId}::uuid and m.status = 'active'
      and lower(m.valid_during) >= ${from}::date and ${where}`);
  const rows = await tx.execute<{ id: string }>(sql`
    update core.class_meetings m
    set valid_during = daterange(lower(m.valid_during), ${from}::date, '[)')
    where m.tenant_id = ${tenantId}::uuid and m.status = 'active'
      and m.valid_during @> ${from}::date and ${where}
    returning m.id`);
  return rows.length;
}

/**
 * Holds a grid's owning class until the transaction ends, so two people
 * placing lessons in the same grid at once cannot both fill one cell.
 */
export async function lockGrid(tx: Tx, tenantId: string, ownerId: string) {
  await tx.execute(sql`
    select 1 from core.classes
    where tenant_id = ${tenantId}::uuid and id = ${ownerId}::uuid
    for update`);
}

/** Empties a timetable's cell of a grid from a day on. */
export function endCell(
  tx: Tx,
  input: {
    tenantId: string;
    timetableId: string;
    gridClassIds: readonly string[];
    weekday: number;
    periodId: string;
    from: string;
  },
) {
  return endFrom(
    tx,
    input.tenantId,
    sql`m.class_id = any(${uuidArray(input.gridClassIds)}) and m.timetable_id = ${input.timetableId}::uuid
      and m.weekday = ${input.weekday} and m.class_period_id = ${input.periodId}::uuid`,
    input.from,
  );
}

/** Ends the meetings a placement takes a teacher or room from. */
export function endMeetings(
  tx: Tx,
  input: { tenantId: string; ids: readonly string[]; from: string },
) {
  if (input.ids.length === 0) return Promise.resolve(0);
  return endFrom(
    tx,
    input.tenantId,
    sql`m.id = any(${uuidArray(input.ids)})`,
    input.from,
  );
}

export async function insertMeeting(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    classId: string;
    yearId: string;
    timetableId: string;
    weekday: number;
    periodId: string;
    teacherId: string | null;
    roomId: string | null;
    from: string;
    endsBefore: string;
    clashAccepted: boolean;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.class_meetings
      (tenant_id, org_id, class_id, school_year_id, timetable_id,
       weekday, class_period_id, teacher_user_id, location_id, valid_during, clash_accepted)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.classId}::uuid,
            ${input.yearId}::uuid, ${input.timetableId}::uuid, ${input.weekday},
            ${input.periodId}::uuid, ${input.teacherId}::uuid, ${input.roomId}::uuid,
            daterange(${input.from}::date, ${input.endsBefore}::date, '[)'), ${input.clashAccepted})
    returning id`);
  if (!row) throw new Error("meeting not written");
  return row.id;
}

/** The classes a student is enrolled in on a day. */
export async function studentClasses(
  tx: Tx,
  input: { tenantId: string; studentId: string; on: string },
): Promise<string[]> {
  const rows = await tx.execute<{ class_id: string }>(sql`
    select distinct e.class_id from core.enrollments e
    where e.tenant_id = ${input.tenantId}::uuid and e.user_id = ${input.studentId}::uuid
      and e.role = 'student' and e.status = 'active' and e.valid_during @> ${input.on}::date`);
  return rows.map((row) => row.class_id);
}

export interface TeacherOption {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/** Everyone who teaches or assists a class of the year, for the picker. */
export async function yearTeachers(
  tx: Tx,
  input: { tenantId: string; schoolId: string; during: OpenSpan },
): Promise<TeacherOption[]> {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id, u.full_name_en, u.full_name_ar from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid
      and e.valid_during && ${rangeOf(input.during)}::daterange and e.status = 'active'
      and e.role in ('teacher', 'aide')
    order by u.full_name_en, u.id`);
  return rows.map((row) => ({
    userId: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}

export class TimetableConflict extends Error {
  constructor(readonly code: "conflict.version") {
    super(code);
  }
}

interface TimetableFields extends Cycle {
  nameEn: string | null;
  nameAr: string | null;
  startsOn: string;
}

export async function insertTimetable(
  tx: Tx,
  input: TimetableFields & {
    tenantId: string;
    schoolId: string;
    yearId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.timetables (tenant_id, org_id, school_year_id, name_en, name_ar, starts_on,
      cycle_kind, cycle_length, first_day, closures_move)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid,
      ${input.nameEn}, ${input.nameAr}, ${input.startsOn}::date, ${input.kind}, ${input.length},
      ${input.firstDay}, ${input.closuresMove})
    returning id`);
  if (!row) throw new Error("timetable not written");
  return row.id;
}

/**
 * The year's first timetable, an ordinary week from its first day, made
 * when a year that has none is first planned.
 */
export async function ensureTimetable(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    year: { id: string; startsOn: string };
  },
): Promise<void> {
  await tx.execute(sql`select app.lock(${`timetables:${input.year.id}`})`);
  const [held] = await tx.execute<{ held: boolean }>(sql`
    select exists (select 1 from core.timetables
      where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.year.id}::uuid
        and status = 'active') as held`);
  if (held?.held) return;
  await insertTimetable(tx, {
    tenantId: input.tenantId,
    schoolId: input.schoolId,
    yearId: input.year.id,
    nameEn: null,
    nameAr: null,
    startsOn: input.year.startsOn,
    ...WEEKLY,
  });
}

export async function updateTimetable(
  tx: Tx,
  input: TimetableFields & { tenantId: string; id: string; version: number },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.timetables
    set name_en = ${input.nameEn}, name_ar = ${input.nameAr}, starts_on = ${input.startsOn}::date,
        cycle_kind = ${input.kind}, cycle_length = ${input.length}, first_day = ${input.firstDay},
        closures_move = ${input.closuresMove}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and version = ${input.version}
    returning id`);
  if (rows.length === 0) throw new TimetableConflict("conflict.version");
}

/** Removes a timetable with its lessons; the one before it is followed in its place. */
export async function tombstoneTimetable(
  tx: Tx,
  input: { tenantId: string; id: string; version: number },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.timetables set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and version = ${input.version}
    returning id`);
  if (rows.length === 0) throw new TimetableConflict("conflict.version");
  await tx.execute(sql`
    update core.class_meetings set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and timetable_id = ${input.id}::uuid
      and status = 'active'`);
}

/** How many lessons a timetable places, whatever their dates. */
export async function timetableLessons(
  tx: Tx,
  input: { tenantId: string; ids: readonly string[] },
): Promise<Map<string, number>> {
  if (input.ids.length === 0) return new Map();
  const rows = await tx.execute<{ timetable_id: string; lessons: number }>(sql`
    select timetable_id, count(*)::int as lessons from core.class_meetings
    where tenant_id = ${input.tenantId}::uuid and timetable_id = any(${uuidArray(input.ids)})
      and status = 'active'
    group by timetable_id`);
  return new Map(rows.map((row) => [row.timetable_id, row.lessons]));
}

/**
 * Starts a timetable with the lessons another holds on its first day, each
 * moved to the days `days` gives for its day of the cycle.
 */
export async function copyMeetings(
  tx: Tx,
  input: {
    tenantId: string;
    fromId: string;
    toId: string;
    startsOn: string;
    days: (day: number) => number[];
  },
): Promise<number> {
  const pairs = Array.from({ length: MAX_CYCLE_DAY }, (_, index) => index + 1)
    .flatMap((day) => input.days(day).map((to) => [day, to] as const))
    .filter(([, to]) => to >= 1 && to <= MAX_CYCLE_DAY);
  if (pairs.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.class_meetings (tenant_id, org_id, class_id, school_year_id,
      timetable_id, weekday, class_period_id, teacher_user_id, location_id,
      valid_during, clash_accepted)
    select m.tenant_id, m.org_id, m.class_id, m.school_year_id, ${input.toId}::uuid,
      x.target, m.class_period_id, m.teacher_user_id, m.location_id,
      daterange(${input.startsOn}::date, upper(m.valid_during), '[)'), m.clash_accepted
    from core.class_meetings m
    join unnest(${smallints(pairs.map(([day]) => day))}::smallint[],
      ${smallints(pairs.map(([, to]) => to))}::smallint[]) as x(source, target)
      on x.source = m.weekday
    where m.tenant_id = ${input.tenantId}::uuid and m.timetable_id = ${input.fromId}::uuid
      and m.status = 'active' and m.valid_during @> ${input.startsOn}::date
    returning id`);
  return rows.length;
}
