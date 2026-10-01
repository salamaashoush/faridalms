import { describe, expect, it } from "vitest";

import { formatCueTime, parseCueTime, parseVtt, vttOf } from "./captions";

describe("captions", () => {
  it("writes cues as WebVTT and reads them back", () => {
    const cues = [
      { start: 1.5, end: 4, text: "Welcome to the lesson." },
      { start: 4, end: 7.25, text: "١٠ كلمات جديدة اليوم" },
    ];
    const file = vttOf(cues);
    expect(file.startsWith("WEBVTT\n")).toBe(true);
    expect(file).toContain("00:00:01.500 --> 00:00:04.000");
    expect(file).toContain("‏١٠ كلمات جديدة اليوم");
    expect(parseVtt(file)).toEqual(cues);
  });

  it("leaves out empty lines and lines that end before they start", () => {
    const file = vttOf([
      { start: 2, end: 1, text: "Backwards" },
      { start: 3, end: 4, text: "  " },
    ]);
    expect(parseVtt(file)).toEqual([]);
  });

  it("reads times as teachers type them", () => {
    expect(parseCueTime("1:02.5")).toBe(62.5);
    expect(parseCueTime("62,5")).toBe(62.5);
    expect(parseCueTime("soon")).toBeNull();
    expect(formatCueTime(62.5)).toBe("1:02.5");
    expect(formatCueTime(5)).toBe("0:05.0");
  });
});
