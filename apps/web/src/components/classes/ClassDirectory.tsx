import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { IndexToolbarProps } from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";
import type { ReactNode } from "react";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { isFiltered } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, School } from "lucide-react";

import type { ClassesSearch } from "~/components/classes/slots";

import {
  endedFacet,
  useClassColumns,
  useClassFacets,
  useNarrowed,
} from "~/components/classes/class-facets";
import { classTitle, subjectName } from "~/components/classes/format";
import { classFilters, viewsOf } from "~/components/classes/slots";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classDirectoryQuery, classOptionsQuery } from "~/queries/classes";
import { formatNumber } from "~/utils/datetime";

import { listWords } from "./slots";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classDirectoryQuery>["queryFn"]>>
>;
type ClassRow = Data["rows"][number];
type Options = Awaited<
  ReturnType<NonNullable<(typeof classOptionsQuery)["queryFn"]>>
>;

interface ClassNameProps {
  row: ClassRow;
}

function ClassName({ row }: ClassNameProps) {
  return (
    <RowLink to="/classes/$classId" params={{ classId: row.id }} search={{}}>
      {classTitle(row)}
    </RowLink>
  );
}

interface TeacherProps {
  row: ClassRow;
}

function Teacher({ row }: TeacherProps) {
  const teacher = row.teachers[0];
  return teacher ? (
    <bdi>{displayName(teacher)}</bdi>
  ) : (
    <StatusText tone="warning">{m.classesNoTeacherYet()}</StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function classColumns(
  options: Options,
  modules: readonly Column<ClassRow>[],
): Column<ClassRow>[] {
  const room = (id: string | null) => {
    const found = options.rooms.find((row) => row.id === id);
    return found ? inLocale(found.nameEn, found.nameAr) || found.code : null;
  };
  return [
    {
      id: "name",
      header: m.classesName(),
      primary: true,
      cell: (row) => (
        <div className="grid min-w-0">
          <ClassName row={row} />
          <span
            dir="ltr"
            className="justify-self-start font-mono text-[13px] leading-[18px] text-muted-foreground"
          >
            {row.code}
          </span>
        </div>
      ),
    },
    ...modules,
    {
      id: "subject",
      header: m.classesSubject(),
      cell: (row) => (
        <Value>{subjectName(options.subjects, row.subjectId) || null}</Value>
      ),
    },
    {
      id: "teacher",
      header: m.classesTeacher(),
      cell: (row) => <Teacher row={row} />,
    },
    {
      id: "students",
      header: m.classesStudents(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.students)}</span>
      ),
    },
    {
      id: "room",
      header: m.classesRoom(),
      cell: (row) => <Value>{room(row.locationId)}</Value>,
    },
  ];
}

const card = {
  title: (row: ClassRow) => <ClassName row={row} />,
  fact: (row: ClassRow) => (
    <span className="flex flex-wrap items-center gap-x-3">
      <Teacher row={row} />
      <span className="tabular-nums">
        {m.classesStudentCount({ count: row.students })}
      </span>
    </span>
  ),
};

export interface ClassDirectoryProps {
  search: ClassesSearch;
  onSearch: (change: Partial<ClassesSearch>) => void;
  title: string;
  /** Places the list where the page wants it, below the header. */
  frame: (content: ReactNode) => ReactNode;
}

/** Every class the viewer reaches, to find and manage. */
export function ClassDirectory({
  search,
  onSearch: patch,
  title,
  frame,
}: ClassDirectoryProps) {
  const words = useSlot(listWords).find((each) => each.list === "classes");
  const navigate = useNavigate();
  const filters = useSlot(classFilters);
  const views = viewsOf(filters, search);
  const data = useSuspenseQuery(classDirectoryQuery({ ...search, views })).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const moduleFacets = useClassFacets(search, patch);
  const narrowed = useNarrowed(search);
  const whenFacet = endedFacet(search.ended, (ended) => patch({ ended }));
  const moduleColumns = useClassColumns<ClassRow>(data.columns);
  const create: HeaderAction | undefined = data.manage
    ? {
        label: m.classesAdd(),
        icon: Plus,
        link: { to: "/class-editor", search: views },
      }
    : undefined;
  const rowActions = (row: ClassRow): RowAction[] =>
    data.manage
      ? [
          {
            label: m.classesEdit(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/class-editor",
                search: { id: row.id },
              }),
          },
        ]
      : [];
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q }),
      label: m.classesSearchHint(),
      placeholder: m.classesSearchPlaceholder(),
    },
    facets: [...moduleFacets, ...(narrowed ? [] : [whenFacet])],
    onReset: () =>
      patch({
        q: "",
        ended: false,
        ...Object.fromEntries(filters.map((filter) => [filter.key, undefined])),
      }),
  };
  return (
    <Page width="list">
      <PageHeader
        title={title}
        count={search.q ? undefined : data.rows.length}
        action={
          data.rows.length === 0 && !isFiltered(toolbar) ? undefined : create
        }
      />
      {frame(
        <DataTable
          caption={(words?.caption ?? m.classesAllCaptionCore)()}
          rows={data.rows}
          columns={classColumns(options, moduleColumns)}
          rowLabel={(row) => classTitle(row)}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: School,
            title: (words?.title ?? m.classesEmptyTitleCore)(),
            description: (words?.body ?? m.classesEmptyBodyCore)(),
            action: data.manage ? (
              <ButtonLink to="/class-editor" search={views}>
                <Plus aria-hidden />
                {m.classesAdd()}
              </ButtonLink>
            ) : undefined,
          }}
        />,
      )}
    </Page>
  );
}
