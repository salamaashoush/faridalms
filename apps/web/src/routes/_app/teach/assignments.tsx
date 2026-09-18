import { classScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getClassAssignments } from "~/server/school";

import { DataTable } from "~/components/admin/DataTable";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import { PageHeader, Value } from "~/components/app/primitives";
import { WeekNav } from "~/components/family/WeekNav";
import { ClassPicker } from "~/components/teach/ClassPicker";
import { CreateAssignment } from "~/components/teach/CreateAssignment";
import {
  formatDate,
  handedInCount,
  subjectName,
} from "~/components/teach/format";
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
>["rows"][number] & { enrolled: number };
const columns: DataColumn<Assignment, Search["sort"]>[] = [
  {
    id: "title",
    label: m.courseworkTitle,
    sort: "title",
    render: (row) => (
      <div>
        <p className="font-medium">{row.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <SubjectIcon icon={row.subject?.icon ?? ""} />
          <Value>{subjectName(row.subject)}</Value>
        </p>
      </div>
    ),
  },
  {
    id: "class",
    label: m.studentClass,
    sort: "class",
    render: (row) => <Value>{row.class?.name}</Value>,
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
      row.canAssess ? (
        <HandedIn done={handedInCount(row.submissions)} total={row.enrolled} />
      ) : (
        <span className="text-sm text-muted-foreground">
          {m.courseworkAssessmentRestricted()}
        </span>
      ),
  },
];
export const Route = createFileRoute("/_app/teach/assignments")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ classId: search.classId, week: search.week }),
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
  const { week, weeks, rows, today } = useSuspenseQuery(
    classAssignmentsQuery({ classId: search.classId, week: search.week }),
  ).data;
  const classes = useSuspenseQuery(myClassesQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
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
        actions={<CreateAssignment classes={classes} today={today} />}
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
        rows={filtered.slice((page - 1) * 25, page * 25).map((row) => ({
          ...row,
          enrolled:
            classes.find((item) => item.id === row.class?.id)?.enrolledCount ??
            0,
        }))}
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
        renderActions={(row) => (
          <ButtonLink
            to="/teach/grading"
            search={{ assignmentId: row.id }}
            variant="ghost"
            size="sm"
          >
            {m.teachGradingQueue()}
          </ButtonLink>
        )}
      />
    </>
  );
}
