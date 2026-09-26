# Home pages, navigation and learning content research

Official help centres and design write-ups, read on 2026-09-26; claims from
search excerpts or district guides are marked where they mattered.

## 1. Home pages

- **Teacher.** Google Classroom's home is modules: Recently due (up to 5 items
  needing review from the last 7 days), class insights (missing work, low
  grades, inactive students), class cards; empty modules collapse
  (https://support.google.com/edu/classroom/answer/17231999). To review filters
  across classes (answer/9157286). Toddle's timetable widget shows today's
  periods with one-click attendance. Canvas offers cards with a To Do sidebar.
  Classroom moved away from raw activity feeds.
- **Student.** Classroom: Due soon (5 items, 7 days); To-do Assigned / Missing /
  Done (answer/6020284). Brightspace Work To Do: overdue and upcoming. Schoology
  overdue rail. Moodle: timeline dashboard, courses on their own page. Canvas
  for Elementary: Homeroom with schedule, grades, resources and "show missing".
  Seesaw signs in young children with QR codes.
- **Parent.** Toddle Family: the child's name is the switcher, cards for
  attendance, assignments, announcements, timetable, reports, messaging,
  portfolio. Schoology switches child in the header. Brightspace picks a
  student then shows a feed. Canvas Parent: student selector, colour per
  child, bottom tabs. Seesaw opens on the child's journal. ClassDojo merges
  class and school stories. Classroom guardians get email summaries. They
  avoid averages as headlines and full assignment detail.
- **Admin.** Classroom admin shows analytics and news; Apptegy and ClassDojo
  centre admins on communication.

## 2. Navigation

Canvas fixed left rail; Moodle 4 short top bar because "guiding users to
content shouldn't be the job of one menu"; Classroom drawer of classes,
calendar, to-do and to review. Per-class secondary tabs are standard; Canvas
lets teachers hide them. Phones: 3–5 bottom tabs. Canvas added course search
late; no platform ships a command palette. Moodle's course index replaces deep
breadcrumbs. RTL: mirror navigation and back/forward, fill progress in reading
direction; clocks and refresh icons do not mirror.

## 3. Class hub

Classroom tabs Stream / Classwork / People / Grades (grades teacher-only), a
banner with class code, Upcoming, classwork condensable in the stream, topics
reorderable. Canvas lets the teacher choose the course home. Schoology uses
coloured nested folders with publish ranges and completion rules. Toddle class
tabs: unit planning, assignments, class flow, portfolio, drive.

## 4. Modules and lessons

- Authoring: Canvas completion per item (view, mark done, contribute, submit,
  score at least N), complete all or one, sequential order, module-level
  prerequisites, mastery paths; Moodle manual or automatic completion with
  access restrictions shown as locks; Brightspace Lessons with units and
  availability dates.
- Player: Moodle collapsible, independently scrolling index with completion
  circles; Canvas next/previous at the bottom of each item.
- Young learners: Seesaw up to 20 voice recordings per page, captions,
  word-by-word read aloud; Classroom practice sets with instant feedback and
  hints; Read Along stars; Khan Academy mastery levels instead of percentages.
- Teacher progress: Moodle completion matrix with overrides marked; Canvas
  module progress per student; Khan Academy responses and completion reports;
  Brightspace Class Progress.

## 5. School website CMS

Finalsite Composer: page tree, hide from navigation, drag-and-drop elements in
preset layouts, desktop and mobile preview, statuses including unpublished
changes, restore and revert, bulk publish, accessibility checker, reusable
content, page permissions, "every page must have a Heading 1". Apptegy:
templates, per-page permissions with approval, district navigation, live feed
separate from news, one post to web, app and social with translation.

## 6. Pitfalls

Too many apps (parents juggle 10–15; 85% rate the experience 5/10 or lower);
alert storms (Canvas Parent 100+ alerts, mismatched missing counts); long
module pages without collapse; announcements buried under classwork; parents
switching into child accounts; Teams channel sprawl; homepages becoming walls
of widgets.

## Resulting specification

Home is next actions, not a feed; one primary action per card; parents get
digests; one app for every role; every screen mirrors. Sitemaps per role,
home anatomy per role, the class hub, module authoring, the lesson player,
quizzes for young and older learners, teacher progress and the website CMS as
set out in [../product-spec.md](../product-spec.md).
