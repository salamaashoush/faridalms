import type { practiseQuizSchema } from "@faridalms/domain/coursework";
import type {
  CheckView,
  LessonResponse,
  StudentBlock,
} from "@faridalms/domain/learning";
import type { ReactNode } from "react";
import type * as v from "valibot";

import { CONTENT_LOCALES } from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { FormField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { CheckCircle2, Coffee, LoaderCircle, Timer } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import type { CheckDriver } from "~/components/learning/Checks";

import { ContentView, WholeDocument } from "~/components/content/ContentView";
import { CheckLanguage } from "~/components/learning/checkLanguage";
import {
  CheckBlockView,
  CheckModeContext,
  isCheckBlock,
  ReviewerContext,
} from "~/components/learning/Checks";
import { ReaderContext } from "~/components/learning/ReadAloud";
import * as m from "~/i18n/messages";
import { myWorkQuery, quizPollResultsQuery } from "~/queries/coursework";
import {
  handInWork,
  markQuizAnswer,
  pauseQuiz,
  practiseQuiz,
  resumeQuiz,
  saveQuizAnswer,
  startQuiz,
} from "~/server/coursework";
import { formatClock, formatMinutes, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Work = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myWorkQuery>["queryFn"]>>
>;
type LearnerQuiz = NonNullable<Work["quiz"]>;

const fileUrl = (fileId: string) => `/files/${fileId}`;

type PractiseStep = v.InferInput<typeof practiseQuizSchema>["step"];

/** An answer kept but not handed in, shaped as a question's view. */
function keptView(response: LessonResponse | undefined): CheckView | undefined {
  if (!response) return undefined;
  return {
    tries: 1,
    response,
    correct: false,
    revealed: false,
    fraction: 0,
    triesLeft: null,
    feedback: [],
    parts: {},
    hints: [],
    hintsLeft: 0,
    askable: 0,
    asked: 0,
    key: null,
    partKey: null,
    explanation: null,
    marked: false,
    credit: null,
    markFeedback: null,
    timing: null,
  };
}

const NO_ANSWERS: CheckDriver = {
  respond: () => Promise.resolve(),
  reveal: () => Promise.resolve(),
};

/** A quiz's blocks in one mode, questions answered or reviewed through their views. */
function QuizBlocks({
  blocks,
  views,
  driver,
  practice,
}: {
  blocks: StudentBlock[];
  views: Record<string, CheckView | undefined>;
  driver: CheckDriver;
  /** In a practice quiz: the questions checked as they are answered, and how. */
  practice?: { views: Record<string, CheckView>; driver: CheckDriver };
}) {
  return (
    <WholeDocument parts={blocks}>
      <div className="grid gap-4">
        {blocks.map((block) =>
          block.type === "content" ? (
            <ContentView
              key={block.id}
              document={block.content}
              fileUrl={fileUrl}
            />
          ) : isCheckBlock(block) ? (
            practice && block.id in practice.views ? (
              <CheckModeContext.Provider key={block.id} value="practice">
                <CheckBlockView
                  block={block}
                  view={practice.views[block.id]}
                  driver={practice.driver}
                />
              </CheckModeContext.Provider>
            ) : (
              <CheckBlockView
                key={block.id}
                block={block}
                view={views[block.id]}
                driver={driver}
              />
            )
          ) : null,
        )}
      </div>
    </WholeDocument>
  );
}

function Results({ quiz }: { quiz: LearnerQuiz }) {
  const [shown, setShown] = useState(quiz.results.at(-1)?.number ?? 0);
  const result = quiz.results.find((item) => item.number === shown);
  return (
    <RecordSection variant="page" title={m.quizResults()}>
      <div className="grid gap-4">
        <ul className="flex flex-wrap gap-2">
          {quiz.results.map((item) => (
            <li key={item.number}>
              <Button
                type="button"
                variant={item.number === shown ? "default" : "outline"}
                size="sm"
                className="max-md:h-10"
                aria-pressed={item.number === shown}
                onClick={() => setShown(item.number)}
              >
                {m.courseworkAttemptNumber({ number: item.number })}
                {item.score === null
                  ? null
                  : ` · ${m.quizScoreOf({
                      score: formatNumber(item.score),
                      total: formatNumber(quiz.total),
                    })}`}
              </Button>
            </li>
          ))}
        </ul>
        {result ? (
          result.checks ? (
            <>
              {result.pending ? (
                <p className="text-sm leading-5 text-muted-foreground">
                  {m.quizPendingMarks()}
                </p>
              ) : result.band ? (
                <p
                  dir="auto"
                  className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-5"
                >
                  {result.band}
                </p>
              ) : null}
              <CheckModeContext.Provider value="review">
                <QuizBlocks
                  key={result.number}
                  blocks={result.blocks}
                  views={result.checks}
                  driver={NO_ANSWERS}
                />
              </CheckModeContext.Provider>
            </>
          ) : (
            <RecordEmpty>{m.quizResultsLater()}</RecordEmpty>
          )
        ) : null}
      </div>
    </RecordSection>
  );
}

/**
 * The time left on a timed attempt, said aloud with five minutes and with
 * one minute to go. At zero it calls `onTimeUp`, once.
 */
function QuizClock({
  endsAt,
  onTimeUp,
  action,
}: {
  endsAt: string;
  onTimeUp: () => void;
  /** What the student may do with the clock, beside it. */
  action?: ReactNode;
}) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => Date.now());
  const timeUp = useEffectEvent(onTimeUp);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Date.parse(endsAt) - now;
  const over = left <= 0;
  useEffect(() => {
    if (over) timeUp();
  }, [over]);
  if (!hydrated) return null;
  const minutes = Math.ceil(left / 60_000);
  return (
    <div className="sticky top-2 z-10 flex items-center justify-end gap-2">
      {action}
      <p
        className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium tabular-nums shadow-sm [&_svg]:size-4 ${left < 60_000 ? "border-destructive text-destructive" : ""}`}
      >
        <Timer aria-hidden />
        <span className="sr-only">{m.quizTimeLeft()}</span>
        <span role="timer">{formatClock(left)}</span>
      </p>
      <span className="sr-only" aria-live="polite">
        {!over && (minutes === 5 || minutes === 1)
          ? m.quizTimeWarning({ count: minutes })
          : ""}
      </span>
    </div>
  );
}

/**
 * A quiz as its student takes it: every answer is kept as it is given, and
 * handing in marks the whole attempt. Earlier attempts show what the quiz
 * lets them see.
 */
export function QuizWork({
  data,
  reading,
}: {
  data: Work;
  /** The language the student reads the brief in, which its questions follow. */
  reading?: string | undefined;
}) {
  const quiz = data.quiz;
  // The questions in the translation's words carry the same ids, so the
  // answers kept so far stand in either language.
  const asked =
    quiz?.translated && reading === quiz.translated.locale
      ? quiz.translated.blocks
      : quiz?.blocks;
  const readingIn = CONTENT_LOCALES.find((locale) => locale === reading);
  const queryClient = useQueryClient();
  const query = myWorkQuery(data.assignment.id);
  const [confirming, setConfirming] = useState(false);
  const handIn = useMutation({
    mutationFn: () =>
      handInWork({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: data.submission.version,
        },
      }),
    meta: { inlineError: true },
  });
  // An attempt begins its clock, and draws from the question bank, as it
  // opens: a timed one when the student chooses to begin, any other at once.
  const draw = useMutation({
    mutationFn: () => startQuiz({ data: { assignmentId: data.assignment.id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
    meta: { inlineError: true },
  });
  const undrawn = Boolean(quiz?.undrawn && !quiz.timing);
  const { mutate: drawQuestions } = draw;
  useEffect(() => {
    if (undrawn) drawQuestions();
  }, [undrawn, drawQuestions]);
  // When time runs out the kept answers go in, whether or not anyone is
  // here; the server hands in any attempt left open.
  const timeUp = useMutation({
    mutationFn: () =>
      handInWork({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: data.submission.version,
        },
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      toast.info(m.quizTimeUp());
    },
    meta: { inlineError: true },
  });
  // A supervised rest break stops the clock and hides the questions.
  const rest = useMutation({
    mutationFn: (step: "pause" | "resume") =>
      (step === "pause" ? pauseQuiz : resumeQuiz)({
        data: { assignmentId: data.assignment.id },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
    meta: { inlineError: true },
  });
  const ranOut = Boolean(quiz?.open && quiz.timing?.timeUp);
  const { mutate: handInNow, isIdle: notYet } = timeUp;
  useEffect(() => {
    if (ranOut && notYet) handInNow();
  }, [ranOut, notYet, handInNow]);
  if (!quiz) return null;
  const driver: CheckDriver = {
    respond: async (blockId, response) => {
      await saveQuizAnswer({
        data: { assignmentId: data.assignment.id, blockId, response },
      });
      queryClient.setQueryData(query.queryKey, (old) =>
        old?.quiz
          ? {
              ...old,
              quiz: {
                ...old.quiz,
                drafts: { ...old.quiz.drafts, [blockId]: response },
              },
            }
          : old,
      );
    },
    reveal: () => Promise.resolve(),
    poll: (blockId) => quizPollResultsQuery(data.assignment.id, blockId),
  };
  const practised = quiz.practised;
  const step = async (blockId: string, kind: PractiseStep) => {
    const result = await practiseQuiz({
      data: { assignmentId: data.assignment.id, blockId, step: kind },
    });
    queryClient.setQueryData(query.queryKey, (old) =>
      old?.quiz?.practised
        ? {
            ...old,
            quiz: {
              ...old.quiz,
              practised: { ...old.quiz.practised, [blockId]: result.check },
            },
          }
        : old,
    );
  };
  const practice = practised
    ? {
        views: practised,
        driver: {
          respond: (blockId, response) =>
            step(blockId, { kind: "answer", response }),
          reveal: (blockId) => step(blockId, { kind: "reveal" }),
          hint: (blockId) => step(blockId, { kind: "hint" }),
          poll: (blockId) => quizPollResultsQuery(data.assignment.id, blockId),
        } satisfies CheckDriver,
      }
    : undefined;
  const questions = quiz.blocks.filter(isCheckBlock);
  const answered = questions.filter((block) => {
    const tried = practised?.[block.id];
    return tried
      ? tried.tries > 0 || tried.revealed
      : Boolean(quiz.drafts[block.id]);
  }).length;
  const views = Object.fromEntries(
    questions.map((block) => [block.id, keptView(quiz.drafts[block.id])]),
  );
  const left =
    quiz.attemptsAllowed === null
      ? null
      : quiz.attemptsAllowed - quiz.attemptsUsed;
  return (
    <ReaderContext.Provider value={quiz.readAloud}>
      {quiz.results.length > 0 ? <Results quiz={quiz} /> : null}
      {quiz.open && quiz.timing && !quiz.timing.startedAt ? (
        <RecordSection
          variant="page"
          title={m.quizAttemptTitle({ number: formatNumber(quiz.attempt) })}
        >
          <div className="grid justify-items-start gap-4">
            <p className="text-sm leading-5 text-muted-foreground">
              {(quiz.timing.extra ? m.quizTimedBodyExtra : m.quizTimedBody)({
                time: formatMinutes(quiz.timing.minutes),
              })}
            </p>
            {draw.error ? (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {getMessageFromError(draw.error)}
              </p>
            ) : null}
            <Button
              type="button"
              className="max-md:h-10"
              disabled={draw.isPending}
              onClick={() => draw.mutate()}
            >
              <Timer aria-hidden />
              {m.quizBegin()}
            </Button>
          </div>
        </RecordSection>
      ) : quiz.open && quiz.undrawn ? (
        <RecordSection
          variant="page"
          title={m.quizAttemptTitle({ number: formatNumber(quiz.attempt) })}
        >
          {draw.error ? (
            <p role="alert" className="text-sm leading-5 text-destructive">
              {getMessageFromError(draw.error)}
            </p>
          ) : (
            <output className="flex items-center gap-2 text-sm leading-5 text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {m.quizDrawing()}
            </output>
          )}
        </RecordSection>
      ) : quiz.open && quiz.timing?.pausedAt && quiz.timing.endsAt ? (
        <RecordSection
          variant="page"
          title={m.quizAttemptTitle({ number: formatNumber(quiz.attempt) })}
        >
          <div className="grid justify-items-start gap-4">
            <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium">
              <Coffee aria-hidden className="size-4" />
              {m.quizOnBreak()}
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              {m.quizOnBreakBody({
                time: formatClock(
                  Date.parse(quiz.timing.endsAt) -
                    Date.parse(quiz.timing.pausedAt),
                ),
              })}
            </p>
            {rest.error ? (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {getMessageFromError(rest.error)}
              </p>
            ) : null}
            <Button
              type="button"
              className="max-md:h-10"
              disabled={rest.isPending}
              onClick={() => rest.mutate("resume")}
            >
              <Timer aria-hidden />
              {m.quizResume()}
            </Button>
          </div>
        </RecordSection>
      ) : quiz.open ? (
        <RecordSection
          variant="page"
          title={m.quizAttemptTitle({ number: formatNumber(quiz.attempt) })}
          description={
            left === null
              ? m.quizAttemptsHintUnlimited()
              : m.quizAttemptsHint({ count: left })
          }
        >
          <div className="grid gap-4">
            {quiz.timing?.endsAt ? (
              <QuizClock
                endsAt={quiz.timing.endsAt}
                onTimeUp={() => {
                  if (timeUp.isIdle) timeUp.mutate();
                }}
                action={
                  quiz.restBreaks ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-background shadow-sm max-md:h-10"
                      disabled={rest.isPending}
                      onClick={() => rest.mutate("pause")}
                    >
                      <Coffee aria-hidden />
                      {m.quizTakeBreak()}
                    </Button>
                  ) : null
                }
              />
            ) : null}
            {rest.error ? (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {getMessageFromError(rest.error)}
              </p>
            ) : null}
            <CheckModeContext.Provider value="quiz">
              <CheckLanguage.Provider value={readingIn ?? null}>
                <QuizBlocks
                  key={quiz.attempt}
                  blocks={asked ?? quiz.blocks}
                  views={views}
                  driver={driver}
                  practice={practice}
                />
              </CheckLanguage.Provider>
            </CheckModeContext.Provider>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
              <p className="text-sm leading-5 text-muted-foreground tabular-nums">
                {m.quizAnsweredOf({
                  count: formatNumber(answered),
                  total: formatNumber(questions.length),
                })}
              </p>
              <Button
                type="button"
                className="max-md:h-10"
                disabled={answered === 0}
                onClick={() => setConfirming(true)}
              >
                <CheckCircle2 aria-hidden />
                {m.quizHandIn()}
              </Button>
            </div>
          </div>
          <SheetForm
            open={confirming}
            onOpenChange={setConfirming}
            title={m.courseworkHandInTitle({ title: data.assignment.title })}
            submitLabel={m.quizHandIn()}
            pending={handIn.isPending}
            error={handIn.error ? getMessageFromError(handIn.error) : null}
            onSubmit={async () => {
              await handIn.mutateAsync().then(
                async () => {
                  await queryClient.invalidateQueries({
                    queryKey: ["coursework"],
                  });
                  setConfirming(false);
                  toast.success(m.courseworkHandedInDone());
                },
                () => undefined,
              );
            }}
          >
            <p className="text-sm leading-5 text-muted-foreground">
              {answered < questions.length
                ? m.quizUnanswered({ count: questions.length - answered })
                : m.quizHandInBody()}
            </p>
          </SheetForm>
        </RecordSection>
      ) : quiz.results.length === 0 ? (
        <RecordSection variant="page" title={m.courseworkYourWork()}>
          <RecordEmpty>{m.quizClosed()}</RecordEmpty>
        </RecordSection>
      ) : null}
    </ReaderContext.Provider>
  );
}

function MarkForm({
  attemptId,
  blockId,
  points,
  view,
  onMarked,
}: {
  attemptId: string;
  blockId: string;
  points: number;
  view: CheckView | undefined;
  onMarked: () => Promise<unknown>;
}) {
  const [value, setValue] = useState(
    view?.credit === null || view?.credit === undefined
      ? ""
      : String(view.credit),
  );
  const [feedback, setFeedback] = useState(view?.markFeedback ?? "");
  const mark = useMutation({
    mutationFn: () =>
      markQuizAnswer({
        data: {
          attemptIds: [attemptId],
          blockId,
          points: Number(value),
          feedback: feedback.trim(),
        },
      }),
    onSuccess: async () => {
      await onMarked();
      toast.success(m.lrnMarkSaved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const valid = value !== "" && Number(value) >= 0 && Number(value) <= points;
  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) mark.mutate();
      }}
    >
      <FormField
        id={`mark-${attemptId}-${blockId}-points`}
        label={m.lrnPointsOutOf({ total: formatNumber(points) })}
      >
        {(control) => (
          <Input
            {...control}
            type="number"
            inputMode="decimal"
            min={0}
            max={points}
            step="any"
            className="w-24 max-md:h-10"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`mark-${attemptId}-${blockId}-feedback`}
        label={m.lrnFeedbackLabel()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={2000}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={!valid || mark.isPending}
        >
          {view?.marked ? m.lrnChangeMark() : m.lrnSaveMark()}
        </Button>
      </div>
    </form>
  );
}

interface GraderQuiz {
  total: number;
  attempts: {
    attemptId: string;
    number: number;
    /** The questions the attempt asked, its draws from the bank among them. */
    blocks: StudentBlock[];
    score: number;
    checks: Record<string, CheckView>;
    rest: { breaks: number; seconds: number } | null;
  }[];
}

/** A student's quiz attempts as their teacher marks them: every answer marked, written ones waiting for points. */
export function QuizAttempts({
  quiz,
  onMarked,
}: {
  quiz: GraderQuiz;
  onMarked: () => Promise<unknown>;
}) {
  const [shown, setShown] = useState(quiz.attempts.at(-1)?.number ?? 0);
  const attempt = quiz.attempts.find((item) => item.number === shown);
  if (!attempt)
    return <RecordEmpty>{m.courseworkNothingHandedIn()}</RecordEmpty>;
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-5 font-medium tabular-nums">
        {m.quizScoreOf({
          score: formatNumber(attempt.score),
          total: formatNumber(quiz.total),
        })}
      </p>
      {attempt.rest ? (
        <p className="inline-flex items-center gap-2 text-sm leading-5 text-muted-foreground">
          <Coffee aria-hidden className="size-4" />
          {m.quizRestBreaks({
            count: attempt.rest.breaks,
            value: formatNumber(attempt.rest.breaks),
            time: formatMinutes(
              Math.max(1, Math.ceil(attempt.rest.seconds / 60)),
            ),
          })}
        </p>
      ) : null}
      {quiz.attempts.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {quiz.attempts.map((item) => (
            <li key={item.number}>
              <Button
                type="button"
                variant={item.number === shown ? "default" : "outline"}
                size="sm"
                className="max-md:h-10"
                aria-pressed={item.number === shown}
                onClick={() => setShown(item.number)}
              >
                {m.courseworkAttemptNumber({ number: item.number })}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <CheckModeContext.Provider value="review">
        <ReviewerContext.Provider value="teacher">
          <WholeDocument parts={attempt.blocks}>
            {attempt.blocks.map((block) => {
              if (block.type === "content")
                return (
                  <ContentView
                    key={block.id}
                    document={block.content}
                    fileUrl={fileUrl}
                  />
                );
              if (!isCheckBlock(block)) return null;
              const view = attempt.checks[block.id];
              return (
                <div
                  key={`${attempt.number}-${block.id}`}
                  className="grid gap-2"
                >
                  <CheckBlockView
                    block={block}
                    view={view}
                    driver={NO_ANSWERS}
                  />
                  {(block.type === "written" ||
                    block.type === "scratch" ||
                    block.type === "project") &&
                  block.points > 0 &&
                  view?.tries ? (
                    <MarkForm
                      attemptId={attempt.attemptId}
                      blockId={block.id}
                      points={block.points}
                      view={view}
                      onMarked={onMarked}
                    />
                  ) : null}
                </div>
              );
            })}
          </WholeDocument>
        </ReviewerContext.Provider>
      </CheckModeContext.Provider>
    </div>
  );
}
