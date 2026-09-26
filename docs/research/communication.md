# Communication research

Official help centres and product documentation, read on 2026-09-26.
ParentSquare's help centre needs sign-in, so its public Zendesk mirror
(`parentsquare1736363850.zendesk.com`) is cited; Toddle is login-gated
(search excerpts only); Smore's help site failed TLS, so smore.com feature pages
and Finalsite docs were used; Remind now belongs to ParentSquare.

## 1. Messaging

- Every product uses two panes on desktop (threads, conversation) and one
  stacked screen on phones; thread details open from an info icon, not a
  third pane.
- Chat bubbles, not email: replies arrive through app, web, email and SMS as
  short plain text; links auto-link.
- Unread first, then recent; messages grouped by date.
- 1:1 versus group: ParentSquare Direct Message fans out private threads
  (BCC, up to 150) while a Group Conversation is one shared thread (CC, up to 50) that cannot gain members; Seesaw distinguishes Conversations
  (recipients visible) from Announcements (hidden, private replies) and lets a
  teacher convert and label them. The co-parent problem: Brightwheel gives each
  child an admin+guardians thread and a staff+guardians thread.
- Who may message whom: ParentSquare parents reach teachers and staff;
  ClassDojo leaders message any family and teachers only their classes; Seesaw
  has a settings matrix with district overrides; Brightwheel admins see every
  thread and have a staff role without parent messaging.
- Office hours: ParentSquare delivers but mutes push and SMS; Seesaw shows a
  banner; Remind asks the sender to confirm; ClassDojo adds weekend mute and
  holds read status.
- Read receipts: ParentSquare staff-only in 1:1; Seesaw staff see "Seen by",
  families never see staff read state; ClassDojo paid and switchable.
- Translation: ParentSquare and Remind automatic both ways with View
  original; Seesaw and ClassDojo on demand.
- Attachments to 500 MB, 2-minute voice clips (not translated), reactions as
  acknowledgement; Seesaw schedules messages; ClassDojo deletion keeps an
  export copy.

## 2. Announcements

- ParentSquare composer: To (school, grade, class, group), who should see it,
  confidential toggle, subject and body, add-ons (RSVP, forms, volunteers,
  wish lists), notify at preferred time / instantly / not at all, Post now /
  Schedule / Draft / Preview with a recipient-count confirmation, autosave each
  minute, post as a department.
- Edits are silent unless the author chooses Send Update.
- No product has a simple Acknowledge button; ParentSquare uses a form.
- Delivery reports: per-recipient channel status, viewed, language, CSV
  (ParentSquare); Delivered / Read / Errors, reactions, language (Remind).
- Urgency: post, smart alert (text first, voice fallback), urgent alert
  (admins, instant, school-wide); Remind urgent overrides opt-outs.
- Comments: ClassDojo per class; Seesaw requires approval.
- Pinning: ClassDojo one pin and the next event on top; ParentSquare pin until
  next pin; no product documents expiry.

## 3. Newsletters

- Brightwheel section form: title (70 chars), 1–30 sections with photo,
  heading and body, preview required, Duplicate clears recipients, delivered in
  the child's thread, staff archive.
- Block editors: ParentSquare Studio (templates, live co-editing, automatic
  translation); Smore (brand kits, reader translation bar, analytics, email,
  link or embed); Mailchimp (content, layout and style panels, up to 4 columns,
  mobile styles, previews, test send, link check, web archive of each email).
- HTML newsletters cannot be translated (Finalsite on Smore).

## 4. Calendar

- ClassDojo events with reminders and an Upcoming list; Bloomz events with
  RSVP and notify-or-silent; ParentSquare sign-ups as add-ons.
- Bloomz grids only for staff on desktop; parents get lists.
- Subscriptions: ParentSquare one iCal feed per parent; Bloomz imports iCal.

## 5. Notifications

- ParentSquare: posts Off / Instant / Digest per channel; messages by email,
  text or none; critical notices locked on; direct messages and alerts skip
  the digest; posts after 6pm held until 8am local.
- Seesaw: All / Once per day / Never; daily summary shows counts only.
- Bloomz: per class, user-chosen digest time, quiet hours.
- Classroom guardian summaries skip empty days; Teams offers only a weekly
  assignment digest (its Parent Connection app retired 30 September 2025).
- Reachability tables: bounced, spam, landline, STOP, never used.
- 85% of parents rate school communication poorly and want a predictable
  weekly digest; teachers report 8–20 parent messages a day.

## 6. Pitfalls

Either-or channels (app turns off email/SMS), content-free summaries,
notification centres missing posts, an urgent flag anyone can use, inflated
Read status, search only in the original language, frozen group threads,
untranslatable voice clips, raw HTML newsletters that break RTL, unsubscribe
removing the guardian, SMS truncated at 140 characters.

## Resulting specification

Chat bubbles for 1:1, cards for broadcasts, one delivery pipeline with fixed
urgency tiers, structured bilingual content. Inbox two panes from 1024px with
filters, child chip and search across translations; thread with date groups,
per-message direction, translation toggle, reactions, office-hours banner,
staff-only Seen state, composer with attachments, voice note with transcript,
autosaved drafts and staff scheduling; default thread per staff member and
child's guardians; group threads that can change members; relationship-scoped
recipient picker with quick picks and a recipient count. Announcement feed
with pins, cards, audience and urgency chips, Acknowledge, events and RSVP,
child and category filters, Past tab; composer with audience scopes,
attachments, event and RSVP, acknowledgement with due date, comment modes, pin
until, expiry, urgency tiers, preview on phone/email in both languages,
schedule, silent edits unless Send update, delivery report with reminders and
export. Newsletter builder of sections with per-section AR/EN and reviewed
flag, templates, duplicate, previews, test send, link check, web archive.
Calendar agenda for families, grids for staff, full event fields, iCal per
person and child. Notification centre with Needs action and All; preference
matrix (channels × types, Instant / Digest / Off, emergency locked on),
digest schedule, quiet hours and weekend mute, language.
