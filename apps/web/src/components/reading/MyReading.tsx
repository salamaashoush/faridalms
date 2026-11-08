import { RecordList, RecordSection } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import { myReadingQuery } from "~/queries/reading";
import { formatInstant, formatNumber } from "~/utils/datetime";

/**
 * A student's own reading aloud this year, newest first: how many words
 * they read correctly a minute each time their teacher marked a reading,
 * and the words their teacher marked for them to practise. Shown only once
 * a reading is marked.
 */
export function MyReading() {
  const { readings } = useSuspenseQuery(myReadingQuery).data;
  if (readings.length === 0) return null;
  const practise = [
    ...new Set(readings.toReversed().flatMap((reading) => reading.practise)),
  ];
  return (
    <RecordSection
      title={m.readingMineTitle()}
      description={m.readingMineHint()}
    >
      <div className="grid gap-4 px-5 pb-5">
        {practise.length ? (
          <section className="grid gap-2">
            <h3 className="text-sm leading-5 font-medium">
              {m.readingToPractise()}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {practise.map((word) => (
                <li
                  key={word}
                  dir="auto"
                  className="rounded-lg bg-muted px-3 py-1.5 text-lg leading-7 font-medium"
                >
                  {word}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <RecordList>
          {readings.toReversed().map((reading, index) => (
            <li
              key={`${reading.sourceId}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="grid min-w-0 gap-0.5">
                <bdi className="text-sm leading-5 font-medium">
                  {reading.title}
                </bdi>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {formatInstant(reading.markedAt, "date")}
                </span>
              </span>
              <span className="text-sm leading-5 tabular-nums">
                {m.readingWordsAMinute({
                  count: formatNumber(reading.perMinute),
                })}
              </span>
            </li>
          ))}
        </RecordList>
      </div>
    </RecordSection>
  );
}
