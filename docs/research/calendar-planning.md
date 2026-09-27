# Calendar and event planning research

Researched 2026-09-27. Sources are vendor help centres, standards and official calendars, cited
inline. "(search excerpt)" means only a search snippet was seen; "(third-party)" means
a non-vendor source; "(measured)" means run locally (Node 26.9, ICU 78.3, CLDR 48). Gaps: no primary
source for the Teams channel calendar, Konstella, Tadpoles, SchoolMessenger, Rediker, Toddle
conferences or Veracross conferences (sign-in walls); Google publishes no subscription refresh
interval.

## 1. What exists today

### Two models: school days and events

- **School days** are an enumerative calendar, not events. `core.calendars` (kind `school`,
  `grade_level` or `staff`; one active `school` calendar per year) and `core.calendar_dates`, one active
  row per date with a `calendar_event` descriptor and a 200-character note in each language
  (`packages/database/src/tables/calendar.ts`). Codes: `instructional_day`, `exam_day`,
  `early_dismissal`, `make_up_day`, `weekend`, `public_holiday`, `school_holiday`, `teacher_only_day`,
  `weather_closure`, `emergency_closure`, `other` (`packages/domain/src/descriptors/catalogue.ts`).
  Attendance asks `isSchoolDay` of these rows (`stores/attendance.ts`); the year record counts weeks,
  school days and closed days (`stores/years.ts calendarSummary`). `calendar_grade_levels` exists, but
  every reader joins only `kind = 'school'`.
- **Events** are `core.calendar_events` (`packages/database/src/tables/events.ts`). Columns: `title`
  (one text, 1-200 chars, not per language), `category` (`general`, `meeting`, `trip`, `performance`, `sport`,
  `exam`, `celebration`), `starts_on`/`ends_on` (inclusive dates), `start_time`/`end_time` wall-clock
  times (both null for all day; a timed multi-day event runs from the first day's start to the last
  day's end), `location` (free text, not linked to `core.locations`), `provisional` ("to be
  confirmed"), `cancelled`, `author_user_id`, plus version and status. The description is a rich
  content document hosted as `calendar_event`, so it already carries files and images.
- `calendar_event_audiences`: 1-20 rows per event, scope `school`, `staff`, `families`, `students`,
  `class` (with `class_id`) or `grade` (with a grade descriptor), shared with announcements and
  newsletters through `stores/audiences.ts`.

### Year and terms

- `academic_sessions` holds the year (upcoming, current, closed), semesters, terms and grading periods
  as `daterange`s; the year editor edits names, dates and up to 12 non-overlapping terms
  (`packages/domain/src/years.ts saveYearSchema`). The school profile holds `timeZone`, `week_start`
  (default Sunday) and `weekend_days` (default Friday and Saturday).
- Creating a year fills `calendar_dates` with `instructional_day` or `weekend`; the comment says
  "Holidays are set on the calendar afterwards" (`stores/years.ts fillCalendar`), but **no endpoint or
  screen sets holidays, exam days, staff days or closures**. Only the seed writes them.

### Visibility and permissions

- `calendar:manage` (principal, site, district and system administrators) creates, edits, cancels,
  restores and deletes, and sees every event. Teachers, aides and everyone else hold only
  `calendar:read` (`packages/domain/src/capabilities.ts`): **a teacher cannot put a class trip or a
  test on the calendar**.
- Readers see an event when one of its audiences names them on today's date (`reachOf`): staff by an
  active staff role, students by enrolment, guardians through `portal_access` links that are not
  `communication_isolated`, classes through enrolment, the homeroom a subject class is taught to, or
  teaching, grades through homerooms. Anything else is a 404. Audiences are shown to managers only.
- Writes use `expectedVersion` and write audit rows (`calendar_event.create|update|cancel|restore|
delete`); delete is soft (`status = 'tobedeleted'`).

### Screens

- `/calendar` (`routes/_app/calendar.index.tsx`): Month and Agenda tabs, `aria-live` month heading,
  Today link. Admin and teacher workspaces default to Month, families and students to Agenda; below
  768px Month renders the agenda. One read covers at most 120 days and 1,000 events.
- Month grid (`components/calendar/views.tsx`): a `<table>` with caption and `scope=col` headers in the
  school's week order, mirrored in Arabic; weekend and special days shaded with their note; today
  `aria-current="date"`; up to 3 chips per cell (time, title, one primary-colour dot for every
  category), "+N more" to the agenda day; cancelled struck through. Agenda lists days with something on
  them, with time or "All day", Cancelled and Provisional badges, category text, location.
- Event page (`calendar.$eventId.tsx`): When, Where, Category, For (managers), description, "Added by",
  Edit, Cancel or Restore, Delete, and **Add to calendar**: a client-side single-event `.ics` (`eventIcs`
  in `packages/domain/src/calendar.ts`: UTC instants from the wall clock, all day as `VALUE=DATE` with
  exclusive end, `SEQUENCE` = version, `STATUS`, 75-octet folding, `UID <id>@farida-lms`).
- Editor (`/admin/event-editor`): title, category, location, dates, All day, times, Provisional,
  audiences, description. Home shows up to 5 (families, students) or 6 (admin) events in the next 7
  days (`apps/api/src/systems/home.ts`); events are searchable.

### Deferred or missing

- The `event` notification kind is in `NOTIFICATION_KINDS`, the preference matrix, the icon map and the
  notice link, but **nothing calls `notify` for events**: creating, moving or cancelling one tells
  nobody. Announcements, by contrast, have `draft | scheduled | published | archived`, a recipient
  ledger and an explicit "send update" (`apps/api/src/systems/announcements.ts publish`).
- No iCal subscription feed, RSVP, sign-up slots, reminders, recurrence, draft state, legend or
  filters, week or year view, print, Hijri dates, room or timetable link, though `docs/product-spec.md`
  (Calendar) promises week grids, legend, filters, RSVP or slots, reminders, notify or silent, and an
  iCal link per person and child.
- The website `events` section (`packages/domain/src/site-sections.ts`) is category `dynamic` but holds
  up to 12 hand-typed items (date, title, location, link), variants `list` and `cards`. The `news`
  section reads published `site_posts` by count and category; `events` never reads `calendar_events`.
  Site posts are bilingual (`title_en`, `title_ar`); events are not.

## 2. What school products do

### SIS and MIS calendars

- **Calendars are filtered views, not buckets.** Veracross builds each persona's calendar from
  visibility flags (Public, Parents, Students, Staff/Faculty, Alumni, Group Members; the first four on
  by default) plus school level, grade, campus and group membership
  (https://community.veracross.com/s/article/Calendars-Overview,
  https://community.veracross.com/s/article/Group-Event-Management-Overview). Blackbaud combines
  role-gated categories into calendars; a viewer who cannot see a category misses its events
  (https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/bb-core-calendar-use.html).
  Our audience rows already work this way.
- **No event approval.** Veracross: "No, there is no approval or publishing process. Visibility can be
  used to hide events" (Group-Event-Management-Overview above). Blackbaud documents none; its event
  managers and group leaders simply edit
  (https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/bb-core-calendar-faculty-group-events.html).
  Finalsite's queue is only for website visitors suggesting events, and any calendar admin can publish
  them (https://www.finalsitesupport.com/hc/en-us/articles/360040180151-Allow-site-users-to-request-events).
  Formal approval attaches to rooms: Veracross per-resource "Reservation Approval" with a Responsible
  Person (https://community.veracross.com/s/article/Resource-Reservations), Arbiter multi-stage chains
  (https://arbitersportshelp.zendesk.com/hc/en-us/articles/40069556368525-Facilities-Scheduler-FAQ).
- **A day-off calendar that repeats skip is standard.** Finalsite Exception calendars with "Avoid Dates
  on" (https://www.finalsitesupport.com/hc/en-us/articles/27446704933517-Set-up-an-exception-calendar-in-New-Calendars-module),
  Arbor "Term time only" and "Day of timetable cycle" repeats
  (https://support.arbor-education.com/hc/en-us/articles/360020312494-Creating-and-managing-events),
  PowerSchool's in-session flag per date (https://ps.powerschool-docs.com/pssis-admin/latest/calendar).
  Finalsite's trap: a closure added later does not move events already scheduled; each must be
  re-saved (https://www.finalsitesupport.com/hc/en-us/articles/115000437112-Set-up-an-exception-calendar).
- **Day types carry behaviour.** Veracross Holiday and No School create no attendance; an event's
  "Leave Class" flag creates early-dismissal attendance
  (https://community.veracross.com/s/article/Managing-Event-Types-for-Group-Events). Arbor holiday
  types (Half terms, Vacation, Public, Religious, Elections, Inset, Staff training, Exceptional) override
  term dates so no registers open
  (https://support.arbor-education.com/hc/en-us/articles/360021224713-Amending-the-Academic-Calendar);
  PowerSchool bulk-sets date ranges (https://ps.powerschool-docs.com/pssis-admin/latest/automated-calendar-setup).
- **Next year stays hidden until ready.** Arbor's "Show Next Academic Year Calendar" is off by default
  and hides next year from parent and student portals
  (https://support.arbor-education.com/hc/en-us/articles/18772044549661-Prevent-users-from-seeing-next-years-calendars-Parent-Portal).
  Veracross "Copy YY-YY Calendar Events" carries No School and Holiday events forward, safe to rerun
  (https://community.veracross.com/s/article/Entry-and-Copying-Options-for-Group-Events).
- **Personal iCal feeds follow the same visibility, over a bounded window.** Veracross 4 weeks back to
  52 ahead; it measured Apple refreshing about every 5 minutes and Google "5+ hours"
  (https://community.veracross.com/s/article/Personal-iCal-Feeds). Blackbaud 2 months back to 12
  ahead, cached up to an hour
  (https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/bb-core-calendar.html).
  Finalsite default 0 back and 3 ahead, maximum 12 back and 18 ahead
  (https://www.finalsitesupport.com/hc/en-us/articles/115000852328-Setting-iCal-feed-ranges). Arbor
  exports staff calendars only (https://support.arbor-education.com/hc/en-us/articles/203878231-My-Calendar-calendar-colours-and-calendar-syncing).
- **Colour is per type or calendar, set by admins.** Veracross per event type, Blackbaud per calendar,
  Finalsite per calendar label; Arbor's colours are fixed; none lets users recolour (sources above).
- **Status and series.** Finalsite shows "Changed", "Postponed" or "Cancelled" publicly
  (https://www.finalsitesupport.com/hc/en-us/articles/115000857248-Calendar-element); Localist has
  live, canceled, postponed, soldout (https://developer.localist.com/doc/api). Veracross series have a
  master and occurrences, editing one makes an exception; Arbor asks "Cancel entire series?".
- **Capacity and draft belong to registration.** Veracross forms go Draft, Published - Open, Published
  - Closed (https://community.veracross.com/s/article/Form-Configuration-for-Online-Event-Registration);
    Finalsite puts attendee caps and cancellation notices in Forms
    (https://www.finalsitesupport.com/hc/en-us/articles/6363139936653-CMS-and-EMS-event-management-A-guided-approach-for-schools-using-both-Finalsite-products);
    Arbor trips have Max participants, "Consent required?", a sign-up window and Eligible, Reserved,
    Confirmed (https://support.arbor-education.com/hc/en-us/articles/30880769594141-Setting-up-Trips-2-Creating-a-Trip).
- **Rooms.** Veracross and Arbor warn on double booking rather than block (a shared field)
  (https://support.arbor-education.com/hc/en-us/articles/360018821857-Book-a-room); Arbiter and Trumba
  block (https://www.trumba.com/help/event_resourcefinder_live); Finalsite leaves facilities to others.
- **Timetable.** Arbor suspends lessons for trips, exams and study leave: suspended lessons leave
  student and staff timetables, staff become available for cover and rooms free up; only future
  lessons (https://support.arbor-education.com/hc/en-us/articles/4710984669341-Suspending-classes-and-lessons).
  Trips do not create planned absences automatically; staff record the trip code by hand
  (https://support.arbor-education.com/hc/en-us/articles/203861671-Adding-and-viewing-Planned-Absences-and-future-pre-fill-marks).
- **Print** is weak: Finalsite's "basic PDF" "is not customizable"; Blackbaud prints the visible range.
- **Hijri naming.** PowerSchool suggests "2023-2024 (1444-1445)" for years and terms
  (https://ps.powerschool-docs.com/pssis-admin/latest/years-and-terms); Classera users switch dates
  between Gregorian and Hijri (search excerpt, https://manual.classera.com/docs/events/).

### Parent communication apps

- **Edits are silent unless the author chooses.** ParentSquare: "Editing a post does not send a
  notification"; Send Update notifies and timestamps it
  (https://parentsquare1736363850.zendesk.com/hc/en-us/articles/43599257285517-Post-Add-Ons-and-Best-Practices).
  SignUpGenius offers an opt-in email on date change
  (https://support.signupgenius.com/hc/en-us/articles/29465702230295-Change-Date-on-a-Sign-Up-Page).
  Bloomz notifies everyone on save (https://support.bloomz.net/articles/create-an-event). ClassTag's
  create does not broadcast; its docs advise "Announce"
  (https://help.connect.schoolstatus.com/hc/en-us/articles/28513600219156-Creating-an-Event).
- **Cancellation is the weak spot.** ClassTag and Bloomz delete silently
  (https://help.connect.schoolstatus.com/hc/en-us/articles/24340016308244-Deleting-or-Removing-activities-events,
  https://support.bloomz.net/articles/recall-a-post-you-sent); Arbor does not tell guardians when a
  consultation is cancelled (https://support.arbor-education.com/hc/en-us/articles/22114932653981-Guardian-Consultations-parents-evening-FAQ).
  Brightwheel notifies on cancellation
  (https://help.mybrightwheel.com/en/articles/11175244-create-sign-up-sheets-for-events-tours-parent-teacher-conferences-more);
  ParentSquare Smart Alerts carry day-of cancellations by text with voice fallback
  (https://parentsquare1736363850.zendesk.com/hc/en-us/articles/41895041579277-Send-a-Smart-Alert).
- **RSVP is a headcount, not capacity.** ParentSquare attending, not attending, maybe
  (https://parentsquare1736363850.zendesk.com/hc/en-us/articles/39029089241229-View-Account-Activity)
  with adult and kid counts (search excerpt, https://www.parentsquare.com/school-services/calendar-rsvp/);
  Bloomz Going or Not going, changeable until start, frozen at the cutoff
  (https://support.bloomz.net/articles/rsvp-to-an-event); SignUpGenius Yes, No, Maybe plus guests, and
  "The number of guests cannot be limited"
  (https://support.signupgenius.com/hc/en-us/articles/29465357730199-Create-an-RSVP-Sign-Up). No product
  documents an RSVP cap; caps and waitlists live on slots.
- **Conference booking is a slot generator.** ParentSquare: dates, earliest start and latest end,
  Recess, Appointment Duration, Break between Appointments, Hide Parent Names, one appointment per
  user, require student (https://tellurideschooldistrict.zohodesk.com/portal/en/kb/articles/create-an-appointment-sign-up-in-parentsquare).
  Bloomz: day start and end, lunch break, slot length, break, max signups per slot, private signups;
  changing rules after bookings "regenerates the slot list - and can drop bookings"; parents flag "Do
  you need an interpreter?" (https://support.bloomz.net/articles/publish-conference-slots-for-families-to-book,
  https://support.bloomz.net/articles/book-a-parent-teacher-conference). SchoolCloud: standard length
  locked once anyone books, "Travel Time for Parents", "Maximum appointments per student per parent",
  open and close timestamps, in-person, video or hybrid sessions, automatic scheduling of a parent's
  teachers, waiting list, translator flag, separated parents book separately
  (https://support.parentseveningsystem.co.uk/article/1023-setting-up-a-new-parents-evening,
  https://support.parentseveningsystem.co.uk/article/392-how-to-set-up-automatic-appointment-scheduling,
  https://support.parentseveningsystem.co.uk/article/580-how-to-deal-with-separated-or-divorced-parents).
  Arbor slots repeat at the meeting length from each availability start; breaks are gaps; a slot is
  unbookable if the teacher has another event; overlapping lessons raise "Cover required"
  (https://support.arbor-education.com/hc/en-us/articles/29366524587549-Availability-and-Breaks-Setting-up-Parents-Evenings-Guardian-Consultations).
  Canvas appointment groups: slots with `participants_per_appointment`, min and max per participant,
  visibility private or protected, and "Once published, an appointment group cannot be unpublished"
  (https://canvas.instructure.com/doc/api/appointment_groups.html).
- **Family rules differ.** One slot per user (ParentSquare), per family (Bloomz, though co-parents
  booking take two), per child (ClassTag,
  https://help.connect.schoolstatus.com/hc/en-us/articles/53705793805588-Managing-your-Parent-Teacher-Conferences),
  per student per parent (SchoolCloud). ParentSquare tells secondary parents to "keep notes ... to
  prevent overlapping meetings", so it has no cross-teacher clash check
  (https://resources.finalsite.net/images/v1696874445/brentwoodk12nyus/vw46nvtw4wchcsno98yi/ParentGuidetoAppointmentSign-UpProcessinParentSquare.pdf).
- **Reminders** default to the day before or 24 hours (ParentSquare conferences, search excerpt,
  https://www.parentsquare.com/blog/2017-2-23-taking-the-hassle-out-of-parent-teacher-conferences-go-digital/;
  Brightwheel, https://help.mybrightwheel.com/en/articles/12430509-coordinate-parent-teacher-conferences),
  1 hour before video blocks (SchoolCloud). ClassDojo and Bloomz organisers pick offsets
  (https://help.classdojo.com/hc/en-us/articles/360039506771-How-to-Create-a-Classroom-Event); for
  bookings the participant chooses (Bloomz, SignUpGenius).
- **Feeds are one-way.** Best pattern: one secret per-user `.ics` merging every calendar the user can
  see, with a reset. Bloomz: "readable without sign-in, including private-group events"; "Reset Link"
  kills it at once and every device must resubscribe
  (https://support.bloomz.net/articles/subscribe-to-your-bloomz-calendar). ParentSquare one feed per
  parent across groups, classes and grades (search excerpt,
  https://support.iusd.org/hc/en-us/articles/4882093086739-ParentSquare-for-Parents-Subscribe-to-ParentSquare-Calendar).
  Brightwheel lets guardians choose event types; changes "can take up to 24 hours"
  (https://help.mybrightwheel.com/en/articles/13911199-add-brightwheel-calendar-events-to-your-personal-calendar).
  ClassDojo family sync is paid Plus (https://help.classdojo.com/hc/en-us/articles/360018137732-ClassDojo-Plus-FAQ).
- **Families read lists; per-child filtering comes from membership.** ClassDojo pins the next event
  atop the feed; Bloomz picks a class to narrow to one child
  (https://support.bloomz.net/articles/find-your-way-around-the-calendar). ParentSquare and Bloomz
  translate per parent; ClassDojo does not translate events
  (https://help.classdojo.com/hc/en-us/articles/37573538259085-Translate-Messages-and-Story-Posts).

### Publishing tools, shared calendars and rooms

- **Visibility is per event and per surface.** Localist: Public, Unlisted, Restricted to logged-in
  users, widgets, place pages or channels; the ICS and RSS export carries Public only
  (https://help.concept3d.com/hc/en-us/articles/11943071139091-Visibility). Finalsite: one "Make
  available to public" checkbox controls app visibility, visitor subscription and newsletter inclusion
  (https://www.finalsitesupport.com/hc/en-us/articles/31239398416013-Manage-calendars-and-events-in-New-Calendars-module).
  CalendarWiz categories are Public, Private or Selected Private, and "Disable Filtering" keeps a
  category such as holidays visible under any filter
  (https://calendarwiz.freshdesk.com/support/solutions/articles/60000709427-adding-and-editing-categories---public-and-private).
- **A category is both a filter and a feed.** Localist "Subscribe to Displayed Results"; feeds cover
  12 months or 1,000 events; CATEGORIES maps to event types
  (https://help.concept3d.com/hc/en-us/articles/13510933654547-Exporting-Feeds-From-Localist). Trumba
  filtered feeds are URLs with `filterview=`, at most 3 filter views per publication
  (https://www.trumba.com/help/filter/pub_filterviews).
- **Website embeds.** Finalsite Calendar element: List, Grid, Slideshow, Event; public events only;
  "Week starts on", legend; details in a popup or page
  (https://www.finalsitesupport.com/hc/en-us/articles/115000857248-Calendar-element). Localist widget:
  up to 50 results, 365 days ahead, filters, "Show Only Featured", List or Mini Cal + List
  (https://help.concept3d.com/hc/en-us/articles/11942564300819-Widgets). Trumba spuds "immediately show
  updates", while Localist's inbound feed imports run "once a day overnight"
  (https://www.trumba.com/help/publish/puboverview,
  https://help.concept3d.com/hc/en-us/articles/11938562146579-Importing-Feeds-to-Localist): the site
  should render from our data, not a feed. Google's embed needs at least 500px
  (https://support.google.com/calendar/answer/41207?hl=en).
- **Submission queues** exist for community submissions: Localist's Pending Queue is scoped by
  category or department, trusted users skip it, stale pending items auto-reject within 24 hours
  (https://help.concept3d.com/hc/en-us/articles/11943460106259-Pending-Queue). Trumba never tells
  submitters their event is live (https://www.trumba.com/help/submitevent/submitformcalset).
- **Interest.** Localist "I'm Interested" adds to My Plans and sends a reminder the day before
  (https://help.concept3d.com/hc/en-us/articles/11940224995475-I-m-Interested).
- **Google Classroom.** Each class shares a calendar; teachers "can add events, such as field trips or
  exam dates" to it (https://support.google.com/edu/classroom/answer/7184151?hl=en).
- **Moodle and Canvas** (LMS precedent). Moodle event types user, group, course (course capability),
  site (system capability); export builds a URL with `authtoken`
  (https://docs.moodle.org/405/en/Using_Calendar). Canvas materialises each occurrence as its own row
  with `series_uuid`, edits with `which=one|all|following`, `duplicate` up to 200, and a `blackout_date`
  flag (https://canvas.instructure.com/doc/api/calendar_events.html).
- **Rooms.** Exchange auto-accepts when free, booking window 180 days, maximum 1,440 minutes, and by
  default any conflicting occurrence declines a whole new series
  (https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-calendarprocessing?view=exchange-ps).
  Google accepts a series with at most 8 conflicts and no more than half, declining only those dates
  (https://knowledge.workspace.google.com/admin/calendar/share-room-and-resource-calendars). Both offer
  an approver.

## 3. How schools plan the year

- **Day counts are statutory targets.** England: 380 sessions (190 days) for maintained schools
  (https://www.legislation.gov.uk/uksi/1999/3181/regulation/3/made), plus 5 INSET days the governing
  body picks (https://cheshirewestandchester.gov.uk/documents/education-and-learning/schools/school-holidays/school-term-and-holiday-dates-faq.pdf).
  UAE MoE 2026-27: three terms, 185 school days
  (https://moe.gov.ae/en/guides/Documents/Academic-Calender-2026-2027/Academic-Calender-2026-2027-En.pdf).
  Saudi Arabia: 180 instructional days, back to **two semesters** from 1447 AH (2025-26) with a roadmap
  to 1451 AH (https://gulfnews.com/world/gulf/saudi/saudi-arabia-returns-to-two-semester-school-year-unveils-four-year-academic-roadmap-1.500223782).
  Egypt 2025-26: 172 school days (third-party, https://top50women.com/41725-2/). PowerSchool's
  district push fails on "Calendar day count mismatch"
  (https://ps.powerschool-docs.com/pssis-admin/latest/district-calendars).
- **Layers.** An authority sets base dates, the school adds INSET, occasional days and mid-term
  breaks, then events. Devon recommends 197 days and each school picks 2 occasional and 5 training days
  (https://www.devon.gov.uk/children-families-education/education/school-term-dates/). UAE private
  schools off the MoE curriculum may add October and February breaks of at most 5 days
  (https://www.moe.gov.ae/en/mediacenter/news/pages/new-school-calendar-for-academic-year-2025-2026.aspx);
  KHDA marks the October break "for MOE Private Schools only" and runs a separate calendar for
  April-start schools (https://web.khda.gov.ae/en/Resources/academic-calendar-dubai-private-schools).
  Saudi Makkah, Madinah, Jeddah and Taif start later (search excerpt, https://ksaschools.com/en/calendar).
- **Staff and student calendars differ.** UAE staff start 24 Aug 2026, students 31 Aug, with three
  staff training blocks; student winter break starts 14 Dec, staff 21 Dec (MoE PDF above). Our
  `calendars.kind = 'staff'` already anticipates this.
- **Grade bands and central dates.** UAE KG to Grade 2 finishes the curriculum on 11 Jun 2027, then
  enrichment to 2 Jul; the same PDF fixes exam weeks and results days (Term 1 results 4-6 Jan 2027).
- **Islamic holidays are provisional.** Eid al-Fitr 1448 has five published or computed dates: Umm
  al-Qura 9 Mar 2027 and `islamic-civil` 10 Mar (measured), UAE MoE 8-12 Mar, MES Cairo 9-13 Mar, a Saudi
  guide 10-12 Mar (https://www.mescairo.com/schoolcalendar.asp,
  https://whichschooladvisor.com/saudi/school-news/new-saudi-school-calendar-holidays-for-2026-2027).
  MES Cairo flags dates "not confirmed by the Ministry so please do not arrange travel"; KHDA
  "tentatively communicate[s] public holidays". Saudi's Supreme Court calls for moon sighting on 29
  Ramadan (https://www.arabnews.com/node/2636682/saudi-arabia).
- **Weekends vary within a country.** UAE government Saturday-Sunday since 1 Jan 2022, Sharjah
  Friday-Sunday (https://u.ae/en/information-and-services/jobs/Sector-of-employment/working-in-uae-government-sector/working-hours-in-the-public-sector);
  Saudi Arabia Friday-Saturday since 2013 (search excerpt, https://www.spa.gov.sa/en/bee255bdbb); Egypt
  Friday-Saturday. `Intl.Locale#getWeekInfo` week starts differ (`ar-SA` Sunday, `ar-AE` Monday,
  `ar-EG` Saturday, measured): a default for new schools only; per-school settings are right.
- **Hijri display.** Umm al-Qura is Saudi Arabia's civil calendar
  (https://webspace.science.uu.nl/~gent0113/islam/ummalqura_rules.htm). `islamic-umalqura` in Intl
  covers 1300-1600 AH and falls back to `islamic-civil` outside
  (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf#supported_calendar_types).
  CLDR 46 flipped `ar-SA`'s default from Hijri to Gregorian, so always pass `calendar`
  (https://github.com/unicode-org/cldr/blob/release-46/common/supplemental/supplementalData.xml); `ar-SA`
  and `ar-EG` default to Arabic-Indic digits and `ar-AE` to Latin (measured), so pass
  `numberingSystem` too. `ar-EG` lists no Umm al-Qura but does list Coptic (measured), so the variant
  is a school setting. Temporal ships in Chrome 144 and Firefox 139, Safari only in preview
  (https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/Temporal.json).
- **Time zones.** Egypt reinstated daylight saving in 2023, last Friday of April to last Thursday of
  October (https://www.timeanddate.com/news/time/dst-egypt-2023.html); Riyadh and Dubai have none in
  2026-27 (measured). An Egyptian school year crosses the October change.

## 4. Standards and client behaviour

- **RFC 5545** (https://www.rfc-editor.org/rfc/rfc5545.html, 3.3.10, 3.8.1.11, 3.8.4.4, 3.8.5, 3.8.7.4).
  The recurrence set is RRULE plus RDATE minus EXDATE. RECURRENCE-ID holds an overridden instance's
  original start; `RANGE=THISANDFUTURE` extends it. UNTIL must be UTC when DTSTART has a TZID, and
  excludes COUNT. A TZID needs a VTIMEZONE. STATUS is TENTATIVE, CONFIRMED or CANCELLED; SEQUENCE is
  the revision. COUNT applies before EXDATE: ten weekly sessions with one exclusion give nine (measured).
- **RFC 7986** adds calendar-level NAME, DESCRIPTION, URL, CATEGORIES, REFRESH-INTERVAL ("a suggested
  minimum interval for polling"), SOURCE, and COLOR (a CSS3 colour name) and IMAGE (DISPLAY badge,
  graphic, fullsize, thumbnail) on the calendar or event, and CONFERENCE on events
  (https://www.rfc-editor.org/rfc/rfc7986.html).
- **RFC 5546 (iTIP)** is for organiser-to-attendee scheduling: PUBLISH, CANCEL with RECURRENCE-ID for
  one instance, SEQUENCE increments on each ADD or CANCEL (https://datatracker.ietf.org/doc/html/rfc5546).
  A read-only feed needs only PUBLISH.
- **RFC 7529** adds RSCALE (non-Gregorian RRULE) and SKIP; SKIP defaults to OMIT, so "30 Ramadan every
  year" would drop 29-day years (https://www.rfc-editor.org/rfc/rfc7529). rrule-temporal supports RSCALE
  only for Chinese and Hebrew (https://github.com/ggaabe/rrule-temporal/blob/9d65571327/README.md).
- **webcal** is a provisional IANA scheme: plain HTTP(S) GET of an iCalendar resource, "Unknown, use
  with care" (https://www.iana.org/assignments/uri-schemes/prov/webcal). Google's one-click subscribe is
  `https://www.google.com/calendar/render?cid=webcal://...` over HTTPS
  (https://til.simonwillison.net/ics/google-calendar-ics-subscribe-link, third-party).
- **CalDAV** (RFC 4791) adds read-write calendar collections, time-range queries and access control
  over WebDAV (https://www.rfc-editor.org/rfc/rfc4791.html). None of the school products above offers
  it; a one-way feed covers families and staff.
- **Refresh latency is outside our control.** Outlook.com "approximately every 3 hours", Outlook on
  the web (work or school) "approximately every 6 hours", both "can take more than 24 hours"
  (https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c).
  Google publishes no figure (https://support.google.com/calendar/answer/37100?hl=en); reports range
  from 5+ hours (Veracross) to about 24 (Arbor). Exchange ignores X-PUBLISHED-TTL on import
  (https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcical/1fc7b244-ecd1-4d28-ac0c-2bb4df855a1f);
  no vendor documents honouring REFRESH-INTERVAL. **Cancellations must also go by notification.**
- **Cancelled events in feeds.** A Google Calendar Community thread reports STATUS:CANCELLED in a
  subscribed feed not showing as cancelled (https://support.google.com/calendar/thread/417453184).
  Outlook one-click import of a multi-event ICS makes orphaned copies; Google adds only the first
  instance of a recurring single-event export (Localist export article above). UIDs must be stable.
- **Feed secrecy.** Google's "Secret address in iCal format" has a Reset that cuts off every subscriber
  (https://support.google.com/calendar/answer/37648?hl=en).

## 5. Recurrence engineering

- **Series plus instances everywhere.** Google keeps `recurrence` lines on the master, instances carry
  `recurringEventId` and `originalStartTime`, `singleEvents=true` expands, "this and following" trims
  the old series with UNTIL and starts a new one
  (https://developers.google.com/workspace/calendar/api/guides/recurringevents). Graph types
  `seriesMaster`, `occurrence`, `exception`, with `originalStart` and `cancelledOccurrences`
  (https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0). Moodle
  materialises weekly repeats as rows linked by `repeatid`, edits "all" or "this" only
  (https://github.com/moodle/moodle/blob/e68a1418be/public/calendar/lib.php#L558-L570). Canvas does the
  same with `series_uuid` and one, all, following.
- **Bounded expansion.** Sabre/dav stores the rule plus first and last occurrence, capping infinite
  series at 2038 (https://github.com/sabre-io/dav/blob/1ce51f845f/lib/CalDAV/Backend/PDO.php#L26-L34).
- **Library pitfalls (measured).** A weekly event at Cairo midnight across the 24 Apr 2026 change:
  rrule.js put it on Thursday 23 Apr on a UTC host, with output varying by host zone; rrule-temporal
  dropped it; `VALUE=DATE` was correct. rrule.js last released 2023-11-10
  (https://www.npmjs.com/package/rrule).
- **Fit for us.** School series are finite by construction (inside a year). Keep the rule on the
  series row, materialise occurrences inside the year keyed by (series, original date), store overrides
  and cancellations under the same key (RECURRENCE-ID semantics), and compute holiday skipping at
  expansion from `calendar_dates` rather than frozen EXDATEs, regenerating when the rule, the terms or
  the school days change. That is an inference from the models above, and it avoids Finalsite's
  non-retroactive exception trap.

## 6. UI and accessibility

- Views: FullCalendar has month, week and day grids, lists and `multiMonthYear`
  (https://fullcalendar.io/docs/multimonth-grid); Google's phone list is "Schedule"
  (https://support.google.com/calendar/answer/6110849?hl=en). FullCalendar's `weekends` flag assumes
  Saturday-Sunday and it has no Hijri support (https://fullcalendar.io/docs/weekends): keep our grid.
- Tables, not grids: the APG strongly encourages native tables for data that is read
  (https://www.w3.org/WAI/ARIA/apg/patterns/table/); arrow-key grids belong to date pickers
  (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/), and APG has no
  RTL arrow guidance (https://github.com/w3c/aria-practices).
- Colour: WCAG 1.4.1 forbids colour as the only cue
  (https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html); 1.4.11 needs 3:1 for chips and
  swatches. Today every category shares one dot colour, so categories are invisible in the grid.
- Drag needs a single-pointer "Move to" alternative under WCAG 2.5.7
  (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Print: Google prints day to month and schedule but not a year
  (https://support.google.com/calendar/answer/41067?hl=en); FullCalendar print is paid; CSS `@page size`
  works in all three engines (https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/page.json).

## 7. What to build

### Tier 1: now

**T1.1 Plan the year: a school-day planner.** The backbone every product has and we lack a screen
for. Evidence: Arbor holiday types and "Mark Calendar as Complete", PowerSchool bulk date-range
setup, Finalsite exception calendars, statutory day targets (section 3).

- Screen on the year record: twelve month mini-tables (native `<table>`), terms banded, each day
  coloured by kind with icon and text (never colour alone), a live count of school days against a
  target, and a print stylesheet for the year and each term. Select a range, choose a kind
  (public or school holiday, exam day, staff day, early dismissal, make-up day, closure), add notes in
  both languages.
- Data: `calendar_dates` already has one row per day; add `provisional boolean` (Eid and other
  sighting-dependent days, shown "expected") and a `target_days smallint` on the school calendar or year.
  Store holidays as dates only.
- Next-year privacy: add `published_at` to `calendars` so an upcoming year's days and events stay
  manager-only until published, as Arbor's "Show Next Academic Year Calendar" does.
- Cascade: attendance already reads `calendar_dates`, so a new closure stops registers (as Arbor's
  holidays do) and, from T1.2, notifies the audience. `calendar:manage` only; a closed year is read-only.
- Pitfall: changing weekend days mid-year regenerates rows from a date forward
  (`docs/systems/platform-foundation.md`); that must not overwrite holiday rows.

**T1.2 Draft, publish and tell people.** Evidence: ParentSquare Send Update, Bloomz notify on save,
ClassTag and Bloomz silent deletes, Arbor's cancelled-consultation gap, Brightwheel cancellation
notices, feed latency of 3 to 24+ hours (section 4).

- Data: `calendar_events.state` `draft | published` (default draft for new events) and
  `published_at`, `update_sent_at`, mirroring announcements. Drafts are visible to their author and
  managers only; readers' queries add `state = 'published'`.
- Publish: "Publish and notify" or "Publish quietly". Notify uses the existing `notify()` with kind
  `event`, audience users from `audienceUsers`, params `{title, date, updated}`, `collapse: true`, so
  preferences, digests and quiet hours already apply.
- Changes: saving a published event is quiet unless the author ticks "Send update"; the editor
  pre-ticks it when date, time, location or audience changed. Cancelling a published event always
  notifies the people it reached, offered as the default with a reason field. Deleting a published
  upcoming event is refused: cancel it first, so feeds and notices stay truthful.
- Bulk: publishing a whole year's plan sends one notice ("The 2026-27 calendar is published"), not one
  per event (design inference; Veracross builds no distribution lists for events more than 12 months
  out, https://community.veracross.com/s/article/Email-Communication-for-Group-Events).
- Emergency closures go through urgent announcements, which bypass quiet hours; the event or day
  change links to it.

**T1.3 Teachers put class events on the calendar.** Evidence: Google Classroom teachers add trips and
exam dates to the class calendar; ClassDojo class events; Moodle course events need a course-level
capability and site events a system one; Blackbaud group leaders edit; CalendarWiz "Self Booking"
categories edit own only; Veracross and Blackbaud have no event approval.

- New capability `calendar:author` in `TEACHING`: create and edit own events whose audiences are only
  classes the author teaches (checked against `enrollments` role teacher or aide), and grades only
  where they teach a homeroom in it. School, staff, families and students scopes and public
  publication stay with `calendar:manage`. Managers can edit anyone's.
- No approval queue in tier 1: evidence says schools do not approve events, they gate rooms.
- Pitfall: `reachOf` evaluates membership today, so an event for next year's classes is invisible
  until enrolments start. For class and grade audiences, evaluate reach on the later of today and the
  event's start (inside the year).

**T1.4 Personal calendar feed.** Evidence: spec promise; Bloomz and ParentSquare one secret link per
user with reset; Veracross and Blackbaud windows; client refresh behaviour (section 4).

- Data: `calendar_feeds` (tenant, user, `token_hash`, optional filter `{children: [...], categories:
[...], includeDays: bool}`, `created_at`, `revoked_at`, `last_fetched_at`). Store a hash, show the
  token once, "Reset link" revokes. Revoke on account deactivation.
- Serve `GET /calendar/feed/<token>.ics` unauthenticated, evaluating the owner's reach at fetch time
  (so a guardian link dies with the relationship or `communication_isolated`), window 30 days back to
  12 months ahead, at most 1,000 events, published only. Include school closures as all-day items when
  asked.
- Content: extend `eventIcs` to many events: stable UID, `SEQUENCE`, `DTSTAMP`, `LAST-MODIFIED`,
  `CATEGORIES`, `URL` to the event page (plain-text description, never files), `NAME`/`X-WR-CALNAME`,
  `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` as hints only. UTC instants for timed events sidestep
  VTIMEZONE and Egypt's DST. Cancelled events keep `STATUS:CANCELLED` plus a localised "Cancelled:"
  summary prefix, because Google may show them as normal.
- UI: "Subscribe" dialog with a `webcal://` link, Google's `render?cid=webcal://` link, Outlook
  "Subscribe from web" steps, a per-child picker, and a note that updates can take a day.
- Pitfall: the link is a bearer credential (Bloomz documents that anyone holding it reads private-group
  events); rate-limit, log fetches, never put tenant or user ids in it.

**T1.5 See what matters: legend, filters, layers.** Evidence: Finalsite "Display Calendar & Category
Legend", Trumba mix-ins toggled per calendar, CalendarWiz legend colours and "Disable Filtering" for
holidays, Bloomz class picker as the per-child filter, WCAG 1.4.1 and 1.4.11.

- A category colour token and icon per category (admins choose nothing yet); chips show the icon; a
  legend that doubles as filter toggles stored in the URL search; school days always visible; guardians
  get a child switcher (filter by the child's class and grade reach); staff get "My classes" and
  "Staff only".
- No schema change beyond the category map; the range query already returns category.

**T1.6 Public events on the website, from the calendar.** Evidence: Finalsite Calendar element and
single public checkbox, Localist public-only feeds and widgets (50 results, 365 days), Trumba live
spuds versus nightly feed imports, the `news` section already reading posts.

- Data: `calendar_events.public boolean` (managers only), and bilingual fields: replace `title` with
  `title_en`, `title_ar` (at least one, like `calendars` and `academic_sessions`), same for `location`.
  Public events require both languages or fall back visibly, as site posts do.
- Website: the `events` section reads published public events live, with `count`, `category` and
  "days ahead" fields like `news`, keeping `list` and `cards`. Existing manual items need a conversion
  path to public events before the manual list is retired. Detail pages and a public `.ics`: tier 2.
- Pitfall: trips and class events can reveal where children will be; `public` is off by default and
  unavailable for class audiences.

**T1.7 Hijri alongside Gregorian.** Evidence: Classera date-format toggle, PowerSchool dual year names,
Saudi civil use of Umm al-Qura, the CLDR 46 default change.

- School settings: secondary calendar `none | islamic-umalqura | islamic-civil`, digits
  `latn | arab`. Show the secondary date in month cells, agenda day headings, the event page and the
  year planner via `Intl.DateTimeFormat` with explicit `calendar` and `numberingSystem`. Never derive a
  confirmed Eid from Umm al-Qura; the planner's `provisional` flag carries that.

### Tier 2: next

**T2.1 Recurring events.** Evidence: every SIS has series (Veracross master and occurrences, Arbor
"Term time only" and timetable-cycle repeats, Finalsite "Avoid Dates on", Canvas and Moodle
materialised series).

- Data: `calendar_event_series` (rule subset: weekly or monthly by weekday, interval, weekdays, UNTIL
  date capped at the year end, skip non-school days yes or no, optional timetable cycle week),
  `calendar_events.series_id` and `original_on` for each materialised occurrence (unique
  `(series_id, original_on)`), overrides as edited occurrence rows, cancelled occurrences kept with
  `cancelled`. Edits offer this, this and following (split the series), all.
- Expand in the domain package in wall-clock dates and times with the school zone, no rrule.js;
  recompute when school days change; no COUNT ("10 sessions" becomes an end date). The feed emits each
  occurrence as its own VEVENT, avoiding VTIMEZONE and Google's first-instance-only behaviour.

**T2.2 RSVP and reminders.** Evidence: ParentSquare tri-state with adult and child counts, Bloomz cutoff,
Localist day-before reminder, organiser-chosen offsets in ClassDojo and Bloomz.

- Data: `rsvp_mode none | yes_no | yes_no_maybe`, `rsvp_closes_at`, `ask_headcount` on events;
  `calendar_event_responses` (event, user, optional student for guardians, answer, adults, children,
  note, `responded_at`), unique per (event, user, student). No cap on RSVP; caps belong to slots.
- Organiser report (counts, non-responders, export, "remind non-responders"). Reminders: organiser
  picks none, same day, 1 day or 1 week; a scheduled job emits `event` notices; RSVP "No" suppresses.

**T2.3 Parent-teacher conference booking.** Evidence: every parent app and MIS converges on one slot
model (section 2), with Bloomz's regenerate-drops-bookings and SchoolCloud's length lock as pitfalls.

- Data: `booking_windows` (event, opens_at, closes_at, slot minutes, break minutes, mode in person,
  video or both, meeting link, hide names, max per student per guardian, separate bookings for
  separated guardians), `booking_hosts` (teacher, availability ranges, breaks as gaps, room),
  `booking_slots` generated from availability, `bookings` (slot, guardian, student, note, interpreter
  needed, created_at, cancelled_at). Lock slot length after the first booking; edits that remove a
  booked slot must be refused or move the booking with a notice.
- Rules: only the student's own teachers; one booking per teacher per child; warn on a guardian's
  overlapping bookings across teachers and add travel time; teacher unavailable if another event or
  lesson overlaps (the Arbor "Cover required" warning, later from the timetable).
- Notices: confirmation, change and cancellation always; reminder a day before and an hour before video.

**T2.4 Week view, print, public pages.** Staff week grid (spec), month and agenda print, public event
pages and per-category public `.ics` (Localist, Trumba).

**T2.5 Grade and staff calendars.** Use `calendar_grade_levels` and `kind = 'staff'` so a KG
completion day, a curriculum-scoped break or staff training days reach the right people; copy last
year's calendar with weekday alignment (Veracross "Copy YY-YY").

**T2.6 School-defined categories and room locations.** Categories as an admin-set descriptor namespace
with colour and icon (Veracross, Blackbaud); location from `core.locations` or free text with a map
link (Veracross internal resource versus external organisation).

### Tier 3: later

- **Room booking and clashes** against `core.locations` and `class_meetings.location_id`: warn by
  default with a per-room "allow simultaneous" or "block" rule and optional approver (Veracross, Arbor,
  Arbiter, Exchange). PostgreSQL `EXCLUDE USING gist` only for rooms set to block.
- **Timetable effects:** an event for a class or grade on a school day lists the lessons it displaces
  and can suspend them, freeing teachers and rooms (Arbor); exam days and early dismissal pick a bell
  schedule (PowerSchool "Assembly" pattern).
- **Trips as registrations:** participants, consent, capacity, sign-up window, payments; participants
  pre-fill an attendance code (Arbor trips and planned absences; Veracross "Leave Class").
- **Approval queue** for staff-submitted school-wide or public events, scoped by category, with
  "approved" notices to the submitter and auto-expiry of stale items (Localist, Trumba's gap), only if
  schools ask; evidence says most do not.
- **Push sync to Google or Microsoft** (Bloomz, ClassDojo Plus) and ICS import of a ministry or
  district calendar (ParentSquare, Finalsite Live calendars). CalDAV is not needed.
- **Volunteer and item sign-ups**, waitlists, automatic multi-teacher scheduling (SchoolCloud),
  per-recipient translation of event text.

## 8. How it connects

- **Website.** Calendar events feed the site's events section (T1.6), rendered live like `news`, never
  from a feed. Planner closures can drive the site-wide closure banner the spec lists.
- **Announcements and notifications.** Event publish, update and cancel go through `notify()` with kind
  `event` (preferences already have the row); urgent closures through urgent announcements.
  Announcements and newsletters embed an event card by id (spec: "event and RSVP blocks"), so a
  reminder post and the calendar never disagree.
- **School year and terms.** The planner lives on the year record; terms band it and the month grid;
  the day count sits beside the target; rollover gains "copy school days and annual events";
  `calendars.published_at` keeps next year private; a closed year is read-only.
- **Timetable and attendance.** `calendar_dates` already decides whether registers exist. Exam and
  early-dismissal days are the hook for alternate bell schedules; class and grade events are the hook
  for lesson suspension and attendance pre-fill (tier 3). Conference availability should read
  teachers' lessons once the timetable exposes rooms and teachers per date.

## 9. Pitfalls to design against

- Feeds lag hours to a day and Google may show cancelled events as live: notify every material change,
  and cancel rather than delete, since deleted events vanish silently from feeds.
- UIDs stay stable across edits; a copied event gets a new one.
- All-day items stay dates; timed items are wall clock plus the school zone; never expand at local
  midnight (Egypt DST). Islamic holidays move after publication: provisional, re-expand, notify.
- `ar-SA` defaults changed and digits differ by region; weekends differ by emirate and school.
- Reach evaluated today hides next year's class events; public events can expose children's locations.
- Regenerating booking slots drops bookings; COUNT with exclusions undercounts; a notice per event when
  publishing a year floods families; colour-only categories fail WCAG 1.4.1, drag-only moves fail 2.5.7.
