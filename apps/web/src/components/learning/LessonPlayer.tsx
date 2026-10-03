import type {
  VowelMarks,
  CheckView,
  LessonCompletion,
  LessonResponse,
  StoredTry,
  StudentBlock,
  Watched,
} from "@faridalms/domain/learning";
import type { MediaWatch, VideoControl } from "@faridalms/editor/player";

import { allWithoutVowelMarks } from "@faridalms/domain/arabic";
import { contentPlainText, textDirection } from "@faridalms/domain/content";
import {
  checkBlocks,
  checkStates,
  describeCheck,
  isAuto,
  markResponse,
  mediaFiles,
  studentBlocks,
  upgradeLesson,
  videoStops,
  watchedEnough,
} from "@faridalms/domain/learning";
import { isContentDocument } from "@faridalms/domain/lesson-content";
import { mediaClock } from "@faridalms/editor/format";
import { Button } from "@faridalms/ui/button";
import { Progress } from "@faridalms/ui/progress";
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
  Clock,
  Eye,
  Lock,
  Pencil,
  Play,
  RotateCcw,
} from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { ButtonLink } from "~/components/app/ButtonLink";
import { ContentView } from "~/components/content/ContentView";
import { Media } from "~/components/learning/LessonMedia";
import { ReadAloud, YoungContext } from "~/components/learning/ReadAloud";
import { paperBlock } from "~/components/print/paper-blocks";
import { usePrint } from "~/components/print/usePrint";
import { RecordHeader } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { lessonEditorQuery, lessonQuery } from "~/queries/learning";
import {
  completeLesson,
  answerReview,
  respondToCheck,
  retryLesson,
  revealCheck,
  saveReadingPosition,
  saveWatch,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "./Checks";

import { CheckBlockView, isCheckBlock, isSettled } from "./Checks";
import { YoungLesson } from "./young/YoungLesson";

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
  watch: m.lrnRuleWatch,
};

const ruleText = (completion: LessonCompletion, passScore: number | null) =>
  completion === "score"
    ? m.lrnRuleScore({ score: formatNumber(passScore ?? 100) })
    : RULE_HINT[completion]?.();

type GateWaits = "questions" | "media" | "both";

const GATE_LOCKED: Record<GateWaits, () => string> = {
  questions: m.lrnGateLocked,
  media: m.lrnGateLockedWatch,
  both: m.lrnGateLockedBoth,
};

const GATE_PROGRESS: Record<
  GateWaits,
  (inputs: { count: string; total: string }) => string
> = {
  questions: m.lrnGateProgress,
  media: m.lrnGateProgressWatch,
  both: m.lrnGateProgressBoth,
};

function Gate({
  open,
  done,
  total,
  waits,
  onContinue,
}: {
  open: boolean;
  done: number;
  total: number;
  waits: GateWaits;
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
      <span>{GATE_LOCKED[waits]()}</span>
      <span className="tabular-nums">
        {GATE_PROGRESS[waits]({
          count: formatNumber(done),
          total: formatNumber(total),
        })}
      </span>
    </div>
  );
}

/**
 * A lesson's blocks as its student meets them, stopping at each continue gate
 * until the questions above it are settled, the recordings above it
 * watched, and the student moves on.
 */
function LessonBody({
  blocks,
  checks,
  driver,
  position,
  onReach,
  watch,
  watches = {},
}: {
  blocks: StudentBlock[];
  checks: Record<string, CheckView>;
  driver: CheckDriver;
  position?: string | null;
  onReach?: (blockId: string) => void;
  watch?: (fileId: string) => MediaWatch | undefined;
  watches?: Record<string, Watched>;
}) {
  const young = useContext(YoungContext);
  const stops = useMemo(() => videoStops(blocks), [blocks]);
  const stopOf = useMemo(() => {
    const found = new Map<string, { fileId: string; at: number }>();
    for (const [fileId, list] of stops)
      for (const stop of list) found.set(stop.blockId, { fileId, at: stop.at });
    return found;
  }, [stops]);
  const [stopped, setStopped] = useState<ReadonlySet<string>>(new Set());
  const players = useRef(new Map<string, VideoControl>());
  const answered = (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    return Boolean(
      block && isCheckBlock(block) && isSettled(block, checks[block.id]),
    );
  };
  // A video's questions come in as it plays: each opens when the video
  // stops for it, and the video plays on once it is answered.
  const watching = (fileId: string): MediaWatch | undefined => {
    const base = watch?.(fileId);
    const list = stops.get(fileId);
    if (!base || !list) return base;
    return {
      ...base,
      stops: list.map((stop) => ({
        at: stop.at,
        done: answered(stop.blockId),
      })),
      onQuestion: (at) => {
        const asked = list.filter((stop) => stop.at === at);
        flushSync(() =>
          setStopped(
            (current) =>
              new Set([...current, ...asked.map((stop) => stop.blockId)]),
          ),
        );
        const first = asked.find((stop) => !answered(stop.blockId)) ?? asked[0];
        if (!first) return;
        const target = document.getElementById(`block-${first.blockId}`);
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
      bind: (control) => players.current.set(fileId, control),
    };
  };
  /** Where the part of a video a stop asks about begins: the stop before it, or the start. */
  const segmentStart = (fileId: string, at: number) =>
    (stops.get(fileId) ?? [])
      .map((stop) => stop.at)
      .filter((time) => time < at)
      .at(-1) ?? 0;
  const settledAbove = (index: number) => {
    const above = blocks.slice(0, index);
    const questions = above.filter(isCheckBlock);
    const media = mediaFiles(above);
    const waits: GateWaits =
      questions.length === 0
        ? "media"
        : media.length === 0
          ? "questions"
          : "both";
    return {
      total: questions.length + media.length,
      done:
        questions.filter((block) => isSettled(block, checks[block.id])).length +
        media.filter((file) => watchedEnough(watches[file])).length,
      waits,
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
          const { done, total, waits } = settledAbove(index);
          body = (
            <Gate
              open={done === total}
              done={done}
              total={total}
              waits={waits}
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
          body = (
            <ContentView
              document={block.content}
              fileUrl={fileUrl}
              watch={watching}
              renderBlock={(node, drawn) => {
                const narration = node.$?.narration ?? null;
                if (!young && !narration) return drawn;
                const text = contentPlainText({
                  root: { ...block.content.root, children: [node] },
                });
                // For young children every block keeps a speaker's room at
                // its start, so their text lines up whether one shows or not.
                return young ? (
                  <div
                    dir={textDirection(text) ?? undefined}
                    className="flex items-start gap-3"
                  >
                    <span className="flex w-11 shrink-0 justify-center">
                      <ReadAloud text={text} narration={narration} />
                    </span>
                    <div className="min-w-0 flex-1">{drawn}</div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">{drawn}</div>
                    <ReadAloud
                      text={text}
                      narration={narration}
                      voice={false}
                      size="small"
                      className="mt-1"
                    />
                  </div>
                );
              }}
            />
          );
        else if (block.type === "media")
          body = <Media block={block} watch={watching} />;
        else if (isCheckBlock(block)) {
          const stop = stopOf.get(block.id);
          const view = checks[block.id];
          const settledHere = isSettled(block, view);
          const missed = Boolean(view && view.tries > 0 && !settledHere);
          body =
            stop && !settledHere && !stopped.has(block.id) ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm leading-5 text-muted-foreground">
                <Clock aria-hidden className="size-4 shrink-0" />
                {m.lrnVideoQuestionAhead({
                  time: mediaClock(stop.at),
                })}
              </p>
            ) : (
              <div className="grid gap-3">
                <CheckBlockView
                  block={block}
                  view={checks[block.id]}
                  driver={driver}
                />
                {stop && settledHere && stopped.has(block.id) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start max-md:h-10"
                    onClick={() => players.current.get(stop.fileId)?.play()}
                  >
                    <Play aria-hidden />
                    {m.lrnVideoContinue()}
                  </Button>
                ) : null}
                {/* After a wrong try, the part of the video the question asks about plays again. */}
                {stop && missed && stopped.has(block.id) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start max-md:h-10"
                    onClick={() =>
                      players.current
                        .get(stop.fileId)
                        ?.playFrom(segmentStart(stop.fileId, stop.at))
                    }
                  >
                    <RotateCcw aria-hidden />
                    {m.lrnVideoRewatch({
                      time: mediaClock(segmentStart(stop.fileId, stop.at)),
                    })}
                  </Button>
                ) : null}
              </div>
            );
        }
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

/**
 * Reports what a student plays of each of a lesson's recordings, and where
 * to pick each up; `onFinished` runs once if that finishes the lesson.
 */
function useWatching(
  lessonId: string,
  watches: Record<string, { positionSeconds: number }>,
  onWatched: (
    watched: Awaited<ReturnType<typeof saveWatch>>["watched"],
  ) => void,
  onFinished: () => void,
) {
  const finished = useRef(false);
  return (fileId: string): MediaWatch => ({
    startAt: watches[fileId]?.positionSeconds ?? 0,
    report: (report) => {
      // A lost report only means those seconds count when played again.
      void saveWatch({ data: { lessonId, fileId, ...report } })
        .then((result) => {
          onWatched(result.watched);
          if (result.completed && !finished.current) {
            finished.current = true;
            onFinished();
          }
        })
        .catch(() => undefined);
    },
  });
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
  const earlyYears = useCurrentUser().features.early_years;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const watch = useWatching(
    lessonId,
    data.watches,
    (watched) =>
      queryClient.setQueryData(query.queryKey, (old) =>
        old
          ? { ...old, watches: { ...old.watches, [watched.fileId]: watched } }
          : old,
      ),
    () => {
      if (data.completedAt) return;
      void refresh().then(() => toast.success(m.lrnLessonFinished()));
    },
  );

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
  // A lesson prints as its student has it: no answers ever reached them.
  const printing = usePrint({
    title: data.title,
    lesson: shown.blocks.map(paperBlock),
    link: `/lessons/${lessonId}`,
  });
  const checks = data.blocks.filter(isCheckBlock);
  const auto = checks.filter(
    (block) => block.type !== "written" && block.type !== "scratch",
  );
  const allSettled = auto.every((block) =>
    isSettled(block, data.checks[block.id]),
  );
  const canRetry = auto.length > 0 && allSettled;
  const hint = ruleText(data.completion, data.passScore);
  const place = m.lrnLessonOf({
    number: formatNumber(data.index + 1),
    total: formatNumber(data.total),
  });
  if (data.young && earlyYears)
    return (
      <YoungContext.Provider value>
        <YoungLesson
          key={data.attempt}
          title={data.title}
          blocks={shown.blocks}
          checks={shown.checks}
          driver={driver}
          readAlong={data.readAlong}
          classSounds={data.sounds}
          position={data.position}
          onReach={reach}
          onClose={() =>
            void navigate({
              to: "/modules/$moduleId",
              params: { moduleId: data.module.id },
            })
          }
          onFinish={
            data.completion === "mark" && !data.completedAt
              ? () => complete.mutate()
              : undefined
          }
          retry={
            canRetry
              ? { pending: retry.isPending, onRetry: () => retry.mutate() }
              : null
          }
          next={
            data.next
              ? {
                  label: m.lrnNext(),
                  onNext: () =>
                    void navigate({
                      to: "/lessons/$lessonId",
                      params: { lessonId: data.next ?? "" },
                    }),
                }
              : null
          }
        />
      </YoungContext.Provider>
    );
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
        menu={printing.action ? [printing.action] : []}
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
      <YoungContext.Provider value={data.young && earlyYears}>
        <LessonBody
          key={data.attempt}
          blocks={shown.blocks}
          checks={shown.checks}
          driver={driver}
          position={data.position}
          onReach={reach}
          watch={watch}
          watches={data.watches}
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
      {printing.sheet}
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
  const earlyYears = useCurrentUser().features.early_years;
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
    // A preview keeps a spoken or drawn answer in the page; nothing is
    // uploaded.
    keepFile: (file) =>
      Promise.resolve({
        fileId: crypto.randomUUID(),
        url: URL.createObjectURL(file),
      }),
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
  const edit = () =>
    void navigate({
      to: "/teach/lesson-editor",
      search: { id: data.id, moduleId: data.moduleId },
    });
  const printing = usePrint(
    isContentDocument(data.content)
      ? {
          title: data.title,
          content: data.content,
          answers: true,
          link: `/lessons/${data.id}`,
        }
      : null,
  );
  if (data.young && earlyYears)
    return (
      <YoungContext.Provider value>
        <YoungLesson
          key={round}
          title={data.title}
          blocks={blocks}
          checks={checks}
          driver={driver}
          readAlong={data.readAlong}
          onClose={edit}
          badge={m.lrnPreview()}
          retry={{
            pending: false,
            onRetry: () => {
              setRows([]);
              setRound((current) => current + 1);
            },
          }}
        />
      </YoungContext.Provider>
    );
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
          onClick: edit,
        }}
        menu={[
          ...(printing.action ? [printing.action] : []),
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
      <YoungContext.Provider value={data.young && earlyYears}>
        <LessonBody
          key={round}
          blocks={blocks}
          checks={checks}
          driver={driver}
        />
      </YoungContext.Provider>
      {printing.sheet}
    </article>
  );
}
