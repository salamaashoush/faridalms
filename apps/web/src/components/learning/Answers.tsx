import type { FluencyMark } from "@faridalms/domain/learning";
import type { GoalLevel } from "@faridalms/domain/standards";

import { StoredImage } from "@faridalms/editor/files";
import { TextWithMath } from "@faridalms/editor/math";
import { MediaPlayer } from "@faridalms/editor/media-view";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, MessageSquareText, Pencil } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { CodingStudio } from "~/components/coding/CodingStudio";
import { ProjectAnswer } from "~/components/coding/ProjectAnswer";
import { ProjectChecks, ProjectNotes } from "~/components/coding/ProjectChecks";
import { ProjectStudio } from "~/components/coding/ProjectStudio";
import { WebProjectView } from "~/components/coding/WebProjectView";
import { displayName } from "~/components/people/format";
import { GOAL_LEVEL, goalName } from "~/components/standards/Goals";
import { FormField } from "~/components/system/field";
import { EmptyState } from "~/components/system/IndexPage";
import { Segmented } from "~/components/system/panel";
import { StatusBadge } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { writtenAnswersQuery } from "~/queries/learning";
import { decideGalleryOffer, markAnswer } from "~/server/learning";
import { judgeGoal } from "~/server/standards";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { FluencyMarker, FluencySummary } from "./Fluency";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof writtenAnswersQuery>["queryFn"]>>
>;
export type BoardQuestion = Data["questions"][number];
/** An answer; one to a quiz names the attempt it was handed in with. */
export type BoardAnswer = Data["answers"][number] & {
  attemptId?: string;
  attempt?: number;
};
/** Gives answers to one question the same mark: one answer, or several chosen. */
export type Marker = (
  question: BoardQuestion,
  answers: readonly BoardAnswer[],
  points: number,
  feedback: string,
  /** How one student read a passage aloud. */
  fluency?: FluencyMark,
) => Promise<unknown>;

/**
 * The goals a young class's teacher judges its children against, from the
 * answers to questions tagged with them.
 */
export interface AnswerGoals {
  standards: readonly { id: string; code: string; statement: string }[];
  levelOf: (studentId: string, standardId: string) => GoalLevel | null;
  judge: (
    question: BoardQuestion,
    answer: BoardAnswer,
    standardId: string,
    level: GoalLevel | null,
  ) => Promise<unknown>;
}

const LEVEL_CHOICES = ["none", "emerging", "expected"] as const;
type LevelChoice = (typeof LEVEL_CHOICES)[number];

function GoalJudge({
  goal,
  level,
  name,
  onJudge,
}: {
  goal: AnswerGoals["standards"][number];
  level: GoalLevel | null;
  name: string;
  onJudge: (level: GoalLevel | null) => Promise<unknown>;
}) {
  const save = useMutation({
    mutationFn: onJudge,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const shown = save.isPending ? save.variables : level;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <span dir="auto" className="min-w-0 flex-1 basis-48 text-sm leading-5">
        {goalName(goal)}
      </span>
      <Segmented<LevelChoice>
        label={m.goalsLevelOn({ name, goal: goal.statement })}
        value={shown ?? "none"}
        options={LEVEL_CHOICES.map((value) => ({
          value,
          label:
            value === "none" ? m.goalsNotJudged() : GOAL_LEVEL[value].label(),
        }))}
        onChange={(picked) => save.mutate(picked === "none" ? null : picked)}
        className="w-full flex-nowrap sm:w-80"
      />
    </li>
  );
}

/** Where the child stands against the goals the question is tagged with. */
function AnswerGoalJudgements({
  question,
  answer,
  name,
  goals,
}: {
  question: BoardQuestion;
  answer: BoardAnswer;
  name: string;
  goals: AnswerGoals;
}) {
  const tagged = goals.standards.filter((goal) =>
    question.standards.includes(goal.id),
  );
  if (tagged.length === 0) return null;
  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="grid gap-0.5">
        <p className="text-sm leading-5 font-medium">{m.goalsFromAnswer()}</p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.goalsFromAnswerHint()}
        </p>
      </div>
      <ul className="grid gap-2">
        {tagged.map((goal) => (
          <GoalJudge
            key={goal.id}
            goal={goal}
            level={goals.levelOf(answer.studentId, goal.id)}
            name={name}
            onJudge={(level) => goals.judge(question, answer, goal.id, level)}
          />
        ))}
      </ul>
    </div>
  );
}

const answerKey = (answer: BoardAnswer) =>
  answer.attemptId ?? `${answer.studentId}-${answer.try}`;

function MarkForm({
  question,
  answers,
  mark,
  onDone,
}: {
  question: BoardQuestion;
  answers: readonly BoardAnswer[];
  mark: Marker;
  onDone: () => void;
}) {
  const id = useId();
  const graded = question.points > 0;
  // Several chosen start empty: their own marks differ, if they have any.
  const only = answers.length === 1 ? answers[0] : undefined;
  const [points, setPoints] = useState(
    only?.fraction === null || only?.fraction === undefined
      ? ""
      : String(Math.round(only.fraction * question.points * 100) / 100),
  );
  const [feedback, setFeedback] = useState(only?.feedback ?? "");
  // A passage read aloud is marked word by word as the teacher listens.
  const passage = only?.recording ? question.passage : null;
  const [fluency, setFluency] = useState<FluencyMark>(
    () =>
      only?.fluency ?? {
        errors: [],
        lastWord: null,
        seconds: Math.max(1, Math.round(only?.recording?.seconds ?? 60)),
      },
  );
  const value = Number(points);
  const valid = graded
    ? points !== "" && value >= 0 && value <= question.points
    : feedback.trim() !== "";
  const save = useMutation({
    mutationFn: () =>
      mark(
        question,
        answers,
        graded ? value : 0,
        feedback.trim(),
        passage ? fluency : undefined,
      ),
    onSuccess: () => {
      toast.success(
        only
          ? graded
            ? m.lrnMarkSaved()
            : m.lrnFeedbackSent()
          : m.lrnMarksSaved({ count: formatNumber(answers.length) }),
      );
      onDone();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <form
      className="grid gap-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      {passage ? (
        <FluencyMarker passage={passage} mark={fluency} onChange={setFluency} />
      ) : null}
      {graded ? (
        <FormField
          id={`${id}-points`}
          label={m.lrnPointsOutOf({ total: formatNumber(question.points) })}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="decimal"
              min={0}
              max={question.points}
              step="any"
              className="w-24 max-md:h-10"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
          )}
        </FormField>
      ) : null}
      <FormField
        id={`${id}-feedback`}
        label={m.lrnFeedbackLabel()}
        optional={graded}
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
          disabled={!valid || save.isPending}
        >
          {only
            ? graded
              ? m.lrnSaveMark()
              : m.lrnSendFeedback()
            : m.lrnMarkChosen({ count: formatNumber(answers.length) })}
        </Button>
      </div>
    </form>
  );
}

/**
 * A project a student offered to the class gallery, for their teacher to
 * show to the class, keep out, or take down again. A student who has sent
 * a newer project since offered the one before it, which is what the class
 * would see: that one opens from here, so nothing is shown unseen.
 */
function GalleryOffer({ answer, name }: { answer: BoardAnswer; name: string }) {
  const [looking, setLooking] = useState(false);
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (show: boolean) =>
      decideGalleryOffer({
        data: {
          lessonId: answer.lessonId,
          blockId: answer.blockId,
          studentId: answer.studentId,
          show,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["learning", "answers"] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (!answer.share) return null;
  const shown = answer.share === "shown";
  const earlier = answer.share === "declined" ? null : answer.offered;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {earlier ? (
        <p className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
          {m.galleryTeacherEarlier()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => setLooking(true)}
          >
            {m.galleryTeacherSeeOffered()}
          </Button>
        </p>
      ) : null}
      {looking && earlier?.files ? (
        <ProjectStudio
          title={m.galleryTeacherOfferedBy({ name })}
          files={earlier.files}
          unkept
          onClose={() => setLooking(false)}
        />
      ) : looking && earlier?.project ? (
        <CodingStudio
          projectUrl={`/files/${earlier.project.fileId}`}
          mode="editor"
          title={m.galleryTeacherOfferedBy({ name })}
          onClose={() => setLooking(false)}
        />
      ) : null}
      <StatusBadge
        tone={
          shown ? "success" : answer.share === "offered" ? "info" : "neutral"
        }
      >
        {shown
          ? m.galleryTeacherShown()
          : answer.share === "offered"
            ? m.galleryTeacherOffered()
            : m.galleryTeacherDeclined()}
      </StatusBadge>
      {shown ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          {m.galleryShow()}
        </Button>
      )}
      {answer.share === "declined" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          {shown ? m.galleryTakeDown() : m.galleryNotNow()}
        </Button>
      )}
    </div>
  );
}

function AnswerCard({
  question,
  answer,
  name,
  remixOf,
  mark,
  goals,
  chosen,
  onChoose,
}: {
  question: BoardQuestion;
  answer: BoardAnswer;
  name: string;
  /** The classmate whose project the answer was built on, where it was. */
  remixOf: string | null;
  mark: Marker;
  goals?: AnswerGoals;
  chosen: boolean;
  /** Offered while the answer waits, to mark it with others alike. */
  onChoose?: (chosen: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const graded = question.points > 0;
  return (
    <article className="grid gap-3 rounded-lg border bg-card p-4 has-[[data-checked]]:border-primary/50">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {onChoose ? (
            <Checkbox
              checked={chosen}
              onCheckedChange={(checked) => onChoose(checked)}
              aria-label={m.lrnChooseAnswer({ name })}
              className="max-md:size-5"
            />
          ) : null}
          <h4 className="text-sm leading-5 font-semibold">
            <bdi>{name}</bdi>
          </h4>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {formatInstant(answer.sentAt, "medium")}
          </span>
          {answer.attempt && answer.attempt > 1 ? (
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {m.lrnAttemptIs({ number: formatNumber(answer.attempt) })}
            </span>
          ) : null}
        </div>
        {answer.marked ? (
          <StatusBadge tone="success">
            {graded
              ? m.lrnMarkedPoints({
                  points: formatNumber(
                    Math.round((answer.fraction ?? 0) * question.points * 100) /
                      100,
                  ),
                  total: formatNumber(question.points),
                })
              : m.lrnFeedbackGiven()}
          </StatusBadge>
        ) : graded ? (
          <StatusBadge tone="warning">{m.lrnToMark()}</StatusBadge>
        ) : null}
      </header>
      {answer.files ? (
        <div className="grid gap-2">
          {answer.remixOf ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {remixOf
                ? m.galleryRemixOf({ name: remixOf })
                : m.galleryRemixOfSomeone()}
            </p>
          ) : null}
          <WebProjectView files={answer.files} title={name} />
          {question.gallery ? (
            <GalleryOffer answer={answer} name={name} />
          ) : null}
        </div>
      ) : answer.project ? (
        <div className="grid gap-2">
          {answer.remixOf ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {remixOf
                ? m.galleryRemixOf({ name: remixOf })
                : m.galleryRemixOfSomeone()}
            </p>
          ) : null}
          <ProjectAnswer
            project={answer.project.fileId}
            stage={answer.thumbnail?.fileId ?? null}
            name={name}
          />
          <ProjectChecks asked={question.checks} has={answer.has} />
          <ProjectNotes notes={answer.notes} />
          {question.gallery ? (
            <GalleryOffer answer={answer} name={name} />
          ) : null}
        </div>
      ) : answer.recording ? (
        <MediaPlayer
          src={`/files/${answer.recording.fileId}`}
          captions={undefined}
          video={Boolean(answer.recording.video)}
          locale={getLocale()}
          captionsLabel={m.editorCaptions()}
        />
      ) : answer.picture ? (
        <a
          href={`/files/${answer.picture.fileId}`}
          target="_blank"
          rel="noreferrer"
          className="justify-self-start rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <StoredImage
            src={`/files/${answer.picture.fileId}`}
            alt={m.lrnPictureAnswerOf({ name })}
            removed={m.fileRemoved()}
            className="max-h-72 w-auto max-w-full rounded-lg border bg-white object-contain"
          />
        </a>
      ) : (
        <p dir="auto" className="text-sm leading-6 whitespace-pre-wrap">
          {answer.text}
        </p>
      )}
      {answer.marked && !editing ? (
        <div className="grid gap-2 border-t pt-3">
          {question.passage && answer.fluency ? (
            <FluencySummary passage={question.passage} mark={answer.fluency} />
          ) : null}
          {answer.feedback ? (
            <p
              dir="auto"
              className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground"
            >
              {answer.feedback}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-10"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
              {graded ? m.lrnChangeMark() : m.lrnChangeFeedback()}
            </Button>
          </div>
        </div>
      ) : chosen ? null : (
        <MarkForm
          question={question}
          answers={[answer]}
          mark={mark}
          onDone={() => setEditing(false)}
        />
      )}
      {goals ? (
        <AnswerGoalJudgements
          question={question}
          answer={answer}
          name={name}
          goals={goals}
        />
      ) : null}
    </article>
  );
}

/** One question's answers, those waiting first, any of which the teacher may choose to mark alike. */
function QuestionAnswers({
  question,
  answers,
  names,
  total,
  mark,
  goals,
}: {
  question: BoardQuestion;
  answers: readonly BoardAnswer[];
  names: ReadonlyMap<string, string>;
  total: number;
  mark: Marker;
  goals?: AnswerGoals;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const ordered = answers.toSorted(
    (a, b) => Number(a.marked) - Number(b.marked),
  );
  const waiting = ordered.filter((answer) => !answer.marked);
  const picked = waiting.filter((answer) => chosen.has(answerKey(answer)));
  const choose = (answer: BoardAnswer, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(answerKey(answer));
      else next.delete(answerKey(answer));
      return next;
    });
  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1">
          {question.lessonTitle ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              <bdi>{question.lessonTitle}</bdi>
            </p>
          ) : null}
          <h3 dir="auto" className="text-base leading-6 font-semibold">
            <TextWithMath text={question.prompt} />
          </h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {[
              question.points > 0
                ? m.lrnPoints({ count: question.points })
                : m.lrnPractice(),
              m.lrnAnswersCount({
                count: formatNumber(answers.length),
                total: formatNumber(total),
              }),
              ...(question.points > 0 && waiting.length > 0
                ? [m.lrnWaitingCount({ count: formatNumber(waiting.length) })]
                : []),
            ].join(" · ")}
          </p>
        </div>
        {waiting.length > 1 && picked.length < waiting.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => setChosen(new Set(waiting.map(answerKey)))}
          >
            <ListChecks aria-hidden />
            {m.lrnChooseWaiting()}
          </Button>
        ) : null}
      </header>
      {picked.length > 0 ? (
        <fieldset
          aria-label={m.lrnChosenCount({ count: formatNumber(picked.length) })}
          className="m-0 grid min-w-0 gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm leading-5 font-medium">
              {m.lrnChosenCount({ count: formatNumber(picked.length) })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-10"
              onClick={() => setChosen(new Set())}
            >
              {m.lrnClearChosen()}
            </Button>
          </div>
          <MarkForm
            key={picked.map(answerKey).join()}
            question={question}
            answers={picked}
            mark={mark}
            onDone={() => setChosen(new Set())}
          />
        </fieldset>
      ) : null}
      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm leading-5 text-muted-foreground">
          {m.lrnNoAnswersYet()}
        </p>
      ) : (
        ordered.map((answer) => (
          <AnswerCard
            key={answerKey(answer)}
            question={question}
            answer={answer}
            name={names.get(answer.studentId) ?? ""}
            remixOf={
              answer.remixOf ? (names.get(answer.remixOf) ?? null) : null
            }
            mark={mark}
            goals={goals}
            chosen={chosen.has(answerKey(answer))}
            onChoose={
              answer.marked || waiting.length < 2
                ? undefined
                : (on) => choose(answer, on)
            }
          />
        ))
      )}
    </section>
  );
}

/** Answers a teacher marks question by question, words or coding projects. */
export function AnswerBoard({
  students,
  questions,
  answers,
  mark,
  goals,
  empty,
}: {
  students: readonly {
    id: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
  questions: readonly BoardQuestion[];
  answers: readonly BoardAnswer[];
  mark: Marker;
  goals?: AnswerGoals;
  empty: { title: string; description: string };
}) {
  const names = new Map(
    students.map((student) => [student.id, displayName(student)]),
  );
  if (questions.length === 0)
    return (
      <EmptyState
        icon={MessageSquareText}
        title={empty.title}
        description={empty.description}
      />
    );
  return (
    <div className="grid gap-8">
      {questions.map((question) => (
        <QuestionAnswers
          key={question.blockId}
          question={question}
          answers={answers.filter(
            (answer) => answer.blockId === question.blockId,
          )}
          names={names}
          total={students.length}
          mark={mark}
          goals={goals}
        />
      ))}
    </div>
  );
}

/** The answers of one class a teacher marks, words or coding projects, question by question. */
export function Answers({
  moduleId,
  classId,
}: {
  moduleId: string;
  classId: string;
}) {
  const query = useQuery(writtenAnswersQuery(moduleId, classId));
  const queryClient = useQueryClient();
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const judged = query.data.goals
    ? new Map(
        query.data.goals.judgements.map((row) => [
          `${row.studentId}:${row.standardId}`,
          row.level,
        ]),
      )
    : null;
  const goals: AnswerGoals | undefined =
    query.data.goals && judged
      ? {
          standards: query.data.goals.standards,
          levelOf: (studentId, standardId) =>
            judged.get(`${studentId}:${standardId}`) ?? null,
          judge: async (question, answer, standardId, level) => {
            await judgeGoal({
              data: {
                classId,
                studentId: answer.studentId,
                standardId,
                level,
                from: {
                  lessonId: question.lessonId,
                  blockId: question.blockId,
                },
              },
            });
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: writtenAnswersQuery(moduleId, classId).queryKey,
              }),
              queryClient.invalidateQueries({
                queryKey: ["standards", "goals", classId],
              }),
            ]);
          },
        }
      : undefined;
  return (
    <AnswerBoard
      students={query.data.students}
      questions={query.data.questions}
      answers={query.data.answers}
      goals={goals}
      empty={{ title: m.lrnNoWritten(), description: m.lrnNoWrittenBody() }}
      mark={async (question, answers, points, feedback, fluency) => {
        await markAnswer({
          data: {
            lessonId: question.lessonId,
            blockId: question.blockId,
            studentIds: answers.map((answer) => answer.studentId),
            points,
            feedback,
            ...(fluency ? { fluency } : {}),
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
      }}
    />
  );
}
