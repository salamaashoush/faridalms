import type { StudentDirectoryQuery } from "@faridalms/domain/school-schema";

import { studentDirectorySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Download, Pencil, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type {
  Facet,
  HeaderAction,
  IndexToolbarProps,
} from "~/components/system/IndexPage";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { YEAR_STATUS_LABEL } from "~/components/admin/YearLifecycle";
import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { PageHeader, isFiltered } from "~/components/system/IndexPage";
import { StatusText } from "~/components/system/status";
import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { academicYearsQuery } from "~/queries/academic-years";
import { allStudentsQuery } from "~/queries/school";
import { downloadCsv } from "~/utils/csv";

type Sort = StudentDirectoryQuery["sort"];

interface StudentRow {
  id: string;
  fullName: string;
  reference: string;
  photoUrl: string | null;
  grade: string | null;
  className: string | null;
  homeroomTeacher: string | null;
}

const PAGE_SIZES = [25, 50] as const;

export const Route = createFileRoute("/_app/admin/students")({
  validateSearch: studentDirectorySchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(allStudentsQuery(deps)),
      context.queryClient.ensureQueryData(academicYearsQuery),
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
      {row.fullName}
    </RowLink>
  );
}

// A missing class needs attention only in the year being run; in any other
// year it is history.
function StudentClass({ row, current }: { row: StudentRow; current: boolean }) {
  return row.className ? (
    <span dir="auto">{row.className}</span>
  ) : (
    <StatusText tone={current ? "warning" : "neutral"}>
      {m.studentsNoClass()}
    </StatusText>
  );
}

function Reference({ value }: { value: string }) {
  return (
    <span
      dir="ltr"
      className="font-mono text-[13px] leading-[18px] text-muted-foreground tabular-nums"
    >
      {value}
    </span>
  );
}

function studentColumns(current: boolean): Column<StudentRow, Sort>[] {
  return [
    {
      id: "name",
      header: m.adminName(),
      sort: "name",
      primary: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <PersonAvatar name={row.fullName} photoUrl={row.photoUrl} size="sm" />
          <StudentName row={row} />
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
      id: "class",
      header: m.studentClass(),
      sort: "class",
      cell: (row) => <StudentClass row={row} current={current} />,
    },
    {
      id: "grade",
      header: m.studentGrade(),
      sort: "grade",
      cell: (row) => <Value notApplicable={!row.className}>{row.grade}</Value>,
    },
    {
      id: "homeroom",
      header: m.studentsHomeroomTeacher(),
      sort: "homeroom",
      cell: (row) => (
        <Value notApplicable={!row.className}>{row.homeroomTeacher}</Value>
      ),
    },
  ];
}

function studentCard(current: boolean) {
  return {
    leading: (row: StudentRow) => (
      <PersonAvatar name={row.fullName} photoUrl={row.photoUrl} />
    ),
    title: (row: StudentRow) => <StudentName row={row} />,
    fact: (row: StudentRow) => <StudentClass row={row} current={current} />,
  };
}

function exportStudents(rows: StudentRow[]) {
  downloadCsv(`${m.adminStudentsTitle()}.csv`, [
    [
      m.adminName(),
      m.adminReference(),
      m.studentClass(),
      m.studentGrade(),
      m.studentsHomeroomTeacher(),
    ],
    ...rows.map((row) => [
      row.fullName,
      row.reference,
      row.className,
      row.grade,
      row.homeroomTeacher,
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
  const data = useSuspenseQuery(allStudentsQuery(search)).data;
  const { data: years } = useSuspenseQuery(academicYearsQuery);
  const defaultYear = years.find((year) => year.isCurrent);
  const current = data.year.id === defaultYear?.id;
  const patch = (change: Partial<StudentDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const yearFacet: Facet = {
    id: "year",
    label: m.workingYear(),
    single: true,
    options: years.map((year) => ({
      value: year.id,
      label: year.name,
      hint: year.isCurrent
        ? m.workingYearDefaultHint()
        : YEAR_STATUS_LABEL[year.status](),
    })),
    selected: [data.year.id],
    defaultSelected: defaultYear ? [defaultYear.id] : [],
    onChange: ([year = ""]) =>
      patch({ year: year === defaultYear?.id ? "" : year, page: 1 }),
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
    {
      label: m.studentsCopyReference(),
      icon: Copy,
      onSelect: () => copyReference(row.reference),
    },
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
      label: m.studentsSearch(),
      placeholder: m.studentsSearchPlaceholder(),
    },
    facets: [yearFacet],
    onReset: () => patch({ q: "", year: "", page: 1 }),
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
        columns={studentColumns(current)}
        rowLabel={(row) => row.fullName}
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
        card={studentCard(current)}
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
