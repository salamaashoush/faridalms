import type { Column } from "@faridalms/ui/system/data-table";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck, UserCheck } from "lucide-react";

import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classAttendanceQuery } from "~/queries/attendance";
import { formatNumber } from "~/utils/datetime";

import { formatRate } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classAttendanceQuery>["queryFn"]>>
>;
type Row = Data["students"][number];

function StudentLink({ row }: { row: Row }) {
  return (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.id }}
      search={{ tab: "attendance" }}
    >
      {displayName(row)}
    </RowLink>
  );
}

const count = (value: number) => (
  <span className="tabular-nums">{formatNumber(value)}</span>
);

function rate(row: Row) {
  return row.summary.rate === null ? "–" : formatRate(row.summary.rate);
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "student",
      header: m.attStudent(),
      primary: true,
      cell: (row) => <StudentLink row={row} />,
    },
    {
      id: "sessions",
      header: m.attSessions(),
      cell: (row) => count(row.summary.sessions),
    },
    {
      id: "absent",
      header: m.attAbsent(),
      cell: (row) => count(row.summary.absent),
    },
    {
      id: "excused",
      header: m.attExcused(),
      cell: (row) => count(row.summary.excused),
    },
    { id: "late", header: m.attLate(), cell: (row) => count(row.summary.late) },
    { id: "rate", header: m.attendanceRate(), cell: (row) => rate(row) },
  ];
}

const card = {
  title: (row: Row) => <StudentLink row={row} />,
  status: (row: Row) => rate(row),
  fact: (row: Row) =>
    m.attAbsentOfDays({
      absent: formatNumber(row.summary.absent + row.summary.excused),
      days: formatNumber(row.summary.sessions),
    }),
};

/** Each student's marks in this class, with the way into today's register. */
export function ClassAttendance({ classId }: { classId: string }) {
  const data = useSuspenseQuery(classAttendanceQuery(classId)).data;
  const user = useCurrentUser();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.attRegistersTaken({ count: data.registers })}
        </p>
        {data.canRecord ? (
          <ButtonLink
            to="/registers/$classId"
            params={{ classId }}
            search={{ date: user.today }}
            variant="outline"
            className="max-md:h-10"
          >
            <ClipboardCheck aria-hidden />
            {m.attTakeRegister()}
          </ButtonLink>
        ) : null}
      </div>
      <DataTable
        caption={m.attClassCaption()}
        rows={data.students}
        columns={columns()}
        rowLabel={(row) => displayName(row)}
        card={card}
        empty={{ icon: UserCheck, title: m.attNoStudents() }}
      />
    </div>
  );
}
