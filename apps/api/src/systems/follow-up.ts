import {
  attendanceReport,
  settingsOf,
} from "@faridalms/database/stores/attendance";
import {
  callList,
  contactsOn,
  guardiansToCall,
  overdueReasons,
} from "@faridalms/database/stores/follow-up";
import {
  mailboxThreadAbout,
  messagingGuardians,
} from "@faridalms/database/stores/messages";
import {
  markedMeanings,
  schoolWeek,
} from "@faridalms/database/stores/school-days";
import {
  followUpQuerySchema,
  isChronic,
  logContactSchema,
  REASON_DUE_DAYS,
  summarise,
} from "@faridalms/domain/attendance";
import { plainContent } from "@faridalms/domain/content-conversion";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { addDays } from "@faridalms/domain/school";
import { dayOpen } from "@faridalms/domain/school-days";

import type { UnitContext } from "../core/context";

import { periodsOf } from "../attendance/plans";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";
import { reportRange } from "../core/spans";
import { studentGroupsOf } from "../core/student-groups";
import {
  openMailboxConversation,
  scopeOf as conversationScope,
  writeEntry,
} from "../messages/conversations";

/** Missing half the sessions or more: absent more than present. */
const SEVERE_PERCENT = 50;

/**
 * The day `count` school days before `day`: weekends and the days the
 * school shuts are skipped.
 */
async function schoolDaysBefore(
  context: UnitContext,
  day: string,
  count: number,
): Promise<string> {
  const scope = { tenantId: context.tenantId, schoolId: context.schoolId };
  const [week, marks] = await Promise.all([
    schoolWeek(context.tx, context.tenantId, context.schoolId),
    markedMeanings(context.tx, {
      ...scope,
      from: addDays(day, -count * 3 - 14),
      to: day,
    }),
  ]);
  let cursor = day;
  let left = count;
  while (left > 0) {
    cursor = addDays(cursor, -1);
    if (dayOpen(week, cursor, marks.get(cursor) ?? null)) left -= 1;
  }
  return cursor;
}

/**
 * The office's follow-up for a day: the children to call about an absence
 * nobody explained, with whom to call; absences whose reason is overdue;
 * and the children missing enough of the year to need support.
 */
export const day = readProcedure
  .input(followUpQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const date = input.date || context.today;
    const range = await reportRange(context, { span: "", from: "", to: "" });
    const [calls, contacts, rules, due] = await Promise.all([
      callList(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day: date,
      }),
      contactsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day: date,
      }),
      settingsOf(context.tx, context.tenantId, context.schoolId),
      schoolDaysBefore(context, date, REASON_DUE_DAYS),
    ]);
    const [guardians, overdue, rates, groups] = await Promise.all([
      guardiansToCall(context.tx, {
        tenantId: context.tenantId,
        studentIds: calls.map((row) => row.studentId),
        day: date,
      }),
      overdueReasons(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: range.from,
        before: due,
        ...pageWindow(input.overduePage),
      }),
      attendanceReport(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: range.from,
        to: range.to,
        by: "student",
        q: "",
        dailyClassIds: [],
      }),
      studentGroupsOf(
        context,
        calls.map((row) => row.studentId),
        date,
      ),
    ]);
    const chronic = rates
      .map((row) => ({ row, summary: summarise(row.counts) }))
      .filter(({ summary }) => isChronic(summary, rules.chronicPercent))
      .toSorted((a, b) => (a.summary.rate ?? 0) - (b.summary.rate ?? 0));
    const window = pageWindow(input.supportPage);
    const support = chronic
      .slice(window.offset, window.offset + window.limit)
      .map(({ row, summary }) => ({
        studentId: row.id,
        fullNameEn: row.nameEn,
        fullNameAr: row.nameAr,
        classTitleEn: row.classTitleEn,
        classTitleAr: row.classTitleAr,
        rate: summary.rate ?? 0,
        missed: summary.absent + summary.excused,
        sessions: summary.sessions,
        severe: 100 - (summary.rate ?? 100) >= SEVERE_PERCENT,
      }));
    const periods = await periodsOf(
      context,
      calls.flatMap((row) => row.registerIds),
    );
    const firstPeriod = (registerIds: readonly string[]) =>
      registerIds
        .flatMap((id) => {
          const period = periods.get(id);
          return period ? [period] : [];
        })
        .toSorted((a, b) => a.sequence - b.sequence)[0] ?? null;
    return {
      followUp: {
        date,
        today: context.today,
        from: range.from,
        dueBefore: due,
        chronicPercent: rules.chronicPercent,
        calls: calls
          .map(({ registerIds, ...row }) => {
            const period = firstPeriod(registerIds);
            return {
              ...row,
              periodNameEn: period?.nameEn ?? null,
              periodNameAr: period?.nameAr ?? null,
              group: groups.get(row.studentId) ?? null,
            };
          })
          .toSorted((a, b) =>
            (a.group?.code ?? "\uffff").localeCompare(
              b.group?.code ?? "\uffff",
            ),
          )
          .map((row) => ({
            ...row,
            guardians: guardians
              .filter((guardian) => guardian.studentId === row.studentId)
              .map((guardian) => ({
                userId: guardian.userId,
                fullNameEn: guardian.fullNameEn,
                fullNameAr: guardian.fullNameAr,
                relationEn: guardian.relationEn,
                relationAr: guardian.relationAr,
                phone: guardian.phone,
                emergency: guardian.emergency,
              })),
            contacts: contacts
              .filter((contact) => contact.studentId === row.studentId)
              .map((contact) => ({
                id: contact.id,
                outcome: contact.outcome,
                note: contact.note,
                byNameEn: contact.byNameEn,
                byNameAr: contact.byNameAr,
                at: contact.at,
              })),
          })),
        overdue: paged(overdue.rows, overdue.total, input.overduePage),
        support: paged(support, chronic.length, input.supportPage),
      },
    };
  });

/** Records a call or message to a family about a child's absence. */
export const logContact = writeProcedure
  .input(logContactSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    await requireStudent(context, "school", input.studentId);
    // A call is a logged contact in the attendance office's conversation
    // with the child's family, the one the office writes to them in.
    const scope = conversationScope(context);
    const threadId =
      (await mailboxThreadAbout(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        mailbox: "attendance",
        studentId: input.studentId,
      })) ??
      (await openMailboxConversation(scope, {
        mailbox: "attendance",
        subject: null,
        studentId: input.studentId,
        ownerId: null,
        memberIds: await messagingGuardians(context.tx, {
          tenantId: context.tenantId,
          studentId: input.studentId,
          on: context.today,
        }),
      }));
    const { id } = await writeEntry(scope, {
      threadId,
      kind: "call",
      authorUserId: context.actor.userId,
      content: input.note ? plainContent(input.note) : null,
      details: {
        outcome: input.outcome,
        studentId: input.studentId,
        on: input.date,
      },
      notify: false,
    });
    await audit(context, {
      action: "attendance.contact",
      objectType: "message",
      objectId: id,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { date: input.date, outcome: input.outcome },
    });
    return { id };
  });
