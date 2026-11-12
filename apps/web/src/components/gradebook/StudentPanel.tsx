import { Button } from "@faridalms/ui/button";
import { readNumber, writeNumber } from "@faridalms/ui/system/data-grid";
import { FormField, TextField } from "@faridalms/ui/system/form-field";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { SidePanel } from "@faridalms/ui/system/side-panel";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import { Textarea } from "@faridalms/ui/textarea";
import { Calculator, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { Book, Student } from "./book";
import type { TermGrades } from "./useTermGrades";

import { calculatedScore, calculatedText, TERM_MAXIMUM } from "./book";
import { ResultMark } from "./marks";

interface TermGradeFieldProps {
  book: Book;
  student: Student;
  grades: TermGrades;
}

/**
 * The term grade as a form field: typed in either script's digits, refused
 * as typed when it is not a number up to the maximum, and offering the
 * calculated grade where there is one.
 */
function TermGradeField({ book, student, grades }: TermGradeFieldProps) {
  const { formatNumber: writeDigits } = useDesignSystem();
  const value = grades.rowOf(student.id).score;
  const written = value === null ? "" : writeNumber(value, writeDigits);
  const [typed, setTyped] = useState<string | null>(null);
  const calculated = calculatedScore(book, student.id);
  const figure = readNumber(typed ?? written);
  const wrong =
    typed !== null &&
    (Number.isNaN(figure) || (figure !== null && figure > TERM_MAXIMUM));
  const shown = calculatedText(book, student.id);
  return (
    <div className="grid gap-2">
      <TextField
        id={`panel-term-grade-${student.id}`}
        label={m.gradebookTermGrade()}
        hint={
          shown
            ? m.gradebookTermGradeHint({ value: shown })
            : m.gradebookTermGradeOutOf()
        }
        errors={
          wrong
            ? [
                Number.isNaN(figure)
                  ? m.gradebookNumberNeeded()
                  : m.gradebookScoreTooHigh({ name: displayName(student) }),
              ]
            : undefined
        }
        width="score"
        inputMode="decimal"
        autoComplete="off"
        className="tabular-nums"
        value={typed ?? written}
        onChange={(event) => {
          const text = event.target.value;
          setTyped(text);
          const next = readNumber(text);
          if (next === null) grades.setRow(student.id, { score: null });
          else if (!Number.isNaN(next))
            grades.setRow(student.id, {
              score: Math.round(next * 100) / 100,
            });
        }}
        onBlur={() => {
          if (!wrong) setTyped(null);
        }}
      />
      {calculated !== null && calculated !== value ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start max-md:h-10"
          onClick={() => {
            setTyped(null);
            grades.setRow(student.id, { score: calculated });
          }}
        >
          <Calculator aria-hidden />
          {m.gradebookUseCalculatedOne()}
        </Button>
      ) : null}
    </div>
  );
}

export interface StudentPanelProps {
  book: Book;
  grades: TermGrades;
  studentId: string;
  editable: boolean;
  /** The book is a term's, with its grade and comment. */
  termed: boolean;
  docked: boolean;
  phone: boolean;
  onGo: (studentId: string | undefined) => void;
}

/**
 * One student's term at a glance, beside the gradebook or over it (Canvas's
 * grade detail tray, PowerTeacher Pro's score inspector): their term grade
 * and its comment, edited here as in the grid, and their result on each
 * piece of work. On a phone it is the gradebook, one student at a time.
 */
export function StudentPanel({
  book,
  grades,
  studentId,
  editable,
  termed,
  docked,
  phone,
  onGo,
}: StudentPanelProps) {
  // A docked panel sits beside the grid rather than over it, so nothing
  // moves focus into it; opening it from a name takes the keyboard there.
  // Moving to the next student keeps focus on the button that moved it.
  const opened = useRef(studentId);
  useEffect(() => {
    if (!docked) return;
    document.getElementById(`panel-term-grade-${opened.current}`)?.focus();
  }, [docked]);
  const index = book.students.findIndex((row) => row.id === studentId);
  const student = book.students[index];
  if (!student) return null;
  const previous = book.students[index - 1];
  const next = book.students[index + 1];
  const row = grades.rowOf(student.id);
  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onGo(undefined);
      }}
      title={displayName(student)}
      docked={docked}
      phone={phone}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.gradebookStudentOf({
            index: formatNumber(index + 1),
            count: formatNumber(book.students.length),
          })}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.gradebookPrevious()}
            disabled={!previous}
            onClick={() => onGo(previous?.id)}
          >
            <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.gradebookNext()}
            disabled={!next}
            onClick={() => onGo(next?.id)}
          >
            <ChevronRight className="rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </div>
      {editable ? (
        <div key={student.id} className="grid gap-6 pb-3">
          <TermGradeField book={book} student={student} grades={grades} />
          <FormField
            id={`panel-term-comment-${student.id}`}
            label={m.gradebookComment()}
            hint={m.gradebookCommentHint()}
          >
            {(control) => (
              <Textarea
                {...control}
                dir="auto"
                rows={5}
                maxLength={2000}
                value={row.comment}
                onChange={(event) =>
                  grades.setRow(student.id, { comment: event.target.value })
                }
              />
            )}
          </FormField>
        </div>
      ) : (
        <SummaryList
          items={[
            ...(termed
              ? [
                  {
                    id: "term",
                    label: m.gradebookTermGrade(),
                    value: (
                      <Value absent={m.gradebookNoTermGrade()}>
                        {row.score === null ? null : formatNumber(row.score)}
                      </Value>
                    ),
                  },
                ]
              : []),
            {
              id: "calculated",
              label: termed
                ? m.gradebookCalculatedGrade()
                : m.gradebookRunning(),
              value: (
                <Value absent={m.gradebookNoGradedWork()}>
                  {calculatedText(book, student.id)}
                </Value>
              ),
            },
            ...(termed
              ? [
                  {
                    id: "comment",
                    label: m.gradebookComment(),
                    value: (
                      <span dir="auto">
                        <Value absent={m.gradebookNoComment()}>
                          {row.comment}
                        </Value>
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      {book.assignments.length ? (
        <SummaryList
          title={m.gradebookWork()}
          items={book.assignments.map((work) => ({
            id: work.id,
            label: work.title,
            value: <ResultMark book={book} work={work} student={student} />,
          }))}
        />
      ) : null}
    </SidePanel>
  );
}
