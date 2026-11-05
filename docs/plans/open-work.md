# Open work

What is known to be unfinished, in one place. Each item names the system it
belongs to. Delete an item when it lands; anything
larger than a few days of work gets its own plan beside this file.

## Foundations, wave 3

From `foundations.md`. W1 to W5 are merged.

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

- A staff edit form was reported not to scroll. It scrolls when opened
  directly, from the staff list's row menu and from the person's record,
  on desktop and phone in Chromium and WebKit, so the path that reaches
  it stuck is not known yet.

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

- Both micro:bit specs fail on macOS: the MakeCode editor drops the first
  typed character. They pass on Linux CI.
- `school-year.spec.ts:249` once opened the year editor with an empty name
  after a reload. The cause has not been found.
- `records.spec.ts:95` once timed out opening the language submenu.
- `badges.spec.ts:50` once landed on `/family` instead of `/me`. It likely
  comes from the spec's own tests sharing KG2A.
- WebKit `management.spec.ts:22` once kept "Class name in Arabic" invalid
  after the English name was filled. The form moves focus a frame after
  Save, which may land inside Playwright's fill; not confirmed.
- WebKit `coursework.spec.ts:277` failed once.
- Firefox does not launch on some macOS machines. CI runs it under
  `xvfb-run`.
