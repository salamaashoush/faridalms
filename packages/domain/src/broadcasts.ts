/**
 * The two kinds of broadcast a school sends. An announcement goes to its
 * audience and can ask them to acknowledge it; a news post can also be on
 * the website, with an address, a category and a cover. Each kind's words
 * are the document hosted as the kind itself.
 */
export const BROADCAST_KINDS = ["announcement", "news"] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];
