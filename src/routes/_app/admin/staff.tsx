import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import type { Role } from "~/data/identity";

import { FilterChips } from "~/components/admin/FilterChips";
import { formatMoment } from "~/components/admin/format";
import { ROLE_LABEL } from "~/components/admin/labels";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ROLES } from "~/data/identity";
import * as m from "~/i18n/messages";
import { allUsersQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

const ROLE_FILTERS = ["all", ...ROLES] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

const searchSchema = v.object({
  role: v.optional(v.picklist(ROLE_FILTERS), "all"),
});

export const Route = createFileRoute("/_app/admin/staff")({
  validateSearch: (search) => v.parse(searchSchema, search),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(allUsersQuery);
  },
  component: AdminStaffPage,
});

function RoleBadge({ role }: { role: Role }) {
  const variant =
    role === "admin" ? "default" : role === "teacher" ? "secondary" : "outline";
  return <Badge variant={variant}>{ROLE_LABEL[role]()}</Badge>;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="border-transparent bg-[var(--success)]/15 text-[var(--success)]">
      {m.adminActive()}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      {m.adminInactive()}
    </Badge>
  );
}

function AdminStaffPage() {
  const { role } = Route.useSearch();
  const navigate = Route.useNavigate();
  const people = useSuspenseQuery(allUsersQuery).data;

  const rows =
    role === "all" ? people : people.filter((person) => person.role === role);

  const setRole = (next: RoleFilter) => {
    void navigate({
      search: (prev) => ({ ...prev, role: next }),
      replace: true,
    });
  };

  return (
    <>
      <PageHeader
        title={m.adminStaffTitle()}
        description={m.adminStaffSubtitle()}
      />

      <div className="mb-4 flex flex-col gap-3">
        <FilterChips
          label={m.adminFilterByRole()}
          value={role}
          options={ROLE_FILTERS.map((value) => ({
            value,
            label: value === "all" ? m.adminAllRoles() : ROLE_LABEL[value](),
          }))}
          onChange={setRole}
        />
        <p className="text-sm text-muted-foreground">
          {m.adminStaffShown({ count: formatNumber(rows.length) })}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={m.adminNoStaffTitle()} body={m.adminNoStaffBody()} />
      ) : (
        <>
          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((person) => (
              <li
                key={person.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={person.name} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {person.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {person.email}
                      </p>
                    </div>
                  </div>
                  <ActiveBadge isActive={person.isActive} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminRole()}
                    </dt>
                    <dd>
                      <RoleBadge role={person.role} />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminJobTitle()}
                    </dt>
                    <dd>
                      <Value>{person.title}</Value>
                    </dd>
                  </div>
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminLastSignIn()}
                    </dt>
                    <dd>
                      <Value>{formatMoment(person.lastSignedInAt)}</Value>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-xl border border-border bg-card px-4 pb-4 sm:block">
            <Table>
              <TableCaption>{m.adminStaffCaption()}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.adminName()}</TableHead>
                  <TableHead>{m.adminEmail()}</TableHead>
                  <TableHead>{m.adminRole()}</TableHead>
                  <TableHead>{m.adminJobTitle()}</TableHead>
                  <TableHead>{m.adminAccountState()}</TableHead>
                  <TableHead>{m.adminLastSignIn()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <PersonAvatar name={person.name} />
                        <span className="font-medium">{person.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={person.role} />
                    </TableCell>
                    <TableCell>
                      <Value>{person.title}</Value>
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={person.isActive} />
                    </TableCell>
                    <TableCell>
                      <Value>{formatMoment(person.lastSignedInAt)}</Value>
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
