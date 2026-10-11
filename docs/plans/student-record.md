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
   guardians uses the portal. Move class, Create accounts and Archive for
   several students remain.
5. **Arrivals and departures.** Previous school and destination on the
   school-year rows, a Documents section for transfer certificates and past
   reports, and rights decisions enforced where families act (absence
   reports, consents).
6. **The family's view.** Each child's details as the school holds them,
   with "Ask the school to correct this" sent as a message linked to the
   child.
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
