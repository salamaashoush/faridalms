import * as v from "valibot";

const positiveInteger = v.pipe(
  v.string(),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
);
const bytes = (length: number) =>
  v.pipe(
    v.string(),
    v.base64(),
    v.check(
      (value) => Buffer.from(value, "base64").length >= length,
      `must decode to at least ${length} bytes`,
    ),
  );

export const env = v.parse(
  v.object({
    // The cell's pools, one login role each; the directory for routing.
    CELL_APP_URL: v.pipe(v.string(), v.url()),
    CELL_SITE_URL: v.optional(v.pipe(v.string(), v.url())),
    // Settles uploads: only the worker role may set a file's state and digest.
    CELL_WORKER_URL: v.optional(v.pipe(v.string(), v.url())),
    DIRECTORY_URL: v.pipe(v.string(), v.url()),
    CELL_ID: v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
    // Wraps each tenant's data keys; a deployed cell wraps through its KMS.
    CELL_KEK: bytes(32),
    // Derives per-tenant keys for sign-in counters, so no raw identifier is stored.
    CELL_SECRET: bytes(32),
    API_PORT: v.optional(positiveInteger, "3001"),
    CELL_POOL_SIZE: v.optional(positiveInteger, "10"),
    // Private uploads land here until an object-store adapter is configured.
    FILE_STORAGE_DIR: v.optional(
      v.pipe(v.string(), v.minLength(1)),
      ".data/files",
    ),
    MAX_UPLOAD_BYTES: v.optional(positiveInteger, String(25 * 1024 * 1024)),
    // host:port of a clamd daemon; uploads are only signature-checked without one.
    CLAMD_ADDRESS: v.optional(v.pipe(v.string(), v.regex(/^[^\s:]+:\d+$/))),
    // Transactional email and SMS gateways that accept a JSON POST.
    EMAIL_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
    SMS_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
    NOTIFY_WEBHOOK_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),
  }),
  process.env,
);
