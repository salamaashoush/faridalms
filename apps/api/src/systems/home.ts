import type { PeriodRow } from "@faridalms/database/stores/attendance";
import type { MeetingRow } from "@faridalms/database/stores/timetable";
import type { AttendanceCounts } from "@faridalms/domain/attendance";

import {
  managedAnnouncements,
  feedOf,
} from "@faridalms/database/stores/announcements";
import {
  absencesBetween,
  absentUnexplainedOn,
  attendanceReport,
  dayBoard,
  periodsOn,
  studentAttendance,
} from "@faridalms/database/stores/attendance";
import { reachOf } from "@faridalms/database/stores/audiences";
import {
  classesTaughtBy,
  homeroomDirectory,
} from "@faridalms/database/stores/classes";
import {
  learnerAssignments,
  teacherAssignments,
} from "@faridalms/database/stores/coursework";
import { eventsBetween } from "@faridalms/database/stores/events";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { studentModules } from "@faridalms/database/stores/learning";
import { threadsOf, unreadThreads } from "@faridalms/database/stores/messages";
import {
  editionsFor,
  managedNewsletters,
} from "@faridalms/database/stores/newsletters";
import { deliveryLog } from "@faridalms/database/stores/notifications";
import { childrenOf } from "@faridalms/database/stores/persons";
import {
  studentDirectory,
  youngStudents,
} from "@faridalms/database/stores/students";
import {
  meetingsOn,
  studentGroups,
} from "@faridalms/database/stores/timetable";
import {
  schoolYears,
  workingYear,
  yearDirectory,
} from "@faridalms/database/stores/years";
import { ATTENDANCE_MEANINGS, summarise } from "@faridalms/domain/attendance";
import { GRACE_MS, learnerState } from "@faridalms/domain/coursework";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { can, readProcedure, requireCapability } from "../core/procedure";

const scopeOf = (context: UnitContext) => ({
  tenantId: context.tenantId,
  schoolId: context.schoolId,
  today: context.today,
  viewerId: context.actor.userId,
  schoolWide: can(context, "classes:manage"),
});

async function yearOf(context: UnitContext) {
  return workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
}

/** The school's wall clock now, `HH:MM`, to say which period is on and which is next. */
async function clockOf(context: UnitContext): Promise<string> {
  const profile = await schoolProfile(context.tx, context.schoolId);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: profile?.timeZone ?? "UTC",
  }).format(context.now);
}

interface Slot {
  periodId: string;
  periodCode: string;
  periodNameEn: string | null;
  periodNameAr: string | null;
  startTime: string | null;
  endTime: string | null;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  roomCode: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  /** Whether this is the lesson on now, or the next one today. */
  when: "now" | "next" | null;
  register: "not_started" | "in_progress" | "submitted" | null;
}

/**
 * A day's lessons in period order, with the one on now and the next one
 * marked from the school's own clock.
 */
function slotsOf(
  meetings: MeetingRow[],
  periods: PeriodRow[],
  clock: string,
  registerOf: (classId: string, periodId: string) => Slot["register"],
): Slot[] {
  const byId = new Map(periods.map((period) => [period.id, period]));
  const slots = meetings
    .flatMap((meeting) => {
      const period = byId.get(meeting.periodId);
      if (!period) return [];
      return [
        {
          periodId: period.id,
          periodCode: period.code,
          periodNameEn: period.nameEn,
          periodNameAr: period.nameAr,
          startTime: period.startTime,
          endTime: period.endTime,
          classId: meeting.classId,
          classCode: meeting.classCode,
          classTitleEn: meeting.classTitleEn,
          classTitleAr: meeting.classTitleAr,
          roomCode: meeting.roomCode,
          teacherNameEn: meeting.teacherNameEn,
          teacherNameAr: meeting.teacherNameAr,
          when: null as Slot["when"],
          register: registerOf(meeting.classId, period.id),
          sequence: period.sequence,
        },
      ];
    })
    .toSorted((a, b) => a.sequence - b.sequence);
  const on = slots.find(
    (slot) =>
      slot.startTime !== null &&
      slot.endTime !== null &&
      slot.startTime <= clock &&
      clock < slot.endTime,
  );
  const next = slots.find(
    (slot) => slot.startTime !== null && slot.startTime > clock,
  );
  return slots.map(({ sequence: _sequence, ...slot }) => ({
    ...slot,
    when: slot === on ? "now" : slot === next ? "next" : null,
  }));
}

/**
 * A teacher's day: lessons with each register's state, work waiting to be
 * marked, unread messages, what is due and happening this week, and classes.
 */
export const teacher = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "assignments:author", "attendance:record");
  const year = await yearOf(context);
  const weekEnd = addDays(context.today, 7);
  const [unread, threads, events] = await Promise.all([
    unreadThreads(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
    }),
    threadsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      unreadOnly: true,
      q: "",
      limit: 3,
    }),
    eventsBetween(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      drafts: false,
      from: context.today,
      to: addDays(context.today, 6),
      reach: await reachOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        userId: context.actor.userId,
        on: context.today,
      }),
    }),
  ]);
  const messages = { unread, threads };
  const upcoming = events.filter((event) => !event.cancelled).slice(0, 5);
  if (!year)
    return {
      today: context.today,
      slots: [],
      review: [],
      reviewTotal: 0,
      messages,
      due: [],
      events: upcoming,
      classes: [],
    };
  const [classes, periods, meetings, work, clock] = await Promise.all([
    classesTaughtBy(context.tx, context, {
      userId: context.actor.userId,
      yearId: year.id,
      on: context.today,
    }),
    periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: context.today,
    }),
    meetingsOn(context.tx, {
      tenantId: context.tenantId,
      on: context.today,
      filter: { teacherId: context.actor.userId },
    }),
    teacherAssignments(
      context.tx,
      { ...scopeOf(context), schoolWide: false },
      {
        yearId: year.id,
        classId: "",
        q: "",
        now: context.now,
        graceMs: GRACE_MS,
      },
    ),
    clockOf(context),
  ]);
  const board = await dayBoard(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    yearId: year.id,
    day: context.today,
    officialPeriodId: periods.find((period) => period.official)?.id ?? null,
  });
  const registers = new Map(
    board.map((row) => [`${row.classId}:${row.periodId}`, row.state]),
  );
  const weekday = isoWeekday(context.today);
  const taught = new Set(classes.map((row) => row.id));
  const today = meetings.filter((meeting) => meeting.weekday === weekday);
  const covered = new Set(
    today.map((meeting) => `${meeting.classId}:${meeting.periodId}`),
  );
  // A homeroom's daily register is expected without a timetabled lesson.
  const daily: MeetingRow[] = board
    .filter(
      (row) =>
        taught.has(row.classId) &&
        !covered.has(`${row.classId}:${row.periodId}`),
    )
    .map((row) => ({
      id: `${row.classId}:${row.periodId}`,
      classId: row.classId,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      classType: row.classType,
      groupClassId: row.classId,
      groupCode: row.classCode,
      groupTitleEn: row.classTitleEn,
      groupTitleAr: row.classTitleAr,
      weekday,
      periodId: row.periodId,
      teacherId: context.actor.userId,
      teacherNameEn: null,
      teacherNameAr: null,
      roomId: null,
      roomCode: null,
      roomNameEn: null,
      roomNameAr: null,
      from: context.today,
      clashAccepted: false,
      clashing: false,
    }));
  const slots = slotsOf(
    [...today, ...daily],
    periods,
    clock,
    (classId, periodId) => registers.get(`${classId}:${periodId}`) ?? null,
  );
  const waiting = work
    .filter((row) => row.toGrade > 0)
    .toSorted((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const due = work
    .filter(
      (row) =>
        row.state !== "draft" &&
        row.dueAt !== null &&
        row.dueAt.slice(0, 10) >= context.today &&
        row.dueAt.slice(0, 10) < weekEnd,
    )
    .toSorted((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 5);
  return {
    today: context.today,
    slots,
    review: waiting.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.title,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      toGrade: row.toGrade,
    })),
    reviewTotal: waiting.reduce((total, row) => total + row.toGrade, 0),
    messages,
    due: due.map((row) => ({
      id: row.id,
      title: row.title,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      dueAt: row.dueAt,
      handedIn: row.handedIn,
      recipients: row.recipients,
    })),
    events: upcoming,
    classes: classes.map((row) => ({
      id: row.id,
      code: row.code,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      classType: row.classType,
      students: row.students,
      role: row.role,
    })),
  };
});

type Learner = Awaited<ReturnType<typeof learnerAssignments>>[number];

function withState(rows: Learner[], now: Date) {
  return rows
    .filter(
      (row) =>
        !row.availableFrom || Date.parse(row.availableFrom) <= now.getTime(),
    )
    .map((row) => ({
      ...row,
      state: learnerState(
        {
          availableFrom: row.availableFrom,
          dueAt: row.dueAt,
          excused: row.excused,
          needsRevision: row.needsRevision,
          hasDraft: row.hasDraft,
          latestAttempt: row.attemptId ? { isLate: row.isLate } : null,
          released: row.released,
        },
        now,
      ),
    }));
}

const RECENT_MS = 7 * 86_400_000;

/** The attendance rate across registers, or null when none were taken. */
function rateOf(rows: { counts: AttendanceCounts }[]): number | null {
  const counts = Object.fromEntries(
    ATTENDANCE_MEANINGS.map((meaning) => [
      meaning,
      rows.reduce((sum, row) => sum + row.counts[meaning], 0),
    ]),
  ) as AttendanceCounts;
  const summary = summarise(counts);
  return summary.sessions > 0 ? summary.rate : null;
}

/** A student's day as the student or a family sees it: presence, lessons and work. */
async function studentDay(context: UnitContext, studentId: string) {
  const year = await yearOf(context);
  const weekEnd = addDays(context.today, 7);
  if (!year)
    return { presence: "none" as const, slots: [], work: [], year: null };
  const [attendance, unexplained, groups, periods, rows, clock] =
    await Promise.all([
      studentAttendance(context.tx, {
        tenantId: context.tenantId,
        studentId,
        from: context.today,
        to: context.today,
      }),
      absentUnexplainedOn(context.tx, {
        tenantId: context.tenantId,
        studentId,
        day: context.today,
      }),
      studentGroups(context.tx, {
        tenantId: context.tenantId,
        studentId,
        on: context.today,
      }),
      periodsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
        day: context.today,
      }),
      learnerAssignments(context.tx, {
        tenantId: context.tenantId,
        studentId,
        yearId: year.id,
      }),
      clockOf(context),
    ]);
  const meetings =
    groups.groupIds.length || groups.classIds.length
      ? (
          await meetingsOn(context.tx, {
            tenantId: context.tenantId,
            on: context.today,
            filter: { groupIds: groups.groupIds, classIds: groups.classIds },
          })
        ).filter((meeting) => meeting.weekday === isoWeekday(context.today))
      : [];
  const counts = attendance.counts;
  const presence =
    counts.absent > 0 || counts.excused > 0
      ? unexplained
        ? ("absent_unexplained" as const)
        : ("absent" as const)
      : counts.late > 0
        ? ("late" as const)
        : counts.present > 0
          ? ("present" as const)
          : ("none" as const);
  const work = withState(rows, context.now).map((row) => ({
    assignmentId: row.assignmentId,
    title: row.title,
    classCode: row.classCode,
    classTitleEn: row.classTitleEn,
    classTitleAr: row.classTitleAr,
    dueAt: row.dueAt,
    points: row.points,
    effectiveScore: row.effectiveScore,
    releasedAt: row.releasedAt,
    state: row.state,
    dueThisWeek:
      row.dueAt !== null &&
      row.dueAt.slice(0, 10) >= context.today &&
      row.dueAt.slice(0, 10) < weekEnd,
    newResult:
      row.state === "returned" &&
      row.releasedAt !== null &&
      context.now.getTime() - Date.parse(row.releasedAt) < RECENT_MS,
  }));
  return {
    presence,
    slots: slotsOf(meetings, periods, clock, () => null),
    work,
    year,
  };
}

/**
 * A family's home: for each child today's presence, the lesson now and
 * next, up to three things that need them, and what is due this week; then
 * pinned announcements and the latest newsletter.
 */
export const family = readProcedure
  .input(
    v.object({
      studentId: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
        "",
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const links = (
      await childrenOf(context.tx, scopeOf(context), context.actor.userId)
    ).filter((link) => link.visible);
    if (
      input.studentId &&
      !links.some((link) => link.studentId === input.studentId)
    )
      throw new ORPCError("NOT_FOUND");
    const chosen = input.studentId
      ? links.filter((link) => link.studentId === input.studentId)
      : links;
    const [threads, unread, feed, editions] = await Promise.all([
      threadsOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        unreadOnly: true,
        q: "",
        limit: 3,
      }),
      unreadThreads(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
      }),
      feedOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        today: context.today,
        tab: "current",
        q: "",
      }),
      editionsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        q: "",
      }),
    ]);
    const young = await youngStudents(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userIds: chosen.map((link) => link.studentId),
      today: context.today,
    });
    const children = [];
    for (const link of chosen) {
      const day = await studentDay(context, link.studentId);
      const attention = [
        ...(day.presence === "absent_unexplained"
          ? [
              {
                kind: "absence" as const,
                id: link.studentId,
                title: "",
                classCode: null,
                classTitleEn: null,
                classTitleAr: null,
              },
            ]
          : []),
        ...day.work
          .filter((row) => row.state === "missing")
          .map((row) => ({
            kind: "missing" as const,
            id: row.assignmentId,
            title: row.title,
            classCode: row.classCode,
            classTitleEn: row.classTitleEn,
            classTitleAr: row.classTitleAr,
          })),
        ...day.work
          .filter((row) => row.newResult)
          .map((row) => ({
            kind: "result" as const,
            id: row.assignmentId,
            title: row.title,
            classCode: row.classCode,
            classTitleEn: row.classTitleEn,
            classTitleAr: row.classTitleAr,
          })),
      ].slice(0, 3);
      children.push({
        studentId: link.studentId,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
        young: young.has(link.studentId),
        presence: day.presence,
        now: day.slots.find((slot) => slot.when === "now") ?? null,
        next: day.slots.find((slot) => slot.when === "next") ?? null,
        attention,
        due: day.work
          .filter(
            (row) =>
              row.dueThisWeek &&
              (row.state === "to_do" || row.state === "in_progress"),
          )
          .slice(0, 5),
      });
    }
    return {
      today: context.today,
      choices: links.map((link) => ({
        studentId: link.studentId,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
      })),
      children,
      messages: { unread, threads },
      pinned: feed
        .filter((row) => row.pinned)
        .slice(0, 3)
        .map((row) => ({
          id: row.id,
          title: row.title,
          summary: row.summary,
          urgency: row.urgency,
          readAt: row.readAt,
        })),
      newsletter: editions[0]
        ? {
            id: editions[0].id,
            title: editions[0].title,
            summary: editions[0].summary,
            readAt: editions[0].readAt,
          }
        : null,
    };
  });

/**
 * A student's home: what is due soon (missing work first), today's lessons,
 * a lesson to continue, class announcements and classes.
 */
export const student = readProcedure.handler(async ({ context }) => {
  if (context.actor.workspace !== "me") throw new ORPCError("FORBIDDEN");
  const studentId = context.actor.userId;
  const [day, reach, feed] = await Promise.all([
    studentDay(context, studentId),
    reachOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      userId: studentId,
      on: context.today,
    }),
    feedOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: studentId,
      today: context.today,
      tab: "current",
      q: "",
    }),
  ]);
  const modules = can(context, "learning:read")
    ? await studentModules(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        studentId,
        classIds: reach.classIds,
      })
    : [];
  const going = modules.find(
    (row) => row.lessons > 0 && row.completed < row.lessons,
  );
  const due = [
    ...day.work.filter((row) => row.state === "missing"),
    ...day.work.filter(
      (row) =>
        row.dueThisWeek &&
        ["to_do", "in_progress", "needs_revision"].includes(row.state),
    ),
  ].slice(0, 5);
  const classes = [
    ...new Map(
      day.slots.map((slot) => [
        slot.classId,
        {
          id: slot.classId,
          code: slot.classCode,
          titleEn: slot.classTitleEn,
          titleAr: slot.classTitleAr,
        },
      ]),
    ).values(),
  ];
  return {
    today: context.today,
    presence: day.presence,
    due,
    slots: day.slots,
    module: going
      ? {
          id: going.id,
          title: going.title,
          lessons: going.lessons,
          completed: going.completed,
        }
      : null,
    announcements: feed.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      urgency: row.urgency,
      readAt: row.readAt,
    })),
    classes,
  };
});

/**
 * The office's day: what needs action, attendance today and this week, the
 * next week's events, recent communications with how many read them, and a
 * checklist for the next year once this one is eight weeks from its end.
 */
export const admin = readProcedure.handler(async ({ context }) => {
  if (context.actor.workspace !== "admin") throw new ORPCError("FORBIDDEN");
  const year = await yearOf(context);
  const weekStart = addDays(
    context.today,
    -((isoWeekday(context.today) + 6) % 7),
  );
  const events = (
    await eventsBetween(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      drafts: false,
      from: context.today,
      to: addDays(context.today, 6),
      reach: null,
    })
  )
    .filter((event) => !event.cancelled)
    .slice(0, 6);
  let registers: {
    notTaken: number;
    classes: {
      classId: string;
      code: string;
      titleEn: string | null;
      titleAr: string | null;
    }[];
  } | null = null;
  let attendance: { today: number | null; week: number | null } | null = null;
  let absences: number | null = null;
  if (year && can(context, "attendance:manage")) {
    const periods = await periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: context.today,
    });
    const board = await dayBoard(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: context.today,
      officialPeriodId: periods.find((period) => period.official)?.id ?? null,
    });
    const missing = board.filter((row) => row.state === "not_started");
    registers = {
      notTaken: missing.length,
      classes: [
        ...new Map(
          missing.map((row) => [
            row.classId,
            {
              classId: row.classId,
              code: row.classCode,
              titleEn: row.classTitleEn,
              titleAr: row.classTitleAr,
            },
          ]),
        ).values(),
      ],
    };
    const week = await attendanceReport(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      from: weekStart,
      to: context.today,
      by: "class",
      q: "",
    });
    attendance = { today: rateOf(board), week: rateOf(week) };
    absences = (
      await absencesBetween(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: context.today,
        to: context.today,
        unexplainedOnly: true,
        q: "",
        limit: 500,
      })
    ).length;
  }
  let guardians: number | null = null;
  let homerooms: number | null = null;
  if (year && can(context, "people:read")) {
    guardians = (
      await studentDirectory(
        context.tx,
        { ...scopeOf(context), schoolWide: true },
        {
          yearId: year.id,
          working: true,
          q: "",
          phone: null,
          gradeIds: [],
          statuses: [],
          missingGuardian: true,
          missingAccount: false,
          sort: "name",
          dir: "asc",
          locale: "en",
          gradeOrder: [],
          page: 1,
          pageSize: 1,
        },
      )
    ).total;
  }
  if (year && can(context, "classes:read"))
    homerooms = (
      await homeroomDirectory(
        context.tx,
        { ...scopeOf(context), schoolWide: true },
        {
          yearId: year.id,
          on: context.today,
          q: "",
          gradeIds: [],
          locale: "en",
        },
      )
    ).filter((row) => row.teachers.length === 0).length;
  const failed = can(context, "school:manage")
    ? (
        await deliveryLog(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          state: "failed",
          channel: "all",
          q: "",
          limit: 1,
          offset: 0,
        })
      ).total
    : null;
  const announcements = can(context, "announcements:manage")
    ? (
        await managedAnnouncements(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          states: ["published"],
          q: "",
        })
      )
        .slice(0, 3)
        .map((row) => ({
          id: row.id,
          title: row.title,
          recipients: row.recipients,
          read: row.read,
          kind: "announcement" as const,
        }))
    : [];
  const newsletters = can(context, "newsletters:manage")
    ? (
        await managedNewsletters(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          states: ["published"],
          q: "",
        })
      )
        .slice(0, 2)
        .map((row) => ({
          id: row.id,
          title: row.title,
          recipients: row.recipients,
          read: row.read,
          kind: "newsletter" as const,
        }))
    : [];
  let checklist: {
    yearEnds: string;
    nextYear: boolean;
    nextClasses: number;
    nextStudents: number;
  } | null = null;
  if (year && can(context, "years:manage")) {
    const lastDay = addDays(year.endsBefore, -1);
    if (addDays(context.today, 56) >= lastDay) {
      const directory = await yearDirectory(
        context.tx,
        context.tenantId,
        context.schoolId,
        context.today,
      );
      const next = directory.find((row) => row.startsOn >= year.endsBefore);
      checklist = {
        yearEnds: lastDay,
        nextYear: Boolean(next),
        nextClasses: next?.classes ?? 0,
        nextStudents: next?.students ?? 0,
      };
    }
  }
  return {
    today: context.today,
    registers,
    absences,
    guardians,
    homerooms,
    failed,
    attendance,
    events,
    communications: [...announcements, ...newsletters],
    checklist,
  };
});
