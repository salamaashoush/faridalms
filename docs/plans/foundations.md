# Plan: foundations

The architecture audit of 1 November 2026 (`architecture-audit.md`, beside
this file) found 23 places where the platform does one job in two ways, or
where a feature built its own version of a core system. This plan fixes all
of them before schools are onboarded. The rule behind every item is the one
in `school-front-door.md` principle 1: one way to do each thing, extended
rather than duplicated.

Two findings are already being fixed elsewhere and are not repeated here:
the sign-in page as a website-builder page (merged), and one conversation
system with outside participants (the Messages unification, which also
settles findings 4, 6 and part of 17: the message body format, logged
contacts, reply templates in the Templates system, erasure of conversations
and enquiries, and normalised phone numbers).

## Workstreams

Each workstream ships with its migrations, both languages, API, database and
browser tests, and the full gate, and updates the docs it changes.

**W1. One publication lifecycle** (findings 1, 2, 11). A publication module
in core with one draft, scheduled and published model, one `publishIssues`
check list (captions, photo consent, content checks) run for every
publishable host, readers always shown the published copy, and go-live
notifications fired when a scheduled item goes live. Announcements and news
become two kinds of one broadcast system rather than mirrored tables.

**W2. The notification outbox covers everything** (finding 3). Teaching
events (assignment published, marks released, period grades released) get
notification kinds and go through `notify`; invitations and password resets
go through the delivery log like every other email.

**W3. One reach model** (findings 8, 10, 20). One guardian predicate (with
`communication_isolated`) and one definition of staff, used by every store;
one "who can reach this record" function used by every screen and
procedure; pages gated one way.

**W4. Time and the web's consistency** (findings 5, 9, 12, 19, 22 and the
small web duplications in P2). One time-zone helper (the school's zone, for
display and entry everywhere); a school-themed 404 on websites; the website
builder on the app's shell, autosave and history model, video player and
picture model; one school identity (logo, default language) instead of two;
the forms convention applied (domain schemas on the client, one field-error
mapper); one `formatDate`; brand colours as tokens.

**W5. Legacy out, tests on, docs true** (findings 7, 23, and the dead
foundation schema in P2). Delete the pre-cell schema, the control schema,
dead domain modules and old lesson formats; port and re-enable the ten
excluded e2e specs, including `access.spec.ts`; rewrite `architecture.md`
against the code; wire or mark deferred `idempotency_keys` and
`activity_events`.

**W6. Conventions and records** (findings 13, 14, 15, 16, 17, 18, and the
P2 audience and spam-guard items). API conventions (version checks on
every update, one stale-write error code, one pagination shape, Arabic
normalisation in every filter); history tabs fed by the audit log and one
history UI; erasure as a registry the tables declare; one translation
review; one question and answer model shared by quizzes, forms and the
application forms of admissions; saved sections on the templates and
shared-block systems; one audience semantics; the product demo form on the
enquiry form's spam guard. Finding 21 (plan modules and feature switches)
moves into the business console plan, which owns modules and entitlements.

## Order

The workstreams run in three waves, each of two in parallel, chosen so the
two touch different files; each wave is reviewed and merged before the next
starts.

1. **W5 and W4.** Removing the legacy stack first means no later change
   edits code that is about to be deleted.
2. **W1 and W3.**
3. **W2 and W6.** W6's question model must agree with admissions (slice 7
   and 8 of `school-front-door.md`).
