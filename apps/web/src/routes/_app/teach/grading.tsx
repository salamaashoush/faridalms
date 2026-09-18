import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getGradingQueue } from "~/server/school";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader, Value } from "~/components/app/primitives";
import {
  formatDate,
  studentName,
  subjectName,
} from "~/components/teach/format";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { gradingQueueQuery } from "~/queries/school";

const searchSchema = v.object({
  q: v.optional(v.string(), ""),
  assignmentId: v.optional(v.string(), ""),
  sort: v.optional(v.picklist(["student", "assignment", "due"]), "due"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
type Search = v.InferOutput<typeof searchSchema>;
type Submission = Awaited<ReturnType<typeof getGradingQueue>>[number];
const columns: DataColumn<Submission, Search["sort"]>[] = [
  {
    id: "student",
    label: m.adminName,
    sort: "student",
    render: (row) => (
      <div className="flex items-center gap-3">
        <PersonAvatar
          name={row.student ? studentName(row.student) : m.commonNotRecorded()}
        />
        <span className="font-medium">
          <Value>{row.student ? studentName(row.student) : null}</Value>
        </span>
      </div>
    ),
  },
  {
    id: "assignment",
    label: m.courseworkTitle,
    sort: "assignment",
    render: (row) => (
      <div>
        {row.assignment ? (
          <Link
            to="/assignments/$assignmentId"
            params={{ assignmentId: row.assignment.id }}
            search={{}}
            className="font-medium hover:text-primary hover:underline"
          >
            {row.assignment.title}
          </Link>
        ) : (
          <Value>{null}</Value>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          <Value>{subjectName(row.assignment?.subject)}</Value>
        </p>
      </div>
    ),
  },
  {
    id: "class",
    label: m.studentClass,
    render: (row) => <Value>{row.assignment?.class?.name}</Value>,
  },
  {
    id: "due",
    label: m.meDueDate,
    sort: "due",
    render: (row) => (
      <Value>
        {row.assignment ? formatDate(row.assignment.dueDate) : null}
      </Value>
    ),
  },
];
export const Route = createFileRoute("/_app/teach/grading")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(gradingQueueQuery),
  component: GradingPage,
});
function GradingPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queue = useSuspenseQuery(gradingQueueQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const rows = queue
    .filter(
      (row) =>
        row.assignment &&
        (!search.assignmentId || row.assignment.id === search.assignmentId) &&
        `${row.student ? studentName(row.student) : ""} ${row.assignment.title}`
          .toLocaleLowerCase()
          .includes(search.q.toLocaleLowerCase()),
    )
    .toSorted((a, b) => {
      const values = {
        student: [
          a.student ? studentName(a.student) : "",
          b.student ? studentName(b.student) : "",
        ],
        assignment: [a.assignment?.title ?? "", b.assignment?.title ?? ""],
        due: [a.assignment?.dueDate ?? "", b.assignment?.dueDate ?? ""],
      }[search.sort];
      return (
        ((values[0] ?? "").localeCompare(values[1] ?? "") ||
          a.id.localeCompare(b.id)) * (search.dir === "asc" ? 1 : -1)
      );
    });
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(search.page, pages);
  return (
    <>
      <PageHeader
        title={m.teachGradingTitle()}
        description={m.teachGradingSubtitle()}
      />
      <DataTable
        rows={rows.slice((page - 1) * 25, page * 25)}
        columns={columns}
        caption={m.teachGradingTitle()}
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
        total={rows.length}
        onPage={(next) => patch({ page: next })}
        filters={
          search.assignmentId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ assignmentId: "", page: 1 })}
            >
              {m.courseworkAll()}
            </Button>
          ) : undefined
        }
        renderActions={(row) =>
          row.assignment && row.currentAttemptId ? (
            <ButtonLink
              to="/assignments/$assignmentId"
              params={{ assignmentId: row.assignment.id }}
              search={{ tab: "review", attempt: row.currentAttemptId }}
              variant="ghost"
              size="sm"
              aria-label={m.attemptReviewFor({
                name: row.student
                  ? studentName(row.student)
                  : m.commonNotRecorded(),
              })}
            >
              <CheckCheck className="size-4" aria-hidden />
              {m.courseworkReview()}
            </ButtonLink>
          ) : null
        }
      />
    </>
  );
}
