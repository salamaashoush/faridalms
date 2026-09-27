import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentAttendanceQuery } from "~/queries/attendance";
import { formatDate, formatNumber } from "~/utils/datetime";

import { formatRate, labelOf, markText, MEANING_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentAttendanceQuery>["queryFn"]>>
>;
type Mark = Data["marks"][number];

function MarkRow({ mark, reasons }: { mark: Mark; reasons: Data["reasons"] }) {
  const reason = reasons.find((row) => row.id === mark.reasonId);
  const where = [
    classTitle({
      code: mark.classCode,
      titleEn: mark.classTitleEn,
      titleAr: mark.classTitleAr,
    }),
    inLocale(mark.periodNameEn, mark.periodNameAr),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm leading-5 font-medium">
          {formatDate(mark.date)}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {where}
        </span>
        {reason || mark.note ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {reason ? labelOf(reason) : null}
            {reason && mark.note ? " · " : null}
            {mark.note ? <bdi>{mark.note}</bdi> : null}
          </span>
        ) : null}
      </div>
      <StatusText tone={MEANING_TONE[mark.meaning]}>
        {markText(mark)}
      </StatusText>
    </li>
  );
}

/** A student's year of attendance, as they, their family and staff read it. */
export function StudentAttendance({ studentId = "" }: { studentId?: string }) {
  const data = useSuspenseQuery(studentAttendanceQuery(studentId)).data;
  const { summary } = data;
  return (
    <div className="grid gap-6">
      {data.chronic && summary.rate !== null ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-5">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden
          />
          {m.attChronicNotice({
            missed: formatRate(100 - summary.rate),
            threshold: formatRate(data.chronicPercent),
          })}
        </p>
      ) : null}
      <RecordSection title={m.attThisYear()} description={m.attDailyHint()}>
        {summary.sessions === 0 ? (
          <RecordEmpty>{m.attNothingYet()}</RecordEmpty>
        ) : (
          <Facts short>
            <Fact label={m.attendanceRate()}>
              {summary.rate === null ? null : formatRate(summary.rate)}
            </Fact>
            <Fact label={m.attDaysRecorded()}>
              {formatNumber(summary.sessions)}
            </Fact>
            <Fact label={m.attPresent()}>{formatNumber(summary.present)}</Fact>
            <Fact label={m.attAbsent()}>{formatNumber(summary.absent)}</Fact>
            <Fact label={m.attExcused()}>{formatNumber(summary.excused)}</Fact>
            <Fact label={m.attLate()}>{formatNumber(summary.late)}</Fact>
          </Facts>
        )}
      </RecordSection>
      <RecordSection title={m.attMarksTitle()} description={m.attMarksHint()}>
        {data.marks.length === 0 ? (
          <RecordEmpty>{m.attNoMarks()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.marks.map((mark) => (
              <MarkRow key={mark.id} mark={mark} reasons={data.reasons} />
            ))}
          </RecordList>
        )}
      </RecordSection>
    </div>
  );
}
