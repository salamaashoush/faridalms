import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonCompletion } from "@faridalms/domain/learning";

import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  isCheck,
  LESSON_COMPLETIONS,
  lessonIssue,
  lessonPlainText,
} from "@faridalms/domain/learning";
import { lessonOfContent, sameLesson } from "@faridalms/domain/lesson-content";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { lessonEditorQuery } from "~/queries/learning";

import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { SelectField, TextField } from "~/components/system/field";
import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import { moduleRecordQuery } from "~/queries/learning";
import { saveLesson } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

import { blockIssue } from "./BlockFields";
import { COMPLETION_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonEditorQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
  completion: LessonCompletion;
  passScore: string;
  content: ContentDocument;
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
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  moduleId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const open = module.state === "published";
  const media = useDocumentMedia();
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
    content: existing?.content ?? emptyContent(),
  }));
  const [draft, setDraft] = useState(start);
  const content = useRef(start.content);
  // What students have: the version last shown, or nothing yet.
  const [shown, setShown] = useState<ContentDocument | null>(
    existing?.published?.content ?? null,
  );
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

  const lesson = useMemo(() => lessonOfContent(draft.content), [draft.content]);
  const questions = lesson.blocks.filter(isCheck);
  const passScore = Number(draft.passScore);
  const titleIssue = draft.title.trim() ? null : m.lrnTitleNeeded();
  const passIssue =
    draft.completion === "score" &&
    !(Number.isInteger(passScore) && passScore >= 1 && passScore <= 100)
      ? m.lrnPassScoreNeeded()
      : null;
  const storable = !titleIssue && !passIssue;
  const questionIssues = questions.flatMap((block) => {
    const issue = blockIssue(block);
    return issue ? [issue] : [];
  });
  const lessonProblem =
    questionIssues.length === 0
      ? lessonIssue({ completion: draft.completion, content: draft.content })
      : null;
  const issues = [
    ...new Set(
      [
        titleIssue,
        passIssue,
        ...questionIssues,
        lessonProblem ? getMessageFromError(new Error(lessonProblem)) : null,
        refused,
      ].filter((issue): issue is string => Boolean(issue)),
    ),
  ];

  const persist = useCallback(
    async (value: Draft, publish = false) => {
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
          content: shared ? content.current : value.content,
          publish,
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
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
  const changeContent = useCallback((value: ContentDocument) => {
    content.current = value;
    setRefused(null);
    setDraft((current) => ({ ...current, content: value }));
  }, []);

  const written =
    lessonPlainText(lesson).trim() !== "" ||
    lesson.blocks.some((block) => block.type !== "content");
  const changed = open && (shown ? !sameLesson(draft.content, shown) : written);

  const show = async () => {
    setChecking(true);
    if (issues.length > 0) {
      if (passIssue) setDetailsOpen(true);
      return;
    }
    setPending(true);
    try {
      autosave.markSaved(saving);
      await autosave.settle();
      await persist(draft, true);
      setShown(content.current);
      setChecking(false);
      toast.success(m.lrnLessonShown());
    } catch (error) {
      setRefused(getMessageFromError(error));
    } finally {
      setPending(false);
    }
  };

  const discard = () => {
    if (!shown) return;
    content.current = shown;
    setDraft((current) => ({ ...current, content: shown }));
    setReplace((current) => ({ to: shown, at: (current?.at ?? 0) + 1 }));
    setRefused(null);
    setChecking(false);
  };

  const listed = checking ? issues : [];
  const status = !open
    ? { label: m.lrnStatusModuleDraft(), tone: "neutral" as const }
    : shown
      ? { label: m.lrnStatusShown(), tone: "success" as const }
      : { label: m.lrnStatusNotShown(), tone: "warning" as const };

  return (
    <>
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
              : m.lrnNotSavedPassMark()
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
        preview={
          storedId
            ? {
                label: m.docPreview(),
                onClick: () =>
                  window.open(`/lessons/${storedId}`, "_blank", "noopener"),
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
            <DocumentTitle
              id="lesson-title"
              label={m.lrnLessonTitle()}
              placeholder={m.lrnUntitled()}
              maxLength={200}
              value={draft.title}
              onChange={(title) => set("title", title)}
              onEnter={() => document.getElementById("lesson-body")?.focus()}
            />
          </div>
        }
        summary={[
          COMPLETION_LABEL[draft.completion](),
          m.lrnQuestionCount({ count: questions.length }),
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
            </DetailsSection>
          </DetailsPanel>
        }
      >
        {live.state === "loading" ? (
          <div aria-busy="true" className="min-h-48 animate-pulse" />
        ) : (
          <ContentEditor
            id="lesson-body"
            label={m.lrnSectionBlocks()}
            variant="document"
            value={draft.content}
            onChange={changeContent}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            questions
            collaboration={shared ? live.collaboration : undefined}
            replace={replace}
          />
        )}
      </DocumentPage>
      <UnsavedChangesGuard
        isDirty={() => !storable && autosave.dirty}
        pending={pending}
      />
    </>
  );
}
