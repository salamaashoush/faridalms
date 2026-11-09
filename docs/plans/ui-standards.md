# UI standards: filters and page layouts

An audit of every control that filters or scopes a page, and of every
page's structure, in the portal (`apps/web`) and the console (`apps/ops`),
taken at `ba86e23f`; the line numbers are that commit's. The standards it
led to are in `docs/design-system.md` (Page types, Page anatomy, and
Filters, scope, search and views). The last section lists what changed and
what is left.

## Filters, scopes, search and views

`IndexToolbar` facets were outline 32px buttons that turned dashed
whenever they showed no value (`index-toolbar.tsx:257`), so the look
followed the label rather than the state: a scope whose value matched no
option looked unapplied, a filter with an "Any" option never did, and
focus drew `border-ring` plus a 3px ring around the dashed edge.

### Portal

| Page                    | Where                                                                                                                     | Control                                                        | Job                               | Look before                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| Templates               | `routes/_app/templates.tsx:230`, `:242`                                                                                   | single facets Kind, Subject, no default                        | filter                            | dashed when unset, no Clear                    |
| Templates               | `templates.tsx:253`; `:287`                                                                                               | toolbar search; RecordTabs Shared/To review                    | search; queues                    | 32px; tab strip                                |
| Media                   | `components/media/MediaBrowser.tsx:540-574`                                                                               | search, facets Type, Added in, Uploaded by                     | search, filters                   | 32px, dashed when unset                        |
| Media                   | `MediaBrowser.tsx:625`                                                                                                    | `aria-pressed` rounded chips (tags)                            | fourth filter                     | 28px chips in their own row                    |
| Media                   | `MediaBrowser.tsx:598`, `:794`                                                                                            | Segmented grid/list; Segmented source                          | view                              | 40px beside 32px controls                      |
| Admission reports       | `routes/_app/admissions/reports.tsx:134`                                                                                  | single facet School year, default `yearId ?? ""`               | scope                             | dashed when the year matched no option         |
| Applications            | `admissions/applications/index.tsx:222-241`                                                                               | search, year facet, Grade with "Any grade"                     | search, scope, filter             | Grade always solid                             |
| Enquiries               | `admissions/enquiries/index.tsx:214-261`                                                                                  | search, Source/Purpose/Assignee with "Any…"                    | filters                           | always solid                                   |
| Intakes                 | `admissions/intakes/index.tsx:303`                                                                                        | year facet                                                     | scope                             | solid                                          |
| Students                | `_staff/students.tsx:287-362`                                                                                             | year scope, Grade, Needs attention, search                     | scope, filters, search            | year folded into the phone sheet               |
| Staff, classes          | `_staff/staff.tsx:235`, `components/classes/ClassDirectory.tsx:173-224`                                                   | facets and search                                              | scope, filters                    | 32px                                           |
| Assignments, modules    | `_staff/assignments.tsx:178`, `_staff/modules.tsx:155`                                                                    | single Class facet, no default                                 | filter                            | dashed when unset                              |
| Notification log        | `_staff/notification-audit.tsx:166`, `:184`                                                                               | State, Channel with "All"                                      | filters                           | always solid                                   |
| Medical updates         | `routes/_app/health-changes.tsx:385`                                                                                      | Show (Open/All), default open                                  | scope                             | solid                                          |
| Gradebook               | `_staff/gradebook.tsx:451`, `:462`                                                                                        | Class (default), Term (no default)                             | scope, filter                     | 32px                                           |
| Year map, module, map   | `_staff/year-map.tsx:72`, `learning/ModuleRecord.tsx:856`, `standards/map.tsx:84`                                         | single facets                                                  | scope                             | 32px                                           |
| Timetable               | `_staff/timetable.tsx:350-405`                                                                                            | SelectField Class/Teacher/Room; labelled date                  | scope, period                     | 36px, labels stacked above                     |
| Timetable, Classes view | `components/timetable/Planner.tsx:365`                                                                                    | SelectField Timetable                                          | scope                             | 36px, label above                              |
| Register                | `components/attendance/Register.tsx:752-760`                                                                              | DayNav and SelectField Period (label hidden)                   | period, scope                     | 36px                                           |
| Attendance tabs         | `MyRegisters.tsx:194`, `Board.tsx:189`, `FrontDesk.tsx:122`, `FollowUp.tsx:293`                                           | DayNav beside a bare h2 or alone                               | period                            | 36px, placed differently on each tab           |
| Absences                | `components/attendance/Absences.tsx:231`, `:250`                                                                          | From and To dates                                              | period                            | 36px, labels stacked above                     |
| Attendance reports      | `Report.tsx:183`, `:198`; `ReportInbox.tsx:160`; `Absences.tsx:197`                                                       | single facets Term, Group by, Show                             | scope, view                       | 32px                                           |
| Calendar                | `routes/_app/calendar.index.tsx:230-342`                                                                                  | Tabs Month/Week/Agenda, rounded child chips, dashed kind chips | view, child filter, kinds         | 36px tabs, 36px chips, dashed meaning "hidden" |
| Family home             | `routes/_app/family/index.tsx:424`                                                                                        | rounded Link chips with "All children"                         | child filter                      | 36px chips                                     |
| Family pages            | `family/{attendance,grades,modules,assignments,timetable}.tsx`                                                            | single facet Child, default first child                        | scope                             | 32px                                           |
| Messages                | `components/messages/Inbox.tsx:453-488`                                                                                   | own search input, SelectTrigger Mailbox, Tabs All/Unread       | search, scope, view               | 36px input, 32px select, 36px tabs in one row  |
| Goals                   | `components/standards/Goals.tsx:753`, `:195`                                                                              | SelectField Framework; goal picker with steppers               | scope inside a judging tool       | 36px, labels above                             |
| Week grids              | `components/timetable/WeekGrid.tsx:499`                                                                                   | WeekStep                                                       | period                            | 36px, in component state                       |
| Pickers in sheets       | `QuestionBank.tsx:401-435`, `SharedBlocks.tsx:420`, `UseAgain.tsx:104`, `ModuleGlossary.tsx:87`, `studio/Gallery.tsx:158` | own search inputs and pressed chips                            | search and filter inside a dialog | 36px, chips of three kinds                     |

### Console

Every console list already used `IndexToolbar` or a table's toolbar.

| Page                                        | Where                                                                                                       | Control                                                          | Job             | Look before                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------- | ----------------------------------- |
| Billing                                     | `routes/billing.tsx:366`, `:381`, `:434`                                                                    | Status, Tax id facets, search                                    | filters, search | 32px                                |
| Changes                                     | `routes/changes.tsx:103-146`                                                                                | Change, By facets; When with default "all"                       | filters, period | When always solid at "Any time"     |
| Customers                                   | `routes/customers.index.tsx:191`, `:217`, `:266`                                                            | Looked after by; Money single, no default                        | filters         | Money could only be undone by Reset |
| Schools                                     | `routes/schools.index.tsx:213`, `:231`, `:270`                                                              | Health, Access, search                                           | filters         | 32px                                |
| Subscriptions, catalogue, series, operators | `subscriptions.index.tsx:213`, `catalogue.index.tsx:269-313`, `series.tsx:352-376`, `operators.tsx:374-447` | facets and search                                                | filters         | 32px                                |
| Leads                                       | `routes/leads.index.tsx:405-505`                                                                            | facets, search, Segmented Board/List                             | filters, view   | Segmented 40px beside 32px controls |
| Invoice                                     | `routes/invoices.$invoiceId.tsx:680`                                                                        | Segmented language in DocumentView                               | view            | 40px beside a 32px Print            |
| Quote                                       | `routes/quotes.$quoteId.tsx:182-200`                                                                        | hand-built `nav` of links copying Segmented                      | view            | 40px, no DocumentView               |
| Record tabs                                 | `customers.$customerId.tsx:343`, `:893`; `schools.$schoolId.tsx:948`                                        | Tasks Show (default), Invoices Status, Modules Show (no default) | scope, filter   | 32px                                |

## Page layouts

Every console route used `Page` and no portal route did. Portal widths
came from wherever each page wrote one.

- none (the window's width): every index, report and settings-hub page;
- `mx-auto max-w-6xl` (1152px): `ClassRecord.tsx:548`, `StudentRecord.tsx:933`, `PersonRecord.tsx:403`, `PersonProfile.tsx:59`, `YearRecord.tsx:164`, `ModuleRecord.tsx:995`, `StudentModules.tsx:214`, `PacedLesson.tsx:231`, `standards/$frameworkId.tsx:57`;
- `max-w-3xl` (768px): `notifications.tsx:63`, `Register.tsx:726`, `Rollover.tsx:118`, `ClassBadges.tsx:99`, `LessonPlayer.tsx:1109`, `:1570`, `Practice.tsx:98`, `:151`, `lessons.$lessonId.tsx:120`;
- `max-w-[720px]`, centred: `BroadcastRecord.tsx:368`, `AssignmentRecord.tsx:780`, `LearnerWork.tsx:548`, `Grading.tsx:890`;
- `SettingsPage` at 720px but start-aligned (`settings-section.tsx:54`) under a full-width header and tabs, so the settings area's School tab was 720px and its Subjects and Roles tabs full width;
- `RecordForm` at 680px (`record-form.tsx:369`).

Pages that built their own structure instead of the page patterns:

| Page                          | Where                                                   | What was hand-built                                                              |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Billing (portal)              | `_staff/billing.tsx:57-204`                             | no Page; invoice cards as a bordered list; bank details and contacts as bare h2s |
| Attendance, Follow up         | `components/attendance/FollowUp.tsx:301-365`            | three bare sections of h2 and paragraph                                          |
| Timetable, Cover              | `components/timetable/Cover.tsx:322-377`                | two bare sections with their buttons in the heading row                          |
| Attendance, Registers tabs    | `Board.tsx:185`, `MyRegisters.tsx:190`                  | a bare h2 date beside the day stepper                                            |
| Grades (student and family)   | `standards/Progress.tsx:640`, `standards/Goals.tsx:941` | bare 18px h2 sections around cards                                               |
| Lesson                        | `learning/LessonPlayer.tsx:1200`                        | a bare 18px h2 review section                                                    |
| Quote (console)               | `routes/quotes.$quoteId.tsx:182-211`                    | language links and a paper frame instead of `DocumentView`                       |
| Provisioning result (console) | `routes/provisioning.$draftId.tsx:1083`                 | no Page, so full width                                                           |

Pages that use the patterns but break a record rule, left for a record
redesign: `RecordColumns` inside `RecordTabs` in `ClassRecord.tsx:486`,
`StudentRecord.tsx:733-921`, `PersonRecord.tsx:325-391`,
`YearRecord.tsx:206`, `ModuleRecord.tsx:1118`; the console's quote page
on `RecordColumns` with an aside (`quotes.$quoteId.tsx:168`).

## What changed

- **Facets** draw by state: dashed only for a filter with nothing chosen,
  solid for a set filter and for any scope; solid on hover, focus and open,
  so the focus ring never circles a dashed edge. A filter with no default
  offers Clear filter. Scopes stay in the row on a phone; filters fold into
  the sheet.
- **"Any" options removed**: enquiries' Source, Purpose and Assignee, the
  notification log's State and Channel, applications' Grade and the
  console's When are filters with nothing chosen. The URL values are
  unchanged.
- **Selects, chips and tabs that filtered**: the timetable's Class, Teacher
  and Room, the Classes view's Timetable, the register's Period and the
  mailbox are scope facets; the family home's and the calendar's child chips
  are a Child filter; the calendar's Month, Week and Agenda and the inbox's
  All and Unread are a Segmented at the row's end.
- **Periods** (`DayNav`, the timetable's date, Absences' From and To) sit in
  the toolbar's `period` slot at 32px, after the filters, named by
  `aria-label`; a table keeps its toolbar for a period when it is empty.
- **Segmented** is 32px inside a toolbar or a document's tool row.
- **Widths**: every portal page sets one through `Page`; the settings area is
  720px throughout; document readers are 720px, list width when widened.
- **Billing** is a table of invoices in a titled section, with Pay by card
  as a row link, then titled sections for bank details and contacts.
- **Bare sections** in Follow up, Cover, grades and the lesson review are
  `RecordSection variant="page"`; the quote reads in `DocumentView`.
- **Guard**: `scripts/check-sources.ts` refuses a page header without
  `Page` and a hand-capped page width around a header.

## Left

- The Media page's tag chips are a fourth filter outside the toolbar's
  three facets; they need a "more filters" design.
- The calendar's kind toggles stay as a legend of pressed chips (now
  without the dashed edge); the week grids' `WeekStep`, the calendar's own
  stepper and `DayNav` are three steppers that could become one design
  system component.
- Goals' framework and goal pickers are labelled fields inside a judging
  tool, owned by the data-entry editors' redesign.
- Search inside sheets and dialogs (question bank, shared blocks, glossary,
  the studio's gallery) uses its own inputs and chips.
- The record rule above (`RecordColumns` inside tabs), the console's quote
  page, and the console's lists without pagination or sorting.
- Empty states (Billing's included) belong to the empty-state work.
