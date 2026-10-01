import type {
  AssignmentRow,
  WorkRow,
} from "@faridalms/database/stores/coursework";
import type { Scope } from "@faridalms/database/stores/students";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  Rubric,
  SaveAssignment,
  TeacherTab,
} from "@faridalms/domain/coursework";
import type { QuizAnswer } from "@faridalms/domain/learning";

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
  setRecipientDue,
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
  publishedVersion,
  saveDocument,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import {
  filesOfHost,
  rehostFiles,
  unlinkFiles,
} from "@faridalms/database/stores/files";
import {
  markQuizAnswer as storeQuizMark,
  markQuizAttempt,
  quizAnswersOf,
  quizStarted,
  saveQuizAnswer as storeQuizAnswer,
} from "@faridalms/database/stores/quizzes";
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
  attemptScore,
  canTakeQuiz,
  effectiveScore,
  handInSchema,
  isLate,
  learnerState,
  markQuizAnswerSchema,
  publishIssues,
  publishSchema,
  rubricTotal,
  saveAssignmentSchema,
  saveDraftSchema,
  extendSchema,
  saveGroupSchema,
  saveQuizAnswerSchema,
  saveRubricSchema,
  studentWorkActionSchema,
  quizPoints,
  teacherListSchema,
} from "@faridalms/domain/coursework";
import {
  checkBlocks,
  isAuto,
  markResponse,
  quizViews,
  responseIssue,
  responseSchema,
  studentQuiz,
} from "@faridalms/domain/learning";
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
import {
  answersByAttempt,
  draftQuiz,
  publishQuiz,
  publishedQuiz,
  rescoreQuiz,
  responsesOf,
  saveQuiz,
} from "../core/quiz";
import {
  registerHostReader,
  registerHostWriter,
  placeMedia,
} from "../files/authorize";

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

/**
 * The brief its readers see. Once work is out that is what was last assigned
 * or updated: co-teachers write the brief together as they type, and their
 * edits wait for Update like every other change.
 */
async function readersBrief(
  context: UnitContext,
  assignment: { id: string; state: string },
): Promise<ContentDocument | null> {
  const document = await documentOf(context.tx, context.tenantId, {
    type: "assignment",
    id: assignment.id,
  });
  if (!document) return null;
  const published =
    assignment.state === "draft"
      ? null
      : await publishedVersion(context.tx, context.tenantId, document.id);
  return (published ?? document).content as unknown as ContentDocument;
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
registerHostReader("assignment_quiz", (context, hostId) =>
  readable(context, { type: "assignment", id: hostId }),
);
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

/** What the editor opens with: the assignment, its brief and audience. */
export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.id);
    const [brief, selection] = await Promise.all([
      documentOf(context.tx, context.tenantId, {
        type: "assignment",
        id: assignment.id,
      }),
      selectionOf(context.tx, context.tenantId, assignment.id),
    ]);
    const quiz =
      assignment.submissionFormat === "quiz"
        ? await draftQuiz(context, assignment.id)
        : null;
    return {
      ...assignment,
      rubric: assignment.rubric as unknown as Rubric | null,
      brief: (brief?.content ?? null) as ContentDocument | null,
      publishedBrief:
        assignment.state === "draft"
          ? null
          : await readersBrief(context, assignment),
      quiz:
        quiz && assignment.quizKeep && assignment.quizReveal
          ? {
              attempts: assignment.quizAttempts,
              keep: assignment.quizKeep,
              reveal: assignment.quizReveal,
              shuffle: assignment.quizShuffle,
              content: quiz,
              started:
                assignment.state !== "draft" &&
                (await quizStarted(
                  context.tx,
                  context.tenantId,
                  assignment.id,
                )),
            }
          : null,
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
    points: input.quiz ? quizPoints(input.quiz.content) || null : input.points,
    rubric: input.rubric as unknown as Record<string, unknown> | null,
    gradingPeriodId: input.gradingPeriodId || null,
    quizAttempts: input.quiz?.attempts ?? null,
    quizKeep: input.quiz?.keep ?? null,
    quizReveal: input.quiz?.reveal ?? null,
    quizShuffle: input.quiz?.shuffle ?? false,
  };
}

/**
 * Saves an assignment as a draft, or changes one already assigned. The brief,
 * with any files it holds, is replaced by what was sent; a published assignment's
 * recipients follow its audience, and its readers see the brief as sent here.
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
      // A draft saves itself as it is written, so its class may still change;
      // once assigned, students and their work belong to that class.
      if (existing.classId !== classRow.id && existing.state !== "draft")
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.class_fixed",
        });
      if (
        existing.state === "published" &&
        (existing.submissionFormat === "quiz") !==
          (input.submissionFormat === "quiz")
      )
        throw new ORPCError("CONFLICT", {
          message: "coursework.format_fixed",
        });
      const saved = await updateAssignment(tx, {
        tenantId: context.tenantId,
        id: existing.id,
        classRow,
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
    const document = await saveDocument(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(
        context,
        host,
        input.brief,
        contentFileIds(input.brief),
      )),
      plainText: contentPlainText(input.brief),
      userId: context.actor.userId,
    });
    if (published)
      await snapshotPublish(tx, {
        tenantId: context.tenantId,
        documentId: document.id,
        userId: context.actor.userId,
      });
    if (input.quiz)
      await saveQuiz(context, { assignmentId, quiz: input.quiz, published });
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
    const quiz =
      assignment.submissionFormat === "quiz"
        ? ((await draftQuiz(context, assignment.id)) ?? {
            version: 2 as const,
            blocks: [],
          })
        : null;
    const issues = publishIssues({
      brief: (brief?.content ?? {
        root: { children: [] },
      }) as unknown as ContentDocument,
      audience: assignment.audience,
      groupIds: selection.groupIds,
      studentIds: selection.studentIds,
      quiz,
    });
    if (issues[0]) throw new ORPCError("BAD_REQUEST", { message: issues[0] });
    if (brief)
      await snapshotPublish(tx, {
        tenantId: context.tenantId,
        documentId: brief.id,
        userId: context.actor.userId,
      });
    if (quiz) await publishQuiz(context, assignment.id);
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

/** The assignment as its teacher reads it: brief and everyone's standing. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author", "submissions:grade");
    const assignment = await taughtAssignment(context, input.id);
    const [brief, work, classRow] = await Promise.all([
      readersBrief(context, assignment),
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
      brief,
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

/**
 * Hands in for a student whatever their draft holds, as for work done on
 * paper or away from a screen. A quiz is answered only by its student, and
 * work already with the teacher is left as it is.
 */
async function handInFor(
  context: UnitContext,
  input: {
    assignment: { id: string; state: string; submissionFormat: string };
    row: WorkRow;
  },
): Promise<boolean> {
  const { assignment, row } = input;
  if (
    assignment.state !== "published" ||
    assignment.submissionFormat === "quiz"
  )
    return false;
  if (row.excused) return false;
  if (row.attemptId && !row.released && !row.needsRevision) return false;
  const tx = context.tx;
  const submission = await ensureSubmission(tx, {
    tenantId: context.tenantId,
    assignmentId: assignment.id,
    studentId: row.studentId,
  });
  const attemptId = await insertAttempt(tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    studentId: row.studentId,
    number: row.attempts + 1,
    isLate: isLate(row.dueAt, context.now),
    userId: context.actor.userId,
  });
  const draftHost = { type: "submission", id: submission.id };
  const attemptHost = { type: "submission_attempt", id: attemptId };
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
  await touchSubmission(tx, {
    tenantId: context.tenantId,
    id: submission.id,
    expectedVersion: submission.version,
    state: "submitted",
    needsRevision: false,
  });
  return true;
}

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
      if (input.action === "hand_in") {
        if (await handInFor(context, { assignment, row })) changed += 1;
        continue;
      }
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

/** Moves the due time for some students, or gives them the assignment's again. */
export const extend = writeProcedure
  .input(extendSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    if (assignment.state !== "published")
      throw new ORPCError("CONFLICT", { message: "coursework.not_assigned" });
    if (
      input.dueAt &&
      assignment.availableFrom &&
      Date.parse(input.dueAt) < Date.parse(assignment.availableFrom)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.due_before_available",
      });
    const changed = await setRecipientDue(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentIds: input.studentIds,
      dueAt: input.dueAt || null,
    });
    await audit(context, {
      action: "assignment.extend",
      objectType: "assignment",
      objectId: assignment.id,
      details: { students: input.studentIds, dueAt: input.dueAt || null },
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
      const content = (document?.content ?? null) as ContentDocument | null;
      // Files handed in beside the answer, before answers held them.
      const inAnswer = new Set(content ? contentFileIds(content) : []);
      const shown =
        assessment && (includeDrafts || assessment.releasedAt)
          ? assessment
          : null;
      return {
        ...attempt,
        content,
        files: files.filter((file) => !inAnswer.has(file.id)),
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

/** Every handed-in quiz attempt of one student, marked, for their teacher. */
async function graderQuiz(
  context: UnitContext,
  assignmentId: string,
  submissionId: string,
) {
  const document = await publishedQuiz(context, assignmentId);
  if (!document) return null;
  const [byAttempt, attempts] = await Promise.all([
    answersByAttempt(context, submissionId),
    attemptsOf(context.tx, context.tenantId, submissionId),
  ]);
  return {
    blocks: studentQuiz(document, "grading", false),
    total: quizPoints(document),
    attempts: attempts.map((attempt) => {
      const answers = byAttempt.get(attempt.number) ?? [];
      return {
        attemptId: attempt.id,
        number: attempt.number,
        score: attemptScore(
          document,
          Object.fromEntries(
            answers.map((answer) => [answer.blockId, answer.fraction]),
          ),
        ),
        responses: responsesOf(answers),
        checks: quizViews(document, answers, "answers"),
      };
    }),
  };
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
    const quiz =
      assignment.submissionFormat === "quiz" && row.submissionId
        ? await graderQuiz(context, assignment.id, row.submissionId)
        : null;
    return {
      quiz,
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
    const [brief, rows, classRow] = await Promise.all([
      readersBrief(context, assignment),
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
    const quiz =
      assignment.submissionFormat === "quiz"
        ? await learnerQuiz(context, { assignment, row, dueAt })
        : null;
    return {
      quiz,
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
      brief,
      submission: {
        id: row.submissionId,
        version: row.submissionVersion ?? 0,
        content: (draft?.content ?? null) as ContentDocument | null,
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
        assignment.submissionFormat !== "quiz" &&
        row.attemptId !== null &&
        row.assessmentId === null,
      now: context.now.toISOString(),
    };
  });

/**
 * A quiz as its student works on it: the questions in their order, the
 * answers kept so far on the attempt they are on, and each handed-in
 * attempt's result as far as the quiz shows it.
 */
async function learnerQuiz(
  context: UnitContext,
  input: { assignment: AssignmentRow; row: WorkRow; dueAt: string | null },
) {
  const { assignment, row } = input;
  const document = await publishedQuiz(context, assignment.id);
  if (!document) return null;
  const [byAttempt, attempts] = row.submissionId
    ? await Promise.all([
        answersByAttempt(context, row.submissionId),
        attemptsOf(context.tx, context.tenantId, row.submissionId),
      ])
    : [new Map<number, QuizAnswer[]>(), []];
  const current = row.attempts + 1;
  const results = await Promise.all(
    attempts.map(async (attempt) => {
      const answers = byAttempt.get(attempt.number) ?? [];
      const assessment = await assessmentOf(
        context.tx,
        context.tenantId,
        attempt.id,
      );
      const show = assessment?.releasedAt
        ? "answers"
        : assignment.quizReveal === "returned"
          ? null
          : assignment.quizReveal;
      return {
        number: attempt.number,
        submittedAt: attempt.submittedAt,
        isLate: attempt.isLate,
        score: show
          ? attemptScore(
              document,
              Object.fromEntries(
                answers.map((answer) => [answer.blockId, answer.fraction]),
              ),
            )
          : null,
        pending: answers.some((answer) => answer.state === "needs_marking"),
        responses: responsesOf(answers),
        checks: show ? quizViews(document, answers, show) : null,
      };
    }),
  );
  return {
    blocks: studentQuiz(
      document,
      `${context.actor.userId}:${current}`,
      assignment.quizShuffle,
    ),
    total: quizPoints(document),
    attempt: current,
    attemptsAllowed: assignment.quizAttempts,
    attemptsUsed: row.attempts,
    keep: assignment.quizKeep,
    reveal: assignment.quizReveal,
    open:
      can(context, "own-work:submit") &&
      !row.excused &&
      canTakeQuiz(
        { ...assignment, dueAt: input.dueAt },
        row.attempts,
        assignment.quizAttempts,
        context.now,
      ),
    drafts: responsesOf(byAttempt.get(current) ?? []),
    results,
  };
}

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
    const host = { type: "submission", id: submission.id };
    // Files are blocks in the answer: they join the submission as it is
    // saved, and one taken out of the answer leaves it.
    let kept: string[] = [];
    if (input.content) {
      const placed = await placeMedia(
        context,
        host,
        input.content,
        contentFileIds(input.content),
      );
      if (placed.mediaIds.length > assignment.maxFiles)
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.too_many_files",
        });
      await saveDocument(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        ...placed,
        plainText: contentPlainText(input.content),
        userId: context.actor.userId,
      });
      kept = placed.mediaIds;
    }
    await unlinkFiles(tx, { tenantId: context.tenantId, host, keep: kept });
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
    if (assignment.submissionFormat === "quiz")
      return handInQuiz(context, { assignment, dueAt, submission, row });
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

/**
 * Hands in the attempt a student is on: every answer is marked at once, a
 * written one waits for the teacher when it carries points, and the score
 * that counts goes to the gradebook.
 */
interface QuizMark {
  blockId: string;
  fraction: number | null;
  state: "marked" | "needs_marking";
}

async function handInQuiz(
  context: UnitContext,
  input: {
    assignment: AssignmentRow;
    dueAt: string | null;
    submission: { id: string; version: number };
    row: WorkRow;
  },
) {
  const { assignment, submission, row } = input;
  const tx = context.tx;
  if (
    row.excused ||
    !canTakeQuiz(
      { ...assignment, dueAt: input.dueAt },
      row.attempts,
      assignment.quizAttempts,
      context.now,
    )
  )
    throw new ORPCError("CONFLICT", { message: "coursework.closed" });
  const document = await publishedQuiz(context, assignment.id);
  if (!document) throw new ORPCError("NOT_FOUND");
  const number = row.attempts + 1;
  const answers = await quizAnswersOf(tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    attempt: number,
  });
  if (answers.length === 0)
    throw new ORPCError("BAD_REQUEST", {
      message: "coursework.nothing_to_hand_in",
    });
  const attemptId = await insertAttempt(tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    studentId: context.actor.userId,
    number,
    isLate: isLate(input.dueAt, context.now),
    userId: context.actor.userId,
  });
  const blocks = checkBlocks(document);
  await markQuizAttempt(tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    attempt: number,
    marks: answers.flatMap((answer): QuizMark[] => {
      const block = blocks.find((item) => item.id === answer.blockId);
      const response = v.safeParse(responseSchema, answer.response);
      if (!block) return [];
      if (isAuto(block))
        return [
          {
            blockId: block.id,
            fraction: response.success
              ? markResponse(block, response.output).fraction
              : 0,
            state: "marked",
          },
        ];
      return [
        {
          blockId: block.id,
          fraction: null,
          state: block.points > 0 ? "needs_marking" : "marked",
        },
      ];
    }),
  });
  const scored = await rescoreQuiz(context, {
    assignment,
    document,
    submissionId: submission.id,
    studentId: context.actor.userId,
    graderId: null,
    release: true,
  });
  const returned = !scored.pending && assignment.quizReveal !== "returned";
  const saved = await touchSubmission(tx, {
    tenantId: context.tenantId,
    id: submission.id,
    expectedVersion: submission.version,
    state: returned ? "returned" : "submitted",
    needsRevision: false,
  });
  await audit(context, {
    action: "submission.hand_in",
    objectType: "submission",
    objectId: submission.id,
    studentUserId: context.actor.userId,
    details: { assignmentId: assignment.id, attempt: number, quiz: true },
  });
  return { attemptId, version: saved?.version ?? submission.version };
}

/** Takes back the latest attempt while nobody has assessed it; its work returns to the draft. */
export const undoHandIn = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    if (assignment.submissionFormat === "quiz")
      throw new ORPCError("CONFLICT", { message: "coursework.cannot_undo" });
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

/** Keeps a student's answer to one quiz question while their attempt is open. */
export const saveQuizAnswer = writeProcedure
  .input(saveQuizAnswerSchema)
  .handler(async ({ input, context }) => {
    const { assignment, dueAt } = await learnerAssignment(
      context,
      input.assignmentId,
    );
    if (assignment.submissionFormat !== "quiz")
      throw new ORPCError("BAD_REQUEST", { message: "coursework.not_quiz" });
    const tx = context.tx;
    const submission = await ensureSubmission(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    const [row] = await studentWork(tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    if (
      row.excused ||
      !canTakeQuiz(
        { ...assignment, dueAt },
        row.attempts,
        assignment.quizAttempts,
        context.now,
      )
    )
      throw new ORPCError("CONFLICT", { message: "coursework.closed" });
    const document = await publishedQuiz(context, assignment.id);
    const block = document
      ? checkBlocks(document).find((item) => item.id === input.blockId)
      : undefined;
    if (!block) throw new ORPCError("NOT_FOUND");
    const issue = input.response ? responseIssue(block, input.response) : null;
    if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
    await storeQuizAnswer(tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
      studentId: context.actor.userId,
      attempt: row.attempts + 1,
      blockId: block.id,
      response: input.response,
    });
    return { saved: true };
  });

/** A teacher marks a written quiz answer out of its points; the score that counts follows. */
export const markQuizAnswer = writeProcedure
  .input(markQuizAnswerSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const tx = context.tx;
    const attempt = await attemptById(tx, context.tenantId, input.attemptId);
    if (!attempt) throw new ORPCError("NOT_FOUND");
    const assignment = await taughtAssignment(context, attempt.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    const document =
      assignment.submissionFormat === "quiz"
        ? await publishedQuiz(context, assignment.id)
        : null;
    const block = document
      ? checkBlocks(document).find((item) => item.id === input.blockId)
      : undefined;
    if (!document || block?.type !== "written")
      throw new ORPCError("NOT_FOUND");
    if (input.points > block.points)
      throw new ORPCError("BAD_REQUEST", { message: "learning.points_over" });
    const marked = await storeQuizMark(tx, {
      tenantId: context.tenantId,
      submissionId: attempt.submissionId,
      attempt: attempt.number,
      blockId: block.id,
      fraction:
        block.points === 0
          ? null
          : Math.round((input.points / block.points) * 10000) / 10000,
      feedback: input.feedback || null,
      userId: context.actor.userId,
    });
    if (!marked) throw new ORPCError("NOT_FOUND");
    await rescoreQuiz(context, {
      assignment,
      document,
      submissionId: attempt.submissionId,
      studentId: attempt.studentId,
      graderId: context.actor.userId,
      release: false,
    });
    await audit(context, {
      action: "submission.mark_answer",
      objectType: "submission",
      objectId: attempt.submissionId,
      studentUserId: attempt.studentId,
      details: { blockId: block.id, points: input.points },
    });
    return { marked: true };
  });
