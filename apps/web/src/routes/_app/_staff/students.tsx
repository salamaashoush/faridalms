import type {
  StudentDirectoryQuery,
  StudentStatus,
} from "@faridalms/domain/people";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { PAGE_SIZES } from "@faridalms/domain/paging";
import {
  STUDENT_STATUSES,
  studentDirectorySchema,
} from "@faridalms/domain/people";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { isFiltered } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Copy,
  Download,
  KeyRound,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { GroupWords } from "~/components/classes/slots";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { groupWords, viewsOf, viewValue } from "~/components/classes/slots";
import { NewMessage } from "~/components/messages/NewMessage";
import { CreateSignIns } from "~/components/people/CreateSignIns";
import {
  displayName,
  formatPhone,
  otherName,
  STATUS_LABEL,
  STATUS_TONE,
} from "~/components/people/format";
import { LeaveSchool } from "~/components/people/LeaveSchool";
import {
  studentClassesParts,
  studentColumns as studentColumnSlot,
  studentFilters,
} from "~/components/people/slots";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { studentsQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { downloadCsv } from "~/utils/csv";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

/** Where a student stands by their role, whatever modules the school has. */
const CORE_STATUSES: readonly StudentStatus[] = [
  "enrolled",
  "pre_enrolled",
  "left",
];
type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentsQuery>["queryFn"]>>
>;
type StudentRow = Data["rows"][number];

// Loose, so a module's view rides in the address under its own key.
const searchSchema = v.looseObject(studentDirectorySchema.entries);
type Search = StudentDirectoryQuery & Record<string, unknown>;

const DEFAULT_SEARCH = v.parse(studentDirectorySchema, {});

export const Route = createFileRoute("/_app/_staff/students")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "people:read", "people:manage");
    const filters = filled(context.extensions, user.modules, studentFilters);
    const columns = filled(context.extensions, user.modules, studentColumnSlot);
    await Promise.all([
      context.queryClient.ensureQueryData(
        studentsQuery(deps, viewsOf(filters, deps)),
      ),
      ...[...filters, ...columns].map((part) =>
        context.queryClient.ensureQueryData(part.query()),
      ),
    ]);
  },
  component: StudentsPage,
});

interface StudentNameProps {
  row: StudentRow;
}

function StudentName({ row }: StudentNameProps) {
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

interface ReferenceProps {
  value: string | null;
}

function Reference({ value }: ReferenceProps) {
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

interface StatusProps {
  row: StudentRow;
}

function Status({ row }: StatusProps) {
  return (
    <StatusText tone={STATUS_TONE[row.status]}>
      {STATUS_LABEL[row.status]()}
    </StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function studentColumns(
  words: GroupWords | undefined,
  modules: readonly Column<StudentRow>[],
): Column<StudentRow>[] {
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
    ...modules,
    ...(words
      ? [
          {
            id: "class",
            header: words.group(),
            cell: (row: StudentRow) =>
              row.group ? (
                <RowLink
                  to="/classes/$classId"
                  params={{ classId: row.group.classId }}
                  search={{}}
                >
                  {inLocale(row.group.titleEn, row.group.titleAr)}
                </RowLink>
              ) : (
                <StatusText tone="warning">{m.studentsNoClass()}</StatusText>
              ),
          },
        ]
      : []),
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

const cardOf = (texts: (row: StudentRow) => string[]) => ({
  leading: (row: StudentRow) => <PersonAvatar name={displayName(row)} />,
  title: (row: StudentRow) => <StudentName row={row} />,
  fact: (row: StudentRow) => (
    <span className="flex flex-wrap items-center gap-x-3">
      <Status row={row} />
      {texts(row).map((text, index) => (
        <span key={index}>{text}</span>
      ))}
      {row.group ? (
        <span>{inLocale(row.group.titleEn, row.group.titleAr)}</span>
      ) : null}
    </span>
  ),
});

function exportStudents(
  rows: StudentRow[],
  columns: { header: string; text: (row: StudentRow) => string }[],
) {
  downloadCsv(`${m.adminStudentsTitle()}.csv`, [
    [
      m.adminName(),
      m.adminReference(),
      ...columns.map((column) => column.header),
      m.studentStatus(),
      m.studentsGuardianPhone(),
    ],
    ...rows.map((row) => [
      displayName(row),
      row.reference ?? "",
      ...columns.map((column) => column.text(row)),
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
  const canMessage = useCapability("messages:send");
  const [writing, setWriting] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [moving, setMoving] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const words = useSlot(groupWords)[0];
  const mover = useSlot(studentClassesParts)[0]?.move;
  const [leaving, setLeaving] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [opening, setOpening] = useState<
    { id: string; name: string; className: string | null }[] | null
  >(null);
  const filters = useSlot(studentFilters);
  const columnParts = useSlot(studentColumnSlot);
  const views = viewsOf(filters, search);
  const data = useSuspenseQuery(studentsQuery(search, views)).data;
  const reads = useSuspenseQueries({
    queries: filters.map((filter) => filter.query()),
  });
  const columnReads = useSuspenseQueries({
    queries: columnParts.map((column) => column.query()),
  });
  const valueOf = (row: StudentRow, key: string) => row.columns[key] ?? null;
  const moduleColumns: Column<StudentRow>[] = columnParts.map(
    (column, index) => ({
      id: column.key,
      header: column.header(),
      sort: column.key,
      cell: (row) =>
        column.cell(columnReads[index]?.data, valueOf(row, column.key)),
    }),
  );
  const columnTexts = columnParts.map((column, index) => ({
    header: column.header(),
    text: (row: StudentRow) =>
      column.text(columnReads[index]?.data, valueOf(row, column.key)),
  }));
  const card = cardOf((row) =>
    columnTexts.map((column) => column.text(row)).filter(Boolean),
  );
  const patch = (change: Partial<Search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const moduleFacets = filters.flatMap((filter, index) => {
    const facet = filter.facetOf(
      reads[index]?.data,
      viewValue(search[filter.key]),
      (next) => patch({ [filter.key]: next, page: 1 }),
    );
    return facet ? [facet] : [];
  });
  const statusFacet: Facet = {
    id: "status",
    label: m.studentStatus(),
    options: [
      ...CORE_STATUSES,
      ...filters.flatMap((filter) => filter.statuses),
    ].map((status) => ({ value: status, label: STATUS_LABEL[status]() })),
    selected: search.status,
    onChange: (status) =>
      patch({
        status: STUDENT_STATUSES.filter((value) => status.includes(value)),
        page: 1,
      }),
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
    facets: [...moduleFacets, statusFacet, attentionFacet],
    onReset: () =>
      patch({
        q: "",
        status: [],
        missing: [],
        page: 1,
        ...Object.fromEntries(filters.map((filter) => [filter.key, undefined])),
      }),
  };
  const firstRun = data.total === 0 && !isFiltered(toolbar);
  return (
    <Page width="list">
      <PageHeader
        title={m.adminStudentsTitle()}
        count={search.q ? undefined : data.total}
        action={firstRun ? undefined : create}
      />
      <DataTable
        caption={m.adminStudentsCaption()}
        rows={data.rows}
        columns={studentColumns(words, moduleColumns)}
        rowLabel={(row) => displayName(row)}
        toolbar={toolbar}
        sort={{
          value: search.sort,
          direction: search.dir,
          onChange: (sort, dir) => patch({ sort, dir, page: 1 }),
        }}
        rowActions={rowActions}
        batchActions={[
          ...(canManage && mover
            ? [
                {
                  label: mover.label(),
                  icon: ArrowRightLeft,
                  onSelect: (rows: StudentRow[]) =>
                    setMoving(
                      rows.map((row) => ({
                        id: row.id,
                        name: displayName(row),
                      })),
                    ),
                },
              ]
            : []),
          ...(canMessage
            ? [
                {
                  label: m.studentMessageGuardians(),
                  icon: MessageSquare,
                  onSelect: (rows: StudentRow[]) =>
                    setWriting(
                      rows.map((row) => ({
                        id: row.id,
                        name: displayName(row),
                      })),
                    ),
                },
              ]
            : []),
          ...(canManage
            ? [
                {
                  label: m.studentLeave(),
                  icon: LogOut,
                  onSelect: (rows: StudentRow[]) =>
                    setLeaving(
                      rows.map((row) => ({
                        id: row.id,
                        name: displayName(row),
                      })),
                    ),
                },
              ]
            : []),
          ...(canManage
            ? [
                {
                  label: m.studentsCreateSignIns(),
                  icon: KeyRound,
                  onSelect: (rows: StudentRow[]) =>
                    setOpening(
                      rows.map((row) => ({
                        id: row.id,
                        name: displayName(row),
                        className: row.group
                          ? inLocale(row.group.titleEn, row.group.titleAr)
                          : null,
                      })),
                    ),
                },
              ]
            : []),
          {
            label: m.studentsExport(),
            icon: Download,
            onSelect: (rows: StudentRow[]) => exportStudents(rows, columnTexts),
          },
        ]}
        pagination={{
          page: data.page,
          pages: data.pages,
          total: data.total,
          pageSize: data.pageSize,
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
      {moving && mover ? (
        <mover.Many
          students={moving}
          today={data.today}
          onClose={() => setMoving(null)}
        />
      ) : null}
      {leaving ? (
        <LeaveSchool
          students={leaving}
          today={data.today}
          onClose={() => setLeaving(null)}
        />
      ) : null}
      {opening ? (
        <CreateSignIns students={opening} onClose={() => setOpening(null)} />
      ) : null}
      {writing ? (
        <NewMessage
          canStartFamily
          about={writing}
          onClose={() => setWriting(null)}
          onStarted={(thread) => {
            setWriting(null);
            if (thread) void navigate({ to: "/messages", search: { thread } });
          }}
        />
      ) : null}
    </Page>
  );
}
