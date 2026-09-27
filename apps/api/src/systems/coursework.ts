import type { Scope } from "@faridalms/database/stores/students";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  Rubric,
  SaveAssignment,
  TeacherTab,
} from "@faridalms/domain/coursework";

import {
  classById,
  classesTaughtBy,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import {
  assessmentOf,
  assignmentById,
  attemptById,
  attemptsOf,
  courseworkHost,
  ensureSubmission,
  groupsOf,
  insertAssignment,
  insertAttempt,
  isRecipient,
  learnerAssignments,
  namesOf,
  releaseAssessments,
  removeGroup,
  rubricsOf,
  saveAssessment,
  saveGroup,
  saveRubric,
  selectionOf,
  setAssignmentState,
  setRecipients,
  studentWork,
  teacherAssignments,
  touchSubmission,
  updateAssignment,
  withdrawAttempt,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  freezeCopy,
  saveDocument,
} from "@faridalms/database/stores/documents";
import {
  filesOfHost,
  linkFiles,
  rehostFiles,
  unlinkFiles,
} from "@faridalms/database/stores/files";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import {
  dayIn,
  holdYear,
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  GRACE_MS,
  assessSchema,
  assignmentIssue,
  assignmentPhase,
  canHandIn,
  effectiveScore,
  handInSchema,
  isLate,
  learnerState,
  publishIssues,
  publishSchema,
  rubricTotal,
  saveAssignmentSchema,
  saveDraftSchema,
  saveGroupSchema,
  saveRubricSchema,
  studentWorkActionSchema,
  teacherListSchema,
} from "@faridalms/domain/coursework";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader, registerHostWriter } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "classes:manage"),
  };
}

async function currentYear(context: UnitContext) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return workingYear(years, context.today);
}

async function requireOpenYear(context: UnitContext, yearId: string) {
  const lifecycle = await holdYear(context.tx, context.tenantId, yearId);
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
}

/** An assignment in a class the teacher reaches, or not found. */
async function taughtAssignment(context: UnitContext, assignmentId: string) {
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  if (
    !assignment ||
    assignment.orgId !== context.schoolId ||
    !(await teachesClass(context.tx, scopeOf(context), assignment.classId))
  )
    throw new ORPCError("NOT_FOUND");
  return assignment;
}

async function filesView(
  context: UnitContext,
  host: { type: string; id: string },
) {
  const rows = await filesOfHost(context.tx, context.tenantId, host);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
  }));
}

async function readable(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<boolean> {
  const owner = await courseworkHost(context.tx, context.tenantId, host);
  if (!owner) return false;
  const teacher =
    (can(context, "assignments:author") || can(context, "submissions:grade")) &&
    (await teachesClass(context.tx, scopeOf(context), owner.classId));
  if (host.type === "submission")
    return owner.studentId === context.actor.userId;
  if (teacher) return true;
  if (host.type === "submission_attempt")
    return (
      owner.studentId === context.actor.userId ||
      (can(context, "children:read") &&
        owner.studentId !== null &&
        (await isVisibleStudent(context.tx, scopeOf(context), owner.studentId)))
    );
  if (
    await isRecipient(
      context.tx,
      context.tenantId,
      owner.assignmentId,
      context.actor.userId,
    )
  )
    return true;
  if (!can(context, "children:read")) return false;
  const work = await studentWork(context.tx, {
    tenantId: context.tenantId,
    assignmentId: owner.assignmentId,
  });
  for (const row of work)
    if (await isVisibleStudent(context.tx, scopeOf(context), row.studentId))
      return true;
  return false;
}

registerHostReader("assignment", (context, hostId) =>
  readable(context, { type: "assignment", id: hostId }),
);
registerHostWriter("assignment", async (context, hostId) => {
  if (!can(context, "assignments:author")) return false;
  try {
    await taughtAssignment(context, hostId);
    return true;
  } catch {
    return false;
  }
});
registerHostReader("submission", (context, hostId) =>
  readable(context, { type: "submission", id: hostId }),
);
registerHostReader("submission_attempt", (context, hostId) =>
  readable(context, { type: "submission_attempt", id: hostId }),
);

/** The classes the viewer may set work for this year, with the choices the editor offers. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "assignments:author");
  const year = await currentYear(context);
  if (!year) return { year: null, classes: [], rubrics: [], terms: [] };
  const on = dayIn(year, context.today);
  const taught = await classesTaughtBy(context.tx, context, {
    userId: context.actor.userId,
    yearId: year.id,
    on,
  });
  const rubrics = await rubricsOf(
    context.tx,
    context.tenantId,
    context.actor.userId,
  );
  const terms = await termsOf(context.tx, context.tenantId, year.id);
  return {
    year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
    classes: taught
      .filter((row) => row.role === "teacher")
      .map((row) => ({
        id: row.id,
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        classType: row.classType,
        subjectId: row.subjectId,
        students: row.students,
      })),
    rubrics: rubrics.map((row) => ({
      id: row.id,
      title: row.title,
      rubric: row.criteria as unknown as Rubric,
    })),
    terms: terms.map((row) => ({
      id: row.id,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
    })),
  };
});

const TAB_PHASES: Record<
  TeacherTab,
  (phase: string, toGrade: number) => boolean
> = {
  to_grade: (_, toGrade) => toGrade > 0,
  assigned: (phase) => phase === "assigned",
  scheduled: (phase) => phase === "scheduled",
  drafts: (phase) => phase === "draft",
  past: (phase) =>
    phase === "past_due" || phase === "closed" || phase === "archived",
};

/** The coursework list: one tab of the classes the teacher reaches, with counts per tab. */
export const list = readProcedure
  .input(teacherListSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author", "submissions:grade");
    const year = await currentYear(context);
    if (!year)
      return {
        rows: [],
        counts: { to_grade: 0, assigned: 0, scheduled: 0, drafts: 0, past: 0 },
      };
    const rows = await teacherAssignments(context.tx, scopeOf(context), {
      yearId: year.id,
      classId: input.classId,
      q: input.q,
      now: context.now,
      graceMs: GRACE_MS,
    });
    const phased = rows.map((row) => ({
      ...row,
      phase: assignmentPhase(row, context.now),
    }));
    const counts = Object.fromEntries(
      (Object.keys(TAB_PHASES) as TeacherTab[]).map((tab) => [
        tab,
        phased.filter((row) => TAB_PHASES[tab](row.phase, row.toGrade)).length,
      ]),
    ) as Record<TeacherTab, number>;
    return {
      rows: phased.filter((row) =>
        TAB_PHASES[input.tab](row.phase, row.toGrade),
      ),
      counts,
    };
  });

/** What the editor opens with: the assignment, its brief, resources and audience. */
export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.id);
    const [brief, resources, selection] = await Promise.all([
      documentOf(context.tx, context.tenantId, {
        type: "assignment",
        id: assignment.id,
      }),
      filesView(context, { type: "assignment", id: assignment.id }),
      selectionOf(context.tx, context.tenantId, assignment.id),
    ]);
    return {
      ...assignment,
      rubric: assignment.rubric as unknown as Rubric | null,
      brief: (brief?.content ?? null) as ContentDocument | null,
      resources,
      selection:
        assignment.audience === "selected"
          ? selection
          : { groupIds: [], studentIds: [] },
    };
  });

function fieldsOf(input: SaveAssignment) {
  return {
    title: input.title,
    audience: input.audience,
    availableFrom: input.availableFrom || null,
    dueAt: input.dueAt || null,
    closesAt: input.closesAt || null,
    latePolicy: input.latePolicy,
    lateDeductionPercent: input.lateDeductionPercent ?? null,
    submissionFormat: input.submissionFormat,
    maxFiles: input.maxFiles,
    resubmission: input.resubmission,
    points: input.points,
    rubric: input.rubric as unknown as Record<string, unknown> | null,
    gradingPeriodId: input.gradingPeriodId || null,
  };
}

/**
 * Saves an assignment as a draft, or changes one already assigned. The brief
 * and resources are replaced by what was sent; a published assignment's
 * recipients follow its audience.
 */
export const save = writeProcedure
  .input(saveAssignmentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const issue = assignmentIssue(input);
    if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
    if (
      input.rubric &&
      input.points !== null &&
      rubricTotal(input.rubric) !== input.points
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.rubric_total",
      });
    const tx = context.tx;
    const classRow = await classById(tx, context, input.classId);
    if (!classRow || !(await teachesClass(tx, scopeOf(context), classRow.id)))
      throw new ORPCError("NOT_FOUND");
    await requireOpenYear(context, classRow.schoolYearId);
    let assignmentId: string;
    let version: number;
    let published = false;
    if (input.id) {
      const existing = await taughtAssignment(context, input.id);
      if (existing.classId !== classRow.id)
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.class_fixed",
        });
      const saved = await updateAssignment(tx, {
        tenantId: context.tenantId,
        id: existing.id,
        expectedVersion: input.expectedVersion ?? 0,
        ...fieldsOf(input),
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      assignmentId = existing.id;
      version = saved.version;
      published = existing.state === "published";
    } else {
      const created = await insertAssignment(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        classRow,
        authorUserId: context.actor.userId,
        ...fieldsOf(input),
      });
      assignmentId = created.id;
      version = created.version;
    }
    const host = { type: "assignment", id: assignmentId };
    await saveDocument(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      content: input.brief,
      plainText: contentPlainText(input.brief),
      mediaIds: contentFileIds(input.brief),
      userId: context.actor.userId,
    });
    const linked = await linkFiles(tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      ids: input.resourceFileIds,
      purpose: "attachment",
      host,
    });
    if (linked.length !== input.resourceFileIds.length)
      throw new ORPCError("BAD_REQUEST", { message: "file.not_attachable" });
    await unlinkFiles(tx, {
      tenantId: context.tenantId,
      host,
      keep: input.resourceFileIds,
    });
    const selection =
      input.audience === "selected"
        ? { groupIds: input.groupIds, studentIds: input.studentIds }
        : { groupIds: [], studentIds: [] };
    if (published || input.audience === "selected") {
      const year = (
        await schoolYears(tx, context.tenantId, context.schoolId)
      ).find((row) => row.id === classRow.schoolYearId);
      await setRecipients(tx, {
        tenantId: context.tenantId,
        assignmentId,
        classId: classRow.id,
        audience: published ? input.audience : "selected",
        selection,
        on: year ? dayIn(year, context.today) : context.today,
      });
    }
    await audit(context, {
      action: input.id ? "assignment.update" : "assignment.create",
      objectType: "assignment",
      objectId: assignmentId,
      details: { classId: classRow.id, title: input.title },
    });
    return { id: assignmentId, version };
  });

/** Assigns a draft: its recipients are recorded and it appears for them from its start. */
export const publish = writeProcedure
  .input(publishSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const tx = context.tx;
    const assignment = await taughtAssignment(context, input.id);
    if (assignment.state !== "draft")
      throw new ORPCError("CONFLICT", { message: "coursework.not_draft" });
    await requireOpenYear(context, assignment.schoolYearId);
    const [brief, selection] = await Promise.all([
      documentOf(tx, context.tenantId, {
        type: "assignment",
        id: assignment.id,
      }),
      selectionOf(tx, context.tenantId, assignment.id),
    ]);
    const issues = publishIssues({
      brief: (brief?.content ?? {
        root: { children: [] },
      }) as unknown as ContentDocument,
      audience: assignment.audience,
      groupIds: selection.groupIds,
      studentIds: selection.studentIds,
    });
    if (issues[0]) throw new ORPCError("BAD_REQUEST", { message: issues[0] });
    const year = (
      await schoolYears(tx, context.tenantId, context.schoolId)
    ).find((row) => row.id === assignment.schoolYearId);
    const recipients = await setRecipients(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      classId: assignment.classId,
      audience: assignment.audience,
      selection,
      on: year ? dayIn(year, context.today) : context.today,
    });
    if (recipients === 0)
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.audience_empty",
      });
    const saved = await setAssignmentState(tx, {
      tenantId: context.tenantId,
      id: assignment.id,
      expectedVersion: input.expectedVersion,
      state: "published",
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "assignment.publish",
      objectType: "assignment",
      objectId: assignment.id,
      details: { recipients },
    });
    return { version: saved.version, recipients };
  });

export const archive = writeProcedure
  .input(publishSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.id);
    const saved = await setAssignmentState(context.tx, {
      tenantId: context.tenantId,
      id: assignment.id,
      expectedVersion: input.expectedVersion,
      state: "archived",
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "assignment.archive",
      objectType: "assignment",
      objectId: assignment.id,
    });
    return saved;
  });

/** The assignment as its teacher reads it: brief, resources and everyone's standing. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author", "submissions:grade");
    const assignment = await taughtAssignment(context, input.id);
    const [brief, resources, work, classRow] = await Promise.all([
      documentOf(context.tx, context.tenantId, {
        type: "assignment",
        id: assignment.id,
      }),
      filesView(context, { type: "assignment", id: assignment.id }),
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      classById(context.tx, context, assignment.classId),
    ]);
    return {
      ...assignment,
      rubric: assignment.rubric as unknown as Rubric | null,
      phase: assignmentPhase(assignment, context.now),
      class: classRow
        ? {
            id: classRow.id,
            code: classRow.code,
            titleEn: classRow.titleEn,
            titleAr: classRow.titleAr,
          }
        : null,
      brief: (brief?.content ?? null) as ContentDocument | null,
      resources,
      work: work.map((row) => ({
        ...row,
        learnerState: learnerState(
          {
            availableFrom: assignment.availableFrom,
            dueAt: row.dueAt,
            excused: row.excused,
            needsRevision: row.needsRevision,
            hasDraft: row.hasDraft,
            latestAttempt: row.attemptId ? { isLate: row.isLate } : null,
            released: row.released,
          },
          context.now,
        ),
      })),
      access: {
        author: can(context, "assignments:author"),
        grade: can(context, "submissions:grade"),
      },
      now: context.now.toISOString(),
    };
  });

/** Return, return for revision, excuse or un-excuse the work of several students at once. */
export const act = writeProcedure
  .input(studentWorkActionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const tx = context.tx;
    const assignment = await taughtAssignment(context, input.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    const work = await studentWork(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const chosen = work.filter((row) =>
      input.studentIds.includes(row.studentId),
    );
    let changed = 0;
    for (const row of chosen) {
      if (input.action === "return" || input.action === "revise") {
        if (
          !row.attemptId ||
          !row.submissionId ||
          row.submissionVersion === null
        )
          continue;
        if (!row.assessmentId)
          await saveAssessment(tx, {
            tenantId: context.tenantId,
            attemptId: row.attemptId,
            submissionId: row.submissionId,
            studentId: row.studentId,
            score: null,
            effectiveScore: null,
            rubricScores: null,
            feedback: null,
            privateNote: null,
            userId: context.actor.userId,
          });
        await releaseAssessments(tx, context.tenantId, [row.attemptId]);
        await touchSubmission(tx, {
          tenantId: context.tenantId,
          id: row.submissionId,
          expectedVersion: row.submissionVersion,
          state: "returned",
          needsRevision: input.action === "revise",
        });
        changed += 1;
        continue;
      }
      const submission = await ensureSubmission(tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: row.studentId,
      });
      await touchSubmission(tx, {
        tenantId: context.tenantId,
        id: submission.id,
        expectedVersion: submission.version,
        excused: input.action === "excuse",
      });
      changed += 1;
    }
    await audit(context, {
      action: `submission.${input.action}`,
      objectType: "assignment",
      objectId: assignment.id,
      details: { students: chosen.map((row) => row.studentId) },
    });
    return { changed };
  });

async function attemptsView(
  context: UnitContext,
  submissionId: string,
  includeDrafts: boolean,
) {
  const attempts = await attemptsOf(context.tx, context.tenantId, submissionId);
  return Promise.all(
    attempts.map(async (attempt) => {
      const [document, files, assessment] = await Promise.all([
        documentOf(context.tx, context.tenantId, {
          type: "submission_attempt",
          id: attempt.id,
        }),
        filesView(context, { type: "submission_attempt", id: attempt.id }),
        assessmentOf(context.tx, context.tenantId, attempt.id),
      ]);
      const shown =
        assessment && (includeDrafts || assessment.releasedAt)
          ? assessment
          : null;
      return {
        ...attempt,
        content: (document?.content ?? null) as ContentDocument | null,
        files,
        assessment: shown
          ? {
              ...shown,
              privateNote: includeDrafts ? shown.privateNote : null,
            }
          : null,
      };
    }),
  );
}

/** One student's work on an assignment as the grader sees it, with the class list to move through. */
export const grading = readProcedure
  .input(v.object({ assignmentId: id, studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const assignment = await taughtAssignment(context, input.assignmentId);
    const work = await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const row = work.find((item) => item.studentId === input.studentId);
    if (!row) throw new ORPCError("NOT_FOUND");
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        points: assignment.points,
        rubric: assignment.rubric as unknown as Rubric | null,
        latePolicy: assignment.latePolicy,
        lateDeductionPercent: assignment.lateDeductionPercent,
      },
      student: row,
      attempts: row.submissionId
        ? await attemptsView(context, row.submissionId, true)
        : [],
      queue: work.map((item) => ({
        studentId: item.studentId,
        fullNameEn: item.fullNameEn,
        fullNameAr: item.fullNameAr,
        needsGrading:
          item.attemptId !== null && !item.released && !item.excused,
        released: item.released,
      })),
    };
  });

/** Saves the grader's judgement of an attempt as a draft; returning releases it. */
export const assess = writeProcedure
  .input(assessSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const tx = context.tx;
    const attempt = await attemptById(tx, context.tenantId, input.attemptId);
    if (!attempt) throw new ORPCError("NOT_FOUND");
    const assignment = await taughtAssignment(context, attempt.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    if (
      assignment.points !== null &&
      input.score !== null &&
      input.score > assignment.points
    )
      throw new ORPCError("BAD_REQUEST", { message: "coursework.score_range" });
    const saved = await saveAssessment(tx, {
      tenantId: context.tenantId,
      attemptId: input.attemptId,
      submissionId: attempt.submissionId,
      studentId: attempt.studentId,
      score: input.score,
      effectiveScore: effectiveScore(input.score, attempt.isLate, assignment),
      rubricScores: input.rubricScores,
      feedback: input.feedback || null,
      privateNote: input.privateNote || null,
      userId: context.actor.userId,
    });
    return saved;
  });

/** What the student works in: the brief, their draft, their attempts and returned grades. */
export const work = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "own-work:read");
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      input.id,
    );
    const recipient = assignment
      ? await isRecipient(
          context.tx,
          context.tenantId,
          assignment.id,
          context.actor.userId,
        )
      : null;
    if (!assignment || assignment.state !== "published" || !recipient)
      throw new ORPCError("NOT_FOUND");
    if (
      assignment.availableFrom &&
      Date.parse(assignment.availableFrom) > context.now.getTime()
    )
      throw new ORPCError("NOT_FOUND");
    const [brief, resources, rows, classRow] = await Promise.all([
      documentOf(context.tx, context.tenantId, {
        type: "assignment",
        id: assignment.id,
      }),
      filesView(context, { type: "assignment", id: assignment.id }),
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: context.actor.userId,
      }),
      classById(context.tx, context, assignment.classId),
    ]);
    const row = rows[0];
    if (!row) throw new ORPCError("NOT_FOUND");
    const draft = row.submissionId
      ? await documentOf(context.tx, context.tenantId, {
          type: "submission",
          id: row.submissionId,
        })
      : null;
    const attempts = row.submissionId
      ? await attemptsView(context, row.submissionId, false)
      : [];
    const dueAt = recipient.dueAt ?? assignment.dueAt;
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        availableFrom: assignment.availableFrom,
        dueAt,
        closesAt: assignment.closesAt,
        latePolicy: assignment.latePolicy,
        lateDeductionPercent: assignment.lateDeductionPercent,
        submissionFormat: assignment.submissionFormat,
        maxFiles: assignment.maxFiles,
        resubmission: assignment.resubmission,
        points: assignment.points,
        rubric: assignment.rubric as unknown as Rubric | null,
        class: classRow
          ? {
              id: classRow.id,
              code: classRow.code,
              titleEn: classRow.titleEn,
              titleAr: classRow.titleAr,
            }
          : null,
      },
      brief: (brief?.content ?? null) as ContentDocument | null,
      resources,
      submission: {
        id: row.submissionId,
        version: row.submissionVersion ?? 0,
        content: (draft?.content ?? null) as ContentDocument | null,
        files: row.submissionId
          ? await filesView(context, {
              type: "submission",
              id: row.submissionId,
            })
          : [],
      },
      attempts,
      state: learnerState(
        {
          availableFrom: assignment.availableFrom,
          dueAt,
          excused: row.excused,
          needsRevision: row.needsRevision,
          hasDraft: row.hasDraft,
          latestAttempt: row.attemptId ? { isLate: row.isLate } : null,
          released: row.released,
        },
        context.now,
      ),
      canHandIn:
        can(context, "own-work:submit") &&
        !row.excused &&
        canHandIn(
          {
            ...assignment,
            dueAt,
            resubmission: assignment.resubmission || row.needsRevision,
          },
          row.attempts,
          row.released || row.needsRevision,
          context.now,
        ),
      canUndo:
        can(context, "own-work:submit") &&
        row.attemptId !== null &&
        row.assessmentId === null,
      now: context.now.toISOString(),
    };
  });

async function learnerAssignment(context: UnitContext, assignmentId: string) {
  requireCapability(context, "own-work:submit");
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  const recipient = assignment
    ? await isRecipient(
        context.tx,
        context.tenantId,
        assignment.id,
        context.actor.userId,
      )
    : null;
  if (!assignment || assignment.state !== "published" || !recipient)
    throw new ORPCError("NOT_FOUND");
  await requireOpenYear(context, assignment.schoolYearId);
  return { assignment, dueAt: recipient.dueAt ?? assignment.dueAt };
}

/** Autosaves the student's draft: written work and attached files, nothing handed in. */
export const saveDraft = writeProcedure
  .input(saveDraftSchema)
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    const tx = context.tx;
    const submission = await ensureSubmission(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    if (
      input.expectedVersion !== 0 &&
      submission.version !== input.expectedVersion
    )
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    if (input.fileIds.length > assignment.maxFiles)
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.too_many_files",
      });
    const host = { type: "submission", id: submission.id };
    if (input.content)
      await saveDocument(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        content: input.content,
        plainText: contentPlainText(input.content),
        mediaIds: contentFileIds(input.content),
        userId: context.actor.userId,
      });
    const linked = await linkFiles(tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      ids: input.fileIds,
      purpose: "submission",
      host,
    });
    if (linked.length !== input.fileIds.length)
      throw new ORPCError("BAD_REQUEST", { message: "file.not_attachable" });
    await unlinkFiles(tx, {
      tenantId: context.tenantId,
      host,
      keep: input.fileIds,
    });
    const touched = await touchSubmission(tx, {
      tenantId: context.tenantId,
      id: submission.id,
      expectedVersion: submission.version,
    });
    return { version: touched?.version ?? submission.version };
  });

/**
 * Hands the draft in as a new attempt: the written work is frozen and the
 * files move onto the attempt, so later edits never change what was sent.
 */
export const handIn = writeProcedure
  .input(handInSchema)
  .handler(async ({ input, context }) => {
    const { assignment, dueAt } = await learnerAssignment(
      context,
      input.assignmentId,
    );
    const tx = context.tx;
    const submission = await ensureSubmission(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    if (
      input.expectedVersion !== 0 &&
      submission.version !== input.expectedVersion
    )
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const [row] = await studentWork(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    if (
      row.excused ||
      !canHandIn(
        {
          ...assignment,
          dueAt,
          resubmission: assignment.resubmission || row.needsRevision,
        },
        row.attempts,
        row.released || row.needsRevision,
        context.now,
      )
    )
      throw new ORPCError("CONFLICT", { message: "coursework.closed" });
    const draftHost = { type: "submission", id: submission.id };
    const [draft, draftFiles] = await Promise.all([
      documentOf(tx, context.tenantId, draftHost),
      filesOfHost(tx, context.tenantId, draftHost),
    ]);
    const hasText = Boolean(draft?.plainText.trim());
    const format = assignment.submissionFormat;
    if (
      (format === "online" && !hasText) ||
      (format === "files" && draftFiles.length === 0) ||
      (format === "both" && !hasText && draftFiles.length === 0)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.nothing_to_hand_in",
      });
    const attemptId = await insertAttempt(tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
      studentId: context.actor.userId,
      number: row.attempts + 1,
      isLate: isLate(dueAt, context.now),
      userId: context.actor.userId,
    });
    const attemptHost = { type: "submission_attempt", id: attemptId };
    if (draft)
      await freezeCopy(tx, {
        tenantId: context.tenantId,
        from: draftHost,
        to: attemptHost,
      });
    await rehostFiles(tx, {
      tenantId: context.tenantId,
      from: draftHost,
      to: attemptHost,
    });
    const saved = await touchSubmission(tx, {
      tenantId: context.tenantId,
      id: submission.id,
      expectedVersion: submission.version,
      state: "submitted",
      needsRevision: false,
    });
    await audit(context, {
      action: "submission.hand_in",
      objectType: "submission",
      objectId: submission.id,
      studentUserId: context.actor.userId,
      details: { assignmentId: assignment.id, attempt: row.attempts + 1 },
    });
    return { attemptId, version: saved?.version ?? submission.version };
  });

/** Takes back the latest attempt while nobody has assessed it; its work returns to the draft. */
export const undoHandIn = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    const tx = context.tx;
    const [row] = await studentWork(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    if (
      !row?.attemptId ||
      !row.submissionId ||
      row.submissionVersion === null ||
      row.assessmentId
    )
      throw new ORPCError("CONFLICT", { message: "coursework.cannot_undo" });
    if (!(await withdrawAttempt(tx, context.tenantId, row.attemptId)))
      throw new ORPCError("CONFLICT", { message: "coursework.cannot_undo" });
    await rehostFiles(tx, {
      tenantId: context.tenantId,
      from: { type: "submission_attempt", id: row.attemptId },
      to: { type: "submission", id: row.submissionId },
    });
    const saved = await touchSubmission(tx, {
      tenantId: context.tenantId,
      id: row.submissionId,
      expectedVersion: row.submissionVersion,
      state: row.attempts > 1 ? "returned" : "draft",
    });
    await audit(context, {
      action: "submission.undo",
      objectType: "submission",
      objectId: row.submissionId,
      studentUserId: context.actor.userId,
    });
    return { version: saved?.version ?? row.submissionVersion };
  });

function learnerView(
  rows: Awaited<ReturnType<typeof learnerAssignments>>,
  now: Date,
) {
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

/** The student's own coursework this year, each with its state. */
export const mine = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "own-work:read");
  const year = await currentYear(context);
  if (!year) return { rows: [], now: context.now.toISOString() };
  const rows = await learnerAssignments(context.tx, {
    tenantId: context.tenantId,
    studentId: context.actor.userId,
    yearId: year.id,
  });
  return {
    rows: learnerView(rows, context.now),
    now: context.now.toISOString(),
  };
});

/** A student's work this year as their family or school reads it: released results only. */
async function workOf(context: UnitContext, studentId: string) {
  if (!(await isVisibleStudent(context.tx, scopeOf(context), studentId)))
    throw new ORPCError("NOT_FOUND");
  const year = await currentYear(context);
  if (!year) return { rows: [], now: context.now.toISOString() };
  const rows = await learnerAssignments(context.tx, {
    tenantId: context.tenantId,
    studentId,
    yearId: year.id,
  });
  return {
    rows: learnerView(rows, context.now),
    now: context.now.toISOString(),
  };
}

/** A child's coursework for their family: never draft grades, never other students. */
export const child = readProcedure
  .input(v.object({ studentId: id }))
  .handler(({ input, context }) => {
    requireCapability(context, "children:read");
    requireCapability(context, "assignments:read");
    return workOf(context, input.studentId);
  });

/** A student's coursework for the staff who reach their record. */
export const student = readProcedure
  .input(v.object({ studentId: id }))
  .handler(({ input, context }) => {
    requireCapability(context, "people:read");
    requireCapability(context, "assignments:read");
    return workOf(context, input.studentId);
  });

/** A class's groups and roster, for choosing who gets work. */
export const groups = readProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !(await teachesClass(context.tx, scopeOf(context), classRow.id))
    )
      throw new ORPCError("NOT_FOUND");
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = years.find((row) => row.id === classRow.schoolYearId);
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      year ? dayIn(year, context.today) : context.today,
    );
    const names = await namesOf(context.tx, context.tenantId, roster);
    return {
      groups: await groupsOf(context.tx, context.tenantId, classRow.id),
      roster: names,
    };
  });

export const saveClassGroup = writeProcedure
  .input(saveGroupSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    if (!input.titleEn && !input.titleAr)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.name_required",
      });
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !(await teachesClass(context.tx, scopeOf(context), classRow.id))
    )
      throw new ORPCError("NOT_FOUND");
    const groupId = await saveGroup(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      classRow,
      titleEn: input.titleEn || null,
      titleAr: input.titleAr || null,
      studentIds: input.studentIds,
      userId: context.actor.userId,
    });
    return { id: groupId };
  });

export const removeClassGroup = writeProcedure
  .input(v.object({ id, classId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    if (!(await teachesClass(context.tx, scopeOf(context), input.classId)))
      throw new ORPCError("NOT_FOUND");
    const known = await groupsOf(context.tx, context.tenantId, input.classId);
    if (!known.some((row) => row.id === input.id))
      throw new ORPCError("NOT_FOUND");
    await removeGroup(context.tx, context.tenantId, input.id);
    return { removed: true };
  });

export const saveTeacherRubric = writeProcedure
  .input(saveRubricSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const saved = await saveRubric(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      ownerId: context.actor.userId,
      title: input.title,
      criteria: input.rubric,
    });
    if (!saved) throw new ORPCError("NOT_FOUND");
    return { id: saved };
  });
