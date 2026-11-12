import { Button } from "@faridalms/ui/button";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import { studentAttendanceQuery } from "~/queries/attendance";
import { formatNumber } from "~/utils/datetime";

import { formatRate } from "./format";
import { spanTitle } from "./StudentAttendance";

export interface StudentAttendanceSummaryProps {
  studentId: string;
  onOpen: () => void;
}

/** How a student's year of registers stands so far, with the way to every mark. */
export function StudentAttendanceSummary({
  studentId,
  onOpen,
}: StudentAttendanceSummaryProps) {
  const { summary, span } = useSuspenseQuery(
    studentAttendanceQuery(studentId),
  ).data;
  return (
    <RecordSection
      title={m.attendanceTitle()}
      description={spanTitle(span)}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          onClick={onOpen}
        >
          {m.studentAttendanceOpen()}
        </Button>
      }
    >
      {summary.sessions === 0 ? (
        <RecordEmpty>{m.attNothingYet()}</RecordEmpty>
      ) : (
        <Facts short>
          <Fact label={m.attendanceRate()}>
            {summary.rate === null ? null : formatRate(summary.rate)}
          </Fact>
          <Fact label={m.attAbsent()}>{formatNumber(summary.absent)}</Fact>
          <Fact label={m.attExcused()}>{formatNumber(summary.excused)}</Fact>
          <Fact label={m.attLate()}>{formatNumber(summary.late)}</Fact>
        </Facts>
      )}
    </RecordSection>
  );
}
