# Architecture

Farida LMS is a set of separately deployable processes over one regional
database cell. The web application (`apps/web`, TanStack Start on Bun) owns
rendering, navigation, browser cookies and accessibility. The API
(`apps/api`, oRPC on Bun) owns identity, school resolution, authorisation,
business operations and every database connection. The collaboration server
(`apps/collab`) holds live editing rooms, the media service (`apps/media`,
Rust) encodes and streams video, and the operator console (`apps/ops`)
creates schools and keeps their plans. The web process holds no database
password and the media service holds no database login.

The full data contract, with its conventions, roles and gates, is
[systems/platform-foundation.md](systems/platform-foundation.md);
[operations.md](operations.md) covers configuration and running it. This
document describes how the parts fit and why.

## Requests and identity

A browser calls a TanStack server function. That function calls the API
through the typed client in `packages/api-client`, over `/rpc`, with the
opaque token from the school's HTTP-only session cookie and the school's
slug in the `x-farida-school` header. A native app calls the same
procedures directly, over `/rpc` or the OpenAPI surface at `/v1` (its
contract is served at `/openapi.json`), sending its bearer token and the
school header itself. Both paths execute the same procedures, so database
and authorisation code never enters the browser runtime. Files stream
outside the RPC serialiser through `relayTo`, which forwards bytes to the
API with the same token.

The procedures in `apps/api/src/core/procedure.ts` resolve everything before
a handler runs. The school comes from the request's slug through the
directory. A session token is `<tenant id>.<secret>`: the tenant part tells
the API which tenant to bind before it can look the session up under row
level security, it must be the tenant of the named school, and only the
SHA-256 of the 256-bit secret is stored. The session is found, the actor is
bound for the audit trigger, the session's idle time is renewed, and the
person's access at that school on the school's date is resolved once for
the whole unit of work. A handler receives an explicit context with its
transaction, tenant, school, today's date in the school's time zone, the
database's `now` and the actor. There is no process-global current school
or current user.

A session belongs to one context, staff, family or student, which decides
the workspace a person lands in (`/admin`, `/teach`, `/family`, `/me`) and
caps what their roles can do. Staff and student sessions end after 12 idle
hours and last at most seven days; family sessions end after 14 idle days
and last at most 30. Moving between contexts is a privilege change, so it
issues a new session and revokes the old one. A badge signs a child in on
a device the class shares, and a guardian can hand their own device to a
young child; both are shared-device sessions that end after 30 idle minutes
and never outlast eight hours. Signing out deletes the stored session.

Password sign-in verifies Argon2id hashes, and an unknown name still runs a
verification against a dummy hash, so a missing account answers exactly as
a wrong password. Attempts are counted in the cell per tenant, under HMAC
keys derived from the cell secret so no raw name or address is stored: ten
tries per name and 50 failures per network in 15 minutes. Every refusal is
an audit entry.

Capabilities come from the person's current roles, never from claims a
client sends. A school's access roles (`access_roles`), assigned to people
for a period, grant capabilities at an organisation and below; where none
replaces them, the built-in role of each natural role a person holds
applies. A role is edited by someone holding `access:manage`, who can grant
only capabilities they hold themselves, and a change that would leave
nobody holding `access:manage` is refused under a lock, so two
administrators removing each other cannot both succeed. Every change is an
audit entry with its before and after values.

## The cell and the directory

A cell is one jurisdiction's deployment: one Postgres 18 database named
`cell` holding every tenant's rows, its object storage, and the API,
worker, collaboration and media processes. A separate `directory` database
maps a school's slug or host to its tenant and cell, and holds the cells,
tenants, schools, hosts, school plans, storage usage reports, exam series,
the sign-in name index and a change log of every edit to them. It holds no
personal data: no user, no email, no phone, no operator name.

Each runtime reads the directory as `directory_reader` with a 60-second
cache. A cell writes to it only as `directory_sync`, which can bind and
check its own schools' hosts, copy school names, report storage and keep
its tenants' rows of the sign-in index; the operator console alone holds
`directory_admin`. Every write lands a `changes` row in the same
transaction.

The cell's tables are Drizzle declarations in
`packages/database/src/tables/`, grouped into the `core`, `health`, `audit`
and `ops` schemas plus the `search` index. Migrations are SQL, one folder
per database, applied by `scripts/db.ts` in one transaction as the schema
owner; whatever drizzle-kit cannot express (forced row level security,
grants, functions, triggers, partitioned tables, exclusion constraints)
lives in custom migrations beside the generated ones.

## Tenants, units of work and row level security

A tenant is a school group or a standalone school. Its organisations
(`core.orgs`) form the tree a group's schools hang from, and its lifecycle
lives in `ops.tenant_registry`. `provisionTenant` creates a tenant as the
schema owner in one transaction: the registry entry, the tenant and its
org tree, its own copy of the descriptor catalogue, the built-in access
roles, the school's starting message templates and its data keys.

Every tenant table carries `tenant_id`, a restrictive `tenant_isolation`
policy and forced row level security. Every query runs in a unit of work
(`packages/database/src/context.ts`): one transaction that binds the tenant
with `app.begin_unit` and reads the database's clock in the same statement,
so what a unit writes as happening now agrees with the clock policies
compare against. `app.tenant_id()` raises when no tenant is bound, so a
query outside a unit fails rather than reading everybody's rows. Only that
module opens pools or sets configuration. A tenant that is not active or
frozen answers like an unknown one, and a frozen tenant reads but refuses
writes with a retryable error.

The API never connects as the owner. Each runtime role is its own login without `BYPASSRLS`, with its own timeouts and grants. `app` serves signed-in requests and cannot delete; `site` reads only published website rows and may add an enquiry; `worker` runs deliveries, sweeps and file verdicts; `collab` reads and writes collaborative documents and nothing else; and `retention` alone erases, and only rows an approved erasure lists. The provisioner login may only `SET ROLE cell_owner`, and it runs on a listener of its own that the public port never routes to.

Rows are tombstoned with `status = 'tobedeleted'` rather than deleted, and
every update names the `version` it read, so a stale write fails as a
conflict. Special-category tables (health, demographics, custody) are
invisible until `withPurpose` sets their purpose inside a savepoint, and
health records are encrypted with per-tenant data keys (`tenant_keys`)
that the cell's key-encryption key wraps. Database failures become stable
domain codes (`mapDatabaseError`), which the web translates into the
reader's language.

## Hosts and sign-in

Each school answers on two platform names: its portal at `<slug>.<PORTAL_DOMAIN>`, where people sign in and work, and its website at `<slug>.<SITES_DOMAIN>`. A school may also bind hosts of its own for either role. A host becomes verified when the school publishes the TXT challenge and the CNAME (or, for an apex, an A record to the edge) the directory asks for. It becomes active once the edge has served it over TLS. The API checks due hosts every 30 seconds and every host hourly, and three misses in a row stop a host routing. The edge issues certificates for a school's own names on demand, after asking the API's `/edge/ask`, which says yes only for a verified or active host.

The two roles never share an origin, so a page a school writes can never
read a session cookie, and the app's routes never collide with the
website's. The web reads the host from `Host` alone, never from
`X-Forwarded-Host`, which a client can set, and asks the API's
`identity.resolveHost` what it serves, caching the answer for a minute. A
host that serves nothing answers 404. Once a school's own host for a role
is active and canonical, the platform name answers with a 308 to it, and
every absolute URL the platform writes (links in email, calendar feeds,
exports) comes from the canonical host in the directory, never from the
request.

A portal host names its school, so sign-in asks only for the person and
nobody types a school code. The session lives in a host-only cookie for
that school (`__Host-s-<slug>` over HTTPS; plain HTTP keeps the bare name,
because Safari drops Secure cookies there and sign-in would silently fail),
so a script on one school's pages cannot reach another school's session.
Server functions carry TanStack's CSRF check, and pages send
`frame-ancestors 'self'`.

The bare portal domain signs nobody in. Its sign-in asks for an email, then
a password, before anything is looked up, and finds the tenants that hold
the name through the directory's `login_index`: an HMAC of the normalised
name under `LOGIN_INDEX_KEY`, a secret every cell holds and the directory
never does, so a row names nobody. Each cell keeps its own tenants' rows
current on start, every 15 minutes and whenever a sign-in name changes.
The password is checked in each tenant under that tenant's own limits, and
an unknown name, a wrong password and a name with no school to open read
alike. A proved sign-in becomes a one-time handoff, good for a minute and
bound to the account, the school and the network, carried in the URL's
fragment to the school portal's `/auth/handoff`, whose web server turns it
into the portal's own session. A name and password that open several
schools show those schools' names to choose from. The bare domain
remembers the browser's last school and sends the next visit straight to
that portal, and with `PRODUCT_SITE=on` its root is the product's own
site.

A website host reads no session and sets no cookie. The web strips every
cookie but language and digits from its requests and every `Set-Cookie`
from its responses, and on that host only the website's own server
functions run, for its own school.

## The website and its doors

A school's website is data in the cell: settings with its theme and chrome
(`site_settings`), a page tree that is also the menu (`site_pages`), and
news posts (`site_posts`); its first language and its logo are the school's
own (`orgs.default_locale`, `orgs.logo_file_id`). A page's content is a `page` document of
sections, each `{ id, type, variant, style, data }`, whose fields are
declared once per type in `packages/domain/src/site-sections.ts`; that
declaration drives validation, the builder's inspector, the translation
overlay, plain text for search and the publish checks. Publishing writes
a published copy per language (`site_published_pages`,
`site_published_posts`), and those copies are all the `site` role can read,
so later edits stay private until the next publish. A visitor's request
names the school by its host; `withPublicSite` resolves it through the
directory and reads as the `site` role, with no session involved, and a
school whose site is not live answers not found. The builder and its
themes are described in [systems/website.md](systems/website.md).

Every front door a school has is a page of this site, made in the same
builder from the same sections, theme and chrome and drawn by the same
renderer. What only the platform can provide is a system section: a
section the builder places and styles like any other but whose behaviour
belongs to its system. The enquiry form is one, on website pages. A door
that holds a session is a page of the `portal` kind, served on the portal
host at `/sign-in`, `/register` and `/apply` and kept out of the menu:
each holds its door's system section exactly once (the sign-in form, the
family registration form, the application). Until the school publishes a
door's page, the portal shows its starter. The website host only links or
posts to these doors.

An enquiry is written by the `site` role, only as an unworked website
enquiry, after Turnstile (where configured), a hidden field, a minimum fill
time and limits per network and per school, with the network kept only as
an HMAC of its prefix. From then on it belongs to admissions: a family
registers once on the portal's register page, confirming their address by
email, and everything the school already holds under that address (open
enquiries, their conversations) becomes theirs. Applications, intakes and
forms are tables, capabilities, procedures and audit of the admissions
domain, the same as attendance or coursework.

## Documents, files, collaboration and media

Every piece of content a person writes is one editor document
(`packages/editor`, `ContentDocument`) stored in `core.documents`, found by
the record it belongs to (`host_type`, `host_id`) and of one of four kinds:
`rich_text`, `page`, `lesson` or `transcript`. Pictures, files, video,
embeds and questions are blocks of the document, never fields beside it,
and whatever another surface needs from the words (plain text, the files
it shows) is derived from it on the server. A host that publishes keeps
the version it showed in `document_versions`; news, lessons and assignment
briefs show readers that published version. Translations are documents of
their own linked to their source, and a frozen document (a sent message,
the wording of a privacy notice) cannot change.

A file is declared through the API (purpose, name, media type, size), its
bytes then streamed to `/v1/files/{id}/content`, whole or in parts, and it
becomes usable only once the server has checked what arrived and, where
ClamAV is configured, scanned it; the verdict is written as the `worker`
role. A file id never grants a download. Each kind of record registers who
may read the files it holds (`registerHostReader` in
`apps/api/src/files/authorize.ts`), and every read is authorised through
the record that links the file; a file whose host has no reader is readable
only by its uploader. Classes and modules keep their files in areas with
storage limits from the school's plan. Downloads leave through sealed
links, encrypted as well as signed, on the files host: a separate,
cookieless origin that also serves the pages students' web projects play
in, the coding studio and the micro:bit editor, so nothing it serves can
run as the application.

A file shown on the public website is copied to the public-media bucket
under an unguessable key and recorded in `file_publications` when its page
or post is published, only once everyone pictured has consented to appear
on the website. Unpublishing withdraws the publication and deletes the
object after the commit. The public route serves those objects with long
caching and no database read.

Documents that several people edit at once are collaborative. The API's
`documents.collaborate` issues a ticket for one document, signed with the
cell secret, for writing or, when the viewer may only read, for watching;
each kind of host registers its live rules (`registerLiveRules`) for who
may do which. The collaboration server (Hocuspocus over Yjs) lets a
connection in only with a ticket for that very room, binds a headless
editor to the shared state so it always knows the validated content, and
checkpoints the shared state and that content together as the `collab`
role.

The media service turns uploaded video into adaptive HLS streams with a
poster and thumbnails, and drafts captions where configured. The API keeps
each job's state on the file row and decides who may watch; the service
asks the API for work with a token derived from the cell secret, reads and
writes the shared file store, and serves streams behind sealed links on the
user-content domain.

## Messages, notifications and deliveries

Messages is the one place a conversation lives, with colleagues, with
families who have accounts and with people who have none. The inbox lists
one row per conversation with the viewer's own unread count, and a message
reaches everyone else in it. What a message says is a frozen document of
the shared editor, hosted as `message`, its files blocks of it; the
message's plain text is derived on the server for search, previews and the
text of an email. Files are readable by whoever reads the message. Opening
a conversation marks the viewer's rows read and nobody else's. Messages,
their documents, delivery rows and file links commit in one transaction,
and every way into a conversation (the composer, a website enquiry, a reply
by email, a change a system records) goes through one function,
`writeEntry` in `apps/api/src/messages/conversations.ts`.

A member is a person or an outside contact (`message_contacts`): someone
known by the address and name they gave, such as a family that enquired
through the website. When a person proves an address is theirs, as family
registration does, the contact is linked to them and they become the member
of its conversations; nothing is copied. A message to a contact goes out by
email through the delivery worker, in the school's name, with a reply
address `r+<tenant>.<token>@<INBOUND_EMAIL_DOMAIN>` whose token names one
contact's place in one conversation and is stored only as a digest. Replies
come back through Resend's receiving webhook and are posted as the
contact's message when they come from the contact's address and pass its
domain's checks, and held as an internal entry otherwise
([operations.md](operations.md), "Conversations by email").

A mailbox conversation belongs to a team rather than a person. The
admissions mailbox is read by holders of `admissions:read` or
`admissions:manage` and worked by `admissions:manage`; the attendance
mailbox by `attendance:manage`. Its owner is who holds it now, the
enquiry's assignee for an enquiry. Read state stays per person in `reader`
rows that grant nothing, and losing the capability loses the mailbox. A
team's conversation also holds internal entries the family never sees and
search never indexes: notes, logged calls, meetings and emails, held mail,
and the changes its system records, such as an enquiry moving on or being
handed to someone. Staff therefore read one timeline, and the record it
belongs to (an enquiry, an application) keeps only its workflow and draws
the conversation with the Messages component. A reply someone else
overtook is refused until its writer has read what came in, or sends it
anyway.

Telling people goes through one function, `notify` in
`apps/api/src/core/notify.ts`, inside the same transaction as the change
that causes it. It writes one `core.notifications` row per recipient (the
person who acted is never told about their own act) and one
`core.notification_deliveries` row per channel, email and SMS, planned by
that person's preferences: each kind of notice instant, gathered into the
daily digest, or off, with quiet hours and an optional weekend mute. A
channel that will not be used still gets its row, skipped with the reason
(the preference is off, there is no address, the address is unreachable,
no provider is configured), so the office can answer why someone got
nothing. In-app delivery is the notification row itself, and read state is
per person. The kinds today are announcements and urgent notices, news,
messages and replies, absences, events, reminders, consents, mentions,
library notices, enquiries and applications. Both tables are partitioned
by month.

The delivery worker runs in the API process as the `worker` role every 30 seconds. It claims due rows per tenant with row locks, so two replicas never send the same one. A person's digest items leave as one message and a conversation's message to a contact leaves whole, in the recipient's language, from server-side templates. The worker records the provider's receipt, or the failure with the next attempt after a backoff of one, five, 30, 120 and 720 minutes, giving up after five tries. Holders of `school:manage` read the delivery log.

## Teaching records

Records are reachable through relationships rather than roles. The database functions `app.visible_students` and `app.visible_people` decide who a viewer reaches on a date. School-wide staff reach every student of the school; a guardian with portal access reaches the children they are linked to; a student reaches themselves; a teacher or aide reaches the students of the classes they currently teach. Staff reach their colleagues, and school-wide staff everyone who holds a role at the school or is linked to one of its students. A capability lets a procedure run but grants no record, so a submitted student or class id is checked against these rules (and `teachesClass` for a class). The API answers `NOT_FOUND` for a record outside the caller's reach so that URLs do not reveal existence, and the web's `record()` turns that, and a `FORBIDDEN` on a record read, into the router's not-found page with a 404 status. Restricted fields (contact details, medical data, other people's children) are left out of the payload rather than hidden in the page.

Which of a child's guardians the school may do something for is one database function, `app.guardian_permits(link, on, purpose)`: following the child in the portal needs a current link with portal access; contact also needs the school not to have cut the guardian off (`communication_isolated`); the medical summary also needs a legal guardian the office confirmed, whose educational rights no court order has limited. A guardian it permits reads the child's medical summary in the family workspace (`/family/health`): allergies with their severity, conditions, medicines, dietary needs, the doctor and the emergency contacts, never the plans and notes the health staff keep. The stores that read those records and keep a family's changes join the same function, so the screen, the procedure and the store cannot disagree. A family's change to the summary is a correction request in the records register (`records_requests.topic = 'health'`), which gives it the deadline the school's law sets; the change itself, with the record as the family read it and any reason for declining, is sealed in `health.requested_changes` behind the health purpose. Nothing changes until someone holding `health:write` accepts it in Medical updates (`/health-changes`), which applies it in the same transaction, closes the request, audits it with who asked, and tells the family through `notify`. The privacy office sees such a request in its register but answers it there only through Medical updates. The changes are erased with the student and kept until then, like the records they change.

An assignment is authored against a class by its teachers. Its brief is a
document, with the files it hands out as blocks; its audience (the class,
saved groups or named students) is resolved into `assignment_recipients`
when it is assigned and follows later changes of the audience. A student
keeps a draft that autosaves; handing in freezes the written work and the
files into an attempt, so later edits never change what was sent, and a
quiz attempt is marked as it is handed in. A grader's judgement is a draft
until the work is returned, and families and students read only returned
results. Quizzes in briefs and questions in lessons share one quiz engine
(`apps/api/src/core/quiz.ts`) and one marking function.

E-learning is an area a school switches on when its plan includes it
(`core/features.ts`); every learning procedure answers not found while it is
off, and navigation shows it only then. A module reaches classes and
audiences, and its lessons are lesson documents whose questions are blocks
in the text, keeping the ids answers are recorded against. Learners answer
in `lesson_responses`, and the feedback a question holds back is released
when the question's own setting says.

The timetable is drawn as a grid per homeroom, or per class no homeroom
holds. Placing a class in a cell takes effect from a day on, so earlier days
keep their lessons; the API checks the teacher and the room against every
other booking at that time and, when one clashes, asks, moves the other
booking, or keeps the clash on a list so it is not forgotten. Cover records
a member of staff away for days or periods and changes, moves or cancels
single lessons, telling the cover teacher. A class's register is taken per
period by its teachers, or by whoever covers that lesson, for those periods
only; a date outside the school year is refused and a correction needs a
reason. Calendar events carry a document of the shared editor, with plain
text derived from it on every save, and share their audiences with
announcements and news (`stores/audiences.ts`).

## Search

Search reads a database index, `search.entries`, that triggers keep current
as records change: one row per searchable thing with its result's type and
id, the organisations it belongs to, a normalised name for trigram matches
and a text vector in English and Arabic. `app.search` ranks candidates for
a query within the viewer's organisations. The index holds ids only: every
hit is joined back through its kind's own reading rule before anything is
shown, so nothing stays findable after a relationship ends, and the kinds
offered follow the viewer's capabilities and the school's switched-on
areas. Internal entries of team conversations are never indexed. The
launcher shows the first hits per kind, and a results page keeps the query
and kind in the URL.

## Workers, provisioning and the operator console

The API process runs the cell's background work where the `worker` login is
configured: deliveries, file sweeps and storage reports to the directory,
monthly partitions, handing in timed quizzes whose time ran out, marking
code answers again, checking schools' hosts and keeping the sign-in index.
A pass claims its rows before working them, so every replica may run it.

The operator console (`apps/ops`) runs on its own host, signs operators in
through OpenID Connect and never through a school account, and is the only
process holding `directory_admin`. It lists schools with their storage,
sets each school's plan (storage pool and caps, and which modules it may
use) with a reason that lands in the change log, and creates schools. A
new school is written to the directory as provisioning, then created in the
cell by the provisioner, which receives a short-lived token signed for that
one call; the provisioner creates the tenant as the owner and emails its
first administrator a one-use link to choose a password, and the console
then marks the tenant active. The console is English only.

## Rendering and performance

Each SSR request constructs its own TanStack Query client. Route loaders
prime suspense queries before rendering, and filters, sorting, the selected
child, week and folder live in the URL through `validateSearch`. Directory
screens filter, sort and page in PostgreSQL with bounded page sizes and a
deterministic id tie-breaker; TanStack Table presents them without loading
the whole directory.

The API opens one pool per runtime role, sized by `CELL_POOL_SIZE`, and each
role carries its own statement, lock and transaction timeouts (the `app`
role's statements stop at five seconds and its transactions at 30). The web
client gives every API call a 15-second deadline. Every API response carries
a request id and `cache-control: no-store`, and every request is logged
with its duration.

English and Arabic are rendered on the server. The language follows the
language cookie, then `Accept-Language`, then the base locale, and changing
it reloads so the next document is rendered in the new language. Every
date and time is shown and entered on the school's clock in its digits:
each request adopts the school's zone as it does its digits, and only
`apps/web/src/utils/datetime.ts` and `packages/domain/src/school.ts`
format them, which the source checks hold. Logical
CSS properties and local font assets support right-to-left layout without
remote font requests. shadcn components stay registry-owned; product
styling and translated controls live in wrappers.

## Research informing these decisions

- [TanStack Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model): server and client execution boundaries and SSR.
- [oRPC Fetch adapter](https://orpc.dev/docs/adapters/fetch-api): one API transport for independently deployed services and clients.
- [oRPC TanStack adapter](https://orpc.dev/docs/adapters/tanstack-start): forwarding request context during SSR.
- [shadcn monorepos](https://ui.shadcn.com/docs/monorepo): package-aware CLI configuration.
- [shadcn RTL](https://ui.shadcn.com/docs/rtl): directional component support.
- [TanStack Table v9 migration](https://tanstack.com/table/latest/docs/framework/react/guide/migrating): explicit features and the React table state model.
- [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): restrictive policies and forced RLS for one database shared by tenants.
