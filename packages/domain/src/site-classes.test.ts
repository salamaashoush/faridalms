import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { SiteClass } from "./site-classes";

import {
  classLength,
  classWebsiteIssues,
  classWhen,
  listedClasses,
} from "./site-classes";
import {
  newSection,
  pageSectionSchema,
  sectionModule,
  SECTION_SPECS,
  shownFields,
} from "./site-sections";
import { buildSection } from "./site-templates";

const TODAY = "2026-11-14";

const row = (
  id: string,
  title: string,
  startsOn: string,
  endsOn: string | null,
  courseId: string | null = null,
): SiteClass => ({
  id,
  title,
  description: "",
  level: "",
  picture: null,
  startsOn,
  endsOn,
  courseId,
  teachers: [],
});

const COURSE = "8f6e3f0e-6c1d-4a35-9d5e-2a3b4c5d6e7f";
const CLASSES = [
  row("a", "Web", "2026-12-06", "2027-02-27", COURSE),
  row("b", "Art", "2026-09-01", null),
  row("c", "Old", "2025-09-01", "2026-06-30"),
  row("d", "Data", "2027-01-10", "2027-03-10", COURSE),
];

describe("the courses section", () => {
  it("lists the school's classes in three layouts, belonging to no other module", () => {
    expect(SECTION_SPECS.courses.variants).toEqual(["grid", "list", "table"]);
    expect(sectionModule("courses")).toBeNull();
    const blank = newSection("courses");
    expect(blank.data).toMatchObject({
      pick: "all",
      classIds: [],
      courseId: "",
      order: "start",
      count: 6,
      dates: "show",
      teachers: "hide",
      duration: "show",
      level: "show",
      action: [],
      items: [],
    });
    expect(v.safeParse(pageSectionSchema, blank).success).toBe(true);
  });

  it("asks for the classes or the course only when the section picks by them, and never shows its samples to edit", () => {
    const section = newSection("courses");
    const names = (pick: "all" | "chosen" | "course") =>
      shownFields({ ...section, data: { ...section.data, pick } }).map(
        ([name]) => name,
      );
    expect(names("all")).not.toContain("classIds");
    expect(names("all")).not.toContain("courseId");
    expect(names("chosen")).toContain("classIds");
    expect(names("course")).toContain("courseId");
    expect(names("chosen")).not.toContain("items");
  });

  it("has a sample in every layout, written in both languages", () => {
    for (const variant of SECTION_SPECS.courses.variants) {
      const { content, translation } = buildSection("courses", variant, "en");
      if (content.type !== "courses" || translation.type !== "courses")
        throw new Error("courses");
      expect(content.data.items).toHaveLength(3);
      expect(translation.data.items.map((item) => item.id)).toEqual(
        content.data.items.map((item) => item.id),
      );
      expect(translation.data.items[0]?.title).toMatch(/[؀-ۿ]/);
      expect(content.data.action[0]?.label).toBe("Ask about a place");
    }
  });
});

describe("when a class runs", () => {
  it("starts on a day to come, runs open-ended or to its last day, and is gone once ended", () => {
    expect(classWhen({ startsOn: "2026-12-06", endsOn: null }, TODAY)).toEqual({
      kind: "starts",
      on: "2026-12-06",
    });
    expect(classWhen({ startsOn: "2026-09-01", endsOn: null }, TODAY)).toEqual({
      kind: "running",
      until: null,
    });
    expect(
      classWhen({ startsOn: "2026-09-01", endsOn: "2027-03-20" }, TODAY),
    ).toEqual({ kind: "running", until: "2027-03-20" });
    expect(classWhen({ startsOn: "2026-09-01", endsOn: TODAY }, TODAY)).toEqual(
      { kind: "running", until: TODAY },
    );
    expect(
      classWhen({ startsOn: "2026-09-01", endsOn: "2026-11-13" }, TODAY),
    ).toBeNull();
  });

  it("is as long as its weeks, or its days when under one, and has no length while open", () => {
    expect(
      classLength({ startsOn: "2026-12-06", endsOn: "2027-02-13" }),
    ).toEqual({ weeks: 10 });
    expect(
      classLength({ startsOn: "2026-12-06", endsOn: "2026-12-12" }),
    ).toEqual({ weeks: 1 });
    expect(
      classLength({ startsOn: "2026-12-06", endsOn: "2026-12-08" }),
    ).toEqual({ days: 3 });
    expect(classLength({ startsOn: "2026-12-06", endsOn: null })).toBeNull();
  });
});

describe("the classes a section lists", () => {
  const base = {
    pick: "all" as const,
    classIds: [],
    courseId: "",
    order: "start" as const,
    count: 6,
  };
  const ids = (data: Partial<Parameters<typeof listedClasses>[0]>) =>
    listedClasses({ ...base, ...data }, CLASSES, TODAY).map((each) => each.id);

  it("are every shown class still to end, soonest start first", () => {
    expect(ids({})).toEqual(["b", "a", "d"]);
  });

  it("follow the section's order, count, choice and course", () => {
    expect(ids({ order: "title" })).toEqual(["b", "d", "a"]);
    expect(ids({ count: 2 })).toEqual(["b", "a"]);
    expect(ids({ pick: "chosen", classIds: ["d", "c"] })).toEqual(["d"]);
    expect(ids({ pick: "course", courseId: COURSE })).toEqual(["a", "d"]);
    expect(ids({ pick: "course", courseId: "" })).toEqual([]);
  });
});

describe("a class's words on the website", () => {
  const shown = {
    shown: true,
    descriptionEn: "Ten evenings.",
    descriptionAr: "",
    pictureFileId: null,
    pictureAltEn: "",
    pictureAltAr: "",
  };

  it("need a description to be shown, and a described picture", () => {
    expect(classWebsiteIssues(shown)).toEqual([]);
    expect(
      classWebsiteIssues({ ...shown, descriptionEn: "", shown: false }),
    ).toEqual([]);
    expect(classWebsiteIssues({ ...shown, descriptionEn: "" })).toEqual([
      "description",
    ]);
    expect(classWebsiteIssues({ ...shown, pictureFileId: COURSE })).toEqual([
      "alt",
    ]);
    expect(
      classWebsiteIssues({
        ...shown,
        pictureFileId: COURSE,
        pictureAltEn: "Learners at their laptops",
      }),
    ).toEqual([]);
  });
});
