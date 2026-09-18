import type { Role } from "@faridalms/domain/identity";
import type { StaffDirectoryQuery } from "@faridalms/domain/school-schema";

import { ROLES } from "@faridalms/domain/identity";
import { staffDirectorySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import type { DataColumn } from "~/components/admin/DataTable";

import { DataTable } from "~/components/admin/DataTable";
import { formatMoment } from "~/components/admin/format";
import { ROLE_LABEL } from "~/components/admin/labels";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { TableFilter } from "~/components/admin/TableFilter";
import { UserEditor } from "~/components/admin/UserEditor";
import { PageHeader, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { allUsersQuery } from "~/queries/school";

interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  isActive: boolean;
  lastSignedInAt: Date | null;
}
const columns: DataColumn<Account, StaffDirectoryQuery["sort"]>[] = [
  {
    id: "name",
    label: m.adminName,
    sort: "name",
    render: (row) => (
      <div className="flex items-center gap-3">
        <PersonAvatar name={row.name} />
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            <Value>{row.title}</Value>
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "email",
    label: m.adminEmail,
    sort: "email",
    render: (row) => <span className="text-muted-foreground">{row.email}</span>,
  },
  {
    id: "role",
    label: m.adminRole,
    sort: "role",
    render: (row) => (
      <Badge variant="secondary">{ROLE_LABEL[row.role]()}</Badge>
    ),
  },
  {
    id: "status",
    label: m.adminAccountState,
    sort: "status",
    render: (row) => (
      <Badge
        variant="outline"
        className={
          row.isActive
            ? "border-primary/20 bg-primary/5 text-primary"
            : "text-muted-foreground"
        }
      >
        {row.isActive ? m.adminActive() : m.adminInactive()}
      </Badge>
    ),
  },
  {
    id: "last",
    label: m.adminLastSignIn,
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        <Value>{formatMoment(row.lastSignedInAt)}</Value>
      </span>
    ),
  },
];
export const Route = createFileRoute("/_app/admin/staff")({
  validateSearch: staffDirectorySchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(allUsersQuery(deps)),
  component: AccountsPage,
});
function AccountsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(allUsersQuery(search)).data;
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const patch = (change: Partial<StaffDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  return (
    <>
      <PageHeader
        title={m.adminStaffTitle()}
        description={m.managementAccountsSubtitle()}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {m.managementAddAccount()}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        caption={m.adminStaffCaption()}
        query={search.q}
        onQuery={(q) => patch({ q, page: 1 })}
        sort={search.sort}
        direction={search.dir}
        onSort={(sort) =>
          patch({
            sort,
            dir: search.sort === sort && search.dir === "asc" ? "desc" : "asc",
          })
        }
        {...data}
        onPage={(page) => patch({ page })}
        filters={
          <>
            <TableFilter
              id="directory-role"
              label={m.adminRole()}
              value={search.role}
              classes={[
                { id: "all", name: m.adminAllRoles() },
                ...ROLES.map((id) => ({ id, name: ROLE_LABEL[id]() })),
              ]}
              onChange={(value) => {
                const role = (["all", ...ROLES] as const).find(
                  (item) => item === value,
                );
                if (role) patch({ role, page: 1 });
              }}
            />
            <TableFilter
              id="directory-status"
              label={m.adminAccountState()}
              value={search.status}
              classes={[
                { id: "all", name: m.managementAllStatuses() },
                { id: "active", name: m.adminActive() },
                { id: "inactive", name: m.adminInactive() },
              ]}
              onChange={(value) => {
                const status = (["all", "active", "inactive"] as const).find(
                  (item) => item === value,
                );
                if (status) patch({ status, page: 1 });
              }}
            />
          </>
        }
        renderActions={(row) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(row)}
            aria-label={m.managementEditNamed({ name: row.name })}
          >
            <Pencil className="size-4" aria-hidden />
            {m.managementEdit()}
          </Button>
        )}
      />
      {editing ? (
        <UserEditor
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
