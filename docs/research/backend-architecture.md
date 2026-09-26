# Backend architecture research

Primary sources (1EdTech/IMS and Ed-Fi specifications, Postgres, AWS, Azure,
IETF RFCs, OWASP, NIST, vendor documentation), read on 2026-09-26. Unverified
items are listed at the end. Decisions taken from this are in
[decisions.md](decisions.md).

Three findings drive the recommendations:

- Postgres point-in-time recovery restores a whole cluster, so database per
  school does not buy per-school restore, while it multiplies pools,
  autovacuum launches, migrations, replication slots and worker polling by the
  number of schools.
- The current model conflicts with OneRoster 1.2 and Ed-Fi in four places: one
  role per user, flat terms under a year, one integer grade per student,
  subject and term, one attendance row per student per day.
- The relationship tables already are relationship-based access control; a
  Zanzibar-style service would add dual writes without benefit.

## 1. Education standards

- **OneRoster 1.2** (https://www.imsglobal.org/spec/oneroster/v1p2/rostering/info):
  base fields `sourcedId`, `status` (`active`, `tobedeleted`),
  `dateLastModified`, `metadata`. Orgs (type, parent); academicSessions
  (schoolYear, semester, term, gradingPeriod; parent; exclusive end date);
  courses; classes (homeroom or scheduled; course; terms); users with
  `roles[]` per org (primary/secondary, begin/end), two-way guardian
  `agents`, `enabledUser` separate from status; enrollments (role, primary,
  begin, end); demographics as a privileged resource. Gradebook
  (https://www.imsglobal.org/spec/oneroster/v1p2/gradebook/info): weighted
  categories, line items with grading period, score scale and learning
  objectives, results with score status and late/missing/incomplete flags,
  score scales, assessment line items and results. REST binding: limit/offset
  paging, filter grammar, `X-Total-Count`, delta sync by `dateLastModified`,
  OAuth2 client credentials. sourcedIds are never internal keys and never
  reused; 1.2 added `roles[]` because "a teacher in one school may be a parent
  in another".
- **Ed-Fi DS 6.1**: Course → CourseOffering → Section, where a section is where
  attendance is taken and content delivered (our class-subject is a section,
  our class a homeroom); attendance as school and section events with category
  descriptors plus "section attendance taken"; grades keyed by student-section
  and grading period; Contact with legal guardian, lives with, emergency,
  priority, restrictions; code values as namespaced descriptors.
- **LTI 1.3 and Advantage** (core, AGS, NRPS, Deep Linking, Dynamic
  Registration): registrations, deployments, resource links (new id when
  copied), line-item mappings, last score timestamp; the context is the
  scheduled class; guardians' mentor scope comes from relationships; NRPS
  differences need enrolment tombstones.
- **Caliper 1.2 / xAPI 2.0**: export formats over our own append-only activity
  log. **CASE 1.1**: store standards' item UUIDs and URIs on learning
  objectives. **QTI 3.0**: QTI-shaped JSON internally, XML for exchange.
- Mappings: Canvas SIS CSV with immutable `sis_source_id`; Moodle's OneRoster
  plugin alpha and 1.1-only; PowerSchool year and scheduling terms with
  sections per course per year; Clever `sis_id` unique per district; Google
  Classroom duplicates grades when line-item ids change.

## 2. Multi-tenancy

- AWS silo, pool and bridge models; silo per tenant hurts operations around
  1000 tenants
  (https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html).
  Azure deployment stamps per region and a tenant id on every row so tenants
  can move (https://learn.microsoft.com/en-us/azure/architecture/patterns/deployment-stamp).
- Database per school: connections reach one database; PgBouncer pools per
  user and database; Bun SQL pools per instance (10 by default); autovacuum
  launches every `naptime/N` (about 60 ms at 1000 databases); one replication
  slot per database; pgBackRest single-database restore still replays the
  cluster's WAL; Azure Flexible Server cannot restore one database.
- Row-Level Security traps: owners bypass policies without `FORCE`, as does
  `BYPASSRLS`; foreign-key and unique checks ignore policies (use composite
  keys with `tenant_id`); views need `security_invoker`; wrap `current_setting`
  in `(select …)`; set the tenant per transaction with `set_config(…, true)`;
  Drizzle declares policies in the schema.
- Pooling: PgBouncer 1.24+ handles prepared statements, 1.26 adds idle pool
  timeout; PgCat looks dormant; PgDog shards by tenant column; Citus row
  sharding if a cell outgrows a node.
- Noisy neighbours: statement, transaction and lock timeouts per role.
- Postgres 18: `uuidv7()`, `WITHOUT OVERLAPS` and `PERIOD` foreign keys
  (replacing application overlap checks), OAuth, virtual generated columns.
- Regions: AWS UAE and Bahrain; Azure UAE North and Qatar Central; GCP Doha
  and Dammam; Oracle Riyadh, Jeddah, Abu Dhabi, Dubai; no Egypt region.

## 3. API

oRPC serves one contract as RPC and as OpenAPI with Valibot through Standard
Schema; v2 is beta (stay on 1.x); tRPC's OpenAPI adapter is archived; GraphQL
needs per-node authorisation and cost limits while OneRoster and LTI stay REST.
Keyset pagination for our API, offset for OneRoster. Idempotency keys with
Stripe's semantics (the IETF draft expired); keep the domain rule that a retry
with the same revision returns the same attempt. `If-Match` with 412, 428 when
missing. RFC 9457 errors, rate-limit headers draft, Standard Webhooks.

## 4. Authentication and authorisation

Keep opaque hashed session tokens (the Lucia pattern) with the web server as
backend-for-frontend; add a `__Host-` cookie and an idle timeout. Mobile:
bearer token in Keychain/Keystore, SSO through the system browser with PKCE,
rotating refresh tokens. School SSO: Google keyed on `sub` with `hd`; Entra on
`tid`+`oid`; SAML, SCIM, Clever; never link accounts by email (nOAuth).
Parents: invitation link or email code as onboarding and recovery with a
passkey bound at first sign-in (NIST 800-63B-4 restricts SMS and forbids email
as out-of-band authenticator). Authorisation stays in SQL relationship
functions; one person with many memberships and roles. Audit with OWASP's
logging vocabulary; FERPA §99.32 needs a per-student record of disclosures.

## 5. Background work

pg-boss 12 on Bun, enqueuing inside our transaction (the job row is the
outbox), SKIP LOCKED, dead-letter queues, singleton, throttle, debounce, cron
with time zones; one instance per database. Graphile Worker lacks Bun and
time-zone cron; BullMQ cannot enqueue in a Postgres transaction. Plan for queue
table bloat with partitions. Delivery idempotency: a ledger unique on
notification and channel storing the provider message id.

## 6. Real-time

Yjs updates are commutative and idempotent but `mergeUpdates` does not
garbage-collect; Lexical makes Yjs the source of truth and JSON can be derived
headlessly. Hocuspocus v4 runs on Bun via crossws with 2s/10s debounced
persistence; its Redis extension fans every message to every instance. y/hub
is AGPL and not on Bun. SSE resumes with Last-Event-ID; browsers allow 6
connections per domain without HTTP/2; Bun idles connections after 10s and
`publish` stays in one process. LISTEN/NOTIFY: 8000-byte payloads, a
cluster-wide commit lock (still in 18.6), unusable through transaction pooling.

## 7. Files

Presigned POST with `content-length-range` enforces size (Bun's S3 presign
cannot; R2 lacks POST). MinIO is archived; Garage lacks bucket notifications.
Quarantine prefix then scan (clamd or GuardDuty), serve from a cookieless
domain. sharp strips metadata; rotate by EXIF first. Video via Mux or
Cloudflare Stream with signed playback, or ffmpeg to HLS with signed cookies.

## 8. Search

Postgres `arabic` text search configuration (Snowball strips diacritics and
tatweel, folds hamza); `unaccent` has no Arabic rules; generated columns must
be `STORED` to index in 18. pg_trgm yields no Arabic trigrams with
`LC_CTYPE=C` (check our locale). Meilisearch has the best Arabic normaliser;
external indexes go stale when relationships end, so access predicates stay in
SQL.

## 9. Operations and law

OpenTelemetry auto-instrumentation needs loader hooks Bun lacks, so spans are
manual and redaction happens in the collector; `auto_explain` logs parameters
(student data). PITR with pgBackRest per cell. FERPA, amended COPPA (from 22
April 2026), GDPR and the ICO Children's code; Egypt Law 151/2020 (children and
health data sensitive, PDPC licence, transfer licence); Saudi PDPL (72-hour
breach notice); UAE health data in country; Oman guardian consent; Kuwait
24-hour breach notice.

## Target architecture

- Tenancy: one regional cell per jurisdiction with its own Postgres 18 cluster
  (HA, PITR), bucket, API, worker and collaboration processes; a global
  directory maps school slug or host to cell with no student data; the tenant
  is a school group or standalone school; `tenant_id` leads keys with forced
  RLS; the app runs as a non-owner role; CI fails tenant tables without a
  policy; a cell of one for schools needing their own keys; PgBouncer in
  transaction mode.
- Data model base columns: `id uuidv7`, `tenant_id`, `status`,
  `date_last_modified`, `version`, `metadata`, tombstones instead of deletes.
  Identity: `accounts`, `login_identities`, passkeys, sessions. Organisation and
  calendar: `orgs`, `academic_sessions`, weeks, calendar dates, class periods.
  Classes: `courses`, `classes` (homeroom or scheduled), `class_meetings` with
  `WITHOUT OVERLAPS`. People: `users` (optional account), `user_roles`,
  `external_ids`, `user_relationships`, `enrollments`, `demographics`, an
  encrypted `health` schema. Gradebook: score scales, categories, line items,
  results, period grades. Our features: assignments owning line items,
  submissions, attempts, rubrics, modules and lessons, QTI-shaped items.
  Attendance events and attendance taken; learning objectives; `documents` and
  `files`; LTI tables; descriptors with English and Arabic labels; an
  append-only hash-chained audit log including reads and exports; activity
  events; idempotency keys; delivery ledger.
- API: oRPC contract-first (RPC for our clients, OpenAPI at `/v1`), a OneRoster
  1.2 provider (REST and CSV), an LTI 1.3 platform; keyset cursors,
  Idempotency-Key, version and If-Match, RFC 9457, 429s, Standard Webhooks.
- Auth: our session core; OIDC for Google and Entra, SAML, Clever; OneRoster
  or SCIM provisioning; parents by invitation and passkey with a hashed email
  code fallback; mobile bearer and rotating refresh; permission checks plus SQL
  relationship functions, RLS for isolation.
- Jobs: pg-boss per cell, enqueued in the same transaction, a separate worker
  deployment, school-time-zone schedules, retention and erasure jobs.
- Real-time: Hocuspocus on Bun persisting to `documents` and authorising through
  the same functions, routed by document id; SSE with replay for the inbox
  fanned out through Valkey; presence through Yjs awareness.
- Files: one bucket per cell; presigned POST to quarantine, scan job,
  derivatives, promotion; short-lived signed URLs on a cookieless domain; video
  through a managed provider where residency allows, otherwise ffmpeg to HLS.
- Search: Postgres full text (Arabic, English, normalised simple) plus pg_trgm
  on names, access predicates in the same SQL.

## Keep, replace, rebuild

- Keep: oRPC and Valibot contracts (add OpenAPI), the explicit request context,
  hashed opaque sessions and the web backend-for-frontend, revision checks,
  relationship visibility with NOT_FOUND, immutable attempts, outbox semantics,
  the Yjs documents plan, signature checks and ClamAV, published snapshots for
  the public site.
- Replace: database per school with cells and RLS; single `users.role` and
  required email/password with accounts, users and user roles; school years and
  terms with academic sessions; classes and class subjects with homeroom and
  scheduled classes plus courses; homeroom and subject teacher ids with teacher
  enrolments; integer grades with the gradebook; one attendance row per day
  with attendance events; enums with descriptor tables; UUIDv4 with UUIDv7;
  local disk with S3; the in-process worker with pg-boss; ILIKE with full text
  and trigram indexes.
- Rebuild: gradebook, attendance, identity and SSO, OneRoster and LTI, read
  logging, the file pipeline.
- Order: change the schema while each school still has its own database
  (expand and contract, since real schools hold data); build one per-school
  export and import tool, later reused for restoring a school, moving it
  between cells and offboarding; move schools into the cell one at a time
  (freeze, copy, flip the directory, verify, keep the old database read-only);
  then jobs, files, search, and finally OneRoster and LTI.

## Not verified

RFC 10017's date; Egypt's executive regulations date; UAE executive
regulations status; Saudi Ministry of Education rules; whether the AWS
presigned-POST library runs on Bun; whether Better Auth hashes session tokens;
how PowerSchool and Canvas implement OneRoster; certification claims; the xAPI
2.0 text.
