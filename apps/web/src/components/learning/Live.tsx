import type { LiveRow, LiveState } from "@faridalms/domain/live";
import type { Tone } from "@faridalms/ui/system/status";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import { useQuery } from "@tanstack/react-query";
import { Radio, Users } from "lucide-react";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { moduleLiveQuery } from "~/queries/learning";
import { formatList, formatNumber } from "~/utils/datetime";

import { LiveProjects } from "./LiveProjects";

const LABEL: Record<LiveState, () => string> = {
  help: m.liveHelp,
  guessing: m.liveGuessing,
  stopped: m.liveStopped,
  found: m.liveFound,
  working: m.liveWorking,
  finished: m.liveFinished,
  away: m.liveAway,
};

const TONE: Record<LiveState, Tone> = {
  help: "danger",
  guessing: "warning",
  stopped: "warning",
  found: "success",
  working: "info",
  finished: "success",
  away: "neutral",
};

const GROUPS: { title: () => string; states: LiveState[] }[] = [
  { title: m.liveNeedsYou, states: ["help", "guessing", "stopped"] },
  { title: m.liveGoingWell, states: ["found", "working", "finished"] },
];

const minutesBetween = (from: string, to: string) =>
  Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 60_000));

/** What a state means for this student, in a few words. */
function detail(row: LiveRow, questions: number, now: string): string {
  switch (row.state) {
    case "help":
      return row.misses > 0
        ? m.liveHelpMisses({ count: row.misses })
        : m.liveHelpShown();
    case "guessing":
      return m.liveGuessingTries({ count: row.misses });
    case "stopped":
      return m.liveStoppedFor({
        count: row.lastAt ? minutesBetween(row.lastAt, now) : 0,
      });
    case "found":
      return m.liveFoundAfter({ count: row.misses });
    case "working":
      return questions > 0
        ? m.liveTried({
            count: formatNumber(row.answered),
            total: formatNumber(questions),
          })
        : m.liveReading();
    default:
      return "";
  }
}

export interface ClassLiveProps {
  moduleId: string;
  classId: string;
}

/**
 * The class during a lesson, for the teacher walking the room: who needs
 * them first, then who is getting on, then who has not started. It asks
 * again every ten seconds and is never shown to students.
 */
export function ClassLive({ moduleId, classId }: ClassLiveProps) {
  const data = useQuery(moduleLiveQuery(moduleId, classId)).data;
  if (!data) return null;
  if (data.students.length === 0)
    return (
      <EmptyState
        icon={Users}
        title={m.lrnNoStudents()}
        description={m.lrnNoStudentsBody()}
      />
    );
  const names = new Map(
    data.students.map((student) => [student.id, displayName(student)]),
  );
  const lessons = new Map(data.lessons.map((lesson) => [lesson.id, lesson]));
  const byName = (a: LiveRow, b: LiveRow) =>
    (names.get(a.studentId) ?? "").localeCompare(names.get(b.studentId) ?? "");
  const order = (row: LiveRow) =>
    GROUPS.flatMap((group) => group.states).indexOf(row.state);
  const away = data.rows.filter((row) => row.state === "away").toSorted(byName);
  const needing = data.rows.filter((row) =>
    GROUPS[0]?.states.includes(row.state),
  ).length;
  if (away.length === data.rows.length)
    return (
      <EmptyState
        icon={Radio}
        title={m.liveEmptyTitle()}
        description={m.liveEmptyBody()}
      />
    );

  return (
    <div className="grid gap-4">
      <p aria-live="polite" className="text-sm leading-6 text-muted-foreground">
        {needing > 0
          ? m.liveSummary({
              needing: formatNumber(needing),
              total: formatNumber(data.rows.length - away.length),
            })
          : m.liveCalm()}{" "}
        {m.liveUpdates()}
      </p>
      {GROUPS.map((group) => {
        const rows = data.rows
          .filter((row) => group.states.includes(row.state))
          .toSorted((a, b) => order(a) - order(b) || byName(a, b));
        if (rows.length === 0) return null;
        return (
          <RecordSection
            key={group.states[0]}
            title={`${group.title()} ${formatNumber(rows.length)}`}
          >
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => {
                const lesson = row.lessonId ? lessons.get(row.lessonId) : null;
                return (
                  <li
                    key={row.studentId}
                    className="grid gap-1.5 rounded-lg border bg-card p-3"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-sm leading-5 font-medium">
                        {names.get(row.studentId)}
                      </span>
                      <StatusBadge tone={TONE[row.state]}>
                        {LABEL[row.state]()}
                      </StatusBadge>
                    </div>
                    {lesson ? (
                      <p
                        dir="auto"
                        className="truncate text-[13px] leading-[18px] text-muted-foreground"
                      >
                        {lesson.title}
                      </p>
                    ) : null}
                    <p className="text-[13px] leading-[18px]">
                      {detail(row, lesson?.questions ?? 0, data.now)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </RecordSection>
        );
      })}
      <LiveProjects
        projects={data.projects}
        studios={data.studios}
        names={names}
        here={
          new Set(
            data.rows
              .filter((row) => row.state !== "away" && row.state !== "finished")
              .map((row) => row.studentId),
          )
        }
        now={data.now}
      />
      {away.length > 0 ? (
        <RecordSection
          title={`${m.liveAway()} ${formatNumber(away.length)}`}
          description={m.liveAwayHint()}
        >
          <p className="text-sm leading-6">
            {formatList(away.map((row) => names.get(row.studentId) ?? ""))}
          </p>
        </RecordSection>
      ) : null}
    </div>
  );
}
