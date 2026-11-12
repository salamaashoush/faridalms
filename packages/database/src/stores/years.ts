import type { OpenSpan } from "@faridalms/domain/school";

import {
  addDays,
  spanHolds,
  teachingWeeks,
  weekdayOf,
} from "@faridalms/domain/school";
import {
  SCHOOL_DAY_MEANINGS,
  schoolDayCount,
} from "@faridalms/domain/school-days";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { YearLifecycle } from "../tables/calendar";

import { academicSessions, academicWeeks } from "../tables/calendar";
import { classYears } from "../tables/school-years";
import { classColumns, classOf, moveClassRuns } from "./classes";
import { markedMeanings, schoolWeek } from "./school-days";
import { bounds, isoOf, uuidArray } from "./sql";

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
      | "school_year.end_year_fixed"
      | "school_year.rows_outside_dates",
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
      (select count(*)::int from core.class_years k
        join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
        where k.tenant_id = y.tenant_id and k.school_year_id = y.id
          and k.status = 'active') as classes,
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

/**
 * A year's weeks, and its school days and closed school days, counted from
 * the school's week and the days it marked over the year's dates.
 */
export async function calendarSummary(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    year: { id: string; startsOn: string; endsBefore: string };
  },
): Promise<{ weeks: number; schoolDays: number; closedDays: number }> {
  const span = { from: input.year.startsOn, endsBefore: input.year.endsBefore };
  const [[row], week, marks] = await Promise.all([
    tx.execute<{ weeks: number }>(sql`
      select count(*)::int as weeks from core.academic_weeks w
      where w.tenant_id = ${input.tenantId}::uuid and w.school_year_id = ${input.year.id}::uuid
        and w.status = 'active'`),
    schoolWeek(tx, input.tenantId, input.schoolId),
    markedMeanings(tx, {
      tenantId: input.tenantId,
      schoolId: input.schoolId,
      from: span.from,
      to: addDays(span.endsBefore, -1),
    }),
  ]);
  return {
    weeks: row?.weeks ?? 0,
    schoolDays: schoolDayCount(week, span, (day) => marks.get(day) ?? null),
    closedDays: [...marks.values()].filter(
      (meaning) => !SCHOOL_DAY_MEANINGS.includes(meaning),
    ).length,
  };
}

/** The school days a year aims at, or null where it names none. */
export async function targetDays(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
): Promise<number | null> {
  const [row] = await tx.execute<{ target_days: number | null }>(sql`
    select target_days from core.academic_sessions
    where tenant_id = ${tenantId}::uuid and id = ${yearId}::uuid and type = 'school_year'`);
  return row?.target_days ?? null;
}

export async function setTargetDays(
  tx: CellTransaction,
  input: { tenantId: string; yearId: string; target: number | null },
) {
  await tx.execute(sql`
    update core.academic_sessions set target_days = ${input.target}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.yearId}::uuid
      and type = 'school_year' and status = 'active'`);
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
 * Brings the year's weeks and placements inside `[from, to)` before
 * its dates narrow. Setup rows wholly outside are tombstoned; a placement
 * wholly outside is real data, so it is left for `app.change_year_span` to
 * refuse.
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
  await tx.execute(sql`
    update core.student_school_years set valid_during = valid_during * ${span}
    where ${scope} and valid_during && ${span} and not ${span} @> valid_during`);
}

/**
 * After the year's dates widen, placements that ran to its old first or
 * last day run to the new one, as a student placed for the whole
 * year stays placed for the whole year.
 */
async function widenChildren(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
  before: { from: string; to: string },
  after: { from: string; to: string },
) {
  const scope = sql`tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid and status = 'active'`;
  if (after.to > before.to)
    await tx.execute(sql`
      update core.student_school_years
      set valid_during = daterange(lower(valid_during), ${after.to}::date, '[)')
      where ${scope} and upper(valid_during) = ${before.to}::date`);
  if (after.from < before.from)
    await tx.execute(sql`
      update core.student_school_years
      set valid_during = daterange(${after.from}::date, upper(valid_during), '[)')
      where ${scope} and lower(valid_during) = ${before.from}::date`);
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
  const week = await schoolWeek(tx, input.tenantId, input.schoolId);
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
 * new edges; widening extends the weeks and carries whole-year rows to the
 * new edges. The year's classes move with
 * it, and their enrollments with them. Real data that would fall wholly
 * outside is refused: a class's by `moveClassesWithYear`, the rest by
 * `app.change_year_span`.
 */
export async function updateYear(
  tx: CellTransaction,
  input: YearInput & {
    id: string;
    expectedVersion: number;
    /** Why a class moved with the year may not run over its new days, or null. */
    refusesRuns: (classId: string, runs: OpenSpan) => Promise<string | null>;
  },
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
  const classes = moved
    ? await moveClassesWithYear(tx, {
        tenantId: input.tenantId,
        yearId: input.id,
        before,
        after,
      })
    : [];
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
  for (const moving of classes)
    if (await input.refusesRuns(moving.classId, moving.runs))
      throw new YearChangeError("school_year.rows_outside_dates");
  if (!moved) return;
  const week = await schoolWeek(tx, input.tenantId, input.schoolId);
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

/**
 * Moves the year's classes to its new dates and their enrollments with them:
 * a class's edge that was the year's moves to the new one, and an edge past
 * the new dates is clipped to them, ending what runs past or starting late
 * what began before. A class with an active enrollment wholly outside the
 * new dates refuses the change, since that is a student's real days. A
 * class whose days had already left the year, as they may while the
 * module is off, is the year's no longer and does not move. Returns the
 * classes moved, with their new days, for the caller's guards.
 */
async function moveClassesWithYear(
  tx: CellTransaction,
  input: {
    tenantId: string;
    yearId: string;
    before: { from: string; to: string };
    after: { from: string; to: string };
  },
) {
  const { before, after } = input;
  const linked = await classesOfYear(tx, input.tenantId, input.yearId);
  const classes = [];
  const moved: { classId: string; runs: OpenSpan }[] = [];
  for (const row of linked)
    if (spanHolds(before, row.runs)) classes.push(row);
    else
      await tx.execute(sql`
        update core.class_years set status = 'tobedeleted'
        where tenant_id = ${input.tenantId}::uuid and class_id = ${row.id}::uuid and status = 'active'`);
  if (classes.length === 0) return moved;
  const [outside] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.enrollments e
      where e.tenant_id = ${input.tenantId}::uuid and e.status = 'active'
        and e.class_id = any(${uuidArray(classes.map((row) => row.id))})
        and not e.valid_during && ${range(after.from, after.to)}) as found`);
  if (outside?.found)
    throw new YearChangeError("school_year.rows_outside_dates");
  for (const row of classes) {
    const from =
      row.runs.from === before.from || row.runs.from < after.from
        ? after.from
        : row.runs.from;
    const to =
      row.runs.to === null ||
      row.runs.to === before.to ||
      row.runs.to > after.to
        ? after.to
        : row.runs.to;
    if (from >= to) throw new YearChangeError("school_year.rows_outside_dates");
    if (from === row.runs.from && to === row.runs.to) continue;
    moved.push({ classId: row.id, runs: { from, to } });
    if (from > row.runs.from)
      await tx.execute(sql`
        update core.enrollments set valid_during = daterange(${from}::date, upper(valid_during))
        where tenant_id = ${input.tenantId}::uuid and class_id = ${row.id}::uuid and status = 'active'
          and lower(valid_during) < ${from}::date`);
    await moveClassRuns(tx, {
      tenantId: input.tenantId,
      classId: row.id,
      before: row.runs,
      after: { from, to },
    });
  }
  return moved;
}

/** The classes linked to a year, whatever their dates. */
export async function classesOfYear(
  tx: CellTransaction,
  tenantId: string,
  yearId: string,
) {
  const rows = await tx.execute<Parameters<typeof classOf>[0]>(sql`
    select ${classColumns} from core.class_years k
    join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
    where k.tenant_id = ${tenantId}::uuid and k.school_year_id = ${yearId}::uuid and k.status = 'active'
    order by c.code`);
  return rows.map(classOf);
}

/** The year each of these classes is linked to, where it is linked to one. */
export async function yearsOfClasses(
  tx: CellTransaction,
  tenantId: string,
  classIds: readonly string[],
): Promise<Map<string, string>> {
  if (classIds.length === 0) return new Map();
  const rows = await tx.execute<{ class_id: string; school_year_id: string }>(
    sql`
    select class_id, school_year_id from core.class_years
    where tenant_id = ${tenantId}::uuid and class_id = any(${uuidArray([...classIds])})
      and status = 'active'`,
  );
  return new Map(rows.map((row) => [row.class_id, row.school_year_id]));
}

/** The year a class is linked to, or null. */
export async function yearOfClass(
  tx: CellTransaction,
  tenantId: string,
  classId: string,
): Promise<string | null> {
  return (await yearsOfClasses(tx, tenantId, [classId])).get(classId) ?? null;
}

/**
 * Puts a class in a year, in place of any it was in, or in none. The
 * caller has checked the year is open and holds the class's dates.
 */
export async function linkClass(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    classId: string;
    yearId: string | null;
  },
) {
  const current = await yearOfClass(tx, input.tenantId, input.classId);
  if (current === input.yearId) return;
  if (current)
    await tx.execute(sql`
      update core.class_years set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
        and status = 'active'`);
  if (input.yearId)
    await tx.insert(classYears).values({
      tenantId: input.tenantId,
      orgId: input.schoolId,
      classId: input.classId,
      schoolYearId: input.yearId,
    });
}

/** Whether a year's dates hold a span of days. */
export const yearHolds = (
  year: { startsOn: string; endsBefore: string },
  span: OpenSpan,
) => spanHolds({ from: year.startsOn, to: year.endsBefore }, span);

/** Whether the school has a current or coming year with its terms, the setup step the year makes. */
export async function yearReady(
  tx: CellTransaction,
  input: { tenantId: string; orgId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.academic_sessions y
      join core.academic_sessions t on t.tenant_id = y.tenant_id and t.school_year_id = y.id
        and t.type = 'term' and t.status = 'active'
      where y.tenant_id = ${input.tenantId}::uuid and y.org_id = ${input.orgId}::uuid
        and y.type = 'school_year' and y.status = 'active'
        and y.lifecycle in ('current', 'upcoming')) as found`);
  return row?.found ?? false;
}
