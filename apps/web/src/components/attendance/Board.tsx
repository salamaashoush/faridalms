import type { RegisterState } from "@faridalms/domain/attendance";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BellRing, ClipboardCheck, ClipboardList } from "lucide-react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Facet } from "~/components/system/IndexPage";

import { classTitle } from "~/components/classes/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { Fact, Facts, RecordSection } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { attendanceBoardQuery } from "~/queries/attendance";
import { remindTeachers } from "~/server/attendance";
import { formatNumber } from "~/utils/datetime";

import { DayNav } from "./DayNav";
import { formatDay, MEANING_LABEL, STATE_LABEL, STATE_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof attendanceBoardQuery>["queryFn"]>>
>;
type Row = Data["rows"][number] & { id: string; date: string };

const STATES: RegisterState[] = ["not_started", "in_progress", "submitted"];

function ClassLink({ row }: { row: Row }) {
  return (
    <RowLink
      to="/registers/$classId"
      params={{ classId: row.classId }}
      search={{ date: row.date, periodId: row.periodId }}
    >
      {classTitle({
        code: row.classCode,
        titleEn: row.classTitleEn,
        titleAr: row.classTitleAr,
      })}
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

function exceptions(row: Row): string {
  if (row.state === "not_started") return "–";
  const parts = (["absent", "late", "excused", "left_early"] as const)
    .filter((meaning) => row.counts[meaning])
    .map(
      (meaning) =>
        `${formatNumber(row.counts[meaning])} ${MEANING_LABEL[meaning]()}`,
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
    {
      id: "period",
      header: m.attPeriod(),
      cell: (row) => inLocale(row.periodNameEn, row.periodNameAr),
    },
    { id: "state", header: m.attStatus(), cell: (row) => <State row={row} /> },
    {
      id: "by",
      header: m.attTakenBy(),
      cell: (row) =>
        row.registerId ? (
          <bdi>{inLocale(row.recordedByNameEn, row.recordedByNameAr)}</bdi>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    },
    {
      id: "marks",
      header: m.attMarks(),
      cell: (row) => (
        <span className="text-muted-foreground">{exceptions(row)}</span>
      ),
    },
  ];
}

const card = {
  title: (row: Row) => <ClassLink row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) => exceptions(row),
};

export function Board({
  date,
  states,
  onChange,
}: {
  date: string;
  states: RegisterState[];
  onChange: (change: { date?: string; states?: RegisterState[] }) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(attendanceBoardQuery(date)).data;
  if (!data.year) return null;
  const all: Row[] = data.rows.map((row) => ({
    ...row,
    id: `${row.classId}|${row.periodId}`,
    date: data.date,
  }));
  const rows = states.length
    ? all.filter((row) => states.includes(row.state))
    : all;
  const count = (state: RegisterState) =>
    all.filter((row) => row.state === state).length;
  const total = (meaning: "absent" | "late") =>
    all.reduce((sum, row) => sum + row.counts[meaning], 0);
  const stateFacet: Facet = {
    id: "state",
    label: m.attStatus(),
    options: STATES.map((state) => ({
      value: state,
      label: STATE_LABEL[state](),
      count: count(state),
    })),
    selected: states,
    onChange: (next) => onChange({ states: next as RegisterState[] }),
  };
  const rowActions = (row: Row): RowAction[] => [
    {
      label: row.registerId ? m.attOpenRegister() : m.attTakeRegister(),
      icon: ClipboardCheck,
      inline: true,
      onSelect: () =>
        void navigate({
          to: "/registers/$classId",
          params: { classId: row.classId },
          search: { date: row.date, periodId: row.periodId },
        }),
    },
  ];
  const remind = async (chosen: Row[]) => {
    const classIds = [
      ...new Set(
        chosen
          .filter((row) => row.state !== "submitted")
          .map((row) => row.classId),
      ),
    ];
    if (classIds.length === 0) {
      toast.info(m.attRemindNone());
      return;
    }
    const { reminded } = await remindTeachers({
      data: { date: data.date, classIds },
    });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success(
      m.attReminded({ count: reminded, value: formatNumber(reminded) }),
    );
  };
  const max = data.today < data.year.lastDay ? data.today : data.year.lastDay;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base leading-6 font-semibold">
          {formatDay(data.date)}
        </h2>
        <DayNav
          id="board-date"
          date={data.date}
          min={data.year.startsOn}
          max={max}
          today={data.today}
          onChange={(next) => onChange({ date: next })}
        />
      </div>
      {data.schoolDay === false ? (
        <p className="rounded-lg border bg-card p-5 text-sm leading-5 text-muted-foreground">
          {m.attNotSchoolDay()}
        </p>
      ) : (
        <>
          <RecordSection title={m.attDaySummary()}>
            <Facts short>
              <Fact label={m.attSubmitted()}>
                {m.attOfTotal({
                  count: formatNumber(count("submitted")),
                  total: formatNumber(all.length),
                })}
              </Fact>
              <Fact label={m.attNotStarted()}>
                {formatNumber(count("not_started"))}
              </Fact>
              <Fact label={m.attInProgress()}>
                {formatNumber(count("in_progress"))}
              </Fact>
              <Fact label={m.attAbsent()}>{formatNumber(total("absent"))}</Fact>
              <Fact label={m.attLate()}>{formatNumber(total("late"))}</Fact>
            </Facts>
          </RecordSection>
          <DataTable
            caption={m.attBoardCaption()}
            rows={rows}
            columns={columns()}
            rowLabel={(row) =>
              `${classTitle({ code: row.classCode, titleEn: row.classTitleEn, titleAr: row.classTitleAr })} ${inLocale(row.periodNameEn, row.periodNameAr)}`
            }
            toolbar={{
              facets: [stateFacet],
              onReset: () => onChange({ states: [] }),
            }}
            rowActions={rowActions}
            batchActions={[
              {
                label: m.attRemind(),
                icon: BellRing,
                onSelect: remind,
              },
            ]}
            card={card}
            empty={{
              icon: ClipboardList,
              title: m.attBoardEmpty(),
              description: m.attBoardEmptyBody(),
            }}
          />
        </>
      )}
    </div>
  );
}
