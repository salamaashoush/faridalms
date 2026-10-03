import { StoredImage } from "@faridalms/editor/files";
import { MediaPlayer } from "@faridalms/editor/media-view";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Pencil } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ProjectAnswer } from "~/components/coding/ProjectAnswer";
import { displayName } from "~/components/people/format";
import { FormField } from "~/components/system/field";
import { EmptyState } from "~/components/system/IndexPage";
import { StatusBadge } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { writtenAnswersQuery } from "~/queries/learning";
import { markAnswer } from "~/server/learning";
import { formatDateTime, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof writtenAnswersQuery>["queryFn"]>>
>;
type Question = Data["questions"][number];
type Answer = Data["answers"][number];

function MarkForm({
  question,
  answer,
  onDone,
}: {
  question: Question;
  answer: Answer;
  onDone: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const graded = question.points > 0;
  const [points, setPoints] = useState(
    answer.fraction === null
      ? ""
      : String(Math.round(answer.fraction * question.points * 100) / 100),
  );
  const [feedback, setFeedback] = useState(answer.feedback ?? "");
  const value = Number(points);
  const valid = graded
    ? points !== "" && value >= 0 && value <= question.points
    : feedback.trim() !== "";
  const save = useMutation({
    mutationFn: () =>
      markAnswer({
        data: {
          lessonId: question.lessonId,
          blockId: question.blockId,
          studentId: answer.studentId,
          points: graded ? value : 0,
          feedback: feedback.trim(),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      toast.success(graded ? m.lrnMarkSaved() : m.lrnFeedbackSent());
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
          {graded ? m.lrnSaveMark() : m.lrnSendFeedback()}
        </Button>
      </div>
    </form>
  );
}

function AnswerCard({
  question,
  answer,
  name,
}: {
  question: Question;
  answer: Answer;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  const graded = question.points > 0;
  return (
    <article className="grid gap-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h4 className="text-sm leading-5 font-semibold">
            <bdi>{name}</bdi>
          </h4>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {formatDateTime(answer.sentAt)}
          </span>
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
      {answer.project ? (
        <ProjectAnswer
          project={answer.project.fileId}
          stage={answer.thumbnail?.fileId ?? null}
          name={name}
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
      ) : (
        <MarkForm
          question={question}
          answer={answer}
          onDone={() => setEditing(false)}
        />
      )}
    </article>
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
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const data = query.data;
  const names = new Map(
    data.students.map((student) => [student.id, displayName(student)]),
  );
  if (data.questions.length === 0)
    return (
      <EmptyState
        icon={MessageSquareText}
        title={m.lrnNoWritten()}
        description={m.lrnNoWrittenBody()}
      />
    );
  return (
    <div className="grid gap-8">
      {data.questions.map((question) => {
        const answers = data.answers
          .filter((answer) => answer.blockId === question.blockId)
          // Unmarked answers first, each group oldest first.
          .toSorted((a, b) => Number(a.marked) - Number(b.marked));
        const waiting = answers.filter((answer) => !answer.marked).length;
        return (
          <section key={question.blockId} className="grid gap-3">
            <header className="grid gap-1">
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                <bdi>{question.lessonTitle}</bdi>
              </p>
              <h3 dir="auto" className="text-base leading-6 font-semibold">
                {question.prompt}
              </h3>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {[
                  question.points > 0
                    ? m.lrnPoints({ count: question.points })
                    : m.lrnPractice(),
                  m.lrnAnswersCount({
                    count: formatNumber(answers.length),
                    total: formatNumber(data.students.length),
                  }),
                  ...(question.points > 0 && waiting > 0
                    ? [m.lrnWaitingCount({ count: formatNumber(waiting) })]
                    : []),
                ].join(" · ")}
              </p>
            </header>
            {answers.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm leading-5 text-muted-foreground">
                {m.lrnNoAnswersYet()}
              </p>
            ) : (
              answers.map((answer) => (
                <AnswerCard
                  key={`${answer.studentId}-${answer.try}`}
                  question={question}
                  answer={answer}
                  name={names.get(answer.studentId) ?? ""}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
