# One staff workspace

Administrators and teachers worked in two route areas, `/admin` and
`/teach`, chosen by profile. A principal who also teaches had no way to their
own classes, coursework, gradebook or modules, and a teacher holding an
office capability had no way to the page it opens. School platforms that keep
the two apart push schools into the same workarounds: a second account,
enrolling the administrator in classes, logging out to change role.

## The model

- **Three workspaces, one per session context**: `staff`, `family`, `me`.
  `staff_admin` and `staff` both work in `staff`; the profile still caps the
  capabilities, as before.
- **Staff pages live at the root** under a pathless `_app/_staff` layout,
  which is the context gate (`/classes`, `/modules`, `/gradebook`,
  `/students`, `/settings`). Family pages stay under `/family`, a student's
  under `/me`. Pages every context opens (calendar, news, announcements) stay
  directly under `_app`.
- **Capabilities decide what a staff member sees**, never the profile. Every
  staff page calls `requirePage` with the capabilities its API asks for, and
  its navigation item is gated by the same ones.
- **One page per job, with the viewer's own work first.** A page that has a
  personal and a school-wide side shows both as tabs, the personal tab first
  for whoever teaches:
  - Classes: My classes, All classes (`classes:manage` or `people:manage`).
  - Attendance: My registers, then the school's registers, desk, follow-up,
    absences, reported and reports (`attendance:manage`).
  - Timetable: My week, then the planner, cover and clashes
    (`timetable:manage`).
  - Today: the teaching day, then the office's cards (`staff_admin`).
- **Teaching pages are the school's teaching for whoever oversees it.** The
  API already reaches every class for `classes:manage`; the class pickers
  (gradebook, coursework, modules) list the viewer's own classes first and
  the rest of the school after them.
- **Old addresses keep working**: `/admin/*` and `/teach/*` redirect to the
  new page, search kept, so bookmarks and sent emails still land.

## Navigation

One tree, sections shown when they hold anything:

- Today
- Teaching: Classes, To review, Coursework, Gradebook, Modules, Attendance,
  Timetable, Exams, Standards, Library
- People: Students, Staff, Health changes
- Communication: Messages, Announcements, News, Calendar
- Admissions
- School: School year, Website, Media library, Settings, Billing, Privacy,
  Delivery log

The phone's bottom bar takes the first four of Today, Classes, To review,
Students that the person sees, with Messages last.

## Slices

1. Workspace `staff`, `_staff` layout, routes moved, pairs merged, page gates,
   navigation, redirects, server checks, docs and e2e addresses.
2. Class pickers for overseers: own classes first, then the school's.
3. `bun run ready` on the final state, and the access suite for each role.
