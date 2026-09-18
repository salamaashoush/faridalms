import type { ClassDirectoryQuery } from "@faridalms/domain/school-schema";

import { classDirectorySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus, Users } from "lucide-react";
import { Suspense } from "react";

import type { DataColumn } from "~/components/admin/DataTable";

import { ClassRoster } from "~/components/admin/ClassRoster";
import { DataTable } from "~/components/admin/DataTable";
import { STAGE_LABEL } from "~/components/admin/labels";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/app/dialog";
import { PageHeader, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import * as m from "~/i18n/messages";
import { allClassesQuery, classQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  stage: "early_years" | "primary" | "middle";
  room: string | null;
  homeroomTeacher: { id: string; name: string } | null;
  enrolledCount: number;
}
const columns: DataColumn<ClassRow, ClassDirectoryQuery["sort"]>[] = [
  {
    id: "name",
    label: m.managementClassName,
    sort: "name",
    render: (row) => (
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Users className="size-5" aria-hidden />
        </span>
        <div>
          <Link
            to="/classes/$classId"
            params={{ classId: row.id }}
            search={{}}
            className="font-medium hover:text-primary hover:underline"
          >
            {row.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {STAGE_LABEL[row.stage]()}
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "grade",
    label: m.studentGrade,
    sort: "grade",
    render: (row) => <Badge variant="secondary">{row.grade}</Badge>,
  },
  {
    id: "room",
    label: m.adminRoom,
    sort: "room",
    render: (row) => <Value>{row.room}</Value>,
  },
  {
    id: "teacher",
    label: m.adminHomeroom,
    render: (row) => <Value>{row.homeroomTeacher?.name}</Value>,
  },
  {
    id: "count",
    label: m.adminEnrolled,
    render: (row) => (
      <span className="tabular-nums">{formatNumber(row.enrolledCount)}</span>
    ),
  },
];
export const Route = createFileRoute("/_app/admin/classes")({
  validateSearch: classDirectorySchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(allClassesQuery(deps));
    if (deps.classId)
      await context.queryClient.ensureQueryData(classQuery(deps.classId));
  },
  component: ClassesPage,
});
function ClassesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(allClassesQuery(search)).data;
  const patch = (change: Partial<ClassDirectoryQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  return (
    <>
      <PageHeader
        title={m.adminClassesTitle()}
        description={m.managementClassesSubtitle()}
        actions={
          <Button
            onClick={() => {
              void navigate({ to: "/admin/class-editor", search: {} });
            }}
          >
            <Plus aria-hidden />
            {m.managementAddClass()}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        caption={m.adminClassesTitle()}
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
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch({ classId: row.id })}
              aria-label={`${m.adminViewRoster()} ${row.name}`}
            >
              <Users className="size-4" aria-hidden />
              {m.adminViewRoster()}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                void navigate({
                  to: "/admin/class-editor",
                  search: { id: row.id },
                });
              }}
              aria-label={m.managementEditNamed({ name: row.name })}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      />
      {search.classId ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) patch({ classId: "" });
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogTitle>{m.adminViewRoster()}</DialogTitle>
            <DialogDescription>{m.managementRosterHint()}</DialogDescription>
            <Suspense fallback={<Skeleton className="h-24" />}>
              <ClassRoster classId={search.classId} />
            </Suspense>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
