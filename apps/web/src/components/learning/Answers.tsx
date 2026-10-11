import { StoredImage } from "@faridalms/editor/files";
import { MediaPlayer } from "@faridalms/editor/media-view";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Pencil } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { CodingStudio } from "~/components/coding/CodingStudio";
import { ProjectAnswer } from "~/components/coding/ProjectAnswer";
import { ProjectChecks } from "~/components/coding/ProjectChecks";
import { ProjectStudio } from "~/components/coding/ProjectStudio";
import { WebProjectView } from "~/components/coding/WebProjectView";
import { displayName } from "~/components/people/format";
import { FormField } from "~/components/system/field";
import { EmptyState } from "~/components/system/IndexPage";
import { StatusBadge } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { writtenAnswersQuery } from "~/queries/learning";
import { decideGalleryOffer, markAnswer } from "~/server/learning";
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

/**
 * A project a student offered to the class gallery, for their teacher to
 * show to the class, keep out, or take down again. A student who has sent
 * a newer project since offered the one before it, which is what the class
 * would see: that one opens from here, so nothing is shown unseen.
 */
function GalleryOffer({ answer, name }: { answer: Answer; name: string }) {
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
}: {
  question: Question;
  answer: Answer;
  name: string;
  /** The classmate whose project the answer was built on, where it was. */
  remixOf: string | null;
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
                  remixOf={
                    answer.remixOf ? (names.get(answer.remixOf) ?? null) : null
                  }
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
