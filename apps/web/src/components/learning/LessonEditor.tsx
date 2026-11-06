import type { ContentDocument } from "@faridalms/domain/content";
import type {
  FeedbackBand,
  LessonCompletion,
  LessonCondition,
  VowelMarks,
} from "@faridalms/domain/learning";
import type { ContentLocale } from "@faridalms/domain/translations";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  isCheck,
  LESSON_COMPLETIONS,
  VOWEL_MARKS,
  lessonIssue,
  lessonPlainText,
  lessonScored,
} from "@faridalms/domain/learning";
import {
  contentOfLesson,
  lessonOfContent,
  sameBlocks,
  sameLesson,
} from "@faridalms/domain/lesson-content";
import { untranslatedParts } from "@faridalms/domain/lesson-translation";
import {
  CONTENT_LOCALES,
  languageDirection,
  otherLocale,
  translationState,
} from "@faridalms/domain/translations";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  ChoiceField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BuiltInGroup,
  StartingPiece,
} from "~/components/content/Templates";
import type { lessonEditorQuery } from "~/queries/learning";

import { contentIssueMessages } from "~/components/content/checks";
import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { LtiHostProvider } from "~/components/content/lti";
import { useStartFrom } from "~/components/content/Templates";
import { TranslationNote } from "~/components/content/TranslationNote";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { moduleRecordQuery } from "~/queries/learning";
import {
  getRemarking,
  reviewLessonTranslation,
  saveLesson,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { CopyLessonSheet } from "./CopyLesson";
import { FeedbackBands, keptBands } from "./FeedbackBands";
import { COMPLETION_LABEL, conditionText } from "./format";
import { blockIssue } from "./issues";
import { PATTERNS } from "./patterns";
import { sayIn } from "./starters";
import { YoungAdviceList } from "./YoungAdvice";

/** The teaching patterns, in the language the teacher works in. */
function patternGroup(): BuiltInGroup {
  const say = sayIn(getLocale() === "ar" ? "ar" : "en");
  return {
    label: m.patternGroup(),
    items: PATTERNS.map((pattern) => ({
      key: pattern.key,
      title: pattern.title(),
      hint: pattern.hint(),
      content: () =>
        contentOfLesson({ version: 2, blocks: pattern.blocks(say) }),
    })),
  };
}

const VOWEL_MARKS_LABEL: Record<VowelMarks, () => string> = {
  shown: m.lrnVowelMarksShown,
  hidden: m.lrnVowelMarksHidden,
  choice: m.lrnVowelMarksChoice,
};

type Range = "below" | "atLeast" | "between";

const RANGE_LABEL: Record<Range, () => string> = {
  below: m.lrnConditionBelow,
  atLeast: m.lrnConditionAtLeast,
  between: m.lrnConditionBetween,
};

const isPercent = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 100;

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonEditorQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
  completion: LessonCompletion;
  passScore: string;
  review: boolean;
  vowelMarks: VowelMarks;
  language: ContentLocale | "auto";
  /** The lesson in the other language: its title, empty for the original's, and its words. */
  translation: { title: string; content: ContentDocument } | null;
  young: boolean;
  readAlong: boolean;
  bands: FeedbackBand[];
  /** Shown only to students by their score in an earlier lesson. */
  byScore: boolean;
  conditionLessonId: string;
  range: Range;
  atLeast: string;
  below: string;
  content: ContentDocument;
}

/** The condition a draft sets, null for every student, or undefined while unfinished. */
function conditionOf(draft: Draft): LessonCondition | null | undefined {
  if (!draft.byScore) return null;
  const atLeast = draft.range === "below" ? null : Number(draft.atLeast);
  const below = draft.range === "atLeast" ? null : Number(draft.below);
  if (
    !draft.conditionLessonId ||
    (atLeast !== null && !isPercent(atLeast)) ||
    (below !== null && !isPercent(below)) ||
    (atLeast !== null && below !== null && atLeast >= below)
  )
    return undefined;
  return { lessonId: draft.conditionLessonId, atLeast, below };
}

export interface LessonEditorProps {
  existing: Existing | null;
  moduleId: string;
  /** The library piece a new lesson starts from. */
  template?: StartingPiece;
  onClose: () => void;
  onCreated: (id: string) => void;
}

/**
 * A lesson written as one document: its text, media, questions and continue
 * gates in the page, what finishes it beside them. Edits save as they are
 * made; once the module is open, students keep the version last shown to
 * them until the teacher shows the new one.
 */
export function LessonEditor({
  existing,
  moduleId,
  template,
  onClose,
  onCreated,
}: LessonEditorProps) {
  const queryClient = useQueryClient();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const earlyYears = useCurrentUser().modules.early_years;
  const open = module.state === "published";
  const media = useDocumentMedia({ type: "module", id: moduleId });
  // Co-teachers write a lesson together once it exists; a new one starts alone.
  const live = useCollaboration(
    existing ? { hostType: "lesson", hostId: existing.id } : null,
  );
  const shared = live.state === "live";
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const [storedId, setStoredId] = useState(existing?.id ?? "");
  const [start] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    completion: existing?.completion ?? "view",
    passScore: existing?.passScore ? String(existing.passScore) : "",
    review: existing?.review ?? false,
    vowelMarks: existing?.vowelMarks ?? "shown",
    language: existing?.language ?? "auto",
    translation: existing?.translation ?? null,
    // A lesson for the youngest classes starts in young mode.
    young:
      existing?.young ??
      (earlyYears &&
        module.classes.length > 0 &&
        module.classes.every((row) => row.young)),
    readAlong: existing?.readAlong ?? true,
    bands: existing?.bands ?? [],
    byScore: Boolean(existing?.condition),
    conditionLessonId: existing?.condition?.lessonId ?? "",
    range:
      existing?.condition?.atLeast === null
        ? "below"
        : existing?.condition?.below === null
          ? "atLeast"
          : existing?.condition
            ? "between"
            : "below",
    atLeast: existing?.condition?.atLeast
      ? String(existing.condition.atLeast)
      : "",
    below: existing?.condition?.below ? String(existing.condition.below) : "",
    content: existing?.content ?? emptyContent(),
  }));
  const [draft, setDraft] = useState(start);
  const content = useRef(start.content);
  // What students have: the version last shown, or nothing yet.
  const [shown, setShown] = useState<ContentDocument | null>(
    existing?.published?.content ?? null,
  );
  // The translation students have, which publishing the lesson brings level.
  const [shownTranslation, setShownTranslation] =
    useState<ContentDocument | null>(existing?.published?.translation ?? null);
  // Which of the lesson's languages is being written, while it has two.
  const [writing, setWriting] = useState<"original" | "translation">(
    "original",
  );
  const [translationCheck, setTranslationCheck] = useState(
    existing?.translationReview ?? null,
  );
  const [reviewing, setReviewing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [replace, setReplace] = useState<{
    to: ContentDocument;
    at: number;
  }>();
  const [valid, setValid] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Answers already given that a changed key would mark differently, and
  // whether the teacher has them marked again.
  const [remarking, setRemarking] = useState<{
    answers: number;
    programs: number;
  } | null>(null);
  const [remark, setRemark] = useState<"again" | "keep">("again");
  const [copying, setCopying] = useState({ key: 0, open: false });

  const language = draft.language === "auto" ? null : draft.language;
  const translated = draft.translation;
  const setTranslation = (
    change: (current: { title: string; content: ContentDocument }) => {
      title: string;
      content: ContentDocument;
    },
  ) => {
    setRefused(null);
    setDraft((current) =>
      current.translation
        ? { ...current, translation: change(current.translation) }
        : current,
    );
  };
  const translation =
    language && translated
      ? translationState({
          translation: translated.content,
          reviewed: translationCheck !== null,
          current: translationCheck?.current ?? false,
        })
      : null;
  const untranslated = useMemo(
    () =>
      translated
        ? untranslatedParts(draft.content, translated.content).map((node) =>
            contentPlainText({
              root: { ...draft.content.root, children: [node] },
            })
              .trim()
              .slice(0, 80),
          )
        : [],
    [draft.content, translated],
  );

  const lesson = useMemo(() => lessonOfContent(draft.content), [draft.content]);
  const questions = lesson.blocks.filter(isCheck);
  const passScore = Number(draft.passScore);
  const titleIssue = draft.title.trim() ? null : m.lrnTitleNeeded();
  const passIssue =
    draft.completion === "score" &&
    !(Number.isInteger(passScore) && passScore >= 1 && passScore <= 100)
      ? m.lrnPassScoreNeeded()
      : null;
  const condition = conditionOf(draft);
  const conditionIssue =
    condition !== undefined
      ? null
      : draft.conditionLessonId
        ? m.lrnErrCondition()
        : m.lrnConditionLessonNeeded();
  // A range typed in full says at once when it cannot hold a score.
  const rangeFilled =
    (draft.range === "below" || draft.atLeast.trim() !== "") &&
    (draft.range === "atLeast" || draft.below.trim() !== "");
  // The lessons before this one whose score another can depend on.
  const ownPosition =
    module.lessons.find((row) => row.id === storedId)?.position ?? Infinity;
  const earlier = module.lessons.filter(
    (row) =>
      row.id !== storedId &&
      row.position < ownPosition &&
      (row.scored || row.id === draft.conditionLessonId),
  );
  const conditionLesson = module.lessons.find(
    (row) => row.id === draft.conditionLessonId,
  );
  const storable = !titleIssue && !passIssue && !conditionIssue;
  // Checking the lesson reads every block of it, too much for each key
  // pressed, so it runs only where its findings are wanted.
  const issuesOf = () => {
    const questionIssues = questions.flatMap((block) => {
      const issue = blockIssue(block);
      return issue ? [issue] : [];
    });
    const lessonProblem =
      questionIssues.length === 0
        ? lessonIssue({ completion: draft.completion, content: draft.content })
        : null;
    return [
      ...new Set(
        [
          titleIssue,
          passIssue,
          conditionIssue,
          ...questionIssues,
          ...contentIssueMessages(draft.content),
          lessonProblem ? getMessageFromError(new Error(lessonProblem)) : null,
          refused,
        ].filter((issue): issue is string => Boolean(issue)),
      ),
    ];
  };

  const persist = useCallback(
    async (value: Draft, publish = false, markAgain = false) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveLesson({
        data: {
          id: id.current,
          moduleId,
          expectedVersion: version.current,
          title: value.title.trim(),
          completion: value.completion,
          passScore:
            value.completion === "score" ? Number(value.passScore) : null,
          review: value.review,
          vowelMarks: value.vowelMarks,
          language: value.language === "auto" ? null : value.language,
          translation: value.translation,
          young: value.young,
          readAlong: value.readAlong,
          bands: keptBands(value.bands),
          condition: conditionOf(value) ?? null,
          content: shared ? content.current : value.content,
          publish,
          remark: markAgain,
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setTranslationCheck(saved.review);
      setStoredId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      if (created) onCreated(saved.id);
    },
    [valid, moduleId, shared, queryClient, onCreated],
  );

  // A live lesson is stored by the room as it is typed, so only the other
  // fields start a save; the save still sends the text as it reads now.
  const saving = shared ? { ...draft, content: emptyContent() } : draft;
  const autosave = useAutosave({
    value: saving,
    save: (value) => persist(value),
    enabled: storable,
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setRefused(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const showBy = (value: "all" | "score") => {
    setRefused(null);
    setDraft((current) => ({
      ...current,
      byScore: value === "score",
      conditionLessonId:
        current.conditionLessonId || (earlier.at(-1)?.id ?? ""),
    }));
  };
  const changeContent = useCallback((value: ContentDocument) => {
    content.current = value;
    setRefused(null);
    setDraft((current) => ({ ...current, content: value }));
  }, []);

  const written =
    lessonPlainText(lesson).trim() !== "" ||
    lesson.blocks.some((block) => block.type !== "content");
  const translationChanged = useMemo(
    () =>
      draft.translation !== null &&
      (!shownTranslation ||
        !sameLesson(draft.translation.content, shownTranslation)),
    [draft.translation, shownTranslation],
  );
  const shownBlocks = useMemo(
    () => (shown ? lessonOfContent(shown).blocks : null),
    [shown],
  );
  const differs = useMemo(
    () => shownBlocks !== null && !sameBlocks(lesson.blocks, shownBlocks),
    [lesson, shownBlocks],
  );
  const changed = open && ((shown ? differs : written) || translationChanged);

  const show = async () => {
    setChecking(true);
    if (issuesOf().length > 0) {
      if (passIssue || conditionIssue) setDetailsOpen(true);
      return;
    }
    setPending(true);
    try {
      autosave.markSaved(saving);
      await autosave.settle();
      // A lesson already shown may have answers its changed keys would
      // mark differently; its teacher chooses what becomes of them.
      const differ =
        shown && id.current
          ? await getRemarking({ data: { id: id.current } })
          : null;
      if (differ && (differ.answers > 0 || differ.programs > 0)) {
        setRemark("again");
        setRemarking(differ);
        return;
      }
      await publish(false);
    } catch (error) {
      setRefused(getMessageFromError(error));
    } finally {
      setPending(false);
    }
  };

  const publish = async (again: boolean) => {
    await persist(draft, true, again);
    setShown(content.current);
    setShownTranslation(draft.translation?.content ?? null);
    setChecking(false);
    setRemarking(null);
    toast.success(m.lrnLessonShown());
  };

  const markReviewed = async (reviewed: boolean) => {
    setReviewing(true);
    try {
      await autosave.flush();
      const out = await reviewLessonTranslation({
        data: { id: id.current, expectedVersion: version.current, reviewed },
      });
      version.current = out.version;
      setTranslationCheck(out.review);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setReviewing(false);
    }
  };

  useStartFrom(
    template,
    useCallback((piece: StartingPiece) => {
      content.current = piece.content;
      setDraft((current) => ({
        ...current,
        title: current.title || piece.title,
        content: piece.content,
      }));
      setReplace((current) => ({
        to: piece.content,
        at: (current?.at ?? 0) + 1,
      }));
    }, []),
  );

  const discard = () => {
    if (!shown) return;
    content.current = shown;
    setDraft((current) => ({
      ...current,
      content: shown,
      translation:
        current.translation && shownTranslation
          ? { ...current.translation, content: shownTranslation }
          : current.translation,
    }));
    setWriting("original");
    setReplace((current) => ({ to: shown, at: (current?.at ?? 0) + 1 }));
    setRefused(null);
    setChecking(false);
  };

  const listed = checking ? issuesOf() : [];
  const status = !open
    ? { label: m.lrnStatusModuleDraft(), tone: "neutral" as const }
    : shown
      ? { label: m.lrnStatusShown(), tone: "success" as const }
      : { label: m.lrnStatusNotShown(), tone: "warning" as const };

  return (
    <LtiHostProvider type="lesson" id={storedId || null}>
      <DocumentPage
        heading={existing ? m.lrnEditLesson() : m.lrnNewLesson()}
        onBack={async () => {
          // Leaving waits for the last edit to land; a failed save stays
          // here with its retry rather than being lost.
          if (await autosave.flush()) onClose();
        }}
        status={status}
        saveState={autosave.state}
        onRetry={autosave.retry}
        notSaved={
          storable || !autosave.dirty
            ? undefined
            : titleIssue
              ? m.lrnNotSavedTitle()
              : passIssue
                ? m.lrnNotSavedPassMark()
                : m.lrnNotSavedCondition()
        }
        unpublished={
          changed && storedId
            ? {
                pending: pending || uploading,
                waiting: shown ? m.lrnChangesNotShown() : m.lrnNotShownYet(),
                updateLabel: m.lrnShowStudents(),
                onDiscard: shown ? discard : undefined,
                onUpdate: () => void show(),
              }
            : undefined
        }
        link={storedId ? `/lessons/${storedId}` : undefined}
        menu={
          storedId
            ? [
                {
                  label: m.lrnCopyLesson(),
                  icon: Copy,
                  onSelect: () =>
                    setCopying((current) => ({
                      key: current.key + 1,
                      open: true,
                    })),
                },
              ]
            : undefined
        }
        preview={
          storedId
            ? {
                label: m.docPreview(),
                onClick: () =>
                  window.open(`/lessons/${storedId}`, "_blank", "noopener"),
              }
            : undefined
        }
        print={{
          title: draft.title.trim() || m.lrnUntitled(),
          content: draft.content,
          answers: true,
          link: storedId ? `/lessons/${storedId}` : undefined,
        }}
        templates={{
          kind: "lesson",
          empty: !written,
          content: draft.content,
          title: draft.title.trim() || m.lrnUntitled(),
          onApply: (to) => {
            content.current = to;
            setDraft((current) => ({ ...current, content: to }));
            setReplace((current) => ({ to, at: (current?.at ?? 0) + 1 }));
          },
          starters: earlyYears && draft.young ? media : undefined,
          builtIn: earlyYears && draft.young ? undefined : patternGroup(),
        }}
        history={
          storedId
            ? {
                hostType: "lesson",
                hostId: storedId,
                onRestore: (to) => {
                  content.current = to;
                  setDraft((current) => ({ ...current, content: to }));
                  setReplace((current) => ({
                    to,
                    at: (current?.at ?? 0) + 1,
                  }));
                },
              }
            : undefined
        }
        title={
          <div className="grid gap-3">
            {listed.length > 0 ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <p className="font-medium">{m.lrnIncomplete()}</p>
                <ul className="mt-1 list-disc ps-5">
                  {listed.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
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
                  id="lesson-title"
                  label={m.lrnLessonTitle()}
                  placeholder={draft.title || m.lrnUntitled()}
                  maxLength={200}
                  value={translated.title}
                  onChange={(title) =>
                    setTranslation((current) => ({ ...current, title }))
                  }
                  onEnter={() =>
                    document.getElementById("lesson-body")?.focus()
                  }
                />
              </div>
            ) : (
              <div
                lang={language ?? undefined}
                dir={language ? languageDirection(language) : undefined}
              >
                <DocumentTitle
                  id="lesson-title"
                  label={m.lrnLessonTitle()}
                  placeholder={m.lrnUntitled()}
                  maxLength={200}
                  value={draft.title}
                  onChange={(title) => set("title", title)}
                  onEnter={() =>
                    document.getElementById("lesson-body")?.focus()
                  }
                />
              </div>
            )}
          </div>
        }
        summary={[
          COMPLETION_LABEL[draft.completion](),
          m.lrnQuestionCount({ count: questions.length }),
          ...(draft.byScore ? [m.lrnConditionByScore()] : []),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection
              title={m.lrnSectionFinishing()}
              hint={
                questions.length > 0
                  ? m.lrnQuestionCount({ count: questions.length })
                  : undefined
              }
            >
              <SelectField
                id="lesson-completion"
                label={m.lrnCompletion()}
                hint={m.lrnCompletionHint()}
                value={draft.completion}
                options={LESSON_COMPLETIONS.map((completion) => ({
                  value: completion,
                  label: COMPLETION_LABEL[completion](),
                }))}
                onChange={(completion) => set("completion", completion)}
              />
              {draft.completion === "score" ? (
                <TextField
                  id="lesson-pass"
                  label={m.lrnPassScore()}
                  hint={m.lrnPassScoreHint()}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  width="score"
                  value={draft.passScore}
                  onChange={(event) => set("passScore", event.target.value)}
                  errors={passIssue && checking ? [passIssue] : undefined}
                />
              ) : null}
              <CheckboxRow
                label={m.lrnReview()}
                hint={m.lrnReviewHint()}
                checked={draft.review}
                onChange={(review) => set("review", review)}
              />
              {lessonScored(draft.content) ? (
                <FeedbackBands
                  bands={draft.bands}
                  onChange={(bands) => set("bands", bands)}
                />
              ) : null}
            </DetailsSection>
            <DetailsSection title={m.lrnSectionReading()}>
              <SelectField
                id="lesson-language"
                label={m.lrnLanguage()}
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
                hint={translated ? m.lrnLanguageLocked() : m.lrnLanguageHint()}
              />
              {language ? (
                <CheckboxRow
                  label={m.contentBilingual({
                    language: LOCALE_NAME[otherLocale(language)](),
                  })}
                  hint={m.lrnTranslationHint()}
                  checked={translated !== null}
                  onChange={(checked) => {
                    if (!checked) {
                      setRemoving(true);
                      return;
                    }
                    // A translation starts as the lesson, its parts and
                    // questions found again by their ids, to be rewritten.
                    set("translation", { title: "", content: draft.content });
                    setWriting("translation");
                  }}
                />
              ) : null}
              <SelectField
                id="lesson-vowel-marks"
                label={m.lrnVowelMarks()}
                hint={m.lrnVowelMarksHint()}
                value={draft.vowelMarks}
                options={VOWEL_MARKS.map((value) => ({
                  value,
                  label: VOWEL_MARKS_LABEL[value](),
                }))}
                onChange={(value) => set("vowelMarks", value)}
              />
              {earlyYears ? (
                <CheckboxRow
                  label={m.lrnYoung()}
                  hint={m.lrnYoungHint()}
                  checked={draft.young}
                  onChange={(young) => set("young", young)}
                />
              ) : null}
              {earlyYears && draft.young ? (
                <>
                  <CheckboxRow
                    label={m.lrnReadAlong()}
                    hint={m.lrnReadAlongHint()}
                    checked={draft.readAlong}
                    onChange={(readAlong) => set("readAlong", readAlong)}
                  />
                  <YoungAdviceList blocks={lesson.blocks} />
                </>
              ) : null}
            </DetailsSection>
            {language && translated && translation ? (
              <DetailsSection title={m.translationTitle()}>
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
                {untranslated.length > 0 ? (
                  <div className="grid gap-1 text-[13px] leading-[18px] text-muted-foreground">
                    <p>
                      {m.lrnTranslationUntranslated({
                        language: LOCALE_NAME[language](),
                      })}
                    </p>
                    <ul className="list-disc ps-5">
                      {untranslated.map((words, index) => (
                        <li key={index} dir="auto" lang={language}>
                          {words}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </DetailsSection>
            ) : null}
            <DetailsSection title={m.lrnSectionPath()}>
              <SelectField
                id="lesson-show"
                label={m.lrnConditionShow()}
                hint={
                  earlier.length > 0
                    ? m.lrnConditionShowHint()
                    : m.lrnConditionNone()
                }
                value={draft.byScore ? "score" : "all"}
                options={[
                  { value: "all", label: m.lrnConditionEveryone() },
                  ...(earlier.length > 0 || draft.byScore
                    ? [
                        {
                          value: "score" as const,
                          label: m.lrnConditionByScore(),
                        },
                      ]
                    : []),
                ]}
                onChange={showBy}
              />
              {draft.byScore ? (
                <>
                  <SelectField
                    id="lesson-condition-lesson"
                    label={m.lrnConditionLesson()}
                    value={draft.conditionLessonId}
                    options={earlier.map((row) => ({
                      value: row.id,
                      label: `${formatNumber(row.position + 1)}. ${row.title}`,
                    }))}
                    onChange={(lessonId) => set("conditionLessonId", lessonId)}
                    errors={
                      checking && !draft.conditionLessonId
                        ? [m.lrnConditionLessonNeeded()]
                        : undefined
                    }
                  />
                  <SelectField
                    id="lesson-condition-range"
                    label={m.lrnConditionRange()}
                    value={draft.range}
                    options={(["below", "atLeast", "between"] as const).map(
                      (range) => ({
                        value: range,
                        label: RANGE_LABEL[range](),
                      }),
                    )}
                    onChange={(range) => set("range", range)}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    {draft.range === "below" ? null : (
                      <TextField
                        id="lesson-condition-at-least"
                        label={m.lrnConditionAtLeastField()}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        width="score"
                        value={draft.atLeast}
                        onChange={(event) => set("atLeast", event.target.value)}
                      />
                    )}
                    {draft.range === "atLeast" ? null : (
                      <TextField
                        id="lesson-condition-below"
                        label={m.lrnConditionBelowField()}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        width="score"
                        value={draft.below}
                        onChange={(event) => set("below", event.target.value)}
                      />
                    )}
                  </div>
                  {condition && conditionLesson ? (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      {conditionText(condition, conditionLesson.title)}
                    </p>
                  ) : (checking || rangeFilled) && draft.conditionLessonId ? (
                    <p
                      role="alert"
                      className="text-[13px] leading-[18px] text-destructive"
                    >
                      {m.lrnErrCondition()}
                    </p>
                  ) : null}
                </>
              ) : null}
            </DetailsSection>
          </DetailsPanel>
        }
      >
        {language && translated && writing === "translation" ? (
          <ContentEditor
            key="translation"
            id="lesson-body"
            label={m.lrnSectionBlocks()}
            variant="document"
            value={translated.content}
            onChange={(value) =>
              setTranslation((current) => ({ ...current, content: value }))
            }
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            questions
            narration
            lessonActivities
            feedbackTiming={!draft.young}
            young={earlyYears && draft.young}
            language={otherLocale(language)}
          />
        ) : (
          <ContentEditor
            key="original"
            id="lesson-body"
            label={m.lrnSectionBlocks()}
            variant="document"
            value={draft.content}
            onChange={changeContent}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            questions
            narration
            lessonActivities
            feedbackTiming={!draft.young}
            young={earlyYears && draft.young}
            language={language ?? undefined}
            collaboration={shared ? live.collaboration : undefined}
            pending={live.state === "loading"}
            replace={replace}
          />
        )}
      </DocumentPage>
      <UnsavedChangesGuard
        isDirty={() => !storable && autosave.dirty}
        pending={pending}
      />
      <ConfirmDialog
        open={removing}
        title={m.lrnTranslationRemoveTitle({
          language: LOCALE_NAME[language ? otherLocale(language) : "ar"](),
        })}
        body={m.lrnTranslationRemoveBody()}
        confirmLabel={m.lrnTranslationRemove()}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          set("translation", null);
          setWriting("original");
          setRemoving(false);
        }}
      />
      <SheetForm
        open={remarking !== null}
        onOpenChange={(opened) => {
          if (!opened) setRemarking(null);
        }}
        title={m.lrnRemarkTitle()}
        submitLabel={m.lrnShowStudents()}
        pending={pending}
        error={refused}
        onSubmit={async () => {
          setPending(true);
          try {
            await publish(remark === "again");
          } catch (error) {
            setRefused(getMessageFromError(error));
          } finally {
            setPending(false);
          }
        }}
      >
        {remarking?.answers ? (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.lrnRemarkCount({ count: remarking.answers })}
          </p>
        ) : null}
        {remarking?.programs ? (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.lrnRemarkPrograms({ count: remarking.programs })}
          </p>
        ) : null}
        <ChoiceField
          label={m.lrnRemarkChoice()}
          value={remark}
          onChange={setRemark}
          options={[
            {
              value: "again",
              label: m.lrnRemarkAgain(),
              hint: m.lrnRemarkAgainHint(),
            },
            {
              value: "keep",
              label: m.lrnRemarkKeep(),
              hint: m.lrnRemarkKeepHint(),
            },
          ]}
        />
      </SheetForm>
      {copying.key > 0 && storedId ? (
        <CopyLessonSheet
          key={copying.key}
          lesson={{
            id: storedId,
            title: draft.title.trim() || m.lrnUntitled(),
          }}
          module={{ id: moduleId, title: module.title }}
          open={copying.open}
          onClose={() => setCopying((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </LtiHostProvider>
  );
}
