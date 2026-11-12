import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

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

import type { ClassesTabProps } from "~/components/classes/slots";

import { useClassFacets } from "~/components/classes/class-facets";
import { classTitle, subjectName } from "~/components/classes/format";
import { classFilters, viewsOf } from "~/components/classes/slots";
import { displayName, labelOf } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { homeroomDirectoryQuery } from "~/queries/homerooms";
import { formatList, formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof homeroomDirectoryQuery>["queryFn"]>>
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
    <StatusText tone="warning">{m.classesNoTeacher()}</StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function classColumns(options: Options): Column<ClassRow>[] {
  const grade = (id: string | null) =>
    labelOf(options.grades.find((row) => row.id === id) ?? null);
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
    {
      id: "grade",
      header: m.studentGrade(),
      cell: (row) => <Value>{grade(row.gradeId)}</Value>,
    },
    {
      id: "teacher",
      header: m.classesClassTeacher(),
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
      id: "subjects",
      header: m.classesSubjects(),
      cell: (row) =>
        row.subjects.length ? (
          <span className="line-clamp-2">
            {formatList(
              row.subjects.map((subject) =>
                subjectName(options.subjects, subject.subjectId),
              ),
            )}
          </span>
        ) : (
          <Value>{null}</Value>
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

/** The school's homerooms with their subject classes, to find and manage. */
export function HomeroomDirectory({
  search,
  onSearch: patch,
  title,
  frame,
}: ClassesTabProps) {
  const navigate = useNavigate();
  const filters = useSlot(classFilters);
  const views = viewsOf(filters, search);
  const data = useSuspenseQuery(homeroomDirectoryQuery(search, views)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const moduleFacets = useClassFacets(search, patch);
  const gradeFacet: Facet = {
    id: "grade",
    label: m.studentGrade(),
    options: options.grades.map((row) => ({
      value: row.id,
      label: labelOf(row) ?? row.code,
    })),
    selected: search.grade,
    onChange: (grade) => patch({ grade }),
  };
  const create: HeaderAction | undefined = data.manage
    ? {
        label: m.homeroomsAdd(),
        icon: Plus,
        link: { to: "/homeroom-editor", search: views },
      }
    : undefined;
  const rowActions = (row: ClassRow): RowAction[] =>
    data.manage
      ? [
          {
            label: m.homeroomsEdit(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/homeroom-editor",
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
    facets: [...moduleFacets, gradeFacet],
    onReset: () =>
      patch({
        q: "",
        grade: [],
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
          caption={m.homeroomsCaption()}
          rows={data.rows}
          columns={classColumns(options)}
          rowLabel={(row) => classTitle(row)}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: School,
            title: m.homeroomsEmptyTitle(),
            description: m.homeroomsEmptyBody(),
            action: data.manage ? (
              <ButtonLink to="/homeroom-editor" search={views}>
                <Plus aria-hidden />
                {m.homeroomsAdd()}
              </ButtonLink>
            ) : undefined,
          }}
        />,
      )}
    </Page>
  );
}
