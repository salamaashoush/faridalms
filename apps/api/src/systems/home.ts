import type { LessonChange } from "@faridalms/database/stores/cover";
import type { MeetingRow } from "@faridalms/database/stores/timetable";
import type { AttendanceCounts } from "@faridalms/domain/attendance";
import type {
  OnboardingItem,
  SetupProgress,
} from "@faridalms/domain/onboarding";

import {
  absencesBetween,
  absentUnexplainedOn,
  attendanceReport,
  attendanceCounts,
} from "@faridalms/database/stores/attendance";
import {
  announcementFeed,
  managedBroadcasts,
} from "@faridalms/database/stores/broadcasts";
import { classesTaughtBy } from "@faridalms/database/stores/classes";
import {
  learnerAssignments,
  teacherAssignments,
} from "@faridalms/database/stores/coursework";
import { changesOn } from "@faridalms/database/stores/cover";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { eventsBetween } from "@faridalms/database/stores/events";
import { expiringDocuments } from "@faridalms/database/stores/identifiers";
import { studentModules } from "@faridalms/database/stores/learning";
import { threadsOf, unreadThreads } from "@faridalms/database/stores/messages";
import { deliveryLog } from "@faridalms/database/stores/notifications";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  preferenceOf,
  savePreference,
} from "@faridalms/database/stores/preferences";
import {
  person as readPerson,
  referenceOf,
} from "@faridalms/database/stores/students";
import {
  meetingsOn,
  studentClasses,
} from "@faridalms/database/stores/timetable";
import { ATTENDANCE_MEANINGS, summarise } from "@faridalms/domain/attendance";
import { GRACE_MS, learnerState } from "@faridalms/domain/coursework";
import {
  EXPIRY_WARNING_DAYS,
  SEALED_MEANINGS,
} from "@faridalms/domain/identifiers";
import { MODULE_IDS } from "@faridalms/domain/modules";
import {
  onboardingItems,
  SETUP_ITEMS,
  setupFinished,
  setupProgress,
} from "@faridalms/domain/onboarding";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/school-days";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { RegisterPeriod } from "../attendance/plans";
import type { UnitContext } from "../core/context";
import type { RecordLink } from "../core/reach";

import { dayBoard } from "../attendance/board";
import { dailyClassIds } from "../attendance/daily-registers";
import { periodsOn } from "../attendance/plans";
import { classesInView } from "../classes/points";
import { reachAt } from "../core/audiences";
import { modulesOf } from "../core/modules";
import {
  can,
  clockOf,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  reachesStudent,
  recordLinks,
  scopeFor,
  studentsReached,
} from "../core/reach";
import { setupSeen } from "../core/setup";
import { studentGroupsOf } from "../core/student-groups";
import { decidesFor } from "../people/acting";
import { studentPlacesOf, youngStudentsOf } from "../people/points";

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
  teacherId: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  /** How far the viewer reaches whoever teaches it, for a link on the name. */
  teacherLink: RecordLink;
  /** Whether this is the lesson on now, or the next one today. */
  when: "now" | "next" | null;
  register: "not_started" | "in_progress" | "submitted" | null;
}

/**
 * A day's lessons in period order, with the one on now and the next one
 * marked from the school's own clock.
 */
const slotKey = (row: { classId: string; periodId: string }) =>
  `${row.classId}:${row.periodId}`;

/**
 * A day's lessons as they are held: cancelled ones gone, and covered or
 * moved ones with that day's teacher and room. With `coverId`, a teacher's
 * day: lessons someone else covers for them are gone, and the lessons they
 * cover are added.
 */
async function asHeld(
  context: UnitContext,
  meetings: MeetingRow[],
  day: string,
  coverId?: string,
): Promise<MeetingRow[]> {
  const [changes, covers] = await Promise.all([
    changesOn(context.tx, {
      tenantId: context.tenantId,
      days: [day],
      filter: { classIds: [...new Set(meetings.map((row) => row.classId))] },
    }),
    coverId
      ? changesOn(context.tx, {
          tenantId: context.tenantId,
          days: [day],
          filter: { coverId },
        })
      : Promise.resolve([]),
  ]);
  const held = (row: MeetingRow, change: LessonChange | undefined) => {
    if (!change) return [row];
    if (change.cancelled) return [];
    if (coverId && change.coverId && change.coverId !== coverId) return [];
    return [
      {
        ...row,
        ...(change.coverId
          ? {
              teacherId: change.coverId,
              teacherNameEn: change.coverNameEn,
              teacherNameAr: change.coverNameAr,
            }
          : {}),
        ...(change.roomId
          ? {
              roomId: change.roomId,
              roomCode: change.roomCode,
              roomNameEn: change.roomNameEn,
              roomNameAr: change.roomNameAr,
            }
          : {}),
      },
    ];
  };
  const changeOf = new Map(changes.map((row) => [slotKey(row), row]));
  const own = meetings.flatMap((row) => held(row, changeOf.get(slotKey(row))));
  if (covers.length === 0) return own;
  const coverOf = new Map(covers.map((row) => [slotKey(row), row]));
  const covered = await meetingsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: day,
    days: [day],
    filter: {
      classIds: [...new Set(covers.map((row) => row.classId))],
    },
  });
  return [
    ...own,
    ...covered.flatMap((row) => {
      const change = coverOf.get(slotKey(row));
      return change ? held(row, change) : [];
    }),
  ];
}

function slotsOf(
  meetings: MeetingRow[],
  periods: RegisterPeriod[],
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
          teacherId: meeting.teacherId,
          teacherNameEn: meeting.teacherNameEn,
          teacherNameAr: meeting.teacherNameAr,
          teacherLink: null as RecordLink,
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
      reach: await reachAt(context, {
        userId: context.actor.userId,
        on: context.today,
      }),
    }),
  ]);
  const messages = { unread, threads: threads.rows };
  const upcoming = events.filter((event) => !event.cancelled).slice(0, 5);
  const [classes, periods, meetings, work, clock] = await Promise.all([
    classesTaughtBy(context.tx, context, {
      userId: context.actor.userId,
      on: context.today,
    }),
    periodsOn(context, context.today),
    meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
      days: [context.today],
      filter: { teacherId: context.actor.userId },
    }).then((rows) =>
      asHeld(context, rows, context.today, context.actor.userId),
    ),
    teacherAssignments(context.tx, scopeFor(context, "own"), {
      viewed: await classesInView(context),
      classId: "",
      q: "",
      now: context.now,
      graceMs: GRACE_MS,
    }),
    clockOf(context),
  ]);
  const board = await dayBoard(context, context.today);
  const registers = new Map(
    board.map((row) => [`${row.classId}:${row.periodId}`, row.state]),
  );
  const taught = new Set(classes.map((row) => row.id));
  const covered = new Set(
    meetings.map((meeting) => `${meeting.classId}:${meeting.periodId}`),
  );
  // A daily register is expected without a timetabled lesson.
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
      timetableId: "",
      weekday: isoWeekday(context.today),
      periodId: row.periodId,
      teacherId: context.actor.userId,
      teacherNameEn: null,
      teacherNameAr: null,
      roomId: null,
      roomCode: null,
      roomNameEn: null,
      roomNameAr: null,
      from: context.today,
      on: context.today,
      clashAccepted: false,
      clashing: false,
      oneDay: false,
    }));
  const slots = slotsOf(
    [...meetings, ...daily],
    periods,
    clock,
    (classId, periodId) => registers.get(`${classId}:${periodId}`) ?? null,
  );
  const on = await modulesOf(context);
  const waiting = (on.coursework ? work : [])
    .filter((row) => row.toGrade > 0)
    .toSorted((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const due = (on.coursework ? work : [])
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
    slots: on.timetable ? slots : [],
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
  const weekEnd = addDays(context.today, 7);
  const [attendance, unexplained, classIds, periods, rows, clock] =
    await Promise.all([
      attendanceCounts(context.tx, {
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
      studentClasses(context.tx, {
        tenantId: context.tenantId,
        studentId,
        on: context.today,
      }),
      periodsOn(context, context.today),
      learnerAssignments(context.tx, {
        tenantId: context.tenantId,
        studentId,
        viewed: await classesInView(context),
      }),
      clockOf(context),
    ]);
  const meetings =
    classIds.length > 0
      ? await asHeld(
          context,
          await meetingsOn(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            on: context.today,
            days: [context.today],
            filter: { classIds },
          }),
          context.today,
        )
      : [];
  const counts = attendance;
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
  const slots = slotsOf(meetings, periods, clock, () => null);
  const linkOf = await recordLinks(
    context,
    slots.map((slot) => slot.teacherId),
  );
  const on = await modulesOf(context);
  return {
    presence: on.attendance ? presence : ("none" as const),
    slots: on.timetable
      ? slots.map((slot) => ({
          ...slot,
          teacherLink: linkOf(slot.teacherId),
        }))
      : [],
    work: on.coursework ? work : [],
  };
}

/** A row's title in the reader's language, the other when it has none. */
function localTitle(
  context: UnitContext,
  row: { titleEn: string; titleAr: string },
) {
  return localeOf(context) === "ar"
    ? row.titleAr || row.titleEn
    : row.titleEn || row.titleAr;
}

/** The label of one of a list's choices, in both languages. */
function labelIn(
  list: readonly {
    id: string;
    labelEn: string | null;
    labelAr: string | null;
  }[],
  id: string | null | undefined,
) {
  const found = list.find((row) => row.id === id);
  return found ? { labelEn: found.labelEn, labelAr: found.labelAr } : null;
}

/**
 * What the school holds about one learner, for the learner or someone who
 * follows them to read and check: who they are, their number, where a
 * module places them and their class. It says whether the reader decides
 * for the learner, since only one who does may ask for a correction.
 */
export const details = readProcedure
  .input(v.object({ studentId: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    const scope = scopeFor(context, "own");
    if (
      (input.studentId !== context.actor.userId &&
        !context.actor.follows.includes(input.studentId)) ||
      !(await reachesStudent(context, "own", input.studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const [record, reference, places, groups, sexes] = await Promise.all([
      readPerson(context.tx, input.studentId),
      referenceOf(context.tx, scope, input.studentId),
      studentPlacesOf(context, [input.studentId], context.today),
      studentGroupsOf(context, [input.studentId], context.today),
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace: "sex",
        today: context.today,
      }),
    ]);
    if (!record) throw new ORPCError("NOT_FOUND");
    return {
      studentId: input.studentId,
      fullNameEn: record.fullNameEn,
      fullNameAr: record.fullNameAr,
      preferredGivenName: record.preferredGivenName,
      birthDate: record.birthDate,
      sex: labelIn(sexes, record.sexId),
      reference: reference?.identifier ?? null,
      place: places.get(input.studentId) ?? null,
      group: groups.get(input.studentId) ?? null,
      decides: await decidesFor(context, {
        userId: context.actor.userId,
        studentId: input.studentId,
        on: context.today,
      }),
    };
  });

/**
 * The home of someone who follows learners: for each today's presence, the
 * lesson now and next, up to three things that need them, and what is due
 * this week; then the latest announcements, pinned first.
 */
export const followed = readProcedure
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
    const reached = await studentsReached(
      context,
      "teaching",
      context.actor.follows,
    );
    const links = (
      await namesOf(
        context.tx,
        context.tenantId,
        context.actor.follows.filter((id) => reached.has(id)),
      )
    ).map((row) => ({
      studentId: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
    }));
    if (
      input.studentId &&
      !links.some((link) => link.studentId === input.studentId)
    )
      throw new ORPCError("NOT_FOUND");
    const chosen = input.studentId
      ? links.filter((link) => link.studentId === input.studentId)
      : links;
    const [threads, unread, feed] = await Promise.all([
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
      announcementFeed(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        today: context.today,
        tab: "current",
        q: "",
        limit: 3,
        offset: 0,
      }).then(({ rows }) => rows),
    ]);
    const young = await youngStudentsOf(
      context,
      chosen.map((link) => link.studentId),
      context.today,
    );
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
      messages: { unread, threads: threads.rows },
      announcements: feed.map((row) => ({
        id: row.id,
        title: localTitle(context, row),
        summary:
          (localeOf(context) === "ar" ? row.excerptAr : row.excerptEn) ||
          row.excerptEn ||
          row.excerptAr ||
          row.summary,
        urgency: row.urgency,
        pinned: row.pinned,
        readAt: row.readAt,
      })),
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
    reachAt(context, {
      userId: studentId,
      on: context.today,
    }),
    announcementFeed(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: studentId,
      today: context.today,
      tab: "current",
      q: "",
      limit: 3,
      offset: 0,
    }).then(({ rows }) => rows),
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
      title: localTitle(context, row),
      summary: row.summary,
      urgency: row.urgency,
      readAt: row.readAt,
    })),
    classes,
  };
});

/**
 * The office's day: what needs action, attendance today and this week, the
 * next week's events, and recent communications with how many read them.
 */
export const admin = readProcedure.handler(async ({ context }) => {
  if (context.actor.profile !== "staff_admin") throw new ORPCError("FORBIDDEN");
  const on = await modulesOf(context);
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
  if (on.attendance && can(context, "attendance:manage")) {
    const board = await dayBoard(context, context.today);
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
      from: weekStart,
      to: context.today,
      by: "class",
      q: "",
      dailyClassIds: await dailyClassIds(context, {
        from: weekStart,
        to: addDays(context.today, 1),
      }),
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
        await managedBroadcasts(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          tab: "published",
          q: "",
          limit: 3,
          offset: 0,
        })
      ).rows
        .slice(0, 3)
        .map((row) => ({
          id: row.id,
          title: localTitle(context, row),
          recipients: row.recipients,
          read: row.read,
        }))
    : [];
  const documents = can(context, "people:manage")
    ? (
        await expiringDocuments(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: context.today,
          until: addDays(context.today, EXPIRY_WARNING_DAYS),
          meanings: SEALED_MEANINGS,
        })
      ).slice(0, 5)
    : [];
  return {
    today: context.today,
    registers,
    absences,
    failed,
    documents,
    attendance,
    events,
    communications: announcements,
    onboarding: await onboardingFor(context),
  };
});

/** Where a person keeps the schools whose finished setup they have hidden. */
const ONBOARDING_HIDDEN = "home_onboarding";
const hiddenSchema = v.object({ schools: v.array(v.string()) });

async function hiddenSchools(context: UnitContext) {
  const kept = v.safeParse(
    hiddenSchema,
    await preferenceOf(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: ONBOARDING_HIDDEN,
    }),
  );
  return kept.success ? kept.output.schools : [];
}

/**
 * The school's first steps as its administrators see them, the same list
 * the operators follow: what the school's data shows now, with what the
 * directory holds of its address, its first invoice and the operators'
 * steps. The school's own setup comes first, step by step in the order it
 * is best done; the rest follows as it is reached. Gone once every step is
 * taken, or once the setup is finished and the person has hidden it.
 */
async function onboardingFor(context: UnitContext): Promise<{
  steps: SetupProgress[];
  items: { item: OnboardingItem; done: boolean }[];
  finished: boolean;
} | null> {
  const on = await modulesOf(context);
  const applies = onboardingItems({
    modules: MODULE_IDS.filter((module) => on[module]),
    onTrial: context.school.entitlements.trialEndsOn !== null,
  });
  const [seen, kept] = await Promise.all([
    setupSeen(context, context.today),
    context.directory.onboardingOf(context.schoolId),
  ]);
  const done = new Set<OnboardingItem>([
    ...seen,
    ...kept.map((row) => row.item),
  ]);
  if (applies.every((item) => done.has(item))) return null;
  const steps = setupProgress(applies, done);
  const finished = setupFinished(steps);
  if (finished && (await hiddenSchools(context)).includes(context.schoolId))
    return null;
  return {
    steps,
    items: applies
      .filter((item) => !SETUP_ITEMS.has(item))
      .map((item) => ({ item, done: done.has(item) })),
    finished,
  };
}

/**
 * Hides the school's first steps from the person's Today once the school's
 * own setup is finished; what is left is the operators' and the school's
 * first weeks, which the console follows.
 */
export const hideOnboarding = writeProcedure.handler(async ({ context }) => {
  if (context.actor.profile !== "staff_admin") throw new ORPCError("FORBIDDEN");
  const onboarding = await onboardingFor(context);
  if (onboarding && !onboarding.finished)
    throw new ORPCError("CONFLICT", { message: "onboarding.not_finished" });
  const schools = await hiddenSchools(context);
  if (!schools.includes(context.schoolId))
    await savePreference(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: ONBOARDING_HIDDEN,
      value: { schools: [...schools, context.schoolId] },
    });
  return { hidden: true };
});
