import * as v from "valibot";

import { contentDocumentSchema, contentPlainText } from "./content";
import {
  isSafeContentUrl,
  richTextDocumentSchema,
  richTextPlainText,
} from "./rich-text";

const id = v.pipe(v.string(), v.uuid());
const alignment = v.picklist(["start", "center", "end"]);
const text = (length: number) => v.pipe(v.string(), v.maxLength(length));

export const newsletterBlockSchema = v.variant("type", [
  v.object({
    id,
    type: v.literal("heading"),
    text: text(255),
    level: v.picklist([2, 3]),
    alignment,
  }),
  v.object({ id, type: v.literal("text"), content: richTextDocumentSchema }),
  v.object({ id, type: v.literal("content"), content: contentDocumentSchema }),
  v.object({
    id,
    type: v.literal("image"),
    assetId: id,
    alt: text(1000),
    caption: text(2000),
  }),
  v.object({
    id,
    type: v.literal("button"),
    label: text(255),
    href: v.pipe(v.string(), v.maxLength(2048), v.check(isSafeContentUrl)),
    alignment,
  }),
  v.object({ id, type: v.literal("divider") }),
]);

const column = v.object({ id, blocks: v.array(newsletterBlockSchema) });
const section = v.object({
  id,
  columns: v.pipe(v.array(column), v.minLength(1), v.maxLength(3)),
  tone: v.picklist(["plain", "muted", "accent"]),
});

export const newsletterDocumentSchema = v.pipe(
  v.object({
    version: v.literal(1),
    locale: v.picklist(["en", "ar"]),
    sections: v.array(section),
  }),
  v.check((document) => {
    const ids = new Set<string>();
    for (const item of document.sections) {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      for (const group of item.columns) {
        if (ids.has(group.id)) return false;
        ids.add(group.id);
        for (const block of group.blocks) {
          if (ids.has(block.id)) return false;
          ids.add(block.id);
        }
      }
    }
    return true;
  }, "newsletter.duplicate_ids"),
);

export type NewsletterDocument = v.InferOutput<typeof newsletterDocumentSchema>;
export type NewsletterBlock = v.InferOutput<typeof newsletterBlockSchema>;

export function newsletterPlainText(document: NewsletterDocument): string {
  return document.sections
    .flatMap((item) =>
      item.columns.flatMap((group) =>
        group.blocks.map((block) => {
          switch (block.type) {
            case "heading":
              return block.text;
            case "content":
              return contentPlainText(block.content);
            case "text":
              return richTextPlainText(block.content);
            case "button":
              return block.label;
            case "image":
              return [block.alt, block.caption].filter(Boolean).join("\n");
            case "divider":
              return "";
          }
          throw new Error("newsletter.invalid_block");
        }),
      ),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function newsletterAssetIds(document: NewsletterDocument): string[] {
  return [
    ...new Set(
      document.sections.flatMap((item) =>
        item.columns.flatMap((group) =>
          group.blocks.flatMap((block) =>
            block.type === "image" ? [block.assetId] : [],
          ),
        ),
      ),
    ),
  ];
}

export function moveNewsletterBlock(
  document: NewsletterDocument,
  blockId: string,
  targetColumnId: string,
  targetIndex: number,
): NewsletterDocument {
  const columns = document.sections.flatMap((item) => item.columns);
  const source = columns.find((group) =>
    group.blocks.some((block) => block.id === blockId),
  );
  const target = columns.find((group) => group.id === targetColumnId);
  const block = source?.blocks.find((item) => item.id === blockId);
  if (!source || !target || !block) throw new Error("newsletter.block_missing");
  const length = target.blocks.length - (source.id === target.id ? 1 : 0);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > length)
    throw new Error("newsletter.invalid_position");
  return {
    ...document,
    sections: document.sections.map((item) => ({
      ...item,
      columns: item.columns.map((group) => {
        const blocks = group.blocks.filter((entry) => entry.id !== blockId);
        if (group.id === targetColumnId) blocks.splice(targetIndex, 0, block);
        return { ...group, blocks };
      }),
    })),
  };
}
