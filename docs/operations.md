# Operations

## Deployment

Build both Docker targets, `web` and `api`, or use `compose.production.yaml`.
The API requires `CONTROL_DATABASE_URL`. The web requires `BACKEND_URL`, pointing
to the API's internal address. Both validate their required environment at startup.
Expose the web and the native-client API through a TLS reverse proxy. Only trust
forwarded protocol headers from that proxy; it must replace client-supplied headers.
The web uses the forwarded protocol to set Secure cookies correctly.

Apply migrations before enabling a new school or rolling out schema-dependent
code. The web can scale independently of the API. All replicas share the control
database so sessions and login throttles remain consistent across instances.
The API drains HTTP requests on termination and closes its pools afterward.

`bun run smoke:containers` builds both targets, runs them on the host network
against the databases in `.env`, checks `/health/live`, `/health/ready`, a real
sign-in through a school pool, the web health route and a server-rendered page in
both languages, then stops each container and expects a clean exit within the
grace period. Run it before a release and after changing the Dockerfile, the
health routes or the startup environment validation.

## Registering a school

Create a PostgreSQL database and a dedicated database role for the school. Use an
administrator or migration role to apply migrations, then give the runtime role
only the required database/schema/table privileges. Do not use PostgreSQL's
superuser role for production requests. School database credentials are stored
in the access-restricted control database; protect backups and rotate credentials
through an operational maintenance window.

Set `DATABASE_URL` to the new school, then run `bun run db:migrate`. Set
`SCHOOL_SLUG`, `SCHOOL_NAME`, and optionally `SCHOOL_TIMEZONE`, then run
`bun run school:register`. School slugs are unique and registration does not
replace an existing school. Provision the first administrator through your
identity onboarding process; the development seed is not a production onboarding
mechanism. An account-invitation delivery flow is not yet implemented.

For the local Northwind database, `bun run db:init` creates the control database when
missing, migrates both stores and registers the school without resetting data.
It deliberately does not run the destructive demonstration seed.

## Storage limits

Each school has a storage pool, and caps for each class's and module's files
and for each person's own work (answers, hand-ins, messages, uploads not yet
placed). The defaults are 100 GB, 1 GB, 1 GB and 500 MB; a school's plan in
the directory (`school_plans`, set by the operator console) overrides any of
them. An upload that would not fit is refused when it is declared, with
`file.quota_school`, `file.quota_class`, `file.quota_module` or
`file.quota_person`; past 80% the upload's answer carries a warning. A
student's work on an assignment still open to them is never refused, only
counted. Bytes shared by copies and previous versions count once.

With `DIRECTORY_SYNC_URL` (the `directory_sync` login) set, each worker-capable
replica reports every school's storage to the directory every
`USAGE_REPORT_MS` (default five minutes), for the operator console.

## Operator console

`apps/ops` is the platform operators' console: every school with its storage
against its pool, each school's plan (pool, class, module and person caps, and
which modules it may use) and the directory's change log. It runs on its own
host (`ops.<product domain>`), is its own deployable, and is the only process
holding the `directory_admin` login. Run it with `bun run --cwd apps/ops dev`
(port 3004).

Operators sign in through the company's OpenID Connect provider; nobody has a
password in the console and operators are never school accounts. Settings:

- `OPS_DIRECTORY_URL`: the directory as `directory_admin`.
- `OPS_ORIGIN`: where operators reach the console; register
  `<OPS_ORIGIN>/auth/callback` as the client's redirect URI.
- `OPS_OIDC_ISSUER`, `OPS_OIDC_CLIENT_ID`, `OPS_OIDC_CLIENT_SECRET`: the
  provider and the console's client there.
- `OPS_OIDC_GROUP`: only accounts whose `OPS_OIDC_GROUP_CLAIM` (default
  `groups`) names this group may sign in.
- `OPS_SESSION_SECRET`: 32 random bytes, base64, sealing the session cookie
  (eight hours).

The change log names an operator by a digest of the provider's issuer and
subject, never by name. Every plan change requires a reason and lands in the
log in the same transaction. Cells read plans with the directory's 60-second
cache.

## Private files

Uploads are private objects owned by the API. A client first declares a file
(purpose, name, media type, size) and receives a server-generated destination;
the bytes then stream to `PUT /v1/files/{id}/content` with the same bearer
token, and the API verifies the size, records the SHA-256 and only then marks
the file ready. Opening a file asks `GET /v1/files/{id}/content`, which
re-checks the record the file belongs to, records the opening where that is
watched, and answers with a redirect to a sealed link on the files host. The
web forwards both routes at `/files/{id}` with the session cookie, so a browser
never holds a token or a storage location.

The files host listens inside the API process on `FILES_PORT` (default
`API_PORT` + 2) and is reached at `FILES_ORIGIN` (default
`http://127.0.0.1:<FILES_PORT>`); in production give it its own registrable
domain, so nothing it serves shares cookies or an origin with the application.
It reads no cookies and no database: a link is the file's storage key, name,
type, size and disposition, encrypted and signed with a key derived from
`CELL_SECRET`, and expires after five minutes, or an hour for sound and video
so a player can keep seeking. It answers ranges, allows any origin to read
(captions and viewers fetch across origins), and serves everything except PDFs
under a sandbox policy. Rotating `CELL_SECRET` invalidates every link issued.

`FILE_STORAGE` chooses where the bytes live. With `disk` (the default),
`FILE_STORAGE_DIR` (default `.data/files`, relative to the API's working
directory) holds private objects under `t/<school id>/...` and published media
under `public-media/`; give the API a dedicated volume. With `s3`, private
objects go to `FILE_BUCKET` and published media to `PUBLIC_MEDIA_BUCKET` on any
S3-compatible service (AWS S3, Cloudflare R2, MinIO, SeaweedFS), reached through
`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. Large
uploads go up in parts, and a move is a copy then a delete, since S3 has no
rename. Keep both buckets private: downloads always pass through the API. Back
the store up alongside the school databases; a file record without its object
is unreadable, and an object without its record is unreachable. `MAX_UPLOAD_BYTES` (default 25 MiB) bounds every upload and sizes
the server's request body limit. Only the extensions and media types listed in
`packages/domain/src/file.ts` are accepted; executables and SVG stay out.

A file over 8 MiB leaves the browser in parts of that size, each its own
request, and the API joins them once the last has arrived; the browser sends
a part the network dropped again after a wait, so a poor line costs one part
and not the upload. A proxy in front of the web app therefore has to pass
bodies of 8 MiB, not of `MAX_UPLOAD_BYTES`. Parts wait under
`t/<tenant>/u/<file>/` and go when the upload is joined, refused, or given up
for a day.

A video placed in a document (a lesson's recording, a student's answer on
video) may weigh up to 200 MiB whatever `MAX_UPLOAD_BYTES` says, since it
travels in parts; every other file keeps to `MAX_UPLOAD_BYTES`. clamd's
`StreamMaxLength` has to allow 200 MiB for such videos to be scanned.

A recording whose maker cut its ends off in the studio is cut by the media
service before its streams are made. The cut, an H.264 MP4, takes the
upload's place in the store, so what was cut away is kept nowhere, and until
the cut is made only its maker can open the recording. A school without a
media service is not offered the cut.

Every upload is checked before it becomes ready. Binary formats must open with
their signature and text formats must be UTF-8 without NUL bytes (captions must
also carry the WebVTT header), so a renamed executable or script is refused with
`file.content_mismatch`. Set `CLAMD_ADDRESS=host:port` to stream each upload
through a ClamAV daemon as well: a match is refused with `file.infected` and its
signature logged with the request id, and an unreachable daemon refuses the
upload with `file.scan_unavailable` (HTTP 503) rather than letting unscanned
files through. clamd's `StreamMaxLength` must be at least `MAX_UPLOAD_BYTES`.
Files stored before a scanner was configured have no `scanned_at` and are not
rescanned automatically. Refused uploads keep their record with a
`rejection_reason` and lose their bytes at once.

Each API replica that can log in as the worker (`CELL_WORKER_URL`) runs a sweep
every `FILE_SWEEP_MS` (default one hour) over every active school. An upload still `initiated` after 24 hours is rejected as
`abandoned` and its bytes removed. A ready file that no record and no stored
document has referred to for 7 days after completion is deleted, record first
and bytes second, and rejected records are deleted after 30 days. References
are discovered from the database catalogue: every foreign key to
`private_files` and every json column, so page and lesson documents keep their
media without being registered anywhere. Retention therefore follows the
record: a file lives as long as the message, submission, lesson, page or draft
that holds it, and leaves 7 days after the last one lets go of it. The windows
live in `packages/domain/src/file.ts`.

## Video streams

`apps/media` is the media service, in Rust: it turns uploaded video into
adaptive HLS (every size from 360p up to the source's own, one audio
rendition, a poster and a thumbnail track) and serves the streams behind
sealed links. The API keeps every job's state on the file row and decides
who may watch; the service holds no database login. It asks the API for
work with a token derived from `CELL_SECRET`, reads uploads from the same
file store, and writes streams beside them under `t/<school>/v/<file>/`.

Build it with `cargo build --release` in `apps/media`; it needs `ffmpeg` and
`ffprobe` on its path. Give it the API's `CELL_SECRET` and storage variables
(`FILE_STORAGE`, `FILE_STORAGE_DIR` or `FILE_BUCKET` and the `S3_*` set),
`MEDIA_API_URL` (the API as the service reaches it), `MEDIA_PORT` (default
3104), `MEDIA_JOBS` (encodes at once, default 1, each using several cores)
and, on a machine with an NVIDIA card, `MEDIA_ENCODER=h264_nvenc`. Serve it on
the user-content domain, never the application's, and set `MEDIA_ORIGIN` on
the API to its origin as browsers reach it. With `MEDIA_ORIGIN` unset, video
plays as uploaded; set, each new video is queued as its upload becomes ready,
plays as uploaded until its streams are made, then streams. An encode that
stops reporting loses its lease after ten minutes and is taken again; a video
is tried three times before it is left playing as uploaded.

The service also drafts captions from speech, for a teacher to correct in
the captions editor, when it has a speech model. Build `whisper-cli` from
whisper.cpp (`cmake -B build && cmake --build build --target whisper-cli`)
and download a multilingual ggml model with the script in its `models/`
folder. Give the service `MEDIA_WHISPER_MODEL` (the model file),
`MEDIA_WHISPER` (the binary, default `whisper-cli` on its path) and
`MEDIA_WHISPER_THREADS` (default 4), and set `MEDIA_CAPTIONS=on` on the API;
unset, editors offer no drafts. `ggml-base` is fine for English trials;
Arabic needs `ggml-small` or larger to be worth correcting. Encodes come
first: a worker drafts captions only when no video is waiting, a draft that
stops reporting is taken again after ten minutes, and one is tried twice.

## Coding studio

Coding questions open the block-coding studio: the Scratch editor with a
small page of ours (`apps/api/studio`) that lets the lesson around it keep
the project. The files host serves it at `/studio/`, beside the page
students' web pages play in, so it has no server, domain or setting of its
own. `PLAY_URL` on the web, the files host as browsers reach it, is what
turns it on; unset, editors offer no coding questions and a coding question
already in a lesson says the studio is not set up.

Install fetches the editor (`@scratch/scratch-gui`, pinned by version and
checksum) and mirrors its library of sprites, backdrops and sounds, about
1,350 files and 60 MB, into `apps/api/vendor/scratch`
(`apps/api/scripts/scratch.ts`); the API image carries both, and
`SCRATCH_DIR` names another place for them. The editor's bundle was built to
sit at the root of its host, so the files host also answers `/chunks/` and
`/static/` with the editor's files.

The studio runs whatever project it is handed, a classmate's included, which
is why it lives on the files host: on another site from the school's, with no
cookies, where it can never run as the application. The lesson frames it
sandboxed, keeping the files host's origin for the storage and workers the
editor needs, and takes messages only from that frame at that origin. The
files host sends it with a Content-Security-Policy that lets it reach only
the files host, so nothing a child does goes to Scratch's servers, and it
refuses any script asked for as a service worker, so nothing that runs there
can sit over the files it serves. That policy also blocks the Text to Speech
and Translate extensions, which call Scratch's services, and the tutorials,
which stream from Wistia; a proxy or CDN in front of the files host must keep
the `content-security-policy` header on `/studio/`. Farida keeps every
project: the studio loads and saves `.sb3` files through the page around it
over `postMessage` and talks to no project server. In development the files
host must be another site from the web, such as `http://localhost:3103`
beside `http://127.0.0.1:3100`, since ports alone do not separate cookies.

The studio's Source link names where the source of the running copy is
published, as the licence asks of whoever runs a changed copy for other
people: set `SOURCE_URL` on the API.

## micro:bit editor

A project question can be a micro:bit project, built in the board's own
editor: Microsoft MakeCode, self-hosted. The files host serves it at
`/makecode/`, beside the coding studio and under the same rule: another
site from the school's, no cookies, a Content-Security-Policy that lets it
reach nothing but the files host, and no service worker. `PLAY_URL` on the
web turns it on with the rest of the files host.

Install lays the editor out in `apps/api/vendor/makecode`
(`apps/api/scripts/makecode.ts`), about 160 files and 35 MB, from two npm
packages pinned by version and checksum: `pxt-core` and `pxt-microbit`.
Both carry the editor already built, so nothing is compiled. The API image
carries the result, and `MAKECODE_DIR` names another place for it. The
script also fetches the editor's Arabic, once, from MakeCode's translation
service; that is the only time anything of Microsoft's is asked for
anything. A running editor asks nobody: live translations, extensions from
GitHub, sharing, sign-in, the reading aid and usage reporting are all
taken out or switched off, and the page it loads from is ours.

The names and logos of Microsoft and of the Micro:bit Educational
Foundation are taken out too, as their trademark rules ask of a copy
neither of them runs. What is left says "micro:bit", which is what the
board is called, and `/makecode/LICENSE.txt` carries both packages' MIT
notices and says whose the names are. A proxy or CDN in front of the files
host must keep the `content-security-policy` header on `/makecode/`.

Farida keeps every project. The editor is told the page around it is its
host: it asks that page for the project, tells it of every change, and
hands over a compiled program instead of downloading it, which the page
then saves as a `.hex` file to copy onto the board. A project is kept as
its few text files, in `core.lesson_projects` like any other project. The
simulator runs a student's program on the files host, as the coding studio
runs a Scratch project. Not there: programs that need an extension written
in C++, which only Microsoft's compile service builds; flashing a board
over USB from the browser; and MakeCode Arcade, whose simulator is not
published for others to host.

## Blocks puzzles

Puzzle questions use the Blockly block editor, bundled with the web and
fetched by a page only when a puzzle on it is first opened. Blockly asks for
its own pictures and cursors by address rather than importing them, and left
alone would fetch them from its makers; the web serves them itself under
`/blockly/media/` from the installed package and copies them into every
build, so a proxy or CDN in front of the web needs no rule for them. A
program of blocks is never run as code: it is read back as a list of steps
and carried out by an interpreter of our own, in the browser and again at
the API to mark it. Blockly names `jsdom` as a peer, which the install adds;
nothing here loads it, since the editor only ever runs in a browser.

## Running code in lessons

Code blocks a teacher marks to run, in Python or JavaScript, run in the
student's browser: in a worker inside a frame sandboxed to an opaque origin,
so a program reaches none of the school's cookies, storage or pages, and is
stopped after ten seconds or too much output. Python is Pyodide, served by
the web itself under `/pyodide/{version}/` from the installed package and
copied into every build. Those files are sent to any origin with a year's
cache, since the sandboxed frame has no origin of its own; a proxy or CDN in
front of the web must keep the `access-control-allow-origin: *` header on
that path, or Python never loads.

Web pages a lesson lets students run (an HTML code block set to run, or
the files of a web project) play on the files host's own domain: it serves
the page they play in at `/play`, which holds each page in a frame
sandboxed to an opaque origin with a policy that lets it reach no network.
Each page gets a frame of its own, so drawing a page again adds nothing to
the tab's history. Safari tells a page with no origin nothing of its own
errors; the play page finds that out when it loads, and the lesson then has
such pages note their errors themselves, so a student on an iPad still sees
the line. Set `PLAY_URL` on the web to the files host's origin as browsers
reach it, the same as `FILES_ORIGIN` on the API; unset, such pages show as
code and web projects are not offered. In development that must be another
site from the web, such as `http://localhost:3103` beside
`http://127.0.0.1:3100`.

A page may load p5.js, the drawing library, by asking for `p5.js`: the
lesson gives it the copy the files host serves at `/play/lib/p5.min.js`,
since a played page reaches no other server. Install fetches that file as
published (`apps/api/scripts/p5.ts`, pinned by version and checksum) into
`apps/api/vendor/p5`, and the image copies it beside the API. p5.js is
under the LGPL 2.1; it is served unchanged, with its licence at
`/play/lib/p5.LICENSE.txt`. The play page's policy names the files host as
well as `'self'`, because Safari takes `'self'` to match nothing for a page
with no origin.

Code exercises are marked on the API, which runs each student's program in
CPython compiled for WASI inside a worker thread: the program sees only an
in-memory copy of the standard library and itself, with no host file,
socket or process, at most 256 MiB, and five seconds a test. Install
fetches that Python (`apps/api/scripts/python-wasi.ts`, pinned by version
and checksum) into `apps/api/vendor/python`, and the image copies it beside
the API; `PYTHON_DIR` points elsewhere. Without it the API starts, and
checking a Python exercise says it cannot be marked here. JavaScript
exercises run in QuickJS, compiled to WebAssembly and bundled with the API,
with nothing of the host but what a test gives and prints.

## Public site

Each school's marketing site is served at `/site/{slug}` by the same web and API
processes; no extra service is needed. Administrators switch it on from the
Website section, and until then the address answers not found. To land visitors
on a school's site from the root of its own hostname, set `public_domain` on the
school's row in the control database to that hostname (without a port) and point
the DNS at the web process; the root then redirects to `/site/{slug}`. Site
media (logos, covers, page images) uses the same private file store as every
other upload and is streamed publicly through `/v1/sites/{slug}/files/{id}/content`
only while published content or the logo references the file, with a five-minute
public cache header.

## Notifications

`EMAIL_PROVIDER_URL` and `SMS_PROVIDER_URL` name HTTP endpoints that accept a
JSON body `{ to, subject, text }` with an optional bearer token from
`EMAIL_PROVIDER_TOKEN` and `SMS_PROVIDER_TOKEN`; a gateway or a small relay in
front of the vendor keeps vendor SDKs out of the API. Leave both unset to keep
outbound channels off: deliveries are then recorded as skipped with
`provider_not_configured`, visible in the administrator's notification log.
`memory:` is a test provider that records sends in process and fails on
demand; the end-to-end suite uses it and never delivers anything.
`NOTIFICATION_POLL_MS` (default 15000) is the worker's polling interval and
`NOTIFICATION_RETRY_BASE_MS` (default 60000) the first retry delay, which
grows by 5, 30, 120 and 720 times on later attempts. The
worker runs inside every API replica and claims rows with `FOR UPDATE SKIP
LOCKED`, so replicas share the queue without double sending. Failed
deliveries retry with a growing delay and stop after five attempts; a provider
answering 4xx other than 429 is treated as permanent.

## Capacity and maintenance

`MAX_TENANT_POOLS` defaults to 32 and `TENANT_POOL_SIZE` to 4. Budget approximately
`replicas × (MAX_TENANT_POOLS × TENANT_POOL_SIZE + 4)` connections, plus migration,
monitoring and maintenance connections. These are configurable resource limits,
not measured throughput guarantees. Use PostgreSQL connection pooling where the
fleet outgrows the cluster budget. Monitor 503 responses, connection utilisation,
query latency and response duration before increasing limits.

The current student directory uses offset pagination with a stable tie-breaker.
Deep pages and contains-search require query-plan measurement for very large
schools. Student, staff and class directories are bounded at the API.
Overview aggregation queries still need representative dataset measurements. Do not advertise a
concurrency or tenant-capacity guarantee based on the browser test suite.

Schedule removal of expired sessions and expired login-attempt buckets from the
control database. Back up the control store and every school independently.
Record migration state per database, test restores, and apply schema updates in
bounded batches. A fleet migration coordinator and automated school provisioning
are not yet included.

`/health/ready` checks the control database; individual school availability is
observed on its API requests. Logs include request ID, operation path, status and
duration, without request bodies or tokens. Route internal failure diagnostics to
your observability system using the same request ID.

## Tests

`bun run test:e2e` creates randomly named `northwind_test_*` databases. The prefix is
historical development infrastructure, not platform branding. These isolated
databases remain available after a run for diagnosis. Remove only the test
databases you no longer need using your database administration tooling. Tests
must never use the development school's reset command.
