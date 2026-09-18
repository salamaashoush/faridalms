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

## Private files

Uploads are private objects owned by the API. A client first declares a file
(purpose, name, media type, size) and receives a server-generated destination;
the bytes then stream to `PUT /v1/files/{id}/content` with the same bearer
token, and the API verifies the size, records the SHA-256 and only then marks
the file ready. Downloads go through `GET /v1/files/{id}/content`, which
re-checks the assignment or submission the file is linked to before answering,
sets an attachment disposition with a safe name, and never caches. The web
forwards both routes at `/files/{id}` with the session cookie, so a browser
never holds a token or a storage location.

`FILE_STORAGE_DIR` (default `.data/files`, relative to the API's working
directory) holds objects under `<school id>/<file id>`. Give the API a
dedicated volume and back it up alongside the school databases; a file record
without its object is unreadable, and an object without its record is
unreachable. `MAX_UPLOAD_BYTES` (default 25 MiB) bounds every upload and sizes
the server's request body limit. Only the extensions and media types listed in
`packages/domain/src/file.ts` are accepted; executables and SVG stay out.
Uploads that were declared but never completed remain in the `initiated` state
and need a scheduled clean-up, which is not yet included.

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
