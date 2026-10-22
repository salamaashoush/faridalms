import * as v from "valibot";

import { contentDocumentSchema } from "./content";

/** What a school keeps templates for: documents its teachers start often. */
export const TEMPLATE_KINDS = ["lesson", "assignment", "unit_plan"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

const id = v.pipe(v.string(), v.uuid());

export const saveTemplateSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  content: contentDocumentSchema,
});
export type SaveTemplate = v.InferOutput<typeof saveTemplateSchema>;

export const templateKindSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
});
export const templateRefSchema = v.object({ id });
