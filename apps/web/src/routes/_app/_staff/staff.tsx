import type { StaffDirectoryQuery } from "@faridalms/domain/people";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { PAGE_SIZES } from "@faridalms/domain/paging";
import {
  STAFF_ROLE_CHOICES,
  staffDirectorySchema,
} from "@faridalms/domain/people";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { isFiltered } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Copy, Download, Pencil, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import * as v from "valibot";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import {
  displayName,
  formatPhone,
  labelOf,
  otherName,
  roleLabel,
} from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { staffQuery } from "~/queries/staff";
import { currentUserQuery } from "~/queries/user";
import { downloadCsv } from "~/utils/csv";
import { formatInstant, formatList } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

type Sort = StaffDirectoryQuery["sort"];
type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof staffQuery>["queryFn"]>>
>;
type StaffRow = Data["rows"][number];

const DEFAULT_SEARCH = v.parse(staffDirectorySchema, {});
const FACET_ROLES = [...STAFF_ROLE_CHOICES, "district_administrator"];

export const Route = createFileRoute("/_app/_staff/staff")({
  validateSearch: staffDirectorySchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "staff:manage");
    await context.queryClient.ensureQueryData(staffQuery(deps));
  },
  component: StaffPage,
});

/** The job title, or the position when it says more than the role does. */
function titleOf(row: StaffRow) {
  const title = inLocale(row.titleEn, row.titleAr) || labelOf(row.position);
  if (!title) return null;
  const roles = new Set(row.roles.map((role) => roleLabel(role).toLowerCase()));
  return roles.has(title.toLowerCase()) ? null : title;
}

interface StaffNameProps {
  row: StaffRow;
}

function StaffName({ row }: StaffNameProps) {
  return (
    <RowLink to="/people/$userId" params={{ userId: row.id }} search={{}}>
      {displayName(row)}
    </RowLink>
  );
}

interface RolesProps {
  row: StaffRow;
}

function Roles({ row }: RolesProps) {
  return <span>{formatList(row.roles.map(roleLabel))}</span>;
}

interface SignInProps {
  account: StaffRow["account"];
}

function SignIn({ account }: SignInProps) {
  if (!account) return <Value>{null}</Value>;
  if (!account.state)
    return <StatusText tone="neutral">{m.studentsNoAccount()}</StatusText>;
  if (account.state === "disabled")
    return <StatusText tone="neutral">{m.accountDisabled()}</StatusText>;
  if (!account.lastSignInAt)
    return <StatusText tone="warning">{m.accountNeverSignedIn()}</StatusText>;
  return (
    <span className="text-muted-foreground">
      {formatInstant(account.lastSignInAt, "medium")}
    </span>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function staffColumns(manage: boolean): Column<StaffRow, Sort>[] {
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
            <StaffName row={row} />
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
      id: "role",
      header: m.adminRole(),
      sort: "role",
      cell: (row) => (
        <div className="grid min-w-0">
          <Roles row={row} />
          {titleOf(row) ? (
            <span
              dir="auto"
              className="truncate text-[13px] leading-[18px] text-muted-foreground"
            >
              {titleOf(row)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "email",
      header: m.adminEmail(),
      cell: (row) =>
        row.email ? (
          <bdi dir="ltr" className="truncate">
            {row.email}
          </bdi>
        ) : (
          <Value>{null}</Value>
        ),
    },
    {
      id: "phone",
      header: m.familyMobile(),
      cell: (row) =>
        row.phone ? (
          <bdi dir="ltr" className="tabular-nums">
            {formatPhone(row.phone)}
          </bdi>
        ) : (
          <Value>{null}</Value>
        ),
    },
    ...(manage
      ? [
          {
            id: "signedIn",
            header: m.staffLastSignIn(),
            sort: "signedIn" as const,
            cell: (row: StaffRow) => <SignIn account={row.account} />,
          },
        ]
      : []),
  ];
}

const card = {
  leading: (row: StaffRow) => <PersonAvatar name={displayName(row)} />,
  title: (row: StaffRow) => <StaffName row={row} />,
  fact: (row: StaffRow) => (
    <span className="flex flex-wrap items-center gap-x-3">
      <Roles row={row} />
      {titleOf(row) ? <span dir="auto">{titleOf(row)}</span> : null}
    </span>
  ),
};

function exportStaff(rows: StaffRow[]) {
  downloadCsv(`${m.adminStaffTitle()}.csv`, [
    [
      m.adminName(),
      m.adminRole(),
      m.staffTitle(),
      m.adminEmail(),
      m.familyMobile(),
    ],
    ...rows.map((row) => [
      displayName(row),
      row.roles.map(roleLabel).join(", "),
      titleOf(row) ?? "",
      row.email ?? "",
      row.phone ?? "",
    ]),
  ]);
}

function copyEmail(email: string) {
  return navigator.clipboard.writeText(email).then(
    () => toast.success(m.staffEmailCopied()),
    () => toast.error(m.studentsCopyFailed()),
  );
}

function StaffPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(staffQuery(search)).data;
  const patch = (change: Partial<StaffDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const roleFacet: Facet = {
    id: "role",
    label: m.adminRole(),
    options: FACET_ROLES.map((role) => ({
      value: role,
      label: roleLabel(role),
    })),
    selected: search.role,
    onChange: (role) => patch({ role, page: 1 }),
  };
  const rowActions = (row: StaffRow): RowAction[] => [
    ...(data.manage
      ? [
          {
            label: m.staffEdit(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/staff-editor",
                search: { id: row.id, from: "list" },
              }),
          },
        ]
      : []),
    ...(row.email
      ? [
          {
            label: m.staffCopyEmail(),
            icon: Copy,
            onSelect: () => copyEmail(row.email ?? ""),
          },
        ]
      : []),
  ];
  const create: HeaderAction | undefined = data.manage
    ? {
        label: m.staffAdd(),
        icon: Plus,
        link: { to: "/staff-editor", search: { from: "list" } },
      }
    : undefined;
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q, page: 1 }),
      label: m.staffSearchHint(),
      placeholder: m.staffSearchPlaceholder(),
    },
    facets: [roleFacet],
    onReset: () => patch({ q: "", role: [], page: 1 }),
  };
  const firstRun = data.total === 0 && !isFiltered(toolbar);
  return (
    <Page width="list">
      <PageHeader
        title={m.adminStaffTitle()}
        count={search.q ? undefined : data.total}
        action={firstRun ? undefined : create}
      />
      <DataTable
        caption={m.staffCaption()}
        rows={data.rows}
        columns={staffColumns(data.manage)}
        rowLabel={(row) => displayName(row)}
        toolbar={toolbar}
        sort={{
          value: search.sort,
          direction: search.dir,
          onChange: (sort, dir) => patch({ sort, dir, page: 1 }),
        }}
        rowActions={rowActions}
        batchActions={[
          { label: m.studentsExport(), icon: Download, onSelect: exportStaff },
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
          title: m.staffEmptyTitle(),
          description: m.staffEmptyBody(),
          action: data.manage ? (
            <ButtonLink to="/staff-editor" search={{ from: "list" }}>
              <Plus aria-hidden />
              {m.staffAdd()}
            </ButtonLink>
          ) : undefined,
        }}
      />
    </Page>
  );
}
