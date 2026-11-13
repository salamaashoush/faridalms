# Calendar

What the school calendar does, built from
[../research/calendar-planning.md](../research/calendar-planning.md).

## School days

A school's days are its own and belong to no year, whatever modules it
has. Its week (Settings) says which days are school days; it marks only the
days that differ: a holiday, closure, exam day, staff day, early dismissal
or make-up day, with a note in each language and an expected flag for
dates that wait on the moon or the ministry. The School days page
(Settings, `/school-days`) shows twelve months from a chosen month, marks a
run of days by its first and last day, and puts days back to normal.
Registers follow it: a day that stops being a school day asks for none.
Exam days, early dismissals and make-up days count as school days. Where
the school keeps years the page also names each day's term and counts each
year's school days against the authority's target, and where it runs the
timetable it shows each day's bell schedule and the day of the cycle it
runs as.

## Bell times and timetables

Periods, bell schedules and timetables are the timetable module's, by date
rather than by year. A school without the timetable takes registers by
class and day, with no periods.

- The school's periods (the timetable page's School day tab) each have
  their own times and the weekdays they run on, and may keep other times on
  some weekdays (Period 1 starts later on Thursdays). A change takes effect
  from a date, so earlier days keep what they had.
- A bell schedule gives whole days other times: a late start, an exam day,
  Ramadan hours. It names the periods held that day by code, each at its
  time; a period it leaves out is not held, and its lessons do not take
  place. The School days page runs a range of days on a schedule, or puts
  them back on their periods' own times; weekends are left as they are.
  Removing a schedule puts its days back.
- A bell schedule may add periods of its own that normal days do not have,
  such as an assembly or an exam slot, each with its code (unlike any of
  the school's own), names, kind and times. They are held only on the
  schedule's days, never the day's official register. A class
  or homeroom register can be taken in one that is a lesson or
  registration (registers stay per class: there is no year-group
  register), and the cover page gives a class a lesson in one for that day
  alone, through the same one-day change that covers a lesson: whoever it
  names takes the lesson and its register, and every week, feed and home
  page shows it. Such a lesson is removed rather than cancelled. A period
  of its own, or its schedule, is not removed while a register or one-day
  lesson holds it.
- A staff member who manages the calendar can run a single school day as
  another day of its timetable's cycle from the School days page: a
  Tuesday as a Monday (the Monday of the same week, or of week B), or a
  day as Day 3. Its lessons, registers, cover and every week follow that
  day, and in a cycle of weeks its periods and times are that weekday's.
  The days after keep their own places, except in a cycle of days whose
  closures keep the cycle where it was: there they carry on from the day
  it ran as, just as they carry on after a closure. Putting the day back
  undoes it, and both are audited. A day that stops being a school day
  keeps the choice without using it.
- A school has one or more timetables, each followed from its first day
  until the next starts; the earliest is followed on every day before it
  too. Each
  says how its lessons repeat: week by week (one week, or A/B weeks up to
  four) or over a cycle of 2 to 20 school days, where it stands on its
  first school day, and whether a closed day or week keeps the cycle where
  it was or loses its place. A new timetable starts today at the earliest,
  with the lessons of the one before it (repeated into a longer cycle of
  weeks) or with none. One already followed that places lessons keeps its
  cycle and first day; to change them, add a timetable from a date. Only
  one not yet followed can be removed, with its lessons. They are managed
  from the timetable page's Timetables tab.
- One place, `packages/database/src/stores/day-plan.ts`, decides for each
  date which timetable it follows, the day of its cycle (or the one it runs
  as), its bell schedule and the periods it holds at that day's times,
  with its schedule's own. Registers, the cover board, every week (staff,
  student, family, class, room), print, the home page and calendar feeds
  read their days from it. A week names each day's day of the cycle or
  week (A, B), the day it runs as, its bell schedule, and gives a lesson
  its own times on a day that keeps other ones.

## Events

- An event has an English and an Arabic title (at least one), a kind with its
  own icon and colour, dates with optional wall-clock times, a place, a
  description document and audiences shared with announcements.
- A new event is a draft, seen only by its author and those who manage the
  calendar. Publishing tells its audience unless the author chooses quiet. A
  published change tells them when the author asks, pre-ticked when the day,
  time, place or audience moved. Cancelling always tells them. A published
  event still to come is cancelled before it can be deleted.
- Teachers hold `calendar:author` and add events for classes they teach, and
  change only their own. The school, staff, families and whole grades stay
  with `calendar:manage`, which also decides whether an event is public.
- The month grid, the week grid and the agenda filter by kind from the
  legend, kept in the address, and a family with several children narrows the
  calendar to one. A date can be jumped to; the week grid shows its week and
  the agenda starts from it. Phones read the week as a list.
- Whoever may write events adds one from a day's add link, which opens the
  editor on that day. An event they may change moves to another day by
  dragging it, and its last day moves by dragging its end; from the keyboard,
  Alt and an arrow key move it a day or a week, and with Shift they move its
  last day. Each move saves through the same save as the editor, with the
  version it read, and a published event asks first whether to tell its
  audience, pre-ticked. Opening the event and editing its dates is the
  single-pointer way to do the same.
- An event opens in a side panel over the calendar, its address carrying the
  event so it can be shared; links from feeds, notices and search open the
  same panel over the event's month.
- Events are written as documents: the title and description take the page,
  and when, where, kind, audience, website and telling sit in the details
  panel. Drafts save themselves once they have a title and possible times;
  edits to a published event wait for Update.

## Beyond the app

- A public published event appears in the website's events section, in the
  visitor's language, read by the site role through its own policy.
- Each person can make a private calendar link. The secret is shown once and
  kept only as a hash; a new link retires the old one at once. Each fetch is
  worked out from the owner's reach at that moment, 30 days back to a year
  ahead, closed days as free time, cancelled events titled as such.
- A school may show Hijri dates, Umm al-Qura or tabular, beside Gregorian
  ones on the calendar.

## Next

Recurring events that skip closed days, RSVP with headcounts and reminders,
parent-teacher conference booking, print, grade and
staff calendars, school-defined kinds and rooms, keeping next year's calendar
private until published, and limiting how often a calendar link is fetched.
