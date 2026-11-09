import type { ClassDirectoryQuery } from "@faridalms/domain/classes";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
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

import { classTitle, subjectName } from "~/components/classes/format";
import { displayName, labelOf } from "~/components/people/format";
import { NoSchoolYear } from "~/components/years/NoSchoolYear";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classDirectoryQuery, classOptionsQuery } from "~/queries/classes";
import { formatList, formatNumber } from "~/utils/datetime";

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

export interface ClassDirectoryProps {
  search: ClassDirectoryQuery;
  onSearch: (change: Partial<ClassDirectoryQuery>) => void;
  title: string;
  /** Places the list where the page wants it, below the header. */
  frame: (content: ReactNode) => ReactNode;
}

/** Every class the viewer reaches in a school year, to find and manage. */
export function ClassDirectory({
  search,
  onSearch: patch,
  title,
  frame,
}: ClassDirectoryProps) {
  const navigate = useNavigate();
  const data = useSuspenseQuery(classDirectoryQuery(search)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  if (!data.year)
    return (
      <Page width="list">
        <PageHeader title={title} />
        {frame(<NoSchoolYear shows={m.noYearShowsClasses()} />)}
      </Page>
    );
  const year = data.year;
  const yearFacet: Facet = {
    id: "year",
    label: m.workingYear(),
    single: true,
    options: options.years.map((row) => ({
      value: row.id,
      label: inLocale(row.titleEn, row.titleAr),
      hint:
        row.id === options.workingYearId
          ? m.workingYearDefaultHint()
          : row.lifecycle === "closed"
            ? m.classesYearClosed()
            : undefined,
    })),
    selected: [year.id],
    defaultSelected: options.workingYearId ? [options.workingYearId] : [],
    onChange: ([next = ""]) =>
      patch({ year: next === options.workingYearId ? "" : next }),
  };
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
        label: m.classesAdd(),
        icon: Plus,
        link: { to: "/class-editor", search: { year: year.id } },
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
                search: { year: year.id, id: row.id },
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
    facets: [yearFacet, gradeFacet],
    onReset: () => patch({ q: "", grade: [], year: "" }),
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
          caption={m.classesCaption()}
          rows={data.rows}
          columns={classColumns(options)}
          rowLabel={(row) => classTitle(row)}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: School,
            title: m.classesEmptyTitle(),
            description: m.classesEmptyBody(),
            action: data.manage ? (
              <ButtonLink to="/class-editor" search={{ year: year.id }}>
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
