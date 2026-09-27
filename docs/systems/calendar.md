# Calendar

What the school calendar does, built from
[../research/calendar-planning.md](../research/calendar-planning.md).

## School days

Each school year has one school calendar with a row per day saying what the
day is: a school day, weekend, public or school holiday, exam day, staff day,
early dismissal, make-up day or closure, with a note in each language and an
expected flag for dates that wait on the moon or the ministry. The year
record's School days tab shows every month, marks a run of days by its first
and last day, puts days back to normal, and counts school days against the
authority's target. Registers follow the calendar: a day that stops being a
school day asks for none. Exam days, early dismissals and make-up days count
as school days.

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
- The month grid and agenda filter by kind from the legend, kept in the
  address, and a family with several children narrows the calendar to one.
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
parent-teacher conference booking, a staff week view and print, grade and
staff calendars, school-defined kinds and rooms, keeping next year's calendar
private until published, and limiting how often a calendar link is fetched.
