import type { FileSummary } from "@faridalms/database/repositories/files";
import type { LessonBlock, LessonDocument } from "@faridalms/domain/learning";

import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  LESSON_MEDIA_BYTES,
  MAX_QUIZ_OPTIONS,
  needsCaptions,
} from "@faridalms/domain/learning";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  HelpCircle,
  Image,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { FileUploader } from "~/components/assignments/FileUploader";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "~/components/ui/field";
import * as m from "~/i18n/messages";

function newBlock(type: LessonBlock["type"]): LessonBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "content":
      return { id, type, content: emptyContent() };
    case "media":
      return {
        id,
        type,
        fileId: "",
        name: "",
        mediaType: "",
        sizeBytes: 0,
        caption: "",
        captionsFileId: null,
        captionsLang: "en",
      };
    case "quiz":
      return {
        id,
        type,
        question: "",
        options: [
          { id: crypto.randomUUID(), text: "" },
          { id: crypto.randomUUID(), text: "" },
        ],
        correctOptionIds: [],
        explanation: "",
      };
    case "reflection":
      return { id, type, prompt: "" };
  }
  throw new Error("learning.invalid_block");
}

const BLOCK_LABEL: Record<LessonBlock["type"], () => string> = {
  content: m.learningBlockContent,
  media: m.learningBlockMedia,
  quiz: m.learningBlockQuiz,
  reflection: m.learningBlockReflection,
};

export function LessonDesigner({
  document,
  onChange,
  onValidityChange,
  disabled,
}: {
  document: LessonDocument;
  onChange: (value: LessonDocument) => void;
  onValidityChange: (id: string, valid: boolean) => void;
  disabled: boolean;
}) {
  const update = (block: LessonBlock) =>
    onChange({
      ...document,
      blocks: document.blocks.map((item) =>
        item.id === block.id ? block : item,
      ),
    });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= document.blocks.length) return;
    const blocks = [...document.blocks];
    const [block] = blocks.splice(index, 1);
    if (block) blocks.splice(target, 0, block);
    onChange({ ...document, blocks });
  };
  const remove = (id: string) => {
    onValidityChange(id, true);
    onChange({
      ...document,
      blocks: document.blocks.filter((b) => b.id !== id),
    });
  };
  const add = (type: LessonBlock["type"]) =>
    onChange({ ...document, blocks: [...document.blocks, newBlock(type)] });
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {document.blocks.map((block, index) => (
          <li key={block.id} className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
              <span className="text-sm font-semibold">
                {m.learningBlockNumbered({
                  number: String(index + 1),
                  kind: BLOCK_LABEL[block.type](),
                })}
              </span>
              <div className="ms-auto flex gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.newsletterMoveUp()}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.newsletterMoveDown()}
                  disabled={disabled || index === document.blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.newsletterRemoveBlock()}
                  disabled={disabled}
                  onClick={() => remove(block.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
            <div className="p-4">
              <BlockEditor
                block={block}
                disabled={disabled}
                onChange={update}
                onValidityChange={(valid) => onValidityChange(block.id, valid)}
              />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 rounded-xl border border-dashed p-4">
        <span className="me-auto text-sm font-medium">
          {m.learningAddBlock()}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => add("content")}
        >
          <FileText aria-hidden />
          {m.learningBlockContent()}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => add("media")}
        >
          <Image aria-hidden />
          {m.learningBlockMedia()}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => add("quiz")}
        >
          <HelpCircle aria-hidden />
          {m.learningBlockQuiz()}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => add("reflection")}
        >
          <MessageSquare aria-hidden />
          {m.learningBlockReflection()}
        </Button>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  disabled,
  onChange,
  onValidityChange,
}: {
  block: LessonBlock;
  disabled: boolean;
  onChange: (block: LessonBlock) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  switch (block.type) {
    case "content":
      return (
        <ContentEditor
          id={`lesson-block-${block.id}`}
          label={m.learningBlockContent()}
          value={block.content}
          onChange={(content) => onChange({ ...block, content })}
          onValidityChange={onValidityChange}
          disabled={disabled}
        />
      );
    case "media": {
      const value: FileSummary[] = block.fileId
        ? [
            {
              id: block.fileId,
              name: block.name,
              mediaType: block.mediaType,
              sizeBytes: block.sizeBytes,
            },
          ]
        : [];
      return (
        <div className="grid gap-4">
          <FileUploader
            label={m.learningMediaFile()}
            description={m.learningMediaHint()}
            purpose="lesson_media"
            value={value}
            onChange={(updater) => {
              const [file] = updater(value).slice(-1);
              onChange({
                ...block,
                fileId: file?.id ?? "",
                name: file?.name ?? "",
                mediaType: file?.mediaType ?? "",
                sizeBytes: file?.sizeBytes ?? 0,
              });
            }}
            maxFiles={1}
            maxBytes={LESSON_MEDIA_BYTES}
            disabled={disabled}
          />
          {needsCaptions(block.mediaType) ? (
            <div className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <FileUploader
                label={m.learningCaptionsFile()}
                description={m.learningCaptionsHint()}
                purpose="lesson_media"
                value={
                  block.captionsFileId
                    ? [
                        {
                          id: block.captionsFileId,
                          name: `${block.name}.vtt`,
                          mediaType: "text/vtt",
                          sizeBytes: 1,
                        },
                      ]
                    : []
                }
                onChange={(updater) => {
                  const [file] = updater([]).slice(-1);
                  onChange({ ...block, captionsFileId: file?.id ?? null });
                }}
                maxFiles={1}
                maxBytes={LESSON_MEDIA_BYTES}
                disabled={disabled}
              />
              <fieldset className="flex gap-2">
                <legend className="mb-2 text-sm font-medium">
                  {m.learningCaptionsLang()}
                </legend>
                {(["en", "ar"] as const).map((lang) => (
                  <Button
                    key={lang}
                    type="button"
                    variant={
                      block.captionsLang === lang ? "secondary" : "outline"
                    }
                    aria-pressed={block.captionsLang === lang}
                    disabled={disabled}
                    onClick={() => onChange({ ...block, captionsLang: lang })}
                  >
                    {lang === "en"
                      ? m.newsletterEnglish()
                      : m.newsletterArabic()}
                  </Button>
                ))}
              </fieldset>
            </div>
          ) : null}
          <ManagementInput
            label={m.learningMediaCaption()}
            value={block.caption}
            maxLength={500}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...block, caption: event.target.value })
            }
          />
        </div>
      );
    }
    case "quiz":
      return (
        <div className="grid gap-4">
          <ManagementInput
            label={m.learningQuizQuestion()}
            value={block.question}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...block, question: event.target.value })
            }
          />
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              {m.learningQuizOptions()}
            </legend>
            <p className="text-xs text-muted-foreground">
              {m.learningQuizOptionsHint()}
            </p>
            {block.options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-3">
                <Checkbox
                  id={`correct-${option.id}`}
                  aria-label={m.learningQuizCorrectOption({
                    number: String(index + 1),
                  })}
                  checked={block.correctOptionIds.includes(option.id)}
                  disabled={disabled}
                  onCheckedChange={(next) =>
                    onChange({
                      ...block,
                      correctOptionIds: next
                        ? [...block.correctOptionIds, option.id]
                        : block.correctOptionIds.filter(
                            (id) => id !== option.id,
                          ),
                    })
                  }
                />
                <div className="flex-1">
                  <ManagementInput
                    label={m.learningQuizOption({ number: String(index + 1) })}
                    value={option.text}
                    maxLength={300}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...block,
                        options: block.options.map((item) =>
                          item.id === option.id
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.learningQuizRemoveOption()}
                  disabled={disabled || block.options.length <= 2}
                  onClick={() =>
                    onChange({
                      ...block,
                      options: block.options.filter(
                        (item) => item.id !== option.id,
                      ),
                      correctOptionIds: block.correctOptionIds.filter(
                        (id) => id !== option.id,
                      ),
                    })
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || block.options.length >= MAX_QUIZ_OPTIONS}
                onClick={() =>
                  onChange({
                    ...block,
                    options: [
                      ...block.options,
                      { id: crypto.randomUUID(), text: "" },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                {m.learningQuizAddOption()}
              </Button>
            </div>
          </fieldset>
          <ManagementInput
            label={m.learningQuizExplanation()}
            value={block.explanation}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...block, explanation: event.target.value })
            }
          />
        </div>
      );
    case "reflection":
      return (
        <Field>
          <FieldContent>
            <FieldLabel htmlFor={`reflection-${block.id}`}>
              {m.learningReflectionPrompt()}
            </FieldLabel>
          </FieldContent>
          <ManagementInput
            id={`reflection-${block.id}`}
            label={m.learningReflectionPrompt()}
            value={block.prompt}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...block, prompt: event.target.value })
            }
          />
        </Field>
      );
  }
  return null;
}
