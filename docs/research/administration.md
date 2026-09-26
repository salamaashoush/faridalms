# School administration research

Official help centres, read on 2026-09-26. Search quota ran out partway;
Veracross, ManageBac and Toddle pages block direct fetches, so claims for them
rest on search excerpts.

## 1. Directories

- PowerSchool: one search box for names, IDs or field commands joined by `;`;
  stored searches re-run while stored selections freeze a list; the current
  selection drives group functions such as mass enrol
  (https://ps.powerschool-docs.com/pssis-admin/latest/student-stored-searches).
- Arbor bulk actions: tick rows, the Bulk action button turns green, the footer
  counts the selection; filtering after selecting drops hidden rows and says
  so; actions include messaging students or guardians, custom groups, export
  (https://support.arbor-education.com/hc/en-us/articles/360010183174).
- Veracross batch-updates query results in the background; Moodle has a filter
  builder with "With selected users".
- Arbor records: fixed header, a left menu of sections shown by permission,
  previous/next through a registration form, edits in slide-overs, print to PDF
  (student https://support.arbor-education.com/hc/en-us/articles/21188336199581,
  staff https://support.arbor-education.com/hc/en-us/articles/30207101546013).
- PowerSchool shows medical, guardian and birthday alert icons on every
  student page.

## 2. Creating records, guardians, duplicates, import

- Veracross requires only a last name and says to confirm the person doesn't
  exist first; Arbor uses a basic form then enrols from the profile. No wizards.
- PowerSchool guardians: search existing contacts, then set the relationship
  per link; "No Access" blocks custody and records access
  (https://ps.powerschool-docs.com/pssis-admin/latest/add-contact-associations).
- Blackbaud relationships carry parental access, list as parent, resides with;
  emergency contact is separate.
- Veracross separates household from relationship, which handles separated
  parents.
- PowerSchool duplicate prevention: first initial, last name, loose address,
  exact phone or email; auto-link only on a single match; approval blocked
  until resolved; merge keeps one master
  (https://ps.powerschool-docs.com/pssis-admin/latest/duplicate-contact-prevention).
- Moodle CSV import: template, upload, preview, mode (add, add and update,
  update), per-field policy for existing records, per-row results
  (https://docs.moodle.org/27/en/Upload_users); Microsoft SDS validates
  structure then samples data.

## 3. Classes and enrolment

Arbor enrols from the student's profile, bulk-enrols, and shows class lists
with demographics; Toddle adds students with a picker. Changes are dated:
PowerSchool transfers stay pending until their date; Arbor ends an old slot
and starts a new one rather than rewriting slots with registers.

## 4. Attendance

- Exception entry: Blackbaud blank means present with All Present; Fedena
  everyone starts present with rapid attendance; Arbor "Mark All Blanks as
  Present" at top and bottom, a reason pop-up for absence, the exact time for
  late, list or photo view, and a warning against projecting registers.
- Statuses: Toddle Present, Absent, Arrived Late, Left Early, Excused;
  ManageBac school-defined categories and colours.
- Edit windows: PowerSchool 14 days back and 7 ahead for teachers.
- Oversight: Arbor incomplete registers with reminders and a blank-marks
  report; Blackbaud Attendance Hub with Needs Attention, reasons and late
  submissions.
- Families: Arbor messages primary guardians from templates with an outbox
  (failed SMS doesn't fall back to email); ManageBac toggles homeroom absence
  notices; Brightwheel does not notify by default.

## 5. Timetable

Toddle's setup checklist (days, periods, bell schedules, routines) with the
cycle locked once mapping starts and spreadsheet import; ManageBac periods per
day and rotation days, bulk import, and changing periods mid-year hides past
attendance; Fedena clash choices (assign and remove, assign and retain,
cancel); Arbor clash, teacher-hours, gap and free-room/staff finders, cycles up
to two weeks. None leads with drag and drop.

## 6. Year setup and rollover

Arbor's numbered New School Year Setup (calendar, leavers, year groups and
forms, groups, registers, review) opening in May with checklists; promote the
whole year then adjust. PowerSchool next grade per student, validation before
an irreversible end-of-year process (up to 4 hours). OpenSIS "Rollover
Required" banner and per-student Next grade / Retain / Do not enrol. Blackbaud
fixed order (create and publish next year, update students, roll over or
import never both, then designate current); running twice duplicates sections.

## 7. Roles and permissions

Arbor roles with optional end dates, permission pages listing holders, "check
permissions" by URL, re-login needed; Blackbaud task domains, clone roles, any
role grants; PowerSchool page-level None / Read / Edit, highest wins; Canvas
Enable / Disable / Default plus Lock and a change log; Moodle capability report
across roles.

## 8. Settings and dashboard

Arbor homepage of notices, favourites, KPIs against benchmarks, a to-do list
(incomplete registers, pending changes), alerts, persistent filters. Google
Classroom settings are policy toggles (who creates classes, guardian access).

## 9. Pitfalls

Registers that can't be un-opened; period changes hiding attendance;
irreversible or duplicating rollovers; deleting a teacher before transferring
classes; portal accounts never removed; UI edits sticky against imports;
duplicate contacts from parent forms; no SMS-to-email fallback; parents not
notified by default.

## Resulting specification

Every record gets its own page and dialogs edit only one section; the
selected year is global and a closed year is read-only; enrolments,
allocations and timetable slots are dated and audited; attendance by
exception. Admin IA: Today, Students, Families, Staff, Classes, Attendance,
Timetable, School year, Communication, Settings. Today: task cards with counts
linking to filtered lists (registers not taken with Remind all, unexplained
absences, students without class or guardian, classes without homeroom
teacher, failed notifications), attendance today and this week, a year-setup
checklist eight weeks before year end. Students list, student record, families,
staff record, class page, attendance board, absences and reports, timetable
grid with clash handling, school years, settings and roles as described in
[../product-spec.md](../product-spec.md). Flows: add student with duplicate
check and guardian search, CSV import with mapping and preview, move student
with dated enrolment, phone-first register starting unmarked with Mark rest
present, office follow-up of absences, re-entrant rollover draft, role cloning
with a diff of sensitive permissions.
