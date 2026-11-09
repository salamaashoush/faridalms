import type { GridColumn } from "@faridalms/ui/system/data-grid";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";

import { cn } from "@faridalms/ui/cn";
import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  DataGrid,
  GridFigure,
  NumberCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { sidePanelRoom } from "@faridalms/ui/system/side-panel";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarRange,
  Calculator,
  EyeOff,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { classChoices, defaultClass } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { NotSaved, SaveIndicator } from "~/components/system/DocumentPage";
import { inLocale } from "~/hooks/useCurrentUser";
import { useMedia } from "~/hooks/useMedia";
import * as m from "~/i18n/messages";
import { classBookQuery } from "~/queries/gradebook";
import { getMessageFromError } from "~/utils/error";

import type { Book, Student } from "./book";
import type { TermGrades } from "./useTermGrades";

import {
  calculatedScore,
  calculatedText,
  isUnreleased,
  termCellId,
} from "./book";
import {
  gradebookMarks,
  NothingYet,
  ResultMark,
  ToolHeader,
  ToolMark,
  WorkHeader,
} from "./marks";
import { StudentPanel } from "./StudentPanel";
import { useTermGrades } from "./useTermGrades";

const MARK = "size-3.5 shrink-0 text-muted-foreground";

const studentButtonId = (studentId: string) => `student-${studentId}`;
const studentCardId = (studentId: string) => `student-card-${studentId}`;

interface UnreleasedMarkProps {
  shown: boolean;
}

function UnreleasedMark({ shown }: UnreleasedMarkProps) {
  if (!shown) return null;
  return (
    <>
      <EyeOff className={MARK} aria-hidden />
      <span className="sr-only">{m.gradebookHidden()}</span>
    </>
  );
}

interface GridOptions {
  book: Book;
  grades: TermGrades;
  editable: boolean;
  onOpen: (studentId: string) => void;
}

// Built per render: headers read the request's locale.
function gradebookGrid({ book, grades, editable, onOpen }: GridOptions) {
  const rowHeader = {
    header: m.courseworkStudent(),
    cell: (student: Student) => (
      <span className="block max-w-56 min-w-32">
        <CellWithNote note={grades.rowOf(student.id).comment.trim() || null}>
          <button
            id={studentButtonId(student.id)}
            type="button"
            dir="auto"
            onClick={() => onOpen(student.id)}
            className="max-w-full truncate rounded-sm text-start outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {displayName(student)}
          </button>
        </CellWithNote>
      </span>
    ),
  };
  const columns: GridColumn<Student>[] = [
    {
      id: "calculated",
      header: m.gradebookCalculated(),
      numeric: true,
      cell: (student) =>
        calculatedText(book, student.id) ?? (
          <NothingYet label={m.gradebookNoGradedWork()} />
        ),
    },
    {
      id: "term",
      header: m.gradebookTermGrade(),
      numeric: true,
      cell: (student) => {
        const score = grades.rowOf(student.id).score;
        const calculated = calculatedScore(book, student.id);
        return (
          <span className="inline-flex items-center justify-end gap-1.5">
            <UnreleasedMark shown={isUnreleased(book, student.id)} />
            {editable ? (
              <NumberCell
                id={termCellId(student.id)}
                label={m.gradebookTermGradeFor({ name: displayName(student) })}
                decimals={2}
                value={score}
                // A typed grade is marked where it differs from the work's.
                baseline={
                  score === null || calculated === null ? undefined : calculated
                }
                onChange={(next) => grades.setRow(student.id, { score: next })}
              />
            ) : (
              <GridFigure value={score} />
            )}
          </span>
        );
      },
    },
    ...book.assignments.map((work): GridColumn<Student> => ({
      id: `work-${work.id}`,
      header: <WorkHeader work={work} />,
      numeric: true,
      cell: (student) => (
        <ResultMark book={book} work={work} student={student} />
      ),
    })),
    ...book.tools.map((column): GridColumn<Student> => ({
      id: `tool-${column.id}`,
      header: <ToolHeader column={column} />,
      numeric: true,
      cell: (student) => (
        <ToolMark book={book} column={column} studentId={student.id} />
      ),
    })),
  ];
  return { rowHeader, columns };
}

interface PhoneListProps {
  book: Book;
  grades: TermGrades;
  onOpen: (studentId: string) => void;
}

/** Below 768px each student is a row that opens their term in the panel. */
function PhoneList({ book, grades, onOpen }: PhoneListProps) {
  return (
    <ul
      aria-label={m.gradebookCaption()}
      className="divide-y overflow-hidden rounded-lg border bg-card md:hidden"
    >
      {book.students.map((student) => {
        const score = grades.rowOf(student.id).score;
        const calculated = calculatedText(book, student.id);
        return (
          <li key={student.id}>
            <button
              id={studentCardId(student.id)}
              type="button"
              onClick={() => onOpen(student.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <bdi className="truncate text-sm leading-5 font-medium">
                  {displayName(student)}
                </bdi>
                <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                  {calculated
                    ? m.gradebookCalculatedLine({ value: calculated })
                    : m.gradebookNoGradedWork()}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
                <UnreleasedMark shown={isUnreleased(book, student.id)} />
                <span className="sr-only">{m.gradebookTermGrade()}</span>
                <GridFigure value={score} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface SaveStateProps {
  grades: TermGrades;
}

function SaveState({ grades }: SaveStateProps) {
  if (grades.issues.length) return <NotSaved reason={m.gradebookNotSaved()} />;
  return (
    <SaveIndicator
      state={grades.autosave.state}
      onRetry={() => void grades.autosave.retry()}
    />
  );
}

interface SheetProps {
  book: Book;
  toolbar: IndexToolbarProps;
  studentId: string | undefined;
  onStudent: (studentId: string | undefined) => void;
}

/**
 * The class's term, editable in place: the header says whether what was
 * typed is saved and offers Release when grades wait for it, and the grid
 * and the student panel edit the same term grades and comments.
 */
function Sheet({ book, toolbar, studentId, onStudent }: SheetProps) {
  const editable = !book.closed;
  const grades = useTermGrades(book, editable);
  const docked = useMedia("(min-width: 64rem)");
  const phone = !useMedia("(min-width: 48rem)");
  const focusLater = useFocusAfterRender();
  // Closing the panel hands focus back to the name that opened it.
  const goTo = (next: string | undefined) => {
    if (!next && studentId)
      focusLater(phone ? studentCardId(studentId) : studentButtonId(studentId));
    onStudent(next);
  };
  const [releasing, setReleasing] = useState(false);
  const [releasePending, setReleasePending] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const unreleased = book.students.filter((student) =>
    isUnreleased(book, student.id),
  ).length;
  const anyCalculated = book.students.some(
    (student) => calculatedScore(book, student.id) !== null,
  );
  const panelOpen = Boolean(
    studentId && book.students.some((row) => row.id === studentId),
  );
  return (
    <div className={cn(panelOpen && docked && sidePanelRoom)}>
      <Page width="list">
        <PageHeader
          title={m.gradebookTitle()}
          description={editable ? m.gradebookHint() : m.gradebookClosedHint()}
          status={editable ? <SaveState grades={grades} /> : undefined}
          action={
            editable && unreleased > 0
              ? {
                  label: m.gradebookRelease(),
                  icon: Send,
                  onClick: () => {
                    setReleaseError(null);
                    setReleasing(true);
                  },
                }
              : undefined
          }
          menu={
            editable && anyCalculated
              ? [
                  {
                    label: m.gradebookUseCalculated(),
                    icon: Calculator,
                    onSelect: grades.applyCalculated,
                    confirm: {
                      title: m.gradebookUseCalculatedTitle(),
                      body: m.gradebookUseCalculatedBody(),
                      label: m.gradebookUseCalculated(),
                    },
                  },
                ]
              : []
          }
        />
        <div className="grid gap-4">
          <IndexToolbar {...toolbar} />
          <div className="max-md:hidden">
            <DataGrid<Student>
              caption={m.gradebookCaption()}
              editing={editable}
              frame="table"
              fit="content"
              baselineName={m.gradebookCalculatedGrade()}
              {...gradebookGrid({ book, grades, editable, onOpen: goTo })}
              groups={[{ id: "students", title: "", rows: book.students }]}
              rowKey={(student) => student.id}
              issues={grades.issues}
              legend={{
                marks: gradebookMarks(book, {
                  overridden: book.students.some((student) => {
                    const score = grades.rowOf(student.id).score;
                    const calculated = calculatedScore(book, student.id);
                    return (
                      score !== null &&
                      calculated !== null &&
                      score !== calculated
                    );
                  }),
                  hidden: unreleased > 0,
                }),
                empty: m.gradebookNothingYetLegend(),
              }}
            />
          </div>
          <PhoneList book={book} grades={grades} onOpen={goTo} />
          {grades.autosave.failure ? (
            <p className="text-[13px] leading-[18px] text-destructive">
              {getMessageFromError(grades.autosave.failure)}
            </p>
          ) : null}
        </div>
      </Page>
      {panelOpen && studentId ? (
        <StudentPanel
          book={book}
          grades={grades}
          studentId={studentId}
          editable={editable}
          docked={docked}
          phone={phone}
          onGo={goTo}
        />
      ) : null}
      <UnsavedChangesGuard
        isDirty={grades.unsaved}
        pending={grades.autosave.state === "saving"}
      />
      <ConfirmDialog
        open={releasing}
        title={m.gradebookReleaseTitle({ count: unreleased })}
        body={m.gradebookReleaseBody()}
        confirmLabel={m.gradebookRelease()}
        destructive={false}
        pending={releasePending}
        error={releaseError ?? undefined}
        onCancel={() => setReleasing(false)}
        onConfirm={async () => {
          setReleasePending(true);
          setReleaseError(null);
          try {
            const count = await grades.releaseAll();
            setReleasing(false);
            toast.success(m.gradebookReleased({ count }));
          } catch (failure) {
            setReleaseError(getMessageFromError(failure));
          } finally {
            setReleasePending(false);
          }
        }}
      />
    </div>
  );
}

export interface GradebookScope {
  classId?: string;
  periodId?: string;
  student?: string;
}

export interface GradebookProps {
  classId: string;
  periodId: string;
  studentId: string | undefined;
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    classType: string;
    mine: boolean;
  }[];
  onScope: (change: GradebookScope) => void;
}

/** A class's gradebook for a term, chosen in the toolbar. */
export function Gradebook({
  classId,
  periodId,
  studentId,
  classes,
  onScope,
}: GradebookProps) {
  const book = useSuspenseQuery(classBookQuery(classId, periodId)).data;
  const fallback = defaultClass(classes)?.id;
  const facets: Facet[] = [
    {
      id: "class",
      label: m.studentClass(),
      single: true,
      options: classChoices(classes),
      selected: [classId],
      defaultSelected: fallback ? [fallback] : [],
      onChange: ([next]) =>
        onScope({ classId: next, periodId: undefined, student: undefined }),
    },
    ...(book.terms.length
      ? [
          {
            id: "term",
            label: m.courseworkTerm(),
            single: true,
            options: book.terms.map((row) => ({
              value: row.id,
              label: inLocale(row.titleEn, row.titleAr),
            })),
            selected: book.periodId ? [book.periodId] : [],
            defaultSelected: book.currentPeriodId ? [book.currentPeriodId] : [],
            onChange: ([next]: string[]) =>
              onScope({ periodId: next, student: undefined }),
          },
        ]
      : []),
  ];
  const toolbar: IndexToolbarProps = {
    facets,
    onReset: () =>
      onScope({ classId: undefined, periodId: undefined, student: undefined }),
  };
  if (!book.periodId || book.students.length === 0)
    return (
      <Page width="list">
        <PageHeader
          title={m.gradebookTitle()}
          description={m.gradebookHint()}
        />
        <div className="grid gap-4">
          <IndexToolbar {...toolbar} />
          {book.periodId ? (
            <EmptyState icon={BookOpen} title={m.gradebookNoStudents()} />
          ) : (
            <EmptyState
              icon={CalendarRange}
              title={m.gradebookNoTerms()}
              description={m.gradebookNoTermsBody()}
            />
          )}
        </div>
      </Page>
    );
  return (
    <Sheet
      key={`${classId}-${book.periodId}`}
      book={book}
      toolbar={toolbar}
      studentId={studentId}
      onStudent={(student) => onScope({ student })}
    />
  );
}
