import type { AbsenceReport } from "@faridalms/database/stores/absence-reports";
import type { ChildLink } from "@faridalms/database/stores/persons";

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
} from "@faridalms/database/stores/attendance";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import { childrenOf } from "@faridalms/database/stores/persons";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { schoolYears } from "@faridalms/database/stores/years";
import {
  absenceReportSchema,
  decideReportSchema,
  familyReportsSchema,
  REPORT_DAYS_BACK,
  reportInboxSchema,
  withdrawReportSchema,
} from "@faridalms/domain/attendance";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { scopeOf } from "../core/coursework-access";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader } from "../files/authorize";
import { withFileGate } from "../files/gate";

/** The links of a family member to the children they follow; none for anyone else. */
async function familyLinks(context: UnitContext): Promise<ChildLink[]> {
  if (context.actor.context !== "family" || !can(context, "children:read"))
    return [];
  return childrenOf(context.tx, scopeOf(context), context.actor.userId);
}

const followed = (links: readonly ChildLink[]) =>
  links.map((link) => link.studentId);

/** Reporting an absence is a decision for the child, which restricted rights do not reach. */
const deciding = (links: readonly ChildLink[]) =>
  links
    .filter((link) => link.educationalRights === "full")
    .map((link) => link.studentId);

/** Who may see a report: its family, and the office. */
async function mayRead(context: UnitContext, report: AbsenceReport) {
  if (report.reporterId === context.actor.userId) return true;
  if (can(context, "attendance:manage")) return true;
  return followed(await familyLinks(context)).includes(report.studentId);
}

// A note a family sent with a report is read by whoever may read the report.
registerHostReader("absence_report", async (context, reportId) => {
  const report = await reportById(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    id: reportId,
  });
  return report !== null && (await mayRead(context, report));
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

/** A family's reports for their children, and the reasons they may give. */
export const mine = readProcedure
  .input(familyReportsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const links = await familyLinks(context);
    const children = followed(links);
    const studentIds = input.studentId
      ? children.filter((id) => id === input.studentId)
      : children;
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
      mayReport: studentIds.some((id) => deciding(links).includes(id)),
    };
  });

/**
 * A family tells the school a child will be away, late or leaving early,
 * or asks for leave ahead. The office may also record one a family phoned
 * in, for any student it can see.
 */
export const report = writeProcedure
  .input(absenceReportSchema)
  .handler(async ({ input, context }) => {
    const office = can(context, "attendance:manage");
    if (office) {
      if (
        !(await isVisibleStudent(context.tx, scopeOf(context), input.studentId))
      )
        throw new ORPCError("NOT_FOUND");
    } else {
      const links = await familyLinks(context);
      if (!followed(links).includes(input.studentId))
        throw new ORPCError("NOT_FOUND");
      if (!deciding(links).includes(input.studentId))
        throw new ORPCError("FORBIDDEN");
    }
    if (input.from < addDays(context.today, -REPORT_DAYS_BACK))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.report_late" });
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = years.find(
      (row) => row.startsOn <= input.from && input.to < row.endsBefore,
    );
    if (!year || year.lifecycle === "closed")
      throw new ORPCError("BAD_REQUEST", {
        message: "attendance.outside_year",
      });
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
      yearId: year.id,
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
    const found = await reportById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
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
    const found = await reportById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
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
      action: `attendance.report_${input.decision}`,
      objectType: "absence_report",
      objectId: input.id,
      subjectUserId: found.studentId,
      studentUserId: found.studentId,
      details: { explained },
    });
    return { explained };
  });
