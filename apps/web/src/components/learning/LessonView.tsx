import type { LearnerBlock } from "@faridalms/database/repositories/learning";
import type { LessonAnswers } from "@faridalms/domain/learning";

import { CircleCheck, CircleX, Download } from "lucide-react";
import { useState } from "react";

import { fileSizeLabel } from "~/components/assignments/FileList";
import { ContentView } from "~/components/content/ContentView";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

export function MediaBlock({
  block,
}: {
  block: Extract<LearnerBlock, { type: "media" }>;
}) {
  const url = `/files/${block.fileId}`;
  const kind = block.mediaType.split("/")[0];
  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      {kind === "image" ? (
        <img src={url} alt={block.caption || block.name} className="w-full" />
      ) : kind === "video" && block.captionsFileId ? (
        <video src={url} controls preload="metadata" className="w-full">
          <track
            kind="captions"
            src={`/files/${block.captionsFileId}`}
            srcLang={block.captionsLang}
            label={block.captionsLang === "ar" ? "العربية" : "English"}
            default
          />
        </video>
      ) : kind === "audio" && block.captionsFileId ? (
        <audio src={url} controls preload="metadata" className="w-full p-4">
          <track
            kind="captions"
            src={`/files/${block.captionsFileId}`}
            srcLang={block.captionsLang}
            label={block.captionsLang === "ar" ? "العربية" : "English"}
            default
          />
        </audio>
      ) : (
        <a
          href={url}
          className="flex items-center gap-3 p-4 text-sm font-medium hover:text-primary hover:underline"
        >
          <Download className="size-4" aria-hidden />
          {block.name}
          <span className="text-xs font-normal text-muted-foreground">
            {fileSizeLabel(block.sizeBytes)}
          </span>
        </a>
      )}
      {block.caption ? (
        <figcaption className="border-t px-4 py-3 text-sm text-muted-foreground">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function QuizBlock({
  block,
  answer,
  canWork,
  pending,
  onAnswer,
}: {
  block: Extract<LearnerBlock, { type: "quiz" }>;
  answer: LessonAnswers[string] | undefined;
  canWork: boolean;
  pending: boolean;
  onAnswer: (optionIds: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(answer?.optionIds ?? []);
  const answered = answer !== undefined;
  const correctIds = new Set(block.correctOptionIds);
  return (
    <section
      aria-labelledby={`quiz-${block.id}`}
      className="rounded-xl border bg-card p-5"
    >
      <h3 id={`quiz-${block.id}`} className="text-base font-semibold">
        {block.question}
      </h3>
      <ul className="mt-4 flex flex-col gap-2">
        {block.options.map((option) => {
          const picked = chosen.includes(option.id);
          const isCorrect = answered && correctIds.has(option.id);
          return (
            <li key={option.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                  answered && isCorrect && "border-primary bg-primary/10",
                  answered && picked && !isCorrect && "border-destructive/50",
                )}
              >
                <Checkbox
                  checked={picked}
                  disabled={!canWork || answered || pending}
                  onCheckedChange={(next) =>
                    setChosen((current) =>
                      next
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                />
                <span className="flex-1">{option.text}</span>
                {answered && isCorrect ? (
                  <CircleCheck className="size-4 text-primary" aria-hidden />
                ) : null}
                {answered && picked && !isCorrect ? (
                  <CircleX className="size-4 text-destructive" aria-hidden />
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {answered ? (
        <output
          className={cn(
            "mt-4 block text-sm font-medium",
            answer.correct ? "text-primary" : "text-destructive",
          )}
        >
          {answer.correct ? m.learningQuizCorrect() : m.learningQuizWrong()}
          {block.explanation ? (
            <span className="ms-2 font-normal text-muted-foreground">
              {block.explanation}
            </span>
          ) : null}
        </output>
      ) : canWork ? (
        <Button
          type="button"
          className="mt-4"
          disabled={chosen.length === 0 || pending}
          onClick={() => onAnswer(chosen)}
        >
          {m.learningQuizCheck()}
        </Button>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {m.learningQuizPending()}
        </p>
      )}
    </section>
  );
}

export function LessonBlocks({
  blocks,
  answers,
  canWork,
  pending,
  onAnswer,
}: {
  blocks: LearnerBlock[];
  answers: LessonAnswers;
  canWork: boolean;
  pending: boolean;
  onAnswer: (blockId: string, optionIds: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block) => {
        switch (block.type) {
          case "content":
            return (
              <div
                key={block.id}
                className="rounded-xl border bg-card p-5 sm:p-7"
              >
                <ContentView document={block.content} />
              </div>
            );
          case "media":
            return <MediaBlock key={block.id} block={block} />;
          case "quiz":
            return (
              <QuizBlock
                key={block.id}
                block={block}
                answer={answers[block.id]}
                canWork={canWork}
                pending={pending}
                onAnswer={(optionIds) => onAnswer(block.id, optionIds)}
              />
            );
          case "reflection":
            return (
              <section
                key={block.id}
                className="rounded-xl border border-dashed bg-muted/30 p-5"
              >
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {m.learningReflection()}
                </p>
                <p className="mt-2 text-base">{block.prompt}</p>
              </section>
            );
        }
        return null;
      })}
    </div>
  );
}
