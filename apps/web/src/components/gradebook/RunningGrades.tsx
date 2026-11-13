import { EmptyState } from "@faridalms/ui/system/empty-state";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import { gradeWithScore, resultText } from "~/components/grading/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { runningGradesQuery } from "~/queries/gradebook";
import { formatNumber } from "~/utils/datetime";
import { useWords } from "~/utils/words";

type RunningData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof runningGradesQuery>["queryFn"]>>
>;
type RunningClassRow = RunningData["classes"][number];
type RunningPartRow = RunningClassRow["parts"][number];

const tenths = (value: number) => formatNumber(Math.round(value * 10) / 10);

/** The running grade as read: "86.5%", or "B (86.5%)" on a scale. */
function runningText(row: RunningClassRow): string {
  if (row.percent === null) return m.gradebookNoGradedWork();
  const percent = m.gradebookPercent({ value: tenths(row.percent) });
  return row.grade ? gradeWithScore(row.grade, percent) : percent;
}

interface RunningPartItemProps {
  part: RunningPartRow;
}

function RunningPartItem({ part }: RunningPartItemProps) {
  const category = inLocale(part.categoryTitleEn, part.categoryTitleAr);
  return (
    <li className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6">
      <span className="grid min-w-0 gap-0.5">
        <bdi className="text-sm leading-5 font-medium">{part.title}</bdi>
        {category ? (
          <bdi className="text-[13px] leading-[18px] text-muted-foreground">
            {category}
          </bdi>
        ) : null}
      </span>
      <span className="grid gap-0.5 text-sm leading-5 sm:text-end">
        <span className="tabular-nums">
          {part.excused
            ? m.courseworkStateExcused()
            : part.score === null
              ? m.commonNotRecorded()
              : resultText(part.grade, part.score, part.points, "learner")}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
          {part.weight === null
            ? m.gradebookPartUncounted()
            : m.gradebookPartWeight({ value: tenths(part.weight) })}
        </span>
      </span>
    </li>
  );
}

interface RunningClassProps {
  row: RunningClassRow;
}

/** One class's running grade, marked provisional, with each piece of returned work it is made of. */
function RunningClass({ row }: RunningClassProps) {
  const words = useWords();
  return (
    <RecordSection
      title={classTitle({
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
      })}
      description={
        row.span
          ? words(m.gradebookRunningProvisionalCore)()
          : m.gradebookRunningProvisionalCore()
      }
    >
      <div className="grid gap-6">
        <Facts>
          <Fact label={m.gradebookRunning()}>
            <span className="grid gap-0.5">
              <span className="tabular-nums">{runningText(row)}</span>
              {row.span ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {words(m.gradebookRunningSpanCore)({
                    span: inLocale(row.span.titleEn, row.span.titleAr),
                  })}
                </span>
              ) : null}
            </span>
          </Fact>
        </Facts>
        {row.parts.length ? (
          <div className="grid gap-3">
            <h3 className="text-sm leading-5 font-medium">
              {m.gradebookRunningParts()}
            </h3>
            <RecordList>
              {row.parts.map((part) => (
                <RunningPartItem key={part.assignmentId} part={part} />
              ))}
            </RecordList>
          </div>
        ) : (
          <RecordEmpty>{m.gradebookRunningNothingReturned()}</RecordEmpty>
        )}
      </div>
    </RecordSection>
  );
}

export interface RunningGradesProps {
  /** The learner whose grades these are; empty for the viewer's own. */
  studentId: string;
}

/** A learner's running grade in each class whose teacher shows it, on their Grades page. */
export function RunningGrades({ studentId }: RunningGradesProps) {
  const data = useSuspenseQuery(runningGradesQuery(studentId)).data;
  if (data.classes.length === 0)
    return (
      <EmptyState
        icon={TrendingUp}
        title={m.gradebookRunningNoneTitle()}
        description={m.gradebookRunningNoneBody()}
      />
    );
  return (
    <div className="grid gap-6">
      {data.classes.map((row) => (
        <RunningClass key={row.classId} row={row} />
      ))}
    </div>
  );
}
