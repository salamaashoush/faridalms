import { describe, expect, it } from "vitest";

import {
  chaptersVtt,
  MAX_DESCRIPTION,
  parseChapters,
  parseDescriptions,
} from "./chapters";

describe("chapters a teacher writes", () => {
  it("reads a time and a name on each line, in time order", () => {
    expect(
      parseChapters("1:30 Loops\n0:00 Starting out\n1:02:05 Wrapping up"),
    ).toEqual([
      { at: 0, title: "Starting out" },
      { at: 90, title: "Loops" },
      { at: 3725, title: "Wrapping up" },
    ]);
  });

  it("takes Arabic digits and leaves out lines that are not a chapter", () => {
    expect(
      parseChapters("٠:٠٠ المقدمة\nnot a chapter\n1:75 Too many seconds\n2:00"),
    ).toEqual([{ at: 0, title: "المقدمة" }]);
  });

  it("keeps the first name of a time named twice", () => {
    expect(parseChapters("0:10 One\n0:10 Two")).toEqual([
      { at: 10, title: "One" },
    ]);
  });

  it("writes a chapters track, each chapter running to the next", () => {
    expect(
      chaptersVtt([
        { at: 0, title: "Intro" },
        { at: 75, title: "Loops --> more" },
      ]),
    ).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:01:15.000\nIntro\n\n00:01:15.000 --> 99:00:00.000\nLoops -> more\n",
    );
  });
});

describe("an audio description a teacher writes", () => {
  it("reads a time and what is seen on each line, longer than a chapter's name", () => {
    const long = "A map of Egypt fills the screen. ".repeat(10).trim();
    expect(
      parseDescriptions(`1:05 Farmers lift water\n٠:١٢ ${long}\nnot a line`),
    ).toEqual([
      { at: 12, text: long },
      { at: 65, text: "Farmers lift water" },
    ]);
    expect(
      parseDescriptions(`0:01 ${"x".repeat(MAX_DESCRIPTION + 10)}`)[0]?.text,
    ).toHaveLength(MAX_DESCRIPTION);
  });
});
