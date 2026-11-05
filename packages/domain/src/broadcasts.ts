import * as v from "valibot";

import { pageField } from "./paging";

/**
 * The two kinds of broadcast a school sends. An announcement goes to its
 * audience and can ask them to acknowledge it; a news post can also be on
 * the website, with an address, a category and a cover. Each kind's words
 * are the document hosted as the kind itself.
 */
export const BROADCAST_KINDS = ["announcement", "news"] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

/** A page of the people a broadcast reached, narrowed by name. */
export const reportQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: pageField,
});
export type ReportQuery = v.InferInput<typeof reportQuerySchema>;
