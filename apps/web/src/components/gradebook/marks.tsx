import type { GridLegendMark } from "@faridalms/ui/system/data-grid";
import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { GridChangedDot } from "@faridalms/ui/system/data-grid";
import { StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";
import { Clock, EyeOff, Plug } from "lucide-react";

import { toolGrading, toolWorkHref } from "~/components/content/lti";
import { resultText } from "~/components/grading/format";
import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { Book, Student, ToolColumn, Work } from "./book";

import { resultOf } from "./book";

const MARK = "size-3.5 shrink-0 text-muted-foreground";

const LINK =
  "rounded-sm underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/60";

export interface NothingYetProps {
  label: string;
}

/** A dash for a result that is not there yet, named for a screen reader. */
export function NothingYet({ label }: NothingYetProps) {
  return (
    <span className="text-muted-foreground" title={label}>
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface ResultMarkProps {
  book: Book;
  work: Work;
  student: Student;
}

/**
 * A student's result on a piece of work, as its teacher reads it: the
 * score, marked when it came in late and while the student cannot see it,
 * or in words where there is no score (to grade, missing, excused). Work
 * that was handed in opens where it is graded.
 */
export function ResultMark({ book, work, student }: ResultMarkProps) {
  const result = resultOf(book, work.id, student.id);
  if (!result)
    return (
      <span className="text-muted-foreground">{m.gradebookNotAssigned()}</span>
    );
  if (result.excused)
    return <StatusText tone="neutral">{m.courseworkStateExcused()}</StatusText>;
  const score = result.effectiveScore ?? result.score;
  const grade = (content: ReactNode) =>
    result.handedIn ? (
      <Link
        to="/grading"
        search={{ assignmentId: work.id, studentId: student.id }}
        className={LINK}
      >
        {content}
        <span className="sr-only">
          {" "}
          {m.gradebookGradeWork({
            name: displayName(student),
            work: work.title,
          })}
        </span>
      </Link>
    ) : (
      content
    );
  if (score === null) {
    if (result.handedIn)
      return grade(
        <StatusText tone="warning">{m.gradebookToGrade()}</StatusText>,
      );
    if (result.missing)
      return (
        <StatusText tone="danger">{m.courseworkStateMissing()}</StatusText>
      );
    return <NothingYet label={m.gradebookNothingYet()} />;
  }
  return grade(
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {result.isLate ? <Clock className={MARK} aria-hidden /> : null}
      {result.released ? null : <EyeOff className={MARK} aria-hidden />}
      <span>{resultText(result.grade, score, work.points, "teacher")}</span>
      {result.isLate ? (
        <span className="sr-only">{m.gradebookLate()}</span>
      ) : null}
      {result.released ? null : (
        <span className="sr-only">{m.gradebookHidden()}</span>
      )}
    </span>,
  );
}

export interface ToolMarkProps {
  book: Book;
  column: ToolColumn;
  studentId: string;
}

/**
 * A student's score in an outside tool's column, as the tool last sent it;
 * where the tool can show the work behind it, the score opens it there.
 */
export function ToolMark({ book, column, studentId }: ToolMarkProps) {
  const score = book.toolScores.find(
    (row) => row.lineItemId === column.id && row.studentId === studentId,
  );
  const state = score ? toolGrading(score.gradingProgress) : m.ltiNoScore();
  if (score?.result === null || score?.result === undefined)
    return <NothingYet label={state} />;
  const mark = m.ltiScoreOf({
    score: formatNumber(Math.round(score.result * 100) / 100),
    maximum: formatNumber(column.scoreMaximum),
  });
  const muted = score.gradingProgress !== "FullyGraded";
  return column.reviewable ? (
    <a
      href={toolWorkHref(column.id, studentId)}
      target="_blank"
      rel="noopener"
      title={`${state} · ${m.ltiOpenWork()}`}
      className={cn(LINK, "tabular-nums", muted && "text-muted-foreground")}
    >
      {mark}
    </a>
  ) : (
    <span
      title={state}
      className={cn("tabular-nums", muted && "text-muted-foreground")}
    >
      {mark}
    </span>
  );
}

export interface WorkHeaderProps {
  work: Work;
}

/** A piece of work's column heading: its title, opening it, cut to one line. */
export function WorkHeader({ work }: WorkHeaderProps) {
  return (
    <Link
      to="/assignments/$assignmentId"
      params={{ assignmentId: work.id }}
      search={{ tab: "work" }}
      title={work.title}
      dir="auto"
      className={cn(LINK, "block max-w-40 truncate")}
    >
      {work.title}
    </Link>
  );
}

export interface ToolHeaderProps {
  column: ToolColumn;
}

/** An outside tool's column heading: its label, marked as counting for nothing. */
export function ToolHeader({ column }: ToolHeaderProps) {
  const note = `${column.toolName} · ${m.gradebookToolNotCounted()}`;
  return (
    <span title={note} className="flex max-w-40 items-center gap-1.5">
      <Plug className={MARK} aria-hidden />
      <span dir="auto" className="truncate">
        {column.label}
      </span>
      <span className="sr-only">{note}</span>
    </span>
  );
}

export interface MarksShown {
  overridden: boolean;
  hidden: boolean;
}

/** The marks the gradebook draws now, explained under it. */
export function gradebookMarks(
  book: Book,
  shown: MarksShown,
): GridLegendMark[] {
  const scored = book.results.filter(
    (row) => (row.effectiveScore ?? row.score) !== null && !row.excused,
  );
  const marks: [boolean, GridLegendMark][] = [
    [
      shown.overridden,
      { mark: <GridChangedDot />, label: m.gradebookOverridden() },
    ],
    [
      shown.hidden || scored.some((row) => !row.released),
      { mark: <EyeOff className={MARK} />, label: m.gradebookHidden() },
    ],
    [
      scored.some((row) => row.isLate),
      { mark: <Clock className={MARK} />, label: m.gradebookLate() },
    ],
    [
      book.tools.length > 0,
      { mark: <Plug className={MARK} />, label: m.gradebookFromTool() },
    ],
  ];
  return marks.flatMap(([present, mark]) => (present ? [mark] : []));
}
