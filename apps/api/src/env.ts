import * as v from "valibot";

const positiveInteger = v.pipe(
  v.string(),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
);
export const env = v.parse(
  v.object({
    CONTROL_DATABASE_URL: v.pipe(v.string(), v.url()),
    API_PORT: v.optional(positiveInteger, "3001"),
    MAX_TENANT_POOLS: v.optional(positiveInteger, "32"),
    TENANT_POOL_SIZE: v.optional(positiveInteger, "4"),
    // Private uploads land here until an object-store adapter is configured.
    FILE_STORAGE_DIR: v.optional(
      v.pipe(v.string(), v.minLength(1)),
      ".data/files",
    ),
    MAX_UPLOAD_BYTES: v.optional(positiveInteger, String(25 * 1024 * 1024)),
  }),
  process.env,
);
