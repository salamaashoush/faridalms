import type {
  LessonBlock,
  LessonCompletion,
  StudentBlock,
} from "@faridalms/domain/learning";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Pencil,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ButtonLink } from "~/components/app/ButtonLink";
import { ContentView } from "~/components/content/ContentView";
import { RecordHeader } from "~/components/system/RecordPage";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { RadioGroup } from "~/components/ui/radio-group";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { lessonEditorQuery, lessonQuery } from "~/queries/learning";
import { answerQuiz, completeLesson, saveReflection } from "~/server/learning";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Played = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonQuery>["queryFn"]>>
>;
type QuizAnswer = Played["answers"]["quiz"][string];
type QuizView = Extract<StudentBlock, { type: "quiz" }>;

const fileUrl = (fileId: string) => `/files/${fileId}`;

const RULE_HINT: Record<LessonCompletion, (() => string) | null> = {
  view: null,
  mark: m.lrnRuleMark,
  quiz: m.lrnRuleQuiz,
  score: null,
  reflection: m.lrnRuleReflection,
};

function Media({ block }: { block: Extract<LessonBlock, { type: "media" }> }) {
  const src = fileUrl(block.fileId);
  const captions = block.captionsFileId ? fileUrl(block.captionsFileId) : null;
  return (
    <figure className="grid gap-2">
      {captions && block.mediaType.startsWith("video/") ? (
        <video controls preload="metadata" className="w-full rounded-lg">
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions}
            srcLang={block.captionsLang}
            default
          />
        </video>
      ) : captions && block.mediaType.startsWith("audio/") ? (
        <audio controls preload="metadata" className="w-full">
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions}
            srcLang={block.captionsLang}
            default
          />
        </audio>
      ) : block.mediaType.startsWith("image/") ? (
        <img src={src} alt={block.caption} className="rounded-lg" />
      ) : (
        <a
          href={src}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <bdi>{block.name}</bdi>
        </a>
      )}
      {block.caption ? (
        <figcaption
          dir="auto"
          className="text-[13px] leading-[18px] text-muted-foreground"
        >
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

const choiceRow =
  "group flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-start text-sm leading-5 outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default";

function Outcome({ outcome }: { outcome: "right" | "wrong" | null }) {
  if (outcome === "right")
    return <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />;
  if (outcome === "wrong")
    return <CircleX aria-hidden className="size-4 shrink-0 text-destructive" />;
  return null;
}

// Once answered, the row shows whether it was right instead of that it was chosen.
const outcomeRow = (answered: boolean, outcome: "right" | "wrong" | null) =>
  cn(
    !answered && "data-checked:border-primary/50 data-checked:bg-primary/5",
    outcome === "right" && "border-success/40 bg-success/10",
    outcome === "wrong" && "border-destructive/40 bg-destructive/5",
  );

function Quiz({
  block,
  lessonId,
  previous,
  onAnswered,
}: {
  block: QuizView;
  lessonId: string;
  previous: QuizAnswer | undefined;
  onAnswered: (completed: boolean) => void;
}) {
  const legend = useId();
  const [selected, setSelected] = useState<string[]>(previous?.optionIds ?? []);
  const [result, setResult] = useState<{
    correct: boolean;
    correctOptionIds: string[];
    explanation: string;
  } | null>(previous ?? null);
  const answer = useMutation({
    mutationFn: () =>
      answerQuiz({
        data: { lessonId, blockId: block.id, optionIds: selected },
      }),
    onSuccess: (response) => {
      setResult(response);
      onAnswered(response.completed);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const outcome = (optionId: string) => {
    if (!result) return null;
    if (result.correctOptionIds.includes(optionId)) return "right";
    return selected.includes(optionId) ? "wrong" : null;
  };
  const locked = result !== null;
  return (
    <fieldset
      aria-labelledby={legend}
      className="grid gap-3 rounded-lg border bg-card p-5"
    >
      <p id={legend} dir="auto" className="text-base leading-6 font-semibold">
        {block.question}
      </p>
      {block.multiple ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.lrnChooseAll()}
        </p>
      ) : null}
      {block.multiple ? (
        <div className="grid gap-2">
          {block.options.map((option) => (
            <CheckboxPrimitive.Root
              key={option.id}
              disabled={locked}
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, option.id]
                    : current.filter((item) => item !== option.id),
                )
              }
              className={cn(choiceRow, outcomeRow(locked, outcome(option.id)))}
            >
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-input group-data-checked:border-primary group-data-checked:bg-primary group-data-checked:text-primary-foreground"
              >
                <CheckboxPrimitive.Indicator>
                  <Check className="size-3.5" />
                </CheckboxPrimitive.Indicator>
              </span>
              <span dir="auto" className="min-w-0 flex-1">
                {option.text}
              </span>
              <Outcome outcome={outcome(option.id)} />
            </CheckboxPrimitive.Root>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={legend}
          disabled={locked}
          value={selected[0] ?? ""}
          onValueChange={(value) => setSelected([String(value)])}
          className="gap-2"
        >
          {block.options.map((option) => (
            <Radio.Root
              key={option.id}
              value={option.id}
              className={cn(choiceRow, outcomeRow(locked, outcome(option.id)))}
            >
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-full border border-input group-data-checked:border-primary group-data-checked:bg-primary"
              >
                <Radio.Indicator className="size-2 rounded-full bg-primary-foreground" />
              </span>
              <span dir="auto" className="min-w-0 flex-1">
                {option.text}
              </span>
              <Outcome outcome={outcome(option.id)} />
            </Radio.Root>
          ))}
        </RadioGroup>
      )}
      <div aria-live="polite" className="grid gap-2">
        {result ? (
          <>
            <p
              className={cn(
                "inline-flex items-center gap-2 text-sm leading-5 font-medium",
                result.correct ? "text-success" : "text-destructive",
              )}
            >
              {result.correct ? (
                <CircleCheck aria-hidden className="size-4" />
              ) : (
                <CircleX aria-hidden className="size-4" />
              )}
              {result.correct ? m.lrnRight() : m.lrnNotQuite()}
            </p>
            {result.explanation ? (
              <p dir="auto" className="text-sm leading-6 text-muted-foreground">
                {result.explanation}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {locked ? (
          result.correct ? null : (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => {
                setResult(null);
                setSelected([]);
              }}
            >
              {m.lrnTryAgain()}
            </Button>
          )
        ) : (
          <Button
            type="button"
            className="max-md:h-10"
            disabled={selected.length === 0 || answer.isPending}
            onClick={() => answer.mutate()}
          >
            {m.lrnCheck()}
          </Button>
        )}
      </div>
    </fieldset>
  );
}

function Reflection({
  blockId,
  prompt,
  lessonId,
  previous,
  onSaved,
}: {
  blockId: string;
  prompt: string;
  lessonId: string;
  previous: string;
  onSaved: (completed: boolean) => void;
}) {
  const field = useId();
  const [text, setText] = useState(previous);
  const [saved, setSaved] = useState(previous);
  const save = useMutation({
    mutationFn: () =>
      saveReflection({ data: { lessonId, blockId, text: text.trim() } }),
    onSuccess: (response) => {
      setSaved(text);
      onSaved(response.completed);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-5">
      <label
        htmlFor={field}
        dir="auto"
        className="text-base leading-6 font-semibold"
      >
        {prompt}
      </label>
      <Textarea
        id={field}
        dir="auto"
        rows={4}
        maxLength={4000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="max-md:h-10"
          disabled={!text.trim() || text === saved || save.isPending}
          onClick={() => save.mutate()}
        >
          {m.lrnSaveAnswer()}
        </Button>
        {saved && text === saved ? (
          <span
            aria-live="polite"
            className="text-[13px] leading-[18px] text-muted-foreground"
          >
            {m.lrnAnswerSaved()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Footer({ data }: { data: Played }) {
  return (
    <nav
      aria-label={m.lrnLessonNav()}
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-6"
    >
      {data.previous ? (
        <ButtonLink
          to="/lessons/$lessonId"
          params={{ lessonId: data.previous }}
          search={{}}
          variant="outline"
          className="max-md:h-10"
        >
          <ArrowLeft aria-hidden className="rtl:rotate-180" />
          {m.lrnPrevious()}
        </ButtonLink>
      ) : (
        <span />
      )}
      {data.next ? (
        <ButtonLink
          to="/lessons/$lessonId"
          params={{ lessonId: data.next }}
          search={{}}
          className="max-md:h-10"
        >
          {m.lrnNext()}
          <ArrowRight aria-hidden className="rtl:rotate-180" />
        </ButtonLink>
      ) : (
        <ButtonLink
          to="/modules/$moduleId"
          params={{ moduleId: data.module.id }}
          search={{}}
          variant={data.completedAt ? "default" : "outline"}
          className="max-md:h-10"
        >
          {m.lrnBackToModule()}
        </ButtonLink>
      )}
    </nav>
  );
}

/** One lesson for its student: read, answer, reflect, and move on when it is done. */
export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const data = useSuspenseQuery(lessonQuery(lessonId)).data;
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["learning"] });
  };
  const settled = async (completed: boolean) => {
    if (!completed || data.completedAt) return;
    await refresh();
    toast.success(m.lrnLessonFinished());
  };
  const complete = useMutation({
    mutationFn: () => completeLesson({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.lrnLessonFinished());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const hint =
    data.completion === "score"
      ? m.lrnRuleScore({ score: formatNumber(data.passScore ?? 100) })
      : RULE_HINT[data.completion]?.();
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-2">
        <Progress
          value={((data.index + 1) / data.total) * 100}
          aria-label={m.lrnPlace()}
          getAriaValueText={() =>
            m.lrnLessonOf({
              number: formatNumber(data.index + 1),
              total: formatNumber(data.total),
            })
          }
          className="gap-1"
        >
          <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {m.lrnLessonOf({
              number: formatNumber(data.index + 1),
              total: formatNumber(data.total),
            })}
          </span>
        </Progress>
      </div>
      <RecordHeader
        title={data.title}
        status={
          data.completedAt
            ? { label: m.lrnLessonDone(), tone: "success" }
            : undefined
        }
        facts={
          data.score === null
            ? []
            : [
                {
                  label: m.lrnScore(),
                  value: m.lrnScoreIs({
                    value: formatNumber(data.score),
                  }),
                },
              ]
        }
      />
      {data.blocks.map((block) =>
        block.type === "content" ? (
          <ContentView
            key={block.id}
            document={block.content}
            fileUrl={fileUrl}
          />
        ) : block.type === "media" ? (
          <Media key={block.id} block={block} />
        ) : block.type === "quiz" ? (
          <Quiz
            key={block.id}
            block={block}
            lessonId={lessonId}
            previous={data.answers.quiz[block.id]}
            onAnswered={(completed) => void settled(completed)}
          />
        ) : (
          <Reflection
            key={block.id}
            blockId={block.id}
            prompt={block.prompt}
            lessonId={lessonId}
            previous={data.answers.reflections[block.id]?.text ?? ""}
            onSaved={(completed) => void settled(completed)}
          />
        ),
      )}
      {!data.completedAt && (hint || data.completion === "mark") ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
          <p className="text-sm leading-5 text-muted-foreground">{hint}</p>
          {data.completion === "mark" ? (
            <Button
              type="button"
              className="max-md:h-10"
              disabled={complete.isPending}
              onClick={() => complete.mutate()}
            >
              <CircleCheck aria-hidden />
              {m.lrnMarkDone()}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Footer data={data} />
    </article>
  );
}

/** A lesson as its students will see it, with the right answers shown, for its teacher. */
export function LessonPreview({ lessonId }: { lessonId: string }) {
  const data = useSuspenseQuery(lessonEditorQuery(lessonId)).data;
  const navigate = useNavigate();
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <RecordHeader
        title={data.title}
        status={{ label: m.lrnPreview(), tone: "info" }}
        facts={[
          {
            label: m.lrnCompletion(),
            value:
              data.completion === "score"
                ? m.lrnRuleScore({ score: formatNumber(data.passScore ?? 100) })
                : (RULE_HINT[data.completion]?.() ?? m.lrnRuleView()),
          },
        ]}
        action={{
          label: m.lrnEditLesson(),
          icon: Pencil,
          onClick: () =>
            void navigate({
              to: "/teach/lesson-editor",
              search: { id: data.id, moduleId: data.moduleId },
            }),
        }}
      />
      {data.content.blocks.map((block) =>
        block.type === "content" ? (
          <ContentView
            key={block.id}
            document={block.content}
            fileUrl={fileUrl}
          />
        ) : block.type === "media" ? (
          <Media key={block.id} block={block} />
        ) : block.type === "quiz" ? (
          <div
            key={block.id}
            className="grid gap-3 rounded-lg border bg-card p-5"
          >
            <p dir="auto" className="text-base leading-6 font-semibold">
              {block.question}
            </p>
            <ul className="grid gap-2">
              {block.options.map((option) => {
                const right = block.correctOptionIds.includes(option.id);
                return (
                  <li
                    key={option.id}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg border px-4 py-3 text-sm leading-5",
                      right && "border-success/40 bg-success/10",
                    )}
                  >
                    <span dir="auto" className="min-w-0 flex-1">
                      {option.text}
                    </span>
                    {right ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
                        <CircleCheck aria-hidden className="size-4" />
                        {m.lrnCorrectAnswer()}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {block.explanation ? (
              <p dir="auto" className="text-sm leading-6 text-muted-foreground">
                {block.explanation}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            key={block.id}
            className="grid gap-3 rounded-lg border bg-card p-5"
          >
            <p dir="auto" className="text-base leading-6 font-semibold">
              {block.prompt}
            </p>
            <div className="min-h-24 rounded-md border border-dashed" />
          </div>
        ),
      )}
    </article>
  );
}
