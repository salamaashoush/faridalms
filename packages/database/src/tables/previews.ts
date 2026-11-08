import type { PreviewKind, PreviewSize } from "@faridalms/domain/previews";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { tenants } from "./tenancy";

export type PreviewState = "queued" | "working" | "ready" | "failed";

/**
 * What the media service makes from a file's bytes for showing them: a
 * picture's sizes and placeholder, a recording's length and waveform, a
 * PDF's first page, an office file as a PDF. They belong to the bytes, not
 * to a file row, so every row sharing a stored object shares them, and they
 * go once no active row holds those bytes. Queued when a file is ready and
 * leased to a worker as captions drafts are.
 */
export const filePreviews = core.table.withRLS(
  "file_previews",
  {
    ...tenantColumns(),
    storageKey: text("storage_key").notNull(),
    kind: text("kind").$type<PreviewKind>().notNull(),
    mediaType: text("media_type").notNull(),
    state: text("state").$type<PreviewState>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    leasedUntil: instant("leased_until"),
    progress: real("progress"),
    error: text("error"),
    /** A picture's own size upright, or a document's first page as drawn. */
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    /** A ThumbHash, base64, drawn while the picture loads. */
    placeholder: text("placeholder"),
    sizes: jsonb("sizes")
      .$type<PreviewSize[]>()
      .notNull()
      .default(sql`'[]'`),
    /** A recording's loudness in 100 spans, each 0 to 100. */
    waveform: jsonb("waveform").$type<number[]>(),
    pages: integer("pages"),
    /** What an office file's PDF weighs, once converted. */
    documentBytes: bigint("document_bytes", { mode: "number" }),
    /** What everything made weighs in the store. */
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("file_previews", t.tenantId, t.id),
    ...baseConstraints("file_previews", t, tenants),
    ck(
      "file_previews",
      "storage_key",
      sql`starts_with(storage_key, 't/' || tenant_id::text || '/f/') and char_length(storage_key) <= 512`,
    ),
    ck(
      "file_previews",
      "kind",
      sql`kind in ('picture', 'audio', 'pdf', 'office')`,
    ),
    ck(
      "file_previews",
      "media_type",
      sql`char_length(media_type) between 3 and 128`,
    ),
    ck(
      "file_previews",
      "state",
      sql`state in ('queued', 'working', 'ready', 'failed')`,
    ),
    ck("file_previews", "attempts", sql`attempts between 0 and 10`),
    ck("file_previews", "progress", sql`progress between 0 and 1`),
    ck("file_previews", "error", sql`char_length(error) <= 2000`),
    ck(
      "file_previews",
      "lease",
      sql`(state = 'working') = (leased_until is not null)`,
    ),
    ck("file_previews", "width", sql`width between 1 and 100000`),
    ck("file_previews", "height", sql`height between 1 and 100000`),
    ck("file_previews", "duration_ms", sql`duration_ms > 0`),
    ck(
      "file_previews",
      "placeholder",
      sql`placeholder ~ '^[A-Za-z0-9+/]{4,80}={0,2}$'`,
    ),
    ck(
      "file_previews",
      "sizes",
      sql`jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) <= 20`,
    ),
    ck(
      "file_previews",
      "waveform",
      sql`jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 400`,
    ),
    ck("file_previews", "pages", sql`pages > 0`),
    ck("file_previews", "document_bytes", sql`document_bytes > 0`),
    ck("file_previews", "bytes", sql`bytes >= 0`),
    uniqueIndex("file_previews_key")
      .on(t.tenantId, t.storageKey)
      .where(sql`status = 'active'`),
    index("file_previews_queue_idx")
      .on(t.tenantId, t.createdAt)
      .where(sql`status = 'active' and state in ('queued', 'working')`),
    ...entityProfile(),
  ],
);
