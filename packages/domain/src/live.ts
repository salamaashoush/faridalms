/**
 * What a teacher sees of each student during a lesson, one state apiece, in
 * the order they need the teacher: Lumilo's alerts (still wrong after help,
 * rapid guessing, two idle minutes) raised learning most for students who
 * started low, and its teachers asked for one symbol per student and for
 * good news as well as bad.
 */
export const LIVE_STATES = [
  "help",
  "guessing",
  "stopped",
  "found",
  "working",
  "finished",
  "away",
] as const;
export type LiveState = (typeof LIVE_STATES)[number];

/** Activity older than this is not a lesson going on now. */
export const LIVE_WINDOW_MS = 20 * 60_000;
/** Lumilo's idle alert. */
export const STOPPED_MS = 2 * 60_000;
/** Three wrong tries this close together are guesses rather than thought. */
export const GUESS_SPAN_MS = 10_000;
/** Misses on one question that ask for the teacher. */
const HELP_MISSES = 3;
/** Misses before a right answer that make it worth telling. */
const FOUND_MISSES = 2;

export type TryOutcome = "right" | "wrong" | "shown" | "sent";

export interface LiveTry {
  studentId: string;
  lessonId: string;
  blockId: string;
  attempt: number;
  at: string;
  outcome: TryOutcome;
}

export interface LiveProgress {
  studentId: string;
  lessonId: string;
  attempts: number;
  completedAt: string | null;
  touchedAt: string;
}

export interface LiveRow {
  studentId: string;
  state: LiveState;
  /** The lesson they are in, or were last in. */
  lessonId: string | null;
  lastAt: string | null;
  /** Wrong tries on the question they are on. */
  misses: number;
  /** Questions they have tried in this go at the lesson. */
  answered: number;
}

const time = (iso: string) => Date.parse(iso);

function stateOf(
  studentId: string,
  progress: readonly LiveProgress[],
  tries: readonly LiveTry[],
  now: number,
): LiveRow {
  const touches = [
    ...tries.map((item) => ({ lessonId: item.lessonId, at: time(item.at) })),
    ...progress.map((item) => ({
      lessonId: item.lessonId,
      at: time(item.touchedAt),
    })),
  ];
  const last = touches.reduce<(typeof touches)[number] | null>(
    (latest, item) => (!latest || item.at > latest.at ? item : latest),
    null,
  );
  const row = (state: LiveState, more: Partial<LiveRow> = {}): LiveRow => ({
    studentId,
    state,
    lessonId: last?.lessonId ?? null,
    lastAt: last ? new Date(last.at).toISOString() : null,
    misses: 0,
    answered: 0,
    ...more,
  });
  if (!last || now - last.at > LIVE_WINDOW_MS) return row("away");

  const own = progress.find((item) => item.lessonId === last.lessonId);
  const here = tries.filter(
    (item) =>
      item.lessonId === last.lessonId &&
      (!own || item.attempt === own.attempts),
  );
  const answered = new Set(here.map((item) => item.blockId)).size;
  const latest = here.at(-1);
  const finishedAt = own?.completedAt ? time(own.completedAt) : null;
  if (finishedAt !== null && (!latest || time(latest.at) <= finishedAt))
    return row("finished", { answered });
  if (!latest) return row(now - last.at >= STOPPED_MS ? "stopped" : "working");

  const onBlock = here.filter((item) => item.blockId === latest.blockId);
  const misses = onBlock.filter((item) => item.outcome === "wrong").length;
  const right = onBlock.some((item) => item.outcome === "right");
  const shown = onBlock.some((item) => item.outcome === "shown");
  const rapid = onBlock.some((item, index) => {
    const run = onBlock.slice(index, index + 3);
    return (
      run.length === 3 &&
      run.every((each) => each.outcome === "wrong") &&
      time(run[2]?.at ?? item.at) - time(item.at) <= GUESS_SPAN_MS
    );
  });
  const more = { misses, answered };
  if (rapid && !right) return row("guessing", more);
  if (!right && (shown || misses >= HELP_MISSES)) return row("help", more);
  if (now - last.at >= STOPPED_MS) return row("stopped", more);
  if (right && misses >= FOUND_MISSES) return row("found", more);
  return row("working", more);
}

/** Each student's state now, from what they did in the module's lessons lately. */
export function liveStates(input: {
  studentIds: readonly string[];
  progress: readonly LiveProgress[];
  tries: readonly LiveTry[];
  now: number;
}): LiveRow[] {
  return input.studentIds.map((studentId) =>
    stateOf(
      studentId,
      input.progress.filter((item) => item.studentId === studentId),
      input.tries
        .filter((item) => item.studentId === studentId)
        .toSorted((a, b) => time(a.at) - time(b.at)),
      input.now,
    ),
  );
}
