import type { AbsenceReport } from "@faridalms/database/stores/absence-reports";

import {
  decideReport,
  insertReport,
  marksToExplain,
  reportById,
  reportInbox,
  reportsFor,
  withdrawReport,
} from "@faridalms/database/stores/absence-reports";
import {
  attendanceCodes,
  excuseMarks,
  settingsOf,
} from "@faridalms/database/stores/attendance";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import {
  absenceReportSchema,
  decideReportSchema,
  learnerReportsSchema,
  REPORT_DAYS_BACK,
  reportInboxSchema,
  withdrawReportSchema,
} from "@faridalms/domain/attendance";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { ATTENDANCE_HOSTS } from "../attendance/hosts";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent, studentsReached } from "../core/reach";
import { withFileGate } from "../files/gate";
import { decidesFor } from "../people/acting";

const AUDIT_ACTIONS = {
  accepted: "attendance.report_accepted",
  declined: "attendance.report_declined",
} as const;

/**
 * The learners whose reports the viewer reads: themself as a learner, and
 * those they follow, each as far as the viewer still reaches them.
 */
async function reportedLearners(context: UnitContext): Promise<string[]> {
  const own = context.actor.context === "student" ? [context.actor.userId] : [];
  const ids = [...own, ...context.actor.follows];
  const reached = await studentsReached(context, "teaching", ids);
  return ids.filter((id) => reached.has(id));
}

/**
 * Whether the viewer reports for the learner: someone who decides for them,
 * or the learner themself where they decide for themselves and the school
 * lets learners report their own absence.
 */
async function mayReportFor(context: UnitContext, studentId: string) {
  if (
    studentId === context.actor.userId &&
    !(await settingsOf(context.tx, context.tenantId, context.schoolId))
      .learnersReport
  )
    return false;
  return decidesFor(context, {
    userId: context.actor.userId,
    studentId,
    on: context.today,
  });
}

/** Who may see a report: whoever made it, whoever reads the learner's reports, and the office. */
async function mayRead(context: UnitContext, report: AbsenceReport) {
  if (report.reporterId === context.actor.userId) return true;
  if (can(context, "attendance:manage")) return true;
  return (await reportedLearners(context)).includes(report.studentId);
}

const reportOf = (context: UnitContext, id: string) =>
  reportById(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    id,
  });

// A note sent with a report is read by whoever may read the report.
ATTENDANCE_HOSTS.push({
  hostType: "absence_report",
  read: async (context, reportId) => {
    const report = await reportOf(context, reportId);
    return report !== null && (await mayRead(context, report));
  },
});

function reportView(row: AbsenceReport) {
  return {
    id: row.id,
    studentId: row.studentId,
    studentNameEn: row.studentNameEn,
    studentNameAr: row.studentNameAr,
    reporterId: row.reporterId,
    reporterNameEn: row.reporterNameEn,
    reporterNameAr: row.reporterNameAr,
    kind: row.kind,
    from: row.from,
    to: row.to,
    at: row.at,
    reasonId: row.reasonId,
    reasonEn: row.reasonEn,
    reasonAr: row.reasonAr,
    note: row.note,
    fileId: row.fileId,
    fileName: row.fileName,
    decision: row.decision,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
  };
}

async function reasonsOf(context: UnitContext) {
  const codes = await attendanceCodes(context.tx, context.tenantId);
  return codes.reasons
    .filter((row) => row.meaning !== "school_activity")
    .map((row) => ({
      id: row.id,
      code: row.code,
      labelEn: row.labelEn,
      labelAr: row.labelAr,
    }));
}

/** The reports of the learners the viewer reads them for, and the reasons they may give. */
export const mine = readProcedure
  .input(learnerReportsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:read");
    const learners = await reportedLearners(context);
    const studentIds = input.studentId
      ? learners.filter((id) => id === input.studentId)
      : learners;
    const [reports, reasons] = await Promise.all([
      studentIds.length === 0
        ? Promise.resolve([])
        : withFileGate(context.tx, "evidence", (tx) =>
            reportsFor(tx, {
              tenantId: context.tenantId,
              schoolId: context.schoolId,
              studentIds,
            }),
          ),
      reasonsOf(context),
    ]);
    return {
      today: context.today,
      earliest: addDays(context.today, -REPORT_DAYS_BACK),
      reasons,
      reports: reports.map(reportView),
      mayReport: (
        await Promise.all(studentIds.map((id) => mayReportFor(context, id)))
      ).some(Boolean),
    };
  });

/**
 * Someone who decides for a learner, or the learner themself where the
 * school lets them, tells the school the learner will be away, late or
 * leaving early, or asks for leave ahead. The office may also record one
 * phoned in, for any student it can see.
 */
export const report = writeProcedure
  .input(absenceReportSchema)
  .handler(async ({ input, context }) => {
    const office = can(context, "attendance:manage");
    if (office) {
      await requireStudent(context, "teaching", input.studentId);
    } else {
      if (!(await reportedLearners(context)).includes(input.studentId))
        throw new ORPCError("NOT_FOUND");
      if (!(await mayReportFor(context, input.studentId)))
        throw new ORPCError("FORBIDDEN");
    }
    if (input.from < addDays(context.today, -REPORT_DAYS_BACK))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.report_late" });
    const reasons = await reasonsOf(context);
    if (!reasons.some((row) => row.id === input.reasonId))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.reason" });
    if (input.fileId) {
      const fileId = input.fileId;
      const [file] = await withFileGate(context.tx, "evidence", (tx) =>
        filesByIds(tx, context.tenantId, [fileId]),
      );
      if (!file || file.purpose !== "evidence")
        throw new ORPCError("BAD_REQUEST", { message: "validation.file_type" });
    }
    const id = await insertReport(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId: input.studentId,
      reporterId: context.actor.userId,
      kind: input.kind,
      from: input.from,
      to: input.to,
      at: input.at || null,
      reasonId: input.reasonId,
      note: input.note || null,
      fileId: input.fileId || null,
    });
    if (input.fileId) {
      const fileId = input.fileId;
      const linked = await withFileGate(context.tx, "evidence", (tx) =>
        linkFiles(tx, {
          tenantId: context.tenantId,
          userId: context.actor.userId,
          ids: [fileId],
          purpose: "evidence",
          host: { type: "absence_report", id },
        }),
      );
      if (linked.length !== 1)
        throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
    }
    await audit(context, {
      action: "attendance.report",
      objectType: "absence_report",
      objectId: id,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { kind: input.kind, from: input.from, to: input.to },
    });
    return { id };
  });

/** Takes back a report the office has not yet decided. */
export const withdraw = writeProcedure
  .input(withdrawReportSchema)
  .handler(async ({ input, context }) => {
    const found = await reportOf(context, input.id);
    if (!found || !(await mayRead(context, found)))
      throw new ORPCError("NOT_FOUND");
    if (
      !(await withdrawReport(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
      }))
    )
      throw new ORPCError("CONFLICT", { message: "attendance.report_decided" });
    await audit(context, {
      action: "attendance.report_withdrawn",
      objectType: "absence_report",
      objectId: input.id,
      subjectUserId: found.studentId,
      studentUserId: found.studentId,
    });
    return { ok: true };
  });

/** The office's reports: those waiting first, or all of them. */
export const inbox = readProcedure
  .input(reportInboxSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const reports = await withFileGate(context.tx, "evidence", (tx) =>
      reportInbox(tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        open: input.open,
      }),
    );
    return { today: context.today, reports: reports.map(reportView) };
  });

/**
 * Accepts or declines a report. Accepting gives the marks already taken on
 * its days their reason, an absence becoming excused; registers taken later
 * do the same. The family hears either way.
 */
export const decide = writeProcedure
  .input(decideReportSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const found = await reportOf(context, input.id);
    if (!found) throw new ORPCError("NOT_FOUND");
    if (
      !(await decideReport(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        decision: input.decision,
        note: input.note || null,
        actorId: context.actor.userId,
      }))
    )
      throw new ORPCError("CONFLICT", { message: "attendance.report_decided" });
    let explained = 0;
    if (input.decision === "accepted") {
      const marks = await marksToExplain(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        studentId: found.studentId,
        from: found.from,
        to: found.to,
        kind: found.kind,
      });
      if (marks.length > 0) {
        const codes = await attendanceCodes(context.tx, context.tenantId);
        const excused = codes.categories.find(
          (row) => row.meaning === "excused",
        );
        if (!excused) throw new Error("No attendance category means excused");
        explained = (
          await excuseMarks(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            marks,
            reasonId: found.reasonId,
            note: "",
            excusedCategoryId: excused.id,
            actorId: context.actor.userId,
          })
        ).length;
      }
    }
    await notify(context, [found.reporterId], {
      kind: "absence",
      subject: { type: "absence_report", id: found.id },
      params: {
        studentId: found.studentId,
        studentName: found.studentNameEn ?? found.studentNameAr ?? "",
        studentNameAr: found.studentNameAr ?? found.studentNameEn ?? "",
        date: found.from,
        report: input.decision,
      },
    });
    await audit(context, {
      action: AUDIT_ACTIONS[input.decision],
      objectType: "absence_report",
      objectId: input.id,
      subjectUserId: found.studentId,
      studentUserId: found.studentId,
      details: { explained },
    });
    return { explained };
  });
