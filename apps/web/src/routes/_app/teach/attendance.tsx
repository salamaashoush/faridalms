import type {
  AttendanceCounts,
  RegisterState,
} from "@faridalms/domain/attendance";

import { dayQuerySchema } from "@faridalms/domain/attendance";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ClipboardCheck, UserCheck } from "lucide-react";
import * as v from "valibot";

import type { Column, RowAction } from "~/components/system/DataTable";

import { DayNav } from "~/components/attendance/DayNav";
import {
  formatDay,
  MEANING_LABEL,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/attendance/format";
import { classTitle } from "~/components/classes/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { attendanceDayQuery } from "~/queries/attendance";
import { formatNumber } from "~/utils/datetime";

const DEFAULT_SEARCH = v.parse(dayQuerySchema, {});

export const Route = createFileRoute("/_app/teach/attendance")({
  validateSearch: dayQuerySchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(attendanceDayQuery(deps.date));
  },
  component: TeacherAttendancePage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof attendanceDayQuery>["queryFn"]>>
>;

interface Row {
  id: string;
  classId: string;
  classTitle: string;
  periodId: string | null;
  periodName: string;
  state: RegisterState;
  counts: AttendanceCounts | null;
  students: number;
  date: string;
}

function rowsOf(data: Data): Row[] {
  const periodName = (periodId: string | null) => {
    const period = data.periods.find((row) => row.id === periodId);
    return period ? inLocale(period.nameEn, period.nameAr) : "";
  };
  return data.classes.flatMap((row) => {
    const taken = data.registers.filter(
      (register) => register.classId === row.id,
    );
    const expected = taken.some(
      (register) =>
        !row.defaultPeriodId || register.periodId === row.defaultPeriodId,
    )
      ? []
      : [
          {
            id: `${row.id}|${row.defaultPeriodId ?? ""}`,
            classId: row.id,
            classTitle: classTitle(row),
            periodId: row.defaultPeriodId,
            periodName: row.defaultPeriodId
              ? periodName(row.defaultPeriodId)
              : m.attAnyPeriod(),
            state: "not_started" as const,
            counts: null,
            students: row.students,
            date: data.date,
          },
        ];
    return [
      ...expected,
      ...taken.map((register) => ({
        id: `${row.id}|${register.periodId}`,
        classId: row.id,
        classTitle: classTitle(row),
        periodId: register.periodId,
        periodName: periodName(register.periodId),
        state: register.state,
        counts: register.counts,
        students: register.students,
        date: data.date,
      })),
    ];
  });
}

function ClassLink({ row }: { row: Row }) {
  return (
    <RowLink
      to="/registers/$classId"
      params={{ classId: row.classId }}
      search={{ date: row.date, periodId: row.periodId ?? undefined }}
    >
      {row.classTitle}
    </RowLink>
  );
}

function State({ row }: { row: Row }) {
  return (
    <StatusText tone={STATE_TONE[row.state]}>
      {STATE_LABEL[row.state]()}
    </StatusText>
  );
}

function marked(row: Row): string | null {
  if (!row.counts) return null;
  const parts = (["absent", "late", "excused", "left_early"] as const)
    .filter((meaning) => row.counts?.[meaning])
    .map(
      (meaning) =>
        `${formatNumber(row.counts?.[meaning] ?? 0)} ${MEANING_LABEL[meaning]()}`,
    );
  return parts.length ? parts.join(" · ") : m.attAllPresent();
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "class",
      header: m.attClass(),
      primary: true,
      cell: (row) => <ClassLink row={row} />,
    },
    { id: "period", header: m.attPeriod(), cell: (row) => row.periodName },
    { id: "state", header: m.attStatus(), cell: (row) => <State row={row} /> },
    {
      id: "marks",
      header: m.attMarks(),
      cell: (row) => (
        <span className="text-muted-foreground">{marked(row) ?? "–"}</span>
      ),
    },
  ];
}

const card = {
  title: (row: Row) => <ClassLink row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) => row.periodName,
};

function TeacherAttendancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(attendanceDayQuery(search.date)).data;
  const rows = rowsOf(data);
  const open = (row: Row) =>
    navigate({
      to: "/registers/$classId",
      params: { classId: row.classId },
      search: { date: row.date, periodId: row.periodId ?? undefined },
    });
  const rowActions = (row: Row): RowAction[] => [
    {
      label:
        row.state === "not_started" ? m.attTakeRegister() : m.attOpenRegister(),
      icon: ClipboardCheck,
      inline: true,
      onSelect: () => void open(row),
    },
  ];
  if (!data.year)
    return (
      <>
        <PageHeader title={m.attendanceTitle()} />
        <EmptyState icon={UserCheck} title={m.attNoYear()} />
      </>
    );
  const max = data.today < data.year.lastDay ? data.today : data.year.lastDay;
  return (
    <>
      <PageHeader
        title={m.attendanceTitle()}
        description={m.attTeacherHint()}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base leading-6 font-semibold">
          {formatDay(data.date)}
        </h2>
        <DayNav
          id="attendance-date"
          date={data.date}
          min={data.year.startsOn}
          max={max}
          today={data.today}
          onChange={(date) => void navigate({ search: { date } })}
        />
      </div>
      <DataTable
        caption={m.attRegistersCaption()}
        rows={rows}
        columns={columns()}
        rowLabel={(row) => `${row.classTitle} ${row.periodName}`}
        rowActions={rowActions}
        card={card}
        empty={{
          icon: UserCheck,
          title: m.attNoClasses(),
          description: m.attNoClassesBody(),
        }}
      />
    </>
  );
}
