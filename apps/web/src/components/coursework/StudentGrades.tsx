import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";

import { EmptyState } from "~/components/system/IndexPage";
import { RecordList, RecordSection } from "~/components/system/RecordPage";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentGradesQuery } from "~/queries/gradebook";

import { classTitle } from "../classes/format";
import { resultText } from "../grading/format";

/** Released term grades, one section per term, one row per class. */
export function StudentGrades({ studentId = "" }: { studentId?: string }) {
  const data = useSuspenseQuery(studentGradesQuery(studentId)).data;
  if (data.rows.length === 0)
    return (
      <EmptyState
        icon={BookOpen}
        title={m.gradesNoneTitle()}
        description={m.gradesNoneBody()}
      />
    );
  const terms = new Map<string, typeof data.rows>();
  for (const row of data.rows)
    terms.set(row.periodId, [...(terms.get(row.periodId) ?? []), row]);
  return (
    <div className="grid gap-6">
      {[...terms.values()].map((rows) => {
        const first = rows[0];
        return (
          <RecordSection
            key={first?.periodId}
            title={
              first ? inLocale(first.periodTitleEn, first.periodTitleAr) : ""
            }
          >
            <RecordList>
              {rows.map((row) => (
                <li
                  key={row.classId}
                  className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6"
                >
                  <span className="text-sm leading-5 font-medium">
                    {classTitle({
                      code: row.classCode,
                      titleEn: row.classTitleEn,
                      titleAr: row.classTitleAr,
                    })}
                  </span>
                  <span className="text-sm leading-5 tabular-nums">
                    {row.score === null
                      ? m.commonNotRecorded()
                      : resultText(
                          row.grade,
                          row.score,
                          row.maxScore,
                          "learner",
                        )}
                  </span>
                  {row.comment ? (
                    <p
                      dir="auto"
                      className="text-[13px] leading-[18px] text-muted-foreground sm:col-span-2"
                    >
                      {row.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </RecordList>
          </RecordSection>
        );
      })}
    </div>
  );
}
