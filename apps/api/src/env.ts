import { presentVariables } from "@faridalms/domain/environment";
import { isHostname } from "@faridalms/domain/hosts";
import * as v from "valibot";

const positiveInteger = v.pipe(
  v.string(),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
);
// A registrable domain the platform names schools under, such as faridalms.com.
const domain = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(
    (value) => value === "localhost" || isHostname(value),
    "must be a domain name",
  ),
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
      // `<slug>.<PORTAL_DOMAIN>` is a school's portal and `<slug>.<SITES_DOMAIN>`
      // its website, unless it binds its own; links in email and exports are
      // built from them, never from a request's Host header.
      NODE_ENV: v.optional(v.string()),
      PORTAL_DOMAIN: domain,
      SITES_DOMAIN: domain,
      // The address a school's own apex domain points its A record at: the
      // edge's public IPv4. Unset, only subdomains (by CNAME) can be bound.
      EDGE_IPV4: v.optional(v.pipe(v.string(), v.ipv4())),
      CELL_ID: v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
      // Wraps each tenant's data keys; a deployed cell wraps through its KMS.
      CELL_KEK: bytes(32),
      // Derives per-tenant keys for sign-in counters, so no raw identifier is stored.
      CELL_SECRET: bytes(32),
      API_PORT: v.optional(positiveInteger, "3001"),
      // Proxies in front of the API that append to X-Forwarded-For; the
      // client is the entry the outermost of them added.
      TRUSTED_PROXY_HOPS: v.optional(positiveInteger, "1"),
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
      // `virtual` puts the bucket in the host name
      // (https://<bucket>.<endpoint host>), which some services, Hetzner's
      // among them, document as their only form; `path` puts it in the path.
      S3_ADDRESSING_STYLE: v.optional(v.picklist(["path", "virtual"]), "path"),
      S3_REGION: v.optional(v.pipe(v.string(), v.minLength(1))),
      S3_ACCESS_KEY_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
      S3_SECRET_ACCESS_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
      FILE_BUCKET: v.optional(v.pipe(v.string(), v.minLength(1))),
      PUBLIC_MEDIA_BUCKET: v.optional(v.pipe(v.string(), v.minLength(1))),
      MAX_UPLOAD_BYTES: v.optional(positiveInteger, String(25 * 1024 * 1024)),
      FILE_SWEEP_MS: v.optional(positiveInteger, String(60 * 60 * 1000)),
      // The directory_sync login, for reporting each school's storage and for
      // binding and checking schools' own hosts; without it neither happens.
      DIRECTORY_SYNC_URL: v.optional(v.pipe(v.string(), v.url())),
      USAGE_REPORT_MS: v.optional(positiveInteger, String(5 * 60 * 1000)),
      // Python for marking code exercises, as apps/api/scripts/python-wasi.ts
      // fetches it; by default vendor/python beside the running API.
      PYTHON_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // The coding studio as `farida-studio` puts it together (its page, the
      // Scratch editor and the library); by default vendor/scratch beside the
      // API's code.
      SCRATCH_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // The micro:bit editor, as apps/api/scripts/makecode.ts lays it out;
      // by default vendor/makecode/editor beside the API's code.
      MAKECODE_DIR: v.optional(v.pipe(v.string(), v.minLength(1))),
      // host:port of a clamd daemon; uploads are only signature-checked without one.
      CLAMD_ADDRESS: v.optional(v.pipe(v.string(), v.regex(/^[^\s:]+:\d+$/))),
      // Email through Resend's API, from this sender on a domain verified
      // there, for example `Farida <no-reply@mail.example.com>`.
      // Where the product site's demonstration requests are emailed; only
      // the platform's own deployment sets it.
      PRODUCT_INBOX: v.optional(v.pipe(v.string(), v.trim(), v.email())),
      // Cloudflare Turnstile on the websites' forms, both keys or neither.
      // Without them the forms keep their hidden field, fill time and limits.
      TURNSTILE_SITE_KEY: v.optional(
        v.pipe(v.string(), v.trim(), v.minLength(1)),
      ),
      TURNSTILE_SECRET_KEY: v.optional(
        v.pipe(v.string(), v.trim(), v.minLength(1)),
      ),
      RESEND_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
      EMAIL_FROM: v.optional(v.pipe(v.string(), v.minLength(3))),
      // Transactional email and SMS gateways that accept a JSON POST.
      EMAIL_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
      SMS_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
      NOTIFY_WEBHOOK_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),
      // Set together, the process also listens for the operator console's
      // calls that create schools, as the provisioner login. Only the
      // provisioner service gets these; the public API never does.
      CELL_PROVISION_URL: v.optional(v.pipe(v.string(), v.url())),
      PROVISION_SECRET: v.optional(bytes(32)),
      PROVISION_PORT: v.optional(positiveInteger, "3005"),
      // Loopback by default; a container listens on its private network.
      PROVISION_HOST: v.optional(
        v.pipe(v.string(), v.minLength(1)),
        "127.0.0.1",
      ),
    }),
    v.check(
      (value) =>
        value.FILE_STORAGE === "disk" ||
        (value.FILE_BUCKET !== undefined &&
          value.PUBLIC_MEDIA_BUCKET !== undefined),
      "FILE_STORAGE=s3 needs FILE_BUCKET and PUBLIC_MEDIA_BUCKET",
    ),
    v.check(
      (value) => value.PORTAL_DOMAIN !== value.SITES_DOMAIN,
      "PORTAL_DOMAIN and SITES_DOMAIN must differ",
    ),
    // Students' code runs under the sites domain, so in production it may
    // not sit inside the portal's (or the portal inside it), where it would
    // share the portal's site. Development nests them under localhost.
    v.check(
      (value) =>
        value.NODE_ENV !== "production" ||
        !(
          value.SITES_DOMAIN.endsWith(`.${value.PORTAL_DOMAIN}`) ||
          value.PORTAL_DOMAIN.endsWith(`.${value.SITES_DOMAIN}`)
        ),
      "SITES_DOMAIN must be another domain from PORTAL_DOMAIN, not one inside it",
    ),
    v.check(
      (value) =>
        (value.CELL_PROVISION_URL === undefined) ===
        (value.PROVISION_SECRET === undefined),
      "CELL_PROVISION_URL and PROVISION_SECRET are set together or not at all",
    ),
    v.check(
      (value) =>
        (value.RESEND_API_KEY === undefined) ===
        (value.EMAIL_FROM === undefined),
      "RESEND_API_KEY and EMAIL_FROM are set together or not at all",
    ),
    v.check(
      (value) =>
        value.RESEND_API_KEY === undefined ||
        value.EMAIL_WEBHOOK_URL === undefined,
      "Email goes through RESEND_API_KEY or EMAIL_WEBHOOK_URL, not both",
    ),
  ),
  presentVariables(process.env),
);
