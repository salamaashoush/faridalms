import type { Column } from "@faridalms/ui/system/data-table";
import type { IndexToolbarProps } from "@faridalms/ui/system/index-toolbar";
import type { ReactNode } from "react";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { School } from "lucide-react";

import type { ClassesSearch } from "~/components/classes/slots";

import { useClassFacets } from "~/components/classes/class-facets";
import { classTitle, subjectName } from "~/components/classes/format";
import { classFilters, viewsOf } from "~/components/classes/slots";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classOptionsQuery, myClassesQuery } from "~/queries/classes";
import { formatNumber } from "~/utils/datetime";

import { listWords } from "./slots";

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
  if (row.group?.own) return m.classesClassTeacher();
  return row.subjectId ? m.classesSubjectTeacher() : m.classesTeacher();
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
        row.subjectId ? (
          subjectName(options.subjects, row.subjectId)
        ) : (
          <Value>{null}</Value>
        ),
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
  search: ClassesSearch;
  onSearch: (change: Partial<ClassesSearch>) => void;
  title: string;
  /** Places the list where the page wants it, below the header. */
  frame: (content: ReactNode) => ReactNode;
}

/** The classes the viewer teaches or assists in, in the views modules offer. */
export function MyClasses({ search, onSearch, title, frame }: MyClassesProps) {
  const words = useSlot(listWords).find(
    (each) => each.list === "classesTaught",
  );
  const views = viewsOf(useSlot(classFilters), search);
  const data = useSuspenseQuery(myClassesQuery(views)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const facets = useClassFacets(search, onSearch);
  const toolbar: IndexToolbarProps | undefined =
    facets.length > 0 ? { facets } : undefined;
  return (
    <Page width="list">
      <PageHeader title={title} />
      {frame(
        data.rows.length === 0 && !toolbar ? (
          <EmptyState
            icon={School}
            title={m.teachNoClasses()}
            description={m.classesNoneTaughtBody()}
          />
        ) : (
          <DataTable
            caption={(words?.caption ?? m.classesTaughtCaptionCore)()}
            rows={data.rows}
            columns={taughtColumns(options)}
            rowLabel={(row) => classTitle(row)}
            toolbar={toolbar}
            card={card}
            empty={{
              icon: School,
              title: m.teachNoClasses(),
              description: m.classesNoneTaughtBody(),
            }}
          />
        ),
      )}
    </Page>
  );
}
