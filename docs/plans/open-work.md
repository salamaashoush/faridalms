# Open work

What is known to be unfinished, in one place. Each item names the system it
belongs to. Delete an item when it lands; anything
larger than a few days of work gets its own plan beside this file.

## Foundations, wave 3

From `foundations.md`. W1, W3, W4 and W5 are merged.

- **W2, the rest of the outbox.** Teaching events already go through
  `notify`. Left:
  - invitations and password resets written to the delivery log like every
    other email;
  - an email to someone with no preferred language goes in the school's
    language, not English. The template code does not know the person's
    school today.
- **W6, conventions and records** (findings 13 to 18 and the P2 items):
  - one version check on every update, one stale-write code and one
    pagination shape. Paging was added in several places at once, so it
    needs aligning;
  - Arabic normalisation in every filter;
  - history tabs fed by the audit log, with one history screen;
  - erasure declared per table in a registry. A gate covers tables that
    name an outside contact. Every table that names a person still needs
    one.
  - one translation review;
  - one question and answer model shared by quizzes, forms and admission
    forms;
  - saved sections on the templates and shared-block systems;
  - one audience semantics;
  - the product site's demonstration form behind the enquiry form's spam
    guard;
  - a shared person-name type in place of about 20 differently named
    field pairs;
  - oRPC's default English messages ("Not Found", "Input validation
    failed") reach people as written; route them through the error copy.
- **Finding 21** (plan modules and feature switches) belongs to the
  business console, outside this repository.

## Bugs found and not yet fixed

- **CI browsers.** Firefox and WebKit e2e fail on CI, so a push never
  publishes. Until they pass, publish by hand: run CI on main with
  `publish_without_e2e`. The failures:
  - WebKit `management.spec.ts:299`: a navigation cuts off `getAuthState`
    in the root `beforeLoad`, and WebKit reports it as an uncaught
    TypeError rather than an AbortError.
  - Firefox and WebKit `messages.spec.ts:156` (Markdown draft).
  - Firefox `admissions.spec.ts:39` and `people.spec.ts:407` (both failing
    before November).
  - WebKit `coursework.spec.ts:277` (once).
- A school whose website is not live shows the platform's generic 404.
  It should show a page in the school's name that links to its portal.
- School pages use Farida's favicon; a school with a logo should use it.
- The phone week view of the calendar shows no per-day "+" to add an
  event, even for people who may add one.
- A staff edit form was reported not to scroll; it scrolls when opened
  directly, so the path that reaches it stuck is not known yet.

- The guardian-link and custody screens do not check the two relationship
  rules before saving, so the person learns of them only from the refusal.
- `access` assignment does not check for an overlapping assignment before
  saving.
- A student can rename a project's only page away: there is no only-page
  guard.
- The family "Hand over" button has no error handling; a refused hand-over
  leaves the page with no message.
- `people.students` falls back to the working year when given an unknown
  year id instead of refusing.

## Reach

- Teacher names on the timetable week grid do not link to the teacher's
  profile yet: each lesson card's lines are plain strings, so the card
  needs to take links. Lessons and messages already link.
- A staff session without `people:read` now counts as staff in Messages,
  because staff is decided by role. Confirm that is the wanted rule.

## Front door

From `school-front-door.md`; slices 1 to 8 are merged.

- **Slice 9, re-enrolment:** each returning student's intention for next
  year (returning, undecided, leaving) feeding the existing rollover.
- **Register and apply loses the intake.** A visitor who arrives without an
  account loses the intake preset at registration, because sign-in and the
  welcome page have no return path. Carry the intake through the welcome
  link.
- **Admission events on the calendar.** Tours, assessments and interviews
  are not on the staff calendar, and attendees get no notice. That needs a
  notification kind of its own; the nearest one describes a missed
  register.
- **Letters per intake.** An intake cannot choose its own letter templates
  yet. There is one per phase and language for the whole school.
- **Privacy and terms pages,** as website-builder pages, once their text is
  approved.
- **LTI issuer.** It still uses the bare domain. A second cell needs the
  `connect.` host handoff.

## Messages

- The contract step of the conversation move: drop `site_enquiry_entries`
  and `attendance_contacts`. Each migrated entry records `migratedFrom`, so
  first copy anything an older release wrote after the move.
- Staff search over internal entries.
- Guardians who join later are not added to an existing attendance
  conversation.
- Presence ("someone is replying").
- Merging two contacts who write from different addresses.
- Accepting a held email into the conversation as the family's.
- Webhooks for bounces and complaints that mark a contact unreachable.
- Routing inbound callbacks through `connect.` once a second cell exists.
- A review-versions screen for draft conflicts. Today a stale save is
  refused with the conflict message.

## Teaching and records

- Timetables: more than one timetable per year, rotating day cycles, and
  one period with different times on different days. Today the last one
  needs separate periods.
- Showing a held grade later sends no second notice; the original "returned
  with feedback" notice already went out.
- Teachers' comments on passages are not shown to families.
- Files:
  - Custody papers (`legal_document`) are sealed by the pipeline but have
    no upload flow.
  - There is no job that re-encrypts sealed files after a key rotation; the
    encrypted fields have none either.
  - Opening a medical report is audited on the file, not on the student's
    history.
- Broadcasts: the web keeps one server-bridge file per kind because the API
  keeps its `announcements` and `news` namespaces.

## Operations

- **Backups never expire.** The backup bucket uses object lock, with keys
  that cannot delete, and no retention period. Erased data and a departed
  school's data therefore stay in backups. Set a retention period that
  matches the erasure promise.
- **Before a cell holding real schools is migrated:** the lesson-documents
  migration stops on lesson shapes it cannot convert, so run it against a
  copy of the cell first.

## Known flaky tests

- `apps/api/src/files/sealed.test.ts` "rest as ciphertext" failed once in a
  full unit run and passes alone.

- Both micro:bit specs fail on macOS: the MakeCode editor drops the first
  typed character. They pass on Linux CI.
- `school-year.spec.ts:249` once opened the year editor with an empty name
  after a reload. The cause has not been found.
- `records.spec.ts:95` once timed out opening the language submenu.
- `badges.spec.ts:50` once landed on `/family` instead of `/me`. It likely
  comes from the spec's own tests sharing KG2A.
- Firefox does not launch on some macOS machines. CI runs it under
  `xvfb-run`.
