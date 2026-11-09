import type { Column } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { School } from "lucide-react";

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

interface ClassNameProps {
  row: Taught;
}

function ClassName({ row }: ClassNameProps) {
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

export interface MyClassesProps {
  year: string;
  title: string;
  /** Places the list where the page wants it, below the header. */
  frame: (content: ReactNode) => ReactNode;
}

/** The classes the viewer teaches or assists in, in one school year. */
export function MyClasses({ year, title, frame }: MyClassesProps) {
  const data = useSuspenseQuery(myClassesQuery(year)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  return (
    <Page width="list">
      <PageHeader
        title={title}
        description={
          data.year
            ? m.classesInYear({
                year: inLocale(data.year.titleEn, data.year.titleAr),
              })
            : undefined
        }
      />
      {frame(
        data.rows.length === 0 ? (
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
        ),
      )}
    </Page>
  );
}
