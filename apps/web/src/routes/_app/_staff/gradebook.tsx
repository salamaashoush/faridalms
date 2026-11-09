import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  DataGrid,
  GridFigure,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Calculator, Save, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { classChoices, defaultClass } from "~/components/classes/format";
import { toolGrading, toolWorkHref } from "~/components/content/lti";
import { gradeWithScore, resultText } from "~/components/grading/format";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { classBookQuery } from "~/queries/gradebook";
import { currentUserQuery } from "~/queries/user";
import { releasePeriodGrades, savePeriodGrades } from "~/server/gradebook";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { requirePage } from "~/utils/page-access";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/_app/_staff/gradebook")({
  validateSearch: v.object({
    classId: v.optional(uuid),
    periodId: v.optional(uuid),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "submissions:grade");
    const options = await context.queryClient.ensureQueryData(
      courseworkOptionsQuery,
    );
    const classId = deps.classId ?? defaultClass(options.classes)?.id;
    if (classId)
      await context.queryClient.ensureQueryData(
        classBookQuery(classId, deps.periodId ?? ""),
      );
  },
  component: GradebookPage,
});

/** Term grades belong to subject classes, so a teacher's first opens first. */
type Book = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classBookQuery>["queryFn"]>>
>;

interface ToolCellProps {
  book: Book;
  column: Book["tools"][number];
  studentId: string;
}

/**
 * A student's score in an outside tool's column, as the tool last sent it;
 * where the tool can show the work behind it, the score opens it there.
 */
function ToolCell({ book, column, studentId }: ToolCellProps) {
  const score = book.toolScores.find(
    (row) => row.lineItemId === column.id && row.studentId === studentId,
  );
  const state = score ? toolGrading(score.gradingProgress) : m.ltiNoScore();
  if (score?.result === null || score?.result === undefined)
    return (
      <span title={state} className="text-muted-foreground">
        <span aria-hidden>–</span>
        <span className="sr-only">{state}</span>
      </span>
    );
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
      className={cn(
        "underline underline-offset-2",
        muted && "text-muted-foreground",
      )}
    >
      {mark}
    </a>
  ) : (
    <span title={state} className={cn(muted && "text-muted-foreground")}>
      {mark}
    </span>
  );
}

interface TermDraft {
  score: number | null;
  comment: string;
}

const termCell = (studentId: string) => `term-grade-${studentId}`;

interface GradebookGridOptions {
  book: Book;
  draft: Record<string, TermDraft>;
  editing: boolean;
  calculatedText: (studentId: string) => string;
  setRow: (studentId: string, change: Partial<TermDraft>) => void;
}

type Student = Book["students"][number];

// Built per render: headers read the request's locale.
function gradebookGrid({
  book,
  draft,
  editing,
  calculatedText,
  setRow,
}: GradebookGridOptions) {
  const rowOf = (student: Student) =>
    draft[student.id] ?? { score: null, comment: "" };
  const resultOf = (assignmentId: string, studentId: string) =>
    book.results.find(
      (row) => row.assignmentId === assignmentId && row.studentId === studentId,
    );
  const rowHeader = {
    header: m.courseworkStudent(),
    cell: (student: Student) => (
      <bdi className="font-medium">{displayName(student)}</bdi>
    ),
  };
  const columns: GridColumn<Student>[] = [
    ...book.assignments.map((work): GridColumn<Student> => ({
      id: `work-${work.id}`,
      header: (
        <span dir="auto" className="line-clamp-2 max-w-40 whitespace-normal">
          {work.title}
        </span>
      ),
      cell: (student) => {
        const result = resultOf(work.id, student.id);
        const score = result?.effectiveScore ?? result?.score ?? null;
        return (
          <span className="whitespace-nowrap tabular-nums">
            {result?.excused ? (
              <span className="text-muted-foreground">
                {m.courseworkStateExcused()}
              </span>
            ) : score === null ? (
              <span className="text-muted-foreground">–</span>
            ) : (
              <span
                className={
                  result?.released ? undefined : "text-muted-foreground italic"
                }
              >
                {resultText(result?.grade, score, work.points, "teacher")}
              </span>
            )}
          </span>
        );
      },
    })),
    ...book.tools.map((column): GridColumn<Student> => ({
      id: `tool-${column.id}`,
      header: (
        <span className="grid max-w-40 whitespace-normal">
          <span dir="auto" className="line-clamp-2">
            {column.label}
          </span>
          <span className="text-[12px] leading-4 font-normal">
            <bdi>{column.toolName}</bdi> · {m.gradebookToolNotCounted()}
          </span>
        </span>
      ),
      cell: (student) => (
        <span className="whitespace-nowrap tabular-nums">
          <ToolCell book={book} column={column} studentId={student.id} />
        </span>
      ),
    })),
    {
      id: "calculated",
      header: m.gradebookCalculated(),
      cell: (student) => (
        <span className="whitespace-nowrap tabular-nums">
          {calculatedText(student.id) || (
            <span className="text-muted-foreground">–</span>
          )}
        </span>
      ),
    },
    {
      id: "term",
      header: m.gradebookTermGrade(),
      numeric: true,
      cell: (student) =>
        editing ? (
          <NumberCell
            id={termCell(student.id)}
            label={m.gradebookTermGradeFor({ name: displayName(student) })}
            decimals={2}
            value={rowOf(student).score}
            onChange={(score) => setRow(student.id, { score })}
          />
        ) : (
          <GridFigure value={rowOf(student).score} />
        ),
    },
    {
      id: "comment",
      header: m.gradebookComment(),
      cell: (student) =>
        editing ? (
          <TextCell
            id={`term-comment-${student.id}`}
            label={m.gradebookCommentFor({ name: displayName(student) })}
            size="note"
            maxLength={2000}
            value={rowOf(student).comment}
            onChange={(comment) => setRow(student.id, { comment })}
          />
        ) : (
          <span dir="auto" className="block max-w-64 whitespace-normal">
            <Value absent={m.gradebookNoComment()}>
              {rowOf(student).comment}
            </Value>
          </span>
        ),
    },
  ];
  return { rowHeader, columns };
}

/** Term grades run out of 100; the server refuses more. */
function termIssues(book: Book, draft: Record<string, TermDraft>): GridIssue[] {
  return book.students.flatMap((student) => {
    const score = draft[student.id]?.score ?? null;
    return score !== null && score > 100
      ? [
          {
            target: termCell(student.id),
            message: m.gradebookScoreTooHigh({ name: displayName(student) }),
          },
        ]
      : [];
  });
}

interface SheetProps {
  book: Book;
}

function Sheet({ book }: SheetProps) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(
    book.students.map((student) => {
      const grade = book.grades.find((row) => row.studentId === student.id);
      return [
        student.id,
        { score: grade?.score ?? null, comment: grade?.comment ?? "" },
      ];
    }),
  );
  const [draft, setDraft] = useState<Record<string, TermDraft>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const focusLater = useFocusAfterRender();
  const periodId = book.periodId;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["gradebook"] });
  const save = useMutation({
    mutationFn: () =>
      savePeriodGrades({
        data: {
          classId: book.class.id,
          periodId: periodId ?? "",
          grades: book.students.map((student) => {
            const row = draft[student.id] ?? { score: null, comment: "" };
            return {
              studentId: student.id,
              score: row.score,
              comment: row.comment,
            };
          }),
        },
      }),
  });
  const release = useMutation({
    mutationFn: () =>
      releasePeriodGrades({
        data: { classId: book.class.id, periodId: periodId ?? "" },
      }),
  });
  const unreleased = book.grades.some(
    (row) => row.score !== null && !row.releasedAt,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const calculatedOf = (studentId: string) =>
    book.calculated.find((row) => row.studentId === studentId);
  const calculatedText = (studentId: string) => {
    const found = calculatedOf(studentId);
    if (!found || found.percent === null) return "";
    const percent = m.gradebookPercent({
      value: formatNumber(Math.round(found.percent * 10) / 10),
    });
    return found.grade ? gradeWithScore(found.grade, percent) : percent;
  };
  // Term grades are kept out of 100, so a calculated percentage is the score.
  const applyCalculated = () =>
    setDraft((current) =>
      Object.fromEntries(
        book.students.map((student) => {
          const row = current[student.id] ?? { score: null, comment: "" };
          const found = calculatedOf(student.id);
          return [
            student.id,
            found && found.percent !== null
              ? { ...row, score: Math.round(found.percent * 10) / 10 }
              : row,
          ];
        }),
      ),
    );
  const anyCalculated = book.calculated.some((row) => row.percent !== null);
  const issues = tried ? termIssues(book, draft) : [];
  return (
    <div className="grid gap-4">
      <DataGrid<Student>
        caption={m.gradebookCaption()}
        editing={!book.closed}
        surface="page"
        fit="content"
        {...gradebookGrid({
          book,
          draft,
          editing: !book.closed,
          calculatedText,
          setRow: (studentId, change) =>
            setDraft((current) => ({
              ...current,
              [studentId]: {
                ...(current[studentId] ?? { score: null, comment: "" }),
                ...change,
              },
            })),
        })}
        groups={[{ id: "students", title: "", rows: book.students }]}
        rowKey={(student) => student.id}
        issues={issues}
      />
      <UnsavedChangesGuard isDirty={() => dirty} pending={save.isPending} />
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      {book.closed ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="max-md:h-10"
            disabled={!dirty || save.isPending}
            onClick={async () => {
              setError(null);
              setTried(true);
              const problems = termIssues(book, draft);
              if (problems[0]) {
                focusLater(problems[0].target);
                return;
              }
              try {
                await save.mutateAsync();
                await refresh();
                toast.success(m.gradebookSaved());
              } catch (failure) {
                setError(getMessageFromError(failure));
              }
            }}
          >
            <Save aria-hidden />
            {m.gradebookSave()}
          </Button>
          {anyCalculated ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={applyCalculated}
            >
              <Calculator aria-hidden />
              {m.gradebookUseCalculated()}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={dirty || !unreleased || release.isPending}
            onClick={async () => {
              try {
                const result = await release.mutateAsync();
                await refresh();
                toast.success(m.gradebookReleased({ count: result.released }));
              } catch (failure) {
                setError(getMessageFromError(failure));
              }
            }}
          >
            <Send aria-hidden />
            {m.gradebookRelease()}
          </Button>
          {unreleased ? (
            <StatusText tone="warning">{m.gradebookUnreleased()}</StatusText>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GradebookPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const classId = search.classId ?? defaultClass(options.classes)?.id;
  if (!classId)
    return (
      <>
        <PageHeader title={m.gradebookTitle()} />
        <EmptyState
          icon={BookOpen}
          title={m.gradebookNoClasses()}
          description={m.gradebookNoClassesBody()}
        />
      </>
    );
  return (
    <Book
      classId={classId}
      periodId={search.periodId ?? ""}
      onChange={(change) => {
        void navigate({ search: (previous) => ({ ...previous, ...change }) });
      }}
      classes={options.classes}
    />
  );
}

interface BookProps {
  classId: string;
  periodId: string;
  onChange: (change: { classId?: string; periodId?: string }) => void;
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    classType: string;
    mine: boolean;
  }[];
}

function Book({ classId, periodId, onChange, classes }: BookProps) {
  const book = useSuspenseQuery(classBookQuery(classId, periodId)).data;
  const classFacet: Facet = {
    id: "class",
    label: m.studentClass(),
    single: true,
    options: classChoices(classes),
    selected: [classId],
    defaultSelected: defaultClass(classes)
      ? [defaultClass(classes)?.id ?? ""]
      : [],
    onChange: ([next]) => onChange({ classId: next, periodId: undefined }),
  };
  const termFacet: Facet = {
    id: "term",
    label: m.courseworkTerm(),
    single: true,
    options: book.terms.map((row) => ({
      value: row.id,
      label: inLocale(row.titleEn, row.titleAr),
    })),
    selected: book.periodId ? [book.periodId] : [],
    onChange: ([next]) => onChange({ periodId: next }),
  };
  return (
    <>
      <PageHeader title={m.gradebookTitle()} description={m.gradebookHint()} />
      <div className="grid gap-4">
        <IndexToolbar facets={[classFacet, termFacet]} />
        {book.students.length === 0 ? (
          <EmptyState icon={BookOpen} title={m.gradebookNoStudents()} />
        ) : (
          <Sheet key={`${classId}-${book.periodId ?? ""}`} book={book} />
        )}
      </div>
    </>
  );
}
