import type { ContentDocument } from "@faridalms/domain/content";
import type {
  LatePolicy,
  QuizKeep,
  QuizReveal,
  Rubric,
  SubmissionFormat,
} from "@faridalms/domain/coursework";
import type { FeedbackBand } from "@faridalms/domain/learning";
import type { ContentLocale } from "@faridalms/domain/translations";

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
  scheduleIssue,
} from "@faridalms/domain/coursework";
import { isCheck } from "@faridalms/domain/learning";
import { quizOfBrief, sameLesson } from "@faridalms/domain/lesson-content";
import {
  CONTENT_LOCALES,
  languageDirection,
  otherLocale,
  translationState,
} from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Archive, CalendarClock, ClipboardPen, Copy, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { StartingPiece } from "~/components/content/Templates";
import type { assignmentEditorQuery } from "~/queries/coursework";

import { AssistantTranslate } from "~/components/content/assistant";
import { contentIssueMessages } from "~/components/content/checks";
import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { LtiHostProvider } from "~/components/content/lti";
import { useStartFrom } from "~/components/content/Templates";
import { TranslationNote } from "~/components/content/TranslationNote";
import { CourseworkSetting } from "~/components/exams/CourseworkSetting";
import { blockIssue } from "~/components/learning/issues";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { classGroupsQuery, courseworkOptionsQuery } from "~/queries/coursework";
import { classPlanQuery } from "~/queries/grading";
import { teachingModulesQuery } from "~/queries/learning";
import {
  archiveAssignment,
  publishAssignment,
  reviewBriefTranslation,
  saveAssignment,
} from "~/server/coursework";
import {
  formatInstant,
  formatMinutes,
  formatNumber,
  instantFromLocal,
  localInput,
} from "~/utils/datetime";
import { getMessageFromError, refusalOf } from "~/utils/error";

import { classChoices, classTitle, defaultClass } from "../classes/format";
import { FeedbackBands, keptBands } from "../learning/FeedbackBands";
import { displayName } from "../people/format";
import { PHASE_LABEL, PHASE_TONE } from "./format";
import { prosodyRubric } from "./readyRubrics";
import { RubricSheet } from "./RubricSheet";
import { UseAgainSheet } from "./UseAgain";

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
  /** The module it stands in, empty for none. */
  discussion: { postFirst: boolean; replies: string; moduleId: string };
  /** The review date as the date field holds it, empty for none. */
  peer: { on: boolean; reviews: string; anonymous: boolean; dueAt: string };
  language: ContentLocale | "auto";
  /** The brief in the other language: its title, empty for the original's, and its words. */
  translation: { title: string; content: ContentDocument } | null;
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
  "online_and_files",
  "online",
  "files",
  "none",
  "discussion",
  "quiz",
];

const FORMAT_LABEL: Record<SubmissionFormat, () => string> = {
  both: m.courseworkFormatBoth,
  online_and_files: m.courseworkFormatWrittenAndFiles,
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

/** The ready-made rubric for reading aloud, offered beside the teacher's own. */
const READY_PROSODY = "ready:prosody";

const NO_PEER = { on: false, reviews: "2", anonymous: true, dueAt: "" };

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
  classId: string,
  moduleId: string,
): Draft {
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
      // Started from a module, it is that module's discussion.
      submissionFormat: moduleId ? "discussion" : "both",
      maxFiles: "5",
      latePolicy: "accept",
      deduction: "10",
      resubmission: false,
      gradeAfterAnswers: false,
      quiz: newQuiz(),
      discussion: { postFirst: true, replies: "2", moduleId },
      peer: NO_PEER,
      language: "auto",
      translation: null,
    };
  return {
    classId: existing.classId,
    title: existing.title,
    brief: existing.brief ?? emptyContent(),
    audience: existing.audience,
    groupIds: existing.selection.groupIds,
    studentIds: existing.selection.studentIds,
    availableFrom: localInput(existing.availableFrom),
    dueAt: localInput(existing.dueAt),
    closesAt: localInput(existing.closesAt),
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
          moduleId: existing.discussion.moduleId,
        }
      : { postFirst: true, replies: "2", moduleId: "" },
    peer: existing.peer
      ? {
          on: true,
          reviews: String(existing.peer.reviews),
          anonymous: existing.peer.anonymous,
          dueAt: localInput(existing.peer.dueAt || null),
        }
      : NO_PEER,
    language: existing.language ?? "auto",
    translation: existing.translation,
  };
}

/**
 * What stops a draft being stored, then what else stops it going out. The
 * first group is checked as the teacher writes, since nothing saves until it
 * is clear; the second only when they assign. The rules the API keeps for
 * an assignment's dates and late work come in `ruled`.
 */
function issuesOf(
  draft: Draft,
  started: boolean,
  ruled: Partial<Record<Field, string>>,
) {
  const quiz = draft.submissionFormat === "quiz";
  const blocking: Partial<Record<Field, string>> = { ...ruled };
  if (!draft.title.trim()) blocking.title = m.courseworkTitleNeeded();
  if (!draft.classId) blocking.classId = m.courseworkClassNeeded();
  if (!quiz && draft.graded && !(Number(draft.points) >= 0.5))
    blocking.points = m.courseworkPointsRequired();
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

/**
 * What the API's own rules refuse in a draft's dates and late work, on the
 * field each belongs to.
 */
function ruledIssues(draft: Draft): Partial<Record<Field, string>> {
  const issue = scheduleIssue({
    availableFrom: instantFromLocal(draft.availableFrom),
    dueAt: instantFromLocal(draft.dueAt),
    closesAt: instantFromLocal(draft.closesAt),
    latePolicy: draft.latePolicy,
    ...(draft.latePolicy === "deduct"
      ? { lateDeductionPercent: Number(draft.deduction) }
      : {}),
  });
  const field = issue ? FIELD_ERRORS[issue] : undefined;
  return issue && field
    ? { [field]: getMessageFromError(new Error(issue)) }
    : {};
}

/** The dates and late rule in one sentence, as students will meet them. */
const dueText = (local: string) => formatInstant(instantFromLocal(local));

function scheduleSentence(draft: Draft) {
  const percent = formatNumber(Number(draft.deduction) || 0);
  const closes = draft.closesAt ? dueText(draft.closesAt) : null;
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
      ? m.courseworkShownFrom({ date: dueText(draft.availableFrom) })
      : m.courseworkShownNow(),
    draft.dueAt
      ? m.courseworkDueSentence({ date: dueText(draft.dueAt) })
      : m.courseworkNoDueSentence(),
    draft.dueAt ? late : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The fields as they are compared for unsent edits, without the brief. */
const fieldsOf = (value: Draft) => JSON.stringify({ ...value, brief: null });

export interface AssignmentEditorProps {
  existing: Existing | null;
  classId?: string;
  /** The module a new discussion is started from. */
  moduleId?: string;
  /** The library piece a new assignment starts from. */
  template?: StartingPiece;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

/**
 * An assignment written as a document: the title and brief take the page,
 * the class, dates, grading and hand-in rules sit beside them. Drafts save
 * themselves once they could be stored; work already out holds its edits,
 * brief included, until Update, since students read it as it is.
 */
export function AssignmentEditor({
  existing,
  classId = "",
  moduleId = "",
  template,
  onClose,
  onCreated,
}: AssignmentEditorProps) {
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
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
      classId || defaultClass(options.classes)?.id || "",
      moduleId,
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
  const [writingRubric, setWritingRubric] = useState({ key: 0, open: false });
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
  const user = useCurrentUser();
  // A discussion may stand in a module set for its class, where modules are on.
  const placeable =
    user.modules.elearning && user.capabilities.includes("learning:author");
  const classModules = useQuery({
    ...teachingModulesQuery(draft.classId),
    enabled:
      placeable &&
      Boolean(draft.classId) &&
      draft.submissionFormat === "discussion",
  }).data?.rows.filter((row) =>
    row.classes.some((item) => item.id === draft.classId),
  );

  const published = state === "published";
  const archived = state === "archived";
  const isQuiz = draft.submissionFormat === "quiz";
  const isDiscussion = draft.submissionFormat === "discussion";
  const started = existing?.quiz?.started ?? false;
  const quizContent = quizOfBrief(draft.brief);

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
        availableFrom: instantFromLocal(value.availableFrom),
        dueAt: instantFromLocal(value.dueAt),
        closesAt: instantFromLocal(value.closesAt),
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
              moduleId: value.discussion.moduleId,
            }
          : null,
        peer:
          value.peer.on && PEER_FORMATS.includes(value.submissionFormat)
            ? {
                reviews: Number(value.peer.reviews),
                anonymous: value.peer.anonymous,
                dueAt: instantFromLocal(value.peer.dueAt),
              }
            : null,
        language: value.language === "auto" ? null : value.language,
        translation: value.translation,
      };
    },
    [shared],
  );
  const { blocking, publishing } = issuesOf(draft, started, ruledIssues(draft));
  const storable = Object.keys(blocking).length === 0;

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

  // Which of the brief's languages is being written, while it has two.
  const [writing, setWriting] = useState<"original" | "translation">(
    "original",
  );
  const [translationCheck, setTranslationCheck] = useState(
    existing?.translationReview ?? null,
  );
  const [reviewing, setReviewing] = useState(false);
  // Each drafted translation draws its editor again with the draft in it.
  const [drafted, setDrafted] = useState(0);
  const [removing, setRemoving] = useState(false);
  const language = draft.language === "auto" ? null : draft.language;
  const translated = draft.translation;
  const setTranslation = (
    change: (current: { title: string; content: ContentDocument }) => {
      title: string;
      content: ContentDocument;
    },
  ) =>
    setDraft((current) =>
      current.translation
        ? { ...current, translation: change(current.translation) }
        : current,
    );
  const translation =
    language && translated
      ? translationState({
          translation: translated.content,
          reviewed: translationCheck !== null,
          current: translationCheck?.current ?? false,
        })
      : null;
  const markReviewed = async (reviewed: boolean) => {
    if (!storedId) return;
    setReviewing(true);
    try {
      if (await autosave.flush()) {
        const result = await reviewBriefTranslation({
          data: { id: storedId, expectedVersion: version.current, reviewed },
        });
        version.current = result.version;
        setTranslationCheck(result.review);
      }
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setReviewing(false);
    }
  };

  // A quiz's brief is compared as students meet it, since the editor writes
  // out settings a stored question may leave to their defaults.
  const sameBrief = isQuiz ? sameLesson : sameContent;
  const changed =
    published &&
    (fieldsOf(draft) !== fieldsOf(sent) || !sameBrief(draft.brief, sent.brief));

  const fail = (error: unknown) => {
    const refusal = refusalOf(error, FIELD_ERRORS);
    if (!refusal) return;
    if (refusal.field) {
      setRefused({ [refusal.field]: refusal.message });
      setShown(true);
      if (IN_PANEL.includes(refusal.field)) setDetailsOpen(true);
    } else toast.error(refusal.message);
  };

  const check = () => {
    setShown(true);
    const found = { ...blocking, ...publishing };
    if (IN_PANEL.some((field) => found[field])) setDetailsOpen(true);
    return Object.keys(found).length === 0;
  };

  const later =
    draft.availableFrom !== "" &&
    Date.parse(instantFromLocal(draft.availableFrom)) > openedAt;

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
              date: formatInstant(instantFromLocal(draft.availableFrom)),
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
      availableFrom: instantFromLocal(sent.availableFrom) || null,
      dueAt: instantFromLocal(sent.dueAt) || null,
      closesAt: instantFromLocal(sent.closesAt) || null,
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
    <LtiHostProvider type="assignment" id={storedId || null}>
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
        comments={
          storedId
            ? {
                hostType: "assignment",
                hostId: storedId,
                editor: "work-brief",
                part: writing === "translation" ? "translation" : "body",
              }
            : undefined
        }
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
            {language && translated ? (
              <Tabs
                value={writing}
                onValueChange={(value: "original" | "translation") =>
                  setWriting(value)
                }
              >
                <TabsList aria-label={m.contentLanguage()}>
                  <TabsTrigger value="original" lang={language}>
                    {LOCALE_LABEL[language]()}
                  </TabsTrigger>
                  <TabsTrigger value="translation" lang={otherLocale(language)}>
                    {LOCALE_LABEL[otherLocale(language)]()}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            {language && translated && writing === "translation" ? (
              <div
                lang={otherLocale(language)}
                dir={languageDirection(otherLocale(language))}
              >
                <DocumentTitle
                  id="work-title"
                  label={m.courseworkTitle()}
                  placeholder={draft.title || m.courseworkUntitled()}
                  maxLength={200}
                  value={translated.title}
                  onChange={(title) =>
                    setTranslation((current) => ({ ...current, title }))
                  }
                  onEnter={() => document.getElementById("work-brief")?.focus()}
                />
              </div>
            ) : (
              <div
                lang={language ?? undefined}
                dir={language ? languageDirection(language) : undefined}
              >
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
            )}
          </div>
        }
        summary={[
          chosenClass ? classTitle(chosenClass) : "",
          draft.dueAt
            ? m.courseworkDueOn({
                date: formatInstant(instantFromLocal(draft.dueAt)),
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
                options={classChoices(options.classes)}
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
              {isDiscussion && draft.discussion.moduleId ? (
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.courseworkModuleDiscussionReach()}
                </p>
              ) : (
                <SelectField
                  id="work-audience"
                  label={m.courseworkAudience()}
                  value={draft.audience}
                  options={[
                    { value: "class", label: m.courseworkAudienceClass() },
                    {
                      value: "selected",
                      label: m.courseworkAudienceSelected(),
                    },
                  ]}
                  onChange={(value) => set("audience", value)}
                  errors={errorOf("audience")}
                />
              )}
              {draft.audience === "selected" &&
              !(isDiscussion && draft.discussion.moduleId) ? (
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
              hint={scheduleSentence(draft)}
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
                      {
                        value: READY_PROSODY,
                        label: m.rubricReadyProsody(),
                      },
                    ]}
                    onChange={(value) => {
                      if (value === "current") return;
                      const chosen =
                        value === READY_PROSODY
                          ? { id: "", rubric: prosodyRubric() }
                          : options.rubrics.find((row) => row.id === value);
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit max-md:h-10"
                    onClick={() =>
                      setWritingRubric((current) => ({
                        key: current.key + 1,
                        open: true,
                      }))
                    }
                  >
                    <ClipboardPen aria-hidden />
                    {draft.rubric ? m.rubricEdit() : m.rubricWrite()}
                  </Button>
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
              draft.submissionFormat === "online_and_files" ||
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
                {placeable ? (
                  <SelectField
                    id="discussion-module"
                    label={m.discussionModule()}
                    hint={m.discussionModuleHint()}
                    optional
                    value={draft.discussion.moduleId || "none"}
                    options={[
                      { value: "none", label: m.discussionNoModule() },
                      ...(classModules ?? []).map((row) => ({
                        value: row.id,
                        label: row.title,
                      })),
                    ]}
                    onChange={(value) =>
                      set("discussion", {
                        ...draft.discussion,
                        moduleId: value === "none" ? "" : value,
                      })
                    }
                  />
                ) : null}
              </DetailsSection>
            ) : null}
            <DetailsSection title={m.contentLanguage()}>
              <SelectField
                id="work-language"
                label={m.courseworkLanguage()}
                value={draft.language}
                options={[
                  { value: "auto", label: m.lrnLanguageAuto() },
                  ...CONTENT_LOCALES.map((value) => ({
                    value,
                    label: LOCALE_LABEL[value](),
                  })),
                ]}
                onChange={(value) => set("language", value)}
                disabled={translated !== null}
                hint={
                  translated
                    ? m.courseworkLanguageLocked()
                    : m.courseworkLanguageHint()
                }
              />
              {language ? (
                <CheckboxRow
                  label={m.contentBilingual({
                    language: LOCALE_NAME[otherLocale(language)](),
                  })}
                  hint={m.courseworkTranslationHint()}
                  checked={translated !== null}
                  onChange={(checked) => {
                    if (!checked) {
                      setRemoving(true);
                      return;
                    }
                    // A translation starts as the brief, to be rewritten.
                    set("translation", {
                      title: "",
                      content: shared ? brief.current : draft.brief,
                    });
                    setWriting("translation");
                  }}
                />
              ) : null}
              {language && translated && translation ? (
                <>
                  <TranslationNote
                    state={translation}
                    review={translationCheck}
                    language={LOCALE_NAME[otherLocale(language)]()}
                  />
                  <CheckboxRow
                    label={m.translationReviewedCheck()}
                    hint={m.translationReviewedHint({
                      language: LOCALE_NAME[language](),
                    })}
                    checked={translation === "reviewed"}
                    disabled={reviewing || !storedId}
                    onChange={(checked) => void markReviewed(checked)}
                  />
                  <AssistantTranslate
                    host={
                      storedId ? { type: "assignment", id: storedId } : null
                    }
                    original={draft.brief}
                    title={draft.title}
                    language={language}
                    written={!sameContent(translated.content, draft.brief)}
                    onTranslated={(next) => {
                      setTranslation((current) => ({
                        title: next.title || current.title,
                        content: next.content,
                      }));
                      setDrafted((count) => count + 1);
                      setWriting("translation");
                    }}
                  />
                </>
              ) : null}
            </DetailsSection>
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
                    <TextField
                      id="peer-due"
                      label={m.peerDue()}
                      hint={m.peerDueHint()}
                      optional
                      type="datetime-local"
                      min={draft.dueAt || undefined}
                      value={draft.peer.dueAt}
                      onChange={(event) =>
                        set("peer", {
                          ...draft.peer,
                          dueAt: event.target.value,
                        })
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
          {language && translated && writing === "translation" ? (
            <ContentEditor
              key={`translation-${drafted}`}
              id="work-brief"
              label={m.courseworkBrief()}
              variant="document"
              value={translated.content}
              onChange={(value) =>
                setTranslation((current) => ({ ...current, content: value }))
              }
              onValidityChange={setValid}
              onUploadingChange={setUploading}
              media={media}
              questions={isQuiz}
              gates={false}
              draws={isQuiz}
              starter={!isQuiz}
              language={otherLocale(language)}
              assistant
            />
          ) : (
            <ContentEditor
              key="original"
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
              language={language ?? undefined}
              collaboration={shared ? live.collaboration : undefined}
              pending={live.state === "loading"}
              replace={replace}
              assistant
            />
          )}
        </div>
      </DocumentPage>
      <UnsavedChangesGuard
        isDirty={() =>
          !leaving.current &&
          (changed || (!published && !archived && !storable && autosave.dirty))
        }
        pending={pending !== null}
      />
      <ConfirmDialog
        open={removing}
        title={m.lrnTranslationRemoveTitle({
          language: LOCALE_NAME[language ? otherLocale(language) : "ar"](),
        })}
        body={m.courseworkTranslationRemoveBody()}
        confirmLabel={m.lrnTranslationRemove()}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          set("translation", null);
          setWriting("original");
          setRemoving(false);
        }}
      />
      {writingRubric.key > 0 ? (
        <RubricSheet
          key={writingRubric.key}
          open={writingRubric.open}
          onOpenChange={(open) =>
            setWritingRubric((current) => ({ ...current, open }))
          }
          rubric={draft.rubric}
          kept={
            options.rubrics.find((row) => row.id === draft.rubricId) ?? null
          }
          onUse={(rubric, keptId) =>
            setDraft((current) => ({
              ...current,
              rubric,
              rubricId: keptId,
              points: String(rubricTotal(rubric)),
            }))
          }
          onForget={() => set("rubricId", "")}
        />
      ) : null}
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
    </LtiHostProvider>
  );
}
