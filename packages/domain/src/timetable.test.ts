import { describe, expect, it } from "vitest";

import { collidingSlots, slotsCollide } from "./timetable";

describe("slotsCollide", () => {
  it("treats a shared boundary as free", () => {
    expect(
      slotsCollide(
        { weekday: 0, startTime: "08:00", endTime: "08:45" },
        { weekday: 0, startTime: "08:45", endTime: "09:30" },
      ),
    ).toBe(false);
  });

  it("ignores the same time on another day", () => {
    expect(
      slotsCollide(
        { weekday: 0, startTime: "08:00", endTime: "08:45" },
        { weekday: 1, startTime: "08:00", endTime: "08:45" },
      ),
    ).toBe(false);
  });
});

describe("collidingSlots", () => {
  it("names every slot that overlaps another", () => {
    expect(
      collidingSlots([
        { weekday: 2, startTime: "08:00", endTime: "09:00" },
        { weekday: 2, startTime: "08:30", endTime: "09:15" },
        { weekday: 2, startTime: "10:00", endTime: "10:45" },
        { weekday: 3, startTime: "08:30", endTime: "09:15" },
      ]),
    ).toEqual([0, 1]);
  });
});
