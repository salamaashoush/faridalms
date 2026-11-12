# A core built around no one kind of school

The product serves schools, coding schools, course academies and video-course
schools. The owner ruled on 2026-11-12: there is no school type and no preset;
every difference between customers is a module that is on or off, and the
correct design is chosen over the cheaper one. This plan is the one design
every change in the work follows. It rests on an audit of the code at commit
af40bcb8 and on research into academy, coding-school and video-course
products, none of which requires a year, a grade, a homeroom or a guardian.

## What is wrong today

Core assumes a K-12 school. `school_year_id` is `NOT NULL` on classes,
enrolments, registers, timetable rows, assignments, learning modules and
admission intakes; a class is a homeroom or a subject class under one; a
register needs a period; the setup guide and Today ask every school for
terms, guardians, homeroom teachers and a timetable. An academy that runs
courses from a start date, for adults, with no year, cannot be represented.

## Rules

1. **Dependencies point inward.** A core table has no column that names a
   module's table or concept. A module's tables point at core, and at the
   modules it requires, never the reverse.
2. **Every table has one owner**: core or one module. A relation between two
   modules neither of which requires the other is a link table owned by one
   of them and marked as needing the other; it has rows only where both are
   on. No nullable column stands in for a link table.
3. **A module that is off leaves no trace**: no page, link, card, setup
   step, field, editor entry, notification, search result or wording, and
   its API namespaces answer `NOT_FOUND` as today.
4. **Core is enough to teach.** With every module off a school can add
   people, create a class, enrol learners, write content, message and keep a
   calendar. Each teaching module (coursework, attendance, e-learning) works
   on core alone.
5. **Core names no module in code either.** Where core, or one module,
   needs what another module knows (the classes that share a class's reach,
   the label of a student's homeroom, a card on Today, a section of the
   class page), it declares a typed extension point and the module that
   knows contributes to it. One composition root per app lists every
   module's contributions, and a point yields only those of the modules on
   at the school. No system, store or component imports a module's files
   except that module's own, a module that requires or needs it, and the
   composition root; a source check refuses anything else. A contribution
   made by one module to another's point is the code's link table: it lives
   with its provider and runs only where both are on. Such a contribution
   sits in a declared link file that states the modules it needs. A file
   that still imports a module it may not is listed, by the step that
   removes it, in a list the source check lets only shrink.
6. **The database cannot tell whether a module is on**, since entitlements
   live in the directory. So a module's rule that must stop when the module
   is off runs in its stores, called from its API; the database holds only
   keys that are true whether the module is on or off.
7. **A module that is off is dormant.** Its rows stay, core acts freely on
   what is core's, and nothing of the module refuses or changes it. What a
   module keeps in step with core is tied to core by keys where it can be,
   so it cannot disagree; what it derives into core it writes again when it
   next acts.
8. **No shims.** No hidden default row, placeholder year or "always present"
   record that keeps a wrong constraint alive. No compatibility layer; an old
   shape is removed in the change that lands its replacement.
9. **Fixed vocabularies may name a module's concept** (a role called
   `guardian`, an enrolment source called `rollover`): a word in a `CHECK`
   is not a dependency. Structure is.
10. **Tests come with the change**: domain unit tests, store tests against a
    throwaway database, API tests, and a browser spec for anything a person
    sees. A failing test is a bug in the code.

## Core

- **People** and their sign-ins, roles (the platform's fixed role
  vocabulary) and the school's own access roles and capabilities.
- **Courses**: what a school teaches. Title and code; subject optional.
- **Classes**: a group that is taught. Title, code, an optional course, an
  optional room, and `runs`, the dates it runs over, open-ended for a class
  that never stops enrolling. No year, no class type, no homeroom, no grade.
  A code is unique among a school's active classes whose `runs` overlap.
- **Enrolments**: a person in a class, in a role, over dates inside the
  class's `runs`. A class's roster is its enrolments, always; no reader
  resolves a roster through another class.
- **Students**: a student is a person holding the student role at the
  school. The day a student left, and the day their access ends, are core
  facts (`student_departures`), the same with any module on or off, so
  retention counts from the last day whatever a module adds to leaving.
- **School days**: the school's week and its closures, by date. Attendance
  and the timetable read them; they belong to no year.
- Documents and the editor, files, media, templates, comments, messages,
  announcements, calendar events, notifications, consents, privacy, search,
  home, billing, the assistant: as today, with every year, grade, guardian
  and homeroom reference removed or moved to its module.

## Modules that leave core

- **`school_years`**: years, terms and grading periods, academic weeks, the
  target of school days, rollover, re-enrolment, a student's placement in a
  year. It links a class to a year (`class_years`) and the year views are a
  filter over that link. Requires nothing.
- **`grade_levels`**: the school's grades or levels, a class's grade, a
  student's grade, calendars and audiences by grade. Requires nothing, so a
  coding school may use levels without years.
- **`homerooms`**: a homeroom with its subject classes. It owns what makes
  a class a homeroom, the link to each subject class, and a student's
  place in a homeroom, one at a time; from that place it writes the
  student's enrolment in the homeroom class and in each subject class. The
  homeroom teacher is the primary teacher enrolment of the homeroom. It
  contributes the classes that share a homeroom's reach, the timetable's
  grid of a homeroom, and the homeroom's daily register. Requires nothing.
- **`families`**: guardians and relationships, custody restrictions, the
  family workspace, what a guardian may see, sign and be told. Requires
  nothing. A learner without the module, or without a guardian, acts for
  themself. Most of what ties core to families is a person acting as a
  guardian, which no key shows, so this module's work is found by reading
  the code, not by the gate.

## Modules that change

- **`timetable`** takes periods and bell schedules from core. Timetables,
  meetings, cover as today, by date instead of by year. A grid is the
  classes planned together, one lesson to a cell: a class alone, unless a
  module contributes a wider one.
- **`attendance`**: a register is one class on one date, with an optional
  period where the timetable is on (a link table it owns, needing
  `timetable`). Absence reports from families and follow-up calls need
  `families`.
- **`coursework`, `elearning`**: belong to a class or to the school. No year
  column. The year map needs `school_years`.
- **`gradebook`**: running grades by class. Term grades and their release
  need `school_years`.
- **`admissions`**: an intake has dates; its year and grade are links
  needing `school_years` and `grade_levels`. A guardian applicant needs
  `families`; an adult applies for themself.
- **`coursework`** owns grading: a class's programme and grade scale are a
  link table of its own, not columns of the class. An assignment's place in
  a learning module is a link table of `elearning` needing `coursework`.
- **`standards`** requires coursework or e-learning, so it is certain of
  neither: evidence and goal judgements keep the standard and the student,
  and where each came from is a link table per source, one needing
  `coursework` (the submission) and one needing `elearning` (the lesson).
- **`website`**: the category an announcement is published under on the
  site is a link table of the website's, not a column of the announcement.
- **`sso`**: the provider a sign-in identity came from is a link table of
  `sso`, not a column of the identity.
- **`student_records`, `badges`**: every year, grade and guardian reference
  follows the same rule. A requested change to a health record names the
  person who asked; that they are a guardian is a link needing `families`.
- **`peer_review`, `sso`, `sms`** become real gates in the API and the web,
  and the editor's insert entries are offered by module as well as by the
  kind of document.

`MODULES` states each requirement, and the registry gains, for every table,
its owner and the modules it needs.

## What follows the modules

The setup guide's steps, Today's cards, the sidebar, the settings tabs, the
search, empty states and wording are each computed from the modules that are
on. A step, card or sentence that names a year, a term, a grade, a homeroom,
a guardian or a period belongs to that module and is absent without it.

## What keeps it true

- **An ownership gate** in `db:verify`: every table, every descriptor
  namespace and every column named for a module's concept (a year, a
  homeroom, a period) declares its owner; the catalogue is read and a key,
  a namespace column or a concept column in a table that may not reach its
  owner fails the build. While the work is in progress the gate carries a
  list of the violations still to remove, which only shrinks; the last
  change deletes the list.
- **A school on core and the teaching modules alone** in the seed, beside
  the existing ones, with a browser spec that walks its setup, a class, a
  register, an assignment, a lesson and a message.
- **The router test** that refuses a namespace owned by neither core nor a
  module, extended to the web's pages and the editor's entries.

## Migrations

Nothing deployed holds data that must survive, so the 341 cell migrations
are replaced first by a baseline written as if the schema had been designed
today: the generated tables, then hand-written files by topic (schemas and
extensions, functions, row security and grants, triggers, exclusion and
period keys, partitions, views). The baseline is proved equal to the old
chain by comparing the catalogues of two throwaway databases. Until the work
is finished the baseline is rewritten in place by each change, not appended
to; the rule "never edit an applied migration" returns with the first
release after it. The directory and business databases get the same.

## Order of work

Each step leaves `bun run ready` green.

1. Baseline migrations for the three databases, proved equal.
2. The ownership registry and gate, the new module ids and their
   requirements, entitlements, plans and seed for them. No behaviour change.
3. Homerooms: enrolments written to subject classes, the class type gone.
4. Classes and enrolments off the school year: `runs`, `class_years`, year
   views as a filter, rollover inside `school_years`.
5. Periods and bell schedules into the timetable; school days into core;
   registers by class and date.
6. Coursework, e-learning and gradebook off the year; term grades needing
   `school_years`; grading off the class; the assignment's module link; the
   standards source links.
7. Grade levels; admissions links.
8. Families.
9. Surfaces: setup guide, Today, sidebar, settings, search, wording; the
   gate leaks; the web and editor gates; the website category and sign-in
   provider links.
10. The core-only school in the seed and its browser spec.
11. Removal of everything left without a reader, the violations list, and a
    last rewrite of the baseline; documents brought up to date
    (`docs/architecture.md`, `docs/systems/platform-foundation.md`,
    `docs/product-spec.md`, `docs/plans/onboarding.md`,
    `docs/plans/navigation.md`, `docs/plans/open-work.md`).

Between steps 4 and 6 a class with no year link cannot take a register, a
timetable entry, an assignment or a term grade; the API refuses it by name
(`class.no_school_year`) and steps 5 and 6 remove each refusal.

## Not in this work

- Fees: what a learner owes and has paid. Every academy product leads with
  it; it is the next module to design.
- Counting use per module.
- A catalogue and checkout for selling a course to the public.

## For the owner

- Which of the new modules Basic includes. Until decided, Basic keeps what
  a school has today, so it gains all four.
- The production cell holds only the demo school. The baseline cannot
  migrate it. The owner agreed on 2026-11-12 that production is recreated
  and refilled with `admin demo` at the deploy that carries this work.

## After this work

- Plans: what each plan includes, redrawn over the new modules.
- The marketing website, rewritten for schools, coding schools, academies
  and video-course schools.
