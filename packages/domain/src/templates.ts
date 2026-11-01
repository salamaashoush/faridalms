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
  "module",
  "admission_letter",
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
  module: ["learning:author"],
  admission_letter: ["admissions:configure"],
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

/** Kinds kept as one document; a module is kept whole, lessons and all. */
export const DOCUMENT_TEMPLATE_KINDS = [
  "lesson",
  "assignment",
  "unit_plan",
  "news",
  "announcement",
  "event",
  "consent_form",
  "admission_letter",
] as const satisfies readonly TemplateKind[];
export type DocumentTemplateKind = (typeof DOCUMENT_TEMPLATE_KINDS)[number];

export const saveTemplateSchema = v.object({
  kind: v.picklist(DOCUMENT_TEMPLATE_KINDS),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  /** What it is for and how it is taught, as the library shows it. */
  description: note,
  subjectId: optionalId,
  content: contentDocumentSchema,
});
export type SaveTemplate = v.InferOutput<typeof saveTemplateSchema>;

/**
 * Kinds whose templates the school was given are what the product sends
 * from, such as the letters of admission: the school edits them and never
 * removes them.
 */
export const KEPT_BUILTIN_KINDS: readonly TemplateKind[] = ["admission_letter"];

/** A template's words changed in place, by its owner, a reviewer, or for one the school was given, by those who write its kind. */
export const updateTemplateSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  content: contentDocumentSchema,
});
export type UpdateTemplate = v.InferOutput<typeof updateTemplateSchema>;

export const templateKindSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
});
export const templateRefSchema = v.object({ id });

/** A whole module offered to the library, its lessons and plan with it. */
export const shareModuleSchema = v.object({
  moduleId: id,
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  description: note,
  subjectId: optionalId,
});

/** A module from the library started for one of the teacher's classes. */
export const moduleFromLibrarySchema = v.object({ id, classId: id });

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
