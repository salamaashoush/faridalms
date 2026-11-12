import type { GridLegendMark } from "@faridalms/ui/system/data-grid";
import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { GridChangedDot } from "@faridalms/ui/system/data-grid";
import { StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";
import { Clock, EyeOff } from "lucide-react";

import { resultText } from "~/components/grading/format";
import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";

import type { Book, Student, Work } from "./book";

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
  ];
  return marks.flatMap(([present, mark]) => (present ? [mark] : []));
}
