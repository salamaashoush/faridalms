# Architecture

Farida LMS has two independently deployable applications. The web application
owns rendering, navigation, browser cookies and accessibility. The API owns
identity, school resolution, authorisation, domain operations and database access.
The web process does not need a database password.

## Request and identity boundaries

A browser calls a TanStack server function. That function forwards an HTTP request
through the typed API client, using the opaque token from its HTTP-only cookie.
A mobile application calls the API directly. Both paths execute the same protected
procedures. Database and authorisation code never enters the browser runtime.

Sign-in resolves a school code from the control database, leases that school's
connection pool, and verifies an active local account with Argon2. Tokens contain
256 random bits; only their SHA-256 hashes are stored. Sessions expire after seven
days and logout deletes the stored session immediately. Every protected request
checks school activation, session expiry and the user's current active status.
Permissions come from the current account, not client-supplied roles or claims.

Authentication attempts are counted atomically in PostgreSQL, shared across API
replicas. A school/account pair permits ten attempts in fifteen minutes; a
successful login clears that account's counter. Unknown accounts perform a dummy
password verification and return the same failure as incorrect passwords.

A procedure receives an explicit context containing its database, school, current
user, local school date and request ID. Repositories accept the database as an
argument. There is no process-global current school or current user. Each lease is
released in a `finally` block after the entire procedure completes.

## School isolation

The control database stores school registration, database connection locations,
sessions and authentication counters. Academic records live in separate school
databases. Users, role assignments, student IDs and email uniqueness are local to
a school. The same email may belong to different schools without linking accounts.

The session selects the school. Supplying a different school header or a foreign
record ID cannot switch the connection. Tests authenticate concurrent sessions
against two databases and verify that coursework created in one is absent from
the other. Separate database users should be used for each production school;
control database access is restricted to the API because it contains connection
credentials.

This choice makes per-school backup and restore straightforward. It also requires
migrating and monitoring a fleet of databases. It is suitable for a school-based
product whose isolation and restore boundaries match a school. A high-volume,
self-service tenant fleet may require a different provisioning model; changing
that model should preserve the explicit request context and API contracts.

## Domain ownership

API modules separate identity, school administration, teaching, student records,
people, academics, communication and overviews. Shared schemas bound input size
and reject invalid dates, identifiers, attendance batches and page sizes.
Capabilities gate operations; student and class ownership gates the records
those operations use.

Records are reachable through relationships rather than roles. A class is
visible to its teachers, to the families and learners enrolled in it and to
administrators; a student to their guardians, their own account, the teachers
of their current classes and administrators; a person to anyone who shares a
visible class with them, is related to a visible student of theirs, took part
in a conversation with them, or is an administrator. Every active
administrator is reachable as the school office. The API answers `NOT_FOUND`
for a record outside the caller's reach so that URLs do not reveal existence,
and the web's record server functions turn that, and a `FORBIDDEN` on a record
read, into the router's not-found page with a 404 status. Restricted fields
(contact details, medical data, other people's children) are omitted from the
payload rather than hidden in the page.

Each school also publishes a public site from the same database. Its settings
(branding, contact, default language, whether the site is on), pages, blog
posts, categories and post revisions live in school-scoped tables, so nothing
about one school's site can appear under another's. The public API resolves
the school from the slug in the request rather than from a session, leases the
school's pool for the duration of the call and answers not found for a school
that is inactive or has not switched its site on. Pages are built from the
newsletter block document and posts from the shared Lexical document, and
publishing copies the current content into a `published` snapshot that the
public reads, so later edits stay private until the next publish. A post's
`publish_at` is the instant it becomes public; a future instant is a schedule
and needs no worker because public queries compare it against now. Site media
is a file purpose of its own, served without a session through
`/v1/sites/{slug}/files/{id}/content` only while the published content or the
logo references the file. A school with a `public_domain` on the control row
lands visitors on its site from the web's root; the site itself always lives
under `/site/{slug}` so the same page has one address behind every host.

E-learning modules are an optional area a school switches on through a
`school_features` row; every learning procedure answers not found while the
switch is off, and navigation shows the area only when the current user's
school has it on. A module belongs to a class and a subject and is authored
under the same offering responsibility as an assignment: the teacher of that
subject in that class, or an administrator. Lessons are ordered documents of
blocks: shared Lexical content, uploaded media through the private file
lifecycle (with a WebVTT captions file required for anything with sound),
multiple-choice quizzes and reflection prompts. Publishing needs at least one
lesson with content. Learners see published modules of their current classes;
the answer key of a quiz leaves the server only after the learner has answered
it, answers and completion are recorded per learner and lesson, and a lesson
can be marked complete once every quiz has an answer. Guardians read the same
progress and lessons without answering. Lesson media is authorised through the
lesson's module: its teachers, administrators, and the families and learners
of the class while the module is published.

Assignments are authored against a class and one of its subjects by the teacher
responsible for that offering. A draft carries a rich-text brief, learning
resources, an audience (the class, saved groups or named students, resolved
into `assignment_recipients` when saved), an availability window, a due instant
with a late policy, a hand-in format with attachment limits, a resubmission
policy and an optional rubric. Publishing is revision-checked and refuses an
incomplete draft. Learners keep a revisioned draft; handing in cuts an
immutable attempt from it, and a retry with the same revision returns the
attempt it already created. Assessments belong to an attempt and stay private
until released, at which point the submission mirrors the result for lists.
Marks above the assignment maximum, rubric totals that disagree with the
score, and attempts outside the assessor's offering are rejected by the API.
Attendance batches reject duplicate students and students outside the current
roster before writing.

Messages form conversations: a root message and its replies share a thread,
the inbox lists one row per thread with the viewer's own unread count, and a
reply reaches everyone else in the thread. A message carries plain text,
Markdown or a shared rich document; the plain text of a rich message is
derived on the server so search and previews keep working. Attachments are
private files linked to the message and downloadable by its participants
only. Opening a conversation marks the viewer's rows read and nobody else's.
Messages, delivery rows and attachment links commit in one transaction.

Notifications follow a transactional outbox. Publishing an assignment,
releasing an assessment, sending a message or reply, publishing an
announcement and publishing a newsletter edition each write a
`notification_events` row, one `notifications` row per recipient and one
`notification_deliveries` row per channel inside the same school-database
transaction as the change itself. Recipients are resolved from relationships:
the learners an assignment reaches and their guardians, the student and
guardians of a released result, the addressees of a message, and the roles an
announcement or newsletter names. In-app delivery is the row's existence;
email and SMS rows start pending and a worker in the API process claims them
per school with row locks, renders the recipient's chosen language from
server-side templates, calls the configured provider adapter and records the
receipt or the failure with the next attempt time, giving up after five tries.
A person's preferences (channels, language, muted types) and a missing address
turn a delivery into a recorded skip rather than silence. A school without a
configured provider records `provider_not_configured`, so a successful save
never implies an email went out. The log is readable by school administrators.

Private files are declared, uploaded and downloaded through the API only; see
[operations.md](operations.md) for the lifecycle and storage settings. A file
id never grants a download: the API authorises each read by the assignment or
submission that links the file.

## Rendering and performance

Each SSR request constructs a separate TanStack Query client. Loaders prime
suspense queries before rendering. Searches, sorting, school-week selection and
student selection are URL state. The student directory filters, sorts and pages
in PostgreSQL with a maximum page size of 100 and a deterministic ID tie-breaker.
TanStack Table manages its presentation without loading the whole directory.

The API bounds the number of resident school pools and connections per pool.
Inactive pools can be evicted; active pools cannot. If capacity is occupied by
active requests, the API returns 503 rather than creating an unbounded pool.
Requests have client-side deadlines, response request IDs and structured duration
logs. No private API response is publicly cached.

English and Arabic are rendered on the server. Localisation follows the language
cookie, then Accept-Language, then the base locale. Logical CSS properties and
local font assets support RTL without remote font requests. shadcn components
remain registry-owned; product-specific styling and translated controls live in
wrappers. The theme uses a quiet neutral canvas, green school navigation and
role-specific daily priorities.

## Research informing these decisions

- [TanStack Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model): server/client execution boundaries and SSR.
- [oRPC Fetch adapter](https://orpc.dev/docs/adapters/fetch-api): one API transport for independently deployed services and clients.
- [oRPC TanStack adapter](https://orpc.dev/docs/adapters/tanstack-start): forwarding request context during SSR.
- [shadcn monorepos](https://ui.shadcn.com/docs/monorepo): package-aware CLI configuration.
- [shadcn RTL](https://ui.shadcn.com/docs/rtl): directional component support.
- [TanStack Table v9 migration](https://tanstack.com/table/latest/docs/framework/react/guide/migrating): explicit features and the React table state model.

The installed library source and upstream oRPC/Table repositories were inspected
alongside these references. oRPC remains on its current stable npm release; its
main-branch documentation also describes newer APIs, so implementation follows
the installed release's types and runtime exports.
