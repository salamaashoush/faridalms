# Platform migration plan

How the backend moved from database-per-school with the original model to
regional cells with Row-Level Security and a standards-aligned model. Evidence: [research/backend-architecture.md](research/backend-architecture.md);
decisions: [research/decisions.md](research/decisions.md).

## Where it started

- A control database (`schools`, sessions, sign-in counters) and one database
  per school with 56 tables: years, terms, weeks and year events; users with a
  single role; classes, class subjects, enrolments, student groups; students,
  contacts, emergency contacts, medical records and reports, guardianships;
  assignments with recipients, resources, submissions, drafts, attempts,
  assessments; integer grades; one attendance row per student per day;
  timetable slots; messages, drafts, recipients, attachments; newsletters and
  drafts; announcements; notification events, notifications, deliveries,
  preferences; calendar events; access roles, assignments and changes; site
  settings, pages, post categories, posts and revisions; features; learning
  modules, lessons, lesson files and progress; private files.
- Rich content stored as JSON on each host row.
- Code values as Postgres enums.

## Where we are going

One Postgres 18 cluster per regional cell. Every tenant table carries
`tenant_id` first in its primary, foreign and unique keys; RLS is forced; the
application role is not the owner; a CI check fails on a tenant table without a
policy. The tenant is a school group or a standalone school, and a school is an
`org` inside it. Base columns everywhere: `id` (UUIDv7), `tenant_id`,
`status`, `date_last_modified`, `version`, `metadata`; tombstones instead of
deletes.

Entities, grouped:

- Directory (global, no student data): tenants, cells, hosts.
- Identity: `accounts`, `login_identities`, `passkeys`, `sessions`.
- Organisation and calendar: `orgs`, `academic_sessions` (school year, term,
  grading period; parent; exclusive end), `calendar_dates`, `class_periods`.
- Teaching: `courses`, `classes` (homeroom or scheduled), `class_meetings`
  (`WITHOUT OVERLAPS` on teacher and room), `enrollments` (student, teacher,
  aide; primary; begin; end), `groups` and members.
- People: `users` (within the tenant; optional account), `user_roles` (org,
  role, primary, begin, end), `user_relationships` (guardian, legal guardian,
  home (main, second or none), emergency, pick-up, portal access, receives
  notifications,
  priority), `external_ids`, `demographics`, and a separate encrypted `health`
  schema.
- Coursework and grades: `assignments` (each owns a `line_item`),
  `assignment_audiences`, `submissions`, `attempts`, `rubrics` and levels,
  `line_items`, `categories`, `score_scales`, `results` (score status, late,
  missing, excused), `period_grades`.
- Attendance: `attendance_events` (day or period; category descriptor; reason;
  minutes late), `attendance_taken`.
- Content: `documents` (Yjs state, derived JSON, plain text, stored search
  vector, revision), `document_versions`, `document_files`,
  `document_links`; `files` (bucket key, quarantine state, derivatives).
- Communication: `threads`, `thread_members`, `messages`, `message_reads`,
  `announcements` (urgency, pin until, expires, requires acknowledgement,
  comments mode, scheduled for), `announcement_audiences`,
  `acknowledgements`, school news posts, `calendar_events` with
  audiences, RSVPs and sign-ups, `notification_events`, `notifications`,
  `delivery_ledger`, `notification_preferences`.
- Learning: `modules`, `lessons`, lesson blocks as documents, completion rules,
  `lesson_progress`, `assessment_items` (QTI-shaped).
- Website: site settings, pages (tree), posts, categories, versions through
  `document_versions`.
- Platform: `descriptors` (namespaced code values with English and Arabic
  labels), `audit_log` (append-only, hash-chained, including reads and
  exports), pg-boss tables.

## No school moves

The importer from the per-school database is retired. No school held data in
that model when the cell went live, and its schema has since been deleted
from the code, so there is nothing to export, transform or cut over. A
verified export and import is still wanted for restoring one school, moving
a school between cells and offboarding, and it reads and writes the cell's
own model.

How a real school would have moved was decided before that was known. Two
routes were weighed.

1. **Expand and contract inside each school database**, then export into the
   cell. Every intermediate state must run in production, so the application
   carries both models for months, and every school database is migrated twice
   (to the new model, then into the cell).
2. **Build the cell schema new and move each school through a verified
   import**, keeping its old database untouched and read-only as the rollback.
   The application switches model once. A school's cut-over is: announce a
   window, freeze writes, export, transform, import into the cell, run the
   verification suite (row counts per entity, checksums of derived values,
   sampled record comparisons, sign-in of a test account per role), flip the
   directory entry, unfreeze. Rolling back is flipping the entry back to the
   untouched old database and the previous release.

Route 2 was chosen (2026-09-26): it is reversible per school at every step, it
moves each school once, and it lets the rebuilt application use only the new
model. It is why the cell schema was built new rather than grown out of the
old one.

## Order of work

1. **Cell schema and access layer.** Drizzle schema for the entities above,
   RLS policies, the non-owner application role, the CI policy check,
   `set_config('app.tenant_id', …, true)` per transaction in the request
   context, UUIDv7, descriptors with seed data.
2. **Domain and API on the new model**, system by system in the same order as
   the interface rebuild, so each rebuilt screen lands on its final backend:
   identity and people, classes and enrolments, academic sessions and calendar,
   coursework and gradebook, attendance, timetable, communication, documents
   and collaboration (Hocuspocus on Bun), learning, website.
3. **Jobs, files and search**: pg-boss in the cell database, S3 pipeline with
   quarantine and scanning, Postgres full text with the Arabic configuration.
4. **Standards surfaces**: OneRoster 1.2 provider (REST and CSV), LTI 1.3
   platform, SSO (Google, Entra, SAML), parent invitations and passkeys.
