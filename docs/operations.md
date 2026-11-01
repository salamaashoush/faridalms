# Operations

## Deployment

A cell runs on one server from
[deploy/single-server](../deploy/single-server/README.md): its runbook covers
the first deploy, upgrades, rollback, logs, backups and, in `restore.md`, a
restore, and `smoke.sh` runs the whole stack on a workstation. CI publishes
every Docker target for linux/amd64 and linux/arm64 to
`ghcr.io/salamaashoush/faridalms-<target>`, tagged with the commit and
`main`, after main passes. The targets:

- `migrate`, a one-shot job that provisions the cluster roles, creates the
  cell and directory databases if they are missing and applies pending
  migrations. It carries no seed and nothing that drops data. It runs before
  the API on every deploy.
- `api` (port 3001, files host on 3003), `web` (3000), `collab` (3002),
  `ops` (3004), `media` (3104), and `provisioner`, the `api` image with the
  provisioner's settings.
- `edge`, Caddy with the Cloudflare DNS module and the deployment's
  Caddyfile, and `backup`, the nightly dump and bucket copy.

The single-server stack runs Postgres 18 beside them. A cell spread over
several machines takes the same services and settings with Postgres
elsewhere. Each service connects as its own login role, named in
its URL: `CELL_APP_URL` (`app`), `CELL_SITE_URL` (`site`), `CELL_WORKER_URL`
(`worker`), `CELL_RETENTION_URL` (`retention`), `CELL_COLLAB_URL` (`collab`),
`DIRECTORY_URL` (`directory_reader`), for the console only
`OPS_DIRECTORY_URL` (`directory_admin`), and for the provisioner only
`CELL_PROVISION_URL` (`provisioner`). `CELL_KEK` and `CELL_SECRET` are 32
random bytes each in base64; `CELL_SECRET` is shared by the API and collab.
Every service validates its environment at startup and exits on anything
missing; a variable set to the empty string, as compose passes an unset
`${NAME:-}`, counts as unset. Without `CELL_WORKER_URL` uploads are never settled and no
notification is delivered, so the compose file requires it.

The edge (see "School addresses") terminates TLS. It must pass the `Host`
header through unchanged, set `X-Forwarded-Proto` and append the client's
address to `X-Forwarded-For`, replacing whatever a client sent there when
nothing it trusts stands in front of it. The web routes by `Host` alone and
never reads `X-Forwarded-Host`. `TRUSTED_PROXY_HOPS` (default 1) is
how many proxies append to that header; the client is the entry the outermost
one added, and anything to its left is ignored, because a client can send
whatever it likes there. Sign-in and enquiry limits are keyed on it.

The web sends `frame-ancestors 'self'`, `nosniff`, a referrer policy and, over
HTTPS, HSTS without `includeSubDomains`. The console sends
`frame-ancestors 'none'`.

`FILE_STORAGE=disk` keeps uploads in a volume, which must be backed up with
the database. `FILE_STORAGE=s3` with `FILE_BUCKET` and `PUBLIC_MEDIA_BUCKET`
is the production choice, and the single-server stack's.

The API drains HTTP requests on termination, then its workers, then its
pools.

`bun run smoke:containers` builds the images, runs them against the databases
in `.env`, checks `/health/live`, `/health/ready`, a real sign-in, the web
health route and a server-rendered page in both languages, then stops each
container and expects a clean exit within the grace period.

## School addresses

Every school answers on two platform names, set by two variables that the
API, the web and the console all receive:

- `PORTAL_DOMAIN` (`example.com`, say): `<slug>.<PORTAL_DOMAIN>` is
  the school's portal, where people sign in and work. The bare domain asks
  for the school's code, prefilled from the one the browser chose last.
- `SITES_DOMAIN` (`example.net`, say): `<slug>.<SITES_DOMAIN>` is
  the school's public website, served from its root. It reads no session,
  sets no cookie and answers 404 to anything that is not a page of the
  website, including sign-in, which its links send to the portal.

Locally they are `localhost` and `site.localhost`, so `northwind.localhost:3000`
is a portal and `northwind.site.localhost:3000` a website; browsers resolve
every `*.localhost` name to the loopback address. A host that is neither, nor
a school's own active host, answers 404. An address rather than a name (a
health check, the smoke test) is treated as the bare portal domain.

A school may bind names of its own, for its website or its portal, from the
console's school page or from Website, Addresses, in the school. Each is
pending until the school publishes two records, which both screens show:

- `TXT _farida-challenge.<host>` with the host's challenge, and
- `CNAME <host>` to the platform name of the host's role, or, for an apex
  where a CNAME is not allowed, `A <host>` to `EDGE_IPV4`, the edge's public
  IPv4. Without `EDGE_IPV4` only subdomains can be bound.

The API checks hosts that are due every 30 seconds, as the `directory_sync`
login (`DIRECTORY_SYNC_URL`; without it nothing is bound or checked): a new
host or one someone asked to check at once, every other host hourly. Found
records make a host verified; the API then fetches `https://<host>/api/health`
through the edge, which issues its certificate on that handshake, and a
success makes it active. The first host of a role is the school's main one;
once it is active, links in email, calendar feeds and exports use it and the
platform name answers with a 308 to it. Three rechecks in a row that miss the
records make a host failing, which stops it routing and redirecting, and seven
days later it is removed. Every change of state is in the directory's change
log. Check now on the school's screen runs the check while the person waits;
the console's queues it for the next pass.

The edge is Caddy with a DNS-01 wildcard certificate for each platform domain
and on-demand certificates for everything else, which it asks the API about
first. `GET /edge/ask?domain=<host>` answers 200 only for a school's own host
that is verified or active, from one indexed lookup, and 404 for anything
else, the platform's own names included; it reads no session and is limited
to 20 questions a second. The edge therefore asks it on the internal network
and answers 404 for it on the public API host. The deployment's Caddyfile is
[deploy/single-server/Caddyfile](../deploy/single-server/Caddyfile): the
service names (`ops`, `collab` and `api` under the portal domain, `files`,
`media` and `play` under the sites domain) go to their services, every other
name under either domain and every school's own name to the web.

Caddy passes `Host` through and sets `X-Forwarded-Proto` and
`X-Forwarded-For` by default, ignoring what a client sent unless it came
from a proxy listed in `trusted_proxies`, which the deployment leaves empty.

The cell's own host (`cells.app_host`) must be the bare `PORTAL_DOMAIN`, since
any other name under it would be read as a school's portal. The LTI issuer
stays there for now: a lesson on a school's portal launches a tool from the
portal, but the tool sends the person back to the issuer's `/lti/auth`, where
someone who signed in on their portal has no session, until callbacks hand
off to the school's portal with a one-time code (plan section 2.4).

## Registering a school

An operator creates a school, or a group with its schools, from **New
school** in the operator console. Creating a tenant needs the cell's owner,
which neither the console nor the public API holds, so the console asks the
cell's provisioner:

1. The console validates the form and writes the tenant and its schools to
   the directory as `provisioning`, with ids it chooses and a `tenant.create`
   change naming the operator. An address already in use is refused there.
2. It calls the provisioner with those ids. In one transaction as
   `cell_owner`, the provisioner creates the tenant, adds the first
   administrator to the first school as a person with the built-in
   `system_administrator` role (every capability) and their email, and emails
   them a one-use link to choose a password, valid for seven days. The
   school's address in the link comes from the directory's cell row. If the
   email is not sent, nothing is kept.
3. The console marks the tenant `active` with a `tenant.activate` change.

A failure leaves the directory row `provisioning`, and the school's page
says so. Submitting the same addresses again finishes it with the same ids:
a tenant the cell already holds is not created twice, its administrator
with that email is only sent a new link. On a school's page, **Send the
administrator a new link** replaces an expired link, for the first
administrator or the one whose email is given; someone who has already
chosen a password chooses a new one. Each send is an audit entry in the
cell naming the operator, and an `administrator.invite` change in the
directory.

The provisioner is the API image with two more settings, which only the
`provisioner` service receives:

- `CELL_PROVISION_URL`: the cell as the `provisioner` login, which may
  `SET ROLE cell_owner` and nothing else. `bun run db:create` (and the
  `migrate` job) creates the login and lets it connect to an existing cell.
- `PROVISION_SECRET`: 32 random bytes, base64, shared with the console.
- `PROVISION_PORT` (default 3005) and `PROVISION_HOST` (default
  `127.0.0.1`; the compose file sets `0.0.0.0` inside its private network).

With both of the first two set, the process listens on that port for the
console's calls and nothing else; the public port never routes there. The
compose file publishes no port for it and puts it on an internal network
shared only with `ops`, which gets `PROVISION_URL` (`http://provisioner:3005`)
and the same `PROVISION_SECRET`; the console's preflight refuses to start
without them. Each call carries an HS256 token the console signs for that
call: audience `farida-provision`, the operator's opaque id as subject, a
unique id, and a lifetime of 60 seconds. The provisioner refuses any other
signature, audience or age, and a token id it has already seen. It keeps
those ids in memory, so run one provisioner per cell. Without an email
gateway (Resend or `EMAIL_WEBHOOK_URL`, "Notifications" below) it refuses to create anything, since nobody
could sign in.

Without the console, `apps/api/src/admin.ts` does the same from a shell on
the server, with the provisioner's login and the directory's
(`docker compose run --rm admin create-school --help`): it writes the
directory rows, provisions the tenant in-process exactly as the provisioner
does, and activates it, naming `operator:server-shell` in the change log.
`invite` sends an administrator a new link, and `--print-link` prints the
email instead of sending it. A school is only created on a cell the
directory lists as open; the `migrate` job lists its own cell, once, from
`CELL_ID`, `PORTAL_DOMAIN` and `CELL_JURISDICTION` (`CELL_PROVIDER` and
`CELL_REGION` default to `self-hosted` and `default`), and leaves a row
already there as it is.

Locally, `bun install` generates `PROVISION_SECRET` and `.env.example` sets
`CELL_PROVISION_URL`, so `bun run dev` starts the provisioner on
127.0.0.1:3005; run the console with `PROVISION_URL=http://127.0.0.1:3005`
and the same secret.

Locally, `bun run db:reset` provisions the roles, recreates the cell and
directory, migrates and seeds; it refuses to run with `NODE_ENV=production`.
`bun run db:create` creates what is missing and migrates without touching
data.

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
- Who may sign in, one of two rules: `OPS_OIDC_GROUP`, only accounts whose
  `OPS_OIDC_GROUP_CLAIM` (default `groups`) names this group; or, for a
  provider without groups such as Google, `OPS_OIDC_EMAILS`, a
  comma-separated list of addresses compared without case against the
  `email` claim, which only counts when `email_verified` is true. Exactly
  one is set; the console refuses to start with neither or both.
- `OPS_SESSION_SECRET`: 32 random bytes, base64, sealing the session cookie
  (eight hours).
- `PROVISION_URL` and `PROVISION_SECRET`: the cell's provisioner and the
  secret it shares with the console (see "Registering a school").

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
S3-compatible service (AWS S3, Cloudflare R2, Hetzner, MinIO, SeaweedFS),
reached through `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY`. `S3_ADDRESSING_STYLE` is `path` (the default,
`<endpoint>/<bucket>/<key>`) or `virtual` (`<bucket>.<endpoint host>/<key>`,
the form Hetzner documents); the media service reads the same setting. Large
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

Build it with `cargo build --release` in `apps/media`, or take the `media`
target of the Dockerfile, which carries ffmpeg. It needs `ffmpeg` and
`ffprobe` on its path. Give it the API's `CELL_SECRET` and storage variables
(`FILE_STORAGE`, `FILE_STORAGE_DIR` or `FILE_BUCKET` and the `S3_*` set),
`MEDIA_API_URL` (the API as the service reaches it), `MEDIA_PORT` (default
3104), `MEDIA_JOBS` (encodes at once, default 1, each using several cores)
and, on a machine with an NVIDIA card, `MEDIA_ENCODER=h264_nvenc`. Serve it on
the user-content domain, never the application's, and set `MEDIA_ORIGIN` on
the API to its origin as browsers reach it. With `MEDIA_ORIGIN` unset, video
plays as uploaded; set, each new video is queued as its upload becomes ready,
plays as uploaded until its streams are made, then streams.

A service that encodes proves it can as it starts: it runs `ffprobe`, encodes
a few black pictures with the encoder it was given and, when it drafts
captions, runs `whisper-cli` and looks for its models. One that cannot
refuses to start and says which tool failed, where it would otherwise fail
every video it was handed. An ffmpeg without the `zscale` and `tonemap`
filters starts with a warning: HDR video from a phone then looks washed out.

What an encode does to a video:

- Every size is encoded to a constant quality and never above its rate on
  the ladder (360p 0.8, 540p 1.6, 720p 2.8, 1080p 5 Mbit/s). A teacher
  talking to a camera takes about half the ladder's rate for the same
  measured quality; a busy picture takes all of it.
- More than thirty pictures a second become thirty, and a browser's
  recording, which has no steady rate, is given one.
- An HDR picture (HLG or PQ) is brought down to the colours every screen
  shows.
- The sound is turned up or down to one loudness, -16 LUFS, by no more than
  20 dB; peaks that would clip are held under -1.5 dB. Silence is left alone.
- The poster and the thumbnails are taken from the streams just made.

While a job is worked on the API hears of it every five seconds, whatever
the work is doing, and keeps it leased to that worker for ten minutes from
the last time it heard. A job ends one of four ways:

- done, and the streams play;
- failed, because the file could not be got through: tried three times
  (captions twice), then left playing as uploaded;
- handed back unspent, because the service was stopping or its machine was
  at fault (a tool that will not start, a disk or a store that cannot be
  written): the try does not count, and the worker waits before asking for
  more, from five seconds up to a minute while its machine keeps failing;
- dropped, because the API took it away: the video was trashed, or its
  lease ran out and another worker has it.

On `SIGTERM` the service stops asking for work, hands back what it was
doing, and exits within ten seconds; give its container at least that long.
A worker with nothing to do asks less often, down to once in thirty
seconds, since each ask costs the API a look at every school of the cell;
the first video after a quiet spell therefore starts within thirty seconds.
Schools take turns: a school that queues a hundred videos does not keep the
others waiting.

A video's link is the same for everyone who asks within a window of four
hours and opens until the end of the next window, so for four to eight
hours. A browser keeps what it fetched for as long as that link opens
(`Cache-Control: private, max-age=<seconds left>, immutable`), and finds it
again when a student comes back to the lesson. To let a CDN in front of the
service share segments between students, have it cache by the whole path
and treat an answer as shareable for the `max-age` it carries: the link is
all that authorises a request, and no cookie is read.

Set `MEDIA_METRICS_PORT` to serve counts in Prometheus's text format at
`/metrics` on a listener of their own (`MEDIA_METRICS_HOST`, default
`127.0.0.1`), never on the address browsers reach: jobs by kind and by how
they ended, seconds spent on them, jobs running, bytes written to the
store, and answers and bytes sent to players.

What a video's streams weigh is kept on its file row
(`derivatives.hls.size`). It is not counted against a school's storage:
whether streams count is a decision still to be made.

The service also drafts captions from speech, for a teacher to correct in
the captions editor, when it has a speech model. Build `whisper-cli` from
whisper.cpp (`cmake -B build && cmake --build build --target whisper-cli`)
and download a multilingual ggml model with the script in its `models/`
folder. Give the service `MEDIA_WHISPER_MODEL` (the model file),
`MEDIA_WHISPER` (the binary, default `whisper-cli` on its path) and
`MEDIA_WHISPER_THREADS` (default 4), and set `MEDIA_CAPTIONS=on` on the API;
unset, editors offer no drafts. Drafts are offered in the twelve languages
the captions editor lists (Arabic, Chinese, English, French, German, Hindi,
Italian, Portuguese, Russian, Spanish, Turkish, Urdu), so the model must be
a multilingual one. `ggml-base` is fine for English trials; Arabic needs
`ggml-small` or larger to be worth correcting. Encodes come first: a worker
drafts captions only when no video is waiting.

Give it `MEDIA_WHISPER_VAD_MODEL` as well, the Silero model from
whisper.cpp's `models/download-vad-model.sh`. Without it Whisper hears
words in music and in silence: forty seconds of music before a sentence
came back as a `[MUSIC]` cue and a sentence starting twelve seconds early,
and the silence after it as `[BLANK_AUDIO]` cues. With it only the
sentence came back, timed to the second. Its cost is that two sentences
either side of a long pause can come back as one cue that spans the pause,
which the teacher splits.

## Coding studio

Coding questions open the block-coding studio: the Scratch editor with a
small page of ours that lets the lesson around it keep
the project. The files host serves it at `/studio/`, beside the page
students' web pages play in, so it has no server, domain or setting of its
own. `PLAY_URL` on the web, the files host as browsers reach it, is what
turns it on; unset, editors offer no coding questions and a coding question
already in a lesson says the studio is not set up.

The page is its own package, `@faridalms/studio`
([farida-studio](https://github.com/salamaashoush/farida-studio)), published
under the AGPL with the Scratch editor it runs. Install runs its
`farida-studio` command, which puts the page, the editor
(`@scratch/scratch-gui`, pinned by version and checksum) and the editor's
library of sprites, backdrops and sounds, about 1,350 files and 60 MB, into
`apps/api/vendor/scratch`; the API image carries that directory, and
`SCRATCH_DIR` names another place for it. The editor's bundle was built to
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

The studio's Source link opens the package's `SOURCE.txt`, which names the
release it serves and where its source is, as the AGPL asks. A changed copy
of the studio is a fork of the package, with its own notice.

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

Each school's website is served at `/site/{slug}` by the web and API; no
extra service is needed. Administrators switch it on from the Website
section, and until then the address answers not found. Published images are
served from `/public-media/p/{token}/{name}`. A school's own hostname is not
routed yet: nothing writes `directory.hosts`. Custom and wildcard hosts are
section 2 of [plans/school-front-door.md](plans/school-front-door.md).

## Notifications

Email goes through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set
(the sender's domain verified at Resend). Resend's limit is per team, shared
by every key and process, so the provider paces itself from the
`ratelimit-remaining` and `ratelimit-reset` headers of each answer and waits
out a 429's `retry-after` when it is a few seconds; a longer one (a spent
daily quota) fails the send, and the worker retries it with its backoff.
Each send carries an `Idempotency-Key` derived from the deliveries it
carries and its text, so a retry after a lost answer is not sent twice.
Only a 422, a message Resend cannot accept, gives up at once.

Otherwise `EMAIL_WEBHOOK_URL` and `SMS_WEBHOOK_URL` name HTTP endpoints that accept a
JSON body `{ to, subject, text }`, with the bearer token
`NOTIFY_WEBHOOK_TOKEN`; a small relay in front of the vendor keeps vendor
SDKs out of the API. Use `https` URLs, since the token travels with each
request. Leave both unset to keep outbound channels off: deliveries are then
recorded as skipped, visible in the administrator's notification log.
`memory:` is a test provider that records sends in process; the end-to-end
suite uses it.

The worker runs inside every API replica that has `CELL_WORKER_URL`, polls
every 30 seconds and claims rows with `FOR UPDATE SKIP LOCKED`, so replicas
share the queue without double sending. A failed delivery retries after 1,
5, 30, 120 and 720 minutes and stops after the fifth attempt; a provider
answering 4xx other than 429 is treated as permanent.

## Capacity and maintenance

Each API replica opens, per cell, `CELL_POOL_SIZE` (default 10) connections
as `app`, half that (at least 2) as `site`, 4 as `worker`, 1 as
`retention`, and 4 to the directory. Budget the cluster's connections for
every replica plus collab, the console, migrations and monitoring. These are
resource limits, not measured throughput.

Back up the cell and the directory independently, test restores, and keep
the file buckets in the same backup window. The single-server stack's
`backup` service dumps both every night as the `backup_dump` login (which
reads every table through `pg_read_all_data` and bypasses row security) and
copies the buckets to a bucket at another provider; `restore.md` beside it
restores them.

`/health/ready` checks the cell and the directory. Logs are JSON lines with
request ID, operation path, status and duration, without request bodies or
tokens.

## Tests

`bun run test:e2e` creates a randomly named `cell_e2e_*` cell and
`directory_e2e_*` directory, seeds them, and drops both however the run ends.
Tests must never use the development school's reset command.
