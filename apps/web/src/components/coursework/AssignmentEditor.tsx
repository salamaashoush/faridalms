import type { ContentDocument } from "@faridalms/domain/content";
import type {
  LatePolicy,
  QuizKeep,
  QuizReveal,
  Rubric,
  SubmissionFormat,
} from "@faridalms/domain/coursework";
import type { FeedbackBand } from "@faridalms/domain/learning";

import {
  contentPlainText,
  holdsSuggestions,
  sameContent,
} from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  assignmentPhase,
  MAX_DISCUSSION_REPLIES,
  MAX_PEER_REVIEWS,
  PEER_FORMATS,
  MAX_QUIZ_ATTEMPTS,
  QUIZ_KEEPS,
  QUIZ_REVEALS,
  quizPoints,
  rubricTotal,
} from "@faridalms/domain/coursework";
import { isCheck } from "@faridalms/domain/learning";
import { quizOfBrief, sameLesson } from "@faridalms/domain/lesson-content";
import { zonedInstant, zonedLocal } from "@faridalms/domain/school";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Archive, CalendarClock, Copy, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { StartingPiece } from "~/components/content/Templates";
import type { assignmentEditorQuery } from "~/queries/coursework";

import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { contentIssueMessages } from "~/components/content/checks";
import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useStartFrom } from "~/components/content/Templates";
import { CourseworkSetting } from "~/components/exams/CourseworkSetting";
import { blockIssue } from "~/components/learning/issues";
import { CheckboxRow } from "~/components/people/fields";
import { ComboboxField } from "~/components/system/ComboboxField";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { SelectField, TextField } from "~/components/system/field";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classGroupsQuery, courseworkOptionsQuery } from "~/queries/coursework";
import { classPlanQuery } from "~/queries/grading";
import {
  archiveAssignment,
  publishAssignment,
  saveAssignment,
} from "~/server/coursework";
import { formatMinutes, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { FeedbackBands, keptBands } from "../learning/FeedbackBands";
import { displayName } from "../people/format";
import { formatInstant, PHASE_LABEL, PHASE_TONE } from "./format";
import { UseAgainSheet } from "./UseAgain";
import { useDocumentMedia } from "./useDocumentMedia";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof assignmentEditorQuery>["queryFn"]>>
>;

interface Draft {
  classId: string;
  title: string;
  brief: ContentDocument;
  audience: "class" | "selected";
  groupIds: string[];
  studentIds: string[];
  availableFrom: string;
  dueAt: string;
  closesAt: string;
  graded: boolean;
  points: string;
  rubricId: string;
  rubric: Rubric | null;
  gradingPeriodId: string;
  categoryId: string;
  submissionFormat: SubmissionFormat;
  maxFiles: string;
  latePolicy: LatePolicy;
  deduction: string;
  resubmission: boolean;
  gradeAfterAnswers: boolean;
  quiz: QuizDraft;
  discussion: { postFirst: boolean; replies: string };
  peer: { on: boolean; reviews: string; anonymous: boolean };
}

interface QuizDraft {
  attempts: string;
  keep: QuizKeep;
  reveal: QuizReveal;
  shuffle: boolean;
  /** Minutes, or "none" for no time limit. */
  timeLimit: string;
  practice: boolean;
  bands: FeedbackBand[];
}

const KEEP_LABEL: Record<QuizKeep, () => string> = {
  highest: m.quizKeepHighest,
  latest: m.quizKeepLatest,
  average: m.quizKeepAverage,
  first: m.quizKeepFirst,
};

const REVEAL_LABEL: Record<QuizReveal, () => string> = {
  answers: m.quizRevealAnswers,
  feedback: m.quizRevealFeedback,
  marks: m.quizRevealMarks,
  returned: m.quizRevealReturned,
};

const FORMATS: readonly SubmissionFormat[] = [
  "both",
  "online",
  "files",
  "none",
  "discussion",
  "quiz",
];

const FORMAT_LABEL: Record<SubmissionFormat, () => string> = {
  both: m.courseworkFormatBoth,
  online: m.courseworkFormatOnline,
  files: m.courseworkFormatFiles,
  none: m.courseworkFormatNone,
  quiz: m.courseworkFormatQuiz,
  discussion: m.courseworkFormatDiscussion,
};

/** Formats whose work belongs to them once out: a quiz's answers, a discussion's posts. */
const FIXED_FORMATS: ReadonlySet<SubmissionFormat> = new Set([
  "quiz",
  "discussion",
]);

const REPLY_COUNTS = Array.from(
  { length: MAX_DISCUSSION_REPLIES + 1 },
  (_, index) => String(index),
);

const PEER_COUNTS = Array.from({ length: MAX_PEER_REVIEWS }, (_, index) =>
  String(index + 1),
);

const NO_PEER = { on: false, reviews: "2", anonymous: true };

const ATTEMPTS = [
  "unlimited",
  ...Array.from({ length: MAX_QUIZ_ATTEMPTS }, (_, index) => String(index + 1)),
];

const TIME_LIMITS = [
  5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 135, 150, 180, 240,
];

type Field =
  | "title"
  | "classId"
  | "brief"
  | "dueAt"
  | "closesAt"
  | "points"
  | "audience"
  | "deduction"
  | "quiz";

/** Where a refusal from the server belongs on the page. */
const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "coursework.due_before_available": "dueAt",
  "coursework.close_before_due": "closesAt",
  "coursework.deduction_required": "deduction",
  "coursework.rubric_needs_points": "points",
  "coursework.rubric_total": "points",
  "coursework.audience_empty": "audience",
  "coursework.brief_empty": "brief",
  "coursework.quiz_questions": "quiz",
  "coursework.quiz_incomplete": "quiz",
  "coursework.quiz_started": "quiz",
  "coursework.quiz_gate": "quiz",
  "coursework.draw_tag": "quiz",
  "coursework.draw_short": "quiz",
};

/** Values that stop a draft saving, and so are flagged as they are typed. */
const AT_ONCE: ReadonlySet<Field> = new Set<Field>([
  "dueAt",
  "closesAt",
  "points",
  "deduction",
]);

/** The fields drawn in the details panel, which phones open in a sheet. */
const IN_PANEL: readonly Field[] = [
  "classId",
  "dueAt",
  "closesAt",
  "points",
  "audience",
  "deduction",
];

const newQuiz = (): QuizDraft => ({
  attempts: "1",
  keep: "highest",
  reveal: "answers",
  shuffle: false,
  timeLimit: "none",
  practice: false,
  bands: [],
});

function initialDraft(
  existing: Existing | null,
  timeZone: string,
  classId: string,
): Draft {
  const local = (iso: string | null) => (iso ? zonedLocal(iso, timeZone) : "");
  if (!existing)
    return {
      classId,
      title: "",
      brief: emptyContent(),
      audience: "class",
      groupIds: [],
      studentIds: [],
      availableFrom: "",
      dueAt: "",
      closesAt: "",
      graded: true,
      points: "10",
      rubricId: "",
      rubric: null,
      gradingPeriodId: "",
      categoryId: "",
      submissionFormat: "both",
      maxFiles: "5",
      latePolicy: "accept",
      deduction: "10",
      resubmission: false,
      gradeAfterAnswers: false,
      quiz: newQuiz(),
      discussion: { postFirst: true, replies: "2" },
      peer: NO_PEER,
    };
  return {
    classId: existing.classId,
    title: existing.title,
    brief: existing.brief ?? emptyContent(),
    audience: existing.audience,
    groupIds: existing.selection.groupIds,
    studentIds: existing.selection.studentIds,
    availableFrom: local(existing.availableFrom),
    dueAt: local(existing.dueAt),
    closesAt: local(existing.closesAt),
    graded: existing.points !== null,
    points: existing.points === null ? "10" : String(existing.points),
    rubricId: "",
    rubric: existing.rubric,
    gradingPeriodId: existing.gradingPeriodId ?? "",
    categoryId: existing.categoryId ?? "",
    submissionFormat: existing.submissionFormat,
    maxFiles: String(existing.maxFiles),
    latePolicy: existing.latePolicy,
    deduction: String(existing.lateDeductionPercent ?? 10),
    resubmission: existing.resubmission,
    gradeAfterAnswers: existing.gradeAfterAnswers,
    quiz: existing.quiz
      ? {
          attempts:
            existing.quiz.attempts === null
              ? "unlimited"
              : String(existing.quiz.attempts),
          keep: existing.quiz.keep,
          reveal: existing.quiz.reveal,
          shuffle: existing.quiz.shuffle,
          timeLimit:
            existing.quiz.timeLimit === null
              ? "none"
              : String(existing.quiz.timeLimit),
          practice: existing.quiz.practice,
          bands: existing.quiz.bands,
        }
      : newQuiz(),
    discussion: existing.discussion
      ? {
          postFirst: existing.discussion.postFirst,
          replies: String(existing.discussion.replies),
        }
      : { postFirst: true, replies: "2" },
    peer: existing.peer
      ? {
          on: true,
          reviews: String(existing.peer.reviews),
          anonymous: existing.peer.anonymous,
        }
      : NO_PEER,
  };
}

function toInstant(local: string, timeZone: string): string {
  if (!local) return "";
  const [date = "", time = "00:00"] = local.split("T");
  return zonedInstant(date, time, timeZone).toISOString();
}

/**
 * What stops a draft being stored, then what else stops it going out. The
 * first group is checked as the teacher writes, since nothing saves until it
 * is clear; the second only when they assign.
 */
function issuesOf(draft: Draft, started: boolean) {
  const quiz = draft.submissionFormat === "quiz";
  const blocking: Partial<Record<Field, string>> = {};
  if (!draft.title.trim()) blocking.title = m.courseworkTitleNeeded();
  if (!draft.classId) blocking.classId = m.courseworkClassNeeded();
  if (draft.availableFrom && draft.dueAt && draft.dueAt < draft.availableFrom)
    blocking.dueAt = m.validationDueAfterAvailable();
  if (draft.dueAt && draft.closesAt && draft.closesAt < draft.dueAt)
    blocking.closesAt = m.validationCloseAfterDue();
  if (!quiz && draft.graded && !(Number(draft.points) >= 0.5))
    blocking.points = m.courseworkPointsRequired();
  const deduction = Number(draft.deduction);
  if (
    draft.latePolicy === "deduct" &&
    !(Number.isInteger(deduction) && deduction >= 1 && deduction <= 100)
  )
    blocking.deduction = m.courseworkDeductionRequired();
  const publishing: Partial<Record<Field, string>> = {};
  const [briefIssue] = contentIssueMessages(draft.brief);
  if (!contentPlainText(draft.brief).trim())
    publishing.brief = m.errorCourseworkBriefEmpty();
  else if (holdsSuggestions(draft.brief))
    publishing.brief = m.lrnErrUnreviewed();
  else if (briefIssue) publishing.brief = briefIssue;
  if (
    draft.audience === "selected" &&
    draft.groupIds.length === 0 &&
    draft.studentIds.length === 0
  )
    publishing.audience = m.courseworkAudienceRequired();
  // A quiz's questions are written in its brief, so a half-written one
  // still saves; each must be whole before students meet it.
  if (quiz && !started) {
    const { blocks } = quizOfBrief(draft.brief);
    const asked = blocks.filter(isCheck);
    const draws = blocks.filter((block) => block.type === "draw");
    const issue = draws.some((draw) => !draw.tag)
      ? m.errDrawTag()
      : asked.map(blockIssue).find(Boolean);
    if (asked.length === 0 && draws.length === 0)
      publishing.quiz = m.quizQuestionsNeeded();
    else if (issue) publishing.quiz = issue;
  }
  return { blocking, publishing };
}

/** The dates and late rule in one sentence, as students will meet them. */
function scheduleSentence(draft: Draft, timeZone: string) {
  const at = (local: string) =>
    formatInstant(toInstant(local, timeZone), timeZone);
  const percent = formatNumber(Number(draft.deduction) || 0);
  const closes = draft.closesAt ? at(draft.closesAt) : null;
  const late =
    draft.latePolicy === "refuse"
      ? m.courseworkLateRefuseSentence()
      : draft.latePolicy === "deduct"
        ? closes
          ? m.courseworkLateDeductUntilSentence({ percent, date: closes })
          : m.courseworkLateDeductSentence({ percent })
        : closes
          ? m.courseworkLateUntilSentence({ date: closes })
          : m.courseworkLateAcceptSentence();
  return [
    draft.availableFrom
      ? m.courseworkShownFrom({ date: at(draft.availableFrom) })
      : m.courseworkShownNow(),
    draft.dueAt
      ? m.courseworkDueSentence({ date: at(draft.dueAt) })
      : m.courseworkNoDueSentence(),
    draft.dueAt ? late : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The fields as they are compared for unsent edits, without the brief. */
const fieldsOf = (value: Draft) => JSON.stringify({ ...value, brief: null });

/**
 * An assignment written as a document: the title and brief take the page,
 * the class, dates, grading and hand-in rules sit beside them. Drafts save
 * themselves once they could be stored; work already out holds its edits,
 * brief included, until Update, since students read it as it is.
 */
export function AssignmentEditor({
  existing,
  classId = "",
  template,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  classId?: string;
  /** The library piece a new assignment starts from. */
  template?: StartingPiece;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const user = useCurrentUser();
  const timeZone = user.school.timeZone;
  const queryClient = useQueryClient();
  // Co-teachers write a brief together once it exists; a new one starts alone.
  const live = useCollaboration(
    existing ? { hostType: "assignment", hostId: existing.id } : null,
  );
  const shared = live.state === "live";
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const leaving = useRef(false);
  const [storedId, setStoredId] = useState(existing?.id ?? "");
  const [state, setState] = useState(existing?.state ?? "draft");
  // Whether the work is still to come is judged from when the page opened.
  const [openedAt] = useState(() => Date.now());
  const [start] = useState(() =>
    initialDraft(
      existing,
      timeZone,
      classId ||
        (
          options.classes.find((row) => row.classType === "scheduled") ??
          options.classes[0]
        )?.id ||
        "",
    ),
  );
  const [draft, setDraft] = useState(start);
  const media = useDocumentMedia(
    draft.classId ? { type: "class", id: draft.classId } : undefined,
  );
  const [sent, setSent] = useState<Draft>(() => ({
    ...start,
    brief: existing?.publishedBrief ?? start.brief,
  }));
  const brief = useRef(start.brief);
  const [replace, setReplace] = useState<{
    to: ContentDocument;
    at: number;
  }>();
  useStartFrom(
    template,
    useCallback((piece: StartingPiece) => {
      brief.current = piece.content;
      setDraft((current) => ({
        ...current,
        title: current.title || piece.title,
        brief: piece.content,
      }));
      setReplace((current) => ({
        to: piece.content,
        at: (current?.at ?? 0) + 1,
      }));
    }, []),
  );
  const [valid, setValid] = useState(true);
  // Publishing waits for files still uploading, or they would be left out.
  const [uploading, setUploading] = useState(false);
  const [shown, setShown] = useState(false);
  const [refused, setRefused] = useState<Partial<Record<Field, string>>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reusing, setReusing] = useState({ key: 0, open: false });
  const [pending, setPending] = useState<"assign" | "update" | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const groups = useQuery({
    ...classGroupsQuery(draft.classId),
    enabled: Boolean(draft.classId),
  }).data;
  const plan = useQuery({
    ...classPlanQuery(draft.classId),
    enabled: Boolean(draft.classId),
  }).data;

  const published = state === "published";
  const archived = state === "archived";
  const isQuiz = draft.submissionFormat === "quiz";
  const isDiscussion = draft.submissionFormat === "discussion";
  const started = existing?.quiz?.started ?? false;
  const quizContent = quizOfBrief(draft.brief);
  const { blocking, publishing } = issuesOf(draft, started);
  const storable = Object.keys(blocking).length === 0;

  const inputOf = useCallback(
    (value: Draft) => {
      const quiz = value.submissionFormat === "quiz";
      const discussion = value.submissionFormat === "discussion";
      return {
        ...(id.current
          ? { id: id.current, expectedVersion: version.current }
          : {}),
        classId: value.classId,
        title: value.title.trim(),
        brief: shared ? brief.current : value.brief,
        audience: value.audience,
        groupIds: value.audience === "selected" ? value.groupIds : [],
        studentIds: value.audience === "selected" ? value.studentIds : [],
        availableFrom: toInstant(value.availableFrom, timeZone),
        dueAt: toInstant(value.dueAt, timeZone),
        closesAt: toInstant(value.closesAt, timeZone),
        latePolicy: value.latePolicy,
        ...(value.latePolicy === "deduct"
          ? { lateDeductionPercent: Number(value.deduction) }
          : {}),
        submissionFormat: value.submissionFormat,
        maxFiles: Math.min(
          20,
          Math.max(1, Math.round(Number(value.maxFiles)) || 1),
        ),
        resubmission: !discussion && value.resubmission,
        gradeAfterAnswers: !quiz && !discussion && value.gradeAfterAnswers,
        points: quiz ? null : value.graded ? Number(value.points) : null,
        rubric: !quiz && value.graded ? value.rubric : null,
        gradingPeriodId: value.gradingPeriodId,
        categoryId: value.categoryId,
        quiz: quiz
          ? {
              attempts:
                value.quiz.attempts === "unlimited"
                  ? null
                  : Number(value.quiz.attempts),
              keep: value.quiz.keep,
              // A practice quiz shows each answer as it is checked.
              reveal: value.quiz.practice ? "answers" : value.quiz.reveal,
              shuffle: value.quiz.shuffle,
              practice: value.quiz.practice,
              bands: keptBands(value.quiz.bands),
              timeLimit:
                value.quiz.timeLimit === "none"
                  ? null
                  : Number(value.quiz.timeLimit),
            }
          : null,
        discussion: discussion
          ? {
              postFirst: value.discussion.postFirst,
              replies: Number(value.discussion.replies),
            }
          : null,
        peer:
          value.peer.on && PEER_FORMATS.includes(value.submissionFormat)
            ? {
                reviews: Number(value.peer.reviews),
                anonymous: value.peer.anonymous,
              }
            : null,
      };
    },
    [shared, timeZone],
  );

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveAssignment({ data: inputOf(value) });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStoredId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      if (created) onCreated(saved.id);
    },
    [valid, inputOf, queryClient, onCreated],
  );

  // A live brief is stored by the room as it is typed, so only the other
  // fields start a save; the save still sends the brief as it reads now.
  const saving = shared ? { ...draft, brief: emptyContent() } : draft;
  const autosave = useAutosave({
    value: saving,
    save: persist,
    enabled: !published && !archived && storable,
  });

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setRefused((current) => ({ ...current, [key]: undefined }));
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);
  const changeBrief = useCallback(
    (value: ContentDocument) => {
      brief.current = value;
      set("brief", value);
    },
    [set],
  );
  const setQuiz = <K extends keyof QuizDraft>(key: K, value: QuizDraft[K]) =>
    set("quiz", { ...draft.quiz, [key]: value });

  // A quiz's brief is compared as students meet it, since the editor writes
  // out settings a stored question may leave to their defaults.
  const sameBrief = isQuiz ? sameLesson : sameContent;
  const changed =
    published &&
    (fieldsOf(draft) !== fieldsOf(sent) || !sameBrief(draft.brief, sent.brief));

  const fail = (error: unknown) => {
    const field =
      error instanceof Error ? FIELD_ERRORS[error.message] : undefined;
    if (field) {
      setRefused({ [field]: getMessageFromError(error) });
      setShown(true);
      if (IN_PANEL.includes(field)) setDetailsOpen(true);
    } else toast.error(getMessageFromError(error));
  };

  const check = () => {
    setShown(true);
    const found = { ...blocking, ...publishing };
    if (IN_PANEL.some((field) => found[field])) setDetailsOpen(true);
    return Object.keys(found).length === 0;
  };

  const later =
    draft.availableFrom !== "" &&
    Date.parse(toInstant(draft.availableFrom, timeZone)) > openedAt;

  const assign = async () => {
    if (!check()) return;
    setPending("assign");
    try {
      autosave.markSaved(saving);
      await autosave.settle();
      await persist(draft);
      const out = await publishAssignment({
        data: { id: id.current, expectedVersion: version.current },
      });
      version.current = out.version;
      setState("published");
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      toast.success(
        later
          ? m.courseworkScheduledToast({
              date: formatInstant(
                toInstant(draft.availableFrom, timeZone),
                timeZone,
              ),
            })
          : m.courseworkAssigned(),
      );
      leaving.current = true;
      onClose(id.current);
    } catch (error) {
      fail(error);
    } finally {
      setPending(null);
    }
  };

  const update = async () => {
    if (!check()) return;
    setPending("update");
    try {
      await persist(draft);
      setSent(draft);
      toast.success(m.courseworkUpdated());
    } catch (error) {
      fail(error);
    } finally {
      setPending(null);
    }
  };

  const archive = async () => {
    try {
      autosave.markSaved(saving);
      await autosave.settle();
      await archiveAssignment({
        data: { id: id.current, expectedVersion: version.current },
      });
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      toast.success(m.courseworkArchived());
      leaving.current = true;
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };

  const errorOf = (field: Field) => {
    const message =
      refused[field] ??
      (shown
        ? (blocking[field] ?? publishing[field])
        : AT_ONCE.has(field)
          ? blocking[field]
          : undefined);
    return message ? [message] : undefined;
  };
  const listed = shown
    ? [
        ...new Set(
          Object.values({ ...blocking, ...publishing, ...refused }).filter(
            (issue): issue is string => Boolean(issue),
          ),
        ),
      ]
    : [];

  const phase = assignmentPhase(
    {
      state,
      availableFrom: toInstant(sent.availableFrom, timeZone) || null,
      dueAt: toInstant(sent.dueAt, timeZone) || null,
      closesAt: toInstant(sent.closesAt, timeZone) || null,
      latePolicy: sent.latePolicy,
    },
    new Date(openedAt),
  );
  const chosenClass = options.classes.find((row) => row.id === draft.classId);
  const groupOptions = (groups?.groups ?? []).map((row) => ({
    value: row.id,
    label: inLocale(row.titleEn, row.titleAr),
  }));
  const studentOptions = (groups?.roster ?? []).map((row) => ({
    value: row.id,
    label: displayName(row),
  }));
  const points = isQuiz
    ? quizPoints(quizContent)
    : draft.graded
      ? Number(draft.points) || 0
      : null;

  return (
    <>
      <DocumentPage
        heading={existing ? m.courseworkEditTitle() : m.courseworkNewTitle()}
        onBack={async () => {
          if (await autosave.flush()) onClose(id.current || undefined);
        }}
        status={{ label: PHASE_LABEL[phase](), tone: PHASE_TONE[phase] }}
        saveState={autosave.state}
        onRetry={autosave.retry}
        notSaved={
          published || archived || storable || !autosave.dirty
            ? undefined
            : blocking.title
              ? m.courseworkNotSavedTitle()
              : blocking.quiz && Object.keys(blocking).length === 1
                ? m.courseworkNotSavedQuestions()
                : m.courseworkNotSavedDetails()
        }
        unpublished={
          changed
            ? {
                pending: pending === "update" || uploading,
                onDiscard: () => {
                  setDraft(sent);
                  brief.current = sent.brief;
                  setRefused({});
                  setShown(false);
                  setReplace((current) => ({
                    to: sent.brief,
                    at: (current?.at ?? 0) + 1,
                  }));
                },
                onUpdate: () => void update(),
              }
            : undefined
        }
        primary={
          published || archived
            ? undefined
            : {
                label: later ? m.courseworkSchedule() : m.courseworkAssign(),
                icon: later ? CalendarClock : Send,
                pending: pending === "assign",
                disabled: uploading,
                onClick: () => void assign(),
              }
        }
        link={storedId ? `/assignments/${storedId}` : undefined}
        preview={
          storedId
            ? {
                label: m.docPreview(),
                onClick: () =>
                  window.open(`/assignments/${storedId}`, "_blank", "noopener"),
              }
            : undefined
        }
        print={{
          title: draft.title.trim() || m.courseworkUntitled(),
          content: draft.brief,
          answers: true,
          link: storedId ? `/assignments/${storedId}` : undefined,
        }}
        templates={{
          kind: "assignment",
          empty: !contentPlainText(draft.brief).trim(),
          content: draft.brief,
          title: draft.title.trim() || m.courseworkUntitled(),
          onApply: (to) => {
            brief.current = to;
            setDraft((current) => ({ ...current, brief: to }));
            setReplace((current) => ({ to, at: (current?.at ?? 0) + 1 }));
          },
        }}
        history={
          storedId
            ? {
                hostType: "assignment",
                hostId: storedId,
                onRestore: (to) => {
                  brief.current = to;
                  setDraft((current) => ({ ...current, brief: to }));
                  setReplace((current) => ({
                    to,
                    at: (current?.at ?? 0) + 1,
                  }));
                },
              }
            : undefined
        }
        menu={
          storedId && !archived
            ? [
                {
                  label: m.courseworkUseAgain(),
                  icon: Copy,
                  onSelect: () =>
                    setReusing((current) => ({
                      key: current.key + 1,
                      open: true,
                    })),
                },
                {
                  label: m.courseworkArchive(),
                  icon: Archive,
                  destructive: true,
                  confirm: {
                    title: m.courseworkArchiveTitle({
                      title: draft.title.trim() || m.courseworkUntitled(),
                    }),
                    body: m.courseworkArchiveBody(),
                    label: m.courseworkArchive(),
                  },
                  onSelect: () => archive(),
                },
              ]
            : []
        }
        title={
          <div className="grid gap-3">
            {listed.length > 0 ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <p className="font-medium">{m.courseworkIncomplete()}</p>
                <ul className="mt-1 list-disc ps-5">
                  {listed.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isQuiz && started ? (
              <p className="text-sm leading-5 text-muted-foreground">
                {m.quizStartedHint()}
              </p>
            ) : null}
            <DocumentTitle
              id="work-title"
              label={m.courseworkTitle()}
              placeholder={m.courseworkUntitled()}
              maxLength={200}
              value={draft.title}
              onChange={(title) => set("title", title)}
              onEnter={() => document.getElementById("work-brief")?.focus()}
            />
          </div>
        }
        summary={[
          chosenClass ? classTitle(chosenClass) : "",
          draft.dueAt
            ? m.courseworkDueOn({
                date: formatInstant(toInstant(draft.dueAt, timeZone), timeZone),
              })
            : m.courseworkNoDueDate(),
          points === null
            ? m.courseworkUngraded()
            : m.courseworkPointsCount({ count: points }),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection title={m.courseworkSectionFor()}>
              <SelectField
                id="work-class"
                label={m.studentClass()}
                value={draft.classId}
                disabled={state !== "draft"}
                options={options.classes.map((row) => ({
                  value: row.id,
                  label: classTitle(row),
                }))}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    classId: value,
                    groupIds: [],
                    studentIds: [],
                    // Categories belong to the class's programme.
                    categoryId: "",
                  }))
                }
                errors={errorOf("classId")}
              />
              <SelectField
                id="work-audience"
                label={m.courseworkAudience()}
                value={draft.audience}
                options={[
                  { value: "class", label: m.courseworkAudienceClass() },
                  { value: "selected", label: m.courseworkAudienceSelected() },
                ]}
                onChange={(value) => set("audience", value)}
                errors={errorOf("audience")}
              />
              {draft.audience === "selected" ? (
                <>
                  <ComboboxField
                    label={m.courseworkGroups()}
                    optional
                    multiple
                    options={groupOptions.filter((row) =>
                      row.label
                        .toLowerCase()
                        .includes(groupSearch.toLowerCase()),
                    )}
                    value={draft.groupIds}
                    onChange={(value) => set("groupIds", value)}
                    search={groupSearch}
                    onSearchChange={setGroupSearch}
                  />
                  <ComboboxField
                    label={m.courseworkStudents()}
                    optional
                    multiple
                    options={studentOptions.filter((row) =>
                      row.label
                        .toLowerCase()
                        .includes(studentSearch.toLowerCase()),
                    )}
                    value={draft.studentIds}
                    onChange={(value) => set("studentIds", value)}
                    search={studentSearch}
                    onSearchChange={setStudentSearch}
                  />
                </>
              ) : null}
            </DetailsSection>
            <DetailsSection
              title={m.courseworkSectionDates()}
              hint={scheduleSentence(draft, timeZone)}
            >
              <TextField
                id="work-available"
                label={m.courseworkAvailableFrom()}
                hint={m.courseworkAvailableHint()}
                optional
                type="datetime-local"
                value={draft.availableFrom}
                onChange={(event) => set("availableFrom", event.target.value)}
              />
              <TextField
                id="work-due"
                label={m.courseworkDue()}
                hint={m.courseworkDueHint()}
                optional
                type="datetime-local"
                min={draft.availableFrom || undefined}
                value={draft.dueAt}
                onChange={(event) => set("dueAt", event.target.value)}
                errors={errorOf("dueAt")}
              />
              <TextField
                id="work-closes"
                label={m.courseworkClosesAt()}
                hint={m.courseworkClosesHint()}
                optional
                type="datetime-local"
                min={draft.dueAt || undefined}
                value={draft.closesAt}
                onChange={(event) => set("closesAt", event.target.value)}
                errors={errorOf("closesAt")}
              />
            </DetailsSection>
            <DetailsSection
              title={m.courseworkSectionGrading()}
              hint={
                isQuiz
                  ? m.quizPointsFromQuestions({
                      points: formatNumber(quizPoints(quizContent)),
                    })
                  : undefined
              }
            >
              {isQuiz ? null : (
                <CheckboxRow
                  label={m.courseworkGraded()}
                  checked={draft.graded}
                  onChange={(next) => set("graded", next)}
                />
              )}
              {draft.graded && !isQuiz ? (
                <>
                  <SelectField
                    id="work-rubric"
                    label={m.courseworkRubric()}
                    optional
                    value={
                      draft.rubricId || (draft.rubric ? "current" : "none")
                    }
                    options={[
                      { value: "none", label: m.courseworkNoRubric() },
                      ...(draft.rubric && !draft.rubricId
                        ? [
                            {
                              value: "current",
                              label: m.courseworkRubricAttached(),
                            },
                          ]
                        : []),
                      ...options.rubrics.map((row) => ({
                        value: row.id,
                        label: row.title,
                      })),
                    ]}
                    onChange={(value) => {
                      if (value === "current") return;
                      const chosen = options.rubrics.find(
                        (row) => row.id === value,
                      );
                      setDraft((current) => ({
                        ...current,
                        rubricId: chosen ? chosen.id : "",
                        rubric: chosen ? chosen.rubric : null,
                        points: chosen
                          ? String(rubricTotal(chosen.rubric))
                          : current.points,
                      }));
                    }}
                  />
                  <TextField
                    id="work-points"
                    label={m.courseworkPoints()}
                    hint={
                      draft.rubric ? m.courseworkPointsFromRubric() : undefined
                    }
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    step={0.5}
                    width="score"
                    disabled={draft.rubric !== null}
                    value={draft.points}
                    onChange={(event) => set("points", event.target.value)}
                    errors={errorOf("points")}
                  />
                  {options.terms.length > 0 ? (
                    <SelectField
                      id="work-term"
                      label={m.courseworkTerm()}
                      optional
                      value={draft.gradingPeriodId || "none"}
                      options={[
                        { value: "none", label: m.commonNotRecorded() },
                        ...options.terms.map((row) => ({
                          value: row.id,
                          label: inLocale(row.titleEn, row.titleAr),
                        })),
                      ]}
                      onChange={(value) =>
                        set("gradingPeriodId", value === "none" ? "" : value)
                      }
                    />
                  ) : null}
                  {plan?.categories.length ? (
                    <SelectField
                      id="work-category"
                      label={m.courseworkCategory()}
                      hint={m.courseworkCategoryHint()}
                      optional
                      value={draft.categoryId || "none"}
                      options={[
                        { value: "none", label: m.courseworkNoCategory() },
                        ...plan.categories.map((row) => ({
                          value: row.id,
                          label: m.courseworkCategoryWeight({
                            category: inLocale(row.titleEn, row.titleAr),
                            weight: formatNumber(row.weight),
                          }),
                        })),
                      ]}
                      onChange={(value) =>
                        set("categoryId", value === "none" ? "" : value)
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </DetailsSection>
            <DetailsSection title={m.courseworkSectionHandIn()}>
              <SelectField
                id="work-format"
                label={m.courseworkFormat()}
                value={draft.submissionFormat}
                options={FORMATS.filter(
                  // Work already out cannot turn into a quiz or a discussion, nor they into other work.
                  (value) =>
                    !FIXED_FORMATS.has(value) ||
                    !published ||
                    existing?.submissionFormat === value,
                ).map((value) => ({ value, label: FORMAT_LABEL[value]() }))}
                onChange={(value) => set("submissionFormat", value)}
                disabled={
                  published &&
                  existing !== null &&
                  FIXED_FORMATS.has(existing.submissionFormat)
                }
              />
              {draft.submissionFormat === "files" ||
              draft.submissionFormat === "both" ||
              isDiscussion ? (
                <TextField
                  id="work-max-files"
                  label={m.courseworkMaxFiles()}
                  type="number"
                  min={1}
                  max={20}
                  width="score"
                  value={draft.maxFiles}
                  onChange={(event) => set("maxFiles", event.target.value)}
                />
              ) : null}
              <SelectField
                id="work-late"
                label={m.courseworkLatePolicy()}
                value={draft.latePolicy}
                options={[
                  { value: "accept", label: m.courseworkLateAccept() },
                  { value: "deduct", label: m.courseworkLateDeduct() },
                  { value: "refuse", label: m.courseworkLateRefuse() },
                ]}
                onChange={(value) => set("latePolicy", value)}
              />
              {draft.latePolicy === "deduct" ? (
                <TextField
                  id="work-deduction"
                  label={m.courseworkDeduction()}
                  type="number"
                  min={1}
                  max={100}
                  width="score"
                  value={draft.deduction}
                  onChange={(event) => set("deduction", event.target.value)}
                  errors={errorOf("deduction")}
                />
              ) : null}
              {isQuiz || isDiscussion ? null : (
                <CheckboxRow
                  label={m.courseworkResubmission()}
                  checked={draft.resubmission}
                  onChange={(next) => set("resubmission", next)}
                />
              )}
              {isQuiz || isDiscussion ? null : (
                <CheckboxRow
                  label={m.courseworkGradeAfterAnswers()}
                  hint={m.courseworkGradeAfterAnswersHint()}
                  checked={draft.gradeAfterAnswers}
                  onChange={(next) => set("gradeAfterAnswers", next)}
                />
              )}
            </DetailsSection>
            {isQuiz || isDiscussion ? null : (
              <CourseworkSetting
                assignmentId={storedId}
                board={
                  plan?.programme
                    ? (plan.programme.officialBoard ?? plan.programme.boardId)
                    : null
                }
              />
            )}
            {isDiscussion ? (
              <DetailsSection title={m.discussionSection()}>
                <CheckboxRow
                  label={m.discussionPostFirst()}
                  hint={m.discussionPostFirstHint()}
                  checked={draft.discussion.postFirst}
                  onChange={(postFirst) =>
                    set("discussion", { ...draft.discussion, postFirst })
                  }
                />
                <SelectField
                  id="discussion-replies"
                  label={m.discussionReplies()}
                  value={draft.discussion.replies}
                  options={REPLY_COUNTS.map((value) => ({
                    value,
                    label:
                      value === "0"
                        ? m.discussionRepliesNone()
                        : formatNumber(Number(value)),
                  }))}
                  onChange={(replies) =>
                    set("discussion", { ...draft.discussion, replies })
                  }
                />
              </DetailsSection>
            ) : null}
            {PEER_FORMATS.includes(draft.submissionFormat) ? (
              <DetailsSection title={m.peerSection()}>
                <CheckboxRow
                  label={m.peerOn()}
                  hint={
                    existing?.peerStarted ? m.peerStartedHint() : m.peerOnHint()
                  }
                  checked={draft.peer.on}
                  disabled={existing?.peerStarted}
                  onChange={(on) => set("peer", { ...draft.peer, on })}
                />
                {draft.peer.on ? (
                  <>
                    <SelectField
                      id="peer-reviews"
                      label={m.peerReviewsEach()}
                      value={draft.peer.reviews}
                      options={PEER_COUNTS.map((value) => ({
                        value,
                        label: formatNumber(Number(value)),
                      }))}
                      onChange={(reviews) =>
                        set("peer", { ...draft.peer, reviews })
                      }
                    />
                    <CheckboxRow
                      label={m.peerAnonymous()}
                      hint={m.peerAnonymousHint()}
                      checked={draft.peer.anonymous}
                      onChange={(anonymous) =>
                        set("peer", { ...draft.peer, anonymous })
                      }
                    />
                  </>
                ) : null}
              </DetailsSection>
            ) : null}
            {isQuiz ? (
              <DetailsSection title={m.quizSection()}>
                <SelectField
                  id="quiz-attempts"
                  label={m.quizAttempts()}
                  value={draft.quiz.attempts}
                  options={ATTEMPTS.map((value) => ({
                    value,
                    label:
                      value === "unlimited"
                        ? m.quizAttemptsUnlimited()
                        : m.quizAttemptsCount({ count: Number(value) }),
                  }))}
                  onChange={(value) => setQuiz("attempts", value)}
                />
                {draft.quiz.attempts === "1" ? null : (
                  <SelectField
                    id="quiz-keep"
                    label={m.quizKeep()}
                    value={draft.quiz.keep}
                    options={QUIZ_KEEPS.map((value) => ({
                      value,
                      label: KEEP_LABEL[value](),
                    }))}
                    onChange={(value) => setQuiz("keep", value)}
                  />
                )}
                <CheckboxRow
                  label={m.quizPractice()}
                  hint={m.quizPracticeHint()}
                  checked={draft.quiz.practice}
                  onChange={(value) => setQuiz("practice", value)}
                />
                {draft.quiz.practice ? null : (
                  <SelectField
                    id="quiz-reveal"
                    label={m.quizReveal()}
                    hint={m.quizRevealHint()}
                    value={draft.quiz.reveal}
                    options={QUIZ_REVEALS.map((value) => ({
                      value,
                      label: REVEAL_LABEL[value](),
                    }))}
                    onChange={(value) => setQuiz("reveal", value)}
                  />
                )}
                <SelectField
                  id="quiz-time-limit"
                  label={m.quizTimeLimit()}
                  hint={m.quizTimeLimitHint()}
                  value={draft.quiz.timeLimit}
                  options={[
                    { value: "none", label: m.quizTimeLimitNone() },
                    ...[
                      ...new Set([
                        ...TIME_LIMITS,
                        ...(draft.quiz.timeLimit === "none"
                          ? []
                          : [Number(draft.quiz.timeLimit)]),
                      ]),
                    ]
                      .toSorted((a, b) => a - b)
                      .map((minutes) => ({
                        value: String(minutes),
                        label: formatMinutes(minutes),
                      })),
                  ]}
                  onChange={(value) => setQuiz("timeLimit", value)}
                />
                <CheckboxRow
                  label={m.quizShuffle()}
                  hint={m.quizShuffleHint()}
                  checked={draft.quiz.shuffle}
                  onChange={(value) => setQuiz("shuffle", value)}
                />
                <FeedbackBands
                  bands={draft.quiz.bands}
                  onChange={(value) => setQuiz("bands", value)}
                />
              </DetailsSection>
            ) : null}
          </DetailsPanel>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
          <ContentEditor
            id="work-brief"
            label={m.courseworkBrief()}
            variant="document"
            value={draft.brief}
            onChange={changeBrief}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            questions={isQuiz}
            gates={false}
            draws={isQuiz}
            lockQuestions={started}
            starter={!isQuiz}
            collaboration={shared ? live.collaboration : undefined}
            pending={live.state === "loading"}
            replace={replace}
          />
        </div>
      </DocumentPage>
      <UnsavedChangesGuard
        isDirty={() =>
          !leaving.current &&
          (changed || (!published && !archived && !storable && autosave.dirty))
        }
        pending={pending !== null}
      />
      {reusing.key > 0 && storedId ? (
        <UseAgainSheet
          key={reusing.key}
          source={{
            id: storedId,
            title: draft.title.trim() || m.courseworkUntitled(),
          }}
          classId={draft.classId}
          open={reusing.open}
          onClose={() => setReusing((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
