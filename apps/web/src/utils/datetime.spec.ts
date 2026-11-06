import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  adoptSchoolZone,
  formatDate,
  formatDayRange,
  formatInstant,
  formatTime,
  instantFromLocal,
  localInput,
  overwriteZoneSource,
  schoolClockAt,
  schoolDayOf,
} from "./datetime";
import { overwriteDigitsSource } from "./digits";

let zone = "UTC";
const atSchool = (next: string) => {
  zone = next;
};

describe("the school's clock", () => {
  beforeAll(() => {
    // The reader's device sits far from the school, where any use of its own
    // zone would show.
    vi.stubEnv("TZ", "America/Los_Angeles");
    overwriteZoneSource(
      () => zone,
      (next) => {
        zone = next;
      },
    );
  });

  afterEach(() => {
    atSchool("UTC");
    overwriteDigitsSource(() => "latn");
  });

  it("is not the device's own", () => {
    expect(new Date("2026-09-20T12:00:00.000Z").getHours()).not.toBe(12);
  });

  it("shows a Cairo school's instants in Cairo, whatever the device's zone", () => {
    atSchool("Africa/Cairo");
    expect(formatInstant("2026-09-20T20:59:00.000Z", "time", "en")).toBe(
      "11:59 PM",
    );
    expect(formatInstant("2026-12-20T06:00:00.000Z", "medium", "en")).toBe(
      "Dec 20, 2026, 8:00 AM",
    );
  });

  it("shows a Dubai school's instants in Dubai", () => {
    atSchool("Asia/Dubai");
    expect(formatInstant("2026-09-20T05:30:00.000Z", "full", "en")).toBe(
      "Sun, Sep 20, 9:30 AM",
    );
    expect(schoolClockAt(new Date("2026-09-20T20:15:00.000Z"))).toBe("00:15");
  });

  it("puts an instant on the day it falls on at the school", () => {
    atSchool("Asia/Dubai");
    expect(schoolDayOf("2026-09-20T21:30:00.000Z")).toBe("2026-09-21");
    atSchool("UTC");
    expect(schoolDayOf("2026-09-20T21:30:00.000Z")).toBe("2026-09-20");
  });

  it("reads a date-time input on the school's clock and writes it back", () => {
    atSchool("Africa/Cairo");
    expect(instantFromLocal("2026-09-20T23:59")).toBe(
      "2026-09-20T20:59:00.000Z",
    );
    expect(localInput("2026-09-20T20:59:00.000Z")).toBe("2026-09-20T23:59");
    atSchool("Asia/Dubai");
    expect(instantFromLocal("2026-09-20T09:00")).toBe(
      "2026-09-20T05:00:00.000Z",
    );
    expect(localInput("2026-09-20T05:00:00.000Z")).toBe("2026-09-20T09:00");
    expect(instantFromLocal("")).toBe("");
    expect(localInput(null)).toBe("");
  });

  it("moves a time the clocks skip in spring to the same distance past the change", () => {
    atSchool("Africa/Cairo");
    // Cairo's clocks go from 00:00 to 01:00 on 24 April 2026.
    expect(instantFromLocal("2026-04-24T00:30")).toBe(
      "2026-04-23T22:30:00.000Z",
    );
    expect(localInput("2026-04-23T22:30:00.000Z")).toBe("2026-04-24T01:30");
    expect(instantFromLocal("2026-04-24T01:30")).toBe(
      "2026-04-23T22:30:00.000Z",
    );
  });

  it("reads a time the clocks repeat in autumn as its first occurrence", () => {
    atSchool("Africa/Cairo");
    // Cairo's clocks go back from midnight to 23:00 on 29 October 2026.
    expect(instantFromLocal("2026-10-29T23:30")).toBe(
      "2026-10-29T20:30:00.000Z",
    );
    expect(formatInstant("2026-10-29T20:30:00.000Z", "time", "en")).toBe(
      "11:30 PM",
    );
    expect(formatInstant("2026-10-29T21:30:00.000Z", "time", "en")).toBe(
      "11:30 PM",
    );
    expect(instantFromLocal("2026-10-30T08:00")).toBe(
      "2026-10-30T06:00:00.000Z",
    );
  });

  it("is adopted by a page that learns its school as it is drawn", () => {
    adoptSchoolZone("Asia/Dubai");
    expect(formatInstant("2026-09-20T05:30:00.000Z", "time", "en")).toBe(
      "9:30 AM",
    );
  });

  it("writes Arabic in the school's digits", () => {
    atSchool("Africa/Cairo");
    overwriteDigitsSource(() => "arab");
    expect(formatInstant("2026-09-20T20:59:00.000Z", "time", "ar")).toBe(
      "١١:٥٩ م",
    );
    overwriteDigitsSource(() => "latn");
    expect(formatInstant("2026-09-20T20:59:00.000Z", "time", "ar")).toBe(
      "11:59 م",
    );
  });
});

describe("calendar days", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
  });

  afterEach(() => overwriteDigitsSource(() => "latn"));

  it("keep their day in every zone, having none", () => {
    expect(formatDate("2026-09-14", "medium", "en")).toBe("Sep 14, 2026");
    expect(formatDate("2026-09-14", "weekday", "en")).toBe(
      "Monday, September 14",
    );
    expect(formatDate("2026-09-14", "short", "en")).toBe("Sep 14");
    expect(formatDayRange("2026-09-07", "2026-09-25")).toBe("Sep 7 – 25, 2026");
  });

  it("are written in Arabic with the school's digits", () => {
    overwriteDigitsSource(() => "arab");
    expect(formatDate("2026-09-14", "full", "ar")).toBe("١٤ سبتمبر ٢٠٢٦");
  });

  it("show a time of day on the reader's clock face", () => {
    expect(formatTime("08:30:00")).toBe("8:30 AM");
    expect(formatTime("14:05")).toBe("2:05 PM");
  });
});
