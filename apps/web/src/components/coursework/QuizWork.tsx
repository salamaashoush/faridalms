import type {
  CheckView,
  LessonResponse,
  StudentBlock,
} from "@faridalms/domain/learning";

import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { CheckDriver } from "~/components/learning/Checks";

import { ContentView } from "~/components/content/ContentView";
import {
  CheckBlockView,
  CheckModeContext,
  isCheckBlock,
  ReviewerContext,
} from "~/components/learning/Checks";
import { FormField } from "~/components/system/field";
import { RecordEmpty, RecordSection } from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { myWorkQuery } from "~/queries/coursework";
import {
  handInWork,
  markQuizAnswer,
  saveQuizAnswer,
} from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Work = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myWorkQuery>["queryFn"]>>
>;
type LearnerQuiz = NonNullable<Work["quiz"]>;

const fileUrl = (fileId: string) => `/files/${fileId}`;

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
    key: null,
    partKey: null,
    explanation: null,
    marked: false,
    credit: null,
    markFeedback: null,
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
}: {
  blocks: StudentBlock[];
  views: Record<string, CheckView | undefined>;
  driver: CheckDriver;
}) {
  return (
    <div className="grid gap-4">
      {blocks.map((block) =>
        block.type === "content" ? (
          <ContentView
            key={block.id}
            document={block.content}
            fileUrl={fileUrl}
          />
        ) : isCheckBlock(block) ? (
          <CheckBlockView
            key={block.id}
            block={block}
            view={views[block.id]}
            driver={driver}
          />
        ) : null,
      )}
    </div>
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
              ) : null}
              <CheckModeContext.Provider value="review">
                <QuizBlocks
                  key={result.number}
                  blocks={quiz.blocks}
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
 * A quiz as its student takes it: every answer is kept as it is given, and
 * handing in marks the whole attempt. Earlier attempts show what the quiz
 * lets them see.
 */
export function QuizWork({ data }: { data: Work }) {
  const quiz = data.quiz;
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
  };
  const questions = quiz.blocks.filter(isCheckBlock);
  const answered = questions.filter((block) => quiz.drafts[block.id]).length;
  const views = Object.fromEntries(
    questions.map((block) => [block.id, keptView(quiz.drafts[block.id])]),
  );
  const left =
    quiz.attemptsAllowed === null
      ? null
      : quiz.attemptsAllowed - quiz.attemptsUsed;
  return (
    <>
      {quiz.results.length > 0 ? <Results quiz={quiz} /> : null}
      {quiz.open ? (
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
            <CheckModeContext.Provider value="quiz">
              <QuizBlocks
                key={quiz.attempt}
                blocks={quiz.blocks}
                views={views}
                driver={driver}
              />
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
    </>
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
          attemptId,
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
  blocks: StudentBlock[];
  total: number;
  attempts: {
    attemptId: string;
    number: number;
    score: number;
    checks: Record<string, CheckView>;
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
          {quiz.blocks.map((block) => {
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
              <div key={`${attempt.number}-${block.id}`} className="grid gap-2">
                <CheckBlockView block={block} view={view} driver={NO_ANSWERS} />
                {(block.type === "written" || block.type === "scratch") &&
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
        </ReviewerContext.Provider>
      </CheckModeContext.Provider>
    </div>
  );
}
