import type { AttendanceMeaning } from "@faridalms/domain/attendance";

import {
  boardClasses,
  registersTakenOn,
} from "@faridalms/database/stores/attendance";
import { emptyCounts } from "@faridalms/domain/attendance";
import { addDays } from "@faridalms/domain/school";

import type { UnitContext } from "../core/context";
import type { RegisterPeriod } from "./plans";

import { dailyClassIds } from "./daily-registers";
import { lessonsOn, periodsOf, periodsOn } from "./plans";

const oneDay = (day: string) => ({ from: day, to: addDays(day, 1) });

/** A row of a day's board: a register owed or taken, by class and period. */
export interface BoardRow {
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  /** The class is owed the day's register every school day. */
  daily: boolean;
  kind: "day" | "period";
  /** The period it is taken in; "" for a register of the whole day, or a period no plan names. */
  periodId: string;
  periodNameEn: string | null;
  periodNameAr: string | null;
  periodSequence: number | null;
  registerId: string | null;
  state: "in_progress" | "submitted" | "not_started";
  recordedByNameEn: string | null;
  recordedByNameAr: string | null;
  submittedAt: string | null;
  students: number;
  counts: Record<AttendanceMeaning, number>;
}

/**
 * A school day's registers: the day's register of every class owed one, in
 * the official period where the day has one, every lesson that owes one,
 * and any other register taken that day, in the order of the day.
 */
export async function dayBoard(
  context: UnitContext,
  day: string,
): Promise<BoardRow[]> {
  const [periods, lessons, daily, taken] = await Promise.all([
    periodsOn(context, day),
    lessonsOn(context, day),
    dailyClassIds(context, oneDay(day)),
    registersTakenOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      day,
    }),
  ]);
  const takenPeriods = await periodsOf(
    context,
    taken.filter((row) => row.kind === "period").map((row) => row.registerId),
  );
  const official = periods.find((row) => row.official) ?? null;
  const dailySet = new Set(daily);
  type Slot = {
    classId: string;
    kind: "day" | "period";
    period: RegisterPeriod | null;
    register: (typeof taken)[number] | null;
  };
  const slots = new Map<string, Slot>();
  const periodOf = new Map(periods.map((row) => [row.id, row]));
  const add = (slot: Slot, key: string) => {
    const known = slots.get(key);
    slots.set(
      key,
      known ? { ...known, register: slot.register ?? known.register } : slot,
    );
  };
  for (const classId of daily)
    add(
      {
        classId,
        kind: official ? "period" : "day",
        period: official,
        register: null,
      },
      `${classId}:${official?.id ?? ""}`,
    );
  for (const lesson of lessons)
    add(
      {
        classId: lesson.classId,
        kind: "period",
        period: periodOf.get(lesson.periodId) ?? null,
        register: null,
      },
      `${lesson.classId}:${lesson.periodId}`,
    );
  for (const register of taken) {
    const period =
      register.kind === "period"
        ? (takenPeriods.get(register.registerId) ?? null)
        : null;
    add(
      { classId: register.classId, kind: register.kind, period, register },
      register.kind === "day"
        ? `${register.classId}:`
        : `${register.classId}:${period?.id ?? register.registerId}`,
    );
  }
  const classes = await boardClasses(context.tx, {
    tenantId: context.tenantId,
    classIds: [...new Set([...slots.values()].map((slot) => slot.classId))],
    day,
  });
  const order = (slot: Slot) =>
    slot.period ? periods.findIndex((row) => row.id === slot.period?.id) : -1;
  return [...slots.values()]
    .flatMap((slot) => {
      const row = classes.get(slot.classId);
      return row ? [{ slot, row }] : [];
    })
    .toSorted(
      (a, b) =>
        order(a.slot) - order(b.slot) ||
        (a.slot.period?.sequence ?? 0) - (b.slot.period?.sequence ?? 0) ||
        a.row.code.localeCompare(b.row.code),
    )
    .map(({ slot, row }) => ({
      classId: row.id,
      classCode: row.code,
      classTitleEn: row.titleEn,
      classTitleAr: row.titleAr,
      daily: dailySet.has(row.id),
      kind: slot.kind,
      periodId: slot.period?.id ?? "",
      periodNameEn: slot.period?.nameEn ?? null,
      periodNameAr: slot.period?.nameAr ?? null,
      periodSequence: slot.period?.sequence ?? null,
      registerId: slot.register?.registerId ?? null,
      state: slot.register?.state ?? "not_started",
      recordedByNameEn: slot.register?.recordedByNameEn ?? null,
      recordedByNameAr: slot.register?.recordedByNameAr ?? null,
      submittedAt: slot.register?.submittedAt ?? null,
      students: row.students,
      counts: slot.register?.counts ?? emptyCounts(),
    }));
}
