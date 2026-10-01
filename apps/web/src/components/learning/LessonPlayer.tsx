import type {
  VowelMarks,
  CheckView,
  LessonBlock,
  LessonCompletion,
  LessonResponse,
  StoredTry,
  StudentBlock,
} from "@faridalms/domain/learning";

import { allWithoutVowelMarks } from "@faridalms/domain/arabic";
import { contentPlainText, textDirection } from "@faridalms/domain/content";
import {
  checkBlocks,
  checkStates,
  describeCheck,
  isAuto,
  markResponse,
  studentBlocks,
  upgradeLesson,
} from "@faridalms/domain/learning";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Eye,
  Lock,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { ButtonLink } from "~/components/app/ButtonLink";
import { ContentView } from "~/components/content/ContentView";
import { ReadAloud, YoungContext } from "~/components/learning/ReadAloud";
import { RecordHeader } from "~/components/system/RecordPage";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { lessonEditorQuery, lessonQuery } from "~/queries/learning";
import {
  completeLesson,
  answerReview,
  respondToCheck,
  retryLesson,
  revealCheck,
  saveReadingPosition,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "./Checks";

import { CheckBlockView, isCheckBlock, isSettled } from "./Checks";

type Played = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonQuery>["queryFn"]>>
>;

const fileUrl = (fileId: string) => `/files/${fileId}`;

const RULE_HINT: Record<LessonCompletion, (() => string) | null> = {
  view: null,
  mark: m.lrnRuleMark,
  quiz: m.lrnRuleQuiz,
  score: null,
  reflection: m.lrnRuleReflection,
};

const ruleText = (completion: LessonCompletion, passScore: number | null) =>
  completion === "score"
    ? m.lrnRuleScore({ score: formatNumber(passScore ?? 100) })
    : RULE_HINT[completion]?.();

function Media({ block }: { block: Extract<LessonBlock, { type: "media" }> }) {
  const src = fileUrl(block.fileId);
  const captions = block.captionsFileId ? fileUrl(block.captionsFileId) : null;
  return (
    <figure className="grid gap-2">
      {block.mediaType.startsWith("video/") ? (
        <video controls preload="metadata" className="w-full rounded-lg">
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions ?? undefined}
            srcLang={block.captionsLang}
            default={Boolean(captions)}
          />
        </video>
      ) : block.mediaType.startsWith("audio/") ? (
        <audio controls preload="metadata" className="w-full">
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions ?? undefined}
            srcLang={block.captionsLang}
            default={Boolean(captions)}
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
      {block.transcript ? (
        <details className="rounded-lg border px-4 py-2 text-sm leading-6">
          <summary className="cursor-pointer py-1 font-medium">
            {m.lrnTranscript()}
          </summary>
          <p dir="auto" className="pt-2 pb-1 whitespace-pre-wrap">
            {block.transcript}
          </p>
        </details>
      ) : null}
    </figure>
  );
}

function Gate({
  open,
  done,
  total,
  onContinue,
}: {
  open: boolean;
  done: number;
  total: number;
  onContinue: () => void;
}) {
  if (open)
    return (
      <div className="flex justify-center">
        <Button type="button" className="max-md:h-10" onClick={onContinue}>
          {m.lrnContinue()}
          <ArrowDown aria-hidden />
        </Button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-dashed px-5 py-4 text-sm leading-5 text-muted-foreground">
      <Lock aria-hidden className="size-4" />
      <span>{m.lrnGateLocked()}</span>
      <span className="tabular-nums">
        {m.lrnGateProgress({
          count: formatNumber(done),
          total: formatNumber(total),
        })}
      </span>
    </div>
  );
}

/**
 * A lesson's blocks as its student meets them, stopping at each continue gate
 * until the questions above it are settled and the student moves on.
 */
function LessonBody({
  blocks,
  checks,
  driver,
  position,
  onReach,
}: {
  blocks: StudentBlock[];
  checks: Record<string, CheckView>;
  driver: CheckDriver;
  position?: string | null;
  onReach?: (blockId: string) => void;
}) {
  const young = useContext(YoungContext);
  const settledAbove = (index: number) => {
    const above = blocks.slice(0, index).filter(isCheckBlock);
    return {
      total: above.length,
      done: above.filter((block) => isSettled(block, checks[block.id])).length,
    };
  };
  const reached = position
    ? blocks.findIndex((block) => block.id === position)
    : -1;
  const [passed, setPassed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        blocks.flatMap((block, index) => {
          if (block.type !== "gate") return [];
          const { done, total } = settledAbove(index);
          // A gate over questions opens when they are settled, even after a
          // fresh attempt; one over reading alone stays open once read past.
          return (total > 0 ? done === total : index < reached)
            ? [block.id]
            : [];
        }),
      ),
  );
  const [resumed, setResumed] = useState(false);
  const shown: { block: StudentBlock; index: number }[] = [];
  for (const [index, block] of blocks.entries()) {
    shown.push({ block, index });
    if (block.type === "gate" && !passed.has(block.id)) break;
  }
  const resumeAt =
    !resumed && reached > 0 && shown.some(({ index }) => index === reached)
      ? blocks[reached]?.id
      : undefined;

  return (
    <>
      {resumeAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-3">
          <p className="text-sm leading-5 text-muted-foreground">
            {m.lrnResumeHint()}
          </p>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => {
              setResumed(true);
              const target = document.getElementById(`block-${resumeAt}`);
              target?.scrollIntoView({ block: "start" });
              target?.focus({ preventScroll: true });
            }}
          >
            {m.lrnResume()}
            <ArrowDown aria-hidden />
          </Button>
        </div>
      ) : null}
      {shown.map(({ block, index }) => {
        let body;
        if (block.type === "gate") {
          if (passed.has(block.id)) return null;
          const { done, total } = settledAbove(index);
          body = (
            <Gate
              open={done === total}
              done={done}
              total={total}
              onContinue={() => {
                // The blocks after the gate must exist before focus can move to them.
                flushSync(() =>
                  setPassed((current) => new Set([...current, block.id])),
                );
                const next = blocks[index + 1];
                if (next) {
                  document.getElementById(`block-${next.id}`)?.focus();
                  onReach?.(next.id);
                }
              }}
            />
          );
        } else if (block.type === "content")
          body = young ? (
            <div
              dir={textDirection(contentPlainText(block.content)) ?? undefined}
              className="flex items-start gap-3"
            >
              <ReadAloud text={contentPlainText(block.content)} />
              <div className="min-w-0 flex-1">
                <ContentView document={block.content} fileUrl={fileUrl} />
              </div>
            </div>
          ) : (
            <ContentView document={block.content} fileUrl={fileUrl} />
          );
        else if (block.type === "media") body = <Media block={block} />;
        else if (isCheckBlock(block))
          body = (
            <CheckBlockView
              block={block}
              view={checks[block.id]}
              driver={driver}
            />
          );
        return (
          <section
            key={block.id}
            id={`block-${block.id}`}
            // A gate is passed by choosing to continue, never by scrolling to it.
            data-block={block.type === "gate" ? undefined : block.id}
            tabIndex={-1}
            className="scroll-mt-24 outline-none"
          >
            {body}
          </section>
        );
      })}
    </>
  );
}

/** Saves the furthest block a student has scrolled to, a moment after they stop. */
function useReadingPosition(
  lessonId: string,
  blocks: StudentBlock[],
  saved: string | null,
) {
  const furthest = useRef(
    saved ? blocks.findIndex((block) => block.id === saved) : -1,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reach = (blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index <= furthest.current) return;
    furthest.current = index;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // A lost position only means the lesson opens at the top next time.
      void saveReadingPosition({ data: { lessonId, blockId } }).catch(
        () => undefined,
      );
    }, 1500);
  };
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            reach((entry.target as HTMLElement).dataset.block ?? "");
      },
      { threshold: 0.6 },
    );
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-block]",
    ))
      observer.observe(element);
    return () => observer.disconnect();
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return reach;
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

/**
 * Vowel marks as the lesson sets them: shown, hidden, or the student's to
 * choose with a toggle. Answers are marked the same either way.
 */
function useVowelMarks(setting: VowelMarks) {
  const [marks, setMarks] = useState(setting !== "hidden");
  return useMemo(() => {
    const hidden = setting === "hidden" || (setting === "choice" && !marks);
    return {
      strip: <T,>(value: T): T =>
        hidden ? allWithoutVowelMarks(value) : value,
      toggle:
        setting === "choice" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit max-md:h-10"
            aria-pressed={!marks}
            onClick={() => setMarks((current) => !current)}
          >
            {marks ? m.lrnHideVowelMarks() : m.lrnShowVowelMarks()}
          </Button>
        ) : null,
    };
  }, [setting, marks]);
}

/** One lesson for its student: read, answer, and move on when it is done. */
export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const query = lessonQuery(lessonId);
  const data = useSuspenseQuery(query).data;
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["learning"] });
  const apply = async (
    blockId: string,
    result: {
      check: CheckView;
      score: number | null;
      completed: boolean;
      review: (typeof data)["review"];
    },
  ) => {
    queryClient.setQueryData(query.queryKey, (old) =>
      old
        ? {
            ...old,
            checks: { ...old.checks, [blockId]: result.check },
            score: result.score,
            review: result.review,
          }
        : old,
    );
    if (result.completed && !data.completedAt) {
      await refresh();
      toast.success(m.lrnLessonFinished());
    }
  };
  const driver: CheckDriver = {
    respond: async (blockId, response) => {
      const result = await respondToCheck({
        data: { lessonId, blockId, response },
      });
      await apply(blockId, result);
    },
    reveal: async (blockId) => {
      const result = await revealCheck({ data: { lessonId, blockId } });
      await apply(blockId, result);
    },
  };
  // A question asked again is answered once and leaves the score alone.
  const reviewDriver: CheckDriver = {
    respond: async (blockId, response) => {
      const result = await answerReview({
        data: { lessonId, blockId, response },
      });
      queryClient.setQueryData(query.queryKey, (old) =>
        old?.review
          ? {
              ...old,
              review: {
                ...old.review,
                checks: { ...old.review.checks, [blockId]: result.check },
              },
            }
          : old,
      );
    },
    reveal: () => Promise.resolve(),
  };
  const complete = useMutation({
    mutationFn: () => completeLesson({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.lrnLessonFinished());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const retry = useMutation({
    mutationFn: () => retryLesson({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      window.scrollTo({ top: 0 });
      toast.success(m.lrnNewAttempt());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reach = useReadingPosition(lessonId, data.blocks, data.position);

  const vowels = useVowelMarks(data.vowelMarks);
  const shown = useMemo(
    () =>
      vowels.strip({
        blocks: data.blocks,
        checks: data.checks,
        review: data.review,
      }),
    [vowels, data.blocks, data.checks, data.review],
  );
  const checks = data.blocks.filter(isCheckBlock);
  const auto = checks.filter((block) => block.type !== "written");
  const allSettled = auto.every((block) =>
    isSettled(block, data.checks[block.id]),
  );
  const canRetry = auto.length > 0 && allSettled;
  const hint = ruleText(data.completion, data.passScore);
  const place = m.lrnLessonOf({
    number: formatNumber(data.index + 1),
    total: formatNumber(data.total),
  });
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <Progress
        value={((data.index + 1) / data.total) * 100}
        aria-label={m.lrnPlace()}
        getAriaValueText={() => place}
        className="gap-1"
      >
        <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
          {place}
        </span>
      </Progress>
      <RecordHeader
        title={data.title}
        status={
          data.completedAt
            ? { label: m.lrnLessonDone(), tone: "success" }
            : undefined
        }
        facts={[
          ...(data.score === null
            ? []
            : [
                {
                  label: m.lrnScore(),
                  value: m.lrnScoreIs({ value: formatNumber(data.score) }),
                },
              ]),
          ...(data.attempt > 1
            ? [
                {
                  label: m.lrnAttempt(),
                  value: m.lrnAttemptIs({
                    number: formatNumber(data.attempt),
                  }),
                },
              ]
            : []),
        ]}
      />
      {vowels.toggle}
      <YoungContext.Provider value={data.young}>
        <LessonBody
          key={data.attempt}
          blocks={shown.blocks}
          checks={shown.checks}
          driver={driver}
          position={data.position}
          onReach={reach}
        />
      </YoungContext.Provider>
      {data.review ? (
        <section
          aria-labelledby="lesson-review"
          className="grid gap-6 border-t pt-6"
        >
          <div className="grid gap-1">
            <h2 id="lesson-review" className="text-lg leading-7 font-semibold">
              {m.lrnOnceMore()}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {m.lrnOnceMoreHint()}
            </p>
          </div>
          {shown.review?.blocks.filter(isCheckBlock).map((block) => (
            <CheckBlockView
              key={block.id}
              block={block}
              view={shown.review?.checks[block.id]}
              driver={reviewDriver}
            />
          ))}
        </section>
      ) : null}
      {data.completedAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-5 py-4">
          <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium">
            <CircleCheck aria-hidden className="size-4 text-success" />
            {data.score === null
              ? m.lrnLessonFinished()
              : m.lrnFinishedScore({ value: formatNumber(data.score) })}
          </p>
          {canRetry ? (
            <RetryButton
              pending={retry.isPending}
              onRetry={() => retry.mutate()}
            />
          ) : null}
        </div>
      ) : hint || data.completion === "mark" || canRetry ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
          <p className="text-sm leading-5 text-muted-foreground">
            {canRetry && data.completion === "score"
              ? m.lrnBelowPass({ score: formatNumber(data.passScore ?? 100) })
              : hint}
          </p>
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <RetryButton
                pending={retry.isPending}
                onRetry={() => retry.mutate()}
              />
            ) : null}
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
        </div>
      ) : null}
      <Footer data={data} />
    </article>
  );
}

function RetryButton({
  pending,
  onRetry,
}: {
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="max-md:h-10"
      disabled={pending}
      title={m.lrnRetryHint()}
      onClick={onRetry}
    >
      <RotateCcw aria-hidden />
      {m.lrnRetryLesson()}
    </Button>
  );
}

/**
 * A lesson as its students will meet it, answered and marked here in the
 * browser so the teacher can try every question; nothing is saved.
 */
export function LessonPreview({ lessonId }: { lessonId: string }) {
  const data = useSuspenseQuery(lessonEditorQuery(lessonId)).data;
  const navigate = useNavigate();
  const [rows, setRows] = useState<StoredTry[]>([]);
  const [round, setRound] = useState(0);
  const vowels = useVowelMarks(data.vowelMarks);
  const lesson = useMemo(
    () => vowels.strip(upgradeLesson(data.content)),
    [vowels, data.content],
  );
  const blocks = useMemo(
    () => studentBlocks(lesson, `preview:${round}`),
    [lesson, round],
  );
  const checks = useMemo(() => {
    const states = checkStates(lesson, rows);
    return Object.fromEntries(
      checkBlocks(lesson).map((block) => [
        block.id,
        describeCheck(block, rows, states[block.id]),
      ]),
    );
  }, [lesson, rows]);
  const driver: CheckDriver = {
    respond: (blockId, response: LessonResponse) => {
      const block = checkBlocks(lesson).find((item) => item.id === blockId);
      if (!block) return Promise.resolve();
      const marked = isAuto(block) ? markResponse(block, response) : null;
      setRows((current) => {
        const previous = current.filter(
          (row) =>
            row.blockId === blockId &&
            (row.state === "answered" || row.state === "needs_marking"),
        ).length;
        return [
          ...current,
          {
            blockId,
            try: previous + 1,
            state: marked || block.points === 0 ? "answered" : "needs_marking",
            fraction: marked ? marked.fraction : null,
            response,
            feedback: null,
          },
        ];
      });
      return Promise.resolve();
    },
    reveal: (blockId) => {
      setRows((current) => [
        ...current,
        {
          blockId,
          try: 1,
          state: "revealed",
          fraction: 0,
          response: {},
          feedback: null,
        },
      ]);
      return Promise.resolve();
    },
  };
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <RecordHeader
        title={data.title}
        status={{ label: m.lrnPreview(), tone: "info" }}
        facts={[
          {
            label: m.lrnCompletion(),
            value: ruleText(data.completion, data.passScore) ?? m.lrnRuleView(),
          },
        ]}
        alerts={[{ label: m.lrnPreviewHint(), tone: "info", icon: Eye }]}
        action={{
          label: m.lrnEditLesson(),
          icon: Pencil,
          onClick: () =>
            void navigate({
              to: "/teach/lesson-editor",
              search: { id: data.id, moduleId: data.moduleId },
            }),
        }}
        menu={[
          {
            label: m.lrnStartOver(),
            icon: RotateCcw,
            onSelect: () => {
              setRows([]);
              setRound((current) => current + 1);
            },
          },
        ]}
      />
      {vowels.toggle}
      <YoungContext.Provider value={data.young}>
        <LessonBody
          key={round}
          blocks={blocks}
          checks={checks}
          driver={driver}
        />
      </YoungContext.Provider>
    </article>
  );
}
