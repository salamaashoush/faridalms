import type { AssignmentRow } from "@faridalms/database/repositories/academics";

import { assignmentsQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";

import { DataTable } from "~/components/admin/DataTable";
import { TableFilter } from "~/components/admin/TableFilter";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import { PageHeader, Value } from "~/components/app/primitives";
import { LearnerStateBadge } from "~/components/assignments/labels";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { WeekNav } from "~/components/family/WeekNav";
import * as m from "~/i18n/messages";
import { assignmentsQuery } from "~/queries/school";

import { formatDate, subjectName } from "./format";

export const courseworkSearchSchema = v.object({
  ...assignmentsQuerySchema.entries,
  q: v.optional(v.string(), ""),
  state: v.optional(
    v.picklist(["all", "open", "submitted", "returned"]),
    "all",
  ),
  sort: v.optional(v.picklist(["title", "subject", "due"]), "due"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
type Search = v.InferOutput<typeof courseworkSearchSchema>;
type Row = AssignmentRow & { today: string; studentId: string };
const columns: DataColumn<Row, Search["sort"]>[] = [
  {
    id: "title",
    label: m.courseworkTitle,
    sort: "title",
    render: (row) => (
      <Link
        to="/assignments/$assignmentId"
        params={{ assignmentId: row.id }}
        search={{ studentId: row.studentId }}
        className="font-medium hover:text-primary hover:underline"
      >
        {row.title}
      </Link>
    ),
  },
  {
    id: "subject",
    label: m.assignmentsSubject,
    sort: "subject",
    render: (row) => (
      <span className="flex items-center gap-2 text-muted-foreground">
        <SubjectIcon icon={row.subject.icon} />
        {subjectName(row.subject)}
      </span>
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
    id: "state",
    label: m.courseworkStatus,
    render: (row) => (
      <LearnerStateBadge
        state={row.learnerState}
        late={row.window === "late" && row.learnerState === "not_started"}
      />
    ),
  },
  {
    id: "score",
    label: m.assignmentsScore,
    render: (row) => (
      <Value>
        {row.submission?.score === null || row.submission?.score === undefined
          ? null
          : m.courseworkScoreValue({
              score: row.submission.score,
              max: row.maxScore,
            })}
      </Value>
    ),
  },
];
export function CourseworkWorkspace({
  search,
  family = false,
}: {
  search: Search;
  family?: boolean;
}) {
  const navigate = useNavigate();
  const {
    rows,
    week,
    weeks,
    today,
    studentId: activeStudentId,
  } = useSuspenseQuery(
    assignmentsQuery({ studentId: search.studentId, week: search.week }),
  ).data;
  const patch = (change: Partial<Search>) => {
    void navigate({ to: ".", search: { ...search, ...change } });
  };
  const filtered = rows
    .filter((row) => {
      const state = row.learnerState;
      return (
        (search.state === "all" ||
          (search.state === "open"
            ? state === "not_started" ||
              state === "draft" ||
              state === "scheduled"
            : state === search.state)) &&
        `${row.title} ${subjectName(row.subject)}`
          .toLocaleLowerCase()
          .includes(search.q.toLocaleLowerCase())
      );
    })
    .toSorted((a, b) => {
      const values = {
        title: [a.title, b.title],
        subject: [subjectName(a.subject), subjectName(b.subject)],
        due: [a.dueDate, b.dueDate],
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
        description={
          family ? m.familyAssignmentsSubtitle() : m.meAssignmentsSubtitle()
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        {family ? (
          <StudentScopeBar
            studentId={search.studentId}
            onChange={(studentId) => patch({ studentId, page: 1 })}
          />
        ) : null}
        <WeekNav
          week={week}
          weeks={weeks}
          onSelect={(number) => patch({ week: number, page: 1 })}
        />
      </div>
      <DataTable
        rows={filtered
          .slice((page - 1) * 25, page * 25)
          .map((row) => ({ ...row, today, studentId: activeStudentId }))}
        columns={columns}
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
            id="coursework-state"
            label={m.courseworkStatus()}
            value={search.state}
            classes={[
              { id: "all", name: m.courseworkAll() },
              { id: "open", name: m.courseworkOpen() },
              { id: "submitted", name: m.courseworkSubmitted() },
              { id: "returned", name: m.courseworkReturned() },
            ]}
            onChange={(value) => {
              const state = (
                ["all", "open", "submitted", "returned"] as const
              ).find((item) => item === value);
              if (state) patch({ state, page: 1 });
            }}
          />
        }
        renderActions={(row) => (
          <ButtonLink
            to="/assignments/$assignmentId"
            params={{ assignmentId: row.id }}
            search={{ studentId: row.studentId, tab: "work" }}
            variant="ghost"
            size="sm"
            aria-label={m.courseworkOpenNamed({ title: row.title })}
          >
            {m.courseworkView()}
            <ArrowUpRight className="size-4" aria-hidden />
          </ButtonLink>
        )}
      />
    </>
  );
}
