import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import { addDays, teachingWeeks, weekdayOf } from "@faridalms/domain/school";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { YearLifecycle } from "../tables/calendar";

import {
  academicSessions,
  academicWeeks,
  calendarDates,
  calendars,
} from "../tables/calendar";
import { bounds, isoOf, textArray } from "./sql";

export interface SchoolYear {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsBefore: string;
  schoolYear: number;
  lifecycle: YearLifecycle;
  version: number;
  /** When families were asked whether their children return the year after. */
  reenrolmentOpenedAt: string | null;
}

export async function schoolYears(
  tx: CellTransaction,
  tenantId: string,
  schoolId: string,
): Promise<SchoolYear[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    span: string;
    school_year: number;
    lifecycle: YearLifecycle;
    version: number;
    reenrolment_opened_at: string | null;
  }>(sql`
    select id, title_en, title_ar, span::text as span, school_year, lifecycle, version,
      ${isoOf(sql`reenrolment_opened_at`)} as reenrolment_opened_at
    from core.academic_sessions
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid
      and type = 'school_year' and status = 'active'
    order by lower(span) desc`);
  return rows.map((row) => {
    const { from, to } = bounds(row.span);
    return {
      id: row.id,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      startsOn: from,
      endsBefore: to ?? from,
      schoolYear: row.school_year,
      lifecycle: row.lifecycle,
      version: row.version,
      reenrolmentOpenedAt: row.reenrolment_opened_at,
    };
  });
}

/**
 * The year a list shows by default: the current one, or when a school has
 * none marked current, the year whose dates hold today, else the latest.
 */
export function workingYear(years: SchoolYear[], today: string) {
  return (
    years.find((year) => year.lifecycle === "current") ??
    years.find((year) => year.startsOn <= today && today < year.endsBefore) ??
    years[0] ??
    null
  );
}

/** The day a year is read on: today inside it, else its first or last day. */
export function dayIn(
  year: { startsOn: string; endsBefore: string },
  today: string,
) {
  if (today < year.startsOn) return year.startsOn;
  if (today < year.endsBefore) return today;
  const last = new Date(`${year.endsBefore}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  return last.toISOString().slice(0, 10);
}

export class YearChangeError extends Error {
  constructor(
    public readonly code:
      | "conflict.version"
      | "school_year.closed"
      | "school_year.end_year_fixed",
  ) {
    super(code);
  }
}

/**
 * The year's lifecycle, holding the row against a concurrent lifecycle change
 * until the caller's transaction ends, so a write never lands in a year that
 * closed while it ran. Null when the year does not exist.
 */
export async function holdYear(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<YearLifecycle | null> {
  const [row] = await tx.execute<{ lifecycle: YearLifecycle }>(sql`
    select lifecycle from core.academic_sessions
    where tenant_id = ${tenantId}::uuid and id = ${yearId}::uuid
      and type = 'school_year' and status = 'active'
    for share`);
  return row?.lifecycle ?? null;
}

export interface YearSummary extends SchoolYear {
  terms: number;
  classes: number;
  students: number;
}

export async function yearDirectory(
  tx: CellTransaction,
  tenantId: string,
  schoolId: string,
  today: string,
): Promise<YearSummary[]> {
  const years = await schoolYears(tx, tenantId, schoolId);
  if (years.length === 0) return [];
  const counts = await tx.execute<{
    id: string;
    terms: number;
    classes: number;
    students: number;
  }>(sql`
    select y.id,
      (select count(*)::int from core.academic_sessions t
        where t.tenant_id = y.tenant_id and t.school_year_id = y.id and t.type = 'term'
          and t.status = 'active') as terms,
      (select count(*)::int from core.classes c
        where c.tenant_id = y.tenant_id and c.school_year_id = y.id and c.class_type = 'homeroom'
          and c.status = 'active') as classes,
      (select count(distinct r.student_user_id)::int from core.student_school_years r
        where r.tenant_id = y.tenant_id and r.school_year_id = y.id and r.status = 'active'
          and r.valid_during @> least(greatest(${today}::date, lower(y.span)), upper(y.span) - 1)) as students
    from core.academic_sessions y
    where y.tenant_id = ${tenantId}::uuid and y.org_id = ${schoolId}::uuid
      and y.type = 'school_year' and y.status = 'active'`);
  const byId = new Map(counts.map((row) => [row.id, row]));
  return years.map((year) => ({
    ...year,
    terms: byId.get(year.id)?.terms ?? 0,
    classes: byId.get(year.id)?.classes ?? 0,
    students: byId.get(year.id)?.students ?? 0,
  }));
}

export interface TermRow {
  id: string;
  version: number;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsBefore: string;
  sequence: number;
}

export async function termsOf(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<TermRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    title_en: string | null;
    title_ar: string | null;
    span: string;
    sequence: number;
  }>(sql`
    select id, version, title_en, title_ar, span::text as span, sequence
    from core.academic_sessions
    where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and type = 'term' and status = 'active'
    order by lower(span)`);
  return rows.map((row) => {
    const { from, to } = bounds(row.span);
    return {
      id: row.id,
      version: row.version,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      startsOn: from,
      endsBefore: to ?? from,
      sequence: row.sequence,
    };
  });
}

export async function calendarSummary(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<{ weeks: number; schoolDays: number; closedDays: number }> {
  const [row] = await tx.execute<{
    weeks: number;
    school_days: number;
    closed_days: number;
  }>(sql`
    select
      (select count(*)::int from core.academic_weeks w
        where w.tenant_id = ${tenantId}::uuid and w.school_year_id = ${yearId}::uuid
          and w.status = 'active') as weeks,
      (select count(*)::int from core.calendar_dates d
        join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
        where d.tenant_id = ${tenantId}::uuid and d.school_year_id = ${yearId}::uuid
          and d.status = 'active' and e.system_meaning = any(${textArray(SCHOOL_DAY_MEANINGS)})) as school_days,
      (select count(*)::int from core.calendar_dates d
        join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
        where d.tenant_id = ${tenantId}::uuid and d.school_year_id = ${yearId}::uuid
          and d.status = 'active' and e.system_meaning <> 'weekend'
          and not e.system_meaning = any(${textArray(SCHOOL_DAY_MEANINGS)})) as closed_days`);
  return {
    weeks: row?.weeks ?? 0,
    schoolDays: row?.school_days ?? 0,
    closedDays: row?.closed_days ?? 0,
  };
}

export interface CalendarDay {
  day: string;
  meaning: string;
  noteEn: string | null;
  noteAr: string | null;
  provisional: boolean;
}

/** Every day of a year's school calendar with what it is, and the count it aims at. */
export async function yearCalendar(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<{ targetDays: number | null; days: CalendarDay[] }> {
  const [calendar] = await tx.execute<{ target_days: number | null }>(sql`
    select target_days from core.calendars
    where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and kind = 'school' and status = 'active'`);
  return {
    targetDays: calendar?.target_days ?? null,
    days: await calendarDays(tx, { tenantId, yearId }),
  };
}

/** What the school calendar marks each day as, the whole year or `[from, to]`. */
export async function calendarDays(
  tx: CellTransaction,
  input: { tenantId: string; yearId: string; from?: string; to?: string },
): Promise<CalendarDay[]> {
  const range =
    input.from && input.to
      ? sql`and d.day_on between ${input.from}::date and ${input.to}::date`
      : sql``;
  const rows = await tx.execute<{
    day: string;
    meaning: string;
    note_en: string | null;
    note_ar: string | null;
    provisional: boolean;
  }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day, e.system_meaning as meaning,
           d.note_en, d.note_ar, d.provisional
    from core.calendar_dates d
    join core.calendars c on c.tenant_id = d.tenant_id and c.id = d.calendar_id
      and c.kind = 'school' and c.status = 'active'
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and d.school_year_id = ${input.yearId}::uuid
      and d.status = 'active' ${range}
    order by d.day_on`);
  return rows.map((row) => ({
    day: row.day,
    meaning: row.meaning,
    noteEn: row.note_en,
    noteAr: row.note_ar,
    provisional: row.provisional,
  }));
}

/**
 * Marks the school calendar's days in `[from, to]` as one kind, returning how
 * many changed. Weekends stay weekends except for a make-up day, and `normal`
 * returns each day to a school day or weekend by the school's week.
 */
export async function paintDays(
  tx: CellTransaction,
  input: {
    tenantId: string;
    yearId: string;
    from: string;
    to: string;
    kind: string;
    noteEn: string | null;
    noteAr: string | null;
    provisional: boolean;
    weekendDays: number[];
  },
): Promise<number> {
  const normal = input.kind === "normal";
  const meanings = normal ? ["instructional_day", "weekend"] : [input.kind];
  const found = await tx.execute<{ id: string; meaning: string }>(sql`
    select distinct on (system_meaning) id, system_meaning as meaning from core.descriptors
    where tenant_id = ${input.tenantId}::uuid and namespace = 'calendar_event'
      and system_meaning = any(${textArray(meanings)}) and status = 'active'
    order by system_meaning, org_id nulls first`);
  const idOf = new Map(found.map((row) => [row.meaning, row.id]));
  const target = normal
    ? sql`case when extract(isodow from d.day_on)::int = any(${`{${input.weekendDays.join(",")}}`}::int[])
        then ${idOf.get("weekend") ?? null}::uuid else ${idOf.get("instructional_day") ?? null}::uuid end`
    : sql`${idOf.get(input.kind) ?? null}::uuid`;
  if (meanings.some((meaning) => !idOf.has(meaning)))
    throw new Error(`calendar day descriptor missing for ${input.kind}`);
  const rows = await tx.execute<{ id: string }>(sql`
    update core.calendar_dates d
    set event_descriptor_id = ${target},
        note_en = ${normal ? null : input.noteEn || null},
        note_ar = ${normal ? null : input.noteAr || null},
        provisional = ${!normal && input.provisional}
    from core.calendars c, core.descriptors e
    where d.tenant_id = ${input.tenantId}::uuid and d.school_year_id = ${input.yearId}::uuid
      and d.status = 'active' and d.day_on between ${input.from}::date and ${input.to}::date
      and c.tenant_id = d.tenant_id and c.id = d.calendar_id and c.kind = 'school' and c.status = 'active'
      and e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
      and (${normal || input.kind === "make_up_day"} or e.system_meaning <> 'weekend')
    returning d.id`);
  return rows.length;
}

export async function setTargetDays(
  tx: CellTransaction,
  input: { tenantId: string; yearId: string; target: number | null },
) {
  await tx.execute(sql`
    update core.calendars set target_days = ${input.target}
    where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.yearId}::uuid
      and kind = 'school' and status = 'active'`);
}

export interface SchoolWeek {
  weekStart: number;
  weekendDays: number[];
}

export async function schoolWeek(
  tx: CellTransaction,
  tenantId: string,
  schoolId: string,
): Promise<SchoolWeek> {
  const [row] = await tx.execute<{
    week_start: number;
    weekend_days: number[];
  }>(sql`
    select week_start, weekend_days from core.orgs
    where tenant_id = ${tenantId}::uuid and id = ${schoolId}::uuid`);
  return {
    weekStart: row?.week_start ?? 7,
    weekendDays: row?.weekend_days ?? [5, 6],
  };
}

const isoWeekday = (day: string) => weekdayOf(day) || 7;

async function calendarEvents(tx: CellTransaction, tenantId: string) {
  const rows = await tx.execute<{ id: string; code_value: string }>(sql`
    select distinct on (code_value) id, code_value from core.descriptors
    where tenant_id = ${tenantId}::uuid and namespace = 'calendar_event'
      and code_value in ('instructional_day', 'weekend') and status = 'active'
    order by code_value, org_id nulls first`);
  const byCode = new Map(rows.map((row) => [row.code_value, row.id]));
  const instructional = byCode.get("instructional_day");
  const weekend = byCode.get("weekend");
  if (!instructional || !weekend)
    throw new Error("calendar event descriptors are missing");
  return { instructional, weekend };
}

/**
 * Marks each day of `[from, to)` on the year's school calendar as a school day
 * or a weekend. Holidays are set on the calendar afterwards.
 */
async function fillCalendar(
  tx: CellTransaction,
  input: {
    tenantId: string;
    calendarId: string;
    yearId: string;
    from: string;
    to: string;
    weekendDays: number[];
  },
) {
  if (input.from >= input.to) return;
  const events = await calendarEvents(tx, input.tenantId);
  const days: (typeof calendarDates.$inferInsert)[] = [];
  for (let day = input.from; day < input.to; day = addDays(day, 1))
    days.push({
      tenantId: input.tenantId,
      calendarId: input.calendarId,
      schoolYearId: input.yearId,
      dayOn: day,
      eventDescriptorId: input.weekendDays.includes(isoWeekday(day))
        ? events.weekend
        : events.instructional,
    });
  for (let index = 0; index < days.length; index += 200)
    await tx.insert(calendarDates).values(days.slice(index, index + 200));
}

const weekLabel = (number: number) => ({
  labelEn: `Week ${number}`,
  labelAr: `الأسبوع ${number}`,
});

interface WeekRow {
  id: string;
  number: number;
  startsOn: string;
  endsBefore: string;
}

async function weeksOf(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<WeekRow[]> {
  const rows = await tx.execute<{ id: string; number: number; span: string }>(
    sql`
    select id, number, span::text as span from core.academic_weeks
    where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and status = 'active'
    order by lower(span)`,
  );
  return rows.map((row) => {
    const { from, to } = bounds(row.span);
    return {
      id: row.id,
      number: row.number,
      startsOn: from,
      endsBefore: to ?? from,
    };
  });
}

async function setWeekNumber(
  tx: CellTransaction,
  tenantId: string,
  id: string,
  number: number,
) {
  const label = weekLabel(number);
  await tx.execute(sql`
    update core.academic_weeks
    set number = ${number}, label_en = ${label.labelEn}, label_ar = ${label.labelAr}
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`);
}

/**
 * Numbers the year's weeks from `first` in date order. Numbers are unique
 * among active weeks and checked row by row, so a shift up runs from the last
 * week and a shift down from the first.
 */
async function renumberWeeks(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
  first = 1,
) {
  const weeks = await weeksOf(tx, tenantId, yearId);
  const moves = weeks
    .map((week, index) => ({
      id: week.id,
      from: week.number,
      to: first + index,
    }))
    .filter((move) => move.from !== move.to);
  const up = moves.filter((move) => move.to > move.from).toReversed();
  const down = moves.filter((move) => move.to < move.from);
  for (const move of [...down, ...up])
    await setWeekNumber(tx, tenantId, move.id, move.to);
}

async function insertWeeks(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
  weeks: { number: number; startsOn: string; endsOn: string }[],
) {
  if (weeks.length === 0) return;
  await tx.insert(academicWeeks).values(
    weeks.map((week) => ({
      tenantId,
      schoolYearId: yearId,
      number: week.number,
      span: `[${week.startsOn},${addDays(week.endsOn, 1)})`,
      ...weekLabel(week.number),
    })),
  );
}

const earliest = (a: string, b: string) => (a < b ? a : b);
const latest = (a: string, b: string) => (a > b ? a : b);

function weekStartOf(day: string, weekStart: number) {
  return addDays(day, -((weekdayOf(day) - (weekStart % 7) + 7) % 7));
}

/**
 * Covers the year's days of `[from, to)` that no week holds yet. The weeks at
 * either edge are first completed up to the school's week boundary, never past
 * seven days, so extending a year leaves no short week in the middle; existing
 * weeks keep their ids.
 */
async function coverWeeks(
  tx: CellTransaction,
  input: {
    tenantId: string;
    yearId: string;
    from: string;
    to: string;
    weekStart: number;
  },
) {
  const { tenantId, yearId, from, to, weekStart } = input;
  let weeks = await weeksOf(tx, tenantId, yearId);
  const last = weeks.at(-1);
  if (!last) {
    await insertWeeks(
      tx,
      tenantId,
      yearId,
      teachingWeeks(from, addDays(to, -1), 1, weekStart),
    );
    return;
  }
  if (to > last.endsBefore) {
    const boundary = latest(
      last.endsBefore,
      addDays(weekStartOf(last.startsOn, weekStart), 7),
    );
    const edge = earliest(boundary, to);
    if (edge > last.endsBefore)
      await tx.execute(sql`
        update core.academic_weeks set span = daterange(lower(span), ${edge}::date, '[)')
        where tenant_id = ${tenantId}::uuid and id = ${last.id}::uuid`);
    if (edge < to)
      await insertWeeks(
        tx,
        tenantId,
        yearId,
        teachingWeeks(edge, addDays(to, -1), last.number + 1, weekStart),
      );
  }
  weeks = await weeksOf(tx, tenantId, yearId);
  const first = weeks[0];
  if (first && from < first.startsOn) {
    const boundary = earliest(
      first.startsOn,
      latest(
        weekStartOf(first.startsOn, weekStart),
        addDays(first.endsBefore, -7),
      ),
    );
    const edge = latest(boundary, from);
    if (edge < first.startsOn)
      await tx.execute(sql`
        update core.academic_weeks set span = daterange(${edge}::date, upper(span), '[)')
        where tenant_id = ${tenantId}::uuid and id = ${first.id}::uuid`);
    if (from < edge) {
      const added = teachingWeeks(from, addDays(edge, -1), 1, weekStart);
      await renumberWeeks(tx, tenantId, yearId, added.length + 1);
      await insertWeeks(tx, tenantId, yearId, added);
    }
  }
}

const range = (from: string, to: string) =>
  sql`daterange(${from}::date, ${to}::date, '[)')`;

/**
 * Brings the year's weeks, periods, placements and class enrollments inside
 * `[from, to)` before its dates narrow. Setup rows wholly outside are
 * tombstoned; a placement or enrollment wholly outside is real data, so it is
 * left for `app.change_year_span` to refuse.
 */
async function narrowChildren(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
  from: string,
  to: string,
) {
  const span = range(from, to);
  const scope = sql`tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid and status = 'active'`;
  await tx.execute(sql`
    update core.academic_weeks set status = 'tobedeleted'
    where ${scope} and not span && ${span}`);
  await tx.execute(sql`
    update core.academic_weeks set span = span * ${span}
    where ${scope} and span && ${span} and not ${span} @> span`);
  await renumberWeeks(tx, tenantId, yearId);
  await Promise.all(
    [sql`core.class_periods`, sql`core.class_meetings`].map((table) =>
      tx.execute(sql`
        update ${table} set status = 'tobedeleted'
        where ${scope} and not valid_during && ${span}`),
    ),
  );
  for (const table of [
    sql`core.class_periods`,
    sql`core.class_meetings`,
    sql`core.student_school_years`,
    sql`core.enrollments`,
  ])
    await tx.execute(sql`
      update ${table} set valid_during = valid_during * ${span}
      where ${scope} and valid_during && ${span} and not ${span} @> valid_during`);
}

/**
 * After the year's dates widen, periods, placements and enrollments that ran
 * to its old first or last day run to the new one, as a student placed for
 * the whole year stays placed for the whole year.
 */
async function widenChildren(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
  before: { from: string; to: string },
  after: { from: string; to: string },
) {
  const scope = sql`tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid and status = 'active'`;
  for (const table of [
    sql`core.class_periods`,
    sql`core.class_meetings`,
    sql`core.student_school_years`,
    sql`core.enrollments`,
  ]) {
    if (after.to > before.to)
      await tx.execute(sql`
        update ${table} set valid_during = daterange(lower(valid_during), ${after.to}::date, '[)')
        where ${scope} and upper(valid_during) = ${before.to}::date`);
    if (after.from < before.from)
      await tx.execute(sql`
        update ${table} set valid_during = daterange(${after.from}::date, upper(valid_during), '[)')
        where ${scope} and lower(valid_during) = ${before.from}::date`);
  }
}

export interface TermInput {
  id?: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsOn: string;
}

const intersect = (
  a: { from: string; to: string },
  b: { from: string; to: string },
) => {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from < to ? { from, to } : null;
};

async function tombstoneTerm(
  tx: CellTransaction,
  tenantId: string,
  id: string,
) {
  await tx.execute(sql`
    update core.academic_sessions set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`);
}

async function setTerm(
  tx: CellTransaction,
  tenantId: string,
  id: string,
  term: { titleEn: string | null; titleAr: string | null; sequence: number },
  span: { from: string; to: string },
) {
  await tx.execute(sql`
    update core.academic_sessions
    set title_en = ${term.titleEn}, title_ar = ${term.titleAr}, sequence = ${term.sequence},
        span = ${range(span.from, span.to)}
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`);
}

/**
 * Replaces a year's terms in two steps around a change of its dates. A term
 * must lie inside its year and apart from its siblings at every statement, so
 * each kept term first shrinks to the part of its new dates it already
 * covers, and grows to the rest once the year's dates and the other terms
 * have moved. A term whose new dates share no day with its old ones is
 * replaced by a new row.
 */
async function prepareTerms(
  tx: CellTransaction,
  input: { tenantId: string; yearId: string; terms: TermInput[] },
) {
  const existing = await termsOf(tx, input.tenantId, input.yearId);
  const ordered = input.terms.toSorted((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  const kept = new Set(ordered.flatMap((term) => (term.id ? [term.id] : [])));
  for (const term of existing)
    if (!kept.has(term.id)) await tombstoneTerm(tx, input.tenantId, term.id);
  const grow: { id: string; sequence: number; term: TermInput }[] = [];
  const add: { sequence: number; term: TermInput }[] = [];
  for (const [index, term] of ordered.entries()) {
    const sequence = index + 1;
    const current = existing.find((row) => row.id === term.id);
    const target = { from: term.startsOn, to: addDays(term.endsOn, 1) };
    const shared = current
      ? intersect(target, { from: current.startsOn, to: current.endsBefore })
      : null;
    if (!current || !shared) {
      if (current) await tombstoneTerm(tx, input.tenantId, current.id);
      add.push({ sequence, term });
      continue;
    }
    await setTerm(
      tx,
      input.tenantId,
      current.id,
      { ...term, sequence },
      shared,
    );
    grow.push({ id: current.id, sequence, term });
  }
  return async (year: { schoolId: string; schoolYear: number }) => {
    for (const { id, sequence, term } of grow)
      await setTerm(
        tx,
        input.tenantId,
        id,
        { ...term, sequence },
        { from: term.startsOn, to: addDays(term.endsOn, 1) },
      );
    if (add.length > 0)
      await tx.insert(academicSessions).values(
        add.map(({ sequence, term }) => ({
          tenantId: input.tenantId,
          orgId: year.schoolId,
          type: "term" as const,
          parentId: input.yearId,
          parentType: "school_year" as const,
          schoolYearId: input.yearId,
          titleEn: term.titleEn,
          titleAr: term.titleAr,
          span: `[${term.startsOn},${addDays(term.endsOn, 1)})`,
          schoolYear: year.schoolYear,
          sequence,
        })),
      );
  };
}

export interface YearInput {
  tenantId: string;
  schoolId: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsOn: string;
  terms: TermInput[];
}

const endYear = (endsOn: string) => Number(endsOn.slice(0, 4));

export async function createYear(
  tx: CellTransaction,
  input: YearInput,
): Promise<{ id: string }> {
  await tx.execute(sql`select app.lock('school_years')`);
  const to = addDays(input.endsOn, 1);
  const [{ id } = { id: null }] = await tx.execute<{ id: string }>(
    sql`select uuidv7() as id`,
  );
  if (!id) throw new Error("no id for the school year");
  const year = { id };
  await tx.insert(academicSessions).values({
    tenantId: input.tenantId,
    id,
    orgId: input.schoolId,
    type: "school_year",
    schoolYearId: id,
    titleEn: input.titleEn,
    titleAr: input.titleAr,
    span: `[${input.startsOn},${to})`,
    schoolYear: endYear(input.endsOn),
    lifecycle: "upcoming",
  });
  const finish = await prepareTerms(tx, {
    tenantId: input.tenantId,
    yearId: year.id,
    terms: input.terms,
  });
  await finish({ schoolId: input.schoolId, schoolYear: endYear(input.endsOn) });
  const [calendar] = await tx
    .insert(calendars)
    .values({
      tenantId: input.tenantId,
      orgId: input.schoolId,
      schoolYearId: year.id,
      code: "school",
      kind: "school",
      titleEn: "School calendar",
      titleAr: "التقويم المدرسي",
    })
    .returning({ id: calendars.id });
  if (!calendar) throw new Error("school calendar was not created");
  const week = await schoolWeek(tx, input.tenantId, input.schoolId);
  await fillCalendar(tx, {
    tenantId: input.tenantId,
    calendarId: calendar.id,
    yearId: year.id,
    from: input.startsOn,
    to,
    weekendDays: week.weekendDays,
  });
  await coverWeeks(tx, {
    tenantId: input.tenantId,
    yearId: year.id,
    from: input.startsOn,
    to,
    weekStart: week.weekStart,
  });
  return year;
}

/**
 * Changes a year's names, dates and terms. Narrowing clips what crosses the
 * new edges; widening marks the new days on the calendar, extends the weeks
 * and carries whole-year rows to the new edges. `app.change_year_span`
 * refuses when real data would fall outside.
 */
export async function updateYear(
  tx: CellTransaction,
  input: YearInput & { id: string; expectedVersion: number },
): Promise<void> {
  await tx.execute(sql`select app.lock('school_years')`);
  const [row] = await tx.execute<{
    version: number;
    lifecycle: YearLifecycle;
    span: string;
    school_year: number;
  }>(sql`
    select version, lifecycle, span::text as span, school_year from core.academic_sessions
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and id = ${input.id}::uuid and type = 'school_year' and status = 'active'
    for update`);
  if (!row) throw new YearChangeError("conflict.version");
  if (row.version !== input.expectedVersion)
    throw new YearChangeError("conflict.version");
  if (row.lifecycle === "closed")
    throw new YearChangeError("school_year.closed");
  // Every term and placement key carries the calendar year the school year
  // ends in, so a year cannot move its end into another one.
  if (endYear(input.endsOn) !== row.school_year)
    throw new YearChangeError("school_year.end_year_fixed");
  const current = bounds(row.span);
  const before = { from: current.from, to: current.to ?? current.from };
  const after = { from: input.startsOn, to: addDays(input.endsOn, 1) };
  const finish = await prepareTerms(tx, {
    tenantId: input.tenantId,
    yearId: input.id,
    terms: input.terms,
  });
  const moved = before.from !== after.from || before.to !== after.to;
  if (moved) {
    await narrowChildren(tx, input.tenantId, input.id, after.from, after.to);
    await tx.execute(sql`
      select app.change_year_span(${input.id}::uuid, ${range(after.from, after.to)}, ${row.version})`);
    await widenChildren(tx, input.tenantId, input.id, before, after);
  }
  await tx.execute(sql`
    update core.academic_sessions set title_en = ${input.titleEn}, title_ar = ${input.titleAr}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  await finish({ schoolId: input.schoolId, schoolYear: row.school_year });
  if (!moved) return;
  const [calendar] = await tx.execute<{ id: string }>(sql`
    select id from core.calendars
    where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.id}::uuid
      and kind = 'school' and status = 'active'`);
  const week = await schoolWeek(tx, input.tenantId, input.schoolId);
  if (calendar)
    for (const gap of [
      { from: after.from, to: before.from < after.to ? before.from : after.to },
      { from: before.to > after.from ? before.to : after.from, to: after.to },
    ])
      await fillCalendar(tx, {
        tenantId: input.tenantId,
        calendarId: calendar.id,
        yearId: input.id,
        ...gap,
        weekendDays: week.weekendDays,
      });
  await coverWeeks(tx, {
    tenantId: input.tenantId,
    yearId: input.id,
    ...after,
    weekStart: week.weekStart,
  });
}

/**
 * Moves a year to `to`. Making a year current closes the one it replaces,
 * whose id comes back for the audit trail; the caller has checked the step
 * is allowed from the lifecycle it read.
 */
export async function setYearLifecycle(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    expectedVersion: number;
    to: YearLifecycle;
  },
): Promise<{ replaced: string | null }> {
  await tx.execute(sql`select app.lock('school_years')`);
  let replaced: string | null = null;
  if (input.to === "current") {
    const [current] = await tx.execute<{ id: string }>(sql`
      update core.academic_sessions set lifecycle = 'closed'
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
        and type = 'school_year' and lifecycle = 'current' and status = 'active'
        and id <> ${input.yearId}::uuid
      returning id`);
    replaced = current?.id ?? null;
  }
  const [row] = await tx.execute<{ id: string }>(sql`
    update core.academic_sessions set lifecycle = ${input.to}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and id = ${input.yearId}::uuid and type = 'school_year' and status = 'active'
      and version = ${input.expectedVersion}
    returning id`);
  if (!row) throw new YearChangeError("conflict.version");
  return { replaced };
}

export interface ObjectEvent {
  id: string;
  occurredAt: string;
  action: string;
  actorNameEn: string | null;
  actorNameAr: string | null;
  reason: string | null;
}

export async function objectHistory(
  tx: CellTransaction,
  tenantId: string,
  objectType: string,
  objectId: string,
  limit: number,
): Promise<ObjectEvent[]> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    actor_en: string | null;
    actor_ar: string | null;
    reason: string | null;
  }>(sql`
    select l.id, l.occurred_at::text as occurred_at, l.action,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar,
           p.after ->> 'reason' as reason
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    left join audit.payloads p on p.tenant_id = l.tenant_id and p.event_id = l.id
      and p.occurred_at = l.occurred_at
    where l.tenant_id = ${tenantId}::uuid and l.object_type = ${objectType}
      and l.object_id = ${objectId}::uuid
    order by l.occurred_at desc, l.id desc
    limit ${limit}`);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action,
    actorNameEn: row.actor_en,
    actorNameAr: row.actor_ar,
    reason: row.reason,
  }));
}
