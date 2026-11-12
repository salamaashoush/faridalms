import type { ReportQuery } from "@faridalms/domain/attendance";
import type { Column } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { DEFAULT_REPORT_WEEKS } from "@faridalms/domain/spans";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, FileBarChart } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import { groupWords } from "~/components/classes/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { attendanceReportQuery } from "~/queries/attendance";
import { formatDate, formatNumber } from "~/utils/datetime";

import { formatRate } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof attendanceReportQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

function nameOf(row: Row, by: ReportQuery["by"]) {
  return by === "class"
    ? classTitle({
        code: row.code ?? "",
        titleEn: row.nameEn,
        titleAr: row.nameAr,
      })
    : inLocale(row.nameEn, row.nameAr);
}

interface NameProps {
  row: Row;
  by: ReportQuery["by"];
}

function Name({ row, by }: NameProps) {
  return by === "class" ? (
    <RowLink
      to="/classes/$classId"
      params={{ classId: row.id }}
      search={{ tab: "attendance" }}
    >
      {nameOf(row, by)}
    </RowLink>
  ) : (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.id }}
      search={{ tab: "attendance" }}
    >
      {nameOf(row, by)}
    </RowLink>
  );
}

interface RateProps {
  row: Row;
}

function Rate({ row }: RateProps) {
  if (row.summary.rate === null)
    return <span className="text-muted-foreground">–</span>;
  return row.chronic ? (
    <StatusText tone="warning">
      {m.attRateChronic({ rate: formatRate(row.summary.rate) })}
    </StatusText>
  ) : (
    <span className="tabular-nums">{formatRate(row.summary.rate)}</span>
  );
}

const count = (value: number) => (
  <span className="tabular-nums">{formatNumber(value)}</span>
);

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(by: ReportQuery["by"], group: string): Column<Row>[] {
  return [
    {
      id: "name",
      header: by === "class" ? m.attClass() : m.attStudent(),
      primary: true,
      cell: (row) => <Name row={row} by={by} />,
    },
    ...(by === "student"
      ? [
          {
            id: "class",
            header: group,
            cell: (row: Row) => inLocale(row.classTitleEn, row.classTitleAr),
          },
        ]
      : []),
    {
      id: "sessions",
      header: m.attDaysRecorded(),
      cell: (row) => count(row.summary.sessions),
    },
    {
      id: "absent",
      header: m.attAbsent(),
      cell: (row) => count(row.counts.absent),
    },
    {
      id: "excused",
      header: m.attExcused(),
      cell: (row) => count(row.counts.excused),
    },
    { id: "late", header: m.attLate(), cell: (row) => count(row.counts.late) },
    {
      id: "rate",
      header: m.attendanceRate(),
      cell: (row) => <Rate row={row} />,
    },
  ];
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(data: Data, by: ReportQuery["by"]) {
  const header = [
    by === "class" ? m.attClass() : m.attStudent(),
    m.attDaysRecorded(),
    m.attPresent(),
    m.attAbsent(),
    m.attExcused(),
    m.attLate(),
    m.attLeftEarly(),
    m.attendanceRate(),
  ];
  const lines = data.rows.map((row) =>
    [
      nameOf(row, by),
      row.summary.sessions,
      row.counts.present,
      row.counts.absent,
      row.counts.excused,
      row.counts.late,
      row.counts.left_early,
      row.summary.rate ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(
    [`﻿${[header.map(csvCell).join(","), ...lines].join("\n")}`],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${by}-${data.from}-${data.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const cardFor = (by: ReportQuery["by"]) => ({
  title: (row: Row) => <Name row={row} by={by} />,
  status: (row: Row) => <Rate row={row} />,
  fact: (row: Row) =>
    m.attAbsentOfDays({
      absent: formatNumber(row.counts.absent + row.counts.excused),
      days: formatNumber(row.summary.sessions),
    }),
});

export interface ReportProps {
  query: ReportQuery;
  onChange: (change: Partial<ReportQuery>) => void;
}

export function Report({ query, onChange }: ReportProps) {
  const group = useSlot(groupWords)[0]?.group() ?? m.attClass();
  const data = useSuspenseQuery(attendanceReportQuery(query)).data;
  // The first span a module names is the default; with none, the last weeks are.
  const spanFacet: Facet = {
    id: "span",
    label: m.attSpan(),
    single: true,
    options: [
      ...(data.spans.length === 0
        ? [
            {
              value: "",
              label: m.attLastWeeks({ count: DEFAULT_REPORT_WEEKS }),
            },
          ]
        : []),
      ...data.spans.map((span) => ({
        value: span.key,
        label: inLocale(span.titleEn, span.titleAr),
      })),
    ],
    selected: [data.span],
    defaultSelected: [data.spans[0]?.key ?? ""],
    onChange: ([next]) => onChange({ span: next ?? "", from: "", to: "" }),
  };
  const byFacet: Facet = {
    id: "by",
    label: m.attBy(),
    single: true,
    options: [
      { value: "student", label: m.attByStudent() },
      { value: "class", label: group },
    ],
    selected: [query.by],
    defaultSelected: ["student"],
    onChange: ([next]) =>
      onChange({ by: next === "class" ? "class" : "student" }),
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.attReportRange({
            from: formatDate(data.from),
            to: formatDate(data.to),
            threshold: formatRate(data.chronicPercent),
          })}
        </p>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={data.rows.length === 0}
          onClick={() => download(data, query.by)}
        >
          <Download aria-hidden />
          {m.attExport()}
        </Button>
      </div>
      <DataTable
        caption={m.attReportCaption()}
        rows={data.rows}
        columns={columns(query.by, group)}
        rowLabel={(row) => nameOf(row, query.by)}
        toolbar={{
          search: {
            value: query.q,
            onChange: (q) => onChange({ q }),
            label: m.attSearchReport(),
            placeholder: m.attSearchReportPlaceholder(),
          },
          facets: [spanFacet, byFacet],
          onReset: () =>
            onChange({ q: "", span: "", from: "", to: "", by: "student" }),
          period: (
            <>
              <Input
                id="report-from"
                type="date"
                aria-label={m.attFrom()}
                className="h-8 w-40 max-md:h-10"
                value={data.from}
                max={data.to}
                onChange={(event) =>
                  event.target.value &&
                  onChange({ span: "", from: event.target.value, to: data.to })
                }
              />
              <Input
                id="report-to"
                type="date"
                aria-label={m.attTo()}
                className="h-8 w-40 max-md:h-10"
                value={data.to}
                min={data.from}
                max={data.today}
                onChange={(event) =>
                  event.target.value &&
                  onChange({
                    span: "",
                    from: data.from,
                    to: event.target.value,
                  })
                }
              />
            </>
          ),
        }}
        card={cardFor(query.by)}
        empty={{
          icon: FileBarChart,
          title: m.attReportEmpty(),
          description: m.attReportEmptyBody(),
        }}
      />
    </div>
  );
}
