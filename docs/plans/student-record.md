# Plan: the student record

Written 2026-10-03. Research behind it: Ed-Fi 5.2 (`Student`,
`StudentEducationOrganizationAssociation`, `StudentSchoolAssociation`,
`StudentContactAssociation`, program associations), OneRoster 1.2 `User` and
`Demographics`, the student pages of Arbor, iSAMS, PowerSchool, Blackbaud and
Veracross, KHDA registration and the ADEK Records, Inclusion and Student
Protection policies, Egypt's PDPL with Decision 816/2025, the UAE and Saudi
PDPLs, Cambridge and IB entry rules, and KCSIE 2026. The platform foundation
(sections 4.6, 6.7 to 6.13) already defines most of the storage; this plan
says what the record is, what is missing, and the order to build it in.

## 1. What the record is

One student, one record per school: the `users` row, the school-year rows
(`student_school_years`), the guardian links (`user_relationships`) and the
keyed extensions behind purposes (demographics, health, custody). Every
feature that needs a fact about a student reads it from there through the
stores; no feature keeps its own copy of a name, a class, a guardian or a
consent.

Rules that hold for every section:

- **Legal name and preferred name stay apart.** Exam boards and regulators
  want the name exactly as on the identity document (Cambridge, KHDA); the
  school uses the preferred name. Both scripts are kept.
- **Sensitive sections sit behind a purpose and are audited**: health,
  demographics, custody, identity documents. A reader sees the derived flag
  (medical alert, custody alert, no photos) without the detail.
- **Staff reach the students they teach**, the office reaches everyone
  (`app.visible_students`). A teacher sees what the teacher needs to act:
  alerts, accommodations, pickup flags, not diagnoses or court orders.
- **A family link decides what an adult may do.** `portal_access` lets them
  follow the child. `educational_rights` says how far: `full` follows and
  decides; `restricted` follows but does not decide (no consents, no
  absence reports, no changes to the child's details), which is how a court
  separates educational guardianship from the other parent's right to follow
  progress; `none` neither. Consent on the child's behalf needs
  `legal_guardian`, confirmed by the office.
- **Nothing is overwritten silently.** Links, identifiers and placements are
  dated; consents are append-only; every change is in the History tab.

## 2. Sections against what exists

- **Identity**: names in both scripts with parts, preferred names, birth date
  and its source, sex, photo, school reference. Complete.
- **Identity documents**: `external_ids` holds the school reference; national
  ID and passport must be sealed (`identifiers` key, HMAC lookup), but
  nothing writes them and `identifiers:read` is unused. Missing: residence
  permit (Iqama, Emirates ID for residents), birth certificate number,
  issuing country, expiry, exam-board lifetime ids (Cambridge UCI, IBIS
  personal code). No screen.
- **Background**: birth country and city, nationalities, religion, home
  languages behind the demographics purpose. Complete for now; the religious
  education group a ministry requires derives from religion.
- **Enrolment**: years with grade, entry and exit types, next-year outcome,
  classes. Missing: the school a student came from and goes to, and the
  documents that prove it (transfer certificate, previous reports).
- **Family**: guardian links with residence, pickup, notices, portal,
  priority, contacts and address, custody behind its purpose, siblings.
  Complete after the household removal, except that `restricted` rights and
  `access_ends_at_majority` are not enforced and legal guardianship is never
  confirmed.
- **Health**: encrypted records by kind with an alert flag. The alert reaches
  teachers only as a chip with nothing to act on; trip leaders and PE staff
  need the action ("severe nut allergy, pen in the nurse's office").
- **Consents**: tables, purposes and the website's photo check exist, but no
  consent is ever recorded and no photo is ever tagged, so the check never
  fires. Egypt's obligations apply from about 1 November 2026.
- **Learning support, pastoral, safeguarding**: absent. ADEK requires
  documented learning plans and behaviour incident records; safeguarding
  files are kept apart and seen only by the designated lead.
- **Coursework, attendance, results, account, history**: tabs exist.
- **Overview and actions**: the spec's Message and Move class, today's
  timetable, term attendance and recent notices are missing from the record;
  the list has only Export of its bulk actions; import is unbuilt
  (`people:import` unused).
- **Family view**: families follow work, grades, attendance and timetable but
  never see the details the school holds about their child, so they cannot
  spot a wrong phone number or birth date.

## 3. Slices, in order

1. **Consents.** Consent forms per purpose, written in both languages as
   editor documents (`privacy_notices`, one row per language of a version),
   published from Privacy. Legal guardians with full rights answer per child
   in the family app; the office records a paper or spoken answer with its
   evidence. The record's Consents section shows the current answer per
   purpose, who gave it, how and when, with the history. Ticking legal
   guardian is the office's confirmation (`staff_attested`). A refused photo
   consent shows as a No photos alert on the record.
   Restricted and no-access links cannot answer, nor report absences.
2. **Photos of students.** Tag who appears in a picture placed in news or on
   the website (`file_subjects`); publishing stops while anyone tagged lacks
   a granted photo consent, naming them.
3. **Identity documents.** Add residence permit, birth certificate and exam
   board ids, issuing country and expiry; seal every document number; a
   section on Details that shows masked numbers, reveals with
   `identifiers:read` (audited), finds a student by exact number, and lists
   documents expiring within 60 days for the office.
4. **Overview and actions.** Message guardians and Move class in the header;
   today's timetable, this term's attendance and recent notices on Overview;
   Move class, Message guardians, Create accounts and Archive as list bulk
   actions. Done for Overview: the record opens on the student's lessons
   today with the day's changes, the year's attendance so far with the way
   to every mark, and the latest notices sent to their guardians with who
   has read each. Each shows only to a viewer who may read it elsewhere.
   Done for the header: Message guardians opens a new message to the
   student's guardians, with nobody to pick, and lands in the conversation;
   Move class opens the sheet the Enrollment tab opens. Done for the
   list: Message guardians writes to the families of the students picked,
   each in a conversation of its own, and names any student none of whose
   guardians uses the portal; Move class moves them to one homeroom from a
   date, each as moving one does, and names with the reason any student the
   move is refused for. Create sign-ins opens one for each student picked
   who has none, in the way the office chooses: a sign-in name and a first
   password on a printed slip, or a badge for a young child. The office sees
   who gets one, who has one and who cannot be given one before anything is
   made, and what is made shows once, on a sheet to print. A sign-in name is
   the student's own email address, else their school number, else their
   name in Latin letters, so the sign-in page takes a short name as well as
   an email address. Record as left, from the record's menu or for several
   students in the list, is what other school systems call archiving a
   student; section 4 says what it does. The third way of Create sign-ins
   is a link by email: each guardian who decides for the student, takes the
   school's notices and has an email address is sent a link that works once,
   for seven days, to choose the student's password. Only the hash of the
   link's secret is kept, the account stays "invited" and signs nobody in
   until the password is chosen, a link sent again replaces the first, and a
   slip printed for the student stops the links. It needs the server's email
   gateway (`EMAIL_WEBHOOK_URL`). Anyone who signs in with a password
   changes it from the account menu, with the one they have; their other
   devices are signed out. Remaining: the same link for guardians' and
   staff's own accounts.
5. **Arrivals and departures.** Previous school and destination on the
   school-year rows, a Documents section for transfer certificates and past
   reports, and rights decisions enforced where families act (absence
   reports, consents). Done: the destination, recorded with the departure;
   how a student joined and the school they came from, kept on their first
   placement and edited from the Enrollment tab's Joining section; and the
   rights decisions. Remaining: the Documents section.
6. **The family's view.** Each child's details as the school holds them,
   with "Ask the school to correct this" sent as a message linked to the
   child. Done, with one change: Children has a Details page per child
   (name in both scripts, known-as name, birth date, sex, school number,
   grade and class, and the guardian's own contact details; never another
   guardian's), and Ask to correct logs a correction in the register of
   records requests in place of a message. A request is answered on its
   law's clock and a message is not: Egypt's six working days and the UK's
   month come from the school's country, anywhere else it is due thirty
   days on, and the office may change both. Only a guardian who decides for
   the child may ask, and at most three of theirs stay open per child.
7. **Health alerts for teachers.** An action line on alert records, readable
   by the student's teachers through the health purpose and audited, shown
   with the custody and No photos flags on the record, roster, register and
   event participants.
8. **Learning support.** Needs, plan type (IEP, ILP, BSP and the like),
   review dates, accommodations teachers see, exam access arrangements.
9. **Pastoral notes and safeguarding.** Pastoral notes teachers can add and
   read for their students; safeguarding concerns as a separate chronology
   seen only by the designated lead and team. Egypt bars using children's
   data for behavioural monitoring, so there are no points or scores.
10. **Coming of age.** End portal access when a student reaches majority in
    the school's jurisdiction where the link says so, unless the student
    consents.

## 4. A student who leaves

Researched 2026-10-11 against Arbor (unenrolling, leavers, parent portal
access), district guides to PowerSchool transfers, IRIS Ed:gen and iSAMS
former-pupil records, England's School Attendance (Pupil Registration)
Regulations 2024, and ADEK's records policy. What they agree on, and what
Farida does:

- **A leaver is never deleted or hidden.** The record becomes the school's
  file on a former student: status Left or Graduated, found through the
  list's status filter, kept for the retention period (ADEK asks for at
  least five years after leaving, and graduation records for good). Erasure
  stays its own process under Data protection.
- **Leaving is a dated fact with a reason.** The office records the last
  day, why the student left (the school's exit types, mapped to Ed-Fi's
  exit and withdraw types) and, where the family has said, the school they
  go to. England lets a school take a name off the roll only on a stated
  ground and has it report where the child went, so the reason is required
  and the destination is asked for.
- **Classes end after the last day.** Every class enrolment ends then and a
  placement to be taken up later is dropped. Marks already taken stay. A
  register that marks the student after the last day refuses the change,
  since it says the student was still here: the office picks a later day or
  corrects the register.
- **The family keeps reading for a while.** Arbor keeps a leaver's parents
  until the end of the academic year the child last attended; PowerSchool
  districts cut access on the day. Farida offers both and defaults to the
  first: the student and their guardians sign in and read reports and
  results until the next school year begins (or the year's end where no
  later year is set up), or no longer than the last day. Brothers and
  sisters still at the school are untouched; a guardian with no child left
  to follow can no longer open the family workspace.
- **It can be taken back.** Undo leaving reopens the placement and the
  classes that ended with it, for a mistake or a student who stays. One who
  comes back later is placed again as a new entry.
- **Leavers at the turn of the year** (Leave or Graduate in the rollover)
  follow the same rule: their role ends the day the new year begins.

Before this, nothing ended a student's role, so a leaver and their guardians
kept their access for good, and a guardian reached any student who had ever
had a placement. A guardian, and the student, now reach a student only while
a placement or the student role has not ended.
