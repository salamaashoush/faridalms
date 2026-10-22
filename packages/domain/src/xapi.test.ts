import { describe, expect, it } from "vitest";

import {
  answerResult,
  interactionType,
  lessonResult,
  watchResult,
  xapiActivity,
  xapiDuration,
  xapiStatement,
} from "./xapi";

describe("results as xAPI statements", () => {
  it("writes durations as ISO 8601, to the hundredth of a second", () => {
    expect(xapiDuration(0)).toBe("PT0S");
    expect(xapiDuration(1234)).toBe("PT1.23S");
    expect(xapiDuration(16_559_140)).toBe("PT4H35M59.14S");
    expect(xapiDuration(3_600_000)).toBe("PT1H");
  });

  it("gives a lesson's score, pass, completion and time", () => {
    expect(
      lessonResult({
        startedAt: "2026-10-22T10:00:00Z",
        completedAt: "2026-10-22T10:12:30Z",
        score: 80,
        passScore: 70,
      }),
    ).toEqual({
      score: { scaled: 0.8, raw: 80, min: 0, max: 100 },
      success: true,
      completion: true,
      duration: "PT12M30S",
    });
    expect(
      lessonResult({
        startedAt: "2026-10-22T10:00:00Z",
        completedAt: null,
        score: null,
        passScore: 70,
      }),
    ).toEqual({ completion: false });
  });

  it("gives an answer's share and points, and a video's progress", () => {
    expect(answerResult(0.5, 4)).toEqual({
      score: { scaled: 0.5, raw: 2, min: 0, max: 4 },
      success: false,
      completion: true,
    });
    expect(watchResult(95, 100)).toEqual({
      completion: true,
      duration: "PT1M35S",
      extensions: { "https://w3id.org/xapi/video/extensions/progress": 0.95 },
    });
    expect(interactionType("ordering")).toBe("sequencing");
  });

  it("shapes a statement with its actor, verb, activity and context", () => {
    const lesson = xapiActivity(
      "lesson",
      "https://school.example.com/lessons/1",
      "Floods",
      "en",
    );
    const module = xapiActivity(
      "module",
      "https://school.example.com/modules/2",
      "Rivers",
      "en",
    );
    expect(
      xapiStatement({
        id: "4f7e5b6a-3c2d-4e1f-8a9b-0c1d2e3f4a5b",
        actor: {
          objectType: "Agent",
          name: "Yasmin Sabry",
          account: { homePage: "https://school.example.com", name: "u1" },
        },
        verb: "completed",
        object: lesson,
        result: { completion: true },
        language: "en",
        parent: [module],
        timestamp: "2026-10-22T10:12:30Z",
      }),
    ).toEqual({
      id: "4f7e5b6a-3c2d-4e1f-8a9b-0c1d2e3f4a5b",
      actor: {
        objectType: "Agent",
        name: "Yasmin Sabry",
        account: { homePage: "https://school.example.com", name: "u1" },
      },
      verb: {
        id: "http://adlnet.gov/expapi/verbs/completed",
        display: { "en-US": "completed" },
      },
      object: {
        objectType: "Activity",
        id: "https://school.example.com/lessons/1",
        definition: {
          type: "http://adlnet.gov/expapi/activities/lesson",
          name: { en: "Floods" },
        },
      },
      result: { completion: true },
      context: {
        platform: "Farida",
        language: "en",
        contextActivities: { parent: [module] },
      },
      timestamp: "2026-10-22T10:12:30.000Z",
      version: "1.0.3",
    });
  });
});
