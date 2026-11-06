import { WATCHED_SHARE } from "@faridalms/domain/learning";
import { mediaClock } from "@faridalms/editor/format";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { classVideosQuery } from "~/queries/learning";
import { formatList, formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classVideosQuery>["queryFn"]>>
>;
type Recording = Data["recordings"][number];

const WIDTH = 600;
const HEIGHT = 120;
/** The moments a recording was most often gone back to, at most this many. */
const PEAKS = 3;

/**
 * Where most of the class went back to watch again, as the times those
 * stretches start: the stretches near the curve's highest, most first, each
 * named once.
 */
function peaksOf(again: readonly number[], duration: number): number[] {
  const top = Math.max(0, ...again);
  if (top === 0) return [];
  const floor = Math.max(1, Math.ceil(top * 0.6));
  const runs: { start: number; best: number }[] = [];
  let open: { start: number; best: number } | null = null;
  for (const [index, count] of again.entries()) {
    if (count < floor) {
      open = null;
      continue;
    }
    if (open) open.best = Math.max(open.best, count);
    else {
      open = { start: index, best: count };
      runs.push(open);
    }
  }
  const times = runs
    .toSorted((a, b) => b.best - a.best || a.start - b.start)
    .slice(0, PEAKS)
    .map((run) => Math.floor((run.start / again.length) * duration))
    .toSorted((a, b) => a - b);
  return [...new Set(times)];
}

interface RetentionProps {
  recording: Recording;
  total: number;
  label: string;
}

/**
 * How many of the class had watched each moment, as an area: where it
 * falls away is where students stopped, and the marks below are the
 * questions the video stops for.
 */
function Retention({ recording, total, label }: RetentionProps) {
  const { curve, again, stops, durationSeconds } = recording;
  if (!durationSeconds || curve.length === 0 || total === 0) return null;
  const x = (index: number) => ((index + 0.5) / curve.length) * WIDTH;
  const y = (count: number) => HEIGHT - (count / total) * HEIGHT;
  const path = (counts: readonly number[]) =>
    counts
      .map(
        (count, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(count)}`,
      )
      .join(" ");
  const line = path(curve);
  const area = `${line} L${x(curve.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z`;
  const replays = again.some((count) => count > 0);
  const peaks = replays ? peaksOf(again, durationSeconds) : [];
  return (
    <figure className="grid gap-1.5" dir="ltr">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        <span>{m.lrnWholeClass({ count: formatNumber(total) })}</span>
        <span className="flex flex-wrap gap-x-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded bg-primary" />
            {m.lrnWatchedLine()}
          </span>
          {replays ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3 rounded bg-warning" />
              {m.lrnWatchedAgainLine()}
            </span>
          ) : null}
        </span>
      </div>
      <p className="sr-only">{label}</p>
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 10}`}
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible text-primary"
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT}
          y2={HEIGHT}
          className="stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          x2={WIDTH}
          y1={0}
          y2={0}
          strokeDasharray="4 4"
          className="stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} className="fill-current opacity-10" />
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          className="stroke-current"
          vectorEffect="non-scaling-stroke"
        />
        {replays ? (
          <path
            d={path(again)}
            fill="none"
            strokeWidth={2}
            strokeDasharray="5 3"
            className="stroke-warning"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {stops.map((at) => (
          <rect
            key={at}
            x={(at / durationSeconds) * WIDTH - 1}
            y={HEIGHT + 3}
            width={2}
            height={7}
            className="fill-muted-foreground"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span>{mediaClock(durationSeconds)}</span>
      </div>
      {peaks.length > 0 ? (
        <p className="text-sm leading-5">
          {m.lrnWatchedAgainAt({
            times: formatList(peaks.map((at) => mediaClock(at))),
          })}
        </p>
      ) : null}
    </figure>
  );
}

interface RecordingCardProps {
  recording: Recording;
  students: Data["students"];
}

function RecordingCard({ recording, students }: RecordingCardProps) {
  const duration = recording.durationSeconds ?? 0;
  const share = (id: string) =>
    duration ? Math.min(1, (recording.watched[id] ?? 0) / duration) : 0;
  const all = students.filter((row) => share(row.id) >= WATCHED_SHARE);
  const started = students.filter(
    (row) => share(row.id) > 0 && share(row.id) < WATCHED_SHARE,
  );
  const none = students.length - all.length - started.length;
  const ordered = students.toSorted((a, b) => share(a.id) - share(b.id));
  return (
    <article className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h3 dir="auto" className="text-sm leading-5 font-medium">
          {recording.name}
        </h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            m.lrnWatchedAll({ count: formatNumber(all.length) }),
            m.lrnWatchedSome({ count: formatNumber(started.length) }),
            m.lrnWatchedNone({ count: formatNumber(none) }),
          ].join(" · ")}
        </p>
      </div>
      {duration ? (
        <Retention
          recording={recording}
          total={students.length}
          label={m.lrnRetentionLabel({
            name: recording.name,
            all: formatNumber(all.length),
            total: formatNumber(students.length),
          })}
        />
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.lrnNotWatchedYet()}
        </p>
      )}
      {duration ? (
        <ul className="grid gap-2">
          {ordered.map((row) => {
            const part = share(row.id);
            return (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_8rem_3rem] items-center gap-3 text-sm leading-5"
              >
                <span className="truncate">
                  <bdi>{displayName(row)}</bdi>
                </span>
                <span aria-hidden className="h-1.5 rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${part >= WATCHED_SHARE ? "bg-primary" : "bg-warning"}`}
                    style={{ width: `${part * 100}%` }}
                  />
                </span>
                <span className="text-end text-muted-foreground tabular-nums">
                  {formatNumber(Math.round(part * 100))}%
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

export interface ClassVideosProps {
  moduleId: string;
  classId: string;
}

/**
 * How a class watched the videos and recordings of a module: for each,
 * how many watched each moment and how far each student got, so a teacher
 * sees where students stop and who has yet to watch.
 */
export function ClassVideos({ moduleId, classId }: ClassVideosProps) {
  const query = useQuery(classVideosQuery(moduleId, classId));
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const { students, recordings } = query.data;
  if (recordings.length === 0)
    return (
      <EmptyState
        icon={Clapperboard}
        title={m.lrnNoVideos()}
        description={m.lrnNoVideosBody()}
      />
    );
  const lessons = [...new Set(recordings.map((row) => row.lessonId))];
  return (
    <div className="grid max-w-3xl gap-8">
      {lessons.map((lessonId) => {
        const items = recordings.filter((row) => row.lessonId === lessonId);
        return (
          <section
            key={lessonId}
            aria-labelledby={`videos-${lessonId}`}
            className="grid gap-3"
          >
            <h2
              id={`videos-${lessonId}`}
              className="text-base leading-6 font-semibold"
            >
              <bdi>{items[0]?.lessonTitle}</bdi>
            </h2>
            {items.map((recording) => (
              <RecordingCard
                key={recording.key}
                recording={recording}
                students={students}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
