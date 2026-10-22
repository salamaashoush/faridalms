import * as v from "valibot";

import type { Capability } from "./capabilities";

import { contentDocumentSchema } from "./content";

/** What a school keeps templates for: documents its staff start often. */
export const TEMPLATE_KINDS = [
  "lesson",
  "assignment",
  "unit_plan",
  "news",
  "announcement",
  "event",
  "consent_form",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Who writes each kind of document, and so may keep and use its templates. */
export const TEMPLATE_AUTHORS: Record<TemplateKind, readonly Capability[]> = {
  lesson: ["learning:author"],
  assignment: ["assignments:author"],
  unit_plan: ["learning:author"],
  news: ["news:manage"],
  announcement: ["announcements:manage"],
  event: ["calendar:manage", "calendar:author"],
  consent_form: ["privacy:manage"],
};

/** The kinds of document someone holding these capabilities writes. */
export const kindsWritten = (capabilities: readonly string[]) =>
  TEMPLATE_KINDS.filter((kind) =>
    TEMPLATE_AUTHORS[kind].some((capability) =>
      capabilities.includes(capability),
    ),
  );

const id = v.pipe(v.string(), v.uuid());

const optionalId = v.optional(v.union([v.literal(""), id]), "");
const note = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), "");

export const saveTemplateSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  /** What it is for and how it is taught, as the library shows it. */
  description: note,
  subjectId: optionalId,
  content: contentDocumentSchema,
});
export type SaveTemplate = v.InferOutput<typeof saveTemplateSchema>;

export const templateKindSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
});
export const templateRefSchema = v.object({ id });

/** The school library as its teachers browse it. */
export const librarySchema = v.object({
  kind: v.optional(v.union([v.literal(""), v.picklist(TEMPLATE_KINDS)]), ""),
  subjectId: optionalId,
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});

/** A reviewer shares a piece with the school, or sends it back with a note. */
export const reviewTemplateSchema = v.object({
  id,
  share: v.boolean(),
  note,
});
