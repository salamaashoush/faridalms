import { describe, expect, it } from "vitest";

import type { Cmi5Session } from "./cmi5";

import {
  afterStatement,
  auSatisfied,
  CMI5_CATEGORY,
  CMI5_EXTENSIONS,
  CMI5_MOVE_ON_CATEGORY,
  CMI5_VERBS,
  cmi5Issue,
  cmi5Of,
  VOIDED,
} from "./cmi5";

const PACKAGE = "11111111-1111-4111-8111-111111111111";

const xml = (body: string) =>
  new DOMParser().parseFromString(
    `<?xml version="1.0" encoding="utf-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://publisher.example.com/course/rivers">
    <title><langstring lang="en-US"> Rivers </langstring><langstring lang="ar">الأنهار</langstring></title>
    <description><langstring lang="en-US">A short course.</langstring></description>
  </course>
  ${body}
</courseStructure>`,
    "application/xml",
  ).documentElement;

describe("a course structure", () => {
  it("reads the course and its units in order, those in blocks among them", () => {
    const course = cmi5Of(
      xml(`
  <au id="https://publisher.example.com/au/intro" moveOn="Completed" launchMethod="OwnWindow">
    <title><langstring lang="en-US">Intro</langstring></title>
    <description><langstring lang="en-US">Start here.</langstring></description>
    <url> intro/index.html?mode=a </url>
  </au>
  <block id="https://publisher.example.com/block/1">
    <title><langstring lang="en-US">Block</langstring></title>
    <description><langstring lang="en-US">Two parts.</langstring></description>
    <au id="https://publisher.example.com/au/quiz" moveOn="Passed" masteryScore="0.8">
      <title><langstring lang="en-US">Quiz</langstring></title>
      <description><langstring lang="en-US">Ten questions.</langstring></description>
      <url>quiz/index.html</url>
      <launchParameters>{"level":2}</launchParameters>
    </au>
  </block>`),
      PACKAGE,
      "ar",
    );
    expect(course).toEqual({
      packageId: PACKAGE,
      courseId: "https://publisher.example.com/course/rivers",
      title: "الأنهار",
      aus: [
        {
          id: "https://publisher.example.com/au/intro",
          title: "Intro",
          url: "intro/index.html?mode=a",
          moveOn: "Completed",
          launchMethod: "OwnWindow",
        },
        {
          id: "https://publisher.example.com/au/quiz",
          title: "Quiz",
          url: "quiz/index.html",
          moveOn: "Passed",
          masteryScore: 0.8,
          launchMethod: "AnyWindow",
          launchParameters: '{"level":2}',
        },
      ],
    });
  });

  it("refuses units that leave the package or are not over https", () => {
    const unit = (url: string) =>
      xml(`<au id="https://publisher.example.com/au/1">
        <title><langstring>One</langstring></title>
        <description><langstring>One</langstring></description>
        <url>${url}</url></au>`);
    expect(cmi5Of(unit("../outside.html"), PACKAGE)).toBeNull();
    expect(cmi5Of(unit("/root.html"), PACKAGE)).toBeNull();
    expect(cmi5Of(unit("http://example.com/au"), PACKAGE)).toBeNull();
    expect(cmi5Of(unit("javascript:alert(1)"), PACKAGE)).toBeNull();
    expect(cmi5Of(unit("https://example.com/au"), PACKAGE)?.aus).toHaveLength(
      1,
    );
    expect(cmi5Of(xml(""), PACKAGE)).toBeNull();
  });
});

describe("moving on", () => {
  it("follows each rule, and a waived unit has met any", () => {
    expect(auSatisfied("Completed", { passed: true })).toBe(false);
    expect(auSatisfied("CompletedOrPassed", { passed: true })).toBe(true);
    expect(auSatisfied("CompletedAndPassed", { completed: true })).toBe(false);
    expect(
      auSatisfied("CompletedAndPassed", { completed: true, passed: true }),
    ).toBe(true);
    expect(auSatisfied("NotApplicable")).toBe(true);
    expect(auSatisfied("Passed", { waived: true })).toBe(true);
  });
});

const SESSION = "22222222-2222-4222-8222-222222222222";
const REGISTRATION = "33333333-3333-4333-8333-333333333333";
const ACTIVITY = "https://school.example.com/lessons/1/packages/2/aus/0";
const session = (change: Partial<Cmi5Session> = {}): Cmi5Session => ({
  sessionId: SESSION,
  registration: REGISTRATION,
  activityId: ACTIVITY,
  actor: { homePage: "https://school.example.com", name: "student-1" },
  masteryScore: 0.8,
  launchMode: "Normal",
  verbs: ["initialized"],
  progress: {},
  ...change,
});
const statement = (
  verb: keyof typeof CMI5_VERBS,
  result?: Record<string, unknown>,
  change: Record<string, unknown> = {},
) => ({
  actor: {
    objectType: "Agent",
    account: { homePage: "https://school.example.com", name: "student-1" },
  },
  verb: { id: CMI5_VERBS[verb] },
  object: { id: ACTIVITY },
  ...(result ? { result } : {}),
  context: {
    registration: REGISTRATION,
    contextActivities: {
      category: [
        { id: CMI5_CATEGORY },
        ...(result && ("success" in result || "completion" in result)
          ? [{ id: CMI5_MOVE_ON_CATEGORY }]
          : []),
      ],
    },
    extensions: { [CMI5_EXTENSIONS.sessionId]: SESSION },
  },
  ...change,
});

describe("statements a unit sends", () => {
  it("keeps what follows cmi5's rules", () => {
    expect(
      cmi5Issue(statement("initialized"), session({ verbs: [] })),
    ).toBeNull();
    expect(
      cmi5Issue(
        statement("passed", {
          score: { scaled: 0.9 },
          success: true,
          duration: "PT5M",
        }),
        session(),
      ),
    ).toBeNull();
    expect(
      cmi5Issue(
        statement("completed", { completion: true, duration: "PT5M" }),
        session(),
      ),
    ).toBeNull();
    expect(
      cmi5Issue(statement("terminated", { duration: "PT6M" }), session()),
    ).toBeNull();
    // A statement of the unit's own, outside cmi5's verbs, goes as it is.
    expect(
      cmi5Issue(
        statement("initialized", undefined, {
          verb: { id: "http://adlnet.gov/expapi/verbs/answered" },
          object: { id: "https://publisher.example.com/q/1" },
        }),
        session(),
      ),
    ).toBeNull();
  });

  it("keeps a unit launched to browse or review to what records nothing", () => {
    for (const launchMode of ["Browse", "Review"] as const) {
      const looking = (verbs = ["initialized"]) =>
        session({ launchMode, verbs });
      expect(cmi5Issue(statement("initialized"), looking([]))).toBeNull();
      expect(
        cmi5Issue(statement("terminated", { duration: "PT1M" }), looking()),
      ).toBeNull();
      expect(
        cmi5Issue(
          statement("initialized", undefined, {
            verb: { id: "http://adlnet.gov/expapi/verbs/experienced" },
            object: { id: "https://publisher.example.com/page/1" },
          }),
          looking(),
        ),
      ).toBeNull();
      expect(
        cmi5Issue(
          statement("completed", { completion: true, duration: "PT5M" }),
          looking(),
        ),
      ).toBe("launch_mode");
      expect(
        cmi5Issue(
          statement("passed", {
            score: { scaled: 0.9 },
            success: true,
            duration: "PT5M",
          }),
          looking(),
        ),
      ).toBe("launch_mode");
      expect(
        cmi5Issue(
          statement("failed", {
            score: { scaled: 0.1 },
            success: false,
            duration: "PT5M",
          }),
          looking(),
        ),
      ).toBe("launch_mode");
    }
  });

  it("refuses what breaks them", () => {
    const refused = (sent: unknown, at = session()) => cmi5Issue(sent, at);
    expect(refused(statement("initialized"))).toBe("repeated");
    expect(refused(statement("completed"), session({ verbs: [] }))).toBe(
      "not_initialized",
    );
    expect(
      refused(
        statement("initialized"),
        session({ verbs: ["initialized", "terminated"] }),
      ),
    ).toBe("terminated");
    expect(
      refused(
        statement("initialized", undefined, {
          actor: {
            account: {
              homePage: "https://school.example.com",
              name: "someone",
            },
          },
        }),
        session({ verbs: [] }),
      ),
    ).toBe("actor");
    expect(
      refused(
        statement("initialized", undefined, {
          context: { registration: "44444444-4444-4444-8444-444444444444" },
        }),
        session({ verbs: [] }),
      ),
    ).toBe("registration");
    expect(
      refused(statement("initialized", undefined, { verb: { id: VOIDED } })),
    ).toBe("voiding");
    expect(refused(statement("satisfied"))).toBe("school_only");
    expect(
      refused(
        statement("passed", {
          score: { scaled: 0.5 },
          success: true,
          duration: "PT1M",
        }),
      ),
    ).toBe("mastery");
    expect(
      refused(
        statement("failed", {
          score: { scaled: 0.9 },
          success: false,
          duration: "PT1M",
        }),
      ),
    ).toBe("mastery");
    expect(
      refused(
        statement("completed", {
          completion: true,
          duration: "PT1M",
          score: { scaled: 1 },
        }),
      ),
    ).toBe("score");
    expect(refused(statement("completed", { completion: true }))).toBe(
      "duration",
    );
    expect(
      refused(
        statement("completed", { completion: true, duration: "PT1M" }),
        session({ progress: { completed: true } }),
      ),
    ).toBe("repeated");
    expect(
      refused(
        statement("failed", { success: false, duration: "PT1M" }),
        session({ progress: { passed: true } }),
      ),
    ).toBe("failed_after_passed");
    expect(
      refused(
        statement(
          "completed",
          { completion: true, duration: "PT1M" },
          {
            object: { id: "https://publisher.example.com/au/1" },
          },
        ),
      ),
    ).toBe("object");
  });

  it("keeps where the unit stands from what it sent", () => {
    expect(
      afterStatement(
        statement("passed", { score: { scaled: 0.9 }, success: true }),
        session(),
      ),
    ).toEqual({
      verbs: ["initialized", "passed"],
      progress: { passed: true, score: 0.9 },
    });
  });
});
