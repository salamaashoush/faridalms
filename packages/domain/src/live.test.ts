import { describe, expect, it } from "vitest";

import type { LiveProgress, LiveTry, TryOutcome } from "./live";

import { liveStates } from "./live";

const NOW = Date.parse("2026-10-02T10:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

type Made = [blockId: string, secondsAgo: number, outcome: TryOutcome];

const triesIn = (attempt: number, ...items: Made[]): LiveTry[] =>
  items.map(([blockId, seconds, outcome]) => ({
    studentId: "s",
    lessonId: "l",
    blockId,
    attempt,
    at: ago(seconds),
    outcome,
  }));

const tries = (...items: Made[]) => triesIn(1, ...items);

const opened = (secondsAgo: number, done?: number): LiveProgress => ({
  studentId: "s",
  lessonId: "l",
  attempts: 1,
  completedAt: done === undefined ? null : ago(done),
  touchedAt: ago(secondsAgo),
});

const stateOf = (progress: LiveProgress[], made: LiveTry[]) =>
  liveStates({ studentIds: ["s"], progress, tries: made, now: NOW })[0];

describe("a student's state for the teacher", () => {
  it("is away with nothing recent, and working once a lesson is open", () => {
    expect(stateOf([], [])?.state).toBe("away");
    expect(stateOf([opened(25 * 60)], [])?.state).toBe("away");
    expect(stateOf([opened(30)], [])?.state).toBe("working");
  });

  it("asks for help after three misses, or once the answer was shown", () => {
    expect(
      stateOf(
        [opened(300)],
        tries(["q", 90, "wrong"], ["q", 60, "wrong"], ["q", 20, "wrong"]),
      ),
    ).toMatchObject({ state: "help", misses: 3, answered: 1 });
    expect(
      stateOf([opened(300)], tries(["q", 40, "wrong"], ["q", 20, "shown"]))
        ?.state,
    ).toBe("help");
  });

  it("calls three wrong tries in ten seconds guessing", () => {
    expect(
      stateOf(
        [opened(300)],
        tries(["q", 30, "wrong"], ["q", 26, "wrong"], ["q", 22, "wrong"]),
      )?.state,
    ).toBe("guessing");
  });

  it("tells of a right answer found after misses, and of plain work", () => {
    expect(
      stateOf(
        [opened(300)],
        tries(
          ["a", 200, "right"],
          ["q", 50, "wrong"],
          ["q", 30, "wrong"],
          ["q", 10, "right"],
        ),
      ),
    ).toMatchObject({ state: "found", answered: 2 });
    expect(stateOf([opened(300)], tries(["q", 10, "right"]))?.state).toBe(
      "working",
    );
  });

  it("notices two quiet minutes, but help comes first", () => {
    expect(stateOf([opened(300)], tries(["q", 150, "right"]))?.state).toBe(
      "stopped",
    );
    expect(
      stateOf(
        [opened(600)],
        tries(["q", 500, "wrong"], ["q", 400, "wrong"], ["q", 300, "wrong"]),
      )?.state,
    ).toBe("help");
  });

  it("is finished once the lesson is done with nothing tried after", () => {
    expect(stateOf([opened(20, 20)], tries(["q", 30, "right"]))?.state).toBe(
      "finished",
    );
    expect(stateOf([opened(200, 200)], tries(["q", 10, "right"]))?.state).toBe(
      "working",
    );
  });

  it("counts only the go at the lesson the student is on", () => {
    const earlier = tries(
      ["q", 100, "wrong"],
      ["q", 90, "wrong"],
      ["q", 80, "wrong"],
    );
    const again = { ...opened(60), attempts: 2 };
    const fresh = triesIn(2, ["q", 20, "right"]);
    expect(stateOf([again], [...earlier, ...fresh])).toMatchObject({
      state: "working",
      misses: 0,
      answered: 1,
    });
  });
});
