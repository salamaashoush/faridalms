import type { Column } from "@faridalms/ui/system/data-table";

import { classYearSchema } from "@faridalms/domain/classes";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { School } from "lucide-react";
import * as v from "valibot";

import { classTitle, subjectName } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery, myClassesQuery } from "~/queries/classes";
import { formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myClassesQuery>["queryFn"]>>
>;
type Taught = Data["rows"][number];
type Options = Awaited<
  ReturnType<NonNullable<(typeof classOptionsQuery)["queryFn"]>>
>;

const DEFAULT_SEARCH = v.parse(classYearSchema, {});

export const Route = createFileRoute("/_app/teach/classes")({
  validateSearch: classYearSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myClassesQuery(deps.year)),
      context.queryClient.ensureQueryData(classOptionsQuery),
    ]);
  },
  component: MyClassesPage,
});

function ClassName({ row }: { row: Taught }) {
  return (
    <RowLink to="/classes/$classId" params={{ classId: row.id }} search={{}}>
      {classTitle(row)}
    </RowLink>
  );
}

function role(row: Taught) {
  if (row.role === "aide") return m.classesAssisting();
  return row.classType === "homeroom"
    ? m.classesClassTeacher()
    : m.classesSubjectTeacher();
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function taughtColumns(options: Options): Column<Taught>[] {
  return [
    {
      id: "name",
      header: m.classesName(),
      primary: true,
      cell: (row) => <ClassName row={row} />,
    },
    {
      id: "subject",
      header: m.classesSubject(),
      cell: (row) =>
        row.subjectId
          ? subjectName(options.subjects, row.subjectId)
          : m.classesWholeClass(),
    },
    { id: "role", header: m.classesYourRole(), cell: (row) => role(row) },
    {
      id: "students",
      header: m.classesStudents(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.students)}</span>
      ),
    },
  ];
}

const card = {
  title: (row: Taught) => <ClassName row={row} />,
  fact: (row: Taught) => (
    <span className="flex flex-wrap gap-x-3">
      <span>{role(row)}</span>
      <span className="tabular-nums">
        {m.classesStudentCount({ count: row.students })}
      </span>
    </span>
  ),
};

function MyClassesPage() {
  const search = Route.useSearch();
  const data = useSuspenseQuery(myClassesQuery(search.year)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  return (
    <>
      <PageHeader
        title={m.teachMyClassesTitle()}
        description={
          data.year
            ? m.classesInYear({
                year: inLocale(data.year.titleEn, data.year.titleAr),
              })
            : undefined
        }
      />
      {data.rows.length === 0 ? (
        <EmptyState
          icon={School}
          title={m.teachNoClasses()}
          description={m.classesNoneTaughtBody()}
        />
      ) : (
        <DataTable
          caption={m.classesTaughtCaption()}
          rows={data.rows}
          columns={taughtColumns(options)}
          rowLabel={(row) => classTitle(row)}
          card={card}
          empty={{ icon: School, title: m.teachNoClasses() }}
        />
      )}
    </>
  );
}
