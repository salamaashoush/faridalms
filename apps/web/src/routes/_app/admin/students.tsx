import type { StudentDirectoryQuery } from "@faridalms/domain/people";

import { studentDirectorySchema } from "@faridalms/domain/people";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import {
  CalendarX,
  Copy,
  Download,
  Pencil,
  Plus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Column, RowAction } from "~/components/system/DataTable";
import type {
  Facet,
  HeaderAction,
  IndexToolbarProps,
} from "~/components/system/IndexPage";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import {
  displayName,
  formatPhone,
  labelOf,
  otherName,
  STATUS_LABEL,
  STATUS_TONE,
} from "~/components/people/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import {
  EmptyState,
  PageHeader,
  isFiltered,
} from "~/components/system/IndexPage";
import { StatusText } from "~/components/system/status";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery, studentsQuery } from "~/queries/students";
import { downloadCsv } from "~/utils/csv";

type Sort = StudentDirectoryQuery["sort"];
type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentsQuery>["queryFn"]>>
>;
type StudentRow = Data["rows"][number];

const PAGE_SIZES = [25, 50] as const;
const DEFAULT_SEARCH = v.parse(studentDirectorySchema, {});

export const Route = createFileRoute("/_app/admin/students")({
  validateSearch: studentDirectorySchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(studentsQuery(deps)),
      context.queryClient.ensureQueryData(peopleOptionsQuery),
    ]);
  },
  component: StudentsPage,
});

function StudentName({ row }: { row: StudentRow }) {
  return (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.id }}
      search={{}}
    >
      {displayName(row)}
    </RowLink>
  );
}

function Reference({ value }: { value: string | null }) {
  return value ? (
    <span
      dir="ltr"
      className="font-mono text-[13px] leading-[18px] text-muted-foreground tabular-nums"
    >
      {value}
    </span>
  ) : (
    <Value>{null}</Value>
  );
}

function Status({ row }: { row: StudentRow }) {
  return (
    <StatusText tone={STATUS_TONE[row.status]}>
      {STATUS_LABEL[row.status]()}
    </StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function studentColumns(): Column<StudentRow, Sort>[] {
  return [
    {
      id: "name",
      header: m.adminName(),
      sort: "name",
      primary: true,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={displayName(row)} size="sm" />
          <div className="grid min-w-0">
            <StudentName row={row} />
            {otherName(row) ? (
              <span
                dir="auto"
                className="truncate text-[13px] leading-[18px] text-muted-foreground"
              >
                {otherName(row)}
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "reference",
      header: m.adminReference(),
      sort: "reference",
      cell: (row) => <Reference value={row.reference} />,
    },
    {
      id: "grade",
      header: m.studentGrade(),
      sort: "grade",
      cell: (row) => (
        <Value notApplicable={!row.grade}>{labelOf(row.grade)}</Value>
      ),
    },
    {
      id: "status",
      header: m.studentStatus(),
      cell: (row) => <Status row={row} />,
    },
    {
      id: "guardian",
      header: m.studentsGuardianPhone(),
      cell: (row) =>
        row.guardianPhone ? (
          <bdi dir="ltr" className="tabular-nums">
            {formatPhone(row.guardianPhone)}
          </bdi>
        ) : (
          <StatusText tone="warning">{m.studentsMissingGuardian()}</StatusText>
        ),
    },
    {
      id: "account",
      header: m.studentsAccount(),
      cell: (row) =>
        row.hasAccount ? (
          <StatusText tone="success">{m.studentsHasAccount()}</StatusText>
        ) : (
          <StatusText tone="neutral">{m.studentsNoAccount()}</StatusText>
        ),
    },
  ];
}

const card = {
  leading: (row: StudentRow) => <PersonAvatar name={displayName(row)} />,
  title: (row: StudentRow) => <StudentName row={row} />,
  fact: (row: StudentRow) => (
    <span className="flex flex-wrap items-center gap-x-3">
      <Status row={row} />
      {row.grade ? <span>{labelOf(row.grade)}</span> : null}
    </span>
  ),
};

function exportStudents(rows: StudentRow[]) {
  downloadCsv(`${m.adminStudentsTitle()}.csv`, [
    [
      m.adminName(),
      m.adminReference(),
      m.studentGrade(),
      m.studentStatus(),
      m.studentsGuardianPhone(),
    ],
    ...rows.map((row) => [
      displayName(row),
      row.reference ?? "",
      labelOf(row.grade) ?? "",
      STATUS_LABEL[row.status](),
      row.guardianPhone ?? "",
    ]),
  ]);
}

function copyReference(reference: string) {
  return navigator.clipboard.writeText(reference).then(
    () => toast.success(m.studentsReferenceCopied()),
    () => toast.error(m.studentsCopyFailed()),
  );
}

function StudentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canManage = useCapability("people:manage");
  const data = useSuspenseQuery(studentsQuery(search)).data;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const patch = (change: Partial<StudentDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  if (!data.year)
    return (
      <>
        <PageHeader title={m.adminStudentsTitle()} />
        <EmptyState
          icon={CalendarX}
          title={m.studentsNoYear()}
          description={m.studentsNoYearBody()}
        />
      </>
    );
  const yearFacet: Facet = {
    id: "year",
    label: m.workingYear(),
    single: true,
    options: options.years.map((year) => ({
      value: year.id,
      label: inLocale(year.titleEn, year.titleAr),
      hint:
        year.id === options.workingYearId
          ? m.workingYearDefaultHint()
          : undefined,
    })),
    selected: [data.year.id],
    defaultSelected: options.workingYearId ? [options.workingYearId] : [],
    onChange: ([year = ""]) =>
      patch({ year: year === options.workingYearId ? "" : year, page: 1 }),
  };
  const gradeFacet: Facet = {
    id: "grade",
    label: m.studentGrade(),
    options: options.grades.map((grade) => ({
      value: grade.id,
      label: labelOf(grade) ?? grade.code,
    })),
    selected: search.grade,
    onChange: (grade) => patch({ grade, page: 1 }),
  };
  const attentionFacet: Facet = {
    id: "missing",
    label: m.studentsNeedsAttention(),
    options: [
      { value: "guardian", label: m.studentsMissingGuardian() },
      { value: "account", label: m.studentsMissingAccount() },
    ],
    selected: search.missing,
    onChange: (missing) =>
      patch({
        missing: missing.filter(
          (value): value is "guardian" | "account" =>
            value === "guardian" || value === "account",
        ),
        page: 1,
      }),
  };
  const rowActions = (row: StudentRow): RowAction[] => [
    ...(canManage
      ? [
          {
            label: m.managementEditStudent(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/student-editor",
                search: { id: row.id, from: "list" },
              }),
          },
        ]
      : []),
    ...(row.reference
      ? [
          {
            label: m.studentsCopyReference(),
            icon: Copy,
            onSelect: () => copyReference(row.reference ?? ""),
          },
        ]
      : []),
  ];
  const create: HeaderAction | undefined = canManage
    ? {
        label: m.managementAddStudent(),
        icon: Plus,
        link: { to: "/student-editor", search: { from: "list" } },
      }
    : undefined;
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q, page: 1 }),
      label: m.studentsSearchHint(),
      placeholder: m.studentsSearchPlaceholder(),
    },
    facets: [yearFacet, gradeFacet, attentionFacet],
    onReset: () => patch({ q: "", year: "", grade: [], missing: [], page: 1 }),
  };
  const firstRun = data.total === 0 && !isFiltered(toolbar);
  return (
    <>
      <PageHeader
        title={m.adminStudentsTitle()}
        count={search.q ? undefined : data.total}
        action={firstRun ? undefined : create}
      />
      <DataTable
        caption={m.adminStudentsCaption()}
        rows={data.rows}
        columns={studentColumns()}
        rowLabel={(row) => displayName(row)}
        toolbar={toolbar}
        sort={{
          value: search.sort,
          direction: search.dir,
          onChange: (sort, dir) => patch({ sort, dir, page: 1 }),
        }}
        rowActions={rowActions}
        batchActions={[
          {
            label: m.studentsExport(),
            icon: Download,
            onSelect: exportStudents,
          },
        ]}
        pagination={{
          page: data.page,
          pages: data.pages,
          total: data.total,
          pageSize: search.pageSize,
          pageSizes: [...PAGE_SIZES],
          onPage: (page) => patch({ page }),
          onPageSize: (size) => {
            const pageSize = PAGE_SIZES.find((option) => option === size);
            if (pageSize) patch({ pageSize, page: 1 });
          },
        }}
        card={card}
        empty={{
          icon: UsersRound,
          title: m.studentsEmptyTitle(),
          description: m.studentsEmptyBody(),
          action: canManage ? (
            <ButtonLink to="/student-editor" search={{ from: "list" }}>
              <Plus aria-hidden />
              {m.managementAddStudent()}
            </ButtonLink>
          ) : undefined,
        }}
      />
    </>
  );
}
