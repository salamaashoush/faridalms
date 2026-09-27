import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Save, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Facet } from "~/components/system/IndexPage";

import { classTitle } from "~/components/classes/format";
import { formatScore } from "~/components/coursework/format";
import { displayName } from "~/components/people/format";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { StatusText } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { classBookQuery } from "~/queries/gradebook";
import { releasePeriodGrades, savePeriodGrades } from "~/server/gradebook";
import { getMessageFromError } from "~/utils/error";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/_app/teach/gradebook")({
  validateSearch: v.object({
    classId: v.optional(uuid),
    periodId: v.optional(uuid),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
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
function defaultClass<T extends { classType: string }>(classes: T[]) {
  return classes.find((row) => row.classType === "scheduled") ?? classes[0];
}

type Book = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classBookQuery>["queryFn"]>>
>;

function Sheet({ book }: { book: Book }) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(
    book.students.map((student) => {
      const grade = book.grades.find((row) => row.studentId === student.id);
      return [
        student.id,
        {
          score:
            grade?.score === null || grade?.score === undefined
              ? ""
              : String(grade.score),
          comment: grade?.comment ?? "",
        },
      ];
    }),
  );
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
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
            const row = draft[student.id] ?? { score: "", comment: "" };
            return {
              studentId: student.id,
              score: row.score === "" ? null : Number(row.score),
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
  const cell = (assignmentId: string, studentId: string) =>
    book.results.find(
      (row) => row.assignmentId === assignmentId && row.studentId === studentId,
    );
  const unreleased = book.grades.some(
    (row) => row.score !== null && !row.releasedAt,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">{m.gradebookCaption()}</caption>
          <thead className="border-b bg-muted/40 text-start text-[13px] text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="sticky start-0 bg-muted/40 px-3 py-2 text-start font-medium"
              >
                {m.courseworkStudent()}
              </th>
              {book.assignments.map((work) => (
                <th
                  key={work.id}
                  scope="col"
                  className="max-w-40 px-3 py-2 text-start font-medium"
                >
                  <span dir="auto" className="line-clamp-2">
                    {work.title}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {m.gradebookTermGrade()}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {m.gradebookComment()}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {book.students.map((student) => {
              const row = draft[student.id] ?? { score: "", comment: "" };
              const name = displayName(student);
              return (
                <tr key={student.id}>
                  <th
                    scope="row"
                    className="sticky start-0 bg-background px-3 py-2 text-start font-medium"
                  >
                    <bdi>{name}</bdi>
                  </th>
                  {book.assignments.map((work) => {
                    const result = cell(work.id, student.id);
                    const score =
                      result?.effectiveScore ?? result?.score ?? null;
                    return (
                      <td key={work.id} className="px-3 py-2 tabular-nums">
                        {result?.excused ? (
                          <span className="text-muted-foreground">
                            {m.courseworkStateExcused()}
                          </span>
                        ) : score === null ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          <span
                            className={
                              result?.released
                                ? undefined
                                : "text-muted-foreground italic"
                            }
                          >
                            {formatScore(score, work.points)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <Input
                      aria-label={m.gradebookTermGradeFor({ name })}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-20 max-md:h-10"
                      disabled={book.closed}
                      value={row.score}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [student.id]: { ...row, score: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={m.gradebookCommentFor({ name })}
                      className="w-64 max-md:h-10"
                      dir="auto"
                      maxLength={2000}
                      disabled={book.closed}
                      value={row.comment}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [student.id]: { ...row, comment: event.target.value },
                        }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

function Book({
  classId,
  periodId,
  onChange,
  classes,
}: {
  classId: string;
  periodId: string;
  onChange: (change: { classId?: string; periodId?: string }) => void;
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    classType: string;
  }[];
}) {
  const book = useSuspenseQuery(classBookQuery(classId, periodId)).data;
  const classFacet: Facet = {
    id: "class",
    label: m.studentClass(),
    single: true,
    options: classes.map((row) => ({ value: row.id, label: classTitle(row) })),
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
