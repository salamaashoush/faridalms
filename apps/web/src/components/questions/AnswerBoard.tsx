import type { FluencyMark } from "@faridalms/domain/learning";
import type { ScratchFeature } from "@faridalms/domain/scratch-project";
import type { ReactNode } from "react";

import { StoredImage } from "@faridalms/editor/files";
import { TextWithMath } from "@faridalms/editor/math";
import { MediaPlayer } from "@faridalms/editor/media-view";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { FormField } from "@faridalms/ui/system/form-field";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { ListChecks, MessageSquareText, Pencil } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { passageMarks, studioAnswers } from "./slots";

/** A question its teacher marks: answered in words, aloud, as a picture or a project. */
export interface BoardQuestion {
  lessonId: string;
  lessonTitle: string;
  blockId: string;
  kind: "written" | "scratch" | "project";
  prompt: string;
  points: number;
  /** Students may offer their answer to the class gallery. */
  gallery: boolean;
  /** What a coding question asks every project to have. */
  checks: ScratchFeature[];
  standards: string[];
  /** The passage a reading aloud reads, marked word by word. */
  passage: string | null;
}

/** A project of files as a learner handed it in. */
export type BoardFiles = { name: string; code: string }[];

/** An answer; one to a quiz names the attempt it was handed in with. */
export interface BoardAnswer {
  lessonId: string;
  studentId: string;
  blockId: string;
  attempt?: number;
  attemptId?: string;
  try: number;
  text: string;
  recording: { fileId: string; seconds: number; video?: boolean } | null;
  picture: { fileId: string } | null;
  project: { fileId: string } | null;
  thumbnail: { fileId: string } | null;
  files: BoardFiles | null;
  remixOf: string | null;
  has: string[] | null;
  notes: { kind: string; message?: string }[] | null;
  sentAt: string;
  fraction: number | null;
  feedback: string | null;
  fluency: FluencyMark | null;
  marked: boolean;
  /** How the learner's offer to the class gallery stands, if they made one. */
  share: "offered" | "shown" | "declined" | null;
  /** The project the gallery holds where it is not this answer. */
  offered: {
    files: BoardFiles | null;
    project: { fileId: string } | null;
    thumbnail: { fileId: string } | null;
  } | null;
}
/** Gives answers to one question the same mark: one answer, or several chosen. */
export type Marker = (
  question: BoardQuestion,
  answers: readonly BoardAnswer[],
  points: number,
  feedback: string,
  /** How one student read a passage aloud. */
  fluency?: FluencyMark,
) => Promise<unknown>;

/** What a module says about one answer below it, such as the goals the answer showed. */
export type AnswerNote = (
  question: BoardQuestion,
  answer: BoardAnswer,
  name: string,
) => ReactNode;

const answerKey = (answer: BoardAnswer) =>
  answer.attemptId ?? `${answer.studentId}-${answer.try}`;

interface MarkFormProps {
  question: BoardQuestion;
  answers: readonly BoardAnswer[];
  mark: Marker;
  onDone: () => void;
}

function MarkForm({ question, answers, mark, onDone }: MarkFormProps) {
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
  const reading = useSlot(passageMarks)[0];
  const passage = reading && only?.recording ? question.passage : null;
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
      {passage && reading ? (
        <reading.Marker
          passage={passage}
          mark={fluency}
          onChange={setFluency}
        />
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

interface AnswerCardProps {
  question: BoardQuestion;
  answer: BoardAnswer;
  name: string;
  /** The classmate whose project the answer was built on, where it was. */
  remixOf: string | null;
  mark: Marker;
  renderNote?: AnswerNote;
  chosen: boolean;
  /** Offered while the answer waits, to mark it with others alike. */
  onChoose?: (chosen: boolean) => void;
}

function AnswerCard({
  question,
  answer,
  name,
  remixOf,
  mark,
  renderNote,
  chosen,
  onChoose,
}: AnswerCardProps) {
  const [editing, setEditing] = useState(false);
  const studio = useSlot(studioAnswers)[0];
  const reading = useSlot(passageMarks)[0];
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
      {studio?.holds(answer) ? (
        <studio.Marked
          question={question}
          answer={answer}
          name={name}
          remixOf={remixOf}
        />
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
          {reading && question.passage && answer.fluency ? (
            <reading.Summary passage={question.passage} mark={answer.fluency} />
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
      {renderNote?.(question, answer, name)}
    </article>
  );
}

interface QuestionAnswersProps {
  question: BoardQuestion;
  answers: readonly BoardAnswer[];
  names: ReadonlyMap<string, string>;
  total: number;
  mark: Marker;
  renderNote?: AnswerNote;
}

/** One question's answers, those waiting first, any of which the teacher may choose to mark alike. */
function QuestionAnswers({
  question,
  answers,
  names,
  total,
  mark,
  renderNote,
}: QuestionAnswersProps) {
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
        <EmptyState placement="section" title={m.lrnNoAnswersYet()} />
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
            renderNote={renderNote}
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

export interface AnswerBoardProps {
  students: readonly {
    id: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
  questions: readonly BoardQuestion[];
  answers: readonly BoardAnswer[];
  mark: Marker;
  /** What a module says below each answer. */
  renderNote?: AnswerNote;
  empty: { title: string; description: string };
}

/** Answers a teacher marks question by question, words or coding projects. */
export function AnswerBoard({
  students,
  questions,
  answers,
  mark,
  renderNote,
  empty,
}: AnswerBoardProps) {
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
          renderNote={renderNote}
        />
      ))}
    </div>
  );
}
