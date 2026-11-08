# Open work

What is known to be unfinished, in one place. Each item names the system it
belongs to. Delete an item when it lands; anything
larger than a few days of work gets its own plan beside this file.

## Foundations, wave 3

From `foundations.md`. W1 to W5 are merged.

- **W6, conventions and records** (findings 13 to 18 and the P2 items):
  - erasure for the tables `erasure-rules.ts` marks `to_erase`, and the
    owner's and the lawyer's review of every proposed rule (the list is in
    the ops repository, `plans/legal/erasure-registry.md`). Every table
    that names a person now declares one, and `db:verify` refuses a new
    table that does not;
  - one question and answer model shared by quizzes, forms and admission
    forms;
  - saved sections on the templates and shared-block systems. A page
    keeps its sections as section JSON in each language, not as a content
    document, so neither system holds one as it stands: either each learns
    a section kind (a template whose body is a section in both languages,
    and a shared section a page names and draws when it is shown), or
    sections get a small library of their own. The owner's call before it
    is built;
  - a shared person-name type in place of about 20 differently named
    field pairs;
- **Finding 21** (plan modules and feature switches): one module
  registry now gates the API, the navigation and the pages, and coding
  questions leave the editor's menus and run nothing at a school without
  coding, where a coding question kept in a document says the school
  does not run code; a school without video plays its videos as uploaded
  within the ordinary upload limit. Schools now read
  `school_entitlements`, and a school without a row has Basic; the seed's
  Fernhill school has Basic alone, and the browser walks its menus and
  record tabs. Left: the daily rows count emails,
  texts and sign-ins, but not caption minutes or video minutes encoded,
  which need the time a caption draft or a stream finished; and, once every
  cell runs the release that reads entitlements, dropping `school_plans`.
  Custom domains and video hours are held, and
  administrators see the contract notice, a trial's end, and students,
  staff accounts or the month's email past what the school is entitled
  to. An entitlement change applies from the next request: the console tells the cell, whose
  tenant registry counts it, and each unit of work reads the count.
- **Business console lifecycle** (its plan's slice 4): the console pauses,
  suspends and reopens a tenant through the provisioner, which the cell
  enforces at once. A paused school signs in, reads and keeps its sessions
  and exports, and refuses every other write with `tenant.paused`, which
  everyone in it is told; a suspended school's own portal says it is
  paused; a restricted school works but switches on no module and adds no
  address of its own. A console browser test pauses a school whose trial
  is over and its administrator sees the banner. Left: refusing
  text-message top-ups once there are any, and a browser test of a
  suspended school's own page.
- **Business console sales** (its plan's slice 6): the catalogue, customers
  and subscriptions live in the business database, and a school's
  entitlements are its subscription's, published at once or by the daily
  round, which also grandfathers tenants from before and pauses a trial
  that is over.

## Bugs found and not yet fixed

- A staff edit form was reported not to scroll. It scrolls when opened
  directly, from the staff list's row menu and from the person's record,
  on desktop and phone in Chromium and WebKit, so the path that reaches
  it stuck is not known yet.

## Front door

From `school-front-door.md`; slices 1 to 9 are merged.

- **Privacy and terms pages,** as website-builder pages, once their text is
  approved.
- **LTI issuer.** It still uses the bare domain. A second cell needs the
  `connect.` host handoff.

## Messages

- Routing inbound callbacks through `connect.` once a second cell exists.

## Teaching and records

- Files:
  - There is no job that re-encrypts sealed files after a key rotation; the
    encrypted fields have none either.

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
- `badges.spec.ts:50` once landed on `/family` instead of `/me`, and
  `badges.spec.ts:13` once found no badge sheet under the full run; both
  passed alone. They likely come from the spec's own tests sharing KG2A.
- WebKit `management.spec.ts:22` once kept "Class name in Arabic" invalid
  after the English name was filled. The form moves focus a frame after
  Save, which may land inside Playwright's fill; not confirmed.
- WebKit `coursework.spec.ts:277` failed once.
- `calendar.spec.ts:119` once left a dragged event a day short under the
  full four-worker run; it passed on each of two repeats alone.
- Firefox does not launch on some macOS machines. CI runs it under
  `xvfb-run`.
