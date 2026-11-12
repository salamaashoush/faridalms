import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { saveClassSchema } from "./classes";
import {
  endedOn,
  followingSpan,
  followingSpans,
  saveHomeroomSchema,
} from "./homerooms";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("the days a member sits in a subject class", () => {
  const member = { from: "2026-09-13", to: "2027-06-18" };

  it("are their days in the homeroom when the class was there first", () => {
    expect(followingSpan(member, "2026-09-01")).toEqual(member);
  });

  it("start on the day a class joins the homeroom later", () => {
    expect(followingSpan(member, "2026-11-01")).toEqual({
      from: "2026-11-01",
      to: "2027-06-18",
    });
  });

  it("are none when the member left before the class joined", () => {
    expect(
      followingSpan({ from: "2026-09-13", to: "2026-10-01" }, "2026-11-01"),
    ).toBeNull();
  });

  it("leave out a member already in the class by another enrolment", () => {
    expect(
      followingSpans(
        [member, { from: "2025-09-14", to: "2026-06-18" }],
        "2025-09-01",
        [{ from: "2026-10-01", to: "2026-11-01" }],
      ),
    ).toEqual([{ from: "2025-09-14", to: "2026-06-18" }]);
  });
});

describe("ending a span on a day", () => {
  const span = { from: "2026-09-13", to: "2027-06-18" };

  it("keeps the days before it", () => {
    expect(endedOn(span, "2026-11-01")).toEqual({
      from: "2026-09-13",
      to: "2026-11-01",
    });
  });

  it("leaves nothing of a span that had not begun", () => {
    expect(endedOn(span, "2026-09-13")).toBeNull();
    expect(endedOn(span, "2026-09-01")).toBeNull();
  });

  it("keeps a span already over", () => {
    expect(endedOn(span, "2027-06-18")).toBe("kept");
  });
});

describe("the forms", () => {
  it("refuse a homeroom with a subject twice", () => {
    const result = v.safeParse(saveHomeroomSchema, {
      yearId: id(1),
      code: "8-A",
      titleEn: "8A",
      subjects: [
        { subjectId: id(2), teacherIds: [] },
        { subjectId: id(2), teacherIds: [] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.message).toBe("validation.subject_twice");
  });

  it("take a class with no subject, course, grade or teacher", () => {
    const result = v.safeParse(saveClassSchema, {
      yearId: id(1),
      code: "PY-101",
      titleEn: "Python from scratch",
      teacherIds: [],
    });
    expect(result.success).toBe(true);
  });
});
