import type {
  AssignmentRow,
  WorkRow,
} from "@faridalms/database/stores/coursework";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  CommentAnchor,
  Rubric,
  SaveAssignment,
  TeacherTab,
} from "@faridalms/domain/coursework";
import type { LessonResponse, QuizAnswer } from "@faridalms/domain/learning";

import {
  classById,
  classesTaughtBy,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import {
  isShared,
  shareAttempts,
  sharedWorkOf,
  unshareAttempts,
  assessmentOf,
  assignmentById,
  attemptById,
  attemptsOf,
  bankCommentById,
  bankCommentsOf,
  commentById,
  commentsOf,
  courseworkHost,
  ensureSubmission,
  groupsOf,
  insertAssignment,
  insertAttempt,
  insertBankComment,
  insertComment,
  insertReply,
  isRecipient,
  learnerAssignments,
  namesOf,
  releaseAssessments,
  releaseComments,
  removeBankComment,
  removeComment,
  removeGroup,
  restoreComment,
  rubricsOf,
  saveAssessment,
  saveGroup,
  saveRubric,
  selectionOf,
  setAssignmentState,
  setCommentState,
  setRecipientDue,
  setRecipients,
  studentWork,
  teacherAssignments,
  touchSubmission,
  unansweredComments,
  updateAssignment,
  updateBankComment,
  updateComment,
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
  authenticationsOf,
  insertDeclaration,
} from "@faridalms/database/stores/exams";
import {
  adoptFiles,
  filesOfHost,
  linkFiles,
  rehostFiles,
  unlinkFiles,
} from "@faridalms/database/stores/files";
import { classCategories } from "@faridalms/database/stores/grading";
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
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  contentFileIds,
  contentPlainText,
  starterOf,
  withBlockIds,
  withoutStarter,
} from "@faridalms/domain/content";
import {
  GRACE_MS,
  answerCommentSchema,
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
  removeCommentSchema,
  replyToCommentSchema,
  restoreCommentSchema,
  publishSchema,
  rubricTotal,
  saveAssignmentSchema,
  saveBankCommentSchema,
  saveCommentSchema,
  saveDraftSchema,
  extendSchema,
  feedbackRecordingSchema,
  saveGroupSchema,
  saveQuizAnswerSchema,
  saveQuizProgramSchema,
  saveRubricSchema,
  showGradeSchema,
  studentWorkActionSchema,
  quizIssue,
  quizPoints,
  teacherListSchema,
} from "@faridalms/domain/coursework";
import { DECLARATION_STATEMENT } from "@faridalms/domain/exams";
import {
  checkBlocks,
  isAuto,
  isTeacherMarked,
  markResponse,
  quizViews,
  responseFiles,
  responseIssue,
  responseSchema,
  studentQuiz,
} from "@faridalms/domain/learning";
import { quizIntro, quizOfBrief } from "@faridalms/domain/lesson-content";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { markedProgram } from "../coding/mark";
import {
  assessedRules,
  attemptMarks,
  confirmedAttempts,
  declarationProblem,
} from "../core/assessed";
import {
  learnerAssignment,
  requireOpenYear,
  scopeOf,
  taughtAssignment,
} from "../core/coursework-access";
import { gradeReader } from "../core/grades";
import {
  audit,
  can,
  openUnit,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import {
  answersByAttempt,
  briefForEditing,
  draftQuiz,
  keepStartedQuestions,
  publishKeptApart,
  ownResponsesOf,
  publishedQuiz,
  rescoreQuiz,
  responsesOf,
} from "../core/quiz";
import {
  registerArea,
  registerOpenWork,
  registerHostReader,
  registerHostWriter,
  registerLiveRules,
  placeMedia,
} from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

async function currentYear(context: UnitContext) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return workingYear(years, context.today);
}

/**
 * The brief its readers see. Once work is out that is what was last assigned
 * or updated: co-teachers write the brief together as they type, and their
 * edits wait for Update like every other change.
 */
async function readersBrief(
  context: UnitContext,
  assignment: { id: string; state: string; submissionFormat: string },
  reader: "teacher" | "student" | "editor" = "teacher",
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
  const content = (published ?? document).content as unknown as ContentDocument;
  if (reader === "editor") return content;
  // A quiz's brief holds its answers; readers get the words before the
  // first question, and meet the questions as the quiz gives them.
  const shown =
    assignment.submissionFormat === "quiz" ? quizIntro(content) : content;
  // Students meet the part set aside for each of them in their own answer.
  return reader === "student" ? withoutStarter(shown) : shown;
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
  // A family reads handed-in work only once a teacher has shared it.
  if (host.type === "submission_attempt")
    return (
      owner.studentId === context.actor.userId ||
      (can(context, "children:read") &&
        owner.studentId !== null &&
        (await isVisibleStudent(
          context.tx,
          scopeOf(context),
          owner.studentId,
        )) &&
        (await isShared(context.tx, context.tenantId, host.id)))
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
/**
 * A class's file area holds what its teachers put in its assignments'
 * documents, shown wherever the class uses it rather than copied each time.
 * Its teachers read all of it; students and families only what a document
 * they may read shows.
 */
registerArea("class", {
  reader: async (context, classId) =>
    (can(context, "assignments:author") || can(context, "submissions:grade")) &&
    (await teachesClass(context.tx, scopeOf(context), classId)),
  writer: async (context, classId) =>
    can(context, "assignments:author") &&
    (await teachesClass(context.tx, scopeOf(context), classId)),
  holders: {
    assignment: async (context, assignmentId) => {
      const owner = await courseworkHost(context.tx, context.tenantId, {
        type: "assignment",
        id: assignmentId,
      });
      return owner ? { type: "class", id: owner.classId } : null;
    },
  },
});
registerHostReader("assignment_quiz", (context, hostId) =>
  readable(context, { type: "assignment", id: hostId }),
);
registerLiveRules("assignment_quiz", { keyed: () => Promise.resolve(true) });
registerLiveRules("assignment", {
  keyed: async (context, hostId) =>
    (await assignmentById(context.tx, context.tenantId, hostId))
      ?.submissionFormat === "quiz",
  // A quiz whose questions are still kept apart has them written into its
  // brief before a room opens on it, since the room starts from the brief.
  prepare: async (context, hostId) => {
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      hostId,
    );
    if (assignment?.submissionFormat !== "quiz") return;
    const host = { type: "assignment", id: hostId };
    const stored = await documentOf(context.tx, context.tenantId, host);
    if (!stored) return;
    const brief = stored.content as unknown as ContentDocument;
    const written = await briefForEditing(context, hostId, brief, false);
    if (written === brief) return;
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(
        context,
        host,
        { ...written },
        contentFileIds(written),
      )),
      plainText: contentPlainText(written),
      userId: context.actor.userId,
    });
  },
});
registerHostReader("submission", (context, hostId) =>
  readable(context, { type: "submission", id: hostId }),
);
registerHostReader("submission_attempt", (context, hostId) =>
  readable(context, { type: "submission_attempt", id: hostId }),
);
// A grader's voice feedback on an attempt: its graders hear it at once,
// whoever reads the attempt hears it once the work is returned.
registerHostReader("attempt_feedback", async (context, attemptId) => {
  const host = { type: "submission_attempt", id: attemptId };
  if (!(await readable(context, host))) return false;
  const owner = await courseworkHost(context.tx, context.tenantId, host);
  if (
    owner &&
    can(context, "submissions:grade") &&
    (await teachesClass(context.tx, scopeOf(context), owner.classId))
  )
    return true;
  const assessment = await assessmentOf(
    context.tx,
    context.tenantId,
    attemptId,
  );
  return Boolean(assessment?.releasedAt ?? assessment?.commentsReleasedAt);
});

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
    const isQuiz = assignment.submissionFormat === "quiz";
    const quiz = isQuiz ? await draftQuiz(context, assignment.id) : null;
    const stored = (brief?.content ?? null) as ContentDocument | null;
    const sent =
      assignment.state === "draft"
        ? null
        : await readersBrief(context, assignment, "editor");
    return {
      ...assignment,
      rubric: assignment.rubric as unknown as Rubric | null,
      brief:
        stored && isQuiz
          ? await briefForEditing(context, assignment.id, stored, false)
          : stored,
      publishedBrief:
        sent && isQuiz
          ? await briefForEditing(context, assignment.id, sent, true)
          : sent,
      quiz:
        quiz && assignment.quizKeep && assignment.quizReveal
          ? {
              attempts: assignment.quizAttempts,
              keep: assignment.quizKeep,
              reveal: assignment.quizReveal,
              shuffle: assignment.quizShuffle,
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
    points: input.quiz
      ? quizPoints(quizOfBrief(input.brief)) || null
      : input.points,
    rubric: input.rubric as unknown as Record<string, unknown> | null,
    gradingPeriodId: input.gradingPeriodId || null,
    categoryId: input.categoryId || null,
    quizAttempts: input.quiz?.attempts ?? null,
    quizKeep: input.quiz?.keep ?? null,
    quizReveal: input.quiz?.reveal ?? null,
    quizShuffle: input.quiz?.shuffle ?? false,
    // A quiz marks itself, so it has no comments to answer first.
    gradeAfterAnswers: !input.quiz && input.gradeAfterAnswers,
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
    if (
      input.categoryId &&
      !(
        await classCategories(tx, {
          tenantId: context.tenantId,
          classId: classRow.id,
        })
      ).some((row) => row.id === input.categoryId)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.category_unknown",
      });
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
    if (input.quiz && published) {
      const unfinished = quizIssue(quizOfBrief(input.brief));
      if (unfinished)
        throw new ORPCError("BAD_REQUEST", { message: unfinished });
      await keepStartedQuestions(context, { assignmentId, brief: input.brief });
    }
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
    if (quiz) await publishKeptApart(context, assignment.id);
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
    const [grade, rules] = await Promise.all([
      gradeReader(
        context,
        work.map((row) => row.gradeScaleVersionId),
      ),
      assessedRules(context, assignment.id),
    ]);
    const marks = rules
      ? await attemptMarks(
          context,
          work.flatMap((row) => (row.attemptId ? [row.attemptId] : [])),
        )
      : null;
    return {
      ...assignment,
      assessed: rules
        ? { declarationRequired: rules.declarationRequired }
        : null,
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
        grade: grade(
          row.gradeScaleVersionId,
          row.effectiveScore ?? row.score,
          assignment.points,
        ),
        coursework:
          marks && row.attemptId ? (marks.get(row.attemptId) ?? null) : null,
        learnerState: learnerState(
          {
            availableFrom: assignment.availableFrom,
            dueAt: row.dueAt,
            excused: row.excused,
            needsRevision: row.needsRevision,
            hasDraft: row.hasDraft,
            latestAttempt: row.attemptId ? { isLate: row.isLate } : null,
            released: row.released || row.held,
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
  if (row.attemptId && !row.released && !row.held && !row.needsRevision)
    return false;
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
  const draft = await documentOf(tx, context.tenantId, draftHost);
  await rehostFiles(tx, {
    tenantId: context.tenantId,
    from: draftHost,
    to: attemptHost,
    ids: draft
      ? contentFileIds(draft.content as unknown as ContentDocument)
      : [],
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
    // Assessed coursework goes back with a grade only once its teacher has
    // confirmed it, and confirmed work is final, so it is not sent back.
    let held = 0;
    const checking =
      input.action === "return" || input.action === "revise"
        ? await assessedRules(context, assignment.id)
        : null;
    const confirmed = checking
      ? await confirmedAttempts(
          context,
          chosen.flatMap((row) => (row.attemptId ? [row.attemptId] : [])),
        )
      : new Set<string>();
    if (input.action === "share" || input.action === "unshare") {
      const handedIn = chosen.flatMap((row) =>
        row.attemptId
          ? [{ attemptId: row.attemptId, studentId: row.studentId }]
          : [],
      );
      if (input.action === "share")
        await shareAttempts(tx, {
          tenantId: context.tenantId,
          shares: handedIn,
          userId: context.actor.userId,
        });
      else
        await unshareAttempts(tx, {
          tenantId: context.tenantId,
          attemptIds: handedIn.map((share) => share.attemptId),
        });
      changed = handedIn.length;
    } else
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
          if (
            checking &&
            confirmed.has(row.attemptId) === (input.action === "revise")
          ) {
            held += 1;
            continue;
          }
          if (!row.assessmentId)
            await saveAssessment(tx, {
              tenantId: context.tenantId,
              attemptId: row.attemptId,
              submissionId: row.submissionId,
              studentId: row.studentId,
              score: null,
              effectiveScore: null,
              rubricScores: null,
              rubricComments: null,
              feedback: null,
              privateNote: null,
              userId: context.actor.userId,
              today: context.today,
            });
          // Held grades wait for the student to answer every comment first.
          if (
            assignment.gradeAfterAnswers &&
            (await unansweredComments(tx, context.tenantId, row.attemptId)) > 0
          )
            await releaseComments(tx, context.tenantId, [row.attemptId]);
          else await releaseAssessments(tx, context.tenantId, [row.attemptId]);
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
    return held ? { changed, held } : { changed };
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
  points: number | null,
) {
  const attempts = await attemptsOf(context.tx, context.tenantId, submissionId);
  const views = await Promise.all(
    attempts.map(async (attempt) => {
      const [document, files, assessment, comments, recordings] =
        await Promise.all([
          documentOf(context.tx, context.tenantId, {
            type: "submission_attempt",
            id: attempt.id,
          }),
          filesView(context, { type: "submission_attempt", id: attempt.id }),
          assessmentOf(context.tx, context.tenantId, attempt.id),
          commentsOf(context.tx, context.tenantId, attempt.id),
          filesView(context, { type: "attempt_feedback", id: attempt.id }),
        ]);
      // Comments point at blocks, so work saved without block ids gets
      // them from where each block stands; handed-in work never changes.
      const stored = (document?.content ?? null) as ContentDocument | null;
      const content = stored ? withBlockIds(stored) : null;
      // Files handed in beside the answer, before answers held them.
      const inAnswer = new Set(content ? contentFileIds(content) : []);
      const returned = Boolean(
        assessment?.releasedAt ?? assessment?.commentsReleasedAt,
      );
      const shown =
        assessment && (includeDrafts || returned) ? assessment : null;
      // Returned with the grade held, the student reads everything but it.
      const held = Boolean(
        assessment?.commentsReleasedAt && !assessment.releasedAt,
      );
      return {
        ...attempt,
        content,
        files: files.filter((file) => !inAnswer.has(file.id)),
        recordings: includeDrafts || returned ? recordings : [],
        // A student reads the comments with the rest of the returned work.
        comments:
          includeDrafts || returned
            ? comments.map((comment) => ({
                ...comment,
                anchor: comment.anchor as unknown as CommentAnchor,
              }))
            : [],
        assessment: shown
          ? {
              ...shown,
              privateNote: includeDrafts ? shown.privateNote : null,
              ...(held && !includeDrafts
                ? { score: null, effectiveScore: null, rubricScores: null }
                : {}),
              gradeHeld: held,
            }
          : null,
      };
    }),
  );
  const grade = await gradeReader(
    context,
    views.map((view) => view.assessment?.gradeScaleVersionId ?? null),
  );
  return views.map((view) => ({
    ...view,
    assessment: view.assessment
      ? {
          ...view.assessment,
          grade: grade(
            view.assessment.gradeScaleVersionId,
            view.assessment.effectiveScore ?? view.assessment.score,
            points,
          ),
        }
      : null,
  }));
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
        ? await attemptsView(context, row.submissionId, true, assignment.points)
        : [],
      queue: work.map((item) => ({
        studentId: item.studentId,
        fullNameEn: item.fullNameEn,
        fullNameAr: item.fullNameAr,
        needsGrading:
          item.attemptId !== null &&
          !item.released &&
          !item.held &&
          !item.excused,
        released: item.released || item.held,
        held: item.held,
        handedIn: item.attemptId !== null,
        excused: item.excused,
        awaiting: item.awaiting,
      })),
    };
  });

/** The criteria the grader wrote something on, or null for none. */
function keptComments(comments: Record<string, string> | null) {
  const kept = Object.entries(comments ?? {}).filter(([, text]) => text);
  return kept.length ? Object.fromEntries(kept) : null;
}

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
      rubricComments: keptComments(input.rubricComments),
      feedback: input.feedback || null,
      privateNote: input.privateNote || null,
      userId: context.actor.userId,
      today: context.today,
    });
    return saved;
  });

/**
 * The attempt a grader may comment on: one handed in to an assignment they
 * teach, in a year still open.
 */
async function commentableAttempt(context: UnitContext, attemptId: string) {
  requireCapability(context, "submissions:grade");
  const attempt = await attemptById(context.tx, context.tenantId, attemptId);
  if (!attempt) throw new ORPCError("NOT_FOUND");
  const assignment = await taughtAssignment(context, attempt.assignmentId);
  await requireOpenYear(context, assignment.schoolYearId);
  return { ...attempt, id: attemptId };
}

/** Comments on a passage of handed-in work, or changes the grader's own. */
export const comment = writeProcedure
  .input(saveCommentSchema)
  .handler(async ({ input, context }) => {
    const attempt = await commentableAttempt(context, input.attemptId);
    if (!input.id) {
      // A bank comment the grader may not use counts for nothing.
      const bank = input.bankId
        ? await bankCommentById(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            id: input.bankId,
          })
        : null;
      return insertComment(context.tx, {
        tenantId: context.tenantId,
        attemptId: attempt.id,
        userId: context.actor.userId,
        anchor: input.anchor,
        body: input.body,
        bankCommentId:
          bank && (bank.shared || bank.ownerId === context.actor.userId)
            ? bank.id
            : null,
        kind: input.kind || null,
        criterionId: input.criterionId || null,
      });
    }
    const existing = await commentById(context.tx, context.tenantId, input.id);
    if (!existing || existing.attemptId !== attempt.id)
      throw new ORPCError("NOT_FOUND");
    if (existing.authorId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", {
        message: "coursework.comment_author",
      });
    const saved = await updateComment(context.tx, {
      tenantId: context.tenantId,
      id: existing.id,
      expectedVersion: input.expectedVersion,
      anchor: input.anchor,
      body: input.body,
      kind: input.kind || null,
      criterionId: input.criterionId || null,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    return saved;
  });

/** Whether the viewer grades the work an attempt belongs to. */
async function gradesAttempt(context: UnitContext, attemptId: string) {
  if (!can(context, "submissions:grade")) return false;
  try {
    await commentableAttempt(context, attemptId);
    return true;
  } catch {
    return false;
  }
}

/** A comment its student may answer: on their own work, once returned. */
async function answerableComment(context: UnitContext, commentId: string) {
  requireCapability(context, "own-work:read");
  const found = await commentById(context.tx, context.tenantId, commentId);
  const attempt = found
    ? await attemptById(context.tx, context.tenantId, found.attemptId)
    : null;
  const assessment = found
    ? await assessmentOf(context.tx, context.tenantId, found.attemptId)
    : null;
  if (
    !found ||
    attempt?.studentId !== context.actor.userId ||
    !(assessment?.releasedAt ?? assessment?.commentsReleasedAt)
  )
    throw new ORPCError("NOT_FOUND");
  return found;
}

/** A held grade goes out once every comment on its attempt is answered. */
async function releaseIfAnswered(context: UnitContext, attemptId: string) {
  const assessment = await assessmentOf(
    context.tx,
    context.tenantId,
    attemptId,
  );
  if (!assessment?.commentsReleasedAt || assessment.releasedAt) return;
  if ((await unansweredComments(context.tx, context.tenantId, attemptId)) > 0)
    return;
  await releaseAssessments(context.tx, context.tenantId, [attemptId]);
}

/** Shows a held grade at once, without waiting for the student's answers. */
export const showGrade = writeProcedure
  .input(showGradeSchema)
  .handler(async ({ input, context }) => {
    const attempt = await commentableAttempt(context, input.attemptId);
    await releaseAssessments(context.tx, context.tenantId, [attempt.id]);
    return { shown: true };
  });

/** The student marks a comment fixed or not understood, or takes that back. */
export const answerComment = writeProcedure
  .input(answerCommentSchema)
  .handler(async ({ input, context }) => {
    const found = await answerableComment(context, input.commentId);
    await setCommentState(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
      studentId: context.actor.userId,
      state: input.state || null,
    });
    if (input.state) await releaseIfAnswered(context, found.attemptId);
    return { state: input.state || null };
  });

/** A reply under a comment, from the work's student once returned or its grader. */
export const replyToComment = writeProcedure
  .input(replyToCommentSchema)
  .handler(async ({ input, context }) => {
    const found = await commentById(
      context.tx,
      context.tenantId,
      input.commentId,
    );
    if (!found) throw new ORPCError("NOT_FOUND");
    if (!(await gradesAttempt(context, found.attemptId)))
      await answerableComment(context, found.id);
    return insertReply(context.tx, {
      tenantId: context.tenantId,
      commentId: found.id,
      userId: context.actor.userId,
      body: input.body,
    });
  });

/** Takes back a comment; only the grader who wrote it may. */
export const uncomment = writeProcedure
  .input(removeCommentSchema)
  .handler(async ({ input, context }) => {
    const existing = await commentById(context.tx, context.tenantId, input.id);
    if (!existing) throw new ORPCError("NOT_FOUND");
    await commentableAttempt(context, existing.attemptId);
    if (existing.authorId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", {
        message: "coursework.comment_author",
      });
    const removed = await removeComment(context.tx, {
      tenantId: context.tenantId,
      id: existing.id,
      expectedVersion: input.expectedVersion,
    });
    if (!removed)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    // The comment taken away may have been the last one left to answer.
    await releaseIfAnswered(context, existing.attemptId);
    return { removed };
  });

/** Undoes removing a comment, for its writer. */
export const restoreWorkComment = writeProcedure
  .input(restoreCommentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const restored = await restoreComment(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
      userId: context.actor.userId,
    });
    if (!restored) throw new ORPCError("NOT_FOUND");
    // Still only on work the grader teaches, in a year still open.
    await commentableAttempt(context, restored.attemptId);
    return { restored: true };
  });

/** Adds a voice note the grader recorded, already uploaded, to an attempt's feedback. */
export const addFeedbackRecording = writeProcedure
  .input(feedbackRecordingSchema)
  .handler(async ({ input, context }) => {
    const attempt = await commentableAttempt(context, input.attemptId);
    const [adopted] = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: { type: "attempt_feedback", id: attempt.id },
      ids: [input.fileId],
    });
    if (!adopted) throw new ORPCError("NOT_FOUND");
    return { id: adopted };
  });

/** Takes a voice note off an attempt's feedback. */
export const removeFeedbackRecording = writeProcedure
  .input(feedbackRecordingSchema)
  .handler(async ({ input, context }) => {
    const attempt = await commentableAttempt(context, input.attemptId);
    const host = { type: "attempt_feedback", id: attempt.id };
    const kept = await filesOfHost(context.tx, context.tenantId, host);
    if (!kept.some((file) => file.id === input.fileId))
      throw new ORPCError("NOT_FOUND");
    await unlinkFiles(context.tx, {
      tenantId: context.tenantId,
      host,
      keep: kept
        .filter((file) => file.id !== input.fileId)
        .map((file) => file.id),
    });
    return { removed: true };
  });

/** The grader's comment bank: their own comments and those shared at the school. */
export const commentBank = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "submissions:grade");
  const rows = await bankCommentsOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    userId: context.actor.userId,
  });
  return rows.map((row) => ({
    ...row,
    mine: row.ownerId === context.actor.userId,
  }));
});

/** Keeps a comment in the grader's bank, or changes one of their own. */
export const saveBankComment = writeProcedure
  .input(saveBankCommentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    if (!input.id)
      return insertBankComment(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        userId: context.actor.userId,
        body: input.body,
        shared: input.shared,
      });
    const existing = await bankCommentById(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
    });
    if (!existing) throw new ORPCError("NOT_FOUND");
    if (existing.ownerId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", {
        message: "coursework.comment_author",
      });
    const saved = await updateBankComment(context.tx, {
      tenantId: context.tenantId,
      id: existing.id,
      expectedVersion: input.expectedVersion,
      body: input.body,
      shared: input.shared,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    return saved;
  });

/** Takes a comment out of the bank; only its owner may. */
export const removeFromBank = writeProcedure
  .input(removeCommentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const existing = await bankCommentById(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
    });
    if (!existing) throw new ORPCError("NOT_FOUND");
    if (existing.ownerId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", {
        message: "coursework.comment_author",
      });
    const removed = await removeBankComment(context.tx, {
      tenantId: context.tenantId,
      id: existing.id,
      expectedVersion: input.expectedVersion,
    });
    if (!removed)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    return { removed };
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
    const [brief, whole, rows, classRow] = await Promise.all([
      readersBrief(context, assignment, "student"),
      readersBrief(context, assignment, "editor"),
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
      ? await attemptsView(context, row.submissionId, false, assignment.points)
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
        // A first answer starts as the student's own copy of the part of
        // the brief set aside for each of them.
        content:
          (draft?.content as ContentDocument | undefined) ??
          (whole ? starterOf(whole) : null),
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
          released: row.released || row.held,
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
          row.released || row.held || row.needsRevision,
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
        responses: ownResponsesOf(answers),
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
    drafts: ownResponsesOf(byAttempt.get(current) ?? []),
    results,
  };
}

registerOpenWork(async (context, assignmentId) => {
  try {
    await learnerAssignment(context, assignmentId);
    return true;
  } catch {
    return false;
  }
});

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
    // Files are blocks in the answer and join the submission as it is saved;
    // one taken out stays restorable until the sweep's trash window ends.
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
    }
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
        row.released || row.held || row.needsRevision,
        context.now,
      )
    )
      throw new ORPCError("CONFLICT", { message: "coursework.closed" });
    const draftHost = { type: "submission", id: submission.id };
    const draft = await documentOf(tx, context.tenantId, draftHost);
    const hasText = Boolean(draft?.plainText.trim());
    const inAnswer = draft
      ? contentFileIds(draft.content as unknown as ContentDocument)
      : [];
    const hasFiles = inAnswer.length > 0;
    const format = assignment.submissionFormat;
    if (
      (format === "online" && !hasText) ||
      (format === "files" && !hasFiles) ||
      (format === "both" && !hasText && !hasFiles)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.nothing_to_hand_in",
      });
    const rules = await assessedRules(context, assignment.id);
    const declaration = rules?.declarationRequired ? input.declaration : null;
    if (rules?.declarationRequired) {
      if (!declaration)
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.declaration_needed",
        });
      const problem = declarationProblem(
        (draft?.content as unknown as ContentDocument | undefined) ?? null,
        declaration.aiUsed,
        rules.aiEvidenceRequired,
      );
      if (problem) throw new ORPCError("BAD_REQUEST", { message: problem });
    }
    const attemptId = await insertAttempt(tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
      studentId: context.actor.userId,
      number: row.attempts + 1,
      isLate: isLate(dueAt, context.now),
      userId: context.actor.userId,
    });
    if (declaration)
      await insertDeclaration(tx, {
        tenantId: context.tenantId,
        attemptId,
        studentId: context.actor.userId,
        kind: "student",
        statement: DECLARATION_STATEMENT,
        aiUsed: declaration.aiUsed,
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
      ids: inAnswer,
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
    const authenticated = await authenticationsOf(tx, {
      tenantId: context.tenantId,
      attemptIds: [row.attemptId],
    });
    if (authenticated.length)
      throw new ORPCError("CONFLICT", { message: "coursework.final" });
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
  ownWork: boolean,
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
          // Work returned with its grade held is back with its student, while
          // the family hears of it once the grade is shown.
          released: row.released || (ownWork && row.held),
        },
        now,
      ),
    }));
}

/** A student's coursework with its states, and the grades of returned work. */
async function learnerRows(
  context: UnitContext,
  rows: Awaited<ReturnType<typeof learnerAssignments>>,
  ownWork = false,
) {
  const grade = await gradeReader(
    context,
    rows.map((row) => row.gradeScaleVersionId),
  );
  return learnerView(rows, context.now, ownWork).map((row) => ({
    ...row,
    grade: grade(row.gradeScaleVersionId, row.effectiveScore, row.points),
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
    rows: await learnerRows(context, rows, true),
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
    rows: await learnerRows(context, rows),
    now: context.now.toISOString(),
  };
}

/** The work teachers have shared with a child's family, newest first. */
export const shared = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    if (
      !(await isVisibleStudent(context.tx, scopeOf(context), input.studentId))
    )
      throw new ORPCError("NOT_FOUND");
    return {
      pieces: await sharedWorkOf(context.tx, {
        tenantId: context.tenantId,
        studentId: input.studentId,
      }),
    };
  });

/** One shared piece of work, as the family reads it. */
export const sharedPiece = readProcedure
  .input(v.object({ attemptId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const host = { type: "submission_attempt", id: input.attemptId };
    if (!(await readable(context, host))) throw new ORPCError("NOT_FOUND");
    const document = await documentOf(context.tx, context.tenantId, host);
    return {
      content: (document?.content ?? null) as ContentDocument | null,
    };
  });

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
  .handler(({ input, context }) => {
    // A code exercise is marked by running it, which saveQuizProgram does
    // outside the transaction; here its results would be the student's word.
    if (input.response?.type === "program")
      throw new ORPCError("BAD_REQUEST", { message: "learning.response" });
    return keepQuizAnswer(context, input);
  });

/**
 * Keeps a student's program for a quiz's code exercise with how it did in
 * each test, run between two short units of work so a class handing in at
 * once never holds the school's connections while Python runs. The results
 * stay out of the student's sight until the quiz shows its answers.
 */
export const saveQuizProgram = schoolProcedure
  .input(saveQuizProgramSchema)
  .handler(async ({ input, context }) => {
    const block = await openUnit(context, "read", async (unit) => {
      const inside = { ...context, ...unit };
      const { assignment } = await learnerAssignment(
        inside,
        input.assignmentId,
      );
      const document = await publishedQuiz(inside, assignment.id);
      const found = document
        ? checkBlocks(document).find((item) => item.id === input.blockId)
        : undefined;
      if (found?.type !== "program") throw new ORPCError("NOT_FOUND");
      return found;
    });
    const response = await markedProgram(context.runners, block, {
      type: "program",
      code: input.code,
    });
    return openUnit(context, "write", (unit) =>
      keepQuizAnswer(
        { ...context, ...unit },
        {
          assignmentId: input.assignmentId,
          blockId: input.blockId,
          response,
        },
      ),
    );
  });

async function keepQuizAnswer(
  context: UnitContext,
  input: {
    assignmentId: string;
    blockId: string;
    response: LessonResponse | null;
  },
) {
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
  const kept = input.response ? responseFiles(input.response) : [];
  if (kept.length > 0) {
    // A recording, picture or project must be the student's own upload,
    // kept with their submission so their teacher can open it.
    const linked = await linkFiles(tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      ids: kept,
      purpose: "document_media",
      host: { type: "submission", id: submission.id },
    });
    if (linked.length !== kept.length)
      throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
  }
  await storeQuizAnswer(tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    studentId: context.actor.userId,
    attempt: row.attempts + 1,
    blockId: block.id,
    response: input.response,
  });
  return { saved: true };
}

/** A teacher marks a quiz answer only they can judge, out of its points; the score that counts follows. */
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
    if (!document || !block || !isTeacherMarked(block))
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
