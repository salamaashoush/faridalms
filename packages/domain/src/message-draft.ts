import * as v from "valibot";

import {
  MESSAGE_CATEGORIES,
  messageBodyFormatSchema,
  messageDocumentSchema,
  messageFileIdsSchema,
} from "./school-schema";

export const messageDraftQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});

export const saveMessageDraftSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  category: v.picklist(MESSAGE_CATEGORIES),
  recipientId: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
    "",
  ),
  studentId: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
    "",
  ),
  subject: v.pipe(v.string(), v.maxLength(255)),
  body: v.pipe(v.string(), v.maxLength(20000)),
  bodyFormat: messageBodyFormatSchema,
  document: messageDocumentSchema,
  fileIds: messageFileIdsSchema,
});

export const sendMessageDraftSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export type SaveMessageDraftInput = v.InferOutput<
  typeof saveMessageDraftSchema
>;
