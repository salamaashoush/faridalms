import type { Rubric } from "@faridalms/domain/coursework";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { RotateCcw, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FileList } from "~/components/system/FileList";
import {
  phoneLink,
  RecordEmpty,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { gradingQuery } from "~/queries/coursework";
import { actOnWork, assessAttempt } from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName } from "../people/format";
import { formatInstant } from "./format";
import { QuizAttempts } from "./QuizWork";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof gradingQuery>["queryFn"]>>
>;

function levelTotal(rubric: Rubric, scores: Record<string, string>) {
  return rubric.criteria.reduce((sum, criterion) => {
    const level = criterion.levels.find(
      (row) => row.id === scores[criterion.id],
    );
    return sum + (level?.points ?? 0);
  }, 0);
}

function Queue({ data }: { data: Data }) {
  return (
    <nav aria-label={m.courseworkQueue()} className="grid content-start gap-1">
      {data.queue.map((row) => (
        <Link
          key={row.studentId}
          to="/teach/grading"
          search={{
            assignmentId: data.assignment.id,
            studentId: row.studentId,
          }}
          aria-current={
            row.studentId === data.student.studentId ? "page" : undefined
          }
          className={cn(
            "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium",
            phoneLink,
          )}
        >
          <bdi className="min-w-0 truncate">{displayName(row)}</bdi>
          {row.needsGrading ? (
            <StatusText tone="warning">{m.courseworkToGradeShort()}</StatusText>
          ) : row.released ? (
            <StatusText tone="accent">{m.courseworkStateReturned()}</StatusText>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function GradeForm({ data, onDone }: { data: Data; onDone: () => void }) {
  const attempt = data.attempts.at(-1);
  const rubric = data.assignment.rubric;
  const saved = attempt?.assessment ?? null;
  const [score, setScore] = useState(
    saved?.score === null || saved?.score === undefined
      ? ""
      : String(saved.score),
  );
  const [levels, setLevels] = useState<Record<string, string>>(
    saved?.rubricScores ?? {},
  );
  const [feedback, setFeedback] = useState(saved?.feedback ?? "");
  const [note, setNote] = useState(saved?.privateNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const assess = useMutation({
    mutationFn: () =>
      assessAttempt({
        data: {
          attemptId: attempt?.id ?? "",
          score: score === "" ? null : Number(score),
          rubricScores: rubric ? levels : null,
          feedback,
          privateNote: note,
        },
      }),
  });
  const act = useMutation({
    mutationFn: (action: "return" | "revise") =>
      actOnWork({
        data: {
          assignmentId: data.assignment.id,
          action,
          studentIds: [data.student.studentId],
        },
      }),
  });
  if (!attempt)
    return <RecordEmpty>{m.courseworkNothingHandedIn()}</RecordEmpty>;
  const points = data.assignment.points;
  const check = () => {
    const value = score === "" ? null : Number(score);
    if (
      value !== null &&
      (Number.isNaN(value) || value < 0 || (points !== null && value > points))
    ) {
      setError(m.courseworkScoreRange({ points: formatNumber(points ?? 0) }));
      return false;
    }
    setError(null);
    return true;
  };
  const run = async (then?: "return" | "revise") => {
    if (!check()) return;
    try {
      await assess.mutateAsync();
      if (then) await act.mutateAsync(then);
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      toast.success(
        then === "return"
          ? m.courseworkReturnedDone()
          : then === "revise"
            ? m.courseworkRevisionDone()
            : m.courseworkGradeSaved(),
      );
      if (then) onDone();
    } catch (failure) {
      toast.error(getMessageFromError(failure));
    }
  };
  return (
    <div className="grid content-start gap-4">
      {rubric
        ? rubric.criteria.map((criterion) => (
            <SelectField
              key={criterion.id}
              id={`level-${criterion.id}`}
              label={criterion.title}
              value={levels[criterion.id] ?? "none"}
              options={[
                { value: "none", label: m.commonNotRecorded() },
                ...criterion.levels.map((level) => ({
                  value: level.id,
                  label: m.courseworkRubricLevel({
                    level: level.title,
                    points: formatNumber(level.points),
                  }),
                })),
              ]}
              onChange={(value) => {
                const next = { ...levels };
                if (value === "none") delete next[criterion.id];
                else next[criterion.id] = value;
                setLevels(next);
                setScore(String(levelTotal(rubric, next)));
              }}
            />
          ))
        : null}
      <TextField
        id="grade-score"
        label={
          points === null
            ? m.courseworkScore()
            : m.courseworkScoreOutOf({ points: formatNumber(points) })
        }
        hint={rubric ? m.courseworkScoreFromRubric() : undefined}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        width="score"
        value={score}
        onChange={(event) => setScore(event.target.value)}
        errors={error ? [error] : undefined}
      />
      <FormField
        id="grade-feedback"
        label={m.courseworkFeedback()}
        hint={m.courseworkFeedbackHint()}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={5}
            maxLength={10000}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id="grade-note"
        label={m.courseworkPrivateNote()}
        hint={m.courseworkPrivateNoteHint()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="max-md:h-10"
          onClick={() => void run("return")}
        >
          <Send aria-hidden />
          {m.courseworkReturnNext()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => void run()}
        >
          <Save aria-hidden />
          {m.courseworkSaveDraftGrade()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => void run("revise")}
        >
          <RotateCcw aria-hidden />
          {m.courseworkReturnRevise()}
        </Button>
      </div>
    </div>
  );
}

/**
 * One student's work beside the grade: the class list to move through, the
 * attempts, and the score, rubric and feedback, which stay drafts until the
 * work is returned. J and K move to the next and previous student.
 */
export function Grading({
  assignmentId,
  studentId,
}: {
  assignmentId: string;
  studentId: string;
}) {
  const data = useSuspenseQuery(gradingQuery(assignmentId, studentId)).data;
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const index = data.queue.findIndex((row) => row.studentId === studentId);
  const go = (offset: number) => {
    const next = data.queue[index + offset];
    if (next)
      void navigate({
        to: "/teach/grading",
        search: { assignmentId, studentId: next.studentId },
      });
  };
  const nextToGrade = () => {
    const later = data.queue.slice(index + 1).find((row) => row.needsGrading);
    const target =
      later ??
      data.queue.find((row) => row.needsGrading && row.studentId !== studentId);
    if (target)
      void navigate({
        to: "/teach/grading",
        search: { assignmentId, studentId: target.studentId },
      });
    else
      void navigate({
        to: "/assignments/$assignmentId",
        params: { assignmentId },
        search: { tab: "work" },
      });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=combobox]",
        )
      )
        return;
      if (event.key === "j") go(1);
      if (event.key === "k") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const attempt = data.attempts.at(-1);
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-2xl leading-8 font-semibold tracking-tight">
          <Link
            to="/assignments/$assignmentId"
            params={{ assignmentId }}
            search={{ tab: "work" }}
            className="hover:underline"
          >
            {data.assignment.title}
          </Link>
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.courseworkGradingPosition({
            position: formatNumber(index + 1),
            total: formatNumber(data.queue.length),
          })}
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <Queue data={data} />
        <RecordSection
          title={displayName(data.student)}
          description={
            attempt
              ? [
                  m.courseworkAttemptNumber({ number: attempt.number }),
                  formatInstant(attempt.submittedAt, user.school.timeZone),
                  attempt.isLate ? m.courseworkLate() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        >
          {data.quiz ? (
            <QuizAttempts
              quiz={data.quiz}
              onMarked={() =>
                queryClient.invalidateQueries({ queryKey: ["coursework"] })
              }
            />
          ) : attempt ? (
            <div className="grid gap-4">
              {attempt.content ? (
                <ContentView
                  document={attempt.content}
                  fileUrl={(id) => `/files/${id}`}
                />
              ) : null}
              <FileList files={attempt.files} />
            </div>
          ) : (
            <RecordEmpty>{m.courseworkNothingHandedIn()}</RecordEmpty>
          )}
        </RecordSection>
        <RecordSection title={m.courseworkGradeTitle()}>
          <GradeForm
            // A marked quiz answer changes the score, so the form starts again from it.
            key={`${studentId}-${attempt?.id ?? ""}-${attempt?.assessment?.score ?? ""}`}
            data={data}
            onDone={nextToGrade}
          />
        </RecordSection>
      </div>
    </div>
  );
}
