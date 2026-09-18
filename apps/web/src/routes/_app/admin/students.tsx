import type { StudentDirectoryQuery } from "@faridalms/domain/school-schema";

import { studentDirectorySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";

import type { DataColumn } from "~/components/admin/DataTable";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { PageHeader, Value } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { allStudentsQuery } from "~/queries/school";

interface StudentRow {
  id: string;
  fullName: string;
  reference: string;
  photoUrl: string | null;
  grade: string | null;
  className: string | null;
  homeroomTeacher: string | null;
}
const columns: DataColumn<StudentRow, StudentDirectoryQuery["sort"]>[] = [
  {
    id: "name",
    label: m.adminName,
    sort: "name",
    render: (row) => (
      <div className="flex items-center gap-3">
        <PersonAvatar name={row.fullName} photoUrl={row.photoUrl} />
        <Link
          to="/students/$studentId"
          params={{ studentId: row.id }}
          search={{}}
          className="font-medium hover:text-primary hover:underline"
        >
          {row.fullName}
        </Link>
      </div>
    ),
  },
  {
    id: "reference",
    label: m.adminReference,
    sort: "reference",
    render: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.reference}
      </span>
    ),
  },
  {
    id: "class",
    label: m.studentClass,
    sort: "class",
    render: (row) => <Value>{row.className}</Value>,
  },
  {
    id: "grade",
    label: m.studentGrade,
    sort: "grade",
    render: (row) => <Value>{row.grade}</Value>,
  },
  {
    id: "homeroom",
    label: m.adminHomeroom,
    sort: "homeroom",
    render: (row) => <Value>{row.homeroomTeacher}</Value>,
  },
];
export const Route = createFileRoute("/_app/admin/students")({
  validateSearch: studentDirectorySchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(allStudentsQuery(deps)),
  component: StudentsPage,
});
function StudentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(allStudentsQuery(search)).data;
  const patch = (change: Partial<StudentDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  return (
    <>
      <PageHeader
        title={m.adminStudentsTitle()}
        description={m.managementStudentsSubtitle()}
        actions={
          <Button
            onClick={() => {
              void navigate({ to: "/student-editor", search: {} });
            }}
          >
            <Plus aria-hidden />
            {m.managementAddStudent()}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        caption={m.adminStudentsCaption()}
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
        renderActions={(row) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigate({ to: "/student-editor", search: { id: row.id } });
            }}
            aria-label={m.managementEditNamed({ name: row.fullName })}
          >
            <Pencil className="size-4" aria-hidden />
            {m.managementEdit()}
          </Button>
        )}
      />
    </>
  );
}
