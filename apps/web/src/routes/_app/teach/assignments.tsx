import { classScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getClassAssignments } from "~/server/school";

import { DataTable } from "~/components/admin/DataTable";
import { TableFilter } from "~/components/admin/TableFilter";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import { PageHeader, Value } from "~/components/app/primitives";
import { AssignmentStatusBadge } from "~/components/assignments/labels";
import { WeekNav } from "~/components/family/WeekNav";
import { ClassPicker } from "~/components/teach/ClassPicker";
import { formatDate, subjectName } from "~/components/teach/format";
import { HandedIn } from "~/components/teach/HandedIn";
import * as m from "~/i18n/messages";
import { classAssignmentsQuery, myClassesQuery } from "~/queries/school";

const searchSchema = v.object({
  ...classScopedQuerySchema.entries,
  q: v.optional(v.string(), ""),
  sort: v.optional(v.picklist(["title", "due", "class"]), "due"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
type Search = v.InferOutput<typeof searchSchema>;
type Assignment = Awaited<
  ReturnType<typeof getClassAssignments>
>["rows"][number];
const columns: DataColumn<Assignment, Search["sort"]>[] = [
  {
    id: "title",
    label: m.courseworkTitle,
    sort: "title",
    render: (row) => (
      <div>
        <Link
          to="/assignments/$assignmentId"
          params={{ assignmentId: row.id }}
          search={{}}
          className="font-medium hover:text-primary hover:underline"
        >
          {row.title}
        </Link>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <SubjectIcon icon={row.subject?.icon ?? ""} />
          <Value>{subjectName(row.subject)}</Value>
        </p>
      </div>
    ),
  },
  {
    id: "status",
    label: m.courseworkStatus,
    render: (row) => <AssignmentStatusBadge status={row.status} />,
  },
  {
    id: "class",
    label: m.studentClass,
    sort: "class",
    render: (row) =>
      row.class ? (
        <Link
          to="/classes/$classId"
          params={{ classId: row.class.id }}
          search={{}}
          className="hover:underline"
        >
          {row.class.name}
        </Link>
      ) : (
        <Value>{null}</Value>
      ),
  },
  {
    id: "due",
    label: m.meDueDate,
    sort: "due",
    render: (row) => (
      <span className="text-sm tabular-nums">{formatDate(row.dueDate)}</span>
    ),
  },
  {
    id: "work",
    label: m.teachGradingQueue,
    render: (row) =>
      row.status === "draft" ? (
        <span className="text-sm text-muted-foreground">
          {m.assignmentNotPublished()}
        </span>
      ) : row.canAssess ? (
        <HandedIn done={row.submittedCount} total={row.recipientCount} />
      ) : (
        <span className="text-sm text-muted-foreground">
          {m.courseworkAssessmentRestricted()}
        </span>
      ),
  },
];
export const Route = createFileRoute("/_app/teach/assignments")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    classId: search.classId,
    week: search.week,
    status: search.status,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(classAssignmentsQuery(deps)),
      context.queryClient.ensureQueryData(myClassesQuery),
    ]);
  },
  component: TeachingAssignmentsPage,
});
function TeachingAssignmentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { week, weeks, rows } = useSuspenseQuery(
    classAssignmentsQuery({
      classId: search.classId,
      week: search.week,
      status: search.status,
    }),
  ).data;
  const classes = useSuspenseQuery(myClassesQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const authoring = classes.some((row) => row.authoringSubjects.length > 0);
  const filtered = rows
    .filter((row) =>
      `${row.title} ${row.class?.name ?? ""} ${subjectName(row.subject)}`
        .toLocaleLowerCase()
        .includes(search.q.toLocaleLowerCase()),
    )
    .toSorted((a, b) => {
      const values = {
        title: [a.title, b.title],
        due: [a.dueDate, b.dueDate],
        class: [a.class?.name ?? "", b.class?.name ?? ""],
      }[search.sort];
      return (
        ((values[0] ?? "").localeCompare(values[1] ?? "") ||
          a.id.localeCompare(b.id)) * (search.dir === "asc" ? 1 : -1)
      );
    });
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const page = Math.min(search.page, pages);
  return (
    <>
      <PageHeader
        title={m.assignmentsTitle()}
        description={m.teachAssignmentsSubtitle()}
        actions={
          authoring ? (
            <ButtonLink
              to="/teach/assignment-editor"
              search={{ classId: search.classId || undefined }}
            >
              <Plus className="size-4" aria-hidden />
              {m.assignmentDesignTitle()}
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <ClassPicker
          id="assignments-class"
          label={m.teachFilterClass()}
          value={search.classId}
          classes={classes}
          withAllOption
          onChange={(classId) => patch({ classId, page: 1 })}
        />
        <WeekNav
          week={week}
          weeks={weeks}
          onSelect={(number) => patch({ week: number, page: 1 })}
        />
      </div>
      <DataTable
        columns={columns}
        rows={filtered.slice((page - 1) * 25, page * 25)}
        caption={m.assignmentsTitle()}
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
        page={page}
        pages={pages}
        total={filtered.length}
        onPage={(next) => patch({ page: next })}
        filters={
          <TableFilter
            label={m.courseworkStatus()}
            value={search.status}
            classes={[
              { id: "all", name: m.courseworkAll() },
              { id: "draft", name: m.assignmentStatusDraft() },
              { id: "published", name: m.assignmentStatusPublished() },
              { id: "archived", name: m.assignmentStatusArchived() },
            ]}
            onChange={(value) => {
              const status = (
                ["all", "draft", "published", "archived"] as const
              ).find((item) => item === value);
              if (status) patch({ status, page: 1 });
            }}
          />
        }
        renderActions={(row) => (
          <div className="flex justify-end gap-1">
            {row.canAssess ? (
              <ButtonLink
                to="/teach/assignment-editor"
                search={{ id: row.id }}
                variant="ghost"
                size="sm"
                aria-label={m.managementEditNamed({ name: row.title })}
              >
                <Pencil className="size-4" aria-hidden />
                {m.managementEdit()}
              </ButtonLink>
            ) : null}
            <ButtonLink
              to="/assignments/$assignmentId"
              params={{ assignmentId: row.id }}
              search={{ tab: "learners" }}
              variant="ghost"
              size="sm"
              aria-label={m.courseworkOpenNamed({ title: row.title })}
            >
              {m.commonOpen()}
            </ButtonLink>
          </div>
        )}
      />
    </>
  );
}
