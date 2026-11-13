import * as v from "valibot";

import type { PublishedPicture } from "./previews";
import type { SectionOf } from "./site-sections";

const id = v.pipe(v.string(), v.uuid());
const words = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

export const MAX_CLASS_TITLE = 120;
export const MAX_CLASS_DESCRIPTION = 600;
export const MAX_CLASS_LEVEL = 80;

/** What a school says of one class on its website, as the class record sends it. */
export const classWebsiteSchema = v.object({
  classId: id,
  shown: v.boolean(),
  titleEn: words(MAX_CLASS_TITLE),
  titleAr: words(MAX_CLASS_TITLE),
  descriptionEn: words(MAX_CLASS_DESCRIPTION),
  descriptionAr: words(MAX_CLASS_DESCRIPTION),
  levelEn: words(MAX_CLASS_LEVEL),
  levelAr: words(MAX_CLASS_LEVEL),
  pictureFileId: v.nullable(id),
  pictureAltEn: words(300),
  pictureAltAr: words(300),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type ClassWebsite = v.InferOutput<typeof classWebsiteSchema>;

export type ClassWebsiteIssue = "description" | "alt";

/**
 * What stops a class going on the website: a visitor reads its description,
 * so one is written, and its picture is described in each language the
 * description is written in.
 */
export function classWebsiteIssues(
  input: Pick<
    ClassWebsite,
    | "shown"
    | "descriptionEn"
    | "descriptionAr"
    | "pictureFileId"
    | "pictureAltEn"
    | "pictureAltAr"
  >,
): ClassWebsiteIssue[] {
  if (!input.shown) return [];
  const issues: ClassWebsiteIssue[] = [];
  if (!input.descriptionEn && !input.descriptionAr) issues.push("description");
  if (
    input.pictureFileId &&
    ((input.descriptionEn && !input.pictureAltEn) ||
      (input.descriptionAr && !input.pictureAltAr))
  )
    issues.push("alt");
  return issues;
}

export const publicClassesSchema = v.object({
  school: v.pipe(v.string(), v.minLength(1), v.maxLength(63)),
  locale: v.optional(v.picklist(["en", "ar"])),
});

/** A class as a visitor reads it on the school's website, in one language. */
export interface SiteClass {
  id: string;
  title: string;
  description: string;
  level: string;
  picture: {
    key: string;
    alt: string;
    published: PublishedPicture | null;
  } | null;
  startsOn: string;
  /** Its last day, or null for a class that keeps enrolling. */
  endsOn: string | null;
  courseId: string | null;
  teachers: string[];
}

/** When a class runs, as a reader is told it; null once it has ended. */
export type ClassWhen =
  | { kind: "starts"; on: string }
  | { kind: "running"; until: string | null };

export function classWhen(
  runs: { startsOn: string; endsOn: string | null },
  today: string,
): ClassWhen | null {
  if (runs.endsOn !== null && runs.endsOn < today) return null;
  if (runs.startsOn > today) return { kind: "starts", on: runs.startsOn };
  return { kind: "running", until: runs.endsOn };
}

const DAY = 86_400_000;

/** How long a class with an end runs, in whole weeks, or days when under one. */
export function classLength(runs: {
  startsOn: string;
  endsOn: string | null;
}): { weeks: number } | { days: number } | null {
  if (runs.endsOn === null) return null;
  const days =
    Math.round((Date.parse(runs.endsOn) - Date.parse(runs.startsOn)) / DAY) + 1;
  if (days < 1) return null;
  return days < 7 ? { days } : { weeks: Math.round(days / 7) };
}

/**
 * The classes a courses section lists: those it picks of the classes the
 * school shows, any that have ended dropped, in its order, at most its count.
 */
export function listedClasses(
  data: Pick<
    SectionOf<"courses">["data"],
    "pick" | "classIds" | "courseId" | "order" | "count"
  >,
  classes: readonly SiteClass[],
  today: string,
): SiteClass[] {
  const chosen = new Set<string>(data.classIds);
  const picked = classes.filter(
    (row) =>
      classWhen(row, today) !== null &&
      (data.pick === "all" ||
        (data.pick === "chosen" && chosen.has(row.id)) ||
        (data.pick === "course" &&
          data.courseId !== "" &&
          row.courseId === data.courseId)),
  );
  const sorted = picked.toSorted((a, b) =>
    data.order === "title"
      ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
      : a.startsOn.localeCompare(b.startsOn) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
  );
  return sorted.slice(0, data.count);
}
