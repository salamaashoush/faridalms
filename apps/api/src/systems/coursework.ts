import type {
  AssignmentRow,
  WorkRow,
} from "@faridalms/database/stores/coursework";
import type { KeptFiles } from "@faridalms/database/stores/learning";
import type { SittingRow } from "@faridalms/database/stores/quizzes";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  CommentAnchor,
  Rubric,
  SaveAssignment,
  StudentWorkAction,
  TeacherTab,
} from "@faridalms/domain/coursework";
import type {
  LessonDocument,
  LessonResponse,
  QuizAnswer,
} from "@faridalms/domain/learning";
import type { ContentLocale } from "@faridalms/domain/translations";

import { arrangementsOf } from "@faridalms/database/stores/arrangements";
import { bankTagCounts } from "@faridalms/database/stores/bank";
import {
  classById,
  classesTaughtBy,
  rosterOf,
} from "@faridalms/database/stores/classes";
import {
  isShared,
  shareAttempts,
  sharedWorkOf,
  unshareAttempts,
  assessmentOf,
  assignmentById,
  attemptById,
  attemptFromVersion,
  attemptsOf,
  bankCommentById,
  openedUntold,
  bankCommentsOf,
  commentById,
  commentsOf,
  courseworkHost,
  discussionPostById,
  discussionPostsOf,
  ensureSubmission,
  groupsOf,
  hideDiscussionPost,
  insertAssignment,
  insertAttempt,
  insertBankComment,
  insertComment,
  insertDiscussionPost,
  insertReply,
  isRecipient,
  learnerAssignments,
  namesOf,
  releaseAssessments,
  releaseComments,
  removeBankComment,
  removeRubric,
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
  reusableAssignments,
  teacherAssignments,
  touchSubmission,
  unansweredComments,
  updateAssignment,
  updateBankComment,
  updateComment,
  updateDiscussionPost,
  withdrawAttempt,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  dropTranslation,
  freezeCopy,
  publishedVersion,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
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
import { columnScores, columnsOf } from "@faridalms/database/stores/lti";
import {
  attemptUnderReview,
  reviewsAttempt,
} from "@faridalms/database/stores/peer-reviews";
import {
  keepPracticeAnswer,
  markQuizAnswer as storeQuizMark,
  quizAnswersOf,
  quizPollVotes,
  quizAnswersToMark,
  quizStarted,
  saveQuizAnswer as storeQuizAnswer,
  sittingsOf,
  beginSitting,
  pauseSitting,
  resumeSitting,
} from "@faridalms/database/stores/quizzes";
import { recordRubricEvidence } from "@faridalms/database/stores/standards";
import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import {
  dayIn,
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  allowedMinutes,
  NO_ARRANGEMENTS,
} from "@faridalms/domain/arrangements";
import {
  contentFileIds,
  contentPlainText,
  starterOf,
  withBlockIds,
  withoutStarter,
} from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  GRACE_MS,
  answerCommentSchema,
  assessSchema,
  assignmentIssue,
  assignmentPhase,
  canHandIn,
  attemptScore,
  canTakeQuiz,
  discussionPostSchema,
  editDiscussionPostSchema,
  hideDiscussionPostSchema,
  sittingEnds,
  timeIsUp,
  effectiveScore,
  handInIssue,
  handInSchema,
  isLate,
  learnerState,
  markQuizAnswerSchema,
  practiseQuizSchema,
  assignIssues,
  removeCommentSchema,
  replyToCommentSchema,
  restoreCommentSchema,
  publishSchema,
  rubricEvidence,
  rubricTotal,
  saveAssignmentSchema,
  saveBankCommentSchema,
  reusableSchema,
  reuseSchema,
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
  sharedWorkQuerySchema,
  teacherListSchema,
} from "@faridalms/domain/coursework";
import { DECLARATION_STATEMENT } from "@faridalms/domain/exams";
import {
  bandFor,
  checkBlocks,
  isTeacherMarked,
  quizViews,
  ownResponse,
  responseFiles,
  responseIssue,
  studentQuiz,
} from "@faridalms/domain/learning";
import {
  contentOfLesson,
  holdsQuestions,
  quizIntro,
  quizOfBrief,
} from "@faridalms/domain/lesson-content";
import { translatedQuiz } from "@faridalms/domain/lesson-translation";
import { PAGE_SIZE } from "@faridalms/domain/paging";
import { practised, practiceStanding } from "@faridalms/domain/practice";
import { isLater } from "@faridalms/domain/publication";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { AttemptQuizzes } from "../quizzes/quiz";

import { markedProgramAt } from "../coding/mark";
import {
  assessedRules,
  attemptMarks,
  confirmedAttempts,
  declarationProblem,
} from "../core/assessed";
import {
  learnerAssignment,
  ownSchedule,
  requireOpenYear,
  taughtAssignment,
} from "../core/coursework-access";
import { gradeReader } from "../core/grades";
import { publishTelling } from "../core/mentions";
import { nameUuid } from "../core/names";
import { notify } from "../core/notify";
import {
  audit,
  can,
  openUnit,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import { registerGoLive, tellLive, wordsIssues } from "../core/publication";
import {
  reachesStudent,
  requireStudent,
  requireTaught,
  scopeFor,
  teaches,
} from "../core/reach";
import {
  teachingScope,
  tellAssigned,
  tellGradeShown,
  tellReturned,
} from "../core/teaching-notices";
import { checkTranslation } from "../core/translation-review";
import {
  registerArea,
  registerOpenWork,
  registerHostReader,
  registerHostWriter,
  registerLiveRules,
  placeMedia,
} from "../files/authorize";
import { resultOf } from "../lti/grades";
import {
  answersByAttempt,
  attemptQuizzes,
  draftQuiz,
  drawAttempt,
  drawsOf,
  handInAttempt,
  keepStartedQuestions,
  keptOf,
  markedQuestions,
  namelessVotes,
  ownResponsesOf,
  practiceViews,
  publishedBrief,
  publishedQuiz,
  rescoreQuiz,
  responsesOf,
} from "../quizzes/quiz";

const AUDIT_ACTIONS = {
  return: "submission.return",
  revise: "submission.revise",
  excuse: "submission.excuse",
  unexcuse: "submission.unexcuse",
  hand_in: "submission.hand_in",
  share: "submission.share",
  unshare: "submission.unshare",
} as const satisfies Record<StudentWorkAction, string>;

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

/**
 * The brief in the other language, as its readers get it: for a student,
 * without the part set aside for each of them, which they meet in their
 * own answer in the original's words.
 */
async function readersTranslation(
  context: UnitContext,
  assignment: {
    id: string;
    language: ContentLocale | null;
    translationTitle: string | null;
    submissionFormat: string;
  },
  reader: "teacher" | "student" | "editor" = "teacher",
) {
  if (!assignment.language) return null;
  const document = await documentOf(context.tx, context.tenantId, {
    type: "assignment",
    id: assignment.id,
  });
  const translated = document
    ? await translationOf(context.tx, context.tenantId, document.id)
    : null;
  if (!translated) return null;
  const written = translated.content as unknown as ContentDocument;
  // As with the original, a quiz's readers get the words before its first
  // question; the questions come in the quiz, the original's answers kept.
  const content =
    reader !== "editor" && assignment.submissionFormat === "quiz"
      ? quizIntro(written)
      : written;
  return {
    locale: otherLocale(assignment.language),
    title: assignment.translationTitle ?? "",
    content: reader === "student" ? withoutStarter(content) : content,
  };
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
    (await teaches(context, "teaching", owner.classId));
  if (host.type === "submission")
    return owner.studentId === context.actor.userId;
  if (teacher) return true;
  // A family reads handed-in work only once a teacher has shared it; a
  // classmate, once it was given them to review.
  if (host.type === "submission_attempt")
    return (
      owner.studentId === context.actor.userId ||
      (can(context, "own-work:submit") &&
        (await reviewsAttempt(context.tx, {
          tenantId: context.tenantId,
          attemptId: host.id,
          reviewerId: context.actor.userId,
        }))) ||
      (can(context, "children:read") &&
        owner.studentId !== null &&
        (await reachesStudent(context, "teaching", owner.studentId)) &&
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
    if (await reachesStudent(context, "teaching", row.studentId)) return true;
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
    (await teaches(context, "teaching", classId)),
  writer: async (context, classId) =>
    can(context, "assignments:author") &&
    (await teaches(context, "teaching", classId)),
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
registerLiveRules("assignment", {
  keyed: async (context, hostId) =>
    (await assignmentById(context.tx, context.tenantId, hostId))
      ?.submissionFormat === "quiz",
});

/**
 * Work assigned to open later goes live when it opens: its students and
 * their families are told as its teacher would have been heard on assigning
 * it, and so is anyone its brief mentions.
 */
registerGoLive<AssignmentRow>("assignment", {
  due: (tx, input) => openedUntold(tx, input),
  schoolOf: (row) => row.orgId,
  authorOf: (row) => row.authorUserId,
  live: async (scope, row) => {
    await tellAssigned(scope, row);
    await tellLive(
      scope,
      { type: "assignment", id: row.id },
      {
        title: row.title,
      },
    );
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
    (await teaches(context, "teaching", owner.classId))
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
    const rows = await teacherAssignments(
      context.tx,
      scopeFor(context, "teaching"),
      {
        yearId: year.id,
        classId: input.classId,
        q: input.q,
        now: context.now,
        graceMs: GRACE_MS,
      },
    );
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
    const translation = await readersTranslation(context, assignment, "editor");
    return {
      ...assignment,
      translation: translation && {
        title: translation.title,
        content: translation.content,
      },
      translationReview: translation
        ? await translationReview(context.tx, {
            tenantId: context.tenantId,
            host: "assignment",
            id: assignment.id,
          })
        : null,
      rubric: assignment.rubric as unknown as Rubric | null,
      brief: stored,
      publishedBrief: sent,
      quiz:
        quiz && assignment.quizKeep && assignment.quizReveal
          ? {
              attempts: assignment.quizAttempts,
              keep: assignment.quizKeep,
              reveal: assignment.quizReveal,
              shuffle: assignment.quizShuffle,
              timeLimit: assignment.quizTimeLimit,
              practice: assignment.quizPractice,
              bands: assignment.quizBands,
              started:
                assignment.state !== "draft" &&
                (await quizStarted(
                  context.tx,
                  context.tenantId,
                  assignment.id,
                )),
            }
          : null,
      discussion:
        assignment.discussionPostFirst !== null &&
        assignment.discussionReplies !== null
          ? {
              postFirst: assignment.discussionPostFirst,
              replies: assignment.discussionReplies,
            }
          : null,
      peer: peerSettingsOf(assignment),
      /** Reviews were handed out, so peer review stays on. */
      peerStarted: assignment.peerStartedAt !== null,
      selection:
        assignment.audience === "selected"
          ? selection
          : { groupIds: [], studentIds: [] },
    };
  });

const peerSettingsOf = (assignment: {
  peerReviews: number | null;
  peerAnonymous: boolean | null;
}) =>
  assignment.peerReviews !== null && assignment.peerAnonymous !== null
    ? { reviews: assignment.peerReviews, anonymous: assignment.peerAnonymous }
    : null;

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
    quizTimeLimit: input.quiz?.timeLimit ?? null,
    quizPractice: input.quiz?.practice ?? false,
    quizBands: input.quiz?.bands ?? [],
    // A quiz marks itself, so it has no comments to answer first.
    gradeAfterAnswers: !input.quiz && input.gradeAfterAnswers,
    discussionPostFirst: input.discussion?.postFirst ?? null,
    discussionReplies: input.discussion?.replies ?? null,
    peerReviews: input.peer?.reviews ?? null,
    peerAnonymous: input.peer?.anonymous ?? null,
  };
}

/** Work the teacher may set again, from any class or year, newest first. */
export const reusable = readProcedure
  .input(reusableSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    return reusableAssignments(context.tx, scopeFor(context, "teaching"), {
      q: input.q,
      limit: 30,
    });
  });

/**
 * Sets an assignment again as a new draft in a class: its brief, files,
 * format, marking and quiz settings, with no dates or chosen students, since
 * those belong to the class and term it was first set for. The teacher may
 * reach it as its author, or as a teacher of its class.
 */
export const reuse = writeProcedure
  .input(reuseSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const tx = context.tx;
    const source = await assignmentById(tx, context.tenantId, input.id);
    if (
      !source ||
      source.orgId !== context.schoolId ||
      (source.authorUserId !== context.actor.userId &&
        !(await teaches(context, "teaching", source.classId)))
    )
      throw new ORPCError("NOT_FOUND");
    const classRow = await classById(tx, context, input.classId);
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
      throw new ORPCError("NOT_FOUND");
    await requireOpenYear(context, classRow.schoolYearId);
    const categories = await classCategories(tx, {
      tenantId: context.tenantId,
      classId: classRow.id,
    });
    const created = await insertAssignment(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classRow,
      authorUserId: context.actor.userId,
      title: source.title,
      audience: "class",
      availableFrom: null,
      dueAt: null,
      closesAt: null,
      latePolicy: source.latePolicy,
      lateDeductionPercent: source.lateDeductionPercent,
      submissionFormat: source.submissionFormat,
      maxFiles: source.maxFiles,
      resubmission: source.resubmission,
      points: source.points,
      rubric: source.rubric,
      gradingPeriodId: null,
      categoryId: categories.some((row) => row.id === source.categoryId)
        ? source.categoryId
        : null,
      quizAttempts: source.quizAttempts,
      quizKeep: source.quizKeep,
      quizReveal: source.quizReveal,
      quizShuffle: source.quizShuffle,
      quizTimeLimit: source.quizTimeLimit,
      quizPractice: source.quizPractice,
      quizBands: source.quizBands,
      gradeAfterAnswers: source.gradeAfterAnswers,
      discussionPostFirst: source.discussionPostFirst,
      discussionReplies: source.discussionReplies,
      peerReviews: source.peerReviews,
      peerAnonymous: source.peerAnonymous,
      language: source.language,
      translationTitle: source.translationTitle,
    });
    const brief = await documentOf(tx, context.tenantId, {
      type: "assignment",
      id: source.id,
    });
    const content = {
      ...((brief?.content as ContentDocument | undefined) ?? emptyContent()),
    };
    const host = { type: "assignment", id: created.id };
    const copied = await saveDocument(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(context, host, content, contentFileIds(content))),
      plainText: contentPlainText(content),
      userId: context.actor.userId,
    });
    const translated = brief
      ? await translationOf(tx, context.tenantId, brief.id)
      : null;
    if (translated && source.language) {
      const words = {
        ...(translated.content as unknown as ContentDocument),
      };
      await saveTranslation(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        originalId: copied.id,
        locale: otherLocale(source.language),
        kind: "rich_text",
        ...(await placeMedia(context, host, words, contentFileIds(words))),
        plainText: contentPlainText(words),
        userId: context.actor.userId,
      });
    }
    await audit(context, {
      action: "assignment.reuse",
      objectType: "assignment",
      objectId: created.id,
      details: { from: source.id, classId: classRow.id },
    });
    return { id: created.id };
  });

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
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
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
    let author = context.actor.userId;
    const stored = input.id ? await taughtAssignment(context, input.id) : null;
    const before = stored
      ? await documentOf(tx, context.tenantId, {
          type: "assignment",
          id: stored.id,
        })
      : null;
    const translated = before
      ? await translationOf(tx, context.tenantId, before.id)
      : null;
    const language =
      input.language === undefined
        ? (stored?.language ?? null)
        : input.language;
    const translation =
      input.translation === undefined
        ? translated && {
            title: stored?.translationTitle ?? "",
            content: translated.content as unknown as ContentDocument,
          }
        : input.translation;
    // A translation is in the other language of the brief's own, which stays
    // as it is while the translation is kept. A quiz's translation gives its
    // questions' words only; the original keeps every answer.
    if (
      translation &&
      (!language || (translated?.locale && translated.locale === language))
    )
      throw new ORPCError("CONFLICT", {
        message: "coursework.translation_language",
      });
    const kept = {
      language,
      translationTitle: translation?.title || null,
    };
    if (stored) {
      const existing = stored;
      // A draft saves itself as it is written, so its class may still change;
      // once assigned, students and their work belong to that class.
      if (existing.classId !== classRow.id && existing.state !== "draft")
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.class_fixed",
        });
      // Once out, a quiz's answers and a discussion's posts belong to it.
      if (
        existing.state === "published" &&
        ((existing.submissionFormat === "quiz") !==
          (input.submissionFormat === "quiz") ||
          (existing.submissionFormat === "discussion") !==
            (input.submissionFormat === "discussion"))
      )
        throw new ORPCError("CONFLICT", {
          message: "coursework.format_fixed",
        });
      // Handed-out reviews belong to the work, so peer review stays on.
      if (existing.peerStartedAt && !input.peer)
        throw new ORPCError("CONFLICT", {
          message: "coursework.peer_started",
        });
      const saved = await updateAssignment(tx, {
        tenantId: context.tenantId,
        id: existing.id,
        classRow,
        expectedVersion: input.expectedVersion ?? 0,
        ...fieldsOf(input),
        ...kept,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      assignmentId = existing.id;
      version = saved.version;
      published = existing.state === "published";
      author = existing.authorUserId;
    } else {
      const created = await insertAssignment(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        classRow,
        authorUserId: context.actor.userId,
        ...fieldsOf(input),
        ...kept,
      });
      assignmentId = created.id;
      version = created.version;
    }
    const host = { type: "assignment", id: assignmentId };
    if (input.quiz && published) {
      const quiz = quizOfBrief(input.brief);
      const unfinished = quizIssue(quiz);
      if (unfinished)
        throw new ORPCError("BAD_REQUEST", { message: unfinished });
      await keepStartedQuestions(context, { assignmentId, brief: input.brief });
      await requireDrawable(context, quiz, author);
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
      await publishTelling(context, {
        documentId: document.id,
        subject: { type: "assignment", id: assignmentId },
        title: input.title,
      });
    if (input.translation !== undefined) {
      if (input.translation && language)
        await saveTranslation(tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host,
          originalId: document.id,
          locale: otherLocale(language),
          kind: "rich_text",
          ...(await placeMedia(
            context,
            host,
            input.translation.content,
            contentFileIds(input.translation.content),
          )),
          plainText: contentPlainText(input.translation.content),
          userId: context.actor.userId,
        });
      else
        await dropTranslation(tx, {
          tenantId: context.tenantId,
          originalId: document.id,
        });
      // A check lapses by itself once the original's words change; a
      // translation rewritten, or dropped, needs checking again.
      if (
        !input.translation ||
        contentPlainText(input.translation.content) !==
          (translated?.plainText ?? "")
      ) {
        const cleared = await reviewTranslation(tx, {
          host: "assignment",
          tenantId: context.tenantId,
          id: assignmentId,
          userId: context.actor.userId,
          reviewed: false,
        });
        if (cleared !== null) version = cleared;
      }
    }
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

/**
 * Every draw in a quiz finds as many questions in the bank as it asks for:
 * the school's and its author's own with its tag, never one question twice.
 */
async function requireDrawable(
  context: UnitContext,
  quiz: LessonDocument,
  authorUserId: string,
) {
  const wanted = new Map<string, number>();
  for (const draw of drawsOf(quiz))
    wanted.set(draw.tag, (wanted.get(draw.tag) ?? 0) + draw.count);
  if (wanted.size === 0) return;
  const counts = await bankTagCounts(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    authorUserId,
    tags: [...wanted.keys()],
  });
  for (const [tag, count] of wanted)
    if ((counts.find((row) => row.tag === tag)?.questions ?? 0) < count)
      throw new ORPCError("BAD_REQUEST", { message: "coursework.draw_short" });
}

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
    const briefContent = (brief?.content ?? {
      root: { children: [] },
    }) as unknown as ContentDocument;
    const issues = assignIssues({
      brief: briefContent,
      audience: assignment.audience,
      groupIds: selection.groupIds,
      studentIds: selection.studentIds,
      quiz,
    });
    if (issues[0]) throw new ORPCError("BAD_REQUEST", { message: issues[0] });
    if ((await wordsIssues(context, [briefContent])).includes("consent"))
      throw new ORPCError("BAD_REQUEST", { message: "content.consent" });
    if (quiz) await requireDrawable(context, quiz, assignment.authorUserId);
    // Work that opens later is told about when it opens, by the clock, and
    // so are the people its brief mentions.
    const opensLater = isLater(assignment.availableFrom, context.now);
    if (brief && opensLater)
      await snapshotPublish(tx, {
        tenantId: context.tenantId,
        documentId: brief.id,
        userId: context.actor.userId,
      });
    else if (brief)
      await publishTelling(context, {
        documentId: brief.id,
        subject: { type: "assignment", id: assignment.id },
        title: assignment.title,
      });
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
    if (!opensLater) await tellAssigned(teachingScope(context), assignment);
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

/**
 * The teacher marks the brief's translation as checked against the original
 * as it now reads, or takes that back.
 */
export const reviewBriefTranslation = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.id);
    const translation = await readersTranslation(context, assignment, "editor");
    return checkTranslation(context, {
      host: "assignment",
      id: assignment.id,
      version: assignment.version,
      expectedVersion: input.expectedVersion,
      reviewed: input.reviewed,
      translated: documentWritten(translation?.content ?? null),
      nothingToCheck: "coursework.nothing_to_check",
    });
  });

/** The assignment as its teacher reads it: brief and everyone's standing. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author", "submissions:grade");
    const assignment = await taughtAssignment(context, input.id);
    const [brief, translation, work, classRow] = await Promise.all([
      readersBrief(context, assignment),
      readersTranslation(context, assignment),
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      classById(context.tx, context, assignment.classId),
    ]);
    const [grade, rules, quiz] = await Promise.all([
      gradeReader(
        context,
        work.map((row) => row.gradeScaleVersionId),
      ),
      assessedRules(context, assignment.id),
      assignment.submissionFormat === "quiz" && assignment.state !== "draft"
        ? publishedQuiz(context, assignment.id)
        : null,
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
      translation,
      /** Whether the quiz draws each student's questions from the bank. */
      draws: quiz ? drawsOf(quiz).length > 0 : false,
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
 * Each student's own paper for a quiz that draws its questions from the
 * bank, as for a test sat on paper: the attempt each student is to make
 * next is drawn now, as opening it would draw it, so the paper asks what
 * the quiz will ask them online. A quiz that draws nothing has no papers.
 */
export const drawnPapers = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author", "submissions:grade");
    const assignment = await taughtAssignment(context, input.id);
    if (assignment.submissionFormat !== "quiz")
      throw new ORPCError("BAD_REQUEST", { message: "coursework.not_quiz" });
    const document = await publishedQuiz(context, assignment.id);
    if (!document) throw new ORPCError("NOT_FOUND");
    if (drawsOf(document).length === 0) return { papers: [] };
    const [work, intro] = await Promise.all([
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      readersBrief(context, assignment),
    ]);
    const papers: { studentId: string; content: ContentDocument }[] = [];
    for (const row of work) {
      if (row.excused) continue;
      const submission = await ensureSubmission(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: row.studentId,
      });
      const attempt = row.attempts + 1;
      await drawAttempt(context, {
        assignment,
        document,
        submissionId: submission.id,
        studentId: row.studentId,
        attempt,
      });
      const quizzes = await attemptQuizzes(context, document, submission.id);
      const asked = contentOfLesson(quizzes.of(attempt));
      if (!asked) continue;
      // The paper opens with the words the quiz opens with.
      papers.push({
        studentId: row.studentId,
        content: {
          root: {
            ...asked.root,
            children: [
              ...(intro?.root.children ?? []),
              ...(asked.root.children ?? []),
            ],
          },
        },
      });
    }
    return { papers };
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
    const returned: typeof chosen = [];
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
          returned.push(row);
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
    await tellReturned(
      teachingScope(context),
      assignment,
      returned,
      input.action === "revise",
    );
    await audit(context, {
      action: AUDIT_ACTIONS[input.action],
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

const scoreOf = (asked: LessonDocument, answers: readonly QuizAnswer[]) =>
  attemptScore(
    asked,
    Object.fromEntries(
      answers.map((answer) => [answer.blockId, answer.fraction]),
    ),
  );

const percentOf = (score: number | null, total: number) =>
  score === null || total === 0 ? null : Math.round((score / total) * 100);

/**
 * A handed-in attempt's questions as far as the quiz shows them. A practice
 * quiz's questions read as their student left them, right or shown, since
 * the mark they kept is what their tries and hints earned.
 */
function resultViews(
  assignment: AssignmentRow,
  asked: LessonDocument,
  answers: readonly QuizAnswer[],
  show: "answers" | "feedback" | "marks",
) {
  const views = quizViews(asked, answers, show);
  return assignment.quizPractice
    ? { ...views, ...practiceViews(asked, answers) }
    : views;
}

/** Every handed-in quiz attempt of one student, marked, for their teacher. */
async function graderQuiz(
  context: UnitContext,
  assignment: AssignmentRow,
  submissionId: string,
) {
  const document = await publishedQuiz(context, assignment.id);
  if (!document) return null;
  const [byAttempt, attempts, quizzes, sittings] = await Promise.all([
    answersByAttempt(context, submissionId),
    attemptsOf(context.tx, context.tenantId, submissionId),
    attemptQuizzes(context, document, submissionId),
    sittingsOf(context.tx, { tenantId: context.tenantId, submissionId }),
  ]);
  return {
    total: quizPoints(document),
    attempts: attempts.map((attempt) => {
      const asked = quizzes.of(attempt.number);
      const answers = namelessVotes(asked, byAttempt.get(attempt.number) ?? []);
      const sitting = sittings.get(attempt.number);
      return {
        attemptId: attempt.id,
        number: attempt.number,
        /** The supervised rest breaks taken, which the clock stood still for. */
        rest:
          sitting && sitting.breaks > 0
            ? { breaks: sitting.breaks, seconds: sitting.breakSeconds }
            : null,
        blocks: studentQuiz(asked, "grading", false),
        score: attemptScore(
          asked,
          Object.fromEntries(
            answers.map((answer) => [answer.blockId, answer.fraction]),
          ),
        ),
        responses: responsesOf(answers),
        checks: resultViews(assignment, asked, answers, "answers"),
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
        ? await graderQuiz(context, assignment, row.submissionId)
        : null;
    // What outside tools in the brief scored the student, for the grader
    // to weigh or take as the mark.
    const columns = await columnsOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const scores = await columnScores(context.tx, {
      tenantId: context.tenantId,
      lineItemIds: columns.map((column) => column.id),
      studentIds: [input.studentId],
    });
    return {
      quiz,
      toolScores: columns.flatMap((column) => {
        const score = scores.find((item) => item.lineItemId === column.id);
        return score
          ? [
              {
                lineItemId: column.id,
                label: column.label,
                toolName: column.toolName,
                maximum: column.scoreMaximum,
                result: resultOf(score, column),
                gradingProgress: score.gradingProgress,
                comment: score.comment,
              },
            ]
          : [];
      }),
      discussion:
        assignment.submissionFormat === "discussion"
          ? await postsOfStudent(context, assignment, input.studentId)
          : null,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        points: assignment.points,
        rubric: assignment.rubric as unknown as Rubric | null,
        latePolicy: assignment.latePolicy,
        lateDeductionPercent: assignment.lateDeductionPercent,
        /** Classmates review each other's work. */
        peer: assignment.peerReviews !== null,
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

/** The namespace a rubric criterion's evidence id is made in from its own id. */
const CRITERION_NAMESPACE = Buffer.from(
  "303db884d8604360a337d01e0dd6df49",
  "hex",
);

/**
 * Saves the grader's judgement of an attempt as a draft; returning releases
 * it. Each level on a criterion carrying standards is evidence of them, which
 * the student and their family see once the grade is returned.
 */
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
    const rubric = assignment.rubric as unknown as Rubric | null;
    await recordRubricEvidence(tx, {
      tenantId: context.tenantId,
      studentId: attempt.studentId,
      submissionId: attempt.submissionId,
      attempt: attempt.number,
      marks: rubric
        ? rubricEvidence(rubric, input.rubricScores ?? {}).map((mark) => ({
            blockId: nameUuid(CRITERION_NAMESPACE, mark.criterionId),
            standards: mark.standards,
            fraction: mark.fraction,
          }))
        : [],
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
/** Shows held grades and tells each student and family theirs is shown. */
async function showHeld(context: UnitContext, attemptIds: readonly string[]) {
  if (
    (await releaseAssessments(context.tx, context.tenantId, attemptIds)) === 0
  )
    return;
  for (const attemptId of attemptIds) {
    const attempt = await attemptById(context.tx, context.tenantId, attemptId);
    if (!attempt) continue;
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      attempt.assignmentId,
    );
    if (!assignment) continue;
    const learners = (
      await namesOf(context.tx, context.tenantId, [attempt.studentId])
    ).map((row) => ({
      studentId: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
    }));
    await tellGradeShown(teachingScope(context), assignment, learners);
  }
}

async function releaseIfAnswered(context: UnitContext, attemptId: string) {
  const assessment = await assessmentOf(
    context.tx,
    context.tenantId,
    attemptId,
  );
  if (!assessment?.commentsReleasedAt || assessment.releasedAt) return;
  if ((await unansweredComments(context.tx, context.tenantId, attemptId)) > 0)
    return;
  await showHeld(context, [attemptId]);
}

/** Shows a held grade at once, without waiting for the student's answers. */
export const showGrade = writeProcedure
  .input(showGradeSchema)
  .handler(async ({ input, context }) => {
    const attempt = await commentableAttempt(context, input.attemptId);
    await showHeld(context, [attempt.id]);
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
    const stored = await assignmentById(context.tx, context.tenantId, input.id);
    const recipient = stored
      ? await isRecipient(
          context.tx,
          context.tenantId,
          stored.id,
          context.actor.userId,
        )
      : null;
    if (!stored || stored.state !== "published" || !recipient)
      throw new ORPCError("NOT_FOUND");
    const { assignment, dueAt } = ownSchedule(stored, recipient);
    if (
      assignment.availableFrom &&
      Date.parse(assignment.availableFrom) > context.now.getTime()
    )
      throw new ORPCError("NOT_FOUND");
    const [brief, translation, whole, rows, classRow] = await Promise.all([
      readersBrief(context, assignment, "student"),
      readersTranslation(context, assignment, "student"),
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
        /** Classmates review each other's work. */
        peer: assignment.peerReviews !== null,
        language: assignment.language,
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
      translation,
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
        assignment.submissionFormat !== "discussion" &&
        row.attemptId !== null &&
        row.assessmentId === null &&
        !(await attemptUnderReview(
          context.tx,
          context.tenantId,
          row.attemptId,
        )),
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
  const [byAttempt, attempts, quizzes, sittings, arranged] = await Promise.all([
    row.submissionId
      ? answersByAttempt(context, row.submissionId)
      : new Map<number, QuizAnswer[]>(),
    row.submissionId
      ? attemptsOf(context.tx, context.tenantId, row.submissionId)
      : [],
    attemptQuizzes(context, document, row.submissionId),
    row.submissionId
      ? sittingsOf(context.tx, {
          tenantId: context.tenantId,
          submissionId: row.submissionId,
        })
      : new Map<number, SittingRow>(),
    ownArrangements(context, assignment.orgId),
  ]);
  // A quiz whose brief has a translation is also asked in its words, the
  // original's answers kept, for the student to read in either language.
  const translation = await readersTranslation(context, assignment, "editor");
  const shownBrief = translation
    ? await publishedBrief(context, assignment.id)
    : null;
  const translatedQuizzes =
    translation && shownBrief && holdsQuestions(shownBrief)
      ? await attemptQuizzes(
          context,
          translatedQuiz(shownBrief, translation.content),
          row.submissionId,
        )
      : null;
  const current = row.attempts + 1;
  const sitting = sittings.get(current) ?? null;
  const limit = assignment.quizTimeLimit;
  // A running clock tells its own time, its rest breaks aside; one not
  // yet begun, the student's.
  const minutes = sitting
    ? sitting.endsAt &&
      Math.round(
        (sitting.endsAt.getTime() -
          sitting.startedAt.getTime() -
          sitting.breakSeconds * 1000) /
          60_000,
      )
    : limit === null
      ? null
      : allowedMinutes(limit, arranged);
  const seed = (attempt: number) => `${context.actor.userId}:${attempt}`;
  const results = await Promise.all(
    attempts.map(async (attempt) => {
      const answers = byAttempt.get(attempt.number) ?? [];
      const asked = quizzes.of(attempt.number);
      const assessment = await assessmentOf(
        context.tx,
        context.tenantId,
        attempt.id,
      );
      // A quiz shown only once returned shows its answers then; any other
      // shows what its teacher chose, however its grade came back.
      const show =
        assignment.quizReveal === "returned"
          ? assessment?.releasedAt
            ? "answers"
            : null
          : assignment.quizReveal;
      return {
        number: attempt.number,
        submittedAt: attempt.submittedAt,
        isLate: attempt.isLate,
        blocks: studentQuiz(
          asked,
          seed(attempt.number),
          assignment.quizShuffle,
          arranged.fewerChoices,
        ),
        score: show ? scoreOf(asked, answers) : null,
        /** What the quiz tells a student with this score. */
        band: show
          ? (bandFor(
              assignment.quizBands,
              percentOf(scoreOf(asked, answers), quizPoints(asked)),
            )?.text ?? null)
          : null,
        pending: answers.some((answer) => answer.state === "needs_marking"),
        responses: ownResponsesOf(answers),
        checks: show ? resultViews(assignment, asked, answers, show) : null,
      };
    }),
  );
  const open =
    can(context, "own-work:submit") &&
    !row.excused &&
    canTakeQuiz(
      { ...assignment, dueAt: input.dueAt },
      row.attempts,
      assignment.quizAttempts,
      context.now,
    );
  // A timed attempt's questions stay out of sight until its clock begins,
  // and while it stands still for a rest break.
  const hidden = minutes !== null && (!sitting || sitting.pausedAt);
  return {
    blocks: hidden
      ? []
      : studentQuiz(
          quizzes.of(current),
          seed(current),
          assignment.quizShuffle,
          arranged.fewerChoices,
        ),
    /** The same questions in the translation's words, in the same order. */
    translated:
      translation && translatedQuizzes
        ? {
            locale: translation.locale,
            blocks: hidden
              ? []
              : studentQuiz(
                  translatedQuizzes.of(current),
                  seed(current),
                  assignment.quizShuffle,
                  arranged.fewerChoices,
                ),
          }
        : null,
    total: quizPoints(document),
    /** Minutes an attempt runs, and when the one under way began and runs out. */
    timing:
      minutes === null
        ? null
        : {
            minutes,
            /** The student's extra time is counted in. */
            extra: limit !== null && minutes > limit,
            startedAt: sitting?.startedAt.toISOString() ?? null,
            endsAt: sitting?.endsAt?.toISOString() ?? null,
            timeUp:
              sitting && !sitting.pausedAt
                ? timeIsUp(sitting.endsAt, context.now)
                : false,
            /** When the rest break under way began, and the breaks taken. */
            pausedAt: sitting?.pausedAt?.toISOString() ?? null,
            breaks: sitting?.breaks ?? 0,
          },
    /** The student's arrangements give them a computer reader. */
    readAloud: arranged.readAloud,
    /** The student's arrangements let them stop a timed quiz's clock to rest. */
    restBreaks: arranged.restBreaks,
    attempt: current,
    attemptsAllowed: assignment.quizAttempts,
    attemptsUsed: row.attempts,
    keep: assignment.quizKeep,
    reveal: assignment.quizReveal,
    practice: assignment.quizPractice,
    /** In a practice quiz, how the student stands on each question of the attempt under way. */
    practised:
      assignment.quizPractice && open
        ? practiceViews(quizzes.of(current), byAttempt.get(current) ?? [])
        : null,
    open,
    /** The attempt's questions are still to be drawn, which opening it does. */
    undrawn: open && quizzes.undrawn(current),
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
    // A request retried after its answer was lost finds the attempt it made.
    const retried = await attemptFromVersion(tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
      studentId: context.actor.userId,
      fromVersion: input.expectedVersion,
    });
    if (retried) return { attemptId: retried, version: submission.version };
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
      return handInQuiz(context, {
        assignment,
        dueAt,
        submission,
        row,
        fromVersion: input.expectedVersion,
      });
    // A discussion is handed in by posting in it.
    if (assignment.submissionFormat === "discussion")
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.nothing_to_hand_in",
      });
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
    const lacking = handInIssue(assignment.submissionFormat, {
      written: hasText,
      files: inAnswer.length > 0,
    });
    if (lacking) throw new ORPCError("BAD_REQUEST", { message: lacking });
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
      fromVersion: input.expectedVersion,
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
async function handInQuiz(
  context: UnitContext,
  input: {
    assignment: AssignmentRow;
    dueAt: string | null;
    submission: { id: string; version: number };
    row: WorkRow;
    fromVersion: number;
  },
) {
  const { assignment, submission, row } = input;
  const number = row.attempts + 1;
  const sitting = (
    await sittingsOf(context.tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
    })
  ).get(number);
  if (sitting?.pausedAt)
    throw new ORPCError("CONFLICT", { message: "coursework.on_break" });
  // An attempt whose time ran out may still be handed in as it stood, even
  // once the quiz has closed; any other needs the quiz open.
  const timedOut = sitting ? timeIsUp(sitting.endsAt, context.now) : false;
  if (
    row.excused ||
    (!timedOut &&
      !canTakeQuiz(
        { ...assignment, dueAt: input.dueAt },
        row.attempts,
        assignment.quizAttempts,
        context.now,
      ))
  )
    throw new ORPCError("CONFLICT", { message: "coursework.closed" });
  const answers = await quizAnswersOf(context.tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    attempt: number,
  });
  if (answers.length === 0 && !sitting)
    throw new ORPCError("BAD_REQUEST", {
      message: "coursework.nothing_to_hand_in",
    });
  const handed = await handInAttempt(context, {
    assignment,
    submissionId: submission.id,
    studentId: context.actor.userId,
    attempt: number,
    isLate: isLate(input.dueAt, context.now),
    fromVersion: input.fromVersion,
  });
  if (!handed) throw new ORPCError("NOT_FOUND");
  const saved = await touchSubmission(context.tx, {
    tenantId: context.tenantId,
    id: submission.id,
    expectedVersion: submission.version,
    state: handed.returned ? "returned" : "submitted",
    needsRevision: false,
  });
  await audit(context, {
    action: "submission.hand_in",
    objectType: "submission",
    objectId: submission.id,
    studentUserId: context.actor.userId,
    details: { assignmentId: assignment.id, attempt: number, quiz: true },
  });
  return {
    attemptId: handed.attemptId,
    version: saved?.version ?? submission.version,
  };
}

/** Takes back the latest attempt while nobody has assessed it; its work returns to the draft. */
export const undoHandIn = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    // A quiz's attempt and a discussion's posts are already in front of
    // the teacher and the class.
    if (
      assignment.submissionFormat === "quiz" ||
      assignment.submissionFormat === "discussion"
    )
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
    // Classmates were given it to review, so it stays as handed in.
    if (await attemptUnderReview(tx, context.tenantId, row.attemptId))
      throw new ORPCError("CONFLICT", {
        message: "coursework.peer_handed_out",
      });
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
  await requireStudent(context, "teaching", studentId);
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
  .input(sharedWorkQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    await requireStudent(context, "teaching", input.studentId);
    return sharedWorkOf(context.tx, {
      tenantId: context.tenantId,
      studentId: input.studentId,
      limit: PAGE_SIZE,
      after: input.after,
    });
  });

/** One shared piece of work, as the family reads it. */
export const sharedPiece = readProcedure
  .input(v.object({ attemptId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const host = { type: "submission_attempt", id: input.attemptId };
    if (!(await readable(context, host))) throw new ORPCError("NOT_FOUND");
    const [document, assessment, comments] = await Promise.all([
      documentOf(context.tx, context.tenantId, host),
      assessmentOf(context.tx, context.tenantId, input.attemptId),
      commentsOf(context.tx, context.tenantId, input.attemptId),
    ]);
    const stored = (document?.content ?? null) as ContentDocument | null;
    const returned = Boolean(
      assessment?.releasedAt ?? assessment?.commentsReleasedAt,
    );
    return {
      content: stored ? withBlockIds(stored) : null,
      // The teacher's comments, once returned, without the child's answers
      // and replies, which stay between the child and the teacher.
      comments: returned
        ? comments.map((row) => ({
            ...row,
            anchor: row.anchor as unknown as CommentAnchor,
            studentState: null,
            replies: [],
          }))
        : [],
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

/**
 * A piece of a child's work as their family reads it: its brief in either
 * of its languages, without the part set aside for each student, once the
 * child can read it too.
 */
export const childBrief = readProcedure
  .input(v.object({ studentId: id, assignmentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    requireCapability(context, "assignments:read");
    await requireStudent(context, "teaching", input.studentId);
    const stored = await assignmentById(
      context.tx,
      context.tenantId,
      input.assignmentId,
    );
    const recipient = stored
      ? await isRecipient(
          context.tx,
          context.tenantId,
          stored.id,
          input.studentId,
        )
      : null;
    if (!stored || stored.state !== "published" || !recipient)
      throw new ORPCError("NOT_FOUND");
    const { assignment, dueAt } = ownSchedule(stored, recipient);
    if (
      assignment.availableFrom &&
      Date.parse(assignment.availableFrom) > context.now.getTime()
    )
      throw new ORPCError("NOT_FOUND");
    const [brief, translation, classRow, [row]] = await Promise.all([
      readersBrief(context, assignment, "student"),
      readersTranslation(context, assignment, "student"),
      classById(context.tx, context, assignment.classId),
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: input.studentId,
      }),
    ]);
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        dueAt,
        language: assignment.language,
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
      translation,
      result: row?.attemptId
        ? await familyResult(context, row.attemptId, assignment.points)
        : null,
    };
  });

/**
 * What a family reads of the teacher's judgement on a child's latest
 * attempt: the mark, the feedback and the rubric's levels, once released
 * and never while the grade is held or still a draft.
 */
async function familyResult(
  context: UnitContext,
  attemptId: string,
  points: number | null,
) {
  const assessment = await assessmentOf(
    context.tx,
    context.tenantId,
    attemptId,
  );
  if (!assessment?.releasedAt) return null;
  const grade = await gradeReader(context, [assessment.gradeScaleVersionId]);
  const score = assessment.effectiveScore ?? assessment.score;
  return {
    releasedAt: assessment.releasedAt,
    score,
    grade: grade(assessment.gradeScaleVersionId, score, points),
    feedback: assessment.feedback,
    rubricScores: assessment.rubricScores,
    rubricComments: assessment.rubricComments,
  };
}

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
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
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
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
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
    await requireTaught(context, "teaching", input.classId);
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

export const removeTeacherRubric = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const removed = await removeRubric(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
      ownerId: context.actor.userId,
    });
    if (!removed) throw new ORPCError("NOT_FOUND");
    return { removed };
  });

/**
 * How a student's class answered a quiz's poll, once the student has: how
 * many chose each option, from each student's earliest answer, never who.
 */
export const quizPollResults = readProcedure
  .input(v.object({ assignmentId: id, blockId: id }))
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    const document = await publishedQuiz(context, assignment.id);
    const block = document
      ? checkBlocks(document).find((item) => item.id === input.blockId)
      : undefined;
    if (block?.type !== "poll" || !block.classResults)
      throw new ORPCError("NOT_FOUND");
    const roster = await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const votes = await quizPollVotes(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      blockId: block.id,
      studentIds: [
        ...new Set([
          context.actor.userId,
          ...roster.map((row) => row.studentId),
        ]),
      ],
    });
    if (!votes.has(context.actor.userId))
      throw new ORPCError("CONFLICT", { message: "learning.poll_first" });
    const chosen = [...votes.values()];
    return {
      answered: chosen.length,
      counts: Object.fromEntries(
        block.options.map((option) => [
          option.id,
          chosen.filter((picked) => picked.includes(option.id)).length,
        ]),
      ),
    };
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

/** A code exercise of the attempt a student has open, found to run their program against. */
async function programOfAttempt(
  context: UnitContext,
  assignmentId: string,
  blockId: string,
) {
  const [document, [row]] = await Promise.all([
    publishedQuiz(context, assignmentId),
    studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId,
      studentId: context.actor.userId,
    }),
  ]);
  const quizzes =
    document && row
      ? await attemptQuizzes(context, document, row.submissionId)
      : null;
  const found = quizzes
    ? checkBlocks(quizzes.of((row?.attempts ?? 0) + 1)).find(
        (item) => item.id === blockId,
      )
    : undefined;
  if (found?.type !== "program") throw new ORPCError("NOT_FOUND");
  return found;
}

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
      return programOfAttempt(inside, assignment.id, input.blockId);
    });
    const response = await markedProgramAt(context, block, {
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

/** The arrangements of the student taking a quiz, or none. */
async function ownArrangements(context: UnitContext, orgId: string) {
  const kept = await arrangementsOf(context.tx, {
    tenantId: context.tenantId,
    orgId,
    studentId: context.actor.userId,
  });
  return kept?.arrangements ?? NO_ARRANGEMENTS;
}

/**
 * The minutes a timed quiz gives the student taking it, their extra time
 * counted; null when it is not timed for them.
 */
async function quizMinutes(context: UnitContext, assignment: AssignmentRow) {
  if (assignment.quizTimeLimit === null) return null;
  return allowedMinutes(
    assignment.quizTimeLimit,
    await ownArrangements(context, assignment.orgId),
  );
}

/**
 * The attempt a student is on, open for answers: its clock begun if the
 * quiz is timed, and refused once that has run out; its questions drawn
 * from the bank if they were not yet. The quiz as that attempt asks it.
 */
async function openAttempt(context: UnitContext, assignmentId: string) {
  const { assignment, dueAt } = await learnerAssignment(context, assignmentId);
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
  if (!document) throw new ORPCError("NOT_FOUND");
  const attempt = row.attempts + 1;
  // A clock already running keeps the time it began with, whatever has
  // changed of the quiz or the student's arrangements since.
  const running = (
    await sittingsOf(tx, {
      tenantId: context.tenantId,
      submissionId: submission.id,
    })
  ).get(attempt);
  const minutes = running ? null : await quizMinutes(context, assignment);
  const sitting =
    running ??
    (minutes === null
      ? null
      : await beginSitting(tx, {
          tenantId: context.tenantId,
          submissionId: submission.id,
          studentId: context.actor.userId,
          attempt,
          startedAt: context.now,
          endsAt: sittingEnds(context.now, minutes),
        }));
  // Nothing is answered while the clock stands still for a rest break.
  if (sitting?.pausedAt)
    throw new ORPCError("CONFLICT", { message: "coursework.on_break" });
  if (sitting && timeIsUp(sitting.endsAt, context.now))
    throw new ORPCError("CONFLICT", { message: "coursework.time_up" });
  await drawAttempt(context, {
    assignment,
    document,
    submissionId: submission.id,
    studentId: context.actor.userId,
    attempt,
  });
  const quizzes = await attemptQuizzes(context, document, submission.id);
  return { assignment, submission, attempt, quiz: quizzes.of(attempt) };
}

/**
 * Starts or ends a supervised rest break in a timed attempt, for a student
 * whose arrangements allow them: the clock stands still and the questions
 * go out of sight until the student takes up the quiz again.
 */
async function restBreak(
  context: UnitContext,
  assignmentId: string,
  step: "pause" | "resume",
) {
  const { assignment } = await learnerAssignment(context, assignmentId);
  if (assignment.submissionFormat !== "quiz")
    throw new ORPCError("BAD_REQUEST", { message: "coursework.not_quiz" });
  if (!(await ownArrangements(context, assignment.orgId)).restBreaks)
    throw new ORPCError("FORBIDDEN");
  const [row] = await studentWork(context.tx, {
    tenantId: context.tenantId,
    assignmentId: assignment.id,
    studentId: context.actor.userId,
  });
  if (!row?.submissionId) throw new ORPCError("NOT_FOUND");
  const sitting = {
    tenantId: context.tenantId,
    submissionId: row.submissionId,
    attempt: row.attempts + 1,
  };
  const changed =
    step === "pause"
      ? await pauseSitting(context.tx, sitting)
      : await resumeSitting(context.tx, sitting);
  if (!changed)
    throw new ORPCError("CONFLICT", { message: "coursework.no_break" });
  await audit(context, {
    action: step === "pause" ? "quiz.break_start" : "quiz.break_end",
    objectType: "submission",
    objectId: row.submissionId,
    studentUserId: context.actor.userId,
  });
}

export const pauseQuiz = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(({ input, context }) =>
    restBreak(context, input.assignmentId, "pause"),
  );

export const resumeQuiz = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(({ input, context }) =>
    restBreak(context, input.assignmentId, "resume"),
  );

/** Begins the attempt a student opens: its clock, and its draws from the bank. */
export const startQuiz = writeProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    const { attempt } = await openAttempt(context, input.assignmentId);
    return { attempt };
  });

async function keepQuizAnswer(
  context: UnitContext,
  input: {
    assignmentId: string;
    blockId: string;
    response: LessonResponse | null;
  },
) {
  const tx = context.tx;
  const { submission, attempt, quiz } = await openAttempt(
    context,
    input.assignmentId,
  );
  const block = checkBlocks(quiz).find((item) => item.id === input.blockId);
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
    attempt,
    blockId: block.id,
    response: input.response ? ownResponse(input.response) : null,
  });
  return { saved: true };
}

/**
 * A step on one question of a practice quiz: an answer checked at once, a
 * hint opened, or the answer shown, as a lesson's question takes them. What
 * the student has done is kept on their answer for marking at hand-in.
 */
async function practiseStep(
  context: UnitContext,
  input: {
    assignmentId: string;
    blockId: string;
    step: v.InferOutput<typeof practiseQuizSchema>["step"];
  },
) {
  const { assignment, submission, attempt, quiz } = await openAttempt(
    context,
    input.assignmentId,
  );
  if (!assignment.quizPractice)
    throw new ORPCError("BAD_REQUEST", {
      message: "coursework.not_practice",
    });
  const block = checkBlocks(quiz).find((item) => item.id === input.blockId);
  if (!block || !practised(block)) throw new ORPCError("NOT_FOUND");
  const answers = await quizAnswersOf(context.tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    attempt,
  });
  let kept = keptOf(answers.find((answer) => answer.blockId === block.id));
  const before = practiceStanding(block, kept);
  if (before.view.correct || before.view.revealed)
    throw new ORPCError("CONFLICT", { message: "learning.settled" });
  const step = input.step;
  if (step.kind === "answer") {
    const issue = responseIssue(block, step.response);
    if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
    kept = { ...kept, response: step.response, tries: kept.tries + 1 };
  } else if (step.kind === "hint") {
    if (before.view.askable === 0)
      throw new ORPCError("CONFLICT", { message: "learning.no_hint" });
    kept = { ...kept, hints: kept.hints + 1 };
  } else kept = { ...kept, revealed: true };
  await keepPracticeAnswer(context.tx, {
    tenantId: context.tenantId,
    submissionId: submission.id,
    studentId: context.actor.userId,
    attempt,
    blockId: block.id,
    response: kept.response ? ownResponse(kept.response) : {},
    tries: kept.tries,
    hints: kept.hints,
    revealed: kept.revealed,
  });
  return { check: practiceStanding(block, kept).view };
}

export const practiseQuiz = writeProcedure
  .input(practiseQuizSchema)
  .handler(({ input, context }) => {
    // A code exercise is checked by running it, which practiseQuizProgram
    // does; here its results would be the student's word.
    if (input.step.kind === "answer" && input.step.response.type === "program")
      throw new ORPCError("BAD_REQUEST", { message: "learning.response" });
    return practiseStep(context, input);
  });

/**
 * A practice quiz's code exercise checked at once: run between two short
 * units of work, as saveQuizProgram runs it, and kept as a try with how it
 * did in each test, which the student sees as a lesson shows them.
 */
export const practiseQuizProgram = schoolProcedure
  .input(saveQuizProgramSchema)
  .handler(async ({ input, context }) => {
    const block = await openUnit(context, "read", async (unit) => {
      const inside = { ...context, ...unit };
      const { assignment } = await learnerAssignment(
        inside,
        input.assignmentId,
      );
      if (!assignment.quizPractice)
        throw new ORPCError("BAD_REQUEST", {
          message: "coursework.not_practice",
        });
      return programOfAttempt(inside, assignment.id, input.blockId);
    });
    const response = await markedProgramAt(context, block, {
      type: "program",
      code: input.code,
    });
    return openUnit(context, "write", (unit) =>
      practiseStep(
        { ...context, ...unit },
        {
          assignmentId: input.assignmentId,
          blockId: input.blockId,
          step: { kind: "answer", response },
        },
      ),
    );
  });

/**
 * A teacher marks answers to one quiz question only they can judge, out of
 * its points, one answer or many alike; each student's score that counts
 * follows.
 */
export const markQuizAnswer = writeProcedure
  .input(markQuizAnswerSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const tx = context.tx;
    const attempts = await Promise.all(
      [...new Set(input.attemptIds)].map((attemptId) =>
        attemptById(tx, context.tenantId, attemptId),
      ),
    );
    const [first] = attempts;
    if (
      !first ||
      attempts.some(
        (attempt) => !attempt || attempt.assignmentId !== first.assignmentId,
      )
    )
      throw new ORPCError("NOT_FOUND");
    const assignment = await taughtAssignment(context, first.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    const document =
      assignment.submissionFormat === "quiz"
        ? await publishedQuiz(context, assignment.id)
        : null;
    if (!document) throw new ORPCError("NOT_FOUND");
    // A drawn question is asked only of the attempts that drew it.
    const quizzes = new Map<string, AttemptQuizzes>();
    const scored = new Map<string, string>();
    for (const attempt of attempts) {
      if (!attempt) continue;
      const asked =
        quizzes.get(attempt.submissionId) ??
        (await attemptQuizzes(context, document, attempt.submissionId));
      quizzes.set(attempt.submissionId, asked);
      const block = checkBlocks(asked.of(attempt.number)).find(
        (item) => item.id === input.blockId,
      );
      if (!block || !isTeacherMarked(block)) throw new ORPCError("NOT_FOUND");
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
      scored.set(attempt.submissionId, attempt.studentId);
      await audit(context, {
        action: "submission.mark_answer",
        objectType: "submission",
        objectId: attempt.submissionId,
        studentUserId: attempt.studentId,
        details: { blockId: block.id, points: input.points },
      });
    }
    for (const [submissionId, studentId] of scored)
      await rescoreQuiz(context, {
        assignment,
        quizzes:
          quizzes.get(submissionId) ??
          (await attemptQuizzes(context, document, submissionId)),
        submissionId,
        studentId,
        graderId: context.actor.userId,
        release: false,
      });
    return { marked: scored.size };
  });

/**
 * The class's handed-in answers to each quiz question only a teacher can
 * judge, for marking question by question rather than student by student.
 */
export const quizAnswers = readProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const assignment = await taughtAssignment(context, input.assignmentId);
    const document =
      assignment.submissionFormat === "quiz"
        ? await publishedQuiz(context, assignment.id)
        : null;
    const questions = document
      ? await markedQuestions(context, assignment.id, document)
      : [];
    const [roster, answers] = await Promise.all([
      studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      quizAnswersToMark(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        blockIds: questions.map((block) => block.id),
      }),
    ]);
    return {
      students: roster.map((row) => ({
        id: row.studentId,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
      })),
      questions: questions.map((block) => ({
        blockId: block.id,
        kind: block.type,
        prompt: block.prompt,
        points: block.points,
      })),
      answers: answers.map(({ response, ...answer }) => ({
        ...answer,
        text: typeof response.text === "string" ? response.text : "",
        recording: (response.recording ?? null) as {
          fileId: string;
          seconds: number;
          video?: boolean;
        } | null,
        picture: (response.picture ?? null) as { fileId: string } | null,
        project: (response.project ?? null) as { fileId: string } | null,
        files: (response.files ?? null) as KeptFiles | null,
      })),
    };
  });

type Viewer =
  | { teacher: true }
  | { teacher: false; studentId: string; dueAt: string | null };

/**
 * Who may take part in a discussion and as whom: a teacher of its class, who
 * reads every post and moderates, or a student it is set for, once it is
 * open to them.
 */
async function discussionOf(context: UnitContext, assignmentId: string) {
  const stored = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  if (!stored || stored.submissionFormat !== "discussion")
    throw new ORPCError("NOT_FOUND");
  if (can(context, "submissions:grade")) {
    const teaching = await taughtAssignment(context, assignmentId).catch(
      () => null,
    );
    if (teaching)
      return {
        assignment: teaching,
        dueAt: teaching.dueAt,
        viewer: { teacher: true } as Viewer,
      };
  }
  const { assignment, dueAt } = await learnerAssignment(context, assignmentId);
  if (
    assignment.availableFrom &&
    Date.parse(assignment.availableFrom) > context.now.getTime()
  )
    throw new ORPCError("NOT_FOUND");
  return {
    assignment,
    dueAt,
    viewer: {
      teacher: false,
      studentId: context.actor.userId,
      dueAt,
    } as Viewer,
  };
}

/** A discussion's posts as one reader may see them, with what they have done in it. */
async function discussionView(
  context: UnitContext,
  assignment: AssignmentRow,
  viewer: Viewer,
) {
  const [posts, roster] = await Promise.all([
    discussionPostsOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    }),
    studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    }),
  ]);
  const students = new Set(roster.map((row) => row.studentId));
  const me = viewer.teacher ? null : viewer.studentId;
  const authorOf = new Map(posts.map((post) => [post.id, post.authorUserId]));
  const own = posts.filter((post) => post.authorUserId === me);
  // Until they have posted, a student reads only the teacher's posts and
  // their own when the discussion asks for a first answer of their own.
  const waiting =
    me !== null &&
    assignment.discussionPostFirst === true &&
    !own.some((post) => post.parentPostId === null);
  const shown = posts.filter(
    (post) =>
      !waiting || post.authorUserId === me || !students.has(post.authorUserId),
  );
  // A student posts while they could hand in, so their own due date and
  // the late rule close it; its teacher posts while it is out.
  const closed = viewer.teacher
    ? assignment.state !== "published"
    : !["assigned", "past_due"].includes(
        assignmentPhase({ ...assignment, dueAt: viewer.dueAt }, context.now),
      );
  return {
    postFirst: assignment.discussionPostFirst ?? false,
    replies: assignment.discussionReplies ?? 0,
    waiting,
    closed,
    moderates: viewer.teacher,
    posted: own.filter((post) => post.parentPostId === null).length,
    replied: own.filter((post) => {
      const parent = post.parentPostId ? authorOf.get(post.parentPostId) : null;
      return Boolean(parent && parent !== me && students.has(parent));
    }).length,
    posts: shown.map((post) => {
      const withheld =
        post.redacted ||
        (post.hidden && !viewer.teacher && post.authorUserId !== me);
      return {
        id: post.id,
        parentId: post.parentPostId,
        authorId: post.authorUserId,
        authorNameEn: post.authorNameEn,
        authorNameAr: post.authorNameAr,
        teacher: !students.has(post.authorUserId),
        mine: post.authorUserId === me,
        content: withheld ? null : (post.content as unknown as ContentDocument),
        createdAt: post.createdAt,
        editedAt: post.editedAt,
        hidden: post.hidden,
        removed: post.redacted,
      };
    }),
  };
}

/** A post's words on one line, cut short, as a reply quotes what it answers. */
const excerptOf = (content: ContentDocument | null) => {
  const text = content
    ? contentPlainText(content).replaceAll(/\s+/g, " ").trim()
    : "";
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
};

/**
 * What one student posted in a discussion, for marking: each post, and for a
 * reply the words it answers, with how far they met what was asked.
 */
async function postsOfStudent(
  context: UnitContext,
  assignment: AssignmentRow,
  studentId: string,
) {
  const view = await discussionView(context, assignment, { teacher: true });
  const byId = new Map(view.posts.map((item) => [item.id, item]));
  const own = view.posts.filter((item) => item.authorId === studentId);
  return {
    replies: view.replies,
    posted: own.filter((item) => item.parentId === null).length,
    replied: own.filter((item) => {
      const parent = item.parentId ? byId.get(item.parentId) : undefined;
      return Boolean(
        parent && parent.authorId !== studentId && !parent.teacher,
      );
    }).length,
    posts: own.map((item) => {
      const parent = item.parentId ? byId.get(item.parentId) : undefined;
      return {
        ...item,
        answers: parent
          ? {
              authorNameEn: parent.authorNameEn,
              authorNameAr: parent.authorNameAr,
              excerpt: excerptOf(parent.content),
            }
          : null,
      };
    }),
  };
}

/** A discussion set as coursework, for a teacher of its class or a student taking part. */
export const discussion = readProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    const { assignment, viewer } = await discussionOf(
      context,
      input.assignmentId,
    );
    return discussionView(context, assignment, viewer);
  });

const postedText = (content: ContentDocument) => {
  const text = contentPlainText(content).trim();
  if (!text)
    throw new ORPCError("BAD_REQUEST", { message: "coursework.post_empty" });
  return text;
};

/** A post keeps the pictures and files written into it, as many as the assignment allows. */
async function placedPost(
  context: UnitContext,
  assignment: AssignmentRow,
  postId: string,
  content: ContentDocument,
) {
  const placed = await placeMedia(
    context,
    { type: "discussion_post", id: postId },
    content as unknown as Record<string, unknown>,
    contentFileIds(content),
  );
  if (placed.mediaIds.length > assignment.maxFiles)
    throw new ORPCError("BAD_REQUEST", {
      message: "coursework.too_many_files",
    });
  return placed.content;
}

// A post's files open to whoever reads the post, and only those it still shows.
registerHostReader("discussion_post", async (context, postId, file) => {
  const found = await discussionPostById(context.tx, context.tenantId, postId);
  if (!found) return false;
  try {
    const { assignment, viewer } = await discussionOf(
      context,
      found.assignmentId,
    );
    const view = await discussionView(context, assignment, viewer);
    const shown = view.posts.find((item) => item.id === postId)?.content;
    return Boolean(shown && (!file || contentFileIds(shown).includes(file.id)));
  } catch {
    return false;
  }
});

/**
 * Posts in a discussion: an answer to its prompt, or a reply hung under the
 * post it answers. A student's first post hands their work in, so the
 * teacher marks it as any other.
 */
export const post = writeProcedure
  .input(discussionPostSchema)
  .handler(async ({ input, context }) => {
    const { assignment, dueAt, viewer } = await discussionOf(
      context,
      input.assignmentId,
    );
    const view = await discussionView(context, assignment, viewer);
    if (view.closed)
      throw new ORPCError("CONFLICT", { message: "coursework.closed" });
    const plainText = postedText(input.content);
    let parentId: string | null = null;
    // The authors of the post answered and of the thread it is in.
    const answered: string[] = [];
    if (input.parentId) {
      const parent = await discussionPostById(
        context.tx,
        context.tenantId,
        input.parentId,
      );
      if (
        !parent ||
        parent.assignmentId !== assignment.id ||
        !view.posts.some((item) => item.id === parent.id)
      )
        throw new ORPCError("NOT_FOUND");
      parentId = parent.parentPostId ?? parent.id;
      answered.push(parent.authorUserId);
      const thread = view.posts.find((item) => item.id === parentId);
      if (thread) answered.push(thread.authorId);
    }
    if (view.waiting && parentId !== null)
      throw new ORPCError("CONFLICT", { message: "coursework.post_first" });
    const postId = Bun.randomUUIDv7();
    await insertDiscussionPost(context.tx, {
      id: postId,
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      authorId: context.actor.userId,
      parentId,
      content: await placedPost(context, assignment, postId, input.content),
      plainText,
    });
    if (!viewer.teacher) {
      const submission = await ensureSubmission(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: viewer.studentId,
      });
      const [row] = await studentWork(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
        studentId: viewer.studentId,
      });
      if (row && row.attempts === 0) {
        await insertAttempt(context.tx, {
          tenantId: context.tenantId,
          submissionId: submission.id,
          studentId: viewer.studentId,
          number: 1,
          isLate: isLate(dueAt, context.now),
          userId: context.actor.userId,
        });
        await touchSubmission(context.tx, {
          tenantId: context.tenantId,
          id: submission.id,
          expectedVersion: submission.version,
          state: "submitted",
          needsRevision: false,
        });
      }
    }
    await audit(context, {
      action: "discussion.post",
      objectType: "assignment",
      objectId: assignment.id,
      ...(viewer.teacher ? {} : { studentUserId: viewer.studentId }),
      details: { postId, reply: parentId !== null },
    });
    if (answered.length > 0) {
      const [replier] = await namesOf(context.tx, context.tenantId, [
        context.actor.userId,
      ]);
      // One unread notice a discussion, however many replies follow it.
      await notify(context, answered, {
        kind: "reply",
        subject: { type: "assignment", id: assignment.id },
        collapse: true,
        params: {
          title: assignment.title,
          actorName: replier?.fullNameEn ?? replier?.fullNameAr ?? "",
          actorNameAr: replier?.fullNameAr ?? replier?.fullNameEn ?? "",
        },
      });
    }
    return { id: postId };
  });

/** Its author changes a post, while the discussion is open and it is not hidden. */
export const editPost = writeProcedure
  .input(editDiscussionPostSchema)
  .handler(async ({ input, context }) => {
    const found = await discussionPostById(
      context.tx,
      context.tenantId,
      input.id,
    );
    if (!found || found.authorUserId !== context.actor.userId)
      throw new ORPCError("NOT_FOUND");
    const { assignment, viewer } = await discussionOf(
      context,
      found.assignmentId,
    );
    const view = await discussionView(context, assignment, viewer);
    if (view.closed)
      throw new ORPCError("CONFLICT", { message: "coursework.closed" });
    const plainText = postedText(input.content);
    const changed = await updateDiscussionPost(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
      authorId: context.actor.userId,
      content: await placedPost(context, assignment, found.id, input.content),
      plainText,
    });
    if (!changed)
      throw new ORPCError("CONFLICT", { message: "coursework.post_hidden" });
    return { edited: true };
  });

/** A teacher hides a post from the class, or shows it again; its author still reads it. */
export const hidePost = writeProcedure
  .input(hideDiscussionPostSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const found = await discussionPostById(
      context.tx,
      context.tenantId,
      input.id,
    );
    if (!found) throw new ORPCError("NOT_FOUND");
    await taughtAssignment(context, found.assignmentId);
    await hideDiscussionPost(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
      userId: context.actor.userId,
      hidden: input.hidden,
    });
    await audit(context, {
      action: input.hidden ? "discussion.hide" : "discussion.show",
      objectType: "assignment",
      objectId: found.assignmentId,
      details: { postId: found.id, authorId: found.authorUserId },
    });
    return { hidden: input.hidden };
  });
