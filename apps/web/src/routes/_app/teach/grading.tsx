import type { Column } from "@faridalms/ui/system/data-table";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import * as v from "valibot";

import { classTitle } from "~/components/classes/format";
import { Grading } from "~/components/coursework/Grading";
import * as m from "~/i18n/messages";
import { courseworkListQuery, gradingQuery } from "~/queries/coursework";
import { formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof courseworkListQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

const QUEUE = { tab: "to_grade" as const, classId: "", q: "" };

export const Route = createFileRoute("/_app/teach/grading")({
  validateSearch: v.object({
    assignmentId: v.optional(v.pipe(v.string(), v.uuid())),
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.assignmentId && deps.studentId)
      await context.queryClient.ensureQueryData(
        gradingQuery(deps.assignmentId, deps.studentId),
      );
    else await context.queryClient.ensureQueryData(courseworkListQuery(QUEUE));
  },
  component: GradingPage,
});

function Title({ row }: { row: Row }) {
  return (
    <RowLink
      to="/assignments/$assignmentId"
      params={{ assignmentId: row.id }}
      search={{ tab: "work" }}
    >
      {row.title}
    </RowLink>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.courseworkTitle(),
      primary: true,
      cell: (row) => <Title row={row} />,
    },
    {
      id: "class",
      header: m.studentClass(),
      cell: (row) =>
        classTitle({
          code: row.classCode,
          titleEn: row.classTitleEn,
          titleAr: row.classTitleAr,
        }),
    },
    {
      id: "waiting",
      header: m.courseworkWaiting(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.toGrade)}</span>
      ),
    },
  ];
}

const card = {
  title: (row: Row) => <Title row={row} />,
  fact: (row: Row) => m.courseworkToGradeCount({ count: row.toGrade }),
};

function Queue() {
  const data = useSuspenseQuery(courseworkListQuery(QUEUE)).data;
  return (
    <>
      <PageHeader
        title={m.courseworkToReview()}
        description={m.courseworkToReviewHint()}
      />
      <DataTable
        caption={m.courseworkToReviewCaption()}
        rows={data.rows}
        columns={columns()}
        rowLabel={(row) => row.title}
        card={card}
        empty={{
          icon: ClipboardCheck,
          title: m.courseworkNothingToReview(),
          description: m.courseworkNothingToReviewBody(),
        }}
      />
    </>
  );
}

function GradingPage() {
  const { assignmentId, studentId } = Route.useSearch();
  if (assignmentId && studentId)
    return (
      <Grading
        key={assignmentId}
        assignmentId={assignmentId}
        studentId={studentId}
      />
    );
  return <Queue />;
}
