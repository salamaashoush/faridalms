# Platform foundation

The shared data layer every Farida LMS system builds on: where a school's data
lives, how a tenant is isolated, the columns and conventions every table
follows, the foundation tables themselves, the contract through which the API
reaches them, the checks that keep the contract honest, and how a school's
legacy database maps onto them.

Status: specification, revision 2, 2026-09-27. Revision 2 resolves the review
of the first draft (standards, security, product and import lenses); section
13 lists the points it does not adopt and why. Decisions it rests on are in
[../research/decisions.md](../research/decisions.md); the migration route is in
[../platform-migration.md](../platform-migration.md); product behaviour is in
[../product-spec.md](../product-spec.md). A decision changes only by a new entry
in `decisions.md`; a choice below changes only with new evidence.

## 1. Scope

**In scope.** Everything two or more product systems share:

- Topology: regional cells, the global directory, hosts and domains, the
  integration host, tenant lifecycle, moving and merging tenants.
- Tenancy and organisation: tenants, orgs (school groups, schools,
  departments), school feature switches.
- Conventions: Postgres schemas, roles, table classes, base columns, naming,
  identifiers, tombstones and erasure, optimistic concurrency, delta reads,
  metadata, time, localisation, vocabularies, keys and temporal constraints.
- Access profiles: row-level security policies, grants, purpose gates and the
  erasure binding, per table.
- Foundation tables:
  - Descriptors and their per-school overrides.
  - Academic sessions, calendars, calendar dates, academic weeks, class
    periods.
  - Locations (rooms and buildings).
  - Files, file publications, file subjects and tenant keys.
  - Users, demographics, external ids, contact points.
  - Student school years, user roles, user relationships and relationship
    restrictions.
  - Accounts, identity providers, login identities, passkeys, sessions,
    devices and sign-in counters.
  - Access roles.
  - The health schema.
  - Documents with their versions, translations, file references and link
    references.
  - Privacy notices, consent records, erasure approvals and legal holds.
  - The audit log with its seals, activity events, idempotency keys.
  - Import runs, user preferences and saved views.
  - The search index and partition maintenance.
- The request and tenant context contract (including integrations, the public
  website and provider callbacks), the CI checks, and the rules for generating
  migrations.
- The mapping from each legacy per-school database into these tables.

**Out of scope**, each in its own system spec, built on this one:

- Teaching: courses, classes (homeroom and scheduled), enrollments, class
  meetings, groups, the timetable (bell schedules, cycle days, clashes).
- Gradebook and coursework: assignments, submissions, attempts, rubrics,
  categories, line items, score scales, results, period grades.
- Attendance: attendance events, attendance taken, registers.
- Communication: threads, messages, announcements, news posts, calendar
  events, notifications, delivery ledger, preferences, the office inbox.
- Learning: modules, lessons, lesson progress, assessment items.
- Website: pages, posts, post categories and revisions, site settings, the
  published tables the `site` role reads.
- Identity flows that sit on the tables here: invitations, one-time codes,
  recovery codes, mobile refresh tokens, shared devices, class sign-in codes,
  calendar feed tokens, session timeouts per profile, the capability
  catalogue and the legacy permission mapping, the flow that completes a
  pending person merge.
- Privacy operations: data requests, retention policies, the erasure
  procedure and its approval screens, the disclosure view shown to parents.
- Standards surfaces: the OneRoster 1.2 provider, the LTI 1.3 platform
  (registrations, deployments, signing keys), SSO protocol handling, SCIM.
- People screens: the in-product import wizard, duplicate matching and the
  merge review, built on the tables here.
- The importer's own tooling and the per-school cut-over runbook (the mapping
  it must implement is here, in section 10).

**Taken as given** (decisions of 2026-09-26, not revisited here):

- Regional cells, with one shared Postgres 18 cluster per cell.
- The tenant is a school group or a standalone school.
- `tenant_id` leads every primary, foreign and unique key.
- RLS is forced, the application role is not the owner and has no
  `BYPASSRLS`, and the tenant is set per transaction with
  `set_config(..., true)`.
- CI fails a tenant table without a policy.
- UUIDv7 ids and the base columns `id`, `tenant_id`, `status`,
  `date_last_modified`, `version`, `metadata`, with tombstones instead of
  deletes.
- OneRoster 1.2 and Ed-Fi alignment, with descriptors carrying English and
  Arabic labels for configurable code values.
- A `documents` table holding Yjs state.
- Real schools move by verified import.

**Additions this spec makes**, each argued where it appears:

- A seventh base column, `created_at` (section 4.4), because imported legacy
  rows keep UUIDv4 ids that carry no time.
- Four table classes (entity, ledger, ephemeral, keyed extension) so
  append-only and short-lived tables do not pretend to have versions and
  tombstones.
- Search lives in a separate `search` schema behind one definer function,
  not as a stored vector on RLS tables (section 6.19).
- Purpose gates on every special category, not only health: demographics and
  custody facts are unreadable without their purpose set (section 5).
- Least-privilege runtime roles for the public website (`site`) and for
  OneRoster and LTI (`integration`), and a stable integration host on the
  product domain so third-party registrations survive cell moves (section
  3.3).
- The student's per-year school placement (grade level, calendar, entry and
  exit) as a foundation table, `student_school_years`, from which the student
  role is derived (section 6.8).
- Deletion of personal data is possible only against a recorded erasure
  approval and never under a legal hold (sections 4.7 and 6.13).

## 2. Sources

Research notes of 2026-09-26, cited inline by key:

- **[R1]** OneRoster 1.2 and Ed-Fi DS 6.1: field-level notes for the cell
  schema. Primary sources: OneRoster rostering and gradebook information
  models, CSV binding 1.2.1 and implementation guide
  (https://www.imsglobal.org/spec/oneroster/v1p2/); Ed-Fi Data Standard
  v6.1.0 (https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-Data-Standard/tree/v6.1.0,
  `Descriptors/*.xml`, `Schemas/Bulk/Ed-Fi-Core.xsd`) and the domain
  best-practice pages at https://docs.ed-fi.org/reference/data-exchange/data-standard/.
  The entry, exit, identification-system, relation and other-name code values
  in section 6.2 were read from the v6.1.0 `Descriptors/*.xml` files.
- **[R2]** Postgres 18 data layer for a regional cell: RLS, keys,
  partitioning, audit, health encryption, backups. Claims marked "probe" were
  run against PostgreSQL 18.6. Primary sources: PostgreSQL 18 documentation
  (ddl-rowsecurity, sql-createpolicy, sql-createtable, ddl-partitioning,
  functions-uuid, textsearch, pgcrypto, continuous-archiving), Drizzle ORM and
  drizzle-kit 1.0.0-rc.4 source, pg-boss 12 source (`src/plans.ts`,
  `insertJobs`, read at 12.35.0 for the grants in section 7.6), PgBouncer
  feature table, RFC 9562, NIST SP 800-38D, OWASP cheat sheets.
- **[R3]** Identity, accounts, relationships and consent. Primary sources:
  NIST SP 800-63B-4 and 800-63A-4 (https://pages.nist.gov/800-63-4/), WebAuthn
  Level 3 (https://www.w3.org/TR/webauthn-3/), OpenID Connect Core, Microsoft
  Entra and Google identity documentation, Clever and Seesaw help centres,
  OneRoster 1.2, Ed-Fi, 34 CFR 99 (FERPA), 16 CFR 312 (COPPA), GDPR, Egypt Law
  151/2020 and Decree 816/2025, Saudi PDPL and its Implementing Regulation, UAE
  Federal Decree-Law 45/2021.
- **[BA]** [../research/backend-architecture.md](../research/backend-architecture.md).
- **The review of the first draft** (2026-09-26): standards, security,
  product and import critiques, several with probes of their own against the
  first draft's DDL. Section 13 lists what this revision does not adopt.
- **[P]** The DDL in sections 4.4 and 6, with the access profiles of section
  5, was applied in document order to PostgreSQL 18.6 initialised with
  `--locale-provider=builtin --builtin-locale=C.UTF-8`, and exercised as each
  runtime role: for the first draft on 2026-09-26, and again for this revision
  on 2026-09-27, when the whole revised DDL applied without error and 82
  behavioural checks passed. Observed:
  - An unset tenant raises, and so does a tenant left at session level by
    `set_config(..., false)` without the transaction binding. `app` sees 0
    rows of another tenant.
  - An insert for another tenant and an update moving a row to another tenant
    both fail with "new row violates row-level security policy". `DELETE` is
    refused with "permission denied".
  - The `PERIOD` foreign keys reject a term outside its year, a calendar date
    outside its year, a week hung off a term, and shrinking a year under its
    calendar. `app.change_year_span` refuses while active rows fall outside and
    on a stale version, then removes the 30 June dates and audits the change.
  - The exclusion constraints reject overlapping sibling terms and a second
    current relationship for the same pair; a term under a semester is
    accepted; a school year whose `school_year` disagrees with its end is
    rejected.
  - Namespace and meaning pinning reject a `sex` descriptor used as a
    `relation`, a meaning that disagrees with its descriptor, a plaintext
    national id and a national id with a plaintext suffix. The relation token
    check rejects a token that disagrees with the meaning, and a teacher role
    at a group org is rejected. Two schools may each own a `math` subject, while
    a second tenant-wide one is refused.
  - `app` cannot change a storage key, an org's type, a tenant's
    jurisdictions or a keyed extension's key, and cannot tombstone a school;
    as `worker`, a storage key or derivative key in another tenant's prefix and
    a health report with a telling name fail their checks. A health report
    cannot be embedded in a document.
  - Health records, health-report files and demographics are invisible and
    unwritable without their purpose; health metadata must stay empty.
  - `retention` changes nothing without an approved erasure, deletes with
    one, is blocked by a legal hold, and cannot touch columns outside its
    grant.
  - Audit rows take their time and actor from the context whatever the
    caller supplies, a row backdated into an earlier month is refused, a
    payload that does not match its digest is refused, rows refuse `UPDATE`
    even for the owner, and the sealer statement seals a batch.
  - `collab` cannot read or checkpoint a frozen message's history; `site` reads
    only public org fields; `integration` reads users but not health,
    documents or demographics without the purpose, and records releases.
  - `cell_io` keeps a supplied version, modification time and creation time;
    `app` cannot.
  - Search finds Arabic and English text on one host, keeps one document's
    text when the other is tombstoned, and honours the school scope; Arabic
    name normalisation folds hamza on alef, alef maqsura and teh marbuta.
  - `app` cannot reach `parts`, `search` or `ops`; the passkey user-handle
    check rejects another tenant's prefix.
  - The CI catalogue check in section 8 returns no rows for this schema. It
    reported each of ten planted defects: a table readable by `app` outside
    the tenant schemas, an `ops` table readable by `worker`, a shared sequence,
    a function owned by another role, a dropped audit trigger, a dropped
    purpose gate, a `retention` policy without an erasure test, a table-wide
    `UPDATE` where only columns are granted, an `UPDATE` grant on a ledger and
    a stray `DELETE`. The first draft's run had already reported a
    single-column key, missing `FORCE`, a permissive public policy, a plain
    view, a global table, default privileges, a non-UUIDv7 id default, a
    missing row trigger, a definer outside the allowlist and a function
    executable by `PUBLIC`.

## 3. Topology

### 3.1 Cells

A cell is one jurisdiction's complete deployment: a Postgres 18 cluster (HA,
PITR with pgBackRest), one private object-storage bucket and one public-media
bucket, and the API, worker and collaboration processes, all in one region
[BA]. Everything a school holds lives in exactly one cell. A school that needs
its own keys or its own restore boundary gets a cell of one, which is the same
software with one tenant.

Postgres PITR restores whole clusters ("this method can only support
restoration of an entire database cluster", PG docs, [R2] section 14), so a
single school is restored by restoring the cell to a side cluster, exporting
that tenant with the import/export tool and re-importing it. A cell is never
rolled back for one school.

Each cell is initialised with `initdb --locale-provider=builtin
--builtin-locale=C.UTF-8`. A `C` database yields no Arabic trigrams, while
builtin `C.UTF-8` does, and ICU collations remain available per column
([R2] section 8; [P] found `ar-x-icu` and `en-x-icu` present). The database
is named `cell`.

### 3.2 Global directory

A small Postgres database named `directory`, outside every cell, that maps a
school, a host, an SSO domain and an integration client to a cell. It holds no
personal data: no user, no email, no phone, no operator name. School names,
slugs and hostnames are public information. Its location is an open question
(section 12).

```postgresql
create table cells (
  id text primary key check (id ~ '^[a-z]{2}-[0-9]{1,2}$'),      -- 'eg-1', 'ae-1'
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  provider text not null check (char_length(provider) between 1 and 40),
  region text not null check (char_length(region) between 1 and 60),
  app_host text not null unique check (app_host = lower(app_host)),
  api_base_url text not null check (char_length(api_base_url) between 1 and 2048),  -- private network
  state text not null default 'provisioning' check (state in ('provisioning', 'open', 'closed', 'draining')),
  created_at timestamptz not null default statement_timestamp()
);

create table tenants (
  id uuid primary key,                                            -- equals core.tenants.tenant_id in the cell
  kind text not null check (kind in ('school_group', 'school')),
  name_en text check (char_length(name_en) between 1 and 160),
  name_ar text check (char_length(name_ar) between 1 and 160),
  cell_id text not null references cells (id),
  jurisdictions text[] not null check (array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
  state text not null default 'provisioning'
    check (state in ('provisioning', 'importing', 'active', 'frozen', 'suspended', 'offboarding', 'offboarded')),
  merged_into_id uuid references tenants (id),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (num_nonnulls(name_en, name_ar) >= 1),
  check (merged_into_id is null or state = 'offboarded')
);

create table schools (
  id uuid primary key,                                            -- equals core.orgs.id of the school
  tenant_id uuid not null references tenants (id),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  name_en text check (char_length(name_en) between 1 and 160),
  name_ar text check (char_length(name_ar) between 1 and 160),
  placement text not null check (placement in ('legacy', 'cell')),
  legacy_school_id uuid unique,                                   -- control.schools.id of the legacy stack
  listed boolean not null default true,                           -- shown by the school finder
  moved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (num_nonnulls(name_en, name_ar) >= 1),
  check (placement = 'cell' or legacy_school_id is not null)
);
create index schools_tenant_idx on schools (tenant_id);

create table hosts (                                              -- a school's own domain, public website only
  hostname text primary key check (hostname = lower(hostname) and char_length(hostname) between 3 and 253),
  school_id uuid not null references schools (id),
  verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp()
);

create table sso_domains (                                        -- identifier-first SSO discovery
  domain text primary key check (domain = lower(domain) and char_length(domain) between 3 and 253),
  tenant_id uuid not null references tenants (id),
  verification_method text not null check (verification_method in ('dns_txt', 'idp_hosted_domain')),
  verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp()
);

create table integration_clients (                                -- OneRoster and LTI clients, routing only
  client_id text primary key check (client_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  tenant_id uuid not null references tenants (id),
  kind text not null check (kind in ('oneroster', 'lti')),
  created_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz
);
create index integration_clients_tenant_idx on integration_clients (tenant_id);

create table changes (                                            -- every change to the rows above
  id uuid primary key default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor text not null check (actor ~ '^(operator|cell):[A-Za-z0-9_-]{1,64}$'),  -- opaque operator id or cell id
  subject_type text not null
    check (subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain', 'integration_client')),
  subject_id text not null,
  action text not null check (char_length(action) between 1 and 60),
  before jsonb,
  after jsonb,
  reason text not null check (char_length(reason) between 1 and 500)
);
```

Three roles use it, each writing a `changes` row in the same transaction as
every change it makes:

- `directory_reader`: SELECT on `cells`, `tenants`, `schools`, `hosts`,
  `sso_domains` and `integration_clients`, for the product-domain hosts and
  every cell's API and web process.
- `directory_admin`: all DML, for the operator tool. Operators are recorded by
  an opaque id; the mapping from id to person lives in the operator identity
  provider, not here.
- `directory_sync`: UPDATE of `name_en`, `name_ar` and `updated_at` on
  `schools`, and INSERT on `changes`, for a cell worker job that copies a
  school's names from `core.orgs` when they change in Settings, so the finder
  never shows a school under its old name.

Readers cache rows for 60 seconds; a cut-over, cell move or merge also pushes
an invalidation.

**Public projection.** The school finder and the mobile app's public read API
return only a school's slug, display names and its cell's `app_host`, for a
listed school or an exact slug match, and for SSO discovery the same fields of
the matching tenant's schools. They never return `tenant_id`, state,
placement, `legacy_school_id` or which schools share a group. A host or SSO
domain without `verified_at` is neither routed nor used for discovery.

`schools.placement` is why routing is per school rather than per tenant: a
school group's legacy schools move one at a time (section 10.1), so for a
while one tenant has schools in the cell and schools still on the legacy
stack.

### 3.3 Domains, hosts and routing

Four registrable domains, because every origin under the passkey relying-party
domain can ask for assertions and every sibling subdomain is "same site" to
the session cookie:

- **The product domain** serves first-party hosts only: the school finder at
  its apex, each cell's application host (`cells.app_host`, for example
  `eg.<product domain>`) and the integration host `connect.<product domain>`.
  It never serves documentation, status or marketing pages, school websites or
  any user content.
- **The sites domain** serves school websites at `<slug>.<sites domain>`, and
  schools' own hosts from `directory.hosts`. Sign-in never happens there.
- **The files domain**, cookieless, serves short-lived signed downloads
  (section 6.5).
- **The public-media domain** serves published images from each cell's
  public-media bucket through a CDN (section 6.5).

Sign-in and sessions:

- Session cookies are host-only and per tenant: `__Host-s-<tenant id as 32 hex
digits>` (HttpOnly, Secure, SameSite=Lax, Path=/). No cookie crosses cells.
  Application URLs carry the school slug as their first path segment, which
  the web backend-for-frontend maps through the directory to a tenant and so
  to a cookie. A browser holds at most five tenant sessions per cell host; the
  account switcher lists them.
- Every mutating request to the backend-for-frontend needs a same-origin
  `Origin` (or `Sec-Fetch-Site: same-origin`) and a CSRF token bound to the
  session; application hosts send `Content-Security-Policy:
frame-ancestors 'none'` and embed no third-party content.
- The product domain's apex serves only the school finder: search by school
  name or slug over the public projection, or identifier-first SSO discovery
  by the email domain against verified `directory.sso_domains` (the domain is
  looked up; the address is not stored or logged). It redirects to the cell's
  host with the school slug.
- The WebAuthn relying party id is the product domain for every cell. A
  passkey created on `eg.<product domain>` is valid on `ae.<product domain>`,
  because an RP id may be a registrable suffix of the origin. That avoids
  Related Origin Requests, where clients need only support "at least five
  registrable origin labels" ([R3] section 2, WebAuthn L3 §5.11). It is also
  why nothing but first-party hosts may live under the product domain.
- Family Home shows every child reachable through the tenant sessions this
  browser holds on the cell host. Children at a school in another cell appear
  as a link to that cell's host, because a web page cannot read another cell's
  cookie. The mobile app holds one session per tenant, across cells, and
  aggregates them.
- The mobile app calls the directory's public read API to find the school,
  then talks to that cell's API directly.

**The integration host.** Third parties store URLs, so no URL a third party
stores contains a cell host or a tenant id:

- `connect.<product domain>` serves the OneRoster base URL
  (`/oneroster/v1p2/`) and its OAuth 2.0 token endpoint, the LTI issuer
  (`https://connect.<product domain>`), the LTI OIDC authorisation, token,
  JWKS, AGS and NRPS endpoints, and provider callbacks (section 7.1).
  OneRoster `GUIDRef.href` values are built from this base.
- It holds no data. A token request is routed by its `client_id` through
  `directory.integration_clients`; every later call carries an access token of
  the form `<tenant uuid>.<secret>` (the session token format, section 6.9),
  routed by its tenant part through `directory.tenants.cell_id`. It forwards
  over the private network to the cell API, which authenticates the client and
  sets the tenant context.
- The LTI front-channel authorisation request is answered with a 302 to the
  cell's application host, where the user's session cookie lives.
- Client ids and the issuer survive cell moves and tenant merges: a move
  changes `directory.tenants.cell_id`, a merge repoints
  `integration_clients.tenant_id`. No school re-registers a tool.
- LTI platform signing keys are asymmetric keys in the cell's KMS whose
  private part never leaves it; the JWKS URL is per client
  (`/lti/clients/<client_id>/jwks`). A move creates new keys in the target
  cell and the JWKS URL serves old and new until the source cell's copy is
  deleted; tools fetch a key id they do not know. The key table belongs to the
  LTI spec.

### 3.4 Tenant lifecycle

The lifecycle lives in the cell in `ops.tenant_registry` (section 4.4),
mirrored by `directory.tenants.state`. States:

- `provisioning`: rows are being created; only `cell_io` and the provisioner
  write.
- `importing`: a legacy school is being loaded into an otherwise empty tenant.
- `active`: normal operation.
- `frozen`: reads only, used for a cell move or tenant merge. The API refuses
  writes of signed-in users with 503 and `Retry-After`.
- `suspended`: no sign-in; data kept.
- `offboarding`: export and deletion in progress. `offboarded` exists only in
  the directory, after the cell rows are gone.

A school joining a live group tenant has its own state on its org,
`orgs.lifecycle = 'importing'`, until its flip (section 10.1). A request for a
tenant the cell does not know, or in a state that allows no sign-in, is
answered exactly like an invalid token (section 7.2), so a caller cannot probe
which tenants exist.

### 3.5 Moving and merging tenants

**Moving** a tenant between cells is the export and verified import of a
legacy cut-over with nothing transformed: freeze in the source cell, export,
import into the target cell, verify, flip `directory.tenants.cell_id`, then
delete from the source.

- Every row keeps its id, `version`, `date_last_modified` and `created_at`:
  `cell_io` supplies them and the row-metadata trigger keeps them for that
  role only (section 4.4). ETags held by clients therefore stay valid, and a
  document's revision stays ahead of its version history.
- Audit rows keep their values, so `audit.hash_row` recomputes the same hash;
  seal batches, members and anchors are copied as they are, and verification
  recomputes the chain in the target before the flip. It also compares every
  row's `version` and `date_last_modified` between source and target.
- The tenant's DEKs are unwrapped with the source cell's KMS key and
  re-wrapped under the target's; the tenant id, and so every AAD, is
  unchanged. Storage objects are copied with the same keys.
- Sessions do not move: the cell host changes, so everyone signs in again.
  Passkeys keep working (same relying party, same user handle).
- Integration clients keep their ids; LTI signing keys are renewed as above.

**Merging** two standalone tenants into one group is its own procedure,
because the absorbed tenant's id changes and several values are bound to it.
The absorbing tenant T keeps its id; the absorbed tenant S is frozen, exported
and imported into T with every `tenant_id` rewritten:

- Ids are kept after a collision check against T for every table whose ids
  key something outside Postgres (documents, files, users).
- Descriptors are matched on namespace, `code_value` and `system_meaning`;
  a match maps S's id to T's in `staging.id_map`, and a label that differs
  becomes a descriptor override at S's school (section 6.2). Built-in access
  roles are matched on `builtin_key`; an S built-in that differs becomes a
  built-in scoped to S's school (section 6.10).
- Ciphertexts are decrypted with S's DEKs and re-encrypted under T's with the
  new AAD; identifier HMACs are recomputed under T's lookup key and uniqueness
  re-checked. Storage objects are copied to T's prefix.
- Passkeys cannot follow: the user handle an authenticator returns carries S's
  id. S's passkeys are revoked and S's people register new ones at their next
  sign-in. The handle check and the AAD are never relaxed to avoid this.
- Sessions are revoked. S's integration clients are repointed to T, scoped to
  S's school.
- S's audit log is never re-hashed. It is closed, verified, anchored and
  exported as an archive; T records one `tenant.merged` audit row carrying the
  archive's object key and S's final chain hash. S's audit rows are also
  copied into T's log as `import` rows so the History views keep working; the
  archive, not the copies, is the proof.
- `directory.tenants` marks S `offboarded` with `merged_into_id = T`.

A standalone school that joins a group without a second tenant needs none of
this: a `school_group` org is inserted above its root and nothing else moves.

### 3.6 Tenants, orgs and school groups

The tenant is the isolation boundary. Inside it, orgs form a tree that follows
OneRoster `Org` ([R1] section 1):

- A **school group** tenant has one root org of type `school_group` (exported
  to OneRoster as `district`) with each school as a child org of type
  `school`.
- A **standalone school** tenant has one root org of type `school`. If it later
  joins a group, a `school_group` org is inserted above it.
- `department` orgs are optional children of a school or group.
- The school is "the unit of assignment for classes and enrollments"
  (OneRoster OrgTypeEnum). Academic sessions, calendars, class periods,
  locations, student school years, every natural role except group
  administration, and (in other specs) classes belong to a school org.

How a group with several schools works:

- **People are tenant-wide.** One person is one `users` row across all the
  group's schools. A teacher in two schools holds a role at each; a parent
  with children in two schools has one account and sees both. This is
  OneRoster's "a teacher in one school may be a parent in another" (IG
  5.2.2) applied inside a tenant.
- **Membership is per school.** `user_roles.org_id` says where someone
  belongs. Only `district_administrator` and `system_administrator` roles sit
  at the group org; a teacher who teaches at every school holds a role at each
  school, because OneRoster consumers do not expand a district role into
  school memberships.
- **Capabilities are scoped by org.** An access-role assignment names an org;
  at the group org it covers every school (section 6.10). Access roles and
  their built-in rows may be scoped to one school, so one school can narrow
  what its teachers do without changing another's.
- **Visibility between schools is authorisation, not isolation.** RLS isolates
  tenants only. A teacher at school A does not see school B's students
  because every relationship function takes the org into account, not
  because the database hides them. This is the trade-off the tenant decision
  accepted: one isolation boundary per contracting customer, one set of
  people, and org scope enforced in SQL functions that the CI behavioural
  tests exercise per org.
- **Finding a person another school holds.** The duplicate check when adding
  a student and the guardian lookup by phone or email search the whole tenant.
  A match known only at another school shows a minimal card (name, photo,
  year of birth) and nothing else. Linking creates a role or relationship at
  the searching school and is audited; from then on that school sees the
  person's record like any member's. Contact points belong to the person and
  are visible to every school where the person holds a current role.
- **Vocabularies are tenant-wide with a school scope.**
  `descriptors.org_id` limits a value to one school; a descriptor override
  relabels a tenant-wide value for one school (section 6.2).
- **Calendars, locale and features are per school.** Schools in a group that
  share dates get the same rows copied by the year-setup tool; there is no
  group calendar, matching Ed-Fi, which has no district calendar ([R1]
  section 3.4). Each school has its own default locale and feature switches.

## 4. Conventions

### 4.1 Postgres schemas in a cell

- `app`: functions only (context, triggers, erasure checks, search, partition
  maintenance, the year-span change).
- `core`: tenant tables.
- `health`: encrypted health records, reachable only with the health purpose
  set (section 6.11).
- `audit`: the audit log, its payloads and seals.
- `parts`: every partition of every partitioned table. No runtime role has
  `USAGE`, because partitions do not inherit RLS and a partition read directly
  shows every tenant ([R2] finding 2, probe).
- `search`: the search index. No RLS, no runtime `USAGE`; reached only through
  `app.search` (section 6.19).
- `ops`: cell-level operational tables without personal data
  (`tenant_registry`, `partitioned_tables`, `sms_suppressions`). `worker` has
  `USAGE` and the grants listed with each table.
- `staging`: unlogged import staging, `cell_io` only (section 10.1).
- `ext`: extensions `btree_gist`, `btree_gin`, `pg_trgm`.
- `pgboss`: pg-boss, owned by `pgboss_owner` (section 7.6).
- `public`: empty; `USAGE` and `CREATE` revoked from `PUBLIC`.

### 4.2 Roles

Cluster roles are created by cell provisioning (infrastructure code), not by
migrations, because roles are cluster objects:

```postgresql
create role cell_owner nologin;                  -- owns every object in the cell schemas
create role migrator login nobypassrls;          -- runs migrations as SET ROLE cell_owner
grant cell_owner to migrator;
create role app login nobypassrls;               -- the API for signed-in users and system work
create role site login nobypassrls;              -- the public website: published rows only
create role integration login nobypassrls;       -- OneRoster and LTI calls
create role worker login nobypassrls;            -- pg-boss workers and the audit sealer
create role collab login nobypassrls;            -- Hocuspocus
create role cell_io login nobypassrls;           -- provisioning, import, move, merge and export
create role retention login nobypassrls;         -- expiry deletes and approved erasure only
create role pgboss_owner nologin;                -- owns the pgboss schema
create role backup_dump login bypassrls;         -- full logical dumps only, from the backup host
create role break_glass nologin bypassrls;       -- granted temporarily to a named operator role

alter role app set statement_timeout = '5s';
alter role app set lock_timeout = '2s';
alter role app set idle_in_transaction_session_timeout = '10s';
alter role app set transaction_timeout = '30s';
alter role site set statement_timeout = '2s';
alter role site set transaction_timeout = '10s';
alter role integration set statement_timeout = '15s';
alter role integration set lock_timeout = '2s';
alter role integration set transaction_timeout = '30s';
alter role worker set statement_timeout = '60s';
alter role worker set lock_timeout = '5s';
alter role worker set transaction_timeout = '30s';
alter role collab set statement_timeout = '5s';
alter role collab set transaction_timeout = '30s';
alter role retention set transaction_timeout = '30s';
alter role migrator set lock_timeout = '5s';
alter role app set timezone = 'UTC';             -- and the same for every other role
```

- Nothing that runs at request time bypasses RLS, and `FORCE` makes objects
  owned by `cell_owner` (views, definer functions) fail closed rather than
  read across tenants ([R2] finding 7, probe).
- No runtime role owns anything, holds `TRUNCATE`, or holds `DELETE` outside the
  allowlist in section 5. RLS does not apply to `TRUNCATE` (PG docs), so the
  privilege is the only guard.
- `cell_owner` is not bound by any of this. A migration running as the owner
  can disable RLS, set `NO FORCE` or drop a policy; what stops that is review
  and gate 3 (section 8), which rejects such statements in a migration, not the
  database.
- Operators never log in as a shared role. Each has a personal login role with
  `log_statement = 'all'`, whose server log is shipped to append-only storage;
  `break_glass` is granted to it for the duration of an audited incident and
  revoked afterwards.
- `backup_dump` may connect only from the backup host with a client
  certificate (`pg_hba.conf`), and its dumps run with
  `--no-unlogged-table-data --exclude-schema=staging`.
- Every role runs with `TimeZone = 'UTC'` so timestamps render identically
  whatever the pool history.
- Writing roles have `transaction_timeout = 30s`. That bound is what makes the
  delta-read rule in section 4.9 and the audit sealer window in section 6.14
  correct. `cell_io` has none, because its bulk inserts land either in a tenant
  nobody reads yet (`provisioning`, `importing`) or in an org that no read path
  serves until the flip, and the flip re-touches every imported row (section
  10.1).

### 4.3 Table classes

Every table in `core`, `health` and `audit` is one of four classes. The class
fixes its columns, its policies (section 5) and whether the CI check expects
the row-metadata trigger.

- **Entity**: a thing people create and change. Base columns (section 4.4),
  `app.row_meta()` trigger, tombstones, optimistic concurrency, visible to
  OneRoster-style delta reads.
- **Keyed extension**: an entity whose identity is another row's, one to one.
  Base columns without `id`; trigger `app.row_meta_keyed('<key column>')`,
  which also makes the key immutable. `core.tenants` (keyed by `tenant_id`),
  `core.demographics` (by `user_id`, because OneRoster requires the
  demographics sourcedId to equal the user's [R1]) and
  `core.relationship_restrictions` (by `relationship_id`).
- **Ledger**: append-only facts (`audit.log`, `audit.payloads`, the seals,
  `core.consent_records`, `core.erasure_approvals`, `core.erasure_items`,
  `core.document_versions`, `core.activity_events`, `core.import_rows`).
  `tenant_id`, their own key and a creation or occurrence timestamp; no
  `status`, `version`, `date_last_modified` or `metadata`; no `UPDATE` grant
  for any runtime role, with one exception: `retention` may redact the content
  columns of an approved document version (section 5).
- **Ephemeral**: short-lived security state (`core.sessions`,
  `core.auth_attempts`, `core.idempotency_keys`). Own columns, hard-deleted by
  `retention` after expiry, or earlier on an approved erasure.

### 4.4 Base columns

Every entity table has these columns, written exactly like this; the CI check
verifies that they exist, that `tenant_id` is the first column, and the
`status` check and `uuidv7()` default:

```postgresql
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  -- ... the table's own columns ...
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
```

`tenant_id` is always the first column; the CI check fails a table in `core`,
`audit` or `health` whose first column is anything else, so a global table
cannot slip into a tenant schema.

Every tenant table references `core.tenants`, directly or through the row it
belongs to (an audit payload through its log row). It costs one cached index
probe per insert and means no row can exist for a tenant the cell does not
know.

`created_at` is the addition. UUIDv7 carries its creation time, but imported
rows keep their legacy UUIDv4 ids ([R2] section 6), which carry none, and the
product shows "joined", "created" and "first signed in" dates.

The first migration creates the schemas, the context functions and the
row-metadata triggers. The triggers set `version`, `date_last_modified` and
`created_at`, so no code path can forget them; only `cell_io` may supply them
on insert, so an import keeps a legacy creation date and a move or merge keeps
every row's version and modification time:

```sql
set role cell_owner;
create schema ext;
create extension btree_gist with schema ext;
create extension btree_gin with schema ext;
create extension pg_trgm with schema ext;

create schema app;
create schema core;
create schema health;
create schema audit;
create schema parts;
create schema search;
create schema staging;
create schema ops;

revoke all on schema public from public;
grant usage on schema app, core to app, site, integration, worker, collab, cell_io, retention;
grant usage on schema audit to app, integration, worker, cell_io, retention;
grant usage on schema health to app, worker, cell_io, retention;
grant usage, create on schema staging to cell_io;
grant usage on schema ops to worker;

create function app.tenant_id() returns uuid
language plpgsql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare v text := current_setting('app.tenant_id', true);
begin
  if v is null or v = ''
     or current_setting('app.tenant_txn', true) is distinct from
        ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text then
    raise exception 'tenant context is not set' using errcode = '42501';
  end if;
  return v::uuid;
end $$;

create function app.user_id() returns uuid
language sql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app.row_meta() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'cell_io' then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if new.id <> old.id then
      raise exception 'id is immutable' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create function app.row_meta_keyed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'cell_io' then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if (to_jsonb(new) -> tg_argv[0]) is distinct from (to_jsonb(old) -> tg_argv[0]) then
      raise exception '% is immutable', tg_argv[0] using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create function app.lock(key text) returns void
language sql volatile
set search_path = pg_catalog, pg_temp
as $$ select pg_advisory_xact_lock(hashtextextended(app.tenant_id()::text || ':' || key, 0)) $$;

create table ops.tenant_registry (
  tenant_id uuid primary key,
  lifecycle text not null
    check (lifecycle in ('provisioning', 'importing', 'active', 'frozen', 'suspended', 'offboarding')),
  changed_at timestamptz not null default statement_timestamp()
);
grant select on ops.tenant_registry to worker;

create table ops.sms_suppressions (
  address_hmac bytea not null check (octet_length(address_hmac) = 32),
  sender_id text not null check (char_length(sender_id) between 1 and 40),
  suppressed_at timestamptz not null default statement_timestamp(),
  primary key (address_hmac, sender_id)
);
grant select, insert, delete on ops.sms_suppressions to worker;

create function app.tenant_lifecycle() returns text
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select lifecycle from ops.tenant_registry where tenant_id = app.tenant_id() $$;

create function app.begin_unit(p_tenant uuid, p_user uuid, p_account uuid, p_session uuid,
  p_request text, p_actor text) returns text
language plpgsql volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  perform set_config('app.tenant_id', p_tenant::text, true),
          set_config('app.tenant_txn', ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text, true),
          set_config('app.user_id', coalesce(p_user::text, ''), true),
          set_config('app.account_id', coalesce(p_account::text, ''), true),
          set_config('app.session_id', coalesce(p_session::text, ''), true),
          set_config('app.request_id', coalesce(p_request, ''), true),
          set_config('app.actor_kind', coalesce(p_actor, 'system'), true),
          set_config('app.purpose', '', true);
  return app.tenant_lifecycle();
end $$;

revoke all on all functions in schema app from public;
grant execute on function app.tenant_id(), app.user_id(), app.lock(text), app.tenant_lifecycle(),
  app.begin_unit(uuid, uuid, uuid, uuid, text, text)
  to app, site, integration, worker, collab, cell_io, retention;
reset role;
```

Notes on the functions:

- `app.tenant_id()` raises rather than returning null. After a committed
  `set_config('app.tenant_id', x, true)` the pooled session's value is `''`,
  not null, so a function that returned null on unset would behave differently
  depending on pool history ([R2] finding 5, probe; [P]).
- It also raises unless `app.tenant_txn` names the current transaction. A
  session-level value left behind by any library or tool (`SET`, or
  `set_config(..., false)`) survives PgBouncer transaction pooling, which runs
  no reset query; without the binding, a later request that skipped the unit
  of work would run silently as that tenant instead of failing.
- `app.begin_unit` is the only way the context is set: one statement that
  binds the tenant to the transaction, fills the actor settings the audit
  trigger reads, clears the purpose and returns the tenant's lifecycle.
- Policies call `app.tenant_id()` as `(select app.tenant_id())`, which runs
  once per statement as an InitPlan; unwrapped, a sequential scan over 1M rows
  took 367.7 ms against 20.5 ms ([R2] finding 6, probe).
- `app.lock(key)` is the one advisory-lock convention: a transaction-scoped
  lock on (tenant, key), which also works through PgBouncer transaction
  pooling ([R2] section 10). Invariants no constraint can express (the last
  holder of `access:manage`, say) take it before reading.
- `ops.tenant_registry` carries no personal data and has no RLS; the API reads
  its own tenant's row through the definer function, and the worker reads it
  whole to schedule per-tenant jobs. `ops.sms_suppressions` holds carrier-level
  opt-outs (section 7.1).

### 4.5 Naming

- Names are snake_case everywhere. Tables are plural nouns; columns singular.
- Foreign keys are `<entity>_id`, or `<role>_<entity>_id` when a table holds
  two references to the same table (`student_user_id`, `related_user_id`,
  `granted_by_user_id`).
- Instants end in `_at` (`timestamptz`); calendar dates in `_on` (`date`);
  times of day in `_time` (`time`); date spans are `span` (a thing's extent)
  or `valid_during` (a fact's validity), both `daterange`. Two columns keep
  their standards' names instead: `date_last_modified` (OneRoster
  `dateLastModified`, an instant) and `birth_date` (Ed-Fi `BirthDate`).
- Booleans read as a statement of fact: `portal_access`, `legal_guardian`,
  `has_alert`, `collaborative`. No `is_` prefix.
- Localised pairs end in `_en` and `_ar` (section 4.12).
- Constraint names follow Postgres defaults (`<table>_pkey`,
  `<table>_<columns>_key`, `<table>_<columns>_fkey`, `<table>_<column>_check`).
  Hand-named constraints use `<table>_<rule>_check` and `<table>_<rule>_excl`,
  and the rule word must not equal a column name, because the default name of
  a column check would collide ([P]: `lifecycle` did).
- Constraint names are part of the API: the API maps a violated constraint
  name to a stable error code (section 7.4), so renaming one is a breaking
  change.
- Partitions are `parts.<schema>_<table>_<yyyy>_<mm>` for monthly ranges and
  `parts.<schema>_<table>_<yyyy>` for yearly ones.

### 4.6 Identifiers

- **Row ids** are `uuidv7()` by database default ([R2] section 6: 2.35 s
  against 3.73 to 33.2 s per 2M inserts, 90% against 70.7% leaf density). The
  API may generate the id itself with `Bun.randomUUIDv7()` when it must know it
  before insert (idempotent creates, Yjs document ids). The server always
  generates ids: no procedure accepts a row id for a new row from a client.
- **Legacy rows keep their UUIDv4 ids** so references, storage keys and URLs
  stay stable ([R2] section 6). Partitions therefore key on a timestamp column,
  never on id ranges. An import, move or merge checks every id it brings in
  against the target cell for tables whose ids key something outside Postgres
  (documents, files, users) before inserting.
- **Keys outside Postgres carry the tenant.** A primary key is unique only
  with its `tenant_id`, so every key built outside the database is
  `<tenant_id>:<id>`: collaboration room names, Valkey channels, cache keys,
  pg-boss singleton keys, storage keys (`t/<tenant_id>/...`). The collaboration
  server builds the room name from the tenant the API returned for the
  connection, never from the client's string alone (section 7.6).
- **Secrets are never UUIDs.** A v7 id reveals its creation time, and RFC 9562
  §8 says UUIDs "MUST NOT be used as security capabilities". Session tokens,
  invitation and recovery secrets, badge secrets and download tokens are 256
  random bits, base64url in transit, stored as SHA-256 (`bytea`, 32 bytes).
- **OneRoster `sourcedId`** is the row's `id` as text. It is stable, never
  reused (tombstoned rows keep it) and carries no personal data, which is what
  OneRoster requires of it ([R1] section 1). Identifiers received from another
  system are never used as keys: they are stored in `core.external_ids` (people)
  or in the owning integration's mapping table, as OneRoster IG 6.1.1 advises.
  When two people are merged, the merged-away id is kept as an external id of
  system `legacy_id` and served as `LegacySourcedID` (IG 6.1.3.1), so a
  consumer can relink it.
- **Ed-Fi `UniqueId`** (`StudentUniqueId`, `StaffUniqueId`,
  `ContactUniqueId`, at most 32 characters) is the row id's 32 hex digits
  without hyphens.
- **Human references** (the student number printed on cards) are external ids
  of system `school_reference` (section 6.7), not a column on `users`, because
  in a group each school numbers its own students.

### 4.7 Status, tombstones and erasure

- `status` is protocol state only: `active` or `tobedeleted`, exactly
  OneRoster's `BaseStatusEnum` ([R1] section 1). Business lifecycles are their
  own columns (`accounts.state`, `academic_sessions.lifecycle`,
  `files.state`, `orgs.lifecycle`) so that disabling a sign-in never looks like
  deleting a record, as OneRoster separates `enabledUser` from `status` ([R3]
  section 1). A student who leaves is not tombstoned: their school year gets
  an exit (section 6.8).
- **Deleting** is `update ... set status = 'tobedeleted'`. The row keeps its
  id, `date_last_modified` moves, and delta readers see the deletion. No
  runtime role can `DELETE` a tenant row except `retention` (section 5).
- **Restoring** is setting `status` back to `active`, allowed when no active
  row now holds the same unique value.
- **Uniqueness** of codes a school may reuse after deleting (a class code, a
  descriptor code) is a partial unique index `where status = 'active'`. Ids,
  sourcedIds and credential ids are never reused, so their uniqueness is
  total. An external identifier stays unique while its row is active, ended or
  not; only tombstoning a row entered in error frees the value.
- **Temporal exclusion** constraints carry `where (status = 'active')`, which
  is why they are `EXCLUDE` rather than `WITHOUT OVERLAPS`: the latter cannot
  be partial ([R2] section 5).
- **Foreign keys are `NO ACTION`**, never `CASCADE` or `SET NULL`. Rows are
  not deleted, so there is nothing to cascade, and a cascade would contradict
  "nothing destroys work" (product principle 5). A reference to a tombstoned
  row stays valid and the reader shows the target as deleted.
- **Erasure** is not deletion. When a person's data must be erased (Egypt Law
  151/2020 Art. 4(7), Saudi PDPL Art. 18, UAE Art. 5(7) [R3]), a person with
  the erasure capability records an approval in `core.erasure_approvals`,
  listing the files and documents it covers beyond the person's own rows
  (section 6.13). Only then, and only while no legal hold names the
  person, can `retention`:
  - tombstone the person's rows (roles, placements, relationships, account)
    and null the personal columns of `users` and `demographics` (setting
    `users.erased_at`), clearing their `metadata`;
  - delete the person's external ids, contact points,
    relationship restrictions, login identities, passkeys, devices, sessions,
    idempotency keys, file subjects, preferences, saved views, activity
    events, health records and audit payloads;
  - delete the listed files (then their objects), and redact the listed
    documents, their versions and translations.

  Ids and `date_last_modified` stay, so delta readers learn of the deletion
  ([R3] section 7); `core.demographics` keeps its tombstone, so the
  demographics endpoint serves `tobedeleted` for that sourcedId. The search
  triggers drop the person's entries; the privacy spec's job also purges
  pg-boss jobs whose payload names the person. Consent records and audit log
  rows are kept: they hold ids, not values, and keeping proof of consent is a
  legal obligation. The procedure, its approval screens and the retention
  schedules belong to the privacy operations spec; the database binding is
  here (section 5).

### 4.8 Version and optimistic concurrency

- `version` starts at 1 and the trigger adds 1 on every update, whoever runs
  it. A move or merge keeps it (section 3.5).
- Every update of an entity names the version it read:
  `update ... where tenant_id = $1 and id = $2 and version = $3 returning version`.
  No row returned means another write won. The API then answers 412 if the row
  still exists and 404 if it does not.
- REST: the entity's `ETag` is `"<version>"`; mutating requests need
  `If-Match` and get 428 without it and 412 on a mismatch [BA]. RPC: update
  inputs carry `expectedVersion`, and the same outcomes map to `CONFLICT` and
  `NOT_FOUND`.
- Ed-Fi's `_etag` maps to the same value on export ([R1] section 5 item 8).
- A document's `version` is its revision; there is no separate revision
  counter.

### 4.9 date_last_modified and delta reads

- `date_last_modified` is `statement_timestamp()` of the statement that last
  wrote the row, set by the trigger. It is what OneRoster `dateLastModified`
  delta filters read ([R1] section 1). Every table a OneRoster resource is
  built from has an index on `(tenant_id, date_last_modified)`, not partial,
  because tombstones must be found too.
- A timestamp is taken before commit, so a row written by a transaction that
  commits after a reader's watermark can carry a time before it and be missed
  ([R1] section 5 item 8; [R2] section 12). Every delta reader therefore widens
  its lower bound by `DELTA_LAG = 60 s`: the 30-second `transaction_timeout` of
  every writing role plus 30 seconds of margin. A filter
  `dateLastModified > T` is served as `date_last_modified > T - 60 s`.
  Consumers upsert by sourcedId, so the overlap is harmless. The provider is
  run against the 1EdTech conformance suite; if the suite rejects records whose
  value does not satisfy the requested filter, the provider switches to
  serving `T < date_last_modified <= now() - 60 s` and documents that a
  consumer's next `T` must be the greatest `dateLastModified` it received.
- **A served record is built from several tables**, so its `dateLastModified`
  is the greatest value among the rows it is built from, and a delta query
  selects a record when any of them changed. For the resources the foundation
  serves:
  - `orgs`: `core.orgs`, and its child orgs (for `children`).
  - `academicSessions` (and the `terms` and `gradingPeriods` views of it):
    `core.academic_sessions`, and its child sessions (for `children`).
  - `users` (and `students`, `teachers`): `core.users`; `core.user_roles` of
    the user (`roles[]`); `core.accounts` (`enabledUser`);
    `core.external_ids` (`userIds[]`); `core.contact_points` with purpose
    `notify` (`email`, `sms`, `phone`); `core.user_relationships` where the
    user is either end (`agents[]`); `core.student_school_years` (`grades[]`).
  - `demographics`: `core.users` (`birthDate`, `sex`) and
    `core.demographics`.

  Other specs list theirs the same way.

- **Validity ends without a write.** A role, relationship, external id or
  school year whose `valid_during` ends leaves the served set at midnight
  without any row changing. A nightly per-tenant job, run after midnight in
  each school's zone, touches (updates to themselves, which moves
  `date_last_modified` through the trigger) the users whose served rows started
  or ended that day, so delta consumers hear of it.
- Only users with at least one served role are served; a person with no role
  (an emergency contact) is never a OneRoster user.

### 4.10 metadata

- `metadata` is a JSON object of at most 16 KiB. It holds two things only:
  - Extension data received from another system that must round-trip (the
    OneRoster `metadata` object, [R1] section 1), under the key
    `x:<system>`.
  - Import provenance and unmapped legacy values, under the key `legacy`
    (for example `{"legacy": {"relation": "خال الأم"}}`).
- The product never branches on metadata and no query filters on it. A value
  the product uses is a column. (A filter on jsonb could not use an index under
  RLS anyway: `jsonb_contains` is not leakproof, [R2] finding 1.)
- Metadata never holds credential material, secrets, health facts, custody
  facts or a file's original name; `health.records.metadata` must be `{}`.
  Only `x:` keys are served in OneRoster `metadata`; `legacy` never leaves the
  cell.

### 4.11 Time

- Instants are `timestamptz`, rendered in UTC by the database (every role has
  `TimeZone = 'UTC'`) and converted to the school's zone by the API.
- Each school org has `time_zone`, an IANA name. The request context computes
  "today" per school once per unit of work (section 7.2); SQL never calls
  `current_date`, whose answer depends on the session zone.
- A person's own schedule (digest time, quiet hours) runs in the zone of their
  `primary_org_id`, or of the tenant's root org when they have none.
- Calendar concepts are `date`; times of day are `time` without zone and are
  interpreted in the school's zone.
- **Spans are half-open `daterange '[)'`**, lower bound inclusive, upper
  exclusive. OneRoster end dates are exclusive while Ed-Fi recommends
  inclusive ones ([R1] section 5 item 7); half-open is what `WITHOUT OVERLAPS`,
  `PERIOD` foreign keys and adjacency (`[a,b)` next to `[b,c)`) expect. The
  UI shows the last day as `upper(span) - 1`; Ed-Fi export subtracts one day.
  Validity ranges (`valid_during`) may be open-ended (`[2026-09-13,)`);
  session and week spans must be bounded.
- **Weekdays are ISO 8601**, 1 = Monday to 7 = Sunday, as
  `extract(isodow from d)` returns. Legacy `0 = Sunday` becomes 7 on import.
- Week start and weekend days are per school (`orgs.week_start`,
  `orgs.weekend_days`), set at provisioning from the jurisdiction: Egypt and
  Saudi Arabia start on Sunday with a Friday-Saturday weekend; the UAE
  starts on Monday with a Saturday-Sunday weekend.

### 4.12 Localisation

- **Labels a school writes in both languages** are column pairs
  `<name>_en` and `<name>_ar`, each nullable, with a check that at least one
  is present. The reader sees their locale's value and falls back to the
  other. Seeded vocabulary carries both.
- **Default locale** is per school (`orgs.default_locale`), falling back to
  the tenant's, because one group may run an Arabic national school and an
  English international one.
- **Single-valued standard fields** fed by a pair (OneRoster `Org.name`,
  `AcademicSession.title`, Ed-Fi descriptor descriptions) export in the
  school's default locale, falling back to the other language.
- **Person names are not translations.** A name is written in a script, and a
  person may have one in Arabic script and one in Latin script. `users` holds
  both sets of parts (section 6.7): the `_ar` set is the Arabic-script name,
  the `_en` set the Latin-script name. The student list shows both.
- **Long text** is a document (section 6.12) with its own `locale`. Content
  authored in both languages is two documents paired by `translation_of_id`,
  with stable block ids so sections align; machine translations live in
  `core.document_translations`.
- **Sorting** uses ICU collations per column (`collate "ar-x-icu"`,
  `collate "en-x-icu"`) in both the index and the `ORDER BY`; the database
  default is code-point order.
- **Arabic matching** folds diacritics (U+064B to U+065F, U+0670), tatweel
  (U+0640), alef with hamza or madda to bare alef, alef maqsura to yeh and teh
  marbuta to heh (`app.normalize_name`, section 6.19), because the built-in
  `arabic` configuration does not fold alef maqsura and `simple` keeps
  diacritics ([R2] section 8, probe).

### 4.13 Vocabularies

Three kinds, never mixed:

- **Fixed system vocabularies** that code branches on (org type, session type,
  account state, table-class status) are `text` with a `CHECK`. A check is
  replaced in one migration, which a Postgres enum is not (values cannot be
  removed, and new ones are unusable until commit).
- **School-configurable vocabularies** are descriptors (section 6.2), where
  every value carries a fixed `system_meaning` so behaviour never depends on a
  code a school typed ([R1] section 5 item 11). Where a standard token follows
  from the meaning (the OneRoster role of a relation), a check fixes it.
- **International code lists** are stored as their codes, with labels from CLDR
  data in the application: ISO 3166-1 alpha-2 countries (`EG`), ISO 639
  languages (`ar`), IANA time zones, E.164 phone numbers. They are not
  descriptors because no school configures them.

### 4.14 Text and sizes

- Optional text is `NULL` when absent, never `''`: every text column has a
  `char_length(x) between 1 and n` check, which null passes. The interface
  renders null as "not recorded" (the `<Value>` rule in AGENTS.md).
- Limits follow the standards where they have one: Ed-Fi names and descriptor
  short descriptions 75 characters, contact restrictions 250, descriptor URIs
  306, unique ids 32 [R1]. The one deliberate excess is `middle_name_*` (150),
  because an Arabic naming chain holds the father's and grandfather's names;
  the Ed-Fi export cuts it at the last word boundary within 75 characters and
  sends the whole chain as an `OtherName` of type `Other Name`.
- Otherwise the limits are the ones in the DDL below.

### 4.15 Keys and references

- `tenant_id` leads every primary key, unique constraint, unique index,
  exclusion constraint and foreign key, on both sides. A single-column foreign
  key lets one tenant reference another's row, because referential checks
  bypass RLS, and it works as an existence oracle ([R2] section 4, probe).
- **Namespace pinning.** A column that references a descriptor carries a
  stored generated column holding the namespace. The foreign key includes it,
  so a `sex` value cannot be stored as a `relation` ([P]):

  ```postgresql
  relation_descriptor_id uuid not null,
  relation_ns text not null generated always as ('relation') stored,
  foreign key (tenant_id, relation_descriptor_id, relation_ns)
    references core.descriptors (tenant_id, id, namespace),
  ```

  Where a check depends on the value's meaning (a national id must be
  sealed), the referencing row also carries `<name>_meaning` and the foreign key
  targets `(tenant_id, id, namespace, system_meaning)`.

- **Type pinning** uses the same device where a reference must point at a row
  of a given type (a calendar's school year must be a `school_year` session, a
  student's school must be a `school` org, an embedded file must be media):
  a constant column and a foreign key to a unique key that includes the type.
- **Temporal containment** uses PG18 `PERIOD` foreign keys to a
  `unique (tenant_id, id, type, span without overlaps)` target, so containment
  and type pinning hold together: a term cannot extend beyond its parent, a
  week or a calendar date cannot fall outside its school year, and a year
  cannot shrink under its terms ([P]). A single date is contained by a
  generated `daterange(d, d + 1)` column ([P]). `PERIOD` foreign keys allow
  only `NO ACTION` (CREATE TABLE docs), which is the rule anyway.
- Foreign keys ignore `status`, so a tombstoned row still holds its parent.
  Changing a school year's dates therefore goes through one definer function,
  `app.change_year_span` (section 6.3), which removes the generated and
  tombstoned rows outside the new span in the same transaction.
- `NULLS NOT DISTINCT` only where null is a real value ("assigned
  tenant-wide" in `external_ids`, "every school" in descriptors and access
  roles); optional identifiers keep the default ([R2] section 4).

### 4.16 Indexes

- Every index on a tenant table leads with `tenant_id`.
- Indexes serving live lists are partial `where status = 'active'`; indexes
  serving delta reads (section 4.9) are not.
- List pagination is keyset on `(sort key ..., id)` with a matching index; the
  OneRoster provider alone uses limit and offset, as its binding requires [BA].
- Full-text, trigram, `LIKE`, jsonb containment and range operators are not
  leakproof, so on an RLS table the planner will not use their indexes before
  the policy ([R2] finding 1: 15.9 ms seq scan against 0.025 ms). Such searches
  go through `search.entries` (section 6.19). Equality and b-tree comparisons
  on `uuid`, `text`, `date` and `timestamptz` are fine.

## 5. Access profiles

Each table below has one profile, plus the additions listed with it. The
profiles and additions are the complete statement of its policies and grants.
Policy names are fixed so that migrations diff cleanly; the CI check compares
the isolation policy's text exactly (section 8).

**Isolation (every table in `core`, `audit`, `health`):**

```postgresql
alter table <t> enable row level security;
alter table <t> force row level security;
create policy tenant_isolation on <t> as restrictive for all to public
  using (tenant_id = (select app.tenant_id()))
  with check (tenant_id = (select app.tenant_id()));
create policy owner_all on <t> for all to cell_owner using (true) with check (true);
```

With only restrictive policies nothing is visible, so the permissive policies
below are the grants of access and the restrictive ones are the isolation and
the purpose gates ([R2] section 3). `WITH CHECK` also stops moving a row to
another tenant. `owner_all` lets a definer function or an operator task run
per tenant with the context set; while RLS is on, the owner too sees one
tenant at a time. Nothing in the database stops the owner turning RLS off
(section 4.2).

**Entity profile:**

```postgresql
create policy p_select on <t> for select to app, worker, cell_io, retention using (true);
create policy p_insert on <t> for insert to app, worker, cell_io with check (true);
create policy p_update on <t> for update to app, worker, cell_io using (true) with check (true);
grant select, insert, update on <t> to app, worker, cell_io;
grant select on <t> to retention;
create trigger row_meta before insert or update on <t>
  for each row execute function app.row_meta();   -- app.row_meta_keyed('<key column>') for keyed tables
```

**Ledger profile:** as entity, without `p_update`, without any `UPDATE` grant,
without the trigger.

**Ephemeral profile:**

```postgresql
create policy p_select on <t> for select to app, worker, retention using (true);
create policy p_insert on <t> for insert to app, worker with check (true);
create policy p_update on <t> for update to app, worker using (true) with check (true);
create policy p_delete on <t> for delete to retention using (<expiry> or <holder erased>);
grant select, insert, update on <t> to app, worker;
grant select, delete on <t> to retention;
```

**Purpose gate** (added where marked, with its purpose):

```postgresql
create policy purpose_gate on <t> as restrictive for all to public
  using ((select current_setting('app.purpose', true)) = '<purpose>')
  with check ((select current_setting('app.purpose', true)) = '<purpose>');
```

**Erasure** (added where marked). `retention` holds no table-wide `UPDATE` and
no `DELETE` except through these, and each is bound to an approved erasure
through `<who>`, the table's predicate listed below:

```postgresql
-- erase: tombstone and null the personal columns; the row stays
create policy p_erase_update on <t> for update to retention using (<who>) with check (status = 'tobedeleted');
grant update (status, metadata, <personal columns>) on <t> to retention;

-- erase and delete: as erase, then remove the tombstoned row
create policy p_erase_update on <t> for update to retention using (<who>) with check (status = 'tobedeleted');
create policy p_erase_delete on <t> for delete to retention using (status = 'tobedeleted' and <who>);
grant update (status, metadata) on <t> to retention;
grant delete on <t> to retention;
```

`<who>` is `app.erasure_approved(tenant_id, <person column>)`, or
`app.erasure_listed(tenant_id, '<type>', <id column>)` for rows an approval
lists, or, for rows owned through an account, `<holder erased>`:

```postgresql
exists (select 1 from core.accounts a
        where a.tenant_id = <t>.tenant_id and a.id = <t>.account_id
          and app.erasure_approved(a.tenant_id, a.user_id))
```

**Integration read** (added where marked): the `integration` role's
OneRoster and LTI calls read these foundation tables and nothing else here.

```postgresql
create policy p_integration_select on <t> for select to integration using (true);
grant select on <t> to integration;
```

Table by table:

- `core.tenants`: entity (keyed, `tenant_id`), integration read. Deviations:
  `p_insert ... to cell_io`; `p_update ... to app, worker, cell_io`;
  `grant select on core.tenants to app`,
  `grant update (name_en, name_ar, default_locale, metadata) on core.tenants to app`,
  `grant select, update on core.tenants to worker`,
  `grant select, insert, update on core.tenants to cell_io`.
- `core.orgs`: entity, integration read. Deviations: `app` inserts only
  departments and may not tombstone a school or group, because a school also
  needs a directory slug and goes through provisioning. The policies are
  `create policy p_insert_app on core.orgs for insert to app with check (type = 'department')`,
  `create policy p_update_app on core.orgs for update to app using (true) with check (type = 'department' or status = 'active')`,
  with `p_insert` and `p_update` for `worker, cell_io` only;
  `grant select, insert on core.orgs to app`,
  `grant update (name_en, name_ar, identifier, time_zone, default_locale, week_start, weekend_days, country_code, address, phone, email, website_url, logo_file_id, status, metadata) on core.orgs to app`
  (never `type`, `parent_id`, `parent_type` or `lifecycle`). The public
  website reads public fields:
  `create policy p_site_select on core.orgs for select to site using (status = 'active' and lifecycle = 'active')`,
  `grant select (tenant_id, id, type, parent_id, name_en, name_ar, time_zone, default_locale, country_code, address, phone, email, website_url, logo_file_id, status, lifecycle) on core.orgs to site`.
- `core.org_features`: entity.
- `core.descriptors`: entity, integration read. Deviation: `app` has `UPDATE`
  only on `label_en, label_ar, description_en, description_ar, sort_order,
color, icon, effective_during, status, metadata`. `code_value`, `namespace`,
  `system_meaning`, `org_id`, the standards mappings and `seeded` are fixed
  after insert for the API; seed corrections run as `worker`.
- `core.descriptor_overrides`: entity, integration read.
- `core.academic_sessions`, `core.calendars`, `core.calendar_grade_levels`,
  `core.calendar_dates`, `core.academic_weeks`, `core.class_periods`: entity,
  integration read.
- `core.locations`: entity.
- `core.files`: entity; erase and delete with
  `<who> = app.erasure_listed(tenant_id, 'file', id)`. Deviations: `app` has
  `UPDATE` only on `host_type, host_id, linked_at, name, status, metadata`;
  `worker` and `cell_io` keep table-wide `UPDATE`. Purpose gate by purpose:

  ```postgresql
  create policy files_purpose_gate on core.files as restrictive for all to public
    using (purpose not in ('health_report', 'evidence', 'legal_document')
           or (select current_setting('app.purpose', true))
              = case purpose when 'health_report' then 'health' else 'custody' end)
    with check (purpose not in ('health_report', 'evidence', 'legal_document')
           or (select current_setting('app.purpose', true))
              = case purpose when 'health_report' then 'health' else 'custody' end);
  ```

- `core.file_publications`: entity. The public website reads live
  publications:
  `create policy p_site_select on core.file_publications for select to site using (status = 'active' and unpublished_at is null)`,
  `grant select (tenant_id, id, file_id, derivative, public_key, host_type, host_id, status, unpublished_at) on core.file_publications to site`.
- `core.file_subjects`: entity; erase and delete, person `user_id`.
- `core.tenant_keys`: isolation plus
  `p_select to app, worker, cell_io, retention`; `p_insert to worker, cell_io`;
  `p_update to worker, retention`. Grants: `app` SELECT; `worker` SELECT,
  INSERT, UPDATE; `cell_io` SELECT, INSERT; `retention` SELECT, UPDATE. No
  trigger (it has no base columns).
- `core.users`: entity, integration read; erase, person `id`, personal columns
  `username, given_name_ar, middle_name_ar, family_name_ar, full_name_ar,
given_name_en, middle_name_en, family_name_en, full_name_en,
preferred_given_name, preferred_middle_name, preferred_family_name,
birth_date, birth_date_source, sex_descriptor_id, photo_file_id,
preferred_locale, primary_org_id, erased_at`.
- `core.demographics`: entity (keyed, `user_id`), purpose gate `demographics`,
  integration read; erase, person `user_id`, personal columns
  `birth_country_code, birth_city, nationality_codes, religion_descriptor_id,
home_languages`.
- `core.external_ids`: entity, integration read; erase and delete, person
  `user_id`.
- `core.contact_points`: entity, integration read; erase and delete, person
  `user_id`.
- `core.student_school_years`: entity, integration read; erase, person
  `student_user_id`.
- `core.user_roles`: entity, integration read; erase, person `user_id`.
- `core.user_relationships`: entity, integration read; erase with
  `<who> = app.erasure_approved(tenant_id, student_user_id) or app.erasure_approved(tenant_id, related_user_id)`.
- `core.relationship_restrictions`: entity (keyed, `relationship_id`), purpose
  gate `custody`; erase and delete with `<who>` testing both ends of its
  relationship.
- `core.accounts`: entity, integration read; erase, person `user_id`.
  Deviation: `app` has `UPDATE` only on `state, first_authenticated_at,
last_authenticated_at, state_changed_at, state_changed_by_user_id,
state_reason, status, metadata`.
- `core.identity_providers`, `core.identity_provider_orgs`: entity.
- `core.login_identities`: entity; erase and delete, `<holder erased>`.
- `core.passkeys`: entity; erase and delete, `<holder erased>`. Deviation:
  `app` has `UPDATE` only on `sign_count, last_used_at, nickname, revoked_at,
revoked_reason, status, metadata`.
- `core.devices`: entity; erase and delete, `<holder erased>`.
- `core.sessions`: ephemeral, expiry
  `absolute_expires_at < statement_timestamp() - interval '30 days'` (kept a
  month for the "active sessions" list and investigations), or holder erased.
- `core.auth_attempts`: ephemeral, expiry `window_ends_at < statement_timestamp()`.
- `core.idempotency_keys`: ephemeral, expiry `expires_at < statement_timestamp()`,
  or holder erased.
- `core.access_roles`: entity. Deviation: `app` has `UPDATE` only on
  `name_en, name_ar, description_en, description_ar, capabilities, status,
metadata`, never `org_id` or `builtin_key`.
- `core.access_role_assignments`: entity.
- `health.records`: entity, purpose gate `health`; erase and delete, person
  `student_user_id`.
- `core.documents`: entity; erase (redaction) with
  `<who> = app.erasure_listed(tenant_id, 'document', id)` and columns
  `content, plain_text, ydoc`; plus the collaboration role:

  ```postgresql
  create policy p_collab_select on core.documents for select to collab using (collaborative);
  create policy p_collab_update on core.documents for update to collab
    using (collaborative and frozen_at is null) with check (collaborative);
  grant select, update (ydoc, content, plain_text, last_edited_by_user_id, last_edited_at)
    on core.documents to collab;
  ```

- `core.document_versions`: ledger; the collaboration role reaches only the
  versions of documents it may edit, and `retention` may redact a listed
  document's versions:

  ```postgresql
  create policy p_collab_select on core.document_versions for select to collab
    using (exists (select 1 from core.documents d where d.tenant_id = document_versions.tenant_id
                   and d.id = document_versions.document_id and d.collaborative and d.frozen_at is null));
  create policy p_collab_insert on core.document_versions for insert to collab
    with check (reason = 'checkpoint' and exists (select 1 from core.documents d
                where d.tenant_id = document_versions.tenant_id and d.id = document_versions.document_id
                  and d.collaborative and d.frozen_at is null));
  grant select, insert on core.document_versions to collab;
  create policy p_erase_update on core.document_versions for update to retention
    using (app.erasure_listed(tenant_id, 'document', document_id)) with check (redacted_at is not null);
  grant update (content, plain_text, ydoc_snapshot, redacted_at) on core.document_versions to retention;
  ```

- `core.document_translations`: entity; erase (redaction) with
  `<who> = app.erasure_listed(tenant_id, 'document', document_id)` and
  columns `content, plain_text`.
- `core.document_files`, `core.document_links`: entity.
- `core.privacy_notices`, `core.legal_holds`: entity.
  `core.consent_records`, `core.erasure_approvals`, `core.erasure_items`:
  ledger. `core.current_consents` (view):
  `grant select to app, worker, cell_io, retention`.
- `core.activity_events`: ledger; `retention` deletes an erased person's
  events:
  `create policy p_erase_delete on core.activity_events for delete to retention using (app.erasure_approved(tenant_id, actor_user_id))`,
  `grant delete on core.activity_events to retention`.
- `core.import_runs`: entity. `core.import_rows`: ledger.
- `core.user_preferences`: entity; erase and delete, person `user_id`.
  `core.saved_views`: entity; erase and delete, person `owner_user_id`.
- `audit.log`: ledger; `integration` also inserts (its release records):
  `create policy p_integration_insert on audit.log for insert to integration with check (true)`,
  `grant insert on audit.log to integration`.
- `audit.seal_batches`, `audit.seal_members`, `audit.anchors`: ledger, except
  that `p_insert` and the `INSERT` grant are for `worker` (the sealer and the
  anchoring job) and `cell_io` (moves) only; `app`, `retention` read them.
- `audit.payloads`: isolation plus `p_select to app, worker, cell_io, retention`,
  `p_insert to app, worker, cell_io`,
  `create policy p_erase_delete on audit.payloads for delete to retention using (app.erasure_approved(tenant_id, subject_user_id))`;
  grants SELECT, INSERT to `app, worker, cell_io`, SELECT, DELETE to
  `retention`.

The `site` role reads only the rows marked above and the website spec's
published tables; it has no grant on documents, users or any table with
personal data. The `integration` role reads only the tables marked
"integration read" and the standards spec's own tables, sets the
`demographics` purpose only for the demographics resource of a client whose
scope includes it, and inserts audit rows.

`DELETE` allowlist, which the CI check enforces: `retention` on
`core.sessions`, `core.auth_attempts`, `core.idempotency_keys`,
`core.external_ids`, `core.contact_points`, `core.relationship_restrictions`,
`core.login_identities`, `core.passkeys`, `core.devices`, `core.files`,
`core.file_subjects`, `core.user_preferences`, `core.saved_views`,
`core.activity_events`, `health.records` and `audit.payloads`. Nobody else,
on anything.

## 6. Foundation tables

The SQL blocks in this section and in section 4.4, applied in document order
after the roles in section 4.2 and followed by the profiles in section 5, are
the target DDL ([P]). Drizzle declares what it can; the rest goes in custom
migrations (section 9).

### 6.1 Tenancy and organisation

```sql
set role cell_owner;

create table core.tenants (
  tenant_id uuid primary key,
  kind text not null check (kind in ('school_group', 'school')),
  root_org_id uuid not null,
  name_en text check (char_length(name_en) between 1 and 160),
  name_ar text check (char_length(name_ar) between 1 and 160),
  default_locale text not null default 'ar' check (default_locale in ('ar', 'en')),
  jurisdictions text[] not null
    check (array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  constraint tenants_name_check check (num_nonnulls(name_en, name_ar) >= 1)
);

create table core.orgs (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  type text not null check (type in ('school_group', 'school', 'department')),
  parent_id uuid,
  parent_type text,
  name_en text check (char_length(name_en) between 1 and 160),
  name_ar text check (char_length(name_ar) between 1 and 160),
  identifier text check (char_length(identifier) between 1 and 64),
  time_zone text check (char_length(time_zone) between 1 and 64),
  default_locale text check (default_locale in ('ar', 'en')),
  week_start smallint not null default 7 check (week_start between 1 and 7),
  weekend_days smallint[] not null default '{5,6}' check (weekend_days <@ '{1,2,3,4,5,6,7}'),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  address jsonb check (jsonb_typeof(address) = 'object'),
  phone text check (char_length(phone) between 1 and 40),
  email text check (char_length(email) between 3 and 254),
  website_url text check (char_length(website_url) between 1 and 2048),
  logo_file_id uuid,
  lifecycle text not null default 'active' check (lifecycle in ('importing', 'active')),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, id, type),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, parent_id, parent_type) references core.orgs (tenant_id, id, type),
  constraint orgs_name_check check (num_nonnulls(name_en, name_ar) >= 1),
  constraint orgs_parent_pair_check check ((parent_id is null) = (parent_type is null)),
  constraint orgs_hierarchy_check check (
    (type = 'school_group' and parent_id is null)
    or (type = 'school' and (parent_type is null or parent_type = 'school_group'))
    or (type = 'department' and parent_type in ('school', 'school_group'))),
  constraint orgs_school_time_zone_check check (type <> 'school' or time_zone is not null)
);
create unique index orgs_root_key on core.orgs (tenant_id) where parent_id is null and status = 'active';
create unique index orgs_identifier_key on core.orgs (tenant_id, identifier)
  where status = 'active' and identifier is not null;
create index orgs_parent_idx on core.orgs (tenant_id, parent_id);
create index orgs_delta_idx on core.orgs (tenant_id, date_last_modified);

alter table core.tenants add foreign key (tenant_id, root_org_id)
  references core.orgs (tenant_id, id) deferrable initially deferred;

create table core.org_features (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{1,39}$'),
  enabled boolean not null,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id)
);
create unique index org_features_key on core.org_features (tenant_id, org_id, feature) where status = 'active';
```

- `core.tenants` is keyed by `tenant_id` and has no `id`. Its root org is
  inserted in the same transaction, hence the deferred key. The API may change
  only its names, default locale and metadata; kind, jurisdictions and root are
  provisioning facts (section 5).
- `orgs.identifier` is OneRoster `Org.identifier`: the ministry or national
  school code where one exists.
- `orgs.address` is `{"lines": [text], "city": text, "region": text,
"postal_code": text, "country": "EG"}`; OneRoster exports it as
  `metadata.address1` and so on ([R1] section 1). It is the school's public
  address, not personal data.
- `orgs.default_locale` is the school's language for notices and exports;
  null means the tenant's.
- `orgs.lifecycle` is `importing` while a school joining a live group is
  loaded (section 10.1). Relationship functions, search and the OneRoster
  provider exclude such an org and everything scoped to it until the flip.
- `school_group` exports as OneRoster org type `district`; `school` and
  `department` export as themselves.
- The tree is enforced by the type-pinning foreign key and
  `orgs_hierarchy_check`: groups are roots, schools sit under a group or are
  roots, departments sit under a school or group. One active root per tenant.
  A school's type and place in the tree change only through provisioning.
- **Feature switches** (Settings, Features) are `core.org_features`. A feature
  is on at a school when the nearest row on the path from the school to the
  root says so, and otherwise takes the default from the feature catalogue in
  `packages/domain`. Navigation reads them for every role.
- Other school settings (attendance rules, messaging permissions, office
  hours) live in the tables of the systems that own them, not in a jsonb bag
  here.

### 6.2 Descriptors

Ed-Fi's descriptor pattern (namespace, code value, short and long
description, effective dates, prior descriptor, mapping) with English and
Arabic labels, a fixed system meaning and stored standards mappings, which
Ed-Fi does not have ([R1] section 3.7 and section 5 item 11).

```sql
create table core.descriptors (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  namespace text not null check (namespace ~ '^[a-z][a-z0-9_]{1,62}$'),
  code_value text not null check (char_length(code_value) between 1 and 50 and strpos(code_value, '#') = 0),
  label_en text check (char_length(label_en) between 1 and 75),
  label_ar text check (char_length(label_ar) between 1 and 75),
  description_en text check (char_length(description_en) between 1 and 500),
  description_ar text check (char_length(description_ar) between 1 and 500),
  system_meaning text check (system_meaning ~ '^[a-z][a-z0-9_]{0,62}$'),
  org_id uuid,
  sort_order integer not null default 0,
  color text check (color ~ '^#[0-9a-f]{6}$'),
  icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  effective_during daterange not null default '(,)',
  prior_descriptor_id uuid,
  oneroster_token text check (oneroster_token ~ '^(ext:)?[A-Za-z0-9._-]{1,60}$'),
  edfi_uri text check (char_length(edfi_uri) between 1 and 306),
  seeded boolean not null default false,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, id, namespace),
  unique (tenant_id, id, namespace, system_meaning),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, prior_descriptor_id, namespace) references core.descriptors (tenant_id, id, namespace),
  constraint descriptors_label_check check (num_nonnulls(label_en, label_ar) >= 1),
  constraint descriptors_seeded_meaning_check check (not seeded or (system_meaning is not null and org_id is null)),
  constraint descriptors_seeded_status_check check (not (seeded and status = 'tobedeleted')),
  constraint descriptors_relation_token_check check (namespace <> 'relation'
    or oneroster_token is not distinct from (case system_meaning
      when 'mother' then 'parent' when 'father' then 'parent' when 'guardian' then 'guardian'
      when 'step_parent' then 'relative' when 'grandparent' then 'relative'
      when 'sibling' then 'relative' when 'other_relative' then 'relative' end))
);
create unique index descriptors_code_key on core.descriptors (tenant_id, namespace, org_id, code_value)
  nulls not distinct where status = 'active';
create index descriptors_namespace_idx on core.descriptors (tenant_id, namespace, sort_order);

create table core.descriptor_overrides (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  descriptor_id uuid not null,
  org_id uuid not null,
  label_en text check (char_length(label_en) between 1 and 75),
  label_ar text check (char_length(label_ar) between 1 and 75),
  description_en text check (char_length(description_en) between 1 and 500),
  description_ar text check (char_length(description_ar) between 1 and 500),
  sort_order integer,
  color text check (color ~ '^#[0-9a-f]{6}$'),
  icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  effective_during daterange,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, descriptor_id) references core.descriptors (tenant_id, id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  constraint descriptor_overrides_content_check check (num_nonnulls(label_en, label_ar, description_en,
    description_ar, sort_order, color, icon, effective_during) >= 1)
);
create unique index descriptor_overrides_key on core.descriptor_overrides (tenant_id, descriptor_id, org_id)
  where status = 'active';
```

Rules:

- **Seeds are copied into every tenant at provisioning**, not shared under a
  nil tenant, so the isolation policy stays uniform, foreign keys stay
  composite and schools can relabel values ([R2] section 4). The seed catalogue
  is code (`packages/domain/src/descriptors/`), versioned; a later release
  that adds a seed value adds it to every tenant with a per-tenant job, never
  in a migration (migrations have no tenant context).
- A school may relabel, recolour, reorder and retire a seeded value
  (`effective_during` ends it; it stays valid on old rows) but not change its
  code, meaning or mappings, and not tombstone it.
- **Per-school presentation.** In a group, a school relabels, recolours,
  reorders or retires a tenant-wide value for itself with a
  `descriptor_overrides` row at its org; a national school's "الصف الثاني
  الإعدادي" and an international school's "Year 8" are one `grade_8` value.
  A reader resolves each field from the override at the nearest org on the path
  from the school to the root, then from the descriptor.
- A school may add values to namespaces marked "open" below, tenant-wide or
  for one school (`org_id`). Each needs a `system_meaning` from the
  namespace's fixed list when the namespace says "meaning required", so
  behaviour keys off the meaning ([R1] section 5 item 11).
- Codes are unique per namespace and org, with null (every school) as a value.
  A school value may not reuse a tenant-wide code of the same namespace, nor
  the reverse: the descriptor service takes `app.lock('descriptor:' ||
namespace)` and checks before inserting, and a nightly check reports any
  shadowing.
- `code_value` never contains `#`, because the Ed-Fi wire form is
  `uri://{namespace}/{Name}Descriptor#{CodeValue}` ([R1] section 3.7).
- `edfi_uri` is the full Ed-Fi descriptor URI a value exports as; values with
  none export by `system_meaning` mapping or not at all. `oneroster_token` is
  the vocabulary token where a OneRoster field takes one; school-added values
  export as `ext:<code_value>` when the namespace maps to an extensible
  OneRoster vocabulary. In `relation` the token follows from the meaning and a
  check fixes it, so a school-added relation always yields a valid role or
  none.
- `org_id` limits a value to one school; null means every school.

**Namespaces seeded by the foundation.** "Open" means schools may add values.

`relation` (open, meaning required). Ed-Fi `RelationDescriptor`; OneRoster
role of the related person: parent is "mother or father", guardian "NOT the
mother or father", relative otherwise ([R1] section 1, OneRoster RoleEnum).
Non-relatives and unrecorded relations are never exported as OneRoster agents.

| code                     | en                       | ar                    | meaning        | OneRoster | Ed-Fi code value       |
| ------------------------ | ------------------------ | --------------------- | -------------- | --------- | ---------------------- |
| mother                   | Mother                   | الأم                  | mother         | parent    | Mother                 |
| father                   | Father                   | الأب                  | father         | parent    | Father                 |
| stepmother               | Stepmother               | زوجة الأب             | step_parent    | relative  | Mother, step           |
| stepfather               | Stepfather               | زوج الأم              | step_parent    | relative  | Father, step           |
| legal_guardian           | Legal guardian           | الوصي الشرعي          | guardian       | guardian  | Guardian               |
| court_appointed_guardian | Court-appointed guardian | وصي بحكم المحكمة      | guardian       | guardian  | CourtAppointedGuardian |
| foster_parent            | Foster parent            | الأسرة الحاضنة        | guardian       | guardian  | Foster parent          |
| grandfather              | Grandfather              | الجد                  | grandparent    | relative  | Grandfather            |
| grandmother              | Grandmother              | الجدة                 | grandparent    | relative  | Grandmother            |
| paternal_uncle           | Paternal uncle           | العم                  | other_relative | relative  | Uncle                  |
| maternal_uncle           | Maternal uncle           | الخال                 | other_relative | relative  | Uncle                  |
| paternal_aunt            | Paternal aunt            | العمة                 | other_relative | relative  | Aunt                   |
| maternal_aunt            | Maternal aunt            | الخالة                | other_relative | relative  | Aunt                   |
| brother                  | Brother                  | الأخ                  | sibling        | relative  | Brother                |
| sister                   | Sister                   | الأخت                 | sibling        | relative  | Sister                 |
| other_relative           | Other relative           | قريب آخر              | other_relative | relative  | Relative               |
| family_friend            | Family friend            | صديق العائلة          | non_relative   | (none)    | Friend                 |
| driver                   | Driver                   | السائق                | non_relative   | (none)    | Other                  |
| nanny                    | Nanny                    | المربية               | non_relative   | (none)    | Other                  |
| other                    | Other                    | أخرى                  | non_relative   | (none)    | Other                  |
| unspecified              | Relation not recorded    | صلة القرابة غير مسجلة | unspecified    | (none)    | Unknown                |

Meanings: `mother`, `father`, `step_parent`, `guardian`, `grandparent`,
`sibling`, `other_relative`, `non_relative`, `unspecified`. `unspecified`
exists for imported links whose relation was a default rather than a finding
(section 10.3); it is queued for the registrar and exported to neither
standard's role vocabulary until someone records the real relation.

`sex` (closed). OneRoster `sex`, Ed-Fi `SexDescriptor`.

| code         | en           | ar       | meaning      | OneRoster   | Ed-Fi code value |
| ------------ | ------------ | -------- | ------------ | ----------- | ---------------- |
| female       | Female       | أنثى     | female       | female      | Female           |
| male         | Male         | ذكر      | male         | male        | Male             |
| not_selected | Not recorded | غير مسجل | not_selected | unspecified | Not Selected     |

`grade_level` (open, meaning required). OneRoster `grades` take CEDS Entry
Grade Level codes (IT, PR, PK, TK, KG, 01 to 13, PS for postsecondary, UG,
Other), the vocabulary OneRoster consumers apply; gate 3 checks every seeded
token against that list. Ed-Fi `GradeLevelDescriptor`. Labels are generic
ordinals; an Egyptian school relabels grades 7 to 9 as the preparatory years
and 10 to 12 as the secondary years, which changes labels only. The young
student profile (K-2) derives from the meaning of the student's current grade
(section 6.8).

| code     | en       | ar              | meaning  | OneRoster | Ed-Fi code value |
| -------- | -------- | --------------- | -------- | --------- | ---------------- |
| pre_kg   | Pre-KG   | ما قبل الروضة   | pre_kg   | PR        | Preschool        |
| kg1      | KG1      | الروضة الأولى   | kg1      | PK        | Prekindergarten  |
| kg2      | KG2      | الروضة الثانية  | kg2      | KG        | Kindergarten     |
| grade_1  | Grade 1  | الصف الأول      | grade_1  | 01        | First grade      |
| grade_2  | Grade 2  | الصف الثاني     | grade_2  | 02        | Second grade     |
| grade_3  | Grade 3  | الصف الثالث     | grade_3  | 03        | Third grade      |
| grade_4  | Grade 4  | الصف الرابع     | grade_4  | 04        | Fourth grade     |
| grade_5  | Grade 5  | الصف الخامس     | grade_5  | 05        | Fifth grade      |
| grade_6  | Grade 6  | الصف السادس     | grade_6  | 06        | Sixth grade      |
| grade_7  | Grade 7  | الصف السابع     | grade_7  | 07        | Seventh grade    |
| grade_8  | Grade 8  | الصف الثامن     | grade_8  | 08        | Eighth grade     |
| grade_9  | Grade 9  | الصف التاسع     | grade_9  | 09        | Ninth grade      |
| grade_10 | Grade 10 | الصف العاشر     | grade_10 | 10        | Tenth grade      |
| grade_11 | Grade 11 | الصف الحادي عشر | grade_11 | 11        | Eleventh grade   |
| grade_12 | Grade 12 | الصف الثاني عشر | grade_12 | 12        | Twelfth grade    |

`calendar_event` (open, meaning required). Ed-Fi `CalendarEventDescriptor`.
Instructional meanings: `instructional_day`, `make_up_day`,
`early_dismissal`, `exam_day`; every other meaning is non-instructional.

| code              | en                     | ar                 | meaning                 | Ed-Fi code value                     |
| ----------------- | ---------------------- | ------------------ | ----------------------- | ------------------------------------ |
| instructional_day | School day             | يوم دراسي          | instructional_day       | Instructional day                    |
| exam_day          | Exam day               | يوم امتحانات       | exam_day                | Instructional day                    |
| early_dismissal   | Early dismissal        | انصراف مبكر        | early_dismissal         | Student late arrival/early dismissal |
| make_up_day       | Make-up day            | يوم تعويضي         | make_up_day             | Make-up day                          |
| weekend           | Weekend                | عطلة نهاية الأسبوع | weekend                 | Non-instructional day                |
| public_holiday    | Public holiday         | عطلة رسمية         | holiday                 | Holiday                              |
| school_holiday    | School holiday         | إجازة مدرسية       | school_holiday          | Non-instructional day                |
| teacher_only_day  | Staff day, no students | يوم للمعلمين فقط   | teacher_only_day        | Teacher only day                     |
| weather_closure   | Weather closure        | تعطيل بسبب الطقس   | weather_closure         | Weather day                          |
| emergency_closure | Emergency closure      | تعطيل طارئ         | emergency_closure       | Emergency day                        |
| other             | Other non-school day   | يوم آخر بلا دراسة  | other_non_instructional | Other                                |

`external_id_system` (open, meaning required). OneRoster `userIds[].type` is
free vocabulary with recommended values (IG 6.1.3.1). Ed-Fi has three
identification-system namespaces with different code lists, so a value maps
by the person it belongs to: `edfi_uri` holds the
`StudentIdentificationSystemDescriptor` URI, and staff and contact exports
take `StaffIdentificationSystemDescriptor` and
`ContactIdentificationSystemDescriptor` from the last column by meaning.
Meanings `national_id`, `passport`, `residence_permit` and
`birth_certificate` are identity documents: their values are stored sealed
(section 6.7).

| code              | en                                | ar                              | meaning           | OneRoster type  | Ed-Fi student  | Ed-Fi staff and contact |
| ----------------- | --------------------------------- | ------------------------------- | ----------------- | --------------- | -------------- | ----------------------- |
| school_reference  | School reference                  | الرقم المرجعي في المدرسة        | school_reference  | LocalID         | School         | School                  |
| ministry_id       | Ministry number                   | الرقم في الوزارة                | ministry_id       | StateID         | State          | State                   |
| national_id       | National ID number                | رقم الهوية الوطنية              | national_id       | NationalID      | Other          | Other                   |
| passport          | Passport number                   | رقم جواز السفر                  | passport          | Passport        | Other          | Other                   |
| sis_id            | Student information system number | الرقم في نظام معلومات الطلاب    | sis_id            | SISNumber       | Local          | District                |
| roster_sourced_id | Upstream roster ID                | المعرف في قائمة الطلاب الخارجية | roster_sourced_id | SISID           | (not exported) | (not exported)          |
| legacy_id         | Previous system ID                | المعرف في النظام السابق         | legacy_id         | LegacySourcedID | Other          | Other                   |

`roster_sourced_id` is the sourcedId the school's SIS gave the person. It is
served as `SISID`, and an LTI launch sends it as `lis.person_sourcedid` when
present, as OneRoster IG 6.1.3 asks.

`school_entry_type` (open, meaning required). Ed-Fi `EntryTypeDescriptor`.

| code                  | en                           | ar                      | meaning               | Ed-Fi code value        |
| --------------------- | ---------------------------- | ----------------------- | --------------------- | ----------------------- |
| first_enrolment       | First school enrolment       | أول التحاق بالتعليم     | first_enrolment       | New to education system |
| transfer_in           | Transfer from another school | انتقال من مدرسة أخرى    | transfer_in           | Transfer                |
| transfer_within_group | Transfer within the group    | انتقال داخل المجموعة    | transfer_within_group | Transfer                |
| continuing            | Continuing from last year    | استمرار من العام السابق | continuing            | Next year school        |
| re_entry              | Returning after leaving      | عودة بعد انقطاع         | re_entry              | Re-entry                |
| other                 | Other                        | أخرى                    | other                 | Other                   |

`school_exit_type` (open, meaning required). Ed-Fi
`ExitWithdrawTypeDescriptor`. A school year that ends with no exit (the
student continues) exports as `End of school year`.

| code                  | en                            | ar                    | meaning               | Ed-Fi code value |
| --------------------- | ----------------------------- | --------------------- | --------------------- | ---------------- |
| graduated             | Graduated                     | تخرّج                 | graduated             | Graduated        |
| transfer_out          | Transferred to another school | انتقال إلى مدرسة أخرى | transfer_out          | Transferred      |
| transfer_within_group | Transferred within the group  | انتقال داخل المجموعة  | transfer_within_group | Transferred      |
| withdrawn             | Withdrawn                     | انسحاب                | withdrawn             | Withdrawn        |
| expelled              | Expelled                      | فصل                   | expelled              | Expelled         |
| no_show               | Did not attend                | لم يلتحق              | no_show               | No show          |
| other                 | Other                         | أخرى                  | other                 | Other            |

`staff_position` (open). Display only; Ed-Fi `StaffClassificationDescriptor`.

| code                 | en                   | ar             | Ed-Fi code value                    |
| -------------------- | -------------------- | -------------- | ----------------------------------- |
| teacher              | Teacher              | معلم           | Teacher                             |
| assistant_teacher    | Assistant teacher    | معلم مساعد     | Instructional Aide                  |
| principal            | Principal            | مدير المدرسة   | Principal                           |
| vice_principal       | Vice principal       | وكيل المدرسة   | Assistant Principal                 |
| counselor            | Counselor            | مرشد طلابي     | Counselor                           |
| social_worker        | Social worker        | أخصائي اجتماعي | Social Workers                      |
| psychologist         | School psychologist  | أخصائي نفسي    | School Psychologist                 |
| nurse                | School nurse         | ممرض المدرسة   | Health Specialists                  |
| librarian            | Librarian            | أمين المكتبة   | Librarian/Media Specialist          |
| administrative_staff | Administrative staff | موظف إداري     | School Administrative Support Staff |
| other                | Other                | أخرى           | Other                               |

`religion` (closed). No standard mapping; never exported. Sensitive in Egypt,
Saudi Arabia and the UAE [R3]; Egyptian schools record it to allocate religion
classes. It lives behind the demographics purpose (section 6.7).

| code          | en            | ar            |
| ------------- | ------------- | ------------- |
| islam         | Islam         | الإسلام       |
| christianity  | Christianity  | المسيحية      |
| other         | Other         | أخرى          |
| not_disclosed | Not disclosed | لم يُفصح عنها |

`health_record_kind` (open, meaning required). Never exported.

| code                | en                  | ar             | meaning             |
| ------------------- | ------------------- | -------------- | ------------------- |
| blood_group         | Blood group         | فصيلة الدم     | blood_group         |
| allergy             | Allergy             | حساسية         | allergy             |
| chronic_condition   | Chronic condition   | مرض مزمن       | chronic_condition   |
| medication          | Regular medication  | دواء منتظم     | medication          |
| dietary_requirement | Dietary requirement | نظام غذائي خاص | dietary_requirement |
| injury              | Past injury         | إصابة سابقة    | injury              |
| surgery             | Surgery             | عملية جراحية   | surgery             |
| immunisation        | Immunisation        | تطعيم          | immunisation        |
| medical_report      | Medical report      | تقرير طبي      | medical_report      |
| other               | Other               | أخرى           | other               |

`consent_purpose` (open, meaning required). One purpose per row, never
bundled (Saudi Implementing Regulation Art. 11, COPPA §312.5(a)(2), [R3]).
Registering an external tool adds a value with meaning `external_tool` and
code `tool_<registration id>`.

| code                              | en                                        | ar                                            | meaning               |
| --------------------------------- | ----------------------------------------- | --------------------------------------------- | --------------------- |
| photo_school_website              | Photos on the school website              | نشر الصور على موقع المدرسة                    | photo_website         |
| photo_social_media                | Photos on the school's social media       | نشر الصور على حسابات المدرسة في وسائل التواصل | photo_social          |
| photo_school_news                 | Photos in school news                     | الصور في أخبار المدرسة                        | photo_internal        |
| share_contact_with_class_families | Share contact details with class families | مشاركة بيانات التواصل مع أسر الفصل            | directory_sharing     |
| administer_medicine               | Give medicine at school                   | إعطاء الدواء في المدرسة                       | administer_medicine   |
| voice_recording                   | Voice recordings in lessons               | التسجيلات الصوتية في الدروس                   | voice_recording       |
| child_data_processing             | Processing the child's school records     | معالجة السجلات المدرسية للطفل                 | child_data_processing |

**Namespaces other specs own**, reserved here so names do not collide:
`subject` (teaching; legacy `subjects` map here, section 10.3),
`classroom_position`, `course_level`, `attendance_category`,
`attendance_reason`, `grade_type`, `event_category`, `announcement_category`,
`site_post_category` (website; legacy `site_post_categories` map here).

### 6.3 Academic calendar

Academic sessions follow OneRoster's session tree (school year, semester or
term, grading period; parent; exclusive end) because the OneRoster provider
serves it; calendar dates, academic weeks and class periods come from Ed-Fi,
which OneRoster lacks ([R1] section 5 item 6). They are foundation because
attendance, the timetable, coursework ("due next lesson"), the calendar, the
family home ("now and next") and rollover all read them.

```sql
create table core.academic_sessions (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  org_type text not null default 'school' check (org_type = 'school'),
  type text not null check (type in ('school_year', 'semester', 'term', 'grading_period')),
  parent_id uuid,
  parent_type text,
  school_year_id uuid not null,
  title_en text check (char_length(title_en) between 1 and 80),
  title_ar text check (char_length(title_ar) between 1 and 80),
  span daterange not null,
  school_year smallint not null check (school_year between 2000 and 2200),
  lifecycle text check (lifecycle in ('upcoming', 'current', 'closed')),
  sequence smallint not null default 1 check (sequence between 1 and 99),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, id, type, school_year_id, org_id),
  unique (tenant_id, id, type, school_year_id, org_id, school_year),
  unique (tenant_id, id, span without overlaps),
  unique (tenant_id, id, type, span without overlaps),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id, org_type) references core.orgs (tenant_id, id, type),
  foreign key (tenant_id, parent_id, parent_type, school_year_id, org_id, school_year)
    references core.academic_sessions (tenant_id, id, type, school_year_id, org_id, school_year),
  foreign key (tenant_id, parent_id, parent_type, period span)
    references core.academic_sessions (tenant_id, id, type, period span),
  constraint academic_sessions_title_check check (num_nonnulls(title_en, title_ar) >= 1),
  constraint academic_sessions_span_check check (
    not isempty(span) and not lower_inf(span) and not upper_inf(span)
    and lower_inc(span) and not upper_inc(span)),
  constraint academic_sessions_parent_pair_check check ((parent_id is null) = (parent_type is null)),
  constraint academic_sessions_tree_check check (
    (type = 'school_year' and parent_id is null and school_year_id = id)
    or (type = 'semester' and parent_type = 'school_year')
    or (type = 'term' and parent_type in ('school_year', 'semester'))
    or (type = 'grading_period' and parent_type in ('school_year', 'semester', 'term'))),
  constraint academic_sessions_year_end_check check (
    type <> 'school_year' or school_year = extract(year from upper(span) - 1)),
  constraint academic_sessions_lifecycle_type_check check ((type = 'school_year') = (lifecycle is not null)),
  constraint academic_sessions_year_excl exclude using gist
    (tenant_id with =, org_id with =, span with &&) where (type = 'school_year' and status = 'active'),
  constraint academic_sessions_sibling_excl exclude using gist
    (tenant_id with =, parent_id with =, type with =, span with &&) where (parent_id is not null and status = 'active')
);
create unique index academic_sessions_current_key on core.academic_sessions (tenant_id, org_id)
  where type = 'school_year' and lifecycle = 'current' and status = 'active';
create index academic_sessions_year_idx on core.academic_sessions (tenant_id, school_year_id, type);
create index academic_sessions_delta_idx on core.academic_sessions (tenant_id, date_last_modified);
```

- One tree per school per year: the year is the root (`school_year_id = id`);
  semesters sit under the year; terms under the year or a semester (school
  year, semesters, quarters, as American-curriculum schools run it); grading
  periods under a term, a semester or the year. OneRoster allows each of
  these. The six-column foreign key keeps a child in its parent's school,
  year and `school_year`; the typed `PERIOD` key keeps it inside the parent's
  dates.
- `school_year` is the calendar year in which the school year ends, OneRoster's
  `schoolYear` and Ed-Fi's `SchoolYear` ([R1]). A check ties the root's value
  to `upper(span) - 1`, and the foreign key carries it down, so a term cannot
  export a different `schoolYear` from its year's.
- Years of one school never overlap; siblings of one type under one parent
  never overlap; adjacent spans are allowed.
- `lifecycle` is the product's Upcoming, Current, Closed (product spec,
  School year). One current year per school; making a year current is its own
  step. A closed year is read-only: every system's write path checks the
  year's lifecycle, the collaboration server included (section 7.6), and the
  school-year spec owns reopening.
- `sequence` orders siblings for display and for Ed-Fi term mapping.
- `semester` and `term` are both kept because OneRoster distinguishes them.
- Enrollments and other dated rows in other specs reference sessions with
  `PERIOD` foreign keys to `(tenant_id, id, span)`, or to
  `(tenant_id, id, type, span)` when the type matters. Such a range must be
  bounded: an open-ended `[x,)` is rejected against a bounded session, so a
  dated row ends at the earlier of its own end and its session's ([R2]
  section 5, probe).

```sql
create table core.calendars (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  school_year_id uuid not null,
  school_year_type text not null default 'school_year' check (school_year_type = 'school_year'),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,60}$'),
  kind text not null check (kind in ('school', 'grade_level', 'staff')),
  title_en text check (char_length(title_en) between 1 and 80),
  title_ar text check (char_length(title_ar) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, id, school_year_id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, school_year_id, school_year_type, school_year_id, org_id)
    references core.academic_sessions (tenant_id, id, type, school_year_id, org_id),
  constraint calendars_title_check check (num_nonnulls(title_en, title_ar) >= 1)
);
create unique index calendars_code_key on core.calendars (tenant_id, school_year_id, code) where status = 'active';
create unique index calendars_school_key on core.calendars (tenant_id, school_year_id)
  where kind = 'school' and status = 'active';

create table core.calendar_grade_levels (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  calendar_id uuid not null,
  grade_level_descriptor_id uuid not null,
  grade_level_ns text not null generated always as ('grade_level') stored,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, calendar_id) references core.calendars (tenant_id, id),
  foreign key (tenant_id, grade_level_descriptor_id, grade_level_ns)
    references core.descriptors (tenant_id, id, namespace)
);
create unique index calendar_grade_levels_key on core.calendar_grade_levels
  (tenant_id, calendar_id, grade_level_descriptor_id) where status = 'active';

create table core.calendar_dates (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  calendar_id uuid not null,
  school_year_id uuid not null,
  school_year_type text not null default 'school_year' check (school_year_type = 'school_year'),
  day_on date not null,
  span daterange not null generated always as (daterange(day_on, day_on + 1, '[)')) stored,
  event_descriptor_id uuid not null,
  event_ns text not null generated always as ('calendar_event') stored,
  note_en text check (char_length(note_en) between 1 and 200),
  note_ar text check (char_length(note_ar) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, calendar_id, school_year_id) references core.calendars (tenant_id, id, school_year_id),
  foreign key (tenant_id, school_year_id, school_year_type, period span)
    references core.academic_sessions (tenant_id, id, type, period span),
  foreign key (tenant_id, event_descriptor_id, event_ns) references core.descriptors (tenant_id, id, namespace)
);
create unique index calendar_dates_day_key on core.calendar_dates (tenant_id, calendar_id, day_on)
  where status = 'active';
```

- Calendars follow Ed-Fi: one annual calendar per school year, enumerative,
  and grade-level calendars as separate calendars listing their grades
  ([R1] section 3.4). A school has exactly one `school` calendar per year;
  `grade_level` calendars apply to their grades instead of it; `staff`
  calendars carry staff-only days.
- **Which calendar applies to a student** on a date: the calendar named on
  their school year (section 6.8), else the grade-level calendar listing their
  grade, else the school calendar.
- Ed-Fi advises that a school with grade-level calendars "SHOULD NOT" also
  keep an overall calendar of exceptions, so the Ed-Fi export sends the
  `school` calendar as one more grade-level calendar listing the grades no
  other calendar covers.
- **Enumerative means every date.** Each calendar has exactly one active row
  for every date in its year's span, weekends included (meaning `weekend`).
  Nothing downstream computes weekdays or holidays: "is the school open on
  d" is one indexed lookup. The year-setup tool generates the rows from the
  weekend days and holiday ranges; changing weekend days mid-year regenerates
  rows from a date forward. A nightly per-tenant check reports calendars whose
  active row count differs from the span's length.
- Ed-Fi allows several events on one date; the product needs one kind of day,
  so a date has one event and an optional note. Calendar events people attend
  (trips, meetings) are the communication spec's `calendar_events`.

```sql
create table core.academic_weeks (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  school_year_id uuid not null,
  school_year_type text not null default 'school_year' check (school_year_type = 'school_year'),
  number smallint not null check (number between 1 and 60),
  span daterange not null,
  label_en text check (char_length(label_en) between 1 and 40),
  label_ar text check (char_length(label_ar) between 1 and 40),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, school_year_id, school_year_type, period span)
    references core.academic_sessions (tenant_id, id, type, period span),
  constraint academic_weeks_span_check check (
    not isempty(span) and not lower_inf(span) and not upper_inf(span)
    and lower_inc(span) and not upper_inc(span) and upper(span) - lower(span) <= 7),
  constraint academic_weeks_excl exclude using gist
    (tenant_id with =, school_year_id with =, span with &&) where (status = 'active')
);
create unique index academic_weeks_number_key on core.academic_weeks (tenant_id, school_year_id, number)
  where status = 'active';

create table core.class_periods (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  school_year_id uuid not null,
  school_year_type text not null default 'school_year' check (school_year_type = 'school_year'),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name_en text check (char_length(name_en) between 1 and 60),
  name_ar text check (char_length(name_ar) between 1 and 60),
  sequence smallint not null check (sequence between 1 and 50),
  kind text not null default 'lesson' check (kind in ('lesson', 'registration', 'break', 'other')),
  start_time time,
  end_time time,
  official_attendance boolean not null default false,
  valid_during daterange not null,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, school_year_id, school_year_type, school_year_id, org_id)
    references core.academic_sessions (tenant_id, id, type, school_year_id, org_id),
  foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
    references core.academic_sessions (tenant_id, id, type, period span),
  constraint class_periods_name_check check (num_nonnulls(name_en, name_ar) >= 1),
  constraint class_periods_times_check check (
    (start_time is null) = (end_time is null) and (end_time is null or end_time > start_time)),
  constraint class_periods_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and not upper_inf(valid_during)
    and lower_inc(valid_during) and not upper_inc(valid_during)),
  constraint class_periods_code_excl exclude using gist
    (tenant_id with =, org_id with =, school_year_id with =, code with =, valid_during with &&)
    where (status = 'active'),
  constraint class_periods_sequence_excl exclude using gist
    (tenant_id with =, org_id with =, school_year_id with =, sequence with =, valid_during with &&)
    where (status = 'active')
);
```

- Academic weeks are Ed-Fi `AcademicWeek`: numbered teaching weeks inside the
  year, for week grouping in coursework and reports. The typed `PERIOD` key
  makes a week hang off a school year, not a term.
- Class periods are Ed-Fi `ClassPeriod`: the named slots of a school day for
  one year ("1", "2", "Break"), with default times. `official_attendance`
  marks the period whose register counts as daily attendance ([R1] section
  3.3). Rollover copies them to the next year, keeping their codes.
- **A period changed mid-year is ended, not deleted**: its `valid_during`
  ends on the change date and a new row with the same code starts there, so
  past registers keep pointing at the period they were taken in and nothing
  looks deleted to a delta reader. The administration research names
  "changing periods mid-year hides past attendance" as a pitfall. Codes and
  sequence numbers are unique among periods valid at the same time.
- **Ed-Fi export keys.** Ed-Fi keys `ClassPeriod` by school and
  `ClassPeriodName` and `AcademicWeek` by school and `WeekIdentifier`, neither
  by year. The export sends one `ClassPeriod` per school and code (codes are
  stable across years), and `WeekIdentifier` as `<school_year>-W<number>`, for
  example `2027-W01`.
- Per-day times (a short Thursday), bell schedules and rotation days belong
  to the timetable spec, which references these rows.

**Changing a school year's dates.** Foreign keys ignore `status` and no
runtime role may delete calendar rows, so a year that has its calendar could
never be shortened, and a mistyped end date could never be fixed. The one
path is a definer function. The caller first brings the year's active terms,
weeks, class periods and student school years inside the new dates, then calls
it in the same transaction:

```sql
create function app.change_year_span(p_year_id uuid, p_span daterange, p_expected_version integer)
returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  y record;
  removed integer;
begin
  perform app.lock('year:' || p_year_id::text);
  select s.tenant_id, s.id, s.org_id, s.span, s.lifecycle, s.version into y
  from core.academic_sessions s
  where s.tenant_id = app.tenant_id() and s.id = p_year_id and s.type = 'school_year' and s.status = 'active'
  for update;
  if not found then
    raise exception 'school year % not found', p_year_id using errcode = 'P0002';
  end if;
  if y.version <> p_expected_version then
    raise exception 'school year % has changed', p_year_id using errcode = 'F0412';
  end if;
  if y.lifecycle = 'closed' then
    raise exception 'school year % is closed', p_year_id using errcode = '55000';
  end if;
  if exists (select 1 from core.academic_sessions s where s.tenant_id = y.tenant_id
               and s.school_year_id = y.id and s.id <> y.id and s.status = 'active' and not p_span @> s.span)
     or exists (select 1 from core.academic_weeks w where w.tenant_id = y.tenant_id
               and w.school_year_id = y.id and w.status = 'active' and not p_span @> w.span)
     or exists (select 1 from core.class_periods p where p.tenant_id = y.tenant_id
               and p.school_year_id = y.id and p.status = 'active' and not p_span @> p.valid_during)
     or exists (select 1 from core.student_school_years r where r.tenant_id = y.tenant_id
               and r.school_year_id = y.id and r.status = 'active' and not p_span @> r.valid_during) then
    raise exception 'active rows of school year % fall outside %', p_year_id, p_span using errcode = '23514';
  end if;
  delete from core.calendar_dates d
  where d.tenant_id = y.tenant_id and d.school_year_id = y.id and not p_span @> d.day_on;
  get diagnostics removed = row_count;
  delete from core.academic_weeks w
  where w.tenant_id = y.tenant_id and w.school_year_id = y.id and w.status = 'tobedeleted' and not p_span @> w.span;
  delete from core.class_periods p
  where p.tenant_id = y.tenant_id and p.school_year_id = y.id and p.status = 'tobedeleted'
    and not p_span @> p.valid_during;
  delete from core.student_school_years r
  where r.tenant_id = y.tenant_id and r.school_year_id = y.id and r.status = 'tobedeleted'
    and not p_span @> r.valid_during;
  delete from core.academic_sessions s
  where s.tenant_id = y.tenant_id and s.school_year_id = y.id and s.id <> y.id and s.status = 'tobedeleted'
    and not p_span @> s.span;
  update core.academic_sessions set span = p_span where tenant_id = y.tenant_id and id = y.id;
  insert into audit.log (tenant_id, action, object_type, object_id, org_id, details)
  values (y.tenant_id, 'academic_session.span_change', 'academic_session', y.id, y.org_id,
          jsonb_build_object('from', y.span::text, 'to', p_span::text, 'removed_calendar_dates', removed));
  return removed;
end $$;
revoke all on function app.change_year_span(uuid, daterange, integer) from public;
grant execute on function app.change_year_span(uuid, daterange, integer) to app;
```

- It refuses a closed year and a stale version, and refuses while any active
  row still falls outside the new dates, so the caller decides what happens to
  real data. It then deletes only generated calendar dates outside the span
  and tombstoned rows outside it, updates the year and writes the audit row.
  A tombstoned row that another table still references makes the delete fail
  and the change is refused with that constraint's error.
- Lengthening a year removes nothing; the year-setup tool then generates the
  new dates.
- Other specs whose rows hold a `PERIOD` key to a school year add their tables
  to this function when they are specified.

### 6.4 Locations

Rooms, labs, halls and buildings: the class header's "next period and room",
the timetable's room view and room clashes, and a calendar event's place all
read them, so they are shared.

```sql
create table core.locations (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  org_type text not null default 'school' check (org_type = 'school'),
  parent_location_id uuid,
  kind text not null default 'room'
    check (kind in ('room', 'lab', 'hall', 'library', 'sports', 'outdoor', 'building', 'external', 'other')),
  code text check (char_length(code) between 1 and 32),
  name_en text check (char_length(name_en) between 1 and 80),
  name_ar text check (char_length(name_ar) between 1 and 80),
  capacity integer check (capacity > 0),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id, org_type) references core.orgs (tenant_id, id, type),
  foreign key (tenant_id, parent_location_id) references core.locations (tenant_id, id),
  constraint locations_name_check check (num_nonnulls(name_en, name_ar) >= 1)
);
create unique index locations_code_key on core.locations (tenant_id, org_id, code)
  where status = 'active' and code is not null;
```

- A location belongs to one school; a building groups rooms through
  `parent_location_id`. `external` is a place outside the school (a trip's
  venue).
- The timetable spec's room clash constraint references these rows; a
  calendar event's location is a reference or free text for one-off places.
- Legacy free-text rooms become locations per school (section 10.3).

### 6.5 Files

Uploaded objects and the facts the server verified about them, for every
system; where public copies of them are published; and which people a photo
shows.

```sql
create table core.files (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  uploaded_by_user_id uuid,
  host_type text check (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  host_id uuid,
  purpose text not null check (purpose in ('document_media', 'attachment', 'submission', 'avatar', 'logo',
    'site_media', 'health_report', 'legal_document', 'evidence', 'import_source', 'export')),
  name text not null check (char_length(name) between 1 and 255),
  media_type text not null check (char_length(media_type) between 3 and 128),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 bytea check (octet_length(sha256) = 32),
  state text not null default 'initiated' check (state in ('initiated', 'quarantined', 'ready', 'rejected')),
  rejection_reason text check (rejection_reason in ('too_large', 'size_mismatch', 'content_mismatch',
    'infected', 'scan_unavailable', 'abandoned')),
  storage_key text not null check (char_length(storage_key) between 1 and 512),
  encryption text not null default 'bucket' check (encryption in ('bucket', 'tenant_dek')),
  key_purpose text generated always as (case when encryption = 'tenant_dek' then 'files' end) stored,
  key_version integer,
  scanned_at timestamptz,
  scan_engine text check (char_length(scan_engine) between 1 and 60),
  ready_at timestamptz,
  linked_at timestamptz,
  width integer check (width > 0),
  height integer check (height > 0),
  duration_ms integer check (duration_ms > 0),
  derivatives jsonb not null default '{}' check (jsonb_typeof(derivatives) = 'object'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, id, purpose),
  foreign key (tenant_id) references core.tenants (tenant_id),
  constraint files_host_pair_check check ((host_type is null) = (host_id is null)),
  constraint files_rejection_check check ((state = 'rejected') = (rejection_reason is not null)),
  constraint files_ready_check check (state <> 'ready' or (sha256 is not null and ready_at is not null)),
  constraint files_key_check check ((encryption = 'tenant_dek') = (key_version is not null)),
  constraint files_storage_prefix_check check (starts_with(storage_key, 't/' || tenant_id::text || '/')),
  constraint files_derivatives_prefix_check check (not jsonb_path_exists(derivatives,
    '$.*.key ? (!(@ starts with $p))', jsonb_build_object('p', 't/' || tenant_id::text || '/'))),
  constraint files_health_report_check check (purpose <> 'health_report' or (
    derivatives = '{}' and name ~ '^medical-report(\.[a-z0-9]{1,8})?$'
    and (state <> 'ready' or encryption = 'tenant_dek')))
);
create index files_host_idx on core.files (tenant_id, host_type, host_id) where status = 'active';
create index files_state_idx on core.files (tenant_id, state, created_at) where status = 'active';
create index files_storage_key_idx on core.files (tenant_id, storage_key);

alter table core.orgs add foreign key (tenant_id, logo_file_id) references core.files (tenant_id, id);

create table core.file_publications (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  file_id uuid not null,
  file_purpose text not null check (file_purpose in ('site_media', 'logo', 'document_media')),
  derivative text check (derivative ~ '^[a-z0-9_]{1,40}$'),
  public_key text not null check (public_key ~ '^p/[a-z0-9]{26}/[A-Za-z0-9._-]{1,120}$'),
  host_type text not null check (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  host_id uuid not null,
  published_at timestamptz not null default statement_timestamp(),
  unpublished_at timestamptz,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, public_key),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, file_id, file_purpose) references core.files (tenant_id, id, purpose)
);
create index file_publications_file_idx on core.file_publications (tenant_id, file_id)
  where status = 'active' and unpublished_at is null;
create index file_publications_host_idx on core.file_publications (tenant_id, host_type, host_id)
  where status = 'active' and unpublished_at is null;

create table core.file_subjects (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  file_id uuid not null,
  user_id uuid not null,
  tagged_by_user_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, file_id) references core.files (tenant_id, id)
);
create unique index file_subjects_key on core.file_subjects (tenant_id, file_id, user_id) where status = 'active';
create index file_subjects_user_idx on core.file_subjects (tenant_id, user_id) where status = 'active';
```

- **Lifecycle** ([BA] section 7):
  1. The client asks for an upload. The API creates the row (`initiated`) and
     returns a presigned POST with `content-length-range` to the quarantine key.
  2. The client reports completion; the API enqueues the scan job, which sets
     the row `quarantined` and scans it (clamd or the provider's scanner).
  3. The scan sets `ready` with `sha256`, `scanned_at` and `ready_at`, or
     `rejected` with a reason.
  4. Derivatives (sharp, metadata stripped, EXIF rotation first) are listed in
     `derivatives` as
     `{"<name>": {"key": text, "media_type": text, "width": int, "height": int, "size": int}}`.

  Only `worker` and `cell_io` write `storage_key`, `state`, `sha256`, the scan
  and ready columns, `encryption`, `key_version` and `derivatives`; the API may
  set the host, `linked_at`, the display name, status and metadata (section 5).

- **Storage keys** are generated by the server, never accepted from a client:
  `t/<tenant_id>/q/<file_id>` in quarantine, `t/<tenant_id>/f/<file_id>` when
  ready, `t/<tenant_id>/h/<file_id>` for `tenant_dek` objects. The tenant prefix
  makes per-tenant export, restore and deletion a prefix operation, and the
  two prefix checks make it an invariant: no row, and no derivative, can name
  another tenant's object, whatever bug writes it. The URL signer asserts the
  prefix again before signing. One private bucket per cell.
- **Host.** `host_type` and `host_id` name the record the file belongs to. A
  file id never grants a download: every read re-checks the host
  (operations.md). Downloads are short-lived signed URLs on the files domain
  (section 3.3).
- **Linked** means `linked_at` is set. The API sets it when it gives the file a
  host, embeds it in a document (`core.document_files`, section 6.12), or points
  a photo or logo at it; the importer sets it on every file it brings in.
- A copy (duplicating a lesson) creates a new row that points at the same
  storage key; an object is deleted only when no active row references its
  key (`files_storage_key_idx`).
- Sweeps: `initiated` rows older than 24 hours become `rejected` with
  `abandoned`; `ready` rows with `linked_at` still null seven days after
  `ready_at` are tombstoned; rejected rows are kept 30 days for diagnosis.
- **Special-category files.** `health_report` files are `tenant_dek`
  encrypted, have no derivatives and carry a generic name
  (`medical-report.pdf`); the real name lives only in the health record's
  ciphertext. `health_report`, `evidence` and `legal_document` rows are behind a
  purpose gate: invisible and unwritable without `app.purpose` set to `health`
  (reports) or `custody` (evidence and legal documents), section 5. The upload
  goes through quarantine and scanning in plaintext, then the worker encrypts
  the object into the `h/` prefix, deletes the quarantine copy and verifies the
  deletion.
- **Publication.** A private file is never served publicly. When a website
  page, a post or a newsletter edition is published, the worker copies the
  derivatives it shows to the cell's public-media bucket under an unguessable
  `public_key` and records a `file_publications` row; the public-media domain
  serves them long-lived and cacheable, so an emailed newsletter's images
  still load months later. Unpublishing, tombstoning the host, or a consent
  withdrawal for a person the file shows sets `unpublished_at` and deletes the
  public object. Only `site_media`, `logo` and `document_media` files are
  publishable (the purpose pin).
- **Subjects.** `file_subjects` records which students a picture shows; whoever
  writes news or website pages names them from the picture itself (the
  editor's floating bar through `EditorMedia.people`, or a website section's
  picture control), which also shows each family's answer. Publishing checks that every tagged subject has
  a `granted` consent covering the school's today for the publication's
  purpose meaning (`photo_website` for the website, `photo_internal` for
  school news) in `core.current_consents`, and refuses otherwise; a website
  answer that turns to no unpublishes every public copy of their pictures at
  once. Erasure finds a child's photos here.
- `purpose` is fixed vocabulary; a system that needs a new purpose adds it to
  the check in a migration.

### 6.6 Tenant keys

```sql
create table core.tenant_keys (
  tenant_id uuid not null,
  purpose text not null check (purpose in ('health', 'identifiers', 'identifier_lookup', 'files')),
  key_version integer not null check (key_version > 0),
  kms_key_ref text not null check (char_length(kms_key_ref) between 1 and 512),
  wrapped_dek bytea not null check (octet_length(wrapped_dek) between 32 and 4096),
  created_at timestamptz not null default statement_timestamp(),
  retired_at timestamptz,
  destroyed_at timestamptz,
  primary key (tenant_id, purpose, key_version),
  foreign key (tenant_id) references core.tenants (tenant_id)
);
create unique index tenant_keys_active_key on core.tenant_keys (tenant_id, purpose) where retired_at is null;

alter table core.files add foreign key (tenant_id, key_purpose, key_version)
  references core.tenant_keys (tenant_id, purpose, key_version);
```

`core.tenant_keys` holds each tenant's data-encryption keys, wrapped:

- **Envelope encryption in the application**, not pgcrypto: pgcrypto moves
  data and keys "in clear text" between server and client, a key passed in SQL
  can reach `pg_stat_activity` and logs, and it "does not resist side-channel
  attacks" (pgcrypto docs, [R2] section 13).
- Algorithm AES-256-GCM through WebCrypto in Bun. Ciphertext format
  `0x01 | iv (12 bytes) | ciphertext | tag (16 bytes)`. Associated data
  `tenant_id | table | column | row id | key_version`, so ciphertext cannot be
  moved between rows, columns or tenants ([R2] section 13).
- One DEK per tenant and purpose (`health`, `identifiers`, `files`), wrapped by
  the cell's KMS key for that tenant, in-region, with the KMS encryption
  context `{cell, tenant_id, purpose, key_version}`. A wrapped key copied to
  another tenant's row fails to unwrap, and the KMS log attributes every unwrap
  to a tenant. The API caches an unwrapped DEK in memory for at most five
  minutes.
- `identifier_lookup` is a separate HMAC key for sealed identifiers' exact
  lookup and uniqueness (section 6.7). It does not rotate with the
  `identifiers` DEK, so the unique index keeps holding across DEK versions; it
  changes only through a maintenance job that recomputes every HMAC of the
  tenant in one transaction.
- Random 96-bit IVs are fine for one school's volume: NIST SP 800-38D §8.3
  allows 2^32 invocations per key ([R2] section 13).
- **Rotation**: in one transaction set `retired_at` on the active version and
  insert the next `key_version` (the unique index allows one active key per
  purpose, checked immediately, so the order matters); a worker job then
  re-encrypts rows in batches.
  `destroyed_at` marks a version whose KMS key was scheduled for deletion.
- **Moves and merges**: a move re-wraps the DEKs under the target cell's KMS
  key; a merge re-encrypts the absorbed tenant's ciphertext under the
  absorbing tenant's keys (section 3.5).
- **Crypto-shredding** on offboarding needs a KMS key per tenant, so that
  deleting it makes the tenant's ciphertext in old backups unreadable; with one
  cell-wide KEK a backup could still unwrap the DEK ([R2] section 13). Open
  question 3.

### 6.7 People

A person is a `users` row, with or without an account (OneRoster User,
Ed-Fi Person) ([R1] section 5 item 1; [R3] section 7).

```sql
create table core.users (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  username text check (char_length(username) between 1 and 254 and username = lower(username)),
  given_name_ar text check (char_length(given_name_ar) between 1 and 75),
  middle_name_ar text check (char_length(middle_name_ar) between 1 and 150),
  family_name_ar text check (char_length(family_name_ar) between 1 and 75),
  full_name_ar text check (char_length(full_name_ar) between 1 and 200),
  given_name_en text check (char_length(given_name_en) between 1 and 75),
  middle_name_en text check (char_length(middle_name_en) between 1 and 150),
  family_name_en text check (char_length(family_name_en) between 1 and 75),
  full_name_en text check (char_length(full_name_en) between 1 and 200),
  preferred_given_name text check (char_length(preferred_given_name) between 1 and 75),
  preferred_middle_name text check (char_length(preferred_middle_name) between 1 and 75),
  preferred_family_name text check (char_length(preferred_family_name) between 1 and 75),
  name_parts_source text not null default 'entered'
    check (name_parts_source in ('entered', 'import_split', 'import_parts')),
  birth_date date check (birth_date >= date '1900-01-01'),
  birth_date_source text check (birth_date_source in ('school_record', 'guardian_declared', 'document', 'import')),
  sex_descriptor_id uuid,
  sex_ns text not null generated always as ('sex') stored,
  photo_file_id uuid,
  preferred_locale text check (preferred_locale in ('ar', 'en')),
  primary_org_id uuid,
  medical_alert boolean not null default false,
  custody_alert boolean not null default false,
  erased_at timestamptz,
  import_run_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, photo_file_id) references core.files (tenant_id, id),
  foreign key (tenant_id, primary_org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, sex_descriptor_id, sex_ns) references core.descriptors (tenant_id, id, namespace),
  constraint users_name_check check (erased_at is not null or num_nonnulls(full_name_ar, full_name_en) >= 1),
  constraint users_ar_parts_check check (
    full_name_ar is not null or num_nonnulls(given_name_ar, middle_name_ar, family_name_ar) = 0),
  constraint users_en_parts_check check (
    full_name_en is not null or num_nonnulls(given_name_en, middle_name_en, family_name_en) = 0),
  constraint users_birth_source_check check (birth_date is not null or birth_date_source is null),
  constraint users_erased_check check (erased_at is null or status = 'tobedeleted')
);
create unique index users_username_key on core.users (tenant_id, username)
  where status = 'active' and username is not null;
create index users_name_ar_idx on core.users (tenant_id, full_name_ar collate "ar-x-icu", id) where status = 'active';
create index users_name_en_idx on core.users (tenant_id, full_name_en collate "en-x-icu", id) where status = 'active';
create index users_birth_date_idx on core.users (tenant_id, birth_date) where status = 'active';
create index users_delta_idx on core.users (tenant_id, date_last_modified);

alter table core.files add foreign key (tenant_id, uploaded_by_user_id) references core.users (tenant_id, id);
alter table core.file_subjects add foreign key (tenant_id, user_id) references core.users (tenant_id, id);
alter table core.file_subjects add foreign key (tenant_id, tagged_by_user_id) references core.users (tenant_id, id);
```

- **Names.** `full_name_*` is the name as the person writes it and is what
  lists show. The parts exist because OneRoster requires `givenName` and
  `familyName` and Ed-Fi `FirstName` and `LastSurname` ([R1] section 1, 3.1).
  Arabic naming chains (own name, father's, grandfather's, family) put the
  father's and grandfather's names in `middle_name_ar`. Arabic names do not
  split mechanically ([R1] section 6), so `name_parts_source` records whether
  the parts were entered, came as parts from the legacy database, or were
  split by the importer and need review. OneRoster export takes the Latin-script
  parts when present and otherwise the Arabic-script parts (open question 6);
  a user without a family name in either script is reported, not exported
  with an invented one.
- `preferred_given_name`, `preferred_middle_name`, `preferred_family_name`:
  OneRoster REST `preferredFirstName`, `preferredMiddleName`,
  `preferredLastName` (CSV 1.2.1 `preferredGivenName`, `preferredMiddleName`,
  `preferredFamilyName`); Ed-Fi `PreferredFirstName` and `PreferredLastSurname`.
- **`username`** is what OneRoster serves as `username` (required in
  `users.csv`) and what LTI's `$User.username` resolves to; consumers match
  accounts on it, so it is set once when the person is created and changed only
  by an explicit, audited action. Its value is the first available of: the
  login name of the person's first password identity, a verified contact email
  with purpose `login`, or the student's `school_reference` prefixed by the
  school's `identifier` (or the first eight hex digits of the school's id when
  it has none). Unique per tenant among active rows.
- **Birth date** is nullable, because schools genuinely lack some (AGENTS.md),
  which OneRoster allows and Ed-Fi does not: the Ed-Fi export reports those
  students ([R1] section 6). It is operational, not privileged: the duplicate
  check, the age of majority and the consent age all read it. Where a legal
  age matters and the birth date is unknown, the person is treated as the
  youngest band, following Google's restrictive default ([R3] section 1).
  `birth_date_source` supports age verification (PDPC consent guideline, [R3]
  section 6).
- **Sex** is on `users`, not behind the demographics purpose, because Arabic
  text about a child agrees with the child's gender (ابنك غاب, ابنتك غابت) and
  every notice, digest and template needs it, and because many Gulf schools
  allocate classes and campuses by it. The OneRoster demographics resource
  stays privileged at the integration boundary.
- `photo_file_id`: a child's photo is COPPA personal information; face
  templates are never derived ([R3] section 7).
- `primary_org_id`: OneRoster `primaryOrg`, and the zone of the person's own
  schedule (section 4.11).
- `medical_alert`, `custody_alert`: the record header's alert chips (product
  spec, People). They are plaintext flags maintained by the health service
  and the relationship service, because the rows behind them are unreadable
  without their purpose (section 5) and the chip shows on every student page
  (open question 4).
- Nationality, religion, birthplace and home languages are in
  `core.demographics`, behind the `demographics` purpose.
- The duplicate check on "Adding a student" (name and birth date offers "Open
  existing") uses `users_birth_date_idx` and name search.

```sql
create table core.demographics (
  tenant_id uuid not null,
  user_id uuid not null,
  birth_country_code text check (birth_country_code ~ '^[A-Z]{2}$'),
  birth_city text check (char_length(birth_city) between 1 and 100),
  nationality_codes text[] not null default '{}'
    check (array_to_string(nationality_codes, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  religion_descriptor_id uuid,
  religion_ns text not null generated always as ('religion') stored,
  home_languages text[] not null default '{}'
    check (array_to_string(home_languages, ',') ~ '^([a-z]{2,3}(,[a-z]{2,3})*)?$'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, religion_descriptor_id, religion_ns) references core.descriptors (tenant_id, id, namespace)
);
create index demographics_delta_idx on core.demographics (tenant_id, date_last_modified);
```

- Keyed by the user, because OneRoster requires a demographics record's
  sourcedId to equal its user's ([R1] section 1). The key is immutable.
- **The served demographics record** is `core.users` left joined to
  `core.demographics`: `birthDate` and `sex` from the user, the rest from this
  row, status from the user, and `dateLastModified` the greater of the two. A
  user with a birth date or sex but no row here still has a record. At erasure
  this row is tombstoned with every column nulled, never deleted, so the
  endpoint serves `tobedeleted` for the sourcedId.
- Behind the `demographics` purpose gate (section 5): no query sees a row
  unless the unit of work set that purpose through `withPurpose`, which checks
  the capability and writes the read audit row (section 7.7).
- Nationality is a list (dual nationality is common in the Gulf); neither
  standard has it, nor religion, nor a national id ([R1] section 5 item 12).
  The seven US race booleans are not collected; OneRoster export omits them.

```sql
create table core.external_ids (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  system_descriptor_id uuid not null,
  system_ns text not null generated always as ('external_id_system') stored,
  system_meaning text not null,
  identifier text check (char_length(identifier) between 1 and 64),
  identifier_ciphertext bytea check (octet_length(identifier_ciphertext) between 30 and 512),
  identifier_hmac bytea check (octet_length(identifier_hmac) = 32),
  identifier_last4 text check (char_length(identifier_last4) between 1 and 4),
  key_purpose text generated always as (case when identifier_ciphertext is not null then 'identifiers' end) stored,
  key_version integer,
  assigning_org_id uuid,
  valid_during daterange not null,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, system_descriptor_id, system_ns, system_meaning)
    references core.descriptors (tenant_id, id, namespace, system_meaning),
  foreign key (tenant_id, assigning_org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, key_purpose, key_version) references core.tenant_keys (tenant_id, purpose, key_version),
  constraint external_ids_value_check check (num_nonnulls(identifier, identifier_ciphertext) = 1),
  constraint external_ids_sealed_check check (
    (identifier_ciphertext is null) = (identifier_hmac is null)
    and (identifier_ciphertext is null) = (key_version is null)),
  constraint external_ids_sensitive_check check (
    system_meaning not in ('national_id', 'passport') or identifier_ciphertext is not null),
  constraint external_ids_suffix_check check (system_meaning <> 'national_id' or identifier_last4 is null),
  constraint external_ids_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and lower_inc(valid_during) and not upper_inc(valid_during))
);
create unique index external_ids_identifier_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null;
create unique index external_ids_hmac_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier_hmac) nulls not distinct
  where status = 'active' and identifier_hmac is not null;
create index external_ids_user_idx on core.external_ids (tenant_id, user_id) where status = 'active';
create index external_ids_delta_idx on core.external_ids (tenant_id, date_last_modified);
```

- OneRoster `userIds[]` and Ed-Fi identification codes ([R1] sections 1, 3.1).
  `assigning_org_id` is the school that issued the identifier (Ed-Fi
  `AssigningOrganizationIdentificationCode`); null means tenant-wide, and the
  unique index treats null as a value.
- An identifier is unique per system and assigning org among active rows. It
  is never reassigned to another person; a reissued number is a new row and
  the old one is end-dated.
- **Sensitive systems** (meanings `national_id`, `passport`,
  `residence_permit`, `birth_certificate`) must be sealed,
  which the meaning-pinned foreign key lets a check enforce:
  `identifier_ciphertext` (AES-256-GCM under the tenant's `identifiers` key,
  format and AAD as in section 6.6) and `identifier_hmac` (HMAC-SHA-256 of the
  normalised value under the `identifier_lookup` key, for exact lookup and
  uniqueness). The Saudi PDPL lists a personal identification number as
  personal data; collect it only when a ministry return needs it ([R3]
  section 7).
- **No plaintext suffix for a national id.** An Egyptian national id is
  century, birth date, governorate, a sequence and a check digit, so its last
  four digits plus the plaintext birth date leave a few hundred candidates.
  Passports and ministry numbers may keep `identifier_last4` for display; a
  national id is shown masked from the decrypted value on an audited read.
- A student number that can open records on its own is not directory
  information (FERPA §99.3, [R3] section 5); badges never encode it.
- **Documents on the record.** A document row also keeps
  `issuing_country_code`, and `valid_during` runs from issue to the day after
  expiry, so a renewed passport is a new row beside the old one. The record's
  Details tab lists them masked to anyone with `people:manage` or
  `identifiers:read`; showing one in full needs `identifiers:read` and is
  audited. The student list finds a student by an exact document number
  through the HMAC, and the office's home lists documents running out within
  60 days. An Egyptian national id is checked for form and its birth date
  compared with the record's.

- **There are no households.** A family is the set of guardian links
  (section 6.8): where a child lives is `residence` on each link, so a child
  of separated parents has a main home on one parent's link and a second home
  on the other's, while each parent's authority stays on their own link.
  Siblings are students who share a parent's link. A grouping kept beside the
  links would have to be maintained by hand and would drift from them; Ed-Fi
  has no household entity either ([R1] section 3.1). Fees, when they come,
  hang on the paying adult's link.

```sql
create table core.contact_points (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  kind text not null check (kind in ('email', 'phone', 'postal')),
  label text not null default 'other' check (label in ('mobile', 'home', 'work', 'personal', 'emergency', 'other')),
  value text not null check (char_length(value) between 1 and 500),
  normalized text check (char_length(normalized) between 1 and 320),
  postal jsonb check (jsonb_typeof(postal) = 'object'),
  sms_capable boolean,
  purposes text[] not null default '{notify}' check (purposes <@ '{notify,security,recovery,login}'),
  priority smallint check (priority between 1 and 99),
  do_not_publish boolean not null default false,
  verified_at timestamptz,
  verification_method text check (verification_method in
    ('confirmation_code', 'invitation', 'idp_asserted', 'staff_attested', 'legacy_unverified')),
  bounced_at timestamptz,
  complaint_at timestamptz,
  unsubscribed_at timestamptz,
  source text not null check (source in ('manual', 'import', 'self_service', 'sis', 'sso')),
  import_run_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  constraint contact_points_phone_check check (
    kind <> 'phone' or normalized is null or normalized ~ '^\+[1-9][0-9]{6,14}$'),
  constraint contact_points_email_check check (
    kind <> 'email' or normalized is null or (normalized = lower(normalized) and strpos(normalized, '@') > 1)),
  constraint contact_points_postal_kind_check check (
    (kind = 'postal') = (postal is not null) and (kind <> 'postal' or normalized is null)),
  constraint contact_points_security_check check (
    not (purposes && '{security,recovery,login}') or (kind <> 'postal' and verified_at is not null))
);
create index contact_points_lookup_idx on core.contact_points (tenant_id, kind, normalized)
  where status = 'active' and normalized is not null;
create index contact_points_user_idx on core.contact_points (tenant_id, user_id) where status = 'active';
create unique index contact_points_user_value_key on core.contact_points (tenant_id, user_id, kind, normalized)
  where status = 'active' and normalized is not null;
create index contact_points_delta_idx on core.contact_points (tenant_id, date_last_modified);
```

- Ed-Fi `Telephone`, `ElectronicMail` and `InternationalAddress` in one table
  ([R1] section 3.1): `sms_capable` is `TextMessageCapabilityIndicator`,
  `do_not_publish` is `DoNotPublishIndicator`, `priority` is
  `OrderOfPriority`. `postal` has the shape of `orgs.address`.
- `normalized` is E.164 for phones and lower case for email. A legacy value
  that does not normalise keeps `normalized` null and is flagged for review.
- **Finding a guardian by phone or email** before creating a new one (product
  spec, Adding a student) is an exact match on `contact_points_lookup_idx`,
  never a partial match. Two guardians may share a number, so the index is
  not unique across users. A match known only at another school of the group
  shows the minimal card of section 3.6.
- A contact point belongs to a person; a home address is the adult's postal
  contact point, and a child's homes are the addresses of the adults whose
  link says the child lives with them. A person's contact points are visible to
  every school where the person holds a current role; a guardian whose
  relationship is `communication_isolated` (section 6.8) has their contact
  points hidden from the other guardians of that child.
- `purposes`: a number or address may be used for sign-in, recovery or
  security notices only once verified by a confirmation code, and NIST wants
  at least two such addresses ([R3] section 3). Imported values are
  `legacy_unverified` and `notify` only.
- `bounced_at`, `complaint_at`, `unsubscribed_at` feed the admin reachability
  view (product spec, Notifications); provider callbacks set them (section
  7.1).
- `import_run_id` (here and on users, roles, relationships and school years)
  names the in-product import that created the row (section 6.17).

### 6.8 School membership, roles and relationships

```sql
create table core.student_school_years (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  student_user_id uuid not null,
  org_id uuid not null,
  school_year_id uuid not null,
  school_year_type text not null default 'school_year' check (school_year_type = 'school_year'),
  valid_during daterange not null,
  grade_level_descriptor_id uuid,
  grade_level_ns text not null generated always as ('grade_level') stored,
  calendar_id uuid,
  entry_type_descriptor_id uuid,
  entry_type_ns text not null generated always as ('school_entry_type') stored,
  exit_type_descriptor_id uuid,
  exit_type_ns text not null generated always as ('school_exit_type') stored,
  next_year_outcome text check (next_year_outcome in ('promote', 'retain', 'leave', 'graduate')),
  source text not null check (source in ('manual', 'import', 'sis', 'oneroster', 'rollover')),
  import_run_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, student_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, school_year_id, school_year_type, school_year_id, org_id)
    references core.academic_sessions (tenant_id, id, type, school_year_id, org_id),
  foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
    references core.academic_sessions (tenant_id, id, type, period span),
  foreign key (tenant_id, grade_level_descriptor_id, grade_level_ns)
    references core.descriptors (tenant_id, id, namespace),
  foreign key (tenant_id, calendar_id, school_year_id) references core.calendars (tenant_id, id, school_year_id),
  foreign key (tenant_id, entry_type_descriptor_id, entry_type_ns)
    references core.descriptors (tenant_id, id, namespace),
  foreign key (tenant_id, exit_type_descriptor_id, exit_type_ns)
    references core.descriptors (tenant_id, id, namespace),
  constraint student_school_years_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and not upper_inf(valid_during)
    and lower_inc(valid_during) and not upper_inc(valid_during)),
  constraint student_school_years_excl exclude using gist
    (tenant_id with =, student_user_id with =, org_id with =, valid_during with &&) where (status = 'active')
);
create index student_school_years_student_idx on core.student_school_years (tenant_id, student_user_id)
  where status = 'active';
create index student_school_years_year_idx on core.student_school_years
  (tenant_id, school_year_id, grade_level_descriptor_id) where status = 'active';
create index student_school_years_delta_idx on core.student_school_years (tenant_id, date_last_modified);
```

A student's placement at a school for one school year: Ed-Fi
`StudentSchoolAssociation` (entry date, `EntryGradeLevel`, `EntryType`,
`ExitWithdrawType`, `Calendar`), and the source of OneRoster `User.grades`
([R1]). It is the foundation's answer to "which grade is this child in",
which calendar selection, the young student profile, announcement audiences
by grade, the grade chip on the student list, OneRoster and rollover all ask:

- `valid_during` lies inside the year (typed `PERIOD` key) and one student has
  one active placement at a school at a time. Moving within a year ends one
  row and starts another.
- `grade_level_descriptor_id` is null only for a student the school has not
  placed yet (the Admin Today card "students without a class" also lists
  them).
- `calendar_id` names the calendar that applies when it is not the one the
  grade implies (section 6.3).
- `entry_type` and `exit_type` are descriptors with fixed meanings (section
  6.2). A row with an exit type records a departure; a row that simply ends
  with its year is a student who continues.
- `next_year_outcome` is the rollover's per-student decision (Retain, Leave,
  Graduate, or promote); applying the rollover creates next year's rows
  (promote: next grade, retain: same grade, entry `continuing`) and sets exit
  types on this year's rows for those who leave or graduate.
- **Status on the student list** derives from these rows, never from
  `status = 'tobedeleted'`: enrolled (a current row), pre-enrolled (only a
  future row), left or graduated (the latest row has that exit), unplaced (no
  row). The Archive bulk action ends the current row with an exit type.
- **The young student profile** (K-2 home) applies when the current row's
  grade meaning is `pre_kg` through `grade_2`; a student with no grade gets the
  standard student profile. Birth date plays no part in it (section 6.7).
- The Enrolment history tab lists these rows with the teaching spec's class
  enrollments.
- The Ed-Fi export writes one `StudentSchoolAssociation` per row: entry date
  `lower(valid_during)`, exit date `upper(valid_during) - 1` when an exit is
  set, `End of school year` when the year ended without one.

```sql
create table core.user_roles (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  org_id uuid not null,
  org_type text not null,
  role text not null check (role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator',
    'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative')),
  valid_during daterange not null,
  source text not null check (source in ('manual', 'import', 'sis', 'oneroster', 'sso_jit', 'derived')),
  position_descriptor_id uuid,
  position_ns text not null generated always as ('staff_position') stored,
  title_en text check (char_length(title_en) between 1 and 100),
  title_ar text check (char_length(title_ar) between 1 and 100),
  import_run_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, org_id, org_type) references core.orgs (tenant_id, id, type),
  foreign key (tenant_id, position_descriptor_id, position_ns) references core.descriptors (tenant_id, id, namespace),
  constraint user_roles_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and lower_inc(valid_during) and not upper_inc(valid_during)),
  constraint user_roles_org_type_check check (
    role = 'system_administrator'
    or (role = 'district_administrator' and org_type = 'school_group')
    or (role not in ('district_administrator', 'system_administrator') and org_type = 'school')),
  constraint user_roles_role_excl exclude using gist
    (tenant_id with =, user_id with =, org_id with =, role with =, valid_during with &&) where (status = 'active')
);
create index user_roles_org_role_idx on core.user_roles (tenant_id, org_id, role) where status = 'active';
create index user_roles_user_idx on core.user_roles (tenant_id, user_id) where status = 'active';
create index user_roles_delta_idx on core.user_roles (tenant_id, date_last_modified);
```

- OneRoster 1.2 `Role`: role, org, begin (inclusive) and end (exclusive)
  ([R1] section 1; [R3] finding 2). This is what membership means: a person is
  a member of a school while they hold a current row there.
- `role` is the natural role, OneRoster `RoleEnum` in snake case
  (`district_administrator` exports as `districtAdministrator`), plus `staff`
  for office, nursing, library and IT staff, exported as `ext:staff`. It is
  fixed, not a descriptor, because behaviour depends on it and schools
  configure capabilities through access roles instead (section 6.10), which
  keeps the natural role separate from capability roles, as Entra advises
  ([R3] section 1).
- **Roles sit at schools.** `org_type` is pinned to the org's type:
  `district_administrator` only at a `school_group`, `system_administrator`
  anywhere, every other role only at a `school`. Someone who teaches at every
  school of a group holds a teacher role at each.
- **`roleType` is computed when served**, not stored. OneRoster says "There
  MUST be one, and only one, primary role for each org". For each user and
  org, the provider serves the roles current on the request date or starting
  later, and marks one primary by precedence: administration
  (`district_administrator`, `system_administrator`, `site_administrator`,
  `principal`), then staff (`teacher`, `aide`, `counselor`, `proctor`,
  `staff`), then `student`, then family; ties go to the earliest start, then
  the smaller id. Every served org therefore has exactly one primary, whatever
  starts or ends.
- **Student roles are derived** from `student_school_years`: a student role at
  a school runs from the first placement's start and stays open while the
  latest placement has no exit type; it ends at the end of the placement that
  records an exit. The summer between two years does not end it. A student who
  changes school within the group gets an exit at the old school and a new
  placement, and so a new role, at the new one (OneRoster IG 9.8).
- **Family roles are derived** by one function in `packages/domain`, used by
  the relationship service and the importer alike, from the relation's
  `system_meaning`: `mother` and `father` give `parent`; `guardian` gives
  `guardian`; `step_parent`, `grandparent`, `sibling` and `other_relative`
  give `relative`; `non_relative` gives `relative` only for a
  `school_designated` relationship with portal access; `unspecified` gives
  `guardian`. A role exists at every school where the related student holds a
  current student role, while the relationship grants portal access or legal
  guardianship, for the overlap of the two (`source = 'derived'`). A contact
  number alone never makes anyone a member ([R3] section 7).
- The provider serves a family role only when a current relationship behind
  it has a OneRoster token (never for `non_relative` or `unspecified`), so every
  served `parent` or `guardian` has student agents, as OneRoster requires.
- `position_descriptor_id`, `title_*`: the staff member's position and job
  title at that school, for display (Ed-Fi `StaffClassification` and
  `PositionTitle`).

```sql
create table core.user_relationships (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  student_user_id uuid not null,
  related_user_id uuid not null,
  relation_descriptor_id uuid not null,
  relation_ns text not null generated always as ('relation') stored,
  relation_meaning text not null,
  legal_guardian boolean,
  educational_rights text not null default 'full' check (educational_rights in ('full', 'restricted', 'none')),
  portal_access boolean not null default false,
  receives_notifications boolean not null default false,
  communication_isolated boolean not null default false,
  primary_contact boolean not null default false,
  emergency_contact boolean not null default false,
  contact_priority smallint check (contact_priority between 1 and 99),
  residence text check (residence in ('primary', 'secondary', 'none')),
  pickup text check (pickup in ('allowed', 'not_allowed', 'ask_office')),
  valid_during daterange not null,
  access_basis text not null default 'parental_authority'
    check (access_basis in ('parental_authority', 'court_appointed', 'student_consent', 'school_designated')),
  access_ends_at_majority boolean not null default true,
  verification_method text check (verification_method in ('document', 'court_order', 'staff_attested', 'sis', 'import_unverified')),
  verified_at timestamptz,
  verified_by_user_id uuid,
  import_run_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, student_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, related_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, relation_descriptor_id, relation_ns, relation_meaning)
    references core.descriptors (tenant_id, id, namespace, system_meaning),
  foreign key (tenant_id, verified_by_user_id) references core.users (tenant_id, id),
  constraint user_relationships_self_check check (student_user_id <> related_user_id),
  constraint user_relationships_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and lower_inc(valid_during) and not upper_inc(valid_during)),
  constraint user_relationships_verified_check check (
    (verified_at is null or verification_method is not null)
    and (verification_method is distinct from 'import_unverified' or verified_at is null)),
  constraint user_relationships_portal_check check (not portal_access or educational_rights <> 'none'),
  constraint user_relationships_non_relative_check check (
    relation_meaning <> 'non_relative' or not portal_access or access_basis = 'school_designated'),
  constraint user_relationships_excl exclude using gist
    (tenant_id with =, student_user_id with =, related_user_id with =, valid_during with &&) where (status = 'active')
);
create index user_relationships_related_idx on core.user_relationships (tenant_id, related_user_id) where status = 'active';
create index user_relationships_student_idx on core.user_relationships (tenant_id, student_user_id) where status = 'active';
create index user_relationships_delta_idx on core.user_relationships (tenant_id, date_last_modified);

create table core.relationship_restrictions (
  tenant_id uuid not null,
  relationship_id uuid not null,
  contact_restrictions text check (char_length(contact_restrictions) between 1 and 250),
  court_order_file_id uuid,
  court_order_file_purpose text not null default 'legal_document' check (court_order_file_purpose = 'legal_document'),
  verification_file_id uuid,
  verification_file_purpose text not null default 'evidence' check (verification_file_purpose = 'evidence'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, relationship_id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, relationship_id) references core.user_relationships (tenant_id, id),
  foreign key (tenant_id, court_order_file_id, court_order_file_purpose) references core.files (tenant_id, id, purpose),
  foreign key (tenant_id, verification_file_id, verification_file_purpose) references core.files (tenant_id, id, purpose)
);
```

The link between a student and a related person. OneRoster `agents` are too
thin (no type, no flags, no dates), so the fields come from Ed-Fi
`StudentContactAssociation` plus the product's link flags ([R1] section 5
item 2; [R3] section 7):

- Ed-Fi fields: `relation` (Relation), `primary_contact`
  (PrimaryContactStatus), `residence` (LivesWith, widened to main or second
  home), `emergency_contact`
  (EmergencyContactStatus), `contact_priority` (ContactPriority),
  `legal_guardian` (LegalGuardian), and `contact_restrictions`
  (ContactRestrictions, "e.g., the student may not be picked up by the
  individual", 250 characters) in the restrictions extension.
- Product flags (product spec, People: Families): `portal_access`,
  `receives_notifications`, `pickup` (may pick up: allowed, not allowed, ask
  the office), plus dates (`valid_during`), which neither standard has.
- `relation_meaning` is pinned to the descriptor's meaning, so checks can use
  it: a non-relative may have portal access only as a school-designated adult.
- **Portal access and consent authority.** `portal_access` decides whether the
  person sees the student in the family app. Giving consent on the student's
  behalf needs more: `legal_guardian = true` and `verified_at` set, because
  the Saudi Implementing Regulation (Art. 13) requires the guardianship to be
  verified and Egypt requires the guardian's own written consent under 15
  ([R3] section 6). `consent_records` references the relationship that proved
  the authority (section 6.13).
- `educational_rights` defaults to full for either parent, which FERPA §99.4
  gives "unless the school holds a court order" ([R3] section 6); `restricted`
  and `none` record such an order, whose file is in the restrictions
  extension.
- **`communication_isolated`** gives this guardian their own thread with each
  staff member instead of the shared guardian thread, and hides their contact
  points from the child's other guardians. It exists for separated parents
  under a protective order; setting or clearing it is audited, and the
  communication spec honours it.
- `access_basis` and `access_ends_at_majority`: rights pass to the student at
  18 under FERPA §99.5 and at capacity under the Saudi regulation. A nightly
  job ends portal access on those rows when the student comes of age in the
  tenant's jurisdiction, unless the student consents (a new row with basis
  `student_consent`).
- **Null is "not recorded"** for `legal_guardian`, `residence` and `pickup`.
  Imported relationships leave them null and carry
  `verification_method = 'import_unverified'`, which puts them in the
  registrar's review queue.
- One current relationship per pair, and every link is dated rather than
  deleted.
- **Custody facts are behind a purpose.** `contact_restrictions`, the court
  order and the guardianship evidence are in `core.relationship_restrictions`,
  a keyed extension behind the `custody` purpose gate, and their files are
  gated the same way (section 5). Staff without the registrar capability see
  only the derived flags: `users.custody_alert`, `pickup`,
  `educational_rights`, `communication_isolated`. Reading the extension goes
  through `withPurpose` and is audited. These rows reveal family structure,
  which is sensitive in the UAE and, for unknown parentage, in Saudi Arabia
  ([R3] section 7).
- OneRoster export: an agent link in both directions for each current row whose
  relation has a OneRoster token and which grants portal access or legal
  guardianship; "Teachers MUST NOT be set as agents" is respected because only
  relationships are exported ([R1] section 1).

### 6.9 Accounts and sign-in

Accounts belong to one tenant. Every identity system schools use gives the
same person a separate identity per organisation, and a global account would
move parent data between cells ([R3] finding 1).

```sql
create table core.accounts (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  state text not null default 'invited' check (state in ('invited', 'active', 'disabled', 'locked')),
  webauthn_user_handle bytea not null,
  first_authenticated_at timestamptz,
  last_authenticated_at timestamptz,
  state_changed_at timestamptz,
  state_changed_by_user_id uuid,
  state_reason text check (char_length(state_reason) between 1 and 500),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, webauthn_user_handle),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, state_changed_by_user_id) references core.users (tenant_id, id),
  constraint accounts_handle_check check (
    octet_length(webauthn_user_handle) = 64
    and substring(webauthn_user_handle from 1 for 16) = uuid_send(tenant_id))
);
create unique index accounts_user_key on core.accounts (tenant_id, user_id) where status = 'active';
create index accounts_delta_idx on core.accounts (tenant_id, date_last_modified);
```

- At most one active account per person. Operators are never tenant accounts.
- `state` is separate from `status`, as OneRoster separates `enabledUser`
  ([R3] section 7). **`enabledUser` means "not disabled"**: it is false only
  when the account's state is `disabled`, and true for a person with no
  account, an invited account or a temporarily locked one. The CSV binding
  defines false as "system access is curtailed according to the local
  administration rules"; a tool that signs students in through Google or Entra
  must not refuse every student who never signed in here, and a password
  lockout must not deprovision anyone downstream.
- `webauthn_user_handle`: WebAuthn wants 64 random bytes with no personal data
  (§14.6.1). Ours is the tenant id (16 bytes) followed by 48 random bytes. A
  discoverable-credential sign-in on the shared app host receives the handle
  before anyone has chosen a school, and the tenant prefix is what lets the API
  set the tenant context and look the credential up without a cross-tenant
  index of credential ids, which are correlation handles ([R3] section 2).
  The prefix identifies the school, not the person. Open question 7. The API
  may never change the handle or the user (section 5).
- `first_authenticated_at`, `last_authenticated_at` feed "never signed in" in
  the reachability view and are telemetry to keep brief ([R3] section 7).

```sql
create table core.identity_providers (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  protocol text not null check (protocol in ('oidc', 'saml', 'clever', 'classlink')),
  display_name_en text check (char_length(display_name_en) between 1 and 80),
  display_name_ar text check (char_length(display_name_ar) between 1 and 80),
  issuer text not null check (char_length(issuer) between 1 and 512),
  client_id text check (char_length(client_id) between 1 and 512),
  metadata_url text check (char_length(metadata_url) between 1 and 2048),
  allowed_issuer_tenants text[] not null default '{}',
  link_policy text not null default 'roster_external_id'
    check (link_policy in ('roster_external_id', 'verified_domain_email', 'invitation_only', 'admin_approval')),
  provision_policy text not null default 'none' check (provision_policy in ('none', 'jit_membership')),
  attribute_mapping jsonb not null default '{}' check (jsonb_typeof(attribute_mapping) = 'object'),
  enabled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  constraint identity_providers_name_check check (num_nonnulls(display_name_en, display_name_ar) >= 1),
  constraint identity_providers_tenant_list_check check (
    protocol not in ('oidc', 'clever', 'classlink') or cardinality(allowed_issuer_tenants) >= 1
    or link_policy in ('invitation_only', 'admin_approval'))
);
create unique index identity_providers_issuer_key on core.identity_providers (tenant_id, protocol, issuer)
  where status = 'active';

create table core.identity_provider_orgs (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  identity_provider_id uuid not null,
  org_id uuid not null,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, identity_provider_id) references core.identity_providers (tenant_id, id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id)
);
create unique index identity_provider_orgs_key on core.identity_provider_orgs
  (tenant_id, identity_provider_id, org_id) where status = 'active';
```

- Per-tenant SSO connections, as Auth0 enables connections per organisation
  ([R3] section 1).
- **The client secret's location is derived, never stored.** The API reads
  it from the cell's secret manager at
  `cells/<cell>/tenants/<tenant_id>/identity-providers/<id>`, built from the
  unit of work's tenant and the row's id. A tenant administrator therefore
  cannot point their connection at another tenant's secret; the secret never
  enters the database.
- `metadata_url`, like every URL a tenant can edit, is fetched only through the
  egress proxy (section 7.10).
- `allowed_issuer_tenants` is the Entra `tid` list, the Google `hd` domains or
  the Clever district ids that this connection accepts; every sign-in checks
  it ([R3] finding 3).
- `link_policy` decides how a first sign-in finds its person. The default
  matches the roster identifier the school's SIS or SCIM provides;
  `verified_domain_email` is for Google only, with `hd` and `email_verified`
  both holding inside the tenant's verified domain. Accounts are never linked
  across tenants and never on an unverified email (the nOAuth class of attack,
  [BA] section 4).
- The SSO `state` parameter is `<tenant uuid>.<random>`, with the random
  part's hash in a short-lived, host-only cookie, so the callback knows its
  tenant before it looks anything up.

```sql
create table core.login_identities (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  account_id uuid not null,
  kind text not null check (kind in ('password', 'oidc', 'saml', 'clever', 'classlink', 'badge')),
  identity_provider_id uuid,
  subject text check (char_length(subject) between 1 and 256),
  issuer_tenant text check (char_length(issuer_tenant) between 1 and 256),
  login_name text check (char_length(login_name) between 1 and 254 and login_name = lower(login_name)),
  secret_hash text check (char_length(secret_hash) between 20 and 512),
  secret_set_at timestamptz,
  compromised_at timestamptz,
  pin_hash text check (char_length(pin_hash) between 20 and 512),
  link_method text not null check (link_method in
    ('roster_external_id', 'verified_domain', 'invitation', 'admin', 'import', 'self_service')),
  linked_at timestamptz not null default statement_timestamp(),
  linked_by_user_id uuid,
  last_used_at timestamptz,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 100),
  locked_until timestamptz,
  expires_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason in ('lost', 'rollover', 'aged_out', 'admin', 'compromised', 'unused',
    'merge_pending')),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, account_id) references core.accounts (tenant_id, id),
  foreign key (tenant_id, identity_provider_id) references core.identity_providers (tenant_id, id),
  foreign key (tenant_id, linked_by_user_id) references core.users (tenant_id, id),
  constraint login_identities_federated_check check (
    (kind in ('oidc', 'saml', 'clever', 'classlink')) = (identity_provider_id is not null and subject is not null)),
  constraint login_identities_password_check check (
    (kind = 'password') = (login_name is not null) and (kind <> 'password' or secret_hash is not null)),
  constraint login_identities_badge_check check (kind <> 'badge' or (secret_hash is not null and expires_at is not null)),
  constraint login_identities_void_check check ((voided_at is null) = (void_reason is null))
);
create unique index login_identities_subject_key on core.login_identities (tenant_id, identity_provider_id, subject)
  where status = 'active' and subject is not null;
create unique index login_identities_login_name_key on core.login_identities (tenant_id, login_name)
  where status = 'active' and kind = 'password' and voided_at is null;
create index login_identities_account_idx on core.login_identities (tenant_id, account_id) where status = 'active';
```

- Every way to sign in except passkeys; NIST requires a record of every bound
  authenticator ([R3] section 7).
- Federated identities are keyed on the issuer's stable subject (OIDC `sub`,
  Entra `oid`, SAML persistent NameID, Clever `id`), never email: OIDC Core
  §5.7 says `iss` plus `sub` "are the only Claims that an RP can rely upon"
  ([R3] finding 3). `subject` is personal data and never logged.
- `login_name` is the NFC-normalised, lower-cased identifier for password
  sign-in, unique per tenant among identities that are not voided.
- `secret_hash` is a PHC string that names its own algorithm and parameters,
  so legacy Argon2id and bcrypt hashes import verbatim and are re-hashed at the
  next successful sign-in ([R3] section 8). New passwords follow NIST
  800-63B-4: at least 15 characters when the password is the only factor,
  at most 100 consecutive failures per authenticator (`failed_attempts`).
- A voided identity with reason `merge_pending` holds a second school's legacy
  password for a person who may be the same as an existing one (section
  10.3). It never signs anyone in by itself; the identity spec's merge flow
  may check a password against it as proof that the person controls both.
- `badge` rows are the young-student sign-in badges: a random secret of at
  least 112 bits encoded in a QR code, never the student number, with a sliding
  180-day expiry ([R3] section 5). The secret is 256 bits and the row keeps its
  SHA-256 in hex, unique among badges that work
  (`login_identities_badge_key`). A teacher holding `badges:issue` prints
  badges for the young students of a class they teach; printing replaces any
  badge the child had (void reason `lost`), stopping one is `admin`, and the
  secret leaves the API once, in the print response. A badge never slides
  past the end of the school year it was printed in (`metadata.until`), so
  badges are renewed each year. The QR holds
  `/badge?school=<slug>#<secret>`: the fragment never reaches a server or a
  referrer, and the page drops it from the address before signing in. A
  badge opens a `student` session with `client_kind = 'shared_device'` and
  `amr = {badge}`, 30 minutes idle and 8 hours at most; on a device that held
  another session for the school, that session is signed out. A child who
  has left the young grades has the badge voided as `aged_out` at its next
  use. Voiding a badge revokes the sessions it opened. A guardian handing
  their device to a young child of theirs opens the same kind of session with
  `amr = {guardian}` and no login identity; the web keeps the guardian's token
  in a separate httpOnly cookie for the way back, and signs it out if the
  child's session ends unattended.

```sql
create table core.passkeys (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  account_id uuid not null,
  credential_id bytea not null check (octet_length(credential_id) between 16 and 1023),
  public_key bytea not null check (octet_length(public_key) between 16 and 2048),
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[] not null default '{}' check (transports <@ '{usb,nfc,ble,smart-card,hybrid,internal}'),
  uv_initialized boolean not null,
  backup_eligible boolean not null,
  backup_state boolean not null,
  aaguid uuid,
  rp_id text not null check (char_length(rp_id) between 1 and 253),
  nickname text check (char_length(nickname) between 1 and 64),
  attestation_object bytea,
  attestation_client_data_json bytea,
  created_from_ip_prefix cidr,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('user', 'admin', 'account_disabled', 'compromised', 'tenant_merged')),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  unique (tenant_id, credential_id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, account_id) references core.accounts (tenant_id, id),
  constraint passkeys_backup_check check (backup_eligible or not backup_state),
  constraint passkeys_revoked_check check ((revoked_at is null) = (revoked_reason is null))
);
create index passkeys_account_idx on core.passkeys (tenant_id, account_id) where revoked_at is null;
```

- The WebAuthn Level 3 credential record: credential id (at most 1023 bytes),
  COSE public key, sign count, transports, `uvInitialized`, `backupEligible`,
  `backupState`, optional attestation, and a nickname ([R3] section 2).
- **Assertion lookup.** The user handle is not covered by the assertion
  signature, and a software authenticator can choose its credential id. The
  API takes the tenant from the handle's prefix, finds the passkey by
  `(tenant, credential_id)`, and accepts the assertion only when the account's
  stored `webauthn_user_handle` equals the handle returned, the passkey is not
  revoked, the account is active, and the signature verifies against the
  stored key (WebAuthn L3 §7.2).
- Credential ids are unique per tenant and never reused, even after
  revocation. WebAuthn says registration "SHOULD fail" if the id is registered
  to any user; across tenants that cannot be checked under RLS, and ids of at
  least 16 random bytes make a collision negligible.
- `backup_eligible` lets a tenant require device-bound keys for administrators;
  NIST accepts synced passkeys at AAL2 only ([R3] section 2).
- Credential ids are correlation handles: the API never sends a non-empty
  `allowCredentials` to a caller who has not identified themselves.

```sql
create table core.devices (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  account_id uuid not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) between 1 and 40),
  push_token_ciphertext bytea check (octet_length(push_token_ciphertext) between 30 and 4096),
  key_purpose text generated always as (case when push_token_ciphertext is not null then 'identifiers' end) stored,
  key_version integer,
  locale text check (locale in ('ar', 'en')),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('sign_out', 'admin', 'token_invalid', 'replaced')),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, account_id) references core.accounts (tenant_id, id),
  foreign key (tenant_id, key_purpose, key_version) references core.tenant_keys (tenant_id, purpose, key_version),
  constraint devices_key_check check ((push_token_ciphertext is null) = (key_version is null)),
  constraint devices_revoked_check check ((revoked_at is null) = (revoked_reason is null))
);
create index devices_account_idx on core.devices (tenant_id, account_id) where revoked_at is null;

create table core.sessions (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  account_id uuid not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  created_at timestamptz not null default statement_timestamp(),
  authenticated_at timestamptz not null,
  last_seen_at timestamptz not null,
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  aal smallint not null check (aal between 1 and 3),
  amr text[] not null check (cardinality(amr) >= 1),
  login_identity_id uuid,
  passkey_id uuid,
  context text not null check (context in ('staff', 'family', 'student')),
  active_org_id uuid,
  active_role text check (active_role in ('student', 'teacher', 'aide', 'counselor', 'principal',
    'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent',
    'guardian', 'relative')),
  client_kind text not null check (client_kind in ('web', 'ios', 'android', 'shared_device')),
  device_id uuid,
  ip_prefix cidr,
  user_agent_summary text check (char_length(user_agent_summary) between 1 and 200),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('sign_out', 'admin', 'credential_change', 'context_switch',
    'reuse_detected', 'account_disabled', 'superseded', 'tenant_merged')),
  replaced_by_session_id uuid,
  primary key (tenant_id, id),
  unique (tenant_id, token_hash),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, account_id) references core.accounts (tenant_id, id),
  foreign key (tenant_id, login_identity_id) references core.login_identities (tenant_id, id),
  foreign key (tenant_id, passkey_id) references core.passkeys (tenant_id, id),
  foreign key (tenant_id, active_org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, device_id) references core.devices (tenant_id, id),
  foreign key (tenant_id, replaced_by_session_id) references core.sessions (tenant_id, id),
  constraint sessions_authenticator_check check (num_nonnulls(login_identity_id, passkey_id) <= 1),
  constraint sessions_expiry_check check (idle_expires_at <= absolute_expires_at and authenticated_at <= last_seen_at),
  constraint sessions_revoked_check check ((revoked_at is null) = (revoked_reason is null))
);
create index sessions_account_idx on core.sessions (tenant_id, account_id) where revoked_at is null;
create index sessions_expiry_idx on core.sessions (tenant_id, absolute_expires_at);

create table core.auth_attempts (
  tenant_id uuid not null,
  key_hash bytea not null check (octet_length(key_hash) = 32),
  count integer not null default 1 check (count > 0),
  window_ends_at timestamptz not null,
  primary key (tenant_id, key_hash),
  foreign key (tenant_id) references core.tenants (tenant_id)
);
create index auth_attempts_window_idx on core.auth_attempts (tenant_id, window_ends_at);
```

Sessions keep the opaque, hashed token design [BA]:

- **Token format**: `<tenant uuid>.<secret>`, where the secret is 32 random
  bytes in base64url. The tenant part is not secret; it is how the API knows
  which tenant context to set before it can look the session up under RLS.
  Only `sha256(secret)` is stored, as `token_hash`; Better Auth stores raw
  tokens by default, which is one reason we keep our own session core
  ([R3] section 1).
- The web backend-for-frontend holds it in the tenant's `__Host-s-<tenant>`
  cookie (section 3.3); mobile clients hold one per tenant in the Keychain or
  Keystore ([R3] section 4).
- Lookup:
  `where tenant_id = $1 and token_hash = $2 and revoked_at is null and idle_expires_at > now() and absolute_expires_at > now()`.
  `last_seen_at` and `idle_expires_at` are written at most once a minute per
  session, so reads do not become writes.
- Timeouts are enforced on the server from these columns (NIST 800-63B-4 §5).
  The values per profile belong to the identity spec.
- **Context, not profile, is stored.** `context` is the staff, family or
  student context the person chose; `active_org_id` and `active_role` narrow
  it. Switching context issues a new session and revokes the old one with
  `context_switch`, because OWASP treats it as a privilege change ([R3]
  section 4). The **profile** (`staff_admin`, `staff`, `family`, `student`,
  `young_student`) is derived in every unit of work from the context and the
  person's current roles, capabilities and grade (section 6.8), so a role
  granted or removed mid-session applies at the next request, and a student
  who leaves K-2 loses the young home at once. The profile caps capabilities
  whatever roles the person holds.
- `aal` and `amr` record how the session was authenticated; a session never
  counts at a higher assurance level than its authentication (NIST §5).
- `ip_prefix` and `user_agent_summary` live here and nowhere else: audit rows
  reference the session, and the session is deleted 30 days after it expires,
  or at erasure.
- Logs refer to the session `id`, never the token.
- `devices` holds a mobile install's push token (encrypted under the
  `identifiers` key), revoked at sign-out; `sessions.device_id` points at it.
  Push as a channel in the notification preference matrix is the
  communication spec's.
- `auth_attempts` counts sign-in attempts per key, where the key is an HMAC of
  the login name or of the IP prefix under a per-tenant key derived as
  `HMAC(cell secret, tenant_id)`, so no raw identifier is stored and one
  person's attempts are not linkable across tenants ([R3] section 7). A second,
  cell-wide limiter in Valkey, keyed by an HMAC of the IP prefix, bounds
  password spraying across every school slug. It replaces the control
  database's `login_attempts`.

### 6.10 Access roles

The capability model every procedure checks. The capability catalogue itself
belongs to the identity and access spec; the tables and the resolution rule are
foundation because the request context depends on them.

```sql
create table core.access_roles (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid,
  builtin_key text check (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator',
    'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family')),
  name_en text check (char_length(name_en) between 1 and 80),
  name_ar text check (char_length(name_ar) between 1 and 80),
  description_en text check (char_length(description_en) between 1 and 500),
  description_ar text check (char_length(description_ar) between 1 and 500),
  capabilities text[] not null
    check (array_to_string(capabilities, ',') ~ '^([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*(,[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)*)?$'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  constraint access_roles_name_check check (num_nonnulls(name_en, name_ar) >= 1)
);
create unique index access_roles_builtin_key on core.access_roles (tenant_id, org_id, builtin_key)
  nulls not distinct where status = 'active' and builtin_key is not null;

create table core.access_role_assignments (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  access_role_id uuid not null,
  org_id uuid not null,
  valid_during daterange not null,
  replaces_builtin boolean not null default false,
  granted_by_user_id uuid,
  reason text check (char_length(reason) between 1 and 500),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, access_role_id) references core.access_roles (tenant_id, id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, granted_by_user_id) references core.users (tenant_id, id),
  constraint access_role_assignments_valid_during_check check (
    not isempty(valid_during) and not lower_inf(valid_during) and lower_inc(valid_during) and not upper_inc(valid_during)),
  constraint access_role_assignments_excl exclude using gist
    (tenant_id with =, user_id with =, access_role_id with =, org_id with =, valid_during with &&) where (status = 'active')
);
create index access_role_assignments_user_idx on core.access_role_assignments (tenant_id, user_id) where status = 'active';
create index access_role_assignments_role_idx on core.access_role_assignments (tenant_id, access_role_id) where status = 'active';
```

- **Effective capabilities** of a person at a school on a date:
  1. A is the set of access roles assigned to them there or at an ancestor
     org, current on the date.
  2. If any assignment in A has `replaces_builtin`, B is empty. Otherwise B is,
     for each natural role they hold there or at an ancestor, the built-in
     access role for that role (`builtin_key` equals the role, with `parent`,
     `guardian` and `relative` all mapping to `family`), taken from the most
     specific org on the path from the school to the root that has one.
  3. The result is the union of A and B, capped by the profile derived for the
     session (section 6.9).

  An assignment at the root org therefore covers every school in the group.

- `replaces_builtin` is how a school narrows one person ("Teacher, no
  grades"): an assigned role that replaces the built-in instead of adding to
  it. It is also exactly the legacy rule, where an assigned role replaced the
  built-in one (section 10.3).
- **Scoped to a school.** A role with `org_id` set is visible and assignable
  only at that org and below; a built-in row with `org_id` set overrides the
  tenant-wide built-in for that school, so school A can narrow its teachers
  without narrowing school B's. Built-ins are editable rows; the identity spec
  defines their seed capabilities. The API cannot change a role's `org_id` or
  `builtin_key` after insert (section 5).
- **The last holder of `access:manage`** cannot be removed. Every write that
  can change who holds a capability (a user role, an access-role assignment,
  an access role's capabilities or status, an account's state, a user's
  status) takes `app.lock('access')` and, before committing, checks that at
  least one active person still holds `access:manage` through sources with no
  end date. A holder whose assignment ends next month does not count, so the
  rule cannot lapse on a date. Each of these writes has a behavioural test.
- Capabilities never grant a record. A capability lets a procedure run; SQL
  relationship functions decide which records it reaches ([BA] section 4;
  AGENTS.md).

### 6.11 Health

```sql
create table health.records (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  student_user_id uuid not null,
  kind_descriptor_id uuid not null,
  kind_ns text not null generated always as ('health_record_kind') stored,
  has_alert boolean not null default false,
  recorded_on date,
  key_purpose text not null generated always as ('health') stored,
  key_version integer not null,
  ciphertext bytea not null check (octet_length(ciphertext) between 29 and 65565),
  file_id uuid,
  file_purpose text not null default 'health_report' check (file_purpose = 'health_report'),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, student_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, kind_descriptor_id, kind_ns) references core.descriptors (tenant_id, id, namespace),
  foreign key (tenant_id, key_purpose, key_version) references core.tenant_keys (tenant_id, purpose, key_version),
  foreign key (tenant_id, file_id, file_purpose) references core.files (tenant_id, id, purpose),
  constraint records_metadata_empty_check check (metadata = '{}')
);
create index records_student_idx on health.records (tenant_id, student_user_id) where status = 'active';
```

- A separate schema with the isolation policy, the entity policies and one
  more restrictive policy, the `health` purpose gate (section 5): no row is
  visible or writable unless `app.purpose` is `health` in the transaction
  ([R2] section 3; [P]).
- The API sets the purpose only inside `withPurpose` (section 7.7), after the
  capability check and after writing the read audit row. The gate stops
  accidents (a join or export that forgot health is special), not an attacker
  who can run SQL.
- `ciphertext` is the envelope-encrypted JSON of the record, for example
  `{"value": "O+"}` for a blood group or
  `{"text": "...", "severity": "severe", "action_plan": "..."}` for an allergy.
  The payload shapes per kind belong to the student-records spec.
- `has_alert` is the only plaintext fact, and it is mirrored into
  `users.medical_alert` for the record header chip. `metadata` must stay
  empty, so nothing health-related leaks into a plaintext column.
- `file_id` points at a medical report, pinned to purpose `health_report`, so
  a record can never point at a file that escaped the report rules of section
  6.5.
- Audit payloads of health writes record the changed field names only, never
  values (section 6.14), and idempotency rows of health procedures store no
  response body (section 6.16).
- Neither standard carries this (Ed-Fi `StudentHealth` is immunisations
  only), so nothing here is exported ([R1] section 6).
- UAE health data stays in the country, including backups ([R2] section 14).

### 6.12 Documents

Rich content is a core object: the Yjs state, the derived validated JSON and
the plain text, with versions, translations, file references and link
references; hosts point at documents (decisions.md, Content).

```sql
create table core.documents (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  host_type text not null check (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  host_id uuid not null,
  org_id uuid,
  kind text not null check (kind in ('rich_text', 'page', 'lesson', 'transcript')),
  schema_version smallint not null check (schema_version > 0),
  locale text check (locale in ('ar', 'en')),
  translation_of_id uuid,
  collaborative boolean not null default false,
  ydoc bytea check (octet_length(ydoc) <= 8388608),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  plain_text text not null default '',
  frozen_at timestamptz,
  last_edited_by_user_id uuid,
  last_edited_at timestamptz,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, translation_of_id) references core.documents (tenant_id, id),
  foreign key (tenant_id, last_edited_by_user_id) references core.users (tenant_id, id),
  constraint documents_collab_check check (collaborative or ydoc is null),
  constraint documents_frozen_check check (frozen_at is null or not collaborative),
  constraint documents_translation_check check (translation_of_id is null or locale is not null)
);
create index documents_host_idx on core.documents (tenant_id, host_type, host_id);
create index documents_translation_idx on core.documents (tenant_id, translation_of_id)
  where translation_of_id is not null;
```

- **One host per document.** `host_type` and `host_id` name the record that
  owns it (an assignment brief, an announcement, a lesson block, a page in one
  locale, a voice note's file). Both are immutable (guard trigger below).
  Duplicating a host copies its document.
- **Authorisation goes through the host's own reference.** Hosts hold the
  foreign key to the document. The collaboration server and file downloads
  resolve `host_type` to the host table through a registry in code, load the
  host row by `host_id`, and require that row's document column to name this
  document; a document whose host does not point back at it is denied to
  everyone. The back-reference alone therefore grants nothing, whatever a buggy
  insert wrote into it.
- `org_id` is the school of the host (null when tenant-wide), set at creation,
  for search scoping.
- `kind` selects the validation schema (`packages/domain`), `schema_version`
  its version. `content` is the canonical JSON the server validated; HTML is
  only ever rendered output (content-editor.md). Every block carries a stable
  id, which is what aligns the two languages of bilingual content.
- **Bilingual content** (a website page edited side by side, a newsletter
  section in both languages, an announcement previewed in both) is two
  documents: the second names the first in `translation_of_id`. A block's
  "reviewed" and "missing translation" state lives in the second document's
  content, keyed by block id; the content schema defines it.
- **Transcripts** of voice notes are documents of kind `transcript` hosted by
  the audio file, so they are searchable and translatable like any text.
- `collaborative` documents carry `ydoc` (Yjs state, at most 8 MiB) and are
  edited through Hocuspocus; the collaboration server validates the derived
  JSON before persisting and writes `ydoc`, `content` and `plain_text`
  together. Other documents (a message body) have no Yjs state.
- `frozen_at`: content that must never change after an event (a sent
  message, a handed-in attempt, a published notice) is frozen; the guard
  trigger refuses any later content change by anyone except `retention`
  redacting an approved erasure.
- `plain_text` feeds previews, notifications and the search index.
- `version` is the document's revision.
- The architecture note put a stored search vector on this table. On an RLS
  table its GIN index cannot be used ([R2] finding 1), so the vector lives in
  `search.entries` (section 6.19) instead.

```sql
create function app.documents_frozen_guard() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.host_type is distinct from old.host_type or new.host_id is distinct from old.host_id then
    raise exception 'document host is immutable' using errcode = '55000';
  end if;
  if old.frozen_at is not null and current_user <> 'retention' and (new.content is distinct from old.content
      or new.ydoc is distinct from old.ydoc or new.plain_text is distinct from old.plain_text
      or new.frozen_at is distinct from old.frozen_at) then
    raise exception 'document % is frozen', old.id using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function app.documents_frozen_guard() from public;
create trigger documents_frozen_guard before update on core.documents
  for each row execute function app.documents_frozen_guard();

create table core.document_versions (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  document_id uuid not null,
  document_version integer not null check (document_version > 0),
  reason text not null check (reason in ('publish', 'checkpoint', 'before_restore', 'import')),
  label text check (char_length(label) between 1 and 120),
  ydoc_snapshot bytea check (octet_length(ydoc_snapshot) <= 8388608),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  plain_text text not null,
  created_by_user_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  redacted_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, document_id, document_version, reason),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, document_id) references core.documents (tenant_id, id),
  foreign key (tenant_id, created_by_user_id) references core.users (tenant_id, id),
  constraint document_versions_redacted_check check (
    redacted_at is null or (content = '{}' and plain_text = '' and ydoc_snapshot is null))
);
create index document_versions_document_idx on core.document_versions (tenant_id, document_id, created_at desc);

create table core.document_translations (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  document_id uuid not null,
  source_version integer not null check (source_version > 0),
  target_locale text not null check (target_locale in ('ar', 'en')),
  origin text not null check (origin in ('machine', 'human')),
  engine text check (char_length(engine) between 1 and 60),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  plain_text text not null default '',
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, document_id) references core.documents (tenant_id, id),
  foreign key (tenant_id, reviewed_by_user_id) references core.users (tenant_id, id),
  constraint document_translations_machine_check check ((origin = 'machine') = (engine is not null)),
  constraint document_translations_review_check check ((reviewed_at is null) = (reviewed_by_user_id is null))
);
create unique index document_translations_key on core.document_translations (tenant_id, document_id, target_locale)
  where status = 'active';

create table core.document_files (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  document_id uuid not null,
  file_id uuid not null,
  file_purpose text not null check (file_purpose in ('document_media', 'attachment', 'site_media')),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, document_id) references core.documents (tenant_id, id),
  foreign key (tenant_id, file_id, file_purpose) references core.files (tenant_id, id, purpose)
);
create unique index document_files_key on core.document_files (tenant_id, document_id, file_id) where status = 'active';
create index document_files_file_idx on core.document_files (tenant_id, file_id) where status = 'active';

create table core.document_links (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  document_id uuid not null,
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  target_id uuid,
  href text check (char_length(href) between 1 and 2048),
  last_checked_at timestamptz,
  last_check_status smallint check (last_check_status between 0 and 999),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, document_id) references core.documents (tenant_id, id),
  constraint document_links_target_check check (
    (target_type = 'url') = (target_id is null) and (target_type <> 'url' or href is not null))
);
create index document_links_document_idx on core.document_links (tenant_id, document_id) where status = 'active';
create index document_links_target_idx on core.document_links (tenant_id, target_type, target_id)
  where status = 'active' and target_id is not null;
```

- **Versions** are snapshots: at publish (the website's and newsletters'
  published editions read a `publish` version, so later edits stay private),
  at collaboration checkpoints (every ten minutes of activity and when the last
  editor leaves), before a restore, and at import. Restoring writes a
  `before_restore` snapshot and then the chosen content as a new revision;
  history is never rewritten. The one exception is erasure: `retention` may
  redact a version of a document listed in an approved erasure, emptying its
  content and setting `redacted_at` (section 5).
- **Translations** hold machine translations (messaging's automatic
  translation with View original, announcement previews) and human
  translations that are not separately edited documents. A row translates
  `source_version` of the document; when the document's version moves past it,
  the translation is stale and is regenerated or re-reviewed. `reviewed_by` and
  `reviewed_at` record a person's review. Search covers them (section 6.19).
- **File references** are the files the current content embeds, extracted
  by the server from the validated JSON on every save: new references are
  inserted, dropped ones tombstoned, re-added ones restored. The server inserts
  a reference only for a file the saving person could already read, and the
  purpose pin allows only media and attachments, so a health report, custody
  evidence or legal document can never be published through a document. A
  file linked only through a document is downloadable by whoever may read the
  document's host (through the host's own reference, as above).
- **Link references** are the internal records (`target_type`, `target_id`) and
  external URLs (`target_type = 'url'`, `href`) the content links to, for
  backlinks, the newsletter link check and warnings when a target is deleted.
  The link check fetches through the egress proxy (section 7.10).

### 6.13 Consent, erasure approvals and legal holds

```sql
create table core.privacy_notices (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  kind text not null check (kind in ('privacy_notice', 'consent_text', 'directory_notice', 'coppa_direct_notice')),
  purpose_descriptor_id uuid,
  purpose_ns text not null generated always as ('consent_purpose') stored,
  org_id uuid,
  locale text not null check (locale in ('ar', 'en')),
  version_label text not null check (char_length(version_label) between 1 and 40),
  document_id uuid not null,
  published_at timestamptz,
  supersedes_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, purpose_descriptor_id, purpose_ns) references core.descriptors (tenant_id, id, namespace),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, document_id) references core.documents (tenant_id, id),
  foreign key (tenant_id, supersedes_id) references core.privacy_notices (tenant_id, id),
  constraint privacy_notices_purpose_check check ((kind = 'consent_text') = (purpose_descriptor_id is not null))
);

create table core.consent_records (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  created_at timestamptz not null default statement_timestamp(),
  subject_user_id uuid not null,
  purpose_descriptor_id uuid not null,
  purpose_ns text not null generated always as ('consent_purpose') stored,
  decision text not null check (decision in ('granted', 'refused', 'withdrawn')),
  notice_id uuid,
  given_by_user_id uuid,
  capacity text not null check (capacity in ('self', 'guardian', 'school_on_behalf')),
  relationship_id uuid,
  legal_basis text not null check (legal_basis in
    ('consent', 'contract', 'legal_obligation', 'public_task', 'school_authorization', 'legitimate_interest')),
  explicit boolean not null,
  written boolean not null,
  method text not null check (method in ('electronic', 'electronic_signature', 'paper_scanned', 'verbal_recorded', 'import')),
  evidence_file_id uuid,
  recorded_by_user_id uuid,
  valid_during daterange not null,
  subject_age_at_decision smallint check (subject_age_at_decision between 0 and 120),
  refresh_due_on date,
  note text check (char_length(note) between 1 and 500),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, subject_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, purpose_descriptor_id, purpose_ns) references core.descriptors (tenant_id, id, namespace),
  foreign key (tenant_id, notice_id) references core.privacy_notices (tenant_id, id),
  foreign key (tenant_id, given_by_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, relationship_id) references core.user_relationships (tenant_id, id),
  foreign key (tenant_id, evidence_file_id) references core.files (tenant_id, id),
  foreign key (tenant_id, recorded_by_user_id) references core.users (tenant_id, id),
  constraint consent_records_guardian_check check (
    capacity <> 'guardian' or (relationship_id is not null and given_by_user_id is not null)),
  constraint consent_records_self_check check (capacity <> 'self' or given_by_user_id = subject_user_id),
  constraint consent_records_notice_check check (method = 'import' or decision = 'withdrawn' or notice_id is not null),
  constraint consent_records_valid_during_check check (not isempty(valid_during) and not lower_inf(valid_during))
);
create index consent_records_subject_idx on core.consent_records
  (tenant_id, subject_user_id, purpose_descriptor_id, created_at desc, id desc);

create view core.current_consents with (security_invoker = true) as
select distinct on (tenant_id, subject_user_id, purpose_descriptor_id) *
from core.consent_records
order by tenant_id, subject_user_id, purpose_descriptor_id, created_at desc, id desc;
```

The laws agree on a common core: consent per purpose with its time, method
and the notice shown; withdrawal as easy as consent; verified guardian
authority; records of requests and disclosures ([R3] finding 6).

- **A consent form is a version.** Each `consent_text` row is one numbered
  version of a school's form for a purpose, hosting its words as an editor
  document (`host_type = 'privacy_notice'`) in the language it was written
  in, with its translation as the document's translation and the same
  translation check as news and announcements. A school has at most one
  draft per purpose; publishing sets `published_at`, freezes both documents
  and asks the guardians, and later edits open a new draft that
  `supersedes_id` the published one. `locale` is the language written first;
  `notice_id` points at the version, whichever language was read.
- **Append-only.** A change of mind is a new row; the current state is the
  latest row per subject and purpose (`core.current_consents`). Proof of
  consent is kept even after erasure of other data, because keeping it is a
  legal obligation.
- `notice_id` is the exact notice version shown (Egypt's consent guideline
  requires the consent to name the purposes, data categories and the right to
  withdraw, [R3] section 6). Imported legacy flags have no notice.
- `capacity = 'guardian'` requires the relationship that proves authority;
  the API additionally requires that relationship to be a verified legal
  guardianship (section 6.8).
- `explicit`, `written`, `method` and `evidence_file_id` record what Egypt
  (Decree 816/2025 Art. 2, 14, 15) and Saudi Arabia (Implementing Regulation
  Art. 11) require of the record.
- `valid_during` is the time scope Egypt requires for a guardian's consent
  under 15; `refresh_due_on` is when it must be asked again (the child turns
  15, reaches majority, or the scope ends).
- **FERPA directory-information opt-outs** are consent rows too: decision
  `refused` for a purpose whose meaning is `directory_sharing`,
  `photo_website` or `photo_social`. They survive the student leaving (§99.37(b)) because nothing
  deletes them.
- Withdrawal queues jobs that stop the processing, unpublish the person's
  photos (section 6.5) and ask recipients to delete the data (Saudi
  Implementing Regulation Art. 12(4)); those jobs belong to the privacy
  operations spec.

```sql
create table core.erasure_approvals (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  created_at timestamptz not null default statement_timestamp(),
  subject_user_id uuid not null,
  basis text not null check (basis in ('data_subject_request', 'retention_schedule', 'regulator_order')),
  request_reference text check (char_length(request_reference) between 1 and 120),
  approved_by_user_id uuid not null,
  second_approver_user_id uuid,
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, subject_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, approved_by_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, second_approver_user_id) references core.users (tenant_id, id),
  constraint erasure_approvals_approvers_check check (second_approver_user_id is distinct from approved_by_user_id)
);
create index erasure_approvals_subject_idx on core.erasure_approvals (tenant_id, subject_user_id);

create table core.erasure_items (
  tenant_id uuid not null,
  approval_id uuid not null,
  object_type text not null check (object_type in ('file', 'document')),
  object_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, approval_id, object_type, object_id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, approval_id) references core.erasure_approvals (tenant_id, id)
);
create index erasure_items_object_idx on core.erasure_items (tenant_id, object_type, object_id);

create table core.legal_holds (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  subject_user_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  placed_by_user_id uuid not null,
  released_at timestamptz,
  released_by_user_id uuid,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, subject_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, placed_by_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, released_by_user_id) references core.users (tenant_id, id),
  constraint legal_holds_release_check check ((released_at is null) = (released_by_user_id is null))
);
create index legal_holds_subject_idx on core.legal_holds (tenant_id, subject_user_id)
  where status = 'active' and released_at is null;

create function app.erasure_approved(p_tenant uuid, p_subject uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_subject is not null
    and exists (select 1 from core.erasure_approvals a
                where a.tenant_id = p_tenant and a.subject_user_id = p_subject)
    and not exists (select 1 from core.legal_holds h
                    where h.tenant_id = p_tenant and h.subject_user_id = p_subject
                      and h.status = 'active' and h.released_at is null)
$$;

create function app.erasure_listed(p_tenant uuid, p_type text, p_object uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from core.erasure_items i
                 join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
                 where i.tenant_id = p_tenant and i.object_type = p_type and i.object_id = p_object
                   and app.erasure_approved(a.tenant_id, a.subject_user_id))
$$;
revoke all on function app.erasure_approved(uuid, uuid), app.erasure_listed(uuid, text, uuid) from public;
grant execute on function app.erasure_approved(uuid, uuid), app.erasure_listed(uuid, text, uuid) to retention;
```

- **An erasure approval** is a ledger row a person with the erasure
  capability writes after the privacy spec's review; `erasure_items` lists
  the files and documents it covers beyond the person's own rows,
  so the approver sees and signs off exactly what will go. The privacy spec
  decides whether a second approver is required.
- **A legal hold** names a person whose data must not be erased; while one is
  active and unreleased, no approval for that person takes effect.
- The two functions are security-invoker SQL, read under the same isolation
  as everything else, and are what `retention`'s update and delete policies
  test (section 5). `retention` alone can therefore destroy nothing: a
  deletion needs a recorded approval, written through the API by a person with
  the capability and audited, and no hold.

### 6.14 Audit

Append-only and tamper-evident, including sensitive reads and every export
[BA]. The shape follows [R2] section 12 with the erasure-friendly split from
[R3] section 7.

```sql
create table audit.log (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_kind text not null default coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system')
    check (actor_kind in ('user', 'system', 'integration', 'import', 'operator')),
  actor_user_id uuid default app.user_id(),
  session_id uuid default nullif(current_setting('app.session_id', true), '')::uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  object_type text not null check (object_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  object_id uuid,
  org_id uuid,
  subject_user_id uuid,
  student_user_id uuid,
  request_id text default nullif(current_setting('app.request_id', true), '')
    check (char_length(request_id) between 1 and 64),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192),
  payload_digest bytea check (octet_length(payload_digest) = 32),
  row_hash bytea not null,
  primary key (tenant_id, occurred_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id)
) partition by range (occurred_at);
create index log_object_idx on audit.log (tenant_id, object_type, object_id, occurred_at);
create index log_subject_idx on audit.log (tenant_id, subject_user_id, occurred_at) where subject_user_id is not null;
create index log_student_idx on audit.log (tenant_id, student_user_id, occurred_at) where student_user_id is not null;
create index log_actor_idx on audit.log (tenant_id, actor_user_id, occurred_at);
create index log_request_idx on audit.log (tenant_id, request_id) where request_id is not null;

create table audit.payloads (
  tenant_id uuid not null,
  event_id uuid not null,
  occurred_at timestamptz not null,
  subject_user_id uuid,
  salt bytea not null check (octet_length(salt) = 16),
  before jsonb,
  after jsonb,
  primary key (tenant_id, occurred_at, event_id),
  foreign key (tenant_id, occurred_at, event_id) references audit.log (tenant_id, occurred_at, id)
) partition by range (occurred_at);
create index payloads_subject_idx on audit.payloads (tenant_id, subject_user_id) where subject_user_id is not null;

create table audit.seal_batches (
  tenant_id uuid not null,
  batch_no bigint not null check (batch_no > 0),
  sealed_at timestamptz not null default statement_timestamp(),
  event_count integer not null check (event_count >= 0),
  root bytea not null check (octet_length(root) = 32),
  prev_hash bytea check (octet_length(prev_hash) = 32),
  hash bytea not null check (octet_length(hash) = 32),
  primary key (tenant_id, batch_no),
  foreign key (tenant_id) references core.tenants (tenant_id),
  constraint seal_batches_chain_check check ((batch_no = 1) = (prev_hash is null))
);

create table audit.seal_members (
  tenant_id uuid not null,
  event_id uuid not null,
  event_occurred_at timestamptz not null,
  batch_no bigint not null,
  primary key (tenant_id, event_id),
  foreign key (tenant_id, batch_no) references audit.seal_batches (tenant_id, batch_no)
);
create index seal_members_batch_idx on audit.seal_members (tenant_id, batch_no);

create table audit.anchors (
  tenant_id uuid not null,
  batch_no bigint not null,
  anchored_at timestamptz not null default statement_timestamp(),
  object_key text not null check (char_length(object_key) between 1 and 1024),
  object_version_id text not null check (char_length(object_version_id) between 1 and 1024),
  primary key (tenant_id, batch_no),
  foreign key (tenant_id, batch_no) references audit.seal_batches (tenant_id, batch_no)
);

create function audit.hash_row() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user <> 'cell_io' then
    new.occurred_at := statement_timestamp();
    new.actor_kind := coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system');
    new.actor_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
    new.session_id := nullif(current_setting('app.session_id', true), '')::uuid;
    new.request_id := nullif(current_setting('app.request_id', true), '');
  end if;
  new.row_hash := sha256(convert_to(jsonb_build_array(
    new.tenant_id, new.id, (extract(epoch from new.occurred_at) * 1000000)::bigint,
    new.actor_kind, new.actor_user_id, new.session_id, new.action, new.outcome,
    new.object_type, new.object_id, new.org_id, new.subject_user_id, new.student_user_id, new.request_id,
    new.details, encode(new.payload_digest, 'hex'))::text, 'UTF8'));
  return new;
end $$;
create trigger hash_row before insert on audit.log for each row execute function audit.hash_row();

create function audit.check_payload() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  digest bytea;
begin
  select l.payload_digest into digest from audit.log l
  where l.tenant_id = new.tenant_id and l.occurred_at = new.occurred_at and l.id = new.event_id
    and (current_user = 'cell_io' or l.occurred_at >= transaction_timestamp());
  if digest is null
     or digest <> sha256(new.salt || convert_to(jsonb_build_array(new.before, new.after)::text, 'UTF8')) then
    raise exception 'payload does not match its audit row' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_payload before insert on audit.payloads for each row execute function audit.check_payload();

create function audit.refuse_change() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception '% on %.% is not allowed', tg_op, tg_table_schema, tg_table_name using errcode = '42501';
end $$;
create trigger refuse_update_delete before update or delete on audit.log
  for each row execute function audit.refuse_change();
create trigger refuse_truncate before truncate on audit.log
  for each statement execute function audit.refuse_change();
create trigger refuse_update before update on audit.payloads
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.seal_batches
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.seal_members
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.anchors
  for each row execute function audit.refuse_change();
revoke all on function audit.hash_row(), audit.check_payload(), audit.refuse_change() from public;
```

**What is recorded.** The API writes audit rows in the same transaction as the
change (section 7.8). Actions are dotted (`account.sign_in`,
`access_role_assignment.create`). Each maps to OWASP's logging vocabulary where
that has a term (`authn_login_lock`, `authz_change`, `user_created`, [R3]
section 7). Recorded are:

- Every create, update, tombstone and restore of an entity, with before and
  after values in `audit.payloads`, except the columns of the payload denylist
  below.
- Every sign-in, sign-out, failed sign-in, credential binding and recovery.
- Reads of special-category data: health records, relationship restrictions
  and custody evidence, demographics, sealed identifiers.
- Every export and every release of student data to an integration (a
  OneRoster or LTI call is one row with the resource and a count; a per-student
  disclosure sets `student_user_id`, the FERPA §99.32 record, [R2] section 12).
- Every operator (`break_glass`) session and what it touched.

Routine page reads are not audited.

- `subject_user_id` is the person the row is about (the staff member whose
  role changed, the guardian whose phone changed), indexed, so the History
  tabs of the student and staff records are one query. `student_user_id` stays
  the FERPA disclosure record.
- **Denied and failed operations** are recorded too. Their own transaction
  rolls back, so the unit of work writes the row in a short second transaction
  after the rollback, with outcome `denied` or `failed`.
- **Payload denylist.** These values never enter a payload; the row records
  the field name as changed and nothing more: every `ciphertext` and
  `identifier_ciphertext`, `identifier_hmac`, `secret_hash`, `pin_hash`,
  `token_hash`, `key_hash`, `wrapped_dek`, `push_token_ciphertext`, `ydoc`, and
  every column of `health.records`, `core.demographics` and
  `core.relationship_restrictions`. A test per table fails when a payload of a
  denylisted column carries a value.
- The client's IP address is not in the log. It is on the session row, which
  the log references and which is deleted 30 days after it expires, so an
  audit row keeps no value that erasure would need to reach.

**Erasure-friendly payloads.** `details` holds only non-personal facts
(changed field names, counts, reason codes). Before and after values live in
`audit.payloads` with a random 16-byte salt, and the log row carries
`payload_digest = sha256(salt || convert_to(jsonb_build_array(before, after)::text, 'UTF8'))`,
which the row hash covers. Erasing a person deletes their payload rows under an
approved erasure; the chain still verifies and the digest can no longer be
guessed ([R3] section 7).

**Forgery and substitution.** `audit.hash_row` overwrites `occurred_at` and
the actor columns from the unit of work's context for every role but `cell_io`
(which imports and moves history), so no code path can backdate a row or
write it in someone else's name; a supplied time in another month is refused
because the row would change partition. `audit.check_payload` refuses a
payload whose digest does not match its log row, or whose log row was not
written in the same transaction.

**Hash chain without a write bottleneck.** A synchronous per-tenant chain held
its head-row lock through the commit's WAL flush and capped a tenant at about
389 transactions a second, against 6456 for insert-only rows with a per-row
hash and an asynchronous sealer ([R2] finding 4, probe). So:

- `row_hash` is computed at insert by `audit.hash_row()`. Timestamps are
  hashed as epoch microseconds because `to_jsonb(timestamptz)` renders the
  session's offset ([R2] section 12).
- The **sealer** is a pg-boss cron job, one singleton per tenant, running
  every minute as `worker` ([P] ran it):

  ```postgresql
  select app.lock('audit_seal');
  with prev as (
    select batch_no, hash, sealed_at from audit.seal_batches
    where tenant_id = app.tenant_id() order by batch_no desc limit 1
  ), pending as (
    select l.tenant_id, l.id, l.occurred_at, l.row_hash from audit.log l
    where l.tenant_id = app.tenant_id()
      and l.occurred_at >= coalesce((select sealed_at from prev) - interval '60 seconds', '-infinity')
      and not exists (select 1 from audit.seal_members m where m.tenant_id = l.tenant_id and m.event_id = l.id)
  ), batch as (
    select coalesce((select batch_no from prev), 0) + 1 as batch_no,
           (select hash from prev) as prev_hash,
           count(*)::int as event_count,
           sha256(coalesce(string_agg(row_hash, ''::bytea order by id), ''::bytea)) as root
    from pending
  ), sealed as (
    insert into audit.seal_batches (tenant_id, batch_no, event_count, root, prev_hash, hash)
    select app.tenant_id(), b.batch_no, b.event_count, b.root, b.prev_hash,
           sha256(coalesce(b.prev_hash, ''::bytea) || b.root || int8send(b.batch_no) || int4send(b.event_count))
    from batch b where b.event_count > 0
    returning batch_no
  )
  insert into audit.seal_members (tenant_id, event_id, event_occurred_at, batch_no)
  select p.tenant_id, p.id, p.occurred_at, s.batch_no from pending p, sealed s;
  ```

  The 60-second overlap covers rows whose transactions committed after the
  previous run (writing roles have a 30-second `transaction_timeout`); the
  anti-join stops a row being sealed twice.

- **Imported history** carries historical times. The importer tags every
  audit row it writes with its run's `request_id` and enqueues a one-off seal
  job, run as `worker`, whose pending set is exactly the rows with that
  `request_id`, with no time bound. No run ever seals unsealed rows it did not
  create, so a backdated row cannot be laundered into a seal; the daily
  verification reports any row older than the margin that is still unsealed.
- **Anchoring**: hourly, the worker writes one object per tenant holding
  `(tenant_id, batch_no, hash)` of that tenant's newest batch to an in-region
  bucket with S3 Object Lock in compliance mode, where "a protected object
  version can't be overwritten or deleted by any user, including the root user"
  (AWS docs, [R2] section 12), and records `audit.anchors`. One object per
  tenant means proof given to one school or regulator reveals nothing about
  another.
- **Verification**, daily per tenant: recompute every row hash; recompute the
  digest of every surviving payload against its row; check every row older
  than the margin is sealed; check every seal member still exists; recompute
  the chain; compare it with the anchors. A mismatch pages the operator.
- **Layers against change**: `app` has only SELECT and INSERT; there are no
  UPDATE or DELETE policies except `retention`'s approved payload deletion;
  the triggers refuse change even for the owner ([P]). An owner can drop a
  trigger, which the seals then reveal, and gate 1 fails a schema missing one.
- **Retention**: partitions are detached and exported after the retention
  period (open question 9); seal batches and anchors are kept, so verification
  starts from the oldest kept batch.

### 6.15 Activity events

```sql
create table core.activity_events (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_user_id uuid not null,
  verb text not null check (verb ~ '^[a-z][a-z_]{1,40}$'),
  object_type text not null check (object_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  object_id uuid not null,
  org_id uuid,
  context_type text check (context_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  context_id uuid,
  session_id uuid,
  result jsonb check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4096),
  primary key (tenant_id, occurred_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  constraint activity_events_context_check check ((context_type is null) = (context_id is null))
) partition by range (occurred_at);
create index activity_events_actor_idx on core.activity_events (tenant_id, actor_user_id, occurred_at);
create index activity_events_object_idx on core.activity_events (tenant_id, object_type, object_id, occurred_at);
```

- Our own append-only learning activity log, from which Caliper 1.2 or xAPI 2.0
  statements are exported [BA]: `verb` (viewed, started, completed, submitted,
  answered), the object, and the class or module as context. Verbs are defined
  by the systems that emit them (learning, coursework).
- It is not the audit log (no hash chain, not a record of access) and not the
  source of truth for any state (lesson progress and submissions have their own
  tables). An approved erasure deletes the person's events.
- Egypt forbids using a child's activity data "for classification, tracking or
  behavioural monitoring" (Decree 816/2025 Art. 14(5), [R3] finding 7). Until
  the owner decides whether this log falls under that (open question 8), it
  records only what a teacher's progress view shows, keeps it 13 months, and
  feeds no profiling.

### 6.16 Idempotency keys

```sql
create table core.idempotency_keys (
  tenant_id uuid not null,
  account_id uuid not null,
  key text not null check (char_length(key) between 8 and 255),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  procedure text not null check (char_length(procedure) between 1 and 120),
  response_status smallint check (response_status between 100 and 599),
  response_body jsonb,
  resource_type text check (char_length(resource_type) between 1 and 63),
  resource_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '24 hours',
  primary key (tenant_id, account_id, key),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, account_id) references core.accounts (tenant_id, id)
);
create index idempotency_keys_expiry_idx on core.idempotency_keys (tenant_id, expires_at);
```

Stripe's semantics [BA]; the flow is in section 7.9. Keys are scoped to the
account, expire after 24 hours, and `request_hash` is SHA-256 of the procedure
name and the canonical JSON input. Domain rules that already make a retry safe
(a hand-in of the same draft revision returns the same attempt) stay; the key
covers everything else.

A procedure whose response carries a secret (an invitation link, a badge
secret, recovery codes) or special-category data (health, custody,
demographics) is marked sensitive in its contract and stores only the status
and resource ids; a replay re-reads the resource through the normal
authorisation path, or answers 409 when the secret cannot be shown twice.
Secrets are otherwise only ever stored as SHA-256 (section 4.6).

### 6.17 Imports

In-product imports (People, Import; Settings, Import; the timetable spreadsheet)
share one record of what ran and what it did, so per-row results, re-runs and
undo have something to key on. The wizard itself belongs to the people spec.

```sql
create table core.import_runs (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  org_id uuid not null,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  mode text not null check (mode in ('create', 'create_or_update')),
  source_file_id uuid not null,
  source_file_purpose text not null default 'import_source' check (source_file_purpose = 'import_source'),
  mapping jsonb not null default '{}' check (jsonb_typeof(mapping) = 'object' and octet_length(mapping::text) <= 16384),
  state text not null default 'uploaded'
    check (state in ('uploaded', 'validated', 'committing', 'committed', 'failed', 'cancelled', 'undone')),
  row_count integer check (row_count >= 0),
  created_count integer check (created_count >= 0),
  updated_count integer check (updated_count >= 0),
  skipped_count integer check (skipped_count >= 0),
  error_count integer check (error_count >= 0),
  started_by_user_id uuid not null,
  committed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, source_file_id, source_file_purpose) references core.files (tenant_id, id, purpose),
  foreign key (tenant_id, started_by_user_id) references core.users (tenant_id, id)
);

create table core.import_rows (
  tenant_id uuid not null,
  import_run_id uuid not null,
  row_number integer not null check (row_number > 0),
  outcome text not null check (outcome in ('created', 'updated', 'skipped', 'error')),
  target_type text check (target_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  target_id uuid,
  error_codes text[] not null default '{}',
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, import_run_id, row_number),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, import_run_id) references core.import_runs (tenant_id, id)
);

alter table core.users add foreign key (tenant_id, import_run_id) references core.import_runs (tenant_id, id);
alter table core.user_roles add foreign key (tenant_id, import_run_id) references core.import_runs (tenant_id, id);
alter table core.contact_points add foreign key (tenant_id, import_run_id) references core.import_runs (tenant_id, id);
alter table core.user_relationships add foreign key (tenant_id, import_run_id) references core.import_runs (tenant_id, id);
alter table core.student_school_years add foreign key (tenant_id, import_run_id)
  references core.import_runs (tenant_id, id);
```

- Validation and preview compute from the source file and store only counts;
  committing writes one `import_rows` row per source row and sets
  `import_run_id` on every row it creates.
- `import_rows` holds outcomes, targets and error codes, never source values;
  the values stay in the source file, which is an ordinary file and erasable.
- Undo tombstones the rows a run created (its `created` outcomes), under the
  same checks as any other tombstone, and marks the run `undone`.
- The legacy importer does not use these tables; it has its own id map
  (section 10.1).

### 6.18 Preferences and saved views

```sql
create table core.user_preferences (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  user_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,79}$'),
  value jsonb not null check (octet_length(value::text) <= 8192),
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id)
);
create unique index user_preferences_key on core.user_preferences (tenant_id, user_id, key) where status = 'active';

create table core.saved_views (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  owner_user_id uuid not null,
  org_id uuid,
  surface text not null check (surface ~ '^[a-z][a-z0-9_.]{1,79}$'),
  name text not null check (char_length(name) between 1 and 80),
  filter jsonb not null check (jsonb_typeof(filter) = 'object' and octet_length(filter::text) <= 8192),
  shared boolean not null default false,
  status text not null default 'active' check (status in ('active', 'tobedeleted')),
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, owner_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id)
);
create index saved_views_owner_idx on core.saved_views (tenant_id, owner_user_id, surface) where status = 'active';
create index saved_views_shared_idx on core.saved_views (tenant_id, org_id, surface) where status = 'active' and shared;
```

- Per-person state the product remembers: collapsed classwork topics, a
  child's chip colour, the year an administrator last selected, inbox filters.
  Keys are owned by the system that reads them and declared in its contract
  with a Valibot schema for the value.
- Saved views are named filters on a list surface (the student list first);
  a shared view is visible to the school's staff who can use that surface.
  A saved filter never grants access: running it goes through the list's
  normal authorisation.

### 6.19 Search index

```sql
create table search.entries (
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  result_type text not null,
  result_id uuid not null,
  org_ids uuid[] not null default '{}',
  name_norm text,
  text_vector tsvector,
  primary key (tenant_id, entity_type, entity_id)
);
create index entries_name_idx on search.entries using gin (tenant_id, name_norm ext.gin_trgm_ops);
create index entries_text_idx on search.entries using gin (tenant_id, text_vector);
create index entries_org_idx on search.entries using gin (tenant_id, org_ids);

create function app.normalize_name(t text) returns text
language sql immutable parallel safe strict
set search_path = pg_catalog, pg_temp
as $$
  select lower(translate(
    regexp_replace(t, '[ً-ٰٟـ]', '', 'g'),
    'أإآىة', 'ااايه'))
$$;

create function app.search(q text, types text[], org_scope uuid[] default null,
  after_rank real default null, after_id uuid default null, max_rows integer default 50)
returns table (result_type text, result_id uuid, rank real)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with query as (
    select app.normalize_name(q) as norm,
           websearch_to_tsquery('arabic', q) as ar,
           websearch_to_tsquery('english', q) as en
  ), hits as (
    select e.result_type, e.result_id,
           greatest(coalesce(ext.word_similarity(query.norm, e.name_norm), 0),
                    coalesce(ts_rank(e.text_vector, query.ar || query.en), 0))::real as rank
    from search.entries e, query
    where e.tenant_id = app.tenant_id()
      and e.result_type = any (types)
      and (org_scope is null or cardinality(e.org_ids) = 0 or e.org_ids && org_scope)
      and (query.norm operator(ext.<%) e.name_norm
           or e.text_vector @@ query.ar
           or e.text_vector @@ query.en)
  ), best as (
    select h.result_type, h.result_id, max(h.rank) as rank
    from hits h group by h.result_type, h.result_id
  )
  select b.result_type, b.result_id, b.rank from best b
  where after_rank is null or (b.rank, b.result_id) < (after_rank, after_id)
  order by b.rank desc, b.result_id desc
  limit least(max_rows, 200)
$$;

create function app.index_user() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.erased_at is not null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'user' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, name_norm)
  values (new.tenant_id, 'user', new.id, 'user', new.id,
          app.normalize_name(concat_ws(' ', new.full_name_ar, new.full_name_en,
                                       new.preferred_given_name, new.preferred_family_name)))
  on conflict (tenant_id, entity_type, entity_id) do update set name_norm = excluded.name_norm;
  return new;
end $$;
create trigger index_user after insert or update of full_name_ar, full_name_en, preferred_given_name,
  preferred_family_name, status, erased_at on core.users for each row execute function app.index_user();

create function app.index_user_orgs() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update search.entries e set org_ids = coalesce((
    select array_agg(distinct r.org_id order by r.org_id) from core.user_roles r
    where r.tenant_id = new.tenant_id and r.user_id = new.user_id and r.status = 'active'
      and (upper_inf(r.valid_during)
           or upper(r.valid_during) > (statement_timestamp() at time zone 'UTC')::date)), '{}')
  where e.tenant_id = new.tenant_id and e.entity_type = 'user' and e.entity_id = new.user_id;
  return new;
end $$;
create trigger index_user_orgs after insert or update of org_id, status, valid_during on core.user_roles
  for each row execute function app.index_user_orgs();

create function app.index_document() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'document' and entity_id = new.id;
    delete from search.entries e where e.tenant_id = new.tenant_id and e.entity_type = 'document_translation'
      and e.entity_id in (select t.id from core.document_translations t
                          where t.tenant_id = new.tenant_id and t.document_id = new.id);
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document', new.id, new.host_type, new.host_id,
          case when new.org_id is null then '{}'::uuid[] else array[new.org_id] end,
          to_tsvector('arabic'::regconfig, left(new.plain_text, 200000))
          || to_tsvector('english'::regconfig, left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
create trigger index_document after insert or update of plain_text, status, org_id on core.documents
  for each row execute function app.index_document();

create function app.index_translation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  d record;
begin
  if new.status <> 'active' then
    delete from search.entries
    where tenant_id = new.tenant_id and entity_type = 'document_translation' and entity_id = new.id;
    return new;
  end if;
  select host_type, host_id, org_id into d from core.documents
  where tenant_id = new.tenant_id and id = new.document_id;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document_translation', new.id, d.host_type, d.host_id,
          case when d.org_id is null then '{}'::uuid[] else array[d.org_id] end,
          to_tsvector((case new.target_locale when 'ar' then 'arabic' else 'english' end)::regconfig,
                      left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
create trigger index_translation after insert or update of plain_text, status on core.document_translations
  for each row execute function app.index_translation();

revoke all on function app.search(text, text[], uuid[], real, uuid, integer), app.normalize_name(text),
  app.index_user(), app.index_user_orgs(), app.index_document(), app.index_translation() from public;
grant execute on function app.search(text, text[], uuid[], real, uuid, integer), app.normalize_name(text)
  to app, worker;
```

- **Why a separate schema.** On an RLS table the planner will not run a
  non-leakproof operator (`@@`, `%`, `LIKE`) before the policy, so a GIN index
  is ignored: 15.9 ms against 0.025 ms on 1M rows; a separate table reached
  through a definer function took 1.9 ms including the join back ([R2]
  finding 1, probe). Marking the operators leakproof needs a superuser and does
  not survive managed services.
- `search.entries` has no RLS and no runtime access. The only way in is
  `app.search`, which filters on `app.tenant_id()`; the CI check allowlists
  exactly these definer functions (section 8).
- **One entry per indexed thing, returned as its result.** A user is its own
  result. A document's text is keyed by the document, so two documents on one
  host (a page in two languages, a lesson's blocks) never overwrite each other
  and tombstoning one clears only its own text; its result is the host.
  Translations are indexed the same way, so a message is found by its
  translated text. `app.search` returns each result once, with its best rank.
- **Scoped to the caller's schools.** `org_ids` holds the orgs where a person
  holds a current role (maintained from `user_roles`, and refreshed by the
  nightly job as roles end) or a document's school; empty means tenant-wide.
  The API passes the schools the caller works in as `org_scope`, which is
  applied before the limit, so a teacher in a ten-school group searching a
  common name gets their own school's matches first.
- **Search returns ids, not records.** The API joins them back to the RLS
  tables and applies the same relationship functions as any other read, so
  nothing remains reachable after a relationship ends [BA]. It pages with the
  `(rank, id)` keyset, fetching further pages until it has filled the caller's
  page or read five, and never returns a total, so a narrowly scoped caller
  learns nothing from what was filtered out.
- `name_norm` is names and titles, folded by `app.normalize_name` and matched
  by trigram word similarity, so partial and cross-script names work;
  `text_vector` is document text under the `arabic` and `english`
  configurations ([R2] section 8; [P]).
- Each host system's trigger writes its title as an entry with itself as the
  result, and deletes it when the host is tombstoned. Rows of an org still
  `importing` are indexed but excluded by `org_scope` until the flip.
- Health data, demographics, contact points, identifiers and relationship
  restrictions are never indexed. Guardian phone and school reference searches
  are exact matches through their own b-tree indexes (section 6.7).

### 6.20 Partition maintenance

```sql
create table ops.partitioned_tables (
  schema_name text not null,
  table_name text not null,
  period text not null check (period in ('month', 'year')),
  primary key (schema_name, table_name)
);
insert into ops.partitioned_tables (schema_name, table_name, period)
values ('core', 'activity_events', 'month'), ('audit', 'log', 'month'), ('audit', 'payloads', 'month');

create function app.ensure_partitions(months_ahead integer default 3, since date default null) returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent record;
  step interval;
  m date;
  last_start date;
  made integer := 0;
  part text;
begin
  for parent in select schema_name, table_name, period from ops.partitioned_tables loop
    step := case parent.period when 'month' then interval '1 month' else interval '1 year' end;
    m := date_trunc(parent.period,
           coalesce(since, (statement_timestamp() at time zone 'UTC')::date)::timestamp)::date;
    last_start := date_trunc(parent.period,
           (statement_timestamp() at time zone 'UTC') + make_interval(months => months_ahead))::date;
    while m <= last_start loop
      part := format('%s_%s_%s', parent.schema_name, parent.table_name,
                     to_char(m, case parent.period when 'month' then 'YYYY_MM' else 'YYYY' end));
      if to_regclass(format('parts.%I', part)) is null then
        execute format('create table parts.%I partition of %I.%I for values from (%L) to (%L)',
          part, parent.schema_name, parent.table_name,
          m::timestamp at time zone 'UTC', (m + step)::timestamp at time zone 'UTC');
        made := made + 1;
      end if;
      m := (m + step)::date;
    end loop;
  end loop;
  return made;
end $$;
revoke all on function app.ensure_partitions(integer, date) from public;
grant execute on function app.ensure_partitions(integer, date) to worker;

select app.ensure_partitions(3);
reset role;
```

- Monthly range partitions for `audit.log`, `audit.payloads` and
  `core.activity_events` ([R2] section 7). Other systems add their parents by
  inserting into `ops.partitioned_tables` in the migration that creates them
  (notifications and the delivery ledger monthly, attendance events yearly),
  never by redefining the function. The registry is cell metadata, not tenant
  data.
- There is no DEFAULT partition, so an insert outside the ranges fails loudly
  ("no partition of relation found for row"). A daily worker job creates three
  months ahead; an alert fires when fewer than two future partitions exist.
  Before an import of historical rows an operator runs the function as
  `cell_owner` with `since` set to the oldest legacy month.
- New partitions land in `parts`, where no runtime role has `USAGE` and no
  grants exist, because partitions do not inherit RLS ([R2] finding 2). Default
  privileges are never used.
- Retention runs as an operator task, not in the application: `DETACH PARTITION
... CONCURRENTLY` (it cannot run inside a function), export and verify the
  detached table, then drop it. The docs advise keeping OLTP partition counts
  in the dozens to low hundreds.

## 7. Request and tenant context contract

### 7.1 Where the tenant comes from

A unit of work gets its tenant from exactly one source, never from a request
header or a record id:

- **Signed-in request**: the tenant part of the session token (section 6.9),
  read from the tenant's cookie, which the school slug in the URL selects
  (section 3.3). The API opens the unit of work with that tenant and then
  finds the session; if none matches, the request is unauthenticated.
- **Passkey sign-in**: the tenant prefix of the user handle returned by the
  authenticator, then the lookup rule of section 6.9; for sign-in by password,
  the school chosen in the finder (a directory lookup of the slug).
- **SSO callback**: the tenant part of the `state` parameter, checked against
  the hash in the host-only cookie set when the flow began.
- **Public website**: the host (`directory.hosts`, verified) or
  `<slug>.<sites domain>`, resolved through the directory to tenant and
  school. It runs as the `site` role.
- **Worker job**: `tenantId` in the job payload, validated against
  `ops.tenant_registry`.
- **Collaboration**: the API's answer to the collaboration server's access
  check (section 7.6).
- **Integration** (OneRoster, LTI): at the token endpoint, the `client_id`,
  routed through `directory.integration_clients` and resolved in the cell to
  its tenant and org scope; on every later call, the tenant part of the access
  token. It runs as the `integration` role, and its unit of work carries the
  client's org scope, which the provider applies to every query, so a client
  of one school in a group sees only that school.
- **Provider callbacks** (email bounces and complaints, SMS delivery receipts
  and replies, push receipts): every message we send carries
  `<tenant uuid>.<delivery id>` in the provider's metadata or tag field, and
  reply-to addresses are `r+<tenant hex>.<token>@<reply domain>`. The callback
  arrives at `connect.<product domain>/callbacks/<provider>`, is routed to the
  cell by its tenant part, and the cell verifies the provider's signature
  before setting the tenant and updating the delivery ledger and
  `contact_points.bounced_at`, `complaint_at` or `unsubscribed_at`.
- **Carrier opt-outs** (an SMS STOP) apply to a sender number that every
  tenant of the cell may share, so they are cell-level: `ops.sms_suppressions`
  holds an HMAC of the number and the sender id, and the delivery worker checks
  it before sending from that sender. A STOP also sets `unsubscribed_at` on the
  matching contact points of the tenant whose message was answered.

The API process serving a cell answers a tenant not present in its
`ops.tenant_registry` exactly as it answers an invalid token.

### 7.2 The unit of work

Every database access happens inside a unit of work, one transaction per
procedure. Repositories receive the transaction handle explicitly; there is no
process-global database, tenant or user (AGENTS.md). The raw pools are visible
only to `packages/database/src/cell/context.ts`.

```ts
type ActorKind = "user" | "system" | "integration" | "import" | "operator";
type Profile = "staff_admin" | "staff" | "family" | "student" | "young_student";

interface UnitOfWorkContext {
  readonly tenantId: string;
  readonly requestId: string;
  readonly actor: {
    readonly kind: ActorKind;
    readonly userId?: string;
    readonly accountId?: string;
    readonly sessionId?: string;
  };
  readonly session?: {
    readonly context: "staff" | "family" | "student";
    readonly aal: 1 | 2 | 3;
    readonly activeOrgId?: string;
    readonly activeRole?: string;
  };
  readonly integration?: {
    readonly clientId: string;
    readonly kind: "oneroster" | "lti";
    readonly orgIds: readonly string[]; // the schools this client may see
  };
  readonly locale: "ar" | "en";
  readonly now: Date; // one clock for the whole unit of work
  schoolToday(orgId: string): string; // YYYY-MM-DD in the school's time zone
  profile(): Profile; // derived from the context and current roles
  capabilities(orgId: string): ReadonlySet<string>;
}

declare function withTenant<T>(
  ctx: UnitOfWorkContext,
  access: "read" | "write",
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T>;
```

`withTenant` runs on the `app` pool; `withSite` and `withIntegration` are the
same function on the `site` and `integration` pools. Each does, in order:

1. `begin` (READ COMMITTED).
2. One statement, `select app.begin_unit($1, $2, $3, $4, $5, $6)` (section
   4.4), which sets the tenant, binds it to this transaction, sets the actor
   settings the audit trigger reads, clears the purpose and returns the
   tenant's lifecycle. `is_local = true` is the only form that works through
   PgBouncer in transaction mode, which lists session `SET` as never supported
   ([R2] section 2).
3. Lifecycle. A caller that is not yet authenticated gets the invalid-token
   answer when the tenant is unknown or in a state that allows no sign-in, so
   the answer reveals nothing about which tenants exist. For an authenticated
   caller, a `write` unit of work fails with 503 and `Retry-After` unless the
   tenant is `active`; a `read` succeeds while it is `frozen`.
4. Run `work`. Audit rows, idempotency rows and pg-boss jobs are written with
   the same handle, so they commit or roll back with the change.
5. `commit`. When `work` failed with a denial or an error that must be
   audited, the rollback is followed by a short second transaction that writes
   only that audit row (section 7.8).

Rules that go with it:

- Invariants are constraints (unique, exclusion, `PERIOD`, checks) wherever
  one can express them. Where none can, the code takes `app.lock(<name>)` or
  `select ... for update` on the rows it reads before deciding.
- Queries are parameterised. `sql.raw` and string-built SQL are banned outside
  migrations (a lint rule). GUC-based RLS stops a missing `WHERE`; it does not
  stop SQL injection, because injected SQL can call `set_config` ([R2]
  section 2).
- `profile()` and `capabilities(orgId)` are resolved once per unit of work
  from the session's context, `user_roles`, `student_school_years`,
  `access_role_assignments` and the built-in roles (sections 6.8 to 6.10), and
  cached for the request only. A role change therefore applies at the next
  request.
- Relationship functions (`app.can_see_student(viewer, student, on_date)` and
  the like) are plain `security invoker` SQL functions in `app`, owned by the
  systems that need them, taking explicit ids and dates and reading no GUC but
  the tenant. They keep authorisation in SQL, where it applies to every query
  [BA], and out of RLS policies, which the docs warn race under READ COMMITTED
  when they consult other tables ([R2] section 3). They exclude every row
  scoped to an org whose `lifecycle` is `importing`.
- A record outside the caller's reach answers `NOT_FOUND`, never `FORBIDDEN`,
  so ids do not reveal existence (architecture.md).

### 7.3 What the runtime roles can and cannot do

`app` can:

- Read, insert and update rows of its own tenant in `core`, `audit` (insert
  and read only) and `health`, per section 5, with the purpose set for the
  gated tables.
- Call `app.tenant_id()`, `app.user_id()`, `app.lock()`,
  `app.tenant_lifecycle()`, `app.begin_unit()`, `app.search()`,
  `app.normalize_name()`, `app.change_year_span()` and the systems'
  relationship functions.
- Enqueue pg-boss jobs in its transaction.

`app` cannot:

- See or write another tenant's rows, or move a row to another tenant.
- Run anything without a tenant context bound to the current transaction (it
  raises).
- Delete or truncate anything.
- Update ledger rows (audit, consent, erasure approvals, versions, activity,
  import rows).
- Read health records, health reports, demographics or relationship
  restrictions without the matching purpose.
- Reach partitions, `search.entries`, `ops`, `staging` or `ext` directly.
- Create, alter or drop objects, change grants or policies, or assume another
  role.
- Insert tenants, insert schools (only departments), tombstone a school or
  group, change an org's type or place in the tree, change a tenant's kind,
  jurisdictions or root, or change a descriptor's code, meaning, school or
  mappings.
- Write a file's storage key, state, hash, encryption or derivatives, an
  account's user or passkey handle, a passkey's credential, or an access
  role's school or built-in key.
- Change a document's host, or the content of a frozen document.
- Backdate an audit row or write it in another actor's name.

`site` reads the public columns of active orgs, live file publications and the
website spec's published tables, nothing else. `integration` reads the tables
marked "integration read" in section 5 and inserts audit rows. `retention`
deletes expired ephemeral rows and, only against an approved erasure without a
legal hold, tombstones, nulls and deletes the rows listed in section 5.
`collab` is described in section 7.6.

### 7.4 Errors

The API maps database errors to domain errors by SQLSTATE and constraint name:

- `23505` unique, `23P01` exclusion: 409 `CONFLICT` with the domain code mapped
  from the constraint name (for example `user_roles_role_excl` becomes
  `role.overlapping`).
- `23503` foreign key, `23514` check: 422 validation errors mapped the same
  way; `23514` raised by `app.change_year_span` is
  `school_year.rows_outside_dates`.
- `55000` from a guard trigger or a closed year: 409 (`document.frozen`,
  `school_year.closed`).
- `F0412` from a definer function's version check: 412 or `CONFLICT`, as a
  version mismatch (section 4.8); `P0002` from one: 404.
- `42501` from `app.tenant_id()`, an RLS `WITH CHECK` failure (a purpose gate
  included) or a missing privilege: 500, logged with the request id and
  alerted. It is always a bug.
- `57014` statement timeout, `55P03` lock timeout: 503 with `Retry-After`
  (for idempotent creates, 409 `request_in_progress`, section 7.9).
- A version mismatch (no row returned by a versioned update): 412 or
  `CONFLICT`, section 4.8.

Error bodies follow RFC 9457 [BA]. The mapping table lives in code next to the
schema, and a test fails when a named constraint has no mapping.

### 7.5 PgBouncer and connections

- PgBouncer 1.26 or later in transaction mode, one pool per role (`app`,
  `site`, `integration`, `worker`, `collab`), `max_prepared_statements`
  non-zero for Bun SQL's prepared statements ([R2] section 10).
- Transaction-mode pooling forbids session `SET`, `LISTEN`, session advisory
  locks and `WITH HOLD` cursors; the contract above uses none. NOTIFY and
  transaction advisory locks work. A session-level setting some tool leaves
  behind is harmless, because the tenant binding refuses it (section 4.4).
- Migrations, the pg-boss supervisor, `retention` jobs and `cell_io` connect
  directly.

### 7.6 Workers, jobs and collaboration

- **pg-boss** lives in its own `pgboss` schema, owned by `pgboss_owner`,
  outside the tenant schemas, and runs with `migrate: false`; its schema
  migrations run in the migration pipeline through the pg-boss CLI.
  `useListenNotify` stays off because it cannot work through transaction
  pooling ([R2] section 11).
- **Grants on pgboss**, applied by the pipeline after it creates the queues:
  `send` inserts into the queue's job table joined to `pgboss.queue`, calls
  `pgboss.job_now()` and returns the new id (pg-boss 12 `insertJobs`, [R2]). So
  `app` gets SELECT on `pgboss.queue`, INSERT and column SELECT (`id`) on each
  job table, and EXECUTE on `pgboss.job_now()`; never table-wide SELECT on a
  job table, which would expose every tenant's payloads and outputs. `worker`
  gets what the pg-boss worker needs. Gate 1 checks both.
- **Enqueue inside the business transaction** with
  `boss.send(name, data, { db: fromDrizzle(tx, sql) })`, so the job row is the
  outbox and rolls back with the change.
- **Payloads carry `tenantId` and ids only**, never names or other student data,
  because the job table has no RLS. Singleton, throttle and group keys are
  built by one helper that prefixes the tenant id (gate 3), so one tenant's key
  can neither suppress nor reveal another's job.
- **Handler failures store codes, not messages.** A wrapper around every
  handler writes to the job's `output` only an error code and the request id;
  messages and stacks go to the log pipeline, which redacts.
- A worker handler opens its own `withTenant` with actor kind `system` and the
  job id as request id.
- Cell-wide schedules (the sealer, partition creation, nightly checks, the
  validity-boundary touch) run as one cron job that reads
  `ops.tenant_registry` and enqueues one job per active tenant with
  `singletonKey = '<tenant>:<job>'`.
- Offboarding deletes a tenant's jobs by `data->>'tenantId'`; erasure deletes
  jobs whose payload names the erased person. Job retention is open question 9.
- **Collaboration**: Hocuspocus connects as `collab`. On connect it asks the API
  (`POST /internal/documents/{id}/access`, with the user's session token) for
  the tenant and `read` or `write`; the API authorises through the host's own
  reference (section 6.12). The room name is `<tenant>:<document>` built from
  that answer; a client asking for a document the answer does not cover is
  disconnected. `collab` can then read collaborative documents and write only
  `ydoc`, `content`, `plain_text` and the last-edited columns, plus
  `checkpoint` versions of those documents (section 5). It holds no other
  access, so a compromise of the collaboration process exposes collaborative
  documents, not records or message history.
- **Collaboration stays inside the rules.** Each persist checks, in its
  transaction, that the tenant is `active` and uses a `write` answer from the
  API no older than 30 seconds. Revoking a session, ending a relationship,
  closing a school year or freezing a tenant publishes an invalidation that
  closes the affected connections, so a closed year or a frozen tenant cannot
  be edited through an open socket.

### 7.7 Purposes

```ts
type Purpose = "health" | "demographics" | "custody";

declare function withPurpose<T>(
  tx: CellTransaction,
  use: {
    purpose: Purpose;
    subjectUserId: string;
    reason: string;
    write: boolean;
  },
  work: () => Promise<T>,
): Promise<T>;
```

It checks the capability for the purpose, inserts the audit row
(`health_record.read`, `demographics.read`, `relationship_restriction.write`
and so on) with the subject, then:

1. `savepoint purpose`, then `select set_config('app.purpose', $purpose, true)`.
2. Runs `work`.
3. In a `finally`: sets the purpose back to `''` and releases the savepoint;
   when `work` threw, it rolls back to the savepoint first, which also undoes
   the setting, and rethrows.

So a caller that catches an error and carries on in the same transaction never
does so with the purpose still set; a test asserts it. The OneRoster
demographics resource uses the same function with an integration actor.

### 7.8 Audit in the unit of work

Every mutating procedure writes one `audit.log` row per changed aggregate in
its transaction, with a payload row when values changed, and `subject_user_id`
set when the aggregate is about a person. The trigger fills `occurred_at` and
the actor columns from the context, so a procedure supplies only the action,
object, subject and details. Payloads follow the denylist of section 6.14.
Denied and failed operations that must leave a trace (a refused sign-in, a
denied export) are written by the unit of work in a second, short transaction
after the rollback. A test per mutating procedure asserts the audit row exists.

### 7.9 Idempotent creates

1. The client sends `Idempotency-Key` (REST) or `idempotencyKey` (RPC) on a
   create-type mutation.
2. First statement after the context:
   `insert into core.idempotency_keys (tenant_id, account_id, key, request_hash, procedure) values (...) on conflict do nothing returning key`.
   If another request with the same key is in flight, this waits on its unique
   index entry; if that request commits, the insert returns nothing, and if it
   rolls back, the insert proceeds.
3. A row returned: do the work, then set `response_status`, `response_body`
   (null for a sensitive procedure, section 6.16), `resource_type` and
   `resource_id` before commit.
4. Nothing returned: read the stored row. A different `request_hash` answers
   422 `idempotency_key_reused`; otherwise replay the stored response with
   `Idempotent-Replayed: true`, or for a sensitive procedure re-read the
   resource or answer 409.
5. A wait longer than `lock_timeout` (2 s) answers 409 `request_in_progress`,
   as Stripe does for concurrent requests.

### 7.10 Outbound requests

Every fetch of a URL a tenant can influence (identity-provider metadata,
the newsletter link check, webhook deliveries, a legacy object during import)
goes through the cell's egress proxy. It allows `https` only, resolves the
name once and connects to that address, and refuses private, loopback,
link-local and cell-internal ranges (the metadata service, Valkey, Postgres,
the internal API), with size and time limits. Destinations the platform itself
chose (the email, SMS and push providers, KMS, object storage) are allowlisted
by name at the network layer; nothing else leaves the cell except through the
proxy.

## 8. CI checks

CI builds a cell from an empty Postgres 18 cluster (builtin `C.UTF-8`), applies
the role provisioning and every migration, creates the pg-boss queues with
their grants, and then runs three gates.

**Gate 1: the catalogue check** must return no rows ([P] ran it: no rows for
this schema, and one row per planted defect). The lists at its top are part of
the contract: adding a definer function, a `DELETE` grant, a column-granted
table or a purpose gate means changing them in the same review.

```postgresql
with runtime(role) as (values ('app'), ('site'), ('integration'), ('worker'), ('collab'), ('cell_io'), ('retention')),
t as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity as r, c.relforcerowsecurity as f,
         n.nspname || '.' || c.relname as name,
         exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'version' and not a.attisdropped)
           as versioned
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health') and c.relkind in ('r', 'p') and not c.relispartition
),
delete_allowed(name, role) as (values
  ('core.sessions', 'retention'), ('core.auth_attempts', 'retention'), ('core.idempotency_keys', 'retention'),
  ('core.external_ids', 'retention'), ('core.contact_points', 'retention'),
  ('core.relationship_restrictions', 'retention'),
  ('core.login_identities', 'retention'), ('core.passkeys', 'retention'), ('core.devices', 'retention'),
  ('core.files', 'retention'), ('core.file_subjects', 'retention'), ('core.user_preferences', 'retention'),
  ('core.saved_views', 'retention'), ('core.activity_events', 'retention'), ('health.records', 'retention'),
  ('audit.payloads', 'retention')),
unversioned_update_allowed(name, role) as (values
  ('core.sessions', 'app'), ('core.sessions', 'worker'), ('core.auth_attempts', 'app'), ('core.auth_attempts', 'worker'),
  ('core.idempotency_keys', 'app'), ('core.idempotency_keys', 'worker'), ('core.tenant_keys', 'worker'),
  ('core.tenant_keys', 'retention'), ('core.document_versions', 'retention')),
column_granted(name, role) as (values
  ('core.tenants', 'app'), ('core.orgs', 'app'), ('core.descriptors', 'app'), ('core.files', 'app'),
  ('core.accounts', 'app'), ('core.passkeys', 'app'), ('core.access_roles', 'app')),
purpose_gated(name, policy, purpose) as (values
  ('health.records', 'purpose_gate', 'health'), ('core.demographics', 'purpose_gate', 'demographics'),
  ('core.relationship_restrictions', 'purpose_gate', 'custody'), ('core.files', 'files_purpose_gate', null)),
required_trigger(name, trigger) as (values
  ('audit.log', 'hash_row'), ('audit.log', 'refuse_update_delete'), ('audit.log', 'refuse_truncate'),
  ('audit.payloads', 'check_payload'), ('audit.payloads', 'refuse_update'),
  ('audit.seal_batches', 'refuse_update_delete'), ('audit.seal_members', 'refuse_update_delete'),
  ('audit.anchors', 'refuse_update_delete'), ('core.documents', 'documents_frozen_guard')),
outside_allowed(name, role, privilege) as (values
  ('ops.tenant_registry', 'worker', 'SELECT'), ('ops.sms_suppressions', 'worker', 'SELECT'),
  ('ops.sms_suppressions', 'worker', 'INSERT'), ('ops.sms_suppressions', 'worker', 'DELETE'),
  ('pgboss.queue', 'app', 'SELECT')),
definer_allowed(proc) as (values
  ('app.tenant_lifecycle()'), ('app.search(text,text[],uuid[],real,uuid,integer)'), ('app.index_user()'),
  ('app.index_user_orgs()'), ('app.index_document()'), ('app.index_translation()'),
  ('app.ensure_partitions(integer,date)'), ('app.change_year_span(uuid,daterange,integer)'))
select name, 'first column is not tenant_id' as problem from t
  where not exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attnum = 1 and a.attname = 'tenant_id')
union all
select name, 'row level security not enabled and forced' from t where not (r and f)
union all
select name, 'no restrictive tenant_isolation policy' from t where not exists (
  select 1 from pg_policy p where p.polrelid = t.oid and p.polname = 'tenant_isolation'
    and not p.polpermissive and p.polcmd = '*' and p.polroles = '{0}'
    and pg_get_expr(p.polqual, p.polrelid) = '(tenant_id = ( SELECT app.tenant_id() AS tenant_id))'
    and pg_get_expr(p.polwithcheck, p.polrelid) = '(tenant_id = ( SELECT app.tenant_id() AS tenant_id))')
union all
select name, 'permissive policy ' || p.polname || ' applies to public' from t
  join pg_policy p on p.polrelid = t.oid where p.polpermissive and p.polroles @> '{0}'
union all
select pg.name, 'purpose gate ' || pg.policy || ' missing or not restrictive' from purpose_gated pg
  where not exists (select 1 from pg_policy p where p.polrelid = to_regclass(pg.name) and p.polname = pg.policy
    and not p.polpermissive and p.polcmd = '*' and p.polroles = '{0}'
    and (pg.purpose is null or pg_get_expr(p.polqual, p.polrelid) like '%''' || pg.purpose || '''%'))
union all
select name, p.polname || ' lets retention change rows without an erasure approval' from t
  join pg_policy p on p.polrelid = t.oid
  where p.polcmd in ('w', 'd') and p.polroles @> array[(select oid from pg_roles where rolname = 'retention')]
    and name not in ('core.tenant_keys', 'core.auth_attempts')
    and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%erasure_%'
union all
select name, k.conname || ' does not lead with tenant_id' from t
  join pg_constraint k on k.conrelid = t.oid and k.contype in ('p', 'u', 'x', 'f')
  where (select attname from pg_attribute where attrelid = t.oid and attnum = k.conkey[1]) <> 'tenant_id'
union all
select name, k.conname || ' references a key without tenant_id first' from t
  join pg_constraint k on k.conrelid = t.oid and k.contype = 'f'
  where (select attname from pg_attribute where attrelid = k.confrelid and attnum = k.confkey[1]) <> 'tenant_id'
union all
select name, i.indexrelid::regclass::text || ' is unique without tenant_id first' from t
  join pg_index i on i.indrelid = t.oid
  where i.indisunique and (select attname from pg_attribute where attrelid = t.oid and attnum = i.indkey[0])
    is distinct from 'tenant_id'
union all
select n.nspname || '.' || c.relname, 'view without security_invoker' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health', 'app') and c.relkind in ('v', 'm')
    and not coalesce('security_invoker=true' = any (c.reloptions), false)
union all
select n.nspname || '.' || c.relname, 'sequence in a tenant schema' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health') and c.relkind = 'S'
union all
select p.oid::regprocedure::text, 'security definer without a pinned search_path' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
    and not exists (select 1 from unnest(p.proconfig) s where s = 'search_path=pg_catalog, pg_temp')
union all
select p.oid::regprocedure::text, 'security definer not on the allowlist' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
    and p.oid::regprocedure::text not in (select proc from definer_allowed)
union all
select p.oid::regprocedure::text, 'function executable by public' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'audit', 'core', 'health', 'search', 'ops')
    and has_function_privilege('public', p.oid, 'execute')
union all
select p.oid::regprocedure::text, 'function owned by ' || pg_get_userbyid(p.proowner) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'audit', 'core', 'health', 'search', 'ops')
    and pg_get_userbyid(p.proowner) <> 'cell_owner'
union all
select name, runtime.role || ' holds TRUNCATE' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'TRUNCATE')
union all
select name, runtime.role || ' holds DELETE' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'DELETE')
    and (name, runtime.role) not in (select name, role from delete_allowed)
union all
select name, runtime.role || ' can update a table without versions' from t, runtime
  where not t.versioned and has_any_column_privilege(runtime.role, t.oid, 'UPDATE')
    and (name, runtime.role) not in (select name, role from unversioned_update_allowed)
union all
select name, runtime.role || ' holds table-wide UPDATE where only columns are granted' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'UPDATE')
    and ((name, runtime.role) in (select name, role from column_granted)
         or (runtime.role = 'retention' and name <> 'core.tenant_keys'))
union all
select req.name, 'trigger ' || req.trigger || ' missing' from required_trigger req
  where not exists (select 1 from pg_trigger g where g.tgrelid = to_regclass(req.name)
    and g.tgname = req.trigger and not g.tgisinternal)
union all
select c.oid::regclass::text, runtime.role || ' can reach a partition' from pg_class c, runtime
  where c.relispartition and (has_table_privilege(runtime.role, c.oid, 'SELECT')
    or has_table_privilege(runtime.role, c.oid, 'INSERT') or has_table_privilege(runtime.role, c.oid, 'UPDATE'))
union all
select s.nspname, runtime.role || ' has USAGE on ' || s.nspname from pg_namespace s, runtime
  where s.nspname in ('parts', 'search', 'staging', 'ops', 'ext') and has_schema_privilege(runtime.role, s.oid, 'USAGE')
    and not (s.nspname = 'staging' and runtime.role = 'cell_io')
    and not (s.nspname = 'ops' and runtime.role = 'worker')
union all
select n.nspname || '.' || c.relname, runtime.role || ' holds ' || priv || ' outside the tenant schemas'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, runtime,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and n.nspname not in ('core', 'audit', 'health', 'pg_catalog', 'information_schema', 'pg_toast', 'staging')
    and not (n.nspname = 'pgboss' and runtime.role = 'worker')
    and not (n.nspname = 'pgboss' and runtime.role = 'app' and priv = 'INSERT' and c.relname like 'job%')
    and has_table_privilege(runtime.role, c.oid, priv)
    and (n.nspname || '.' || c.relname, runtime.role, priv) not in (select name, role, privilege from outside_allowed)
union all
select n.nspname || '.' || c.relname, runtime.role || ' can use a sequence' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace, runtime
  where c.relkind = 'S' and n.nspname not in ('pgboss', 'staging')
    and has_sequence_privilege(runtime.role, c.oid, 'USAGE')
union all
select name, 'entity table lacks ' || col from t,
  unnest(array['id', 'status', 'date_last_modified', 'version', 'metadata', 'created_at']) as col
  where t.versioned
    and not exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = col and not a.attisdropped)
    and not (col = 'id' and exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = t.oid and p.proname = 'row_meta_keyed'))
union all
select name, 'entity table without row_meta trigger' from t
  where t.versioned
    and not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = t.oid and p.proname in ('row_meta', 'row_meta_keyed') and not g.tgisinternal)
union all
select name, 'status column without the tombstone vocabulary' from t
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'status' and not a.attisdropped
  where not exists (select 1 from pg_constraint k where k.conrelid = t.oid and k.contype = 'c'
    and pg_get_constraintdef(k.oid) = 'CHECK ((status = ANY (ARRAY[''active''::text, ''tobedeleted''::text])))')
union all
select name, 'id default is not uuidv7()' from t
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'id' and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  where coalesce(pg_get_expr(d.adbin, d.adrelid), '') <> 'uuidv7()'
union all
select coalesce(n.nspname, '(all)'), 'default privileges defined' from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
union all
select c.oid::regclass::text, 'owned by ' || pg_get_userbyid(c.relowner) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'core', 'audit', 'health', 'parts', 'search', 'ops')
    and pg_get_userbyid(c.relowner) <> 'cell_owner'
union all
select rolname, 'role bypasses row level security' from pg_roles
  where rolbypassrls and rolname not in ('backup_dump', 'break_glass') and not rolsuper
order by 1, 2;
```

**Gate 2: the behavioural isolation test**, generated from the catalogue so a
new table is covered without anyone writing a test. For every table in `core`,
`audit` and `health`, as superuser seed one row for tenant A and one for
tenant B (a fixture factory per table builds valid rows), then as **each
runtime role** (`app`, `site`, `integration`, `worker`, `collab`, `cell_io`,
`retention`) with tenant A bound to the transaction, and once with each
purpose for the gated tables:

- `select count(*) ... where tenant_id <> A` returns 0, or the read is refused.
- An insert with `tenant_id = B` fails with SQLSTATE 42501.
- An update setting `tenant_id = B` fails with 42501 (entity and keyed tables).
- `delete` fails with "permission denied" unless on the allowlist, and an
  allowlisted `retention` delete touches no row without an approved erasure.
- The same select with no tenant set raises "tenant context is not set", and so
  does one after a session-level `SET app.tenant_id` with no binding.
- A gated table shows no row without its purpose.

It also runs, as `app`, every relationship function against a two-school
fixture tenant and asserts that a teacher at school A reaches no student of
school B. Then it runs the specific checks [P] ran: a storage key moved into another
tenant's prefix, an audit row backdated or written in another name, a
mismatched payload, the collaboration role on a frozen document, the `site`
and `integration` reach, `app.change_year_span` on a generated year,
`withPurpose` leaving no purpose set after a caught error, and a document save
that tries to reference a file the saving person cannot read.

**Gate 3: static checks** on the TypeScript source and the migrations:

- No `set_config(..., false)`, `SET ` or `RESET ` outside
  `packages/database/src/cell/context.ts`.
- No `sql.raw` outside migrations.
- No import of the raw pools outside the context module.
- No migration contains `disable row level security`,
  `no force row level security`, `drop policy tenant_isolation`, an `owner to`
  a role other than `cell_owner`, or `bypassrls`.
- Every named constraint has an error mapping (section 7.4).
- Every pg-boss `singletonKey` and group key comes from the tenant-prefixing
  helper.
- Every descriptor namespace used in a `*_ns` generated column exists in the
  seed catalogue; every seed value has both labels and a meaning where the
  namespace requires one; every `grade_level` OneRoster token is a CEDS Entry
  Grade Level code.
- Every `host_type` a document may carry has an entry in the host registry,
  naming a host table with a foreign key to `core.documents`.
- Every procedure whose response carries a secret or special-category data is
  marked sensitive, and every table with a payload denylist has its test.

## 9. Migration generation rules

1. **Source of truth.** The cell schema is Drizzle v1 TypeScript in
   `packages/database/src/cell/`, with its own `drizzle.cell.config.ts` writing
   to `drizzle-cell/`. The legacy `drizzle/` and `drizzle-control/` stay
   untouched until the last school has moved.
2. **Generated migrations are never edited** (AGENTS.md). If the output is
   wrong, change the schema and regenerate.
3. **What Drizzle declares**: tables, columns (including `bytea`, `cidr`,
   arrays and `generatedAlwaysAs(...)` stored columns), composite primary,
   unique and foreign keys, partial and expression indexes (the ICU collation
   indexes as `sql` expressions), `NULLS NOT DISTINCT`, checks, `pgTable.withRLS`
   and `pgPolicy` for the isolation, permissive and purpose-gate policies (one
   `pgPolicy` object reused across tables becomes a policy per table), roles
   declared as `pgRole(...).existing()` ([R2] section 9). `daterange` and
   `tsvector` are `customType`s. Ids use ``.default(sql`uuidv7()`)``, never
   `.defaultRandom()`.
4. **What goes in a custom migration** (`drizzle-kit generate --custom --name
<topic>`), committed in the same change right after the generated migration
   it completes: `FORCE ROW LEVEL SECURITY`; grants and revokes, including
   column grants; functions and triggers; `EXCLUDE`, `WITHOUT OVERLAPS` and
   `PERIOD` keys; deferrable keys; extensions and schemas; partitioned tables
   and their registry rows in `ops.partitioned_tables`; views. Drizzle rc.4
   emits none of these ([R2] finding 8).
5. **Partitioned tables** are declared in a TypeScript module the app imports
   for types but `drizzle.cell.config.ts` does not list, because drizzle-kit has
   no `PARTITION BY`; their DDL lives only in custom migrations ([R2] section 7).
6. **Never `drizzle-kit push`** against a cell; it introspects and would drop
   what it does not understand. `generate` diffs snapshots and leaves unknown
   constraints alone.
7. **Execution.** Migrations run as `migrator` with `SET ROLE cell_owner`, over
   a direct connection, in one transaction, with `lock_timeout = 5s`. An index
   on a large existing table is built beforehand by an operator with
   `CREATE INDEX CONCURRENTLY` and declared `IF NOT EXISTS` in the migration.
8. **No tenant data in migrations.** A migration has no tenant context, so it
   can read and write no tenant rows. Backfills and seed additions are
   per-tenant worker jobs, run after the migration that adds the column and
   before the one that makes it `NOT NULL`. Cell metadata without tenants
   (`ops.partitioned_tables`) may be written by a migration.
9. **Expand and contract** for every change a running release depends on: add,
   backfill, switch reads, then drop in a later release.
10. **Roles and role settings** are provisioning code, not migrations: the
    runtime roles including `site` and `integration`, `pgboss_owner`, the
    operators' personal roles, and the `pg_hba.conf` rule for `backup_dump`.
11. **The pg-boss pipeline step** runs the pg-boss CLI migrations as
    `pgboss_owner`, creates or updates the queues, and re-applies the grants of
    section 7.6 to every job table, because a new queue gets a new table and
    default privileges are never used.
12. **CI**: apply every migration to an empty cluster; run `drizzle-kit
generate` and fail if it writes a file (schema and migrations disagree);
    run gates 1 to 3 (section 8).

## 10. Legacy import mapping

Each real school moves by verified import: freeze, export, transform, import,
verify, flip, unfreeze, with the untouched legacy database kept read-only as
the rollback ([../platform-migration.md](../platform-migration.md)). This
section fixes how the legacy data lands in the foundation tables; other specs
own their tables' mapping.

### 10.1 Pipeline

**Rehearsal**, weeks before the window, against a copy of the school's
database, produces the reports the school and the owner decide on. Nothing in
the cut-over itself makes a judgement call:

- **Pre-flight.** The copy is staged and imported into a scratch tenant of a
  rehearsal cell, which runs every target constraint. The report lists each
  legacy row that would fail, per school: overlapping years, sibling terms that
  overlap, terms, weeks or holidays outside their year, weeks longer than seven
  days or numbered above 60, emergency priorities outside 1 to 99, addresses
  over 500 characters, subject names over 75, emails over 254. The school
  fixes them at the source before the freeze. Nothing is clamped silently;
  where a value must be shortened, the original is kept in `metadata.legacy`.
- **URL inventory.** Every URL column (`students.photo_url`,
  `users.avatar_url`, `medical_reports.url`, `message_attachments.url`,
  `newsletters.url`) is listed with the origin that serves each prefix, every
  object is fetched through the egress proxy, and its size and SHA-256 go into
  the manifest. Unreachable ones are reported.
- **Decision reports**: access (each user's legacy effective permissions
  against the imported capabilities, and users with no permissions at all);
  relations inferred from phone numbers; within-school duplicate adults; for a
  school joining a group, merge candidates; the weekend days derived from the
  timetable; the grade-string mapping table; the legacy password-hash
  algorithms present.

The cut-over:

1. **Freeze** the legacy school database:
   `alter database <school> set default_transaction_read_only = on`, then end
   the legacy app's open connections to it with `pg_terminate_backend`, since
   the setting applies to new sessions only. Reads keep working.
2. **Export** every table with `COPY ... TO` into files, with a manifest of row
   counts and SHA-256 per file. The files go to the cell's region only, under
   `t/<tenant_id>/imports/<run id>/` in the private bucket, encrypted, with a
   lifecycle rule that deletes them when the rollback window closes.
3. **Transform** in the importer, which holds the tenant's DEKs: the medical
   free text and the medical report names are encrypted under the health key
   before anything is staged, so the cell never receives plaintext health
   data; password hashes go to a staging table of their own.
4. **Stage.** `cell_io` creates unlogged tables in `staging` (prefixed by the
   run id) and loads the files with `COPY`. `COPY FROM` is refused on RLS
   tables ("COPY FROM not supported with row-level security", [R2] finding 3),
   which is why staging has no RLS and only `cell_io` can see it. Backups leave
   staging out (section 4.2).
5. **Map ids** in `staging.id_map (legacy_school_id, legacy_table, legacy_id,
target_table, target_id, kind)`, where `kind` is `kept`, `merged_into` or
   `split`. Ids are kept wherever a legacy row becomes one target row.
6. **Insert** into the cell with `INSERT ... SELECT` from staging, inside
   transactions with the tenant context set, so every policy `WITH CHECK`, key
   and constraint applies. Order: tenant and orgs, descriptors, sessions and
   calendars, locations, files, users, accounts and identities, placements and
   roles, relationships, contact points, health, consent,
   access roles, audit history, then the other systems. `cell_io` supplies
   legacy `created_at` values, and a document's version when it brings
   history (section 10.3). A school joining a live group lands with
   `orgs.lifecycle = 'importing'`. The password staging table is dropped as
   soon as the identities are in, and its absence verified.
7. **Files**: copy each object, from the legacy store
   (`FILE_STORAGE_DIR/<school id>/<file id>`) and from the URL inventory, to
   `t/<tenant>/q/<file id>`, verify its SHA-256 against the manifest, scan it
   (files stored before a scanner existed have none), then mark it ready under
   `t/<tenant>/f/<file id>`, or encrypt it into `h/` for a health report. Every
   imported file gets `linked_at`, so the unlinked-file sweep never touches
   one.
8. **Seal and index.** Every audit row the import writes carries the run id as
   its `request_id`; a one-off seal job running as `worker` seals exactly those
   rows (section 6.14). The search triggers have indexed names and documents
   on insert.
9. **Verify** (section 10.4).
10. **Flip.** Set the org's lifecycle (or the tenant's) to `active`; a worker
    job touches every row the import created, found through `staging.id_map`,
    so delta consumers receive them with a current `date_last_modified`; then
    flip `directory.schools.placement` to `cell`.
11. **Roll back**, if needed, by flipping the placement back and resetting the
    legacy database to read-write. Before the flip nothing was served, so an
    operator task running as `cell_owner` with the tenant context set deletes
    exactly the rows the import created (people merged into existing users keep
    their row and lose only the new school's roles and relationships). After
    the flip, rows may have reached integrations, so the task tombstones them
    instead, and a later rerun restores them by id rather than inserting.
    Audit rows are inserted with `on conflict do nothing`, so a rerun does not
    duplicate them. Writes made in the cell after the flip are exported for
    re-entry before the rollback.
12. **Clean.** The data staging tables are dropped as soon as verification
    passes and never later than 30 days after the export; `staging.id_map`,
    which holds only ids, is kept until the rollback window closes, together
    with the encrypted export files. A nightly check reports any staging table
    past its limit.

A school joining an existing group tenant is imported into the live tenant.
Until its flip, its slug still routes to the legacy stack and its org is
`importing`, so relationship functions, search and the OneRoster provider
leave its rows out, and a person who already belongs to another school of the
group gains nothing visible until the flip.

### 10.2 Control database

- `schools` (one row per school):
  - `id` becomes `core.orgs.id` (type `school`) and `directory.schools.id`,
    kept; `directory.schools.legacy_school_id` records it too; `created_at`
    becomes the org's `created_at`.
  - A new tenant id (UUIDv7) for a standalone school; for a school joining a
    group, the group's tenant.
  - `slug` goes to `directory.schools.slug`.
  - `name` goes to `name_ar` when it contains Arabic script and to `name_en`
    otherwise; the other is filled by the school at review.
  - `time_zone` goes to `orgs.time_zone`.
  - `public_domain` goes to `directory.hosts`, verified again before it
    routes.
  - `is_active = false` means the school is not moved: its database is
    exported, encrypted, archived in its region for the retention period
    (open question 9), and then deleted.
  - `database_url` is not copied.
- `sessions` are not migrated; everyone signs in again after cut-over. New
  tokens carry the tenant, legacy ones cannot.
- `login_attempts` are not migrated.

### 10.3 Per-school tables into foundation tables

General rules:

- Script detection: a value containing any character in U+0600 to U+06FF is
  Arabic script, otherwise Latin script. Names and titles go to the `_ar` or
  `_en` column by it.
- `''` (the legacy default of many text columns) becomes null.
- Legacy `created_at` becomes `created_at`. Where the product shows a "last
  changed" date (access roles, site settings), the legacy `updated_at` is kept
  as `metadata.legacy.updated_at`.
- Legacy names are single fields for `users` and first and last for
  `students`.

**Organisation and calendar**

- **`subjects`** become descriptors in namespace `subject` (owned by the
  teaching spec): `id` kept, `slug` as `code_value`, `name` as `label_en`,
  `name_ar` as `label_ar`, `icon` kept. The first school of a tenant imports
  them tenant-wide. A school joining a group merges a subject with an equal
  code into the existing descriptor (`merged_into` in the id map) and records a
  differing label as a descriptor override at its org; a new code is added
  scoped to the joining school.
- **`school_years`** become `academic_sessions` of type `school_year`:
  - `id` kept; `span = [starts_on, ends_on + 1)`, because legacy `ends_on` is
    inclusive (checks allow `starts_on <= ends_on`, [R1] section 6).
  - `school_year = extract(year from ends_on)`; `name` as the title, by script.
  - `lifecycle`: `is_current` gives `current`; `planning` gives `upcoming`;
    `closed` gives `closed`; `active` but not current gives `upcoming` if it
    starts after the current year and `closed` otherwise. When no year is
    current, every active year that starts after the cut-over date is
    `upcoming` and the rest `closed`. Both cases are reported.
  - `revision` is dropped (the trigger starts `version` at 1).
- **`terms`** become `academic_sessions` of type `term` under their year:
  `id` kept, `span = [starts_on, ends_on + 1)`, `sequence` by start date. The
  importer also creates one `grading_period` per term with the same span (new
  id), because the legacy integer grades need a period to belong to ([R1]
  section 6).
- **`academic_weeks`** become `academic_weeks`: `id` kept,
  `span = [starts_on, ends_on + 1)`, `number` kept.
- **Weekend days** are the ISO weekdays on which the school's
  `timetable_slots` never fall, confirmed at rehearsal, and otherwise the
  jurisdiction's default; they go to `orgs.weekend_days`. A school that
  teaches on Saturday must not have every Saturday marked as weekend.
- **Calendars**: one `school` calendar per year (code `MAIN`), with one
  `calendar_dates` row for every date of the year: `weekend` on the weekend
  days, `public_holiday` for dates inside a legacy `calendar_events` row of
  category `national_vacation` (its `ends_on` is inclusive), `school_holiday`
  for `school_vacation`, `instructional_day` otherwise. A vacation wins over
  `weekend` on the same date. The vacation's title becomes the date's note by
  script; a `provisional` vacation adds "(TBC)" or "(غير مؤكد)" to the note and
  `metadata.legacy.provisional = true`. The events themselves go to the
  communication spec's calendar events.
- **Class periods** come from `timetable_slots`: the distinct
  `(start_time, end_time)` pairs of a year, ordered by start, become
  `class_periods` with codes `1`, `2`, ..., `kind = 'lesson'` and
  `valid_during` the year's span. Legacy weekday `0` (Sunday) becomes ISO `7`;
  the slots themselves go to the timetable spec.
- **Locations**: the distinct values of `classes.room` and
  `timetable_slots.room` per school, trimmed and compared case-folded, become
  `core.locations` rows (kind `room`, name by script, the value as `code` when
  it fits). The teaching and timetable imports reference them.
- **`site_settings`**: `logo_file_id` becomes `orgs.logo_file_id`, and that
  file's purpose becomes `logo`; contact email, phone and address fill the
  org's fields where they are empty (the address as `{"lines": [text]}`);
  `default_locale` becomes `orgs.default_locale`; the rest belongs to the
  website spec.
- **`school_features`** become `core.org_features` at the school org
  (`key` as `feature`, `enabled` kept).

**People**

- **`users`** (admins, teachers, parents; students are below):
  - `id` kept as `users.id`; `primary_org_id` is the school.
  - `name` into `full_name_ar` or `full_name_en` by script, parts split on
    whitespace (first token given, last token family, the rest middle) with
    `name_parts_source = 'import_split'` for review.
  - `username = lower(email)`.
  - `title` into `user_roles.title_ar` or `title_en` by script.
  - `avatar_url`: an object found by the URL inventory becomes a `files` row
    (purpose `avatar`, linked) and `photo_file_id`; an unreachable URL is
    reported and kept in `metadata.legacy.avatar_url`.
  - An `accounts` row (new id): `state` is `active` or, for
    `is_active = false`, `disabled`; `last_signed_in_at` becomes
    `last_authenticated_at`, and also `first_authenticated_at` (a lower bound,
    marked `metadata.legacy.first_authenticated_estimated = true`), so
    everyone who has signed in does not show as "never signed in".
  - A `login_identities` row of kind `password`: `login_name = lower(email)`,
    `secret_hash = password_hash` verbatim (a PHC string from `Bun.password`),
    `link_method = 'import'`.
  - `email` and `mobile` become `contact_points` (`legacy_unverified`,
    purposes `notify`); the mobile is normalised to E.164 with the school's
    country code, and left unnormalised and flagged when that fails.
  - `role`: `admin` gives a `site_administrator` role and `teacher` a
    `teacher` role at the school from `created_at`, source `import`. `parent`
    gives no role directly: family roles are computed after relationships and
    placements are in (below). A parent with no guardianship keeps the account
    but gets no role, and is listed for review.
  - `is_active = false` means the person has left: every imported role ends at
    the later of the legacy `updated_at` date and the day after the role
    starts, and the account is disabled. The list is reviewed at rehearsal.
  - `notification_preferences.locale` becomes `preferred_locale`. A user with
    no preferences row gets `en`, the legacy default, so nobody's notification
    language changes at cut-over (open question 20).
  - A `student`-role user that no `students.user_id` points at is reported for
    the school to link or discard.
- **`students`**:
  - `id` kept as `users.id`; `primary_org_id` is the school.
  - `first_name`, `last_name` into the given and family parts of the matching
    script, the full name as their concatenation,
    `name_parts_source = 'import_parts'`.
  - `birthdate` into `birth_date` with source `import`, null kept.
  - `photo_url` as for `avatar_url`.
  - `reference` becomes an `external_ids` row of system `school_reference`,
    assigned by the school, valid from the start of the student's first
    placement below.
  - `username` from the reference, as section 6.7 builds it.
  - **Placements.** One `student_school_years` row per legacy school year in
    which the student had a non-empty enrolment (`until` null or later than
    `since`), from the earliest enrolment start in that year to the latest end,
    clipped to the year. Zero-length enrolments are skipped. The grade comes
    from the homeroom class's `grade` string through the per-school mapping
    table confirmed at rehearsal, null and reported when unmapped. The first
    placement's entry type is left null; later ones are `continuing`. When
    every enrolment ended before the cut-over, the last placement gets exit
    type `other` and is reported for the school to name the reason. A student
    with no non-empty enrolment at all gets one placement in the current year
    from the later of the year's start and `students.created_at`, with no
    grade, and is listed as unplaced. The student role is then derived from the
    placements (section 6.8).
  - `user_id` (the student's own sign-in): that legacy `users` row does not
    become a second person. Its account and password identity attach to the
    student's user; its `last_signed_in_at` goes to the account; its email and
    mobile become the student's contact points (`legacy_unverified`); a
    differing `name` is kept in `metadata.legacy.login_name`; and
    `staging.id_map` maps the legacy user id to the student's user id for every
    table that references it (submissions, messages).
- **`guardianships`** become `user_relationships` (new id; the legacy key was
  the pair):
  - Relation `father` gives descriptor `father`, `mother` gives `mother`,
    `other` gives `other_relative`. **`guardian` gives `unspecified`**, because
    the legacy admin form wrote `guardian` for every link it created, so the
    value is a default, not a finding; exporting it as a legal guardian would
    be a false legal assertion.
  - Inference: when the student's `student_contacts.father_mobile` (or
    `mother_mobile`) normalises to the guardian's own mobile, the relation is
    `father` (or `mother`), and `metadata.legacy.relation_inferred_from`
    records the column. Inferred or not, every imported relationship is
    `import_unverified` and queued for the registrar.
  - `is_primary` becomes `primary_contact`. When none of a student's
    guardians is primary, the earliest-created guardianship is, marked
    `metadata.legacy.primary_inferred = true`.
  - `portal_access` and `receives_notifications` are true (they had access and
    were notified).
  - `legal_guardian`, `residence` and `pickup` are null (not recorded).
  - `valid_during = [created_at::date, )`.
- **Family roles** are computed once relationships and placements are in, by
  the same function the relationship service uses (section 6.8), so imported
  rows and later derivations never disagree.
- **`student_contacts`**:
  - `father_mobile`, `mother_mobile` and `contact_mobile` are normalised and
    matched against the mobile contact points of every guardian of the
    student, whatever the relation. A match adds the number to that guardian
    (`label = 'mobile'`) unless it is already there. An unmatched father or
    mother number goes to the guardian whose relation is (or was inferred as)
    father or mother, with `metadata.legacy.role`; when the student has no
    such guardian it is a new related person with no account, that relation,
    portal access and notifications false and `import_unverified`. An
    unmatched `contact_mobile` goes to the student's primary contact
    (`label = 'other'`), and is reported when the student has no guardian.
  - `email` is attached to the guardian who has it as their login email,
    otherwise to the student's primary contact, otherwise reported.
  - `father_address` and `mother_address` become postal contact points of the
    guardian whose relation is (or was inferred as) father or mother,
    otherwise of the primary contact with `metadata.legacy.role`; the free
    text in `value`, `postal` as `{"lines": [value]}`.
- **`emergency_contacts`**:
  - The free-text `relation` is normalised (trimmed, case-folded, the Arabic
    definite article removed, letters folded as `app.normalize_name` does) and
    compared as a **whole value** with a word list: أم, والدة, mother, mum give
    `mother`; أب, والد, father, dad give `father`; خال `maternal_uncle`; خالة
    `maternal_aunt`; عم `paternal_uncle`; عمة `paternal_aunt`; جد `grandfather`;
    جدة `grandmother`; أخ `brother`; أخت `sister`; uncle, aunt `other_relative`;
    سائق, driver `driver`; مربية, nanny `nanny`. Anything else, compound values
    such as "خال الأم" included, becomes `other_relative`, keeps the original
    in `metadata.legacy.relation` and is queued for review. Nobody becomes a
    non-relative by default.
  - When the mobile matches a guardian of the same student, that relationship
    gets `emergency_contact = true` and `contact_priority` from `priority`
    (clamped to 1 to 99, the original kept when clamped), and the row's name and
    relation text go to the relationship's `metadata.legacy`. When two
    guardians share the number, the one whose normalised name matches wins;
    otherwise the row is reported.
  - Otherwise the rows of brothers and sisters (students who share a
    guardian) that share a normalised mobile and a normalised name are one
    person: the earliest row's id is kept and the rest
    recorded as `merged_into`. That person is a new user with no account, the
    name by script (`name_parts_source = 'import_split'`, parts left for
    review), a phone contact point labelled `emergency`, and a relationship to
    each of their students with `emergency_contact = true`,
    `contact_priority`, portal access and notifications false,
    `valid_during = [created_at::date, )` and `import_unverified`.
- **Group imports.** When a second school joins a group, an adult whose
  `lower(email)` equals an existing password identity's login name is a
  **merge candidate, never an automatic merge**, because legacy emails are
  unverified and school B's administrator may know school B's password. The
  person is imported as their own user; their school B password is kept only
  as a voided `merge_pending` identity (section 6.9) and their username gets
  the joining school's suffix. The identity spec's flow merges the two once the
  person proves control of both (signing in with each password, or verifying
  the email), and deletes the voided identity; until then both users work, the
  new one through an invitation. A user linked to a student record is never a
  merge candidate (parents often register a child with their own address).
  Matches by phone alone are listed for review. On a merge, each field takes
  the more recently updated value and the other goes to the merge report, not
  to `metadata`; the merged-away id becomes a `legacy_id` external id
  (section 4.6).
- **Within one school**, the legacy model forced a teacher who is also a parent
  to hold two accounts with two emails. Adults sharing a normalised mobile or an
  exact normalised full name are listed for a manual merge after cut-over,
  never merged automatically.

**Health and consent**

- **`student_medical`** becomes `health.records`, one per non-empty field,
  encrypted at the transform step under the tenant's health key:
  `blood_group` as `blood_group` (`{"value": "O+"}`), `allergies` as
  `allergy` with `has_alert = true`, `past_injuries` as `injury`, `surgeries`
  as `surgery`, each as `{"text": ...}`, with `recorded_on` the legacy
  `updated_at` date. A student with an allergy gets
  `users.medical_alert = true`.
- `medicine_agreement = true` becomes a consent record for
  `administer_medicine`: decision `granted`, capacity `school_on_behalf`
  (the import cannot prove a verified guardian gave it, so it claims no
  guardian capacity), `legal_basis = 'consent'`, `method = 'import'`,
  `explicit` and `written` false, no `given_by_user_id`,
  `valid_during = [student_medical.updated_at::date, )`, and the note
  "Imported from the legacy medicine agreement flag." Every such student is
  listed for the consent to be collected again. Whether the imported record
  counts until then is open question 12. `false` records nothing, because
  absence of an agreement is not a refusal.
- **`medical_reports`**: the object found by the URL inventory becomes a
  `files` row (purpose `health_report`, name `medical-report.<extension>`,
  encrypted into `h/`) and a `health.records` row of kind `medical_report`
  (`id` kept, `recorded_on = uploaded_on`, the legacy report name inside the
  ciphertext). An unreachable object is reported and the record kept with
  `{"missing_file": true}` in its ciphertext; nothing about it goes into a
  plaintext column.

**Files, access and history**

- **`private_files`** become `files`: `owner_id` as `uploaded_by_user_id`
  through the id map; purpose `assignment_resource` and `message_attachment`
  give `attachment`, `submission_attachment` gives `submission`, `site_media`
  gives `site_media`, `lesson_media` gives `document_media`; `sha256` from hex
  to bytes; only `ready` rows are imported; every row gets `linked_at`. The
  owning system's import sets the host. A legacy file linked from several
  hosts (one resource on several assignments, one attachment on several
  attempts) keeps its id for the earliest link; each further host gets a new
  row with the same storage key and SHA-256, recorded as a `split`. A draft's
  link to a file that a sent message or a handed-in attempt also links is not
  imported as a host. Media referenced only inside legacy JSON is linked
  through the host document's `document_files`.
- **`access_roles`**: a legacy built-in (`builtin_role` set; legacy stores
  one only once the school edits it) maps `admin` to `site_administrator`,
  `teacher` to `teacher`, `student` to `student` and `parent` to `family`. Its
  permissions, mapped to capabilities through the identity spec's table,
  update the tenant's seeded built-in (the legacy id recorded as
  `merged_into`); in a group whose seeded built-in already serves another
  school, they become a built-in scoped to the joining school. A custom role
  keeps its id, gets `org_id` = the school and its mapped capabilities, and
  keeps `base_role` and its revision in `metadata.legacy`. `name` by script.
- **`user_access_roles`** become `access_role_assignments` at the school org
  from the legacy `created_at`, with **`replaces_builtin = true`**, because a
  legacy assignment replaced the built-in permissions rather than adding to
  them; a school that narrowed a teacher keeps that teacher narrowed. A legacy
  assignment whose role's `base_role` differs from the user's role gave that
  user no permissions at all; such users are listed at rehearsal and block the
  cut-over until the school chooses a role for each (or confirms "no access",
  imported as an assignment of an empty role that replaces the built-in).
- **`access_changes`** and **`school_year_events`** become `audit.log` rows
  written by `cell_io` (`actor_kind = 'import'`, `actor_user_id` the legacy
  actor through the id map, `occurred_at = created_at`, `request_id` the run
  id):
  - `access_changes` actions `role.<x>` become `access_role.<x>` on object
    type `access_role`; `assignment.changed` becomes
    `access_role_assignment.changed` with `object_id` null and
    `subject_user_id` the target user. `before` and `after` go to
    `audit.payloads`, with `subject_user_id` set when they describe a person.
  - `school_year_events` become `academic_session.<action>` on the year; they
    have no before and after, so the reopening `reason` goes to the payload as
    `{"reason": ...}` with no subject.
  - Partitions for their months are created first by an operator running
    `app.ensure_partitions` as `cell_owner` with `since` set; the rows are
    sealed as in step 8.
- **Rich content** (JSON documents on assignments, messages, announcements,
  newsletters, calendar events, site pages, posts and lessons) becomes
  `documents` rows owned by the corresponding host import:
  - `content` is the legacy draft after validation against the current
    schema, `plain_text` derived, `frozen_at` set for sent messages and
    attempts.
  - A legacy published snapshot (`site_pages.published`,
    `site_posts.published`) becomes a `publish` version, so the public site at
    cut-over shows what was published, not the draft. Each
    `site_post_revisions` row becomes an `import` version, numbered in order,
    with `created_by_user_id` from `saved_by_id`; `cell_io` sets the document's
    version above the last one.
  - Content that fails validation is kept as an `import` version and the
    document holds the validated subset, with `metadata.legacy.invalid = true`
    on the document and a report.
  - Bodies outside JSON: `plain` text becomes paragraphs; `markdown` is parsed
    into the current schema, with the source kept as the `plain_text` of an
    `import` version; a newsletter that is only a `url` becomes a document with
    one file block referencing the ingested object.
- **Owned by other specs**: `classes` (their `grade` strings map to
  `grade_level` descriptors through the per-school table confirmed at
  rehearsal, which the placements above also use), `class_subjects`,
  `enrolments` (which also feed the placements above), `student_groups`,
  `timetable_slots` (rooms go to locations above), `assignments` and
  everything under coursework, `grades`, `attendance`, messages, newsletters,
  announcements, notifications, calendar events, learning modules and lessons,
  site pages and posts, `site_post_categories` (to `site_post_category`
  descriptors) and `site_post_revisions` (the website spec), `year_rollovers`
  (the school-year spec).

### 10.4 Verification of foundation data

Before the flip, all of these must pass:

- **Counts**: imported users equal legacy users plus students plus distinct
  emergency-only people, minus attached student logins and merges; imported
  relationships from guardianships equal legacy guardianships; imported audit
  rows equal `access_changes` plus `school_year_events`; every legacy file row
  marked ready, and every object in the URL inventory, has a ready file with
  the same SHA-256; no imported file is ready without `linked_at`.
- **Ids**: every legacy id in `staging.id_map` resolves to at least one active
  target row; a `kept` or `merged_into` entry to exactly one; a `split` to rows
  that all share the legacy SHA-256.
- **Dates**: for every year, term and week, `upper(span) - 1` equals the
  legacy `ends_on`; every calendar has one row per date of its year.
- **Students**: every legacy student has exactly one student role at the school
  and a placement for every legacy year in which they had an enrolment (or the
  fallback placement).
- **Contacts**: every non-empty legacy phone and address appears in exactly one
  contact point of a person, or in the review report.
- **Health**: every non-empty legacy medical field and report name decrypts to
  its legacy text.
- **Access**: every imported user's effective capabilities at the school equal
  their legacy effective permissions mapped through the identity spec's table
  (the legacy `effectiveAccess` rule: an assigned role replaces the built-in),
  except users on the blocked list until the school has decided.
- **Sampling**: 50 students per school compared field by field between the
  legacy record and the new one (names, birth date, reference, placements,
  guardians and their phones).
- **Sign-in**: the importer creates one verification account per legacy role
  with a random password, tagged `metadata.legacy.verification = true`, and
  one synthetic identity per legacy password-hash algorithm found, with a known
  random password in that format; each signs in. They are tombstoned at the
  flip, their use is audited, and a check after the flip confirms none is
  active. No operator ever holds a real person's password.
- **Integrity**: the CI catalogue check (section 8, gate 1) returns no rows on
  the target cell, and the audit chain verifies.

## 11. Corrections to earlier documents

- `platform-migration.md` lists enrollments for "student, teacher, aide".
  OneRoster 1.2 enrollment roles are administrator, proctor, student and
  teacher; aides export as `ext:aide` ([R1] section 7).
- `platform-migration.md` puts a stored search vector on `documents`. Under RLS
  its index is unusable; the vector lives in `search.entries` (section 6.19).
- `platform-migration.md` gives `user_roles` a stored "primary" flag. OneRoster
  needs exactly one primary role per org, which a stored flag cannot keep as
  roles start and end; `roleType` is computed when served (section 6.8).
- `backend-architecture.md` gives parents a "hashed email code fallback". NIST
  800-63B-4 says email "SHALL NOT be used for out-of-band authentication", so
  the email code is a recovery path that ends by binding a new authenticator,
  never a routine sign-in ([R3] finding 4).
- `backend-architecture.md` says grades are keyed by student-section and
  grading period; Ed-Fi's key also includes the grade type ([R1] section 7).
- `backend-architecture.md` routes Hocuspocus "by document id". A document id
  is unique only within its tenant, so rooms and routing use
  `<tenant>:<document>` (section 4.6).
- `backend-architecture.md` lists "whether Better Auth hashes session tokens"
  as unverified: by default it does not ([R3]). It also lists Egypt's executive
  regulations date: Decree 816/2025, published 1 November 2025 ([R3]).

## 12. Open questions for the owner

1. **Where the global directory lives.** It holds school names, slugs,
   hostnames, SSO domains and integration client ids, no personal data.
   Proposal: in the first cell's region, replicated read-only to each cell. Is
   that acceptable for Egypt's and the Gulf's transfer rules?
2. **A school group spanning jurisdictions** (say an Egyptian and an Emirati
   school). One tenant in one cell needs a transfer basis for the other
   country's data; two tenants lose the shared people and group-wide admin.
   Which, and does it happen in practice?
3. **A KMS key per tenant** for crypto-shredding health data and sealed
   identifiers in backups, against one key per cell (cheaper, but offboarding
   cannot make old backups unreadable).
4. **The medical and custody alert chips** are plaintext booleans on `users`,
   outside the purpose gates, so every student header can show them.
   Acceptable, or should the chips themselves require the capability?
5. **`created_at` as a seventh base column** (section 4.4). Confirm.
6. **Which script's names OneRoster and Ed-Fi exports carry** in `givenName`
   and `familyName`: Latin when present (the default above), Arabic always, or a
   tenant setting?
7. **The tenant id inside the passkey user handle** (section 6.9). It reveals
   the school to anyone holding the authenticator, not the person, and it
   means a tenant merge makes the absorbed school's people register new
   passkeys. The alternative is asking for the school before every passkey
   prompt.
8. **Activity events and Egypt's Art. 14(5).** Do lesson views and quiz answers
   count as "tracking or behavioural monitoring" of a child? If yes, drop the
   table for Egyptian tenants and keep only lesson progress. Retention: 13
   months proposed.
9. **Retention periods**: the audit log (proposal: seven years, matching the
   Object Lock period), expired sessions (30 days), rejected files (30 days),
   pg-boss jobs (proposal: completed jobs 7 days, failed 30), the rollback
   window after each school's cut-over (proposal: 30 days, which also bounds the
   id map and the encrypted export files), and archived databases of schools
   that do not move.
10. **Legacy single-field names** of staff and parents are split on whitespace
    and queued for review. Is that acceptable, or should the OneRoster export
    be blocked for those people until a person confirms the parts?
11. **Merging people across a group's schools** now needs proof that the
    person controls both legacy identities; nothing merges on an email match
    alone (section 10.3). The cost is that a parent known at two schools
    signs in once more, or accepts an invitation, before seeing both. Confirm.
12. **Imported consent.** Imported guardians have `legal_guardian` unknown and
    are unverified. May they give consent before the registrar verifies them?
    And does an imported medicine agreement (recorded as the school's, not a
    verified guardian's) count until the consent is collected again, or lapse
    at cut-over?
13. **Egypt, children under 15**: is core educational processing based on the
    guardian's written consent with a time scope (the `child_data_processing`
    purpose) or on "permitted by law"? This decides whether every Egyptian
    student needs a consent row before cut-over.
14. **Managed Postgres.** The design needs a builtin `C.UTF-8` (or ICU) database,
    `btree_gist`, `btree_gin`, `pg_trgm`, Postgres 18 and a non-superuser
    owner. Some managed offerings may not allow the builtin locale; this
    constrains the hosting choice per cell ([R2] "Not verified").
15. **Group calendars.** Schools of a group get their own copies of shared
    dates (section 3.6). Is there a group that needs one calendar edited once
    for all its schools?
16. **Grade level mapping**: pre-KG exported as CEDS `PR`, KG1 as `PK` and KG2
    as `KG`, as seeded. Confirm against what the ministry and any receiving
    system expect.
17. **Which reads are audited.** Proposal in section 6.14: health, custody
    restrictions and evidence, demographics, sealed identifiers, exports,
    integration releases, operator access; not routine page views.
18. **Object Lock availability** for the audit anchor bucket in each candidate
    region and provider, including a self-hosted cell.
19. **Sex outside the demographics gate.** It is an ordinary column on `users`
    because Arabic notices agree with the child's gender and Gulf schools
    allocate by it; religion, nationality and birthplace stay gated. Confirm.
20. **Notification language at cut-over.** People who never chose one keep the
    legacy default, English, rather than switching to the school's language.
    Keep, or switch and tell the schools?
21. **Three more registrable domains**: one for school websites, one for
    downloads, one for published media, each separate from the product domain
    (section 3.3). They need choosing and registering before the first cell.
22. **Erasure approvals**: one approver with the capability, or two people
    always? The table allows both; the privacy spec needs the rule.

## 13. Critiques not adopted

The review raised 4 blockers, 56 major and 46 minor points across four lenses.
Every blocker and major point is resolved in the sections above, and so is
every minor point except those below. Where a critique offered alternatives,
the one not chosen is listed with the reason.

**Standards**

- _Move `birth_date` into `core.demographics`_ (the preferred fix for the
  split demographics record). Not adopted: the birth date drives the age of
  majority, the consent age and the duplicate check, all of which would then
  have to set the demographics purpose. The critique's other option is taken:
  the served record is `users` left joined to `demographics`, and the
  demographics row is kept as a tombstone at erasure (section 6.7).
- _Keep `role_type` stored and maintain it with a trigger._ Not adopted:
  computing `roleType` when serving guarantees exactly one primary per org
  whatever starts or ends, with nothing to keep in step (section 6.8).
- _Serve `T < dateLastModified <= now() - lag` by default._ Not adopted as the
  default: many consumers use their own clock as the next watermark and would
  silently lose rows. The widened lower bound stays; the stricter form is the
  documented fallback if the conformance suite rejects it (section 4.9).
- _Cap middle names at 75 characters._ Not adopted: an Arabic naming chain
  holds two generations of names. The Ed-Fi export cuts at a word boundary and
  sends the full chain as an `OtherName` (section 4.14).
- _Make the passkey handle's tenant prefix survive a merge, or keep a verified
  map from old handles._ Not adopted: the prefix is what routes a
  discoverable-credential sign-in to one tenant without a cross-tenant index
  of credential ids, and any merge-proof value would need exactly that global
  index. Merges are rare; the absorbed school's people register new passkeys
  (section 3.5).
- _Store an Ed-Fi identification code per person kind as columns._ Not adopted
  in that form: the staff and contact codes follow from the value's meaning, so
  one mapping table in section 6.2 carries them without three URI columns.
- _Add grade, entry and exit to `user_roles`._ The critique's other option,
  a placement table, is taken, because a grade and a calendar belong to one
  school year while a membership role spans years (section 6.8).
- _Derive the served username from the login name._ Not adopted: login names
  change (they are emails), and consumers match on the username. A stable
  `users.username` is set once instead (section 6.7).
- _Reserve LTI signing keys in `core.tenant_keys`._ Not adopted: that table
  holds wrapped symmetric data keys. Platform signing keys are asymmetric keys
  that never leave the cell's KMS, in a table the LTI spec owns (section 3.3).

**Security**

- _Give `site` SELECT on `publish` versions of documents._ Not adopted: the
  website spec materialises published pages into its own tables, which are all
  `site` reads. A grant on versions would let a request fetch a version that
  was published once and withdrawn, by id.
- _Answer non-active tenants exactly like an invalid token._ Adopted for
  callers who are not yet authenticated. Signed-in users of a `frozen` tenant
  still get 503 with `Retry-After`, because answering 401 during a cell move
  would sign everyone out (section 7.2).
- _Give `cell_io` a transaction timeout while it writes into an active
  tenant._ Not adopted: bulk loads run longer than 30 seconds. The same
  guarantee comes from serving nothing of an `importing` org and touching every
  imported row at the flip (section 10.1).
- _Move `ip_prefix` from the audit row into payloads._ Not adopted in that
  form: payload rows exist only when values change, so most rows would lose
  their address. The address now lives only on the session row, which the
  audit row references and erasure deletes (section 6.14). _Hash
  `ip_prefix::text`_ is moot as a result.
- _Scope the secret manager's policy so the API reads only the current
  tenant's path._ Not adopted: one API process serves every tenant of the
  cell, so an IAM policy cannot vary per request. The secret path is derived
  from the unit of work's tenant and never stored, which removes the
  cross-tenant reference the critique found (section 6.9).
- _Otherwise drop the medical staging columns after the health step._ Not
  needed: the primary fix is taken, and medical text is encrypted before it is
  staged (section 10.1).
- _Re-HMAC every row inside the DEK rotation transaction._ Not needed: the
  lookup key is separate and does not rotate with the DEK (section 6.6).

**Product**

- _A `document_translations` table or a pairing column with block ids_ was
  offered as a choice. Both are taken, for different content: authored
  bilingual content is two paired documents with stable block ids, and machine
  or single-edit translations are rows in `core.document_translations`. The
  per-block reviewed flag lives in the content schema, which the content spec
  owns, rather than in a table (section 6.12).
- _Address "the office" as a department org acting as a shared inbox._ Not
  specified here: roles sit only at schools and groups (section 6.8), and the
  communication spec owns the office inbox and its membership. The foundation
  provides the `staff` role and department orgs it can use.
- _Let only group-level administrators edit built-in roles._ Not taken; the
  other option, school-scoped roles and built-ins, is (section 6.10).
- _Define which role changes re-issue the session._ Not taken; the other
  option, deriving the profile in every unit of work, is (section 6.9).
- _Replace the `PERIOD` keys on calendar dates and weeks with constraint
  triggers that ignore tombstones._ Not adopted: the declarative keys are
  probed and cannot be skipped by any code path. A definer function changes a
  year's dates instead (section 6.3).
- _Index a person's memberships for scoped search_ is adopted; a person with
  no role at all (an emergency contact) is indexed tenant-wide and filtered by
  the relationship functions like any other hit, rather than being scoped to
  their students' schools.

**Import**

- _Give conflicting subject or descriptor labels a suffixed code_ when a school
  joins a group. Not adopted: per-school descriptor overrides keep one value
  with two labels, which is what the schools mean (section 6.2).
- _Import legacy medicine agreements with `legal_basis = 'legitimate_interest'`._
  Not adopted: the legacy flag recorded an agreement, so the import records
  `consent`, with capacity `school_on_behalf` so that it claims no verified
  guardian. Whether it counts until re-collected is open question 12.
- _Set `preferred_locale = 'en'` or accept the switch_ was offered as a choice.
  The first is taken, so nobody's notification language changes at cut-over;
  open question 20 lets the owner reverse it.
- _Keep `missing_file` in the medical record's `metadata.legacy`._ Not adopted:
  health metadata must stay empty (section 6.11), so the flag goes inside the
  ciphertext.
