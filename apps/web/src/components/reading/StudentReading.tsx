import type { Column } from "@faridalms/ui/system/data-table";

import { READING_LANGUAGES } from "@faridalms/domain/reading";
import { DataTable } from "@faridalms/ui/system/data-table";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { TrendChart } from "@faridalms/ui/system/trend-chart";
import { Value } from "@faridalms/ui/system/value";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";

import { LOCALE_NAME } from "~/components/content/languages";
import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentReadingQuery } from "~/queries/reading";
import { formatInstant, formatNumber, formatPercent } from "~/utils/datetime";

type Reading = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof studentReadingQuery>["queryFn"]>>
  >
>["readings"][number];
type Row = Reading & { id: string };

const STANDING = {
  below: { tone: "warning", label: m.readingBelowNorm },
  near: { tone: "neutral", label: m.readingNearNorm },
  above: { tone: "success", label: m.readingAboveNorm },
} as const;

const SEASON_LABEL = {
  fall: m.readingSeasonFall,
  winter: m.readingSeasonWinter,
  spring: m.readingSeasonSpring,
};

interface StandingCellProps {
  row: Row;
}

function StandingCell({ row }: StandingCellProps) {
  if (!row.standing || !row.norm?.p50)
    return <Value notApplicable>{null}</Value>;
  const standing = STANDING[row.standing];
  return (
    <StatusText tone={standing.tone}>
      {m.readingAgainstNorm({
        standing: standing.label(),
        norm: formatNumber(row.norm.p50),
        season: SEASON_LABEL[row.season](),
      })}
    </StatusText>
  );
}

// Built per render: headers read the request's locale.
const columns = (): Column<Row>[] => [
  {
    id: "when",
    header: m.readingWhen(),
    cell: (row) => formatInstant(row.markedAt, "date"),
  },
  {
    id: "title",
    header: m.readingWhat(),
    primary: true,
    cell: (row) => <bdi>{row.title}</bdi>,
  },
  {
    id: "wcpm",
    header: m.readingPerMinute(),
    align: "end",
    cell: (row) => formatNumber(row.perMinute),
  },
  {
    id: "accuracy",
    header: m.readingAccuracy(),
    align: "end",
    cell: (row) => formatPercent(Math.round(row.accuracy * 100)),
  },
  {
    id: "norm",
    header: m.readingNorm(),
    cell: (row) => <StandingCell row={row} />,
  },
  {
    id: "practise",
    header: m.readingToPractise(),
    width: "medium",
    cell: (row) =>
      row.practise.length ? (
        <bdi>{row.practise.join(m.readingWordSeparator())}</bdi>
      ) : (
        <Value notApplicable>{null}</Value>
      ),
  },
];

const card = {
  title: (row: Row) => <bdi>{row.title}</bdi>,
  status: (row: Row) => <StandingCell row={row} />,
  fact: (row: Row) =>
    m.readingCardFact({
      date: formatInstant(row.markedAt, "date"),
      count: formatNumber(row.perMinute),
      accuracy: formatPercent(Math.round(row.accuracy * 100)),
    }),
};

export interface StudentReadingProps {
  studentId: string;
}

/**
 * A student's reading aloud over the school year, for staff: words correct
 * a minute at each reading a teacher marked, against the norm for the
 * student's grade at that time of year, with the words to practise. Shown
 * only once there is a marked reading.
 */
export function StudentReading({ studentId }: StudentReadingProps) {
  const reads = useCapability("people:read");
  const data = useQuery({
    ...studentReadingQuery(studentId),
    enabled: reads,
  }).data;
  if (!data || data.readings.length === 0) return null;
  const rows: Row[] = data.readings.map((reading, index) => ({
    ...reading,
    id: `${reading.sourceId}-${index}`,
  }));
  return (
    <RecordSection title={m.readingTitle()} description={m.readingStaffHint()}>
      <div className="grid gap-6 px-5 pb-5">
        {READING_LANGUAGES.map((language) => {
          const own = rows.filter((row) => row.language === language);
          if (own.length === 0) return null;
          return (
            <TrendChart
              key={language}
              label={m.readingChartTitle({ language: LOCALE_NAME[language]() })}
              points={own.map((row) => ({
                id: row.id,
                at: row.markedAt,
                value: row.perMinute,
                label: m.readingPoint({
                  date: formatInstant(row.markedAt, "date"),
                  count: formatNumber(row.perMinute),
                }),
              }))}
              reference={{
                label: m.readingNormLine(),
                valueAt: (point) =>
                  own.find((row) => row.id === point.id)?.norm?.p50 ?? null,
              }}
            />
          );
        })}
        <DataTable
          caption={m.readingCaption()}
          rows={rows}
          columns={columns()}
          rowLabel={(row) => row.title}
          card={card}
          empty={{ icon: BookOpenText, title: m.readingNone() }}
        />
      </div>
    </RecordSection>
  );
}
