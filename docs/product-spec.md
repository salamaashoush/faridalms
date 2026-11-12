# Farida LMS product specification

What each system does, for whom, and on which pages. It is built from how
Google Classroom, Canvas, Microsoft Teams, Schoology, Seesaw, Toddle, Moodle,
Brightspace, ParentSquare, Remind, ClassDojo, Brightwheel, PowerSchool, Arbor,
Veracross, Blackbaud, Finalsite and Apptegy solve the same jobs, as documented
in their official help centres. Visual and interaction rules live in
[design-system.md](design-system.md); architecture in
[architecture.md](architecture.md).

## Principles

1. **Home is a list of next actions, not a feed.** Every card has one action
   and disappears when empty.
2. **One status vocabulary per object**, used on every screen, in every digest
   and every notification.
3. **One verb makes a thing visible.** Assign publishes coursework, Return
   releases a result, Post publishes an announcement.
4. **The minimum is enough.** A title and body are enough to assign; every
   other field has a sensible default summarised in one sentence.
5. **Nothing destroys work.** No edit deletes a submission, a register mark or a
   history row; changes are dated and audited.
6. **Families get digests, not alert storms.** Instant notifications only for
   absence, returned work, urgent announcements and direct messages.
7. **One app for every role, bilingual and mirrored.** Content is structured,
   never raw HTML, so it can be translated and shown right to left.

## Roles and navigation

Desktop uses a left sidebar; phones use 4–5 bottom tabs. Search (Ctrl/Cmd+K)
and notifications sit in the sidebar header.

- **Teacher:** Today · Classes · To review · Coursework · Modules · Calendar ·
  Messages. Attendance opens from a timetable period; timetable lives in Today
  and Calendar.
- **Family:** Home · Calendar · Messages · Announcements · Child. A child chip in the header switches between children
  (avatar, name, colour); Home defaults to all children and the chosen child is
  kept in the URL.
- **Student:** Home · Classes · To do · Calendar · Messages · Grades.
- **Young student (K–2):** Home only: a grid of big task cards with audio
  labels and a Continue button, no messages and no grade numbers.
- **Admin:** Today · Students · Staff · Classes · Attendance ·
  Timetable · School year · Communication · Website · Settings.

## Home pages

- **Teacher Today:** today's periods with now/next and each register's state;
  To review counts per class (up to 5 items); unread family messages (3); this
  week's due dates and events; class cards.
- **Family Home:** per child, today's presence and now/next period; needs
  attention (missing work, new result, absence, unread teacher message, at most
  3, one action each); due this week. Then the latest 3 announcements, pinned
  first. No averages as headlines, no infinite feed.
- **Student Home:** due soon (7 days, at most 5, missing flagged); today's
  timetable; continue lesson; class announcements; classes.
- **Admin Today:** needs action (registers not taken with Remind all,
  unexplained absences, students without a class or guardian, homerooms without
  a teacher where the school has homerooms, failed notifications), today's and
  this week's attendance,
  the next 7 days of events, recent communications with read rates, and a
  year-setup checklist eight weeks before year end.

## Classes

A class is a group that is taught: a name and code, an optional subject,
grade and room, and its teachers, the first of them its primary teacher.
Whoever is in a class is its enrolments; no class takes its students from
another. A class runs over its own dates, a first day and, for one that
ends, a last day; a student joins on a day inside them, and the dates cannot
be narrowed past a student still in the class. The class list shows the
classes running or about to start, or those that ended. A school with every
module off creates classes and enrols people in them directly. A class in no
school year takes assignments, lessons, registers and timetable entries like
any other, and its gradebook keeps a running grade from the work graded so
far; term grades, and the term a piece of work counts toward, belong to a
class's school year where the school keeps years.

The class is the hub for everything taught in it.

- Header: name, subject colour, teachers, next period and room, and the
  teacher's primary Create button.
- Tabs: Stream (announcements, classwork condensed, an Upcoming box), Classwork
  (grouped by topic, collapsed by default and remembered), People, Grades
  (gradebook for teachers, own results for students and families), Attendance
  (teachers).

## Coursework

**States a learner sees** (one server function computes them): To do, In
progress, Handed in, Handed in late, Missing, Needs revision, Returned,
Excused. Teachers also see Not yet available and Draft grade. Assignments are
Draft, Scheduled, Assigned, Past due, Closed or Archived. Missing starts at the
due time whatever the late policy; a short grace period absorbs the
last-minute boundary.

**Teacher**

- Coursework list: tabs To grade (count), Assigned, Scheduled, Drafts, Past;
  filter by class and subject; rows show class chips, due date and "18/25
  handed in · 3 missing · 5 to grade". Create and Reuse.
- Editor: title, brief, resources in the main column. The side panel holds
  class and audience (whole class, groups, students as chips), due (school
  default time, quick picks Tomorrow, Next lesson, Friday), points or
  Ungraded, topic and rubric. One sentence summarises the rest ("Visible now ·
  due Thu 14:00 · late work accepted and marked late"); More options holds
  available-from, close, late policy, format and limits, resubmission. Assign
  (or Schedule), Preview as student. Posting to several classes makes one copy
  per class with its own dates.
- Assignment record: Brief and Student work tabs. Student work groups the
  roster by state with bulk Return, Return for revision, Excuse and Remind.
- Grading view: student list sorted by needs-grading, the submission with its
  attempts in the middle, and score, rubric levels, feedback with a comment
  bank and private comments on the side. Everything saves as a draft; Return &
  next, Needs revision. J/K moves between students.
- Rubric library: criteria by levels with points, scoring on or off; attaching
  copies the rubric; points lock once grading starts.

**Student:** To do with To do / Missing / Done tabs grouped by day; the
assignment shows the brief and a Your work card (write online with autosave,
attach files or a photo), Hand in with a confirmation and a receipt, Undo hand
in until returned, and the returned score, rubric and feedback. Mark as done
for work with nothing to hand in.

**Family:** per child, Missing first, then due this week, what was handed in
and waits to be marked, recently returned, and work returned earlier in the
year. A returned piece opens with its mark, its rubric levels and the
teacher's feedback. Never draft grades, never other students. A weekly digest (daily
optional) in the parent's language, sent only when there is something to say.

**Admin:** missing work by class and grade; assignment load per class per week.

## Assessment and grades

Results belong to an attempt and stay private until returned. Rubric totals
fill in automatically and can be overridden with a note. The gradebook groups
by term; families see returned results only.

## Attendance

- **Homerooms** (a module): a homeroom is a class a student belongs to, one at
  a time, with subject classes taught to it. Placing a student in a homeroom
  enrols them in the homeroom class and in each of its subject classes from
  that day; moving or withdrawing them ends those enrolments on the day; a
  subject added later takes the homeroom's students from the day it is added.
  The homeroom teacher is the homeroom class's primary teacher. Where the
  module is on, the Classes page opens on a Homerooms tab, a homeroom's page
  lists its subjects and a subject class names its homeroom, a student's
  record shows their homeroom with Move and Remove, the student list has a
  homeroom column and a bulk move, homerooms are owed a daily register in the
  official period, and the timetable plans a homeroom's subject classes in one
  grid. Where it is off, none of that shows.

- Teacher register (phone first): rows start unmarked; Mark rest present fills
  them in one tap; exceptions are Present, Absent, Late (minutes), Excused, Left
  early, each with an optional note; a sticky footer summarises and saves.
  Teachers may edit within a configurable window.
- A register takes marks only for the students enrolled in the class on that
  date. It cannot be saved for a closed year, a future
  date or a day that is not a school day, nor, for a teacher without
  `attendance:manage`, outside the edit window; a save made from an
  out-of-date register is refused rather than overwriting someone else's.
- Admin: registers board (every class by session: not started, in progress,
  submitted, with Remind), absences (unexplained first, bulk message guardians,
  excuse with reason), reports (by student and class, chronic absence threshold,
  export).
- Families are told about unexcused absences after a configurable delay so
  corrections do not send false alarms. Every message is logged.

## Timetable

A periods-by-days grid that mirrors for Arabic. A cell opens a picker listing
the class's allocated teachers first, plus the room. Placing a teacher who is
already booked offers Move here, Keep both (flagged) or Cancel. Views by class,
teacher and room; a Clashes panel; print. Changes are dated; past registers are
never rewritten.

## School year

School years are a module. Where it is on, a class may belong to one year,
its dates inside the year's (choosing a year on the class form sets them to
the year's), the class and student lists open on the working year with a
year filter kept in the address, a student is placed in a year with a grade,
and a student's class history names each class's year. A closed year's
classes take no change and its list offers no new class. Where it is off,
none of that shows and the year pages answer not found.

Years are Upcoming, Current or Closed, with terms and holidays. Rollover is a
re-entrant draft: create next year, copy classes and allocations, promote by
class mapping with per-student Retain / Leave / Graduate, copy or skip the
timetable, resolve blockers, review counts, apply. Making the new year current
is a separate, explicit step; the old year becomes read-only.

- Making an upcoming year current closes the year it replaces; the current
  year is never closed directly. Reopening a closed year needs
  `years:reopen` and a reason, and leaves it open but not current. Each step
  is an audited event that keeps the reason.
- The rollover plan is a draft saved against the version it read. Opening
  it again adds newcomers as promoted and drops students who left. Applying
  runs in one transaction, copies no coursework and changes nothing in the
  year it comes from; applying again, even at the same moment, answers with
  the outcome already recorded, and a stale plan or a closed year is
  refused.
- Classes of their own carry into the new year as themselves, on the new
  year's dates, with their students but those leaving or graduating; a
  student the year never placed goes with their class. Homerooms carry as
  homerooms where the school has both.
- Lists that span years show the year in the URL. With none named they show
  the current year, else the year that holds today, else the latest; a year
  that does not exist answers not found rather than showing another.

## People

- **Students:** list with photo, both names, reference, homeroom (where the
  school has homerooms),
  primary guardian phone, status and account; chips for grade, class, status,
  missing guardian, no account; search across scripts, reference and guardian
  phone; saved views; bulk Move class, Message guardians, Create accounts,
  Export, Archive.
- **Student record:** header with photo, names, reference, class, status and
  alert chips (medical, custody); Message, Move class, More. Tabs: Overview
  (guardians with call and message, today's timetable, term attendance, recent
  notifications), Details, Family, Enrolment history, Attendance, Coursework and
  results, Account, History. Sections edit in side sheets.
- **Families:** the guardian–student links are the family; there is no
  separate household. Each link carries primary contact, receives notices
  (absence alerts, with or without the family app), may pick up, portal
  access, and home (main home, second home, does not live with them).
  Siblings are students who share a parent's link. An adult's phone, email
  and home address are edited from the student's Family tab or the adult's
  record.
- **Consents:** Data protection keeps one consent form per purpose (photos
  on the website, in school news, giving medicine, and the school's own),
  written as a document in one or both languages. Publishing freezes it as a
  numbered version and asks every confirmed legal guardian with full rights
  in the family app's Permissions page; the office records answers given on
  a signed paper form (with its scan) or in person. Ticking Legal guardian on
  a link is the office's confirmation. The Family tab shows the answer in
  force per purpose with who gave it, how and when, and the answers before
  it; a refused photo consent shows as a No photos alert. A new version asks
  again while the earlier answer stays in force; in Egypt an answer given
  for a child under 15 is due again at 15.
- **Identity documents:** national ID, passport, residence permit, birth
  certificate and exam board numbers on the Details tab, document numbers
  masked until someone allowed asks to see them. A renewed passport is added
  beside the old one; the office's home lists documents running out within
  60 days, and the student list finds a student by an exact number.
- **Photos of students:** a picture's own controls (the editor's bar on a
  picture in any document, a post's cover picture, the picture control of a
  website section) name the students in it and show whether each family
  agreed to that place.
  Publishing refuses a picture of a student without a yes, and a family's
  later no to the website takes their child's pictures off it at once.
- **Staff:** roles, classes taught (and whose homeroom teacher they are, where
  the school has homerooms), timetable, effective access,
  sign-in activity, history.
- **Adding a student:** names, date of birth and class; a matching name and
  birth date offers Open existing; guardians are found by phone or email before
  a new one is created; Save and add another.
- **Import:** template, upload, column mapping, per-row validation, mode
  (create, or create and update by reference), preview counts, commit, per-row
  results.
- **Moving a student:** target class and date, impact on timetable and
  registers, confirm; the old enrolment is end-dated.
- **Leaving:** the office records a student's last day and how long they and
  their family go on reading the record (to the last day, to a day it
  chooses, or, where the school has years, to the end of the year); the
  student's classes end on that day and modules record what they keep, such
  as the reason and next school. Undoing the leaving restores exactly what
  it ended. Retention counts from the last day, however long the family
  goes on reading.

## Roles and access

Roles list with members and last change; each role's permissions grouped by
area in plain language with a Sensitive badge; clone a role; members with
optional end dates; reverse lookup from a permission to who holds it; changes
apply immediately; the last administrator cannot be removed; everything is
audited.

## Messaging

- Two panes from 1024px (thread list and conversation), stacked on phones.
  Filters All, Unread, Drafts, a child chip; search covers original and
  translated text. Unread first.
- Conversations are chat bubbles grouped by date, each with its own text
  direction; an info drawer lists members, the linked student, attachments,
  print and mute.
- Every guardian pair of a child shares one thread per staff member, so both
  parents always see replies. Group threads can gain and lose members.
- Who may message whom is a school setting matrix; by default families reach
  their children's teachers and the office.
- Office hours: messages still arrive, push and SMS wait, a banner tells the
  family; staff confirm before sending outside hours.
- Staff see Seen / Seen by n of m; families never see staff read state.
- Composer: text, attachments, voice note with transcript, autosaved drafts,
  scheduling for staff; recipients limited to real relationships with quick
  picks (class guardians, co-teachers); a count before sending.

## Announcements

Everything the school sends to its people is an announcement, written as one
document in the shared editor. One may also go on the school's website, where
it is the website's news; there is no separate news system.

- Feed: pinned first (with an optional pin-until), then cards with author,
  audience, urgency, title, summary, attachments, Acknowledge when required,
  and event and RSVP blocks; filters by child and category; expired posts move
  to Past. It holds what reached the reader and everything on the website,
  searchable.
- Composer: audience (everyone, staff, families, students, by scope), subject,
  body, attachments, event and RSVP, require acknowledgement with a due date,
  comments off, on or private replies, pin until, expiry. Urgency: normal
  (respects preferences), time-sensitive (skips the digest), emergency (admins,
  bypasses quiet hours). Written in one language or both, each with its own
  title, the translation checked against the original (the check lapses when
  the original changes); readers open their own language first and the notice
  carries the summary, else the opening words. A weekly or monthly newsletter
  is an announcement started from a newsletter template.
  Preview, Schedule, Post, Duplicate. Edits are silent unless the author
  chooses Send update.
- Delivery report: per recipient channel status, viewed, acknowledged,
  language; remind those who have not acknowledged; export.
- Also on the website (schools with the website): one switch puts it on the
  website as well, with a cover picture, a category, an address and pinning;
  without a cover its website card shows the first picture in it. Its
  audience then becomes optional, so it can go on the website without telling
  anyone. Taking it back to a draft or into the archive takes it off the
  website.

## Calendar

Families see an agenda by default (Upcoming, per child) with month optional.
Staff see month and week grids with a category legend and filters. Events:
title, all-day or times, location, category (colour and icon), audience,
description, attachments, RSVP or sign-up slots, reminders, and notify now or
add silently. Every person and every child has an iCal subscription link.

## Notifications

- Bell with Needs action and All tabs, grouped by day and type, each item with
  a child chip and a link; Mark all read. Covers everything, new posts
  included.
- Preferences: a matrix of Messages, Announcements, Calendar
  reminders and Academics against in-app, email and SMS, each Instant, Digest
  or Off; emergency and time-sensitive are locked on. Digest daily or weekly at
  a chosen time, skipped when empty. Quiet hours and weekend mute, with a note
  that emergencies still arrive. Language with a preview.
- Admins see reachability: bounced, marked spam, unsubscribed, never signed in.

## Modules and lessons

- Structure: module, lessons, blocks (the shared editor, plus quiz and
  reflection blocks and optional audio narration per block).
- Module: Draft, Scheduled or Published; assigned classes; prerequisite
  module; sequential order. Each lesson completes when viewed, marked done,
  quiz submitted, score reached or reflection submitted. Preview as student;
  duplicate to another class.
- Player: collapsible lesson index with ticks and locks, content in the middle
  with reading position saved, a sticky Previous · Mark complete · Next footer,
  a progress bar filling in the reading direction, and a completion screen
  pointing onward.
- Quizzes for K–2: one question per screen, big targets, audio for question and
  options, kind immediate feedback with retry, stars not percentages. Older
  students: Check, hints, a set number of attempts, review.
- Teacher progress: students by lessons matrix with not started, stuck and
  done filters, per-question responses, manual override shown distinctly.

## Website

Page tree equals navigation (drag to reorder, hide from menu). Pages are built
from sections (hero, text, image and text, card grid, call to action,
accordion, news list, events list, gallery, contact, embed). English and Arabic
are edited side by side with a missing-translation badge. Draft, Published and
Published with unpublished changes; scheduling; version history with restore;
phone and desktop preview in both languages; editors submit and admins approve;
checks before publishing (one H1, alt text, descriptive links). Posts are
announcements put on the website (see Announcements), with a cover, summary,
category, pin and schedule. A
site-wide banner for closures.

## Settings

School profile (names in both languages, logo, timezone, weekend days),
features, attendance rules (statuses, edit window, late threshold, absence
notification delay), messaging permissions and office hours, notification
templates in both languages, roles and access, audit log, import.
