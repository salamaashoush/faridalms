import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import * as v from "valibot";

import type { SortDirection } from "~/components/admin/sorting";

import { FilterChips } from "~/components/admin/FilterChips";
import { compareText } from "~/components/admin/format";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { SearchField } from "~/components/admin/SearchField";
import {
  SortableHeader,
  SortDirectionToggle,
} from "~/components/admin/sorting";
import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import * as m from "~/i18n/messages";
import { allStudentsQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

const SORT_KEYS = ["name", "reference", "grade", "class", "homeroom"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const searchSchema = v.object({
  q: v.optional(v.string(), ""),
  sort: v.optional(v.picklist(SORT_KEYS), "name"),
  dir: v.optional(v.picklist(["asc", "desc"] as const), "asc"),
});

export const Route = createFileRoute("/_app/admin/students")({
  validateSearch: (search) => v.parse(searchSchema, search),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(allStudentsQuery);
  },
  component: AdminStudentsPage,
});

interface StudentRow {
  id: string;
  reference: string;
  fullName: string;
  photoUrl: string | null;
  className: string | null;
  grade: string | null;
  homeroomTeacher: string | null;
}

const SORT_VALUE: Record<SortKey, (student: StudentRow) => string | null> = {
  name: (student) => student.fullName,
  reference: (student) => student.reference,
  grade: (student) => student.grade,
  class: (student) => student.className,
  homeroom: (student) => student.homeroomTeacher,
};

const COLUMN_LABEL: Record<SortKey, () => string> = {
  name: m.adminName,
  reference: m.adminReference,
  grade: m.studentGrade,
  class: m.studentClass,
  homeroom: m.adminHomeroom,
};

function matches(student: StudentRow, needle: string): boolean {
  if (needle === "") {
    return true;
  }
  const haystack = [
    student.fullName,
    student.reference,
    student.grade,
    student.className,
    student.homeroomTeacher,
  ]
    .filter((part) => part !== null)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(needle.toLocaleLowerCase());
}

function AdminStudentsPage() {
  const { q, sort, dir } = Route.useSearch();
  const navigate = Route.useNavigate();
  const students = useSuspenseQuery(allStudentsQuery).data;

  const rows = useMemo(() => {
    const read = SORT_VALUE[sort];
    const factor = dir === "asc" ? 1 : -1;
    return students
      .filter((student) => matches(student, q))
      .toSorted((a, b) => {
        const left = read(a);
        const right = read(b);
        // An unrecorded value sorts last in both directions: it is the absence
        // of an answer, not a value that comes before or after every other.
        if (left === null || right === null) {
          return left === right ? 0 : left === null ? 1 : -1;
        }
        return factor * compareText(left, right);
      });
  }, [students, q, sort, dir]);

  const setSearch = (value: string) => {
    void navigate({ search: (prev) => ({ ...prev, q: value }), replace: true });
  };

  const setSort = (column: SortKey) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        sort: column,
        dir: prev.sort === column && prev.dir === "asc" ? "desc" : "asc",
      }),
      replace: true,
    });
  };

  const setDirection = (direction: SortDirection) => {
    void navigate({
      search: (prev) => ({ ...prev, dir: direction }),
      replace: true,
    });
  };

  return (
    <>
      <PageHeader
        title={m.adminStudentsTitle()}
        description={m.adminStudentsSubtitle()}
      />

      <div className="mb-4 flex flex-col gap-3">
        <SearchField
          label={m.adminSearchStudents()}
          placeholder={m.adminSearchStudentsPlaceholder()}
          value={q}
          onChange={setSearch}
        />
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          <FilterChips
            label={m.adminSortLabel()}
            value={sort}
            options={SORT_KEYS.map((key) => ({
              value: key,
              label: COLUMN_LABEL[key](),
            }))}
            onChange={setSort}
          />
          <SortDirectionToggle
            direction={dir}
            onToggle={() => setDirection(dir === "asc" ? "desc" : "asc")}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {m.adminStudentsShown({ count: formatNumber(rows.length) })}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={m.adminNoStudentsTitle()}
          body={m.adminNoStudentsBody()}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((student) => (
              <li
                key={student.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <PersonAvatar
                    name={student.fullName}
                    photoUrl={student.photoUrl}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {student.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.adminReference()}: {student.reference}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.studentGrade()}
                    </dt>
                    <dd>
                      <Value>{student.grade}</Value>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.studentClass()}
                    </dt>
                    <dd>
                      <Value>{student.className}</Value>
                    </dd>
                  </div>
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminHomeroom()}
                    </dt>
                    <dd>
                      <Value>{student.homeroomTeacher}</Value>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-xl border border-border bg-card px-4 pb-4 sm:block">
            <Table>
              <TableCaption>{m.adminStudentsCaption()}</TableCaption>
              <TableHeader>
                <TableRow>
                  {SORT_KEYS.map((key) => (
                    <SortableHeader
                      key={key}
                      column={key}
                      label={COLUMN_LABEL[key]()}
                      active={sort === key}
                      direction={dir}
                      onSort={setSort}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <PersonAvatar
                          name={student.fullName}
                          photoUrl={student.photoUrl}
                        />
                        <span className="font-medium">{student.fullName}</span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {student.reference}
                    </TableCell>
                    <TableCell>
                      <Value>{student.grade}</Value>
                    </TableCell>
                    <TableCell>
                      <Value>{student.className}</Value>
                    </TableCell>
                    <TableCell>
                      <Value>{student.homeroomTeacher}</Value>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
