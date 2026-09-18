import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getGradingQueue } from "~/server/school";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/app/dialog";
import { PageHeader, Value } from "~/components/app/primitives";
import {
  formatDate,
  studentName,
  subjectName,
} from "~/components/teach/format";
import { GradeForm } from "~/components/teach/GradeForm";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { gradingQueueQuery } from "~/queries/school";

const searchSchema = v.object({
  q: v.optional(v.string(), ""),
  assignmentId: v.optional(v.string(), ""),
  submissionId: v.optional(v.string(), ""),
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
        <p className="font-medium">
          <Value>{row.assignment?.title}</Value>
        </p>
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
  const selected = queue.find((row) => row.id === search.submissionId);
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
        renderActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patch({ submissionId: row.id })}
          >
            <CheckCheck className="size-4" aria-hidden />
            {m.courseworkReview()}
          </Button>
        )}
      />
      {selected?.assignment ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) patch({ submissionId: "" });
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogTitle>{selected.assignment.title}</DialogTitle>
            <DialogDescription>
              {selected.student
                ? studentName(selected.student)
                : m.commonNotRecorded()}
            </DialogDescription>
            <section className="rounded-xl border bg-background p-5">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">
                {m.courseworkStudentWork()}
              </h3>
              <p className="text-sm leading-7 whitespace-pre-wrap">
                <Value>{selected.content}</Value>
              </p>
            </section>
            <GradeForm
              submissionId={selected.id}
              student={
                selected.student
                  ? studentName(selected.student)
                  : m.commonNotRecorded()
              }
              maxScore={selected.assignment.maxScore}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
