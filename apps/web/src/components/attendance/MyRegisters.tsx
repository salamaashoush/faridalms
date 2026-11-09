import type {
  AttendanceCounts,
  RegisterState,
} from "@faridalms/domain/attendance";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, UserCheck } from "lucide-react";

import { DayNav } from "~/components/attendance/DayNav";
import {
  MEANING_LABEL,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/attendance/format";
import { classTitle } from "~/components/classes/format";
import { NoSchoolYear } from "~/components/years/NoSchoolYear";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { attendanceDayQuery } from "~/queries/attendance";
import { formatDate, formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof attendanceDayQuery>["queryFn"]>>
>;

interface Row {
  id: string;
  classId: string;
  classTitle: string;
  periodId: string;
  periodName: string;
  state: RegisterState;
  counts: AttendanceCounts | null;
  students: number;
  date: string;
  /** A lesson the teacher covers for someone away. */
  cover: boolean;
}

function rowsOf(data: Data): Row[] {
  const periodName = (periodId: string) => {
    const period = data.periods.find((row) => row.id === periodId);
    return period ? inLocale(period.nameEn, period.nameAr) : "";
  };
  const classOf = new Map(data.classes.map((row) => [row.id, row]));
  const cells = [
    ...data.expected,
    ...data.registers.filter(
      (register) =>
        !data.expected.some(
          (row) =>
            row.classId === register.classId &&
            row.periodId === register.periodId,
        ),
    ),
  ];
  return cells.flatMap(({ classId, periodId }) => {
    const found = classOf.get(classId);
    if (!found) return [];
    const register = data.registers.find(
      (row) => row.classId === classId && row.periodId === periodId,
    );
    const cover = data.expected.some(
      (row) =>
        row.classId === classId && row.periodId === periodId && row.cover,
    );
    return [
      {
        id: `${classId}|${periodId}`,
        classId,
        classTitle: classTitle(found),
        periodId,
        periodName: periodName(periodId),
        state: register?.state ?? "not_started",
        counts: register?.counts ?? null,
        students: register?.students ?? found.students,
        date: data.date,
        cover,
      },
    ];
  });
}

interface ClassLinkProps {
  row: Row;
}

function ClassLink({ row }: ClassLinkProps) {
  return (
    <RowLink
      to="/registers/$classId"
      params={{ classId: row.classId }}
      search={{ date: row.date, periodId: row.periodId }}
    >
      {row.classTitle}
    </RowLink>
  );
}

interface StateProps {
  row: Row;
}

function State({ row }: StateProps) {
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
    { id: "period", header: m.attPeriod(), cell: periodOf },
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

function periodOf(row: Row) {
  return row.cover
    ? m.attPeriodCover({ period: row.periodName })
    : row.periodName;
}

const card = {
  title: (row: Row) => <ClassLink row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: periodOf,
};

export interface MyRegistersProps {
  date: string;
  onDate: (date: string) => void;
}

/** The registers of one day the viewer takes: their own lessons and those they cover. */
export function MyRegisters({ date, onDate }: MyRegistersProps) {
  const navigate = useNavigate();
  const data = useSuspenseQuery(attendanceDayQuery(date)).data;
  const rows = rowsOf(data);
  const open = (row: Row) =>
    navigate({
      to: "/registers/$classId",
      params: { classId: row.classId },
      search: { date: row.date, periodId: row.periodId },
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
  if (!data.year) return <NoSchoolYear shows={m.noYearShowsRegisters()} />;
  const max = data.today < data.year.lastDay ? data.today : data.year.lastDay;
  return (
    <>
      <div className="mb-4">
        <IndexToolbar
          period={
            <>
              <DayNav
                id="attendance-date"
                date={data.date}
                min={data.year.startsOn}
                max={max}
                today={data.today}
                onChange={onDate}
              />
              <h2 aria-live="polite" className="text-sm leading-5 font-medium">
                {formatDate(data.date, "weekday")}
              </h2>
            </>
          }
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
