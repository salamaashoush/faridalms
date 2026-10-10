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
  v.pipe(
    v.object({
      // The cell's pools, one login role each; the directory for routing.
      CELL_APP_URL: v.pipe(v.string(), v.url()),
      CELL_SITE_URL: v.optional(v.pipe(v.string(), v.url())),
      // Settles uploads: only the worker role may set a file's state and digest.
      CELL_WORKER_URL: v.optional(v.pipe(v.string(), v.url())),
      // Runs approved erasures: the only role that may null a person's data.
      CELL_RETENTION_URL: v.optional(v.pipe(v.string(), v.url())),
      DIRECTORY_URL: v.pipe(v.string(), v.url()),
      CELL_ID: v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
      // Wraps each tenant's data keys; a deployed cell wraps through its KMS.
      CELL_KEK: bytes(32),
      // Derives per-tenant keys for sign-in counters, so no raw identifier is stored.
      CELL_SECRET: bytes(32),
      API_PORT: v.optional(positiveInteger, "3001"),
      CELL_POOL_SIZE: v.optional(positiveInteger, "10"),
      // The files host listens beside the API; FILES_ORIGIN is how browsers reach it.
      FILES_PORT: v.optional(positiveInteger),
      FILES_ORIGIN: v.optional(v.pipe(v.string(), v.url())),
      // The media service as browsers reach it; set, uploaded video is
      // encoded to adaptive streams, and unset it plays as uploaded.
      MEDIA_ORIGIN: v.optional(v.pipe(v.string(), v.url())),
      // Set where the media service has a speech model, so teachers may ask
      // it to draft a recording's captions.
      MEDIA_CAPTIONS: v.optional(v.picklist(["on", "off"]), "off"),
      FILE_STORAGE: v.optional(v.picklist(["disk", "s3"]), "disk"),
      FILE_STORAGE_DIR: v.optional(
        v.pipe(v.string(), v.minLength(1)),
        ".data/files",
      ),
      S3_ENDPOINT: v.optional(v.pipe(v.string(), v.url())),
      S3_REGION: v.optional(v.pipe(v.string(), v.minLength(1))),
      S3_ACCESS_KEY_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
      S3_SECRET_ACCESS_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
      FILE_BUCKET: v.optional(v.pipe(v.string(), v.minLength(1))),
      PUBLIC_MEDIA_BUCKET: v.optional(v.pipe(v.string(), v.minLength(1))),
      MAX_UPLOAD_BYTES: v.optional(positiveInteger, String(25 * 1024 * 1024)),
      FILE_SWEEP_MS: v.optional(positiveInteger, String(60 * 60 * 1000)),
      // The directory_sync login, for reporting each school's storage; without it nothing is reported.
      DIRECTORY_SYNC_URL: v.optional(v.pipe(v.string(), v.url())),
      USAGE_REPORT_MS: v.optional(positiveInteger, String(5 * 60 * 1000)),
      // Python for marking code exercises, as apps/api/scripts/python-wasi.ts
      // fetches it; by default vendor/python beside the running API.
      PYTHON_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // The Scratch editor and its library for the coding studio, as
      // apps/api/scripts/scratch.ts fetches them; by default vendor/scratch
      // beside the API's code.
      SCRATCH_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // The micro:bit editor, as apps/api/scripts/makecode.ts lays it out;
      // by default vendor/makecode/editor beside the API's code.
      MAKECODE_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // Where the source of this running copy is published. The coding
      // studio's Source link names it, as the licence asks of whoever runs a
      // changed copy for other people.
      SOURCE_URL: v.optional(v.pipe(v.string(), v.url())),
      // host:port of a clamd daemon; uploads are only signature-checked without one.
      CLAMD_ADDRESS: v.optional(v.pipe(v.string(), v.regex(/^[^\s:]+:\d+$/))),
      // Transactional email and SMS gateways that accept a JSON POST.
      EMAIL_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
      SMS_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
      NOTIFY_WEBHOOK_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),
    }),
    v.check(
      (value) =>
        value.FILE_STORAGE === "disk" ||
        (value.FILE_BUCKET !== undefined &&
          value.PUBLIC_MEDIA_BUCKET !== undefined),
      "FILE_STORAGE=s3 needs FILE_BUCKET and PUBLIC_MEDIA_BUCKET",
    ),
  ),
  process.env,
);
