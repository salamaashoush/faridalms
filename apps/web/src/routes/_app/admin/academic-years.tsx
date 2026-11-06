import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Pencil, Plus } from "lucide-react";

import {
  STANDING_LABEL,
  STANDING_TONE,
  yearDates,
  yearTitle,
} from "~/components/years/format";
import {
  lifecycleActions,
  rolloverActions,
  useYearLifecycle,
} from "~/components/years/YearLifecycle";
import * as m from "~/i18n/messages";
import { yearsQuery } from "~/queries/years";
import { formatNumber } from "~/utils/datetime";

type Data = Awaited<ReturnType<NonNullable<(typeof yearsQuery)["queryFn"]>>>;
type YearRow = Data["years"][number];

export const Route = createFileRoute("/_app/admin/academic-years")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(yearsQuery);
  },
  component: YearsPage,
});

function YearName({ row }: { row: YearRow }) {
  return (
    <RowLink to="/years/$yearId" params={{ yearId: row.id }} search={{}}>
      {yearTitle(row)}
    </RowLink>
  );
}

function Standing({ row }: { row: YearRow }) {
  return (
    <StatusText tone={STANDING_TONE[row.standing]}>
      {STANDING_LABEL[row.standing]()}
    </StatusText>
  );
}

function Count({ value }: { value: number }) {
  return <span className="tabular-nums">{formatNumber(value)}</span>;
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function yearColumns(): Column<YearRow>[] {
  return [
    {
      id: "name",
      header: m.yearsName(),
      primary: true,
      cell: (row) => <YearName row={row} />,
    },
    { id: "dates", header: m.yearsDates(), cell: (row) => yearDates(row) },
    {
      id: "status",
      header: m.yearsStatus(),
      cell: (row) => <Standing row={row} />,
    },
    {
      id: "terms",
      header: m.yearsTerms(),
      className: "text-end",
      cell: (row) => <Count value={row.terms} />,
    },
    {
      id: "classes",
      header: m.adminClassesTitle(),
      className: "text-end",
      cell: (row) => <Count value={row.classes} />,
    },
    {
      id: "students",
      header: m.classesStudents(),
      className: "text-end",
      cell: (row) => <Count value={row.students} />,
    },
  ];
}

const card = {
  title: (row: YearRow) => <YearName row={row} />,
  fact: (row: YearRow) => (
    <span className="flex flex-wrap items-center gap-x-3">
      <Standing row={row} />
      <span>{yearDates(row)}</span>
    </span>
  ),
};

function YearsPage() {
  const data = useSuspenseQuery(yearsQuery).data;
  const navigate = useNavigate();
  const current = data.years.find((row) => row.lifecycle === "current") ?? null;
  const lifecycle = useYearLifecycle(current);
  const create: HeaderAction | undefined = data.access.manage
    ? {
        label: m.yearsAdd(),
        icon: Plus,
        link: { to: "/admin/academic-year-editor", search: {} },
      }
    : undefined;
  const rowActions = (row: YearRow): RowAction[] => [
    ...(data.access.manage && row.lifecycle !== "closed"
      ? [
          {
            label: m.yearsEdit(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/admin/academic-year-editor",
                search: { id: row.id },
              }),
          },
        ]
      : []),
    ...rolloverActions(row, current, data.access, (source, target) => {
      void navigate({ to: "/admin/rollover", search: { source, target } });
    }),
    ...lifecycleActions(row, data.access, lifecycle.open),
  ];
  return (
    <>
      <PageHeader
        title={m.academicYearsTitle()}
        description={m.yearsHint()}
        count={data.years.length}
        action={data.years.length === 0 ? undefined : create}
      />
      <DataTable
        caption={m.yearsCaption()}
        rows={data.years}
        columns={yearColumns()}
        rowLabel={(row) => yearTitle(row)}
        rowActions={rowActions}
        card={card}
        empty={{
          icon: CalendarDays,
          title: m.yearsEmptyTitle(),
          description: m.yearsEmptyBody(),
          action: data.access.manage ? (
            <ButtonLink to="/admin/academic-year-editor" search={{}}>
              <Plus aria-hidden />
              {m.yearsAdd()}
            </ButtonLink>
          ) : undefined,
        }}
      />
      {lifecycle.sheet}
    </>
  );
}
