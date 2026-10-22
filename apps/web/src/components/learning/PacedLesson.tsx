import type { CheckStanding } from "@faridalms/domain/learning";

import { TextWithMath } from "@faridalms/editor/math";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  LoaderCircle,
  Pause,
  Play,
  Presentation,
  Square,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { HeaderFact } from "~/components/system/RecordPage";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "~/components/app/dialog";
import { classTitle } from "~/components/classes/format";
import { CheckboxRow } from "~/components/people/fields";
import { displayName } from "~/components/people/format";
import { SelectField } from "~/components/system/field";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { pacedQuery } from "~/queries/learning";
import { endPaced, pace, startPaced } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { QuestionCard, STANDING_LABEL } from "./Questions";

type Paced = Awaited<
  ReturnType<NonNullable<ReturnType<typeof pacedQuery>["queryFn"]>>
>;
type Question = Paced["questions"][number];

const placeOf = (data: Paced) =>
  m.lrnPacedPart({
    number: formatNumber(data.step + 1),
    total: formatNumber(data.parts.length),
  });

const hereOf = (data: Paced) =>
  m.lrnPacedHere({
    count: formatNumber(data.joined.length),
    total: formatNumber(data.students.length),
  });

/** Opens a lesson led live: at once for a module's only class, or for the class chosen. */
export function TeachLiveDialog({
  lesson,
  classes,
  open,
  onClose,
}: {
  lesson: { id: string; title: string };
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  }[];
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const start = useMutation({
    mutationFn: () => startPaced({ data: { lessonId: lesson.id, classId } }),
    onSuccess: ({ id }) =>
      void navigate({ to: "/teach/live/$pacedId", params: { pacedId: id } }),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !start.isPending) onClose();
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <div className="grid gap-2">
          <DialogTitle className="text-base font-semibold">
            {m.lrnTeachLiveTitle({ title: lesson.title })}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {m.lrnTeachLiveBody()}
          </DialogDescription>
        </div>
        {classes.length > 1 ? (
          <SelectField
            id="teach-live-class"
            label={m.lrnPacedClassFact()}
            value={classId}
            options={classes.map((row) => ({
              value: row.id,
              label: classTitle(row),
            }))}
            onChange={setClassId}
          />
        ) : null}
        {start.error ? (
          <p role="alert" className="text-sm leading-5 text-destructive">
            {getMessageFromError(start.error)}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={start.isPending}
            onClick={onClose}
          >
            {m.docCancel()}
          </Button>
          <Button
            type="button"
            className="max-md:h-10"
            disabled={!classId || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : null}
            {m.lrnTeachLiveStart()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function People({
  rows,
  named,
  empty,
}: {
  rows: Paced["students"];
  named: boolean;
  empty: string;
}) {
  if (rows.length === 0) return <RecordEmpty>{empty}</RecordEmpty>;
  if (!named)
    return (
      <p className="text-sm leading-5 tabular-nums">
        {formatNumber(rows.length)}
      </p>
    );
  return (
    <RecordList>
      {rows.map((row) => (
        <li key={row.id} className="py-2 text-sm leading-5">
          <bdi>{displayName(row)}</bdi>
        </li>
      ))}
    </RecordList>
  );
}

/**
 * A lesson the teacher leads live, from their own screen: the parts to take
 * the class through, a pause, how the class answers the open part with
 * names kept here, and who has come into the lesson. The board for the
 * room opens apart and shows the answers without names.
 */
export function PacedLesson({ pacedId }: { pacedId: string }) {
  const query = pacedQuery(pacedId);
  const data = useSuspenseQuery(query).data;
  const queryClient = useQueryClient();
  const [named, setNamed] = useState(true);
  const steer = useMutation({
    mutationFn: (change: {
      step?: number;
      paused?: boolean;
      revealed?: boolean;
    }) => pace({ data: { id: pacedId, ...change } }),
    onSuccess: (next) =>
      queryClient.setQueryData(query.queryKey, (old) =>
        old ? { ...old, ...next } : old,
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const ended = Boolean(data.endedAt);
  const busy = ended || steer.isPending;
  const joined = new Set(data.joined);
  const names = new Map(data.students.map((row) => [row.id, displayName(row)]));
  const last = data.parts.length - 1;
  const facts: HeaderFact[] = [
    {
      label: m.lrnPacedClassFact(),
      value: data.class ? classTitle(data.class) : "",
    },
    { label: m.lrnPacedPartFact(), value: placeOf(data) },
    { label: m.lrnPacedHereFact(), value: hereOf(data) },
  ];
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={data.lesson.title}
        status={
          ended
            ? { label: m.lrnPacedEnded(), tone: "neutral" }
            : data.paused
              ? { label: m.lrnPacedPausedState(), tone: "warning" }
              : { label: m.lrnPacedLive(), tone: "success" }
        }
        facts={facts}
        action={
          ended
            ? undefined
            : {
                label: m.lrnPacedBoard(),
                icon: Presentation,
                onClick: () =>
                  window.open(`/teach/board/${pacedId}`, "_blank", "noopener"),
              }
        }
        menu={
          ended
            ? []
            : [
                {
                  label: m.lrnPacedEnd(),
                  icon: Square,
                  destructive: true,
                  confirm: {
                    title: m.lrnPacedEndTitle(),
                    body: m.lrnPacedEndBody(),
                    label: m.lrnPacedEnd(),
                  },
                  onSelect: async () => {
                    await endPaced({ data: { id: pacedId } });
                    await queryClient.invalidateQueries({
                      queryKey: ["learning"],
                    });
                  },
                },
              ]
        }
      />
      {ended ? (
        <p className="mb-6 rounded-lg bg-muted/50 px-5 py-4 text-sm leading-5 text-muted-foreground">
          {m.lrnPacedEndedNote()}{" "}
          <Link
            to="/modules/$moduleId"
            params={{ moduleId: data.lesson.moduleId }}
            search={{}}
            className={cn(
              "text-primary underline-offset-4 hover:underline",
              phoneLink,
            )}
          >
            {m.lrnPacedBackTo({ title: data.lesson.moduleTitle })}
          </Link>
        </p>
      ) : null}
      <RecordColumns
        main={
          <>
            <RecordSection
              title={placeOf(data)}
              description={
                data.parts.length > 1
                  ? m.lrnPacedPartsHint()
                  : m.lrnPacedOnePart()
              }
            >
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="max-md:h-10"
                    disabled={busy || data.step === 0}
                    onClick={() => steer.mutate({ step: data.step - 1 })}
                  >
                    <ArrowLeft aria-hidden className="rtl:rotate-180" />
                    {m.lrnPacedPrevious()}
                  </Button>
                  <Button
                    type="button"
                    className="max-md:h-10"
                    disabled={busy || data.step >= last}
                    onClick={() => steer.mutate({ step: data.step + 1 })}
                  >
                    {m.lrnPacedNext()}
                    <ArrowRight aria-hidden className="rtl:rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="max-md:h-10"
                    aria-pressed={data.paused}
                    disabled={busy}
                    onClick={() => steer.mutate({ paused: !data.paused })}
                  >
                    {data.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                    {data.paused ? m.lrnPacedResume() : m.lrnPacedPause()}
                  </Button>
                </div>
                {data.parts.length > 1 ? (
                  <ol className="grid gap-1">
                    {data.parts.map((part, index) => (
                      <li key={part.id}>
                        <button
                          type="button"
                          disabled={busy}
                          aria-current={
                            index === data.step ? "step" : undefined
                          }
                          onClick={() => steer.mutate({ step: index })}
                          className="flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-start text-sm leading-5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none aria-[current=step]:bg-primary/10 aria-[current=step]:font-medium max-md:min-h-10"
                        >
                          <span className="w-5 shrink-0 text-end text-muted-foreground tabular-nums">
                            {formatNumber(index + 1)}
                          </span>
                          <span dir="auto" className="min-w-0 flex-1 truncate">
                            {part.label || m.lrnPacedUntitledPart()}
                          </span>
                          {part.questions > 0 ? (
                            <span className="shrink-0 text-[13px] leading-[18px] font-normal text-muted-foreground">
                              {m.lrnQuestionCount({ count: part.questions })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </RecordSection>
            <RecordSection title={m.lrnPacedAnswers()}>
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CheckboxRow
                    label={m.lrnPacedHideNames()}
                    hint={m.lrnPacedHideNamesHint()}
                    checked={!named}
                    onChange={(hide) => setNamed(!hide)}
                  />
                  <CheckboxRow
                    label={m.lrnPacedReveal()}
                    hint={m.lrnPacedRevealHint()}
                    checked={data.revealed}
                    disabled={busy}
                    onChange={(revealed) => steer.mutate({ revealed })}
                  />
                </div>
                {data.questions.length === 0 ? (
                  <RecordEmpty>{m.lrnPacedNoQuestions()}</RecordEmpty>
                ) : (
                  data.questions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      names={names}
                      named={named}
                      asked={{
                        moduleId: data.lesson.moduleId,
                        classId: data.class?.id ?? "",
                        lessonId: data.lesson.id,
                      }}
                    />
                  ))
                )}
              </div>
            </RecordSection>
          </>
        }
        aside={
          <>
            <RecordSection title={m.lrnPacedIn()}>
              <People
                rows={data.students.filter((row) => joined.has(row.id))}
                named={named}
                empty={m.lrnPacedNobody()}
              />
            </RecordSection>
            <RecordSection title={m.lrnPacedNotIn()}>
              <People
                rows={data.students.filter((row) => !joined.has(row.id))}
                named={named}
                empty={m.lrnPacedEveryone()}
              />
            </RecordSection>
          </>
        }
      />
    </div>
  );
}

const BOARD_STANDINGS: readonly CheckStanding[] = [
  "first",
  "later",
  "shown",
  "trying",
  "missed",
];

function BoardQuestion({
  question,
  revealed,
}: {
  question: Question;
  revealed: boolean;
}) {
  const students = Object.keys(question.standings);
  const answered = students.filter(
    (id) => question.standings[id] !== "unseen",
  ).length;
  const chose = students.filter((id) => question.firstChoices[id]).length;
  return (
    <section className="grid gap-5 rounded-xl border p-6">
      <h2 dir="auto" className="text-2xl leading-9 font-semibold">
        <TextWithMath text={question.prompt} />
      </h2>
      {question.options ? (
        <ul className="grid gap-4">
          {question.options.map((option) => {
            const count = students.filter((id) =>
              question.firstChoices[id]?.includes(option.id),
            ).length;
            const right = revealed && option.correct;
            return (
              <li key={option.id} className="grid gap-2">
                <div className="flex items-center gap-3 text-xl leading-8">
                  <span dir="auto" className="min-w-0 flex-1">
                    {option.text}
                  </span>
                  {right ? (
                    <>
                      <CircleCheck
                        aria-hidden
                        className="size-6 shrink-0 text-success"
                      />
                      <span className="sr-only">{m.lrnRightOption()}</span>
                    </>
                  ) : null}
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(count)}
                  </span>
                </div>
                <div aria-hidden className="h-3 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      !revealed || question.kind === "poll"
                        ? "bg-primary"
                        : right
                          ? "bg-success"
                          : "bg-muted-foreground/40",
                    )}
                    style={{ width: `${chose ? (count / chose) * 100 : 0}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : revealed ? (
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-xl leading-8">
          {BOARD_STANDINGS.map((standing) => (
            <li key={standing}>
              {STANDING_LABEL[standing]()}{" "}
              <span className="font-semibold tabular-nums">
                {formatNumber(
                  students.filter((id) => question.standings[id] === standing)
                    .length,
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-lg leading-7 text-muted-foreground tabular-nums">
        {m.lrnPacedAnswered({
          count: formatNumber(answered),
          total: formatNumber(students.length),
        })}
      </p>
    </section>
  );
}

/**
 * The class board for the room's screen: the open part's questions and how
 * the class has answered them, never who; the right answers once the
 * teacher shows them.
 */
export function PacedBoard({ pacedId }: { pacedId: string }) {
  const data = useSuspenseQuery(pacedQuery(pacedId)).data;
  const part = data.parts[data.step];
  return (
    <div className="mx-auto grid w-full max-w-5xl content-start gap-8 px-6 py-10">
      <header className="grid gap-2">
        <p className="text-lg leading-7 text-muted-foreground">
          {placeOf(data)}
          {part?.label ? (
            <>
              {" · "}
              <bdi>{part.label}</bdi>
            </>
          ) : null}
        </p>
        <h1 dir="auto" className="text-4xl leading-tight font-semibold">
          {data.lesson.title}
        </h1>
        {data.endedAt || data.paused ? (
          <output className="text-2xl leading-9 font-medium text-warning">
            {data.endedAt ? m.lrnPacedEndedNote() : m.lrnPacedPaused()}
          </output>
        ) : null}
      </header>
      {data.questions.length === 0 ? (
        <p className="text-2xl leading-9 text-muted-foreground">
          {m.lrnPacedBoardEmpty()}
        </p>
      ) : (
        data.questions.map((question) => (
          <BoardQuestion
            key={question.id}
            question={question}
            revealed={data.revealed}
          />
        ))
      )}
      <p className="text-lg leading-7 text-muted-foreground tabular-nums">
        {hereOf(data)}
      </p>
    </div>
  );
}
