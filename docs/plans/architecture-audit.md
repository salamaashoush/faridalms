# Farida LMS architecture audit: duplicated and divergent mechanisms

Scope: `main` at 0745cf73, read only. Two known cases are excluded: the
sign-in page's own editor and renderer, and admissions enquiry threads with
plain-email replies. Where `main` had uncommitted work in progress (the
sign-in move touches `systems/site.ts`, `components/site/render/*`), those
files were read at `HEAD`. Line numbers are from `HEAD` unless noted.

Priorities: **P0** = fix before onboarding schools, **P1** = soon,
**P2** = later. Sizes: S (a day or two), M (about a week), L (several weeks).

---

## P0: fix before onboarding schools

### 1. Every publishable host runs its own publish lifecycle, and the copies have drifted into real defects

**Mechanisms.** Announcements, news posts, calendar events, consent forms,
learning modules and site pages each implement draft, publish, schedule,
checks, snapshot and telling separately. The lower helpers are shared
(`stores/audiences.ts`, `core/notify.ts`, `publishTelling`,
`reviewTranslation`, `stores/documents.ts` snapshots). The lifecycle on top of
them is not.

**Defects the drift has already produced:**

- **Published announcements serve the live draft.**
  - `record` reads `words()` → `documentOf` (`apps/api/src/systems/announcements.ts:104-117`, `:219-247`).
  - News readers read the published snapshot through `edition()` → `publishedVersion` (`apps/api/src/systems/news.ts:171-190`).
  - `save` on a published announcement has no state guard except `archived`, and no `contentIssues` check; the check runs only inside publish (`announcements.ts:410-413`).
  - "Edits are held back once published" (`docs/design-system.md`, Content editor) is therefore enforced only by the web editor (`AnnouncementEditor.tsx:313-330`). Any API or mobile client edits what families are reading, unchecked and with no version kept.
- **"Scheduled" is encoded three ways.**
  - Announcements: `state = 'scheduled'` (`announcements.ts:419`).
  - News: `state = 'published'` plus a future instant, labelled by `shownState` (`news.ts:193-199`), with a copy of that logic in `systems/site.ts` (~`:245`) and in the store's tab filter (`stores/news.ts:108-109`).
  - Modules: `published` plus `publish_at`, read through `isOpen` (`learning.ts:331-334`).
- **Publish checks differ by host, although `docs/content-editor.md:22` says "every publishing path refuses those".**
  - Announcements (`announcements.ts:411`), calendar (`calendar.ts:395`), briefs (`domain/coursework.ts:368`) and lessons (`domain/learning.ts:1279`) run `contentIssues`.
  - Site and news (`domain/site-sections.ts:1421-1426`, `domain/website.ts:177`) drop the heading-order check and add the first-level-heading check.
  - Captions are required only in lessons (`domain/learning.ts:1222-1227`) and site media (`site-sections.ts:1438`). An uncaptioned video publishes in a brief, a news post or an announcement.
  - Unreviewed suggestions are checked only in lessons and briefs.
  - Consent forms (`consents.ts` `publishForm`, ~`:386`) run no content check.
- **Other host-specific omissions:**
  - The photo-consent check (who a picture shows) runs only for news (`news.ts:607-620`). The same photo in an announcement skips it.
  - The translation is snapshotted at publish for news (`news.ts:665-670`) but not for announcements.
  - Calendar events take no publish snapshot, keep no version history and send no mention notice.

**Why it matters.** This is the "bolted on" pattern at the heart of the
product. Each new publishable thing copies the nearest one and inherits a
different subset of the rules. The announcement defect is user-facing, and it
touches safeguarding: a notice can change under parents after they have
acknowledged it.

**Consolidation.** Build one host-document publication module in `core`
covering:

- the bilingual draft and published edition;
- a single state model (`draft | published`, with `publish_at` deciding "scheduled", derived by one domain helper);
- `publishIssues(document, hostRules)` in `content-checks.ts`, covering alt text, heading order, first-level heading, link labels, captions, suggestions and photo consent;
- the snapshot, telling, recipients, read report and translation review.

Announcements, news, calendar, consents, modules and site pages then become
configurations of it. Fix the announcement reader first (S) by reading
`publishedVersion` as news does. The module itself is M-L.

### 2. Scheduled announcements and news go live silently

Publishing with a future time skips `notify` and mentions:

- `announcements.ts:439` says "A scheduled one tells nobody yet; its readers hear when it is out", then notifies only when `!later`.
- `news.ts:651-683` does the same.

Nothing ever tells readers later. The only background loops are
`notifications/scheduler.ts` (it delivers rows that already exist), quiz-clock,
partitions, file upkeep, coding reruns and host checks. Visibility is a
time comparison only (`stores/announcements.ts:226`). The result: a scheduled
urgent notice, or one needing acknowledgement, appears with no notification
and nobody is asked to acknowledge it.

`notify()` already supports `delayMinutes` (`core/notify.ts:27`), and
deliveries carry `due_at`. Either write the notifications at publish time,
due at `publish_at` (dropping them if the item is unpublished first), or add
one go-live sweep shared by every publishable host. This falls naturally out
of finding 1. Size S-M.

### 3. The notification outbox does not cover teaching, though the docs say it does

`docs/architecture.md` (the notifications paragraph) says publishing an
assignment and releasing an assessment write outbox rows. In code:

- `NOTIFICATION_KINDS` has no assignment or result kind (`packages/domain/src/notifications.ts:6-19`).
- These do not call `notify`:
  - assignment publish (`coursework.ts` ~`:1096`)
  - `releaseAssessments` (`coursework.ts` ~`:1518`, `:1979`, `:1987`)
  - peer release (`peer.ts:174`)
  - `gradebook.ts` `releasePeriod` (~`:253`)
  - `learning.ts` `publishModule`
- The only `notify` call in `coursework.ts` is a discussion reply (`:3929`). A reply under a work comment does not notify (`replyToComment`, ~`:2006-2023`).
- Families find out about results only from the home dashboard, which works them out when the page loads (`home.ts:725-733`). They get no email or SMS.
- The architecture doc also names a `notification_events` table that does not exist.

Separately, invites and sign-in links (`core/sign-in-link.ts:113`, called from
`people.ts:1283` and `provisioning/host.ts:180`) and password resets
(`identity.ts` `requestPasswordReset`, ~`:422`) call `mail.send` directly.
Sending directly is right, because the office needs the result at once. But
those sends never reach the delivery log, so "the parent never got the
invite", the most common onboarding question, cannot be answered from the
office's log.

**Consolidation.**

- Add the missing kinds and producers (S-M).
- Write a delivery row (sent or failed) for direct sends (S).
- Correct the architecture doc.

### 4. Written words are stored in three shapes, against the "one document model" rule

**Mechanisms.**

- Most content is a `core.documents` `ContentDocument` (`packages/editor`).
- **Messages** are plain `text`, capped at 5000 characters (`packages/database/src/tables/messaging.ts:126,139`). They are written in `Textarea`s (`components/messages/Conversation.tsx:179`, `NewMessage.tsx:265`) and rendered as `{message.body}` (`Conversation.tsx:77`), with an attachment `FileList` beside the text (`:147-152`).
- **Discussion posts** keep rich content inline as `content` plus `plain_text`, with their own media path (`tables/coursework.ts:774-812`). They are written with `ContentEditor` (`coursework/Discussion.tsx:23`).
- **Work comments**, and teacher feedback in `assessments.feedback`, `quiz_answers.feedback` and `lesson_responses.feedback`, are plain text. `WorkComments.tsx:289` is a third reply box.

**Why it matters.**

- This contradicts `docs/content-editor.md:25` ("messages… assessment feedback save the shared document"), `docs/architecture.md` ("plain text, Markdown or a shared rich document") and foundation 6.12 (frozen message documents).
- The attachment list contradicts AGENTS.md's "no attachments list" rule.
- Three conversation UIs do one job.
- The Messages unification now under way (outside participants, shared mailbox) will set the body format in stone.

**Consolidation.** Decide inside that unification, before it ships.

- Either the message body becomes a frozen `rich_text` document hosted as `message`, with files as blocks and one thread component serving Messages, discussions and work comments (M);
- or plain text is the deliberate choice for mail-bridged messages, recorded in the docs, and discussions and work comments follow the same choice.

Either way, end up with one thread component and one body model.

### 5. Times are displayed and entered in two time zones

**Display.**

- `formatInstant(iso, timeZone)` (`components/coursework/format.ts:57`) uses the school's zone.
- `formatDateTime` (`apps/web/src/utils/datetime.ts:65-71`) hard-codes `timeZone: "UTC"`, yet it formats instants. Examples:
  - audit history: `people/record-parts.tsx:159`, `admin/AccessRolesPanel.tsx:192`, `exams/ExamHistory.tsx:111`
  - last sign-in: `routes/_app/admin/staff.tsx:88`
  - learner answers: `learning/Answers.tsx:407`
  - `people/StudentOverview.tsx:198`
- In an Egyptian or Gulf school these show times two to four hours off, with no zone label.

**Entry.**

- The assignment editor converts in the school's zone (`AssignmentEditor.tsx:345` `toInstant`, `AssignmentRecord.tsx:256`, `privacy/Breaches.tsx:275,320`, each with its own helper).
- Announcements, news, the site studio and site settings use the browser's zone through `getTimezoneOffset` (`AnnouncementEditor.tsx:110-115,298`, `NewsEditor.tsx:412`, `site/Studio.tsx:570,1325`, `SiteSettings.tsx:52-56,113`). A head scheduling a post while travelling publishes at the wrong instant.

**Consolidation.** One `formatInstant` and one `instantFromLocal(local,
schoolTz)` in `utils/datetime`. `formatDateTime` either goes or becomes
date-only. Size S-M.

### 6. Admissions duplicates core systems beyond its threads

The thread and reply move is excluded. These remain:

- **Contact data bypasses people conventions.**
  - `site_enquiries.name/email/phone/child_name/child_year` are free text.
  - The phone is never normalised; `toE164` is used only in `systems/people.ts` (`:310,510,554,1086,1919`). So `relatedEnquiries` matches with `e.phone = ${input.phone}` (`stores/enquiries.ts:277-278`), and "010…" never matches "+2010…".
  - The child's year is a free 60-character text box (`domain/website.ts:209`, `render/sections.tsx:2528-2533`), not a grade-level descriptor. Intakes, which are per grade, and conversion will need it structured.
  - The website and staff-logged enquiries each have their own copy of the enquiry schema (`domain/website.ts:195-224`, `domain/enquiries.ts:262-276`).
- **Logged contact exists twice.**
  - Enquiry entries log `note | call | email | meeting` (`domain/enquiries.ts:47-59`).
  - Attendance follow-up logs calls in `core.attendance_contacts` (`tables/attendance.ts:294-318`, `stores/follow-up.ts:183-203`).
  - Neither is visible from Messages, which is becoming the family's conversation.
- **State history is written twice.** Enquiry `state` and `assigned` entries are written next to `enquiry.state` and `enquiry.assign` audit rows (`admissions.ts:137`, `:274-280`, `:311-317`).
- **Reply templates are hard-coded.** `REPLY_TEMPLATES` and `REPLY_WORDING` (`domain/enquiries.ts:304-416`) sit outside the school-editable Templates system (`domain/templates.ts:8-16`).
- **The form asks for no consent.** It collects family and child data with no privacy notice or consent element (`render/sections.tsx:2380-2560`), although `privacy_notices` and the consents system exist (`website.md` Next #4).

**Consolidation.**

- Normalise the phone into a `normalized` column, as `contact_points` does.
- Make the year a grade-level descriptor id.
- Merge the two enquiry schemas.
- Fold logged calls into the Messages conversation as a "logged contact" kind.
- Take state history from audit.
- Add a `message` template kind.
- Add consent through the consents system.

Size M in total. Most of it belongs in the Messages unification already
under way.

### 7. Legacy formats and the pre-cell stack are still live, so they will become permanent

- **Lesson formats.** Lessons may still be stored as `LessonDocument` block lists. About 70 call sites deal with this (`isContentDocument`, `lessonContentOf`, `contentOfLesson`; 19 of them in `systems/learning.ts`), plus the restore fallback at `systems/documents.ts:122`. The old separate quiz document is still read (`core/quiz.ts:73-104`). Starters, patterns and the cartridge importer still produce `LessonBlock[]`.
- **Dead domain modules.**
  - `domain/newsletter.ts` is used only by the legacy schema.
  - `domain/rich-text.ts` survives only as the source for `richTextToContent`.
  - `components/records/MarkdownContent.tsx` is imported only by its spec.
- **A second database schema.** `packages/database/src/schema.ts` (1013 lines, pre-cell), `control-schema.ts`, `control.ts` and `relations.ts` are still exported from the package root (`index.ts:5,16`). Old domain modules (`assignment.ts`, `notification.ts`, `academic-year.ts`, and `identity.ts` `PERMISSIONS`/`ROLES` beside `capabilities.ts`) sit next to the live ones.
- **E2E specs that never run.** 10 of 42 specs are excluded by `playwright.config.ts:21-56`, whose comment reads: "The rest still drive the per-school API those systems replace":
  - `access.spec.ts`, `access-roles.spec.ts`, `academic-context.spec.ts`, `api.spec.ts`, `experience.spec.ts`, `forms.spec.ts`, `management.spec.ts`, `records.spec.ts`, `school-year.spec.ts`, `working-year.spec.ts`.
  - The fixtures of two of them insert through the legacy schema (`e2e/fixtures/recipients.ts`, `academic-year.ts`).
  - **AGENTS.md:162 names `e2e/access.spec.ts` as the guard that walks every nav link for every role, and that guard does not run.**
  - **Resolved** (`0fefd813`): the exclusion list is gone and all ten specs run against the cell, `access.spec.ts` included; their data comes through the cell API (`e2e/fixtures/school.ts`), and the two legacy fixtures are deleted.

**Why now.** No school data exists yet, so deleting these is cheap today. Once
a school's lessons are stored in the old shape, every fallback becomes a
migration. Meanwhile the old schema and docs mislead every new contributor,
human or agent, about which model is real.

**Consolidation.**

- Migrate the seed and starters to `ContentDocument`, then delete the lesson fallbacks (M).
- Delete the legacy schema, control modules and dead domain modules (S).
- Port or delete the ten specs, restoring the nav walk first (M).

### 8. Guardian access and "staff" are defined in many places

- **The guardian rule** (`active and portal_access and valid_during @> on and not communication_isolated`) is pasted into:
  - `stores/students.ts` (6)
  - `stores/messages.ts` (4)
  - `stores/audiences.ts` (2)
  - `stores/records.ts` (2)
  - `stores/follow-up.ts`
  - `stores/invites.ts`
  - Variants that check `portal_access` without isolation appear in `stores/consents.ts`, `persons.ts` and `identity.ts:129`. The identity one is probably deliberate, since isolation is about contact, not portal access.
  - One copy that forgets `communication_isolated` sends to a parent the school deliberately cut off.
- **"Staff" means three things.**
  - `can("people:read")` (`systems/messages.ts:62`).
  - A role list redeclared as SQL literals (`stores/messages.ts:36`, `stores/audiences.ts:38`) beside the typed `STAFF_ROLES` (`stores/staff.ts:13`, used by `access.ts` and `privacy.ts`).
  - `actor.profile === "staff" || "staff_admin"` (`systems/classes.ts:217`).
  - The three role lists match today; the risk is drift. A custom access role can still be staff to the API (capability) and not to the store (role).

**Consolidation.**

- One SQL function or view, `app.portal_guardians(on)` or `app.contactable_guardians(on)`, plus a `check-sources` gate against inline copies.
- Import `STAFF_ROLES` in SQL from `staff.ts`.
- Decide whether "staff" is a capability or a membership, and use it consistently.

The guardian function is P0 because it is privacy (S-M); the staff
definition is P1 (S).

### 9. A wrong address on a school website shows the portal's 404

`routes/site/$school.tsx` has no `notFoundComponent` or `errorComponent`.
`record()` in `server/site.ts:76-88` throws `notFound`, which falls through
to the app's root `NotFound` (`__root.tsx:100`). A visitor who follows a stale
link sees the portal's status page, with no school theme, no site header and
no `site.css`. Add a themed not-found and error page inside `SiteShell`.
Size S.

---

## P1: soon

### 10. "Who can reach this record" is rebuilt in about 14 places

`app.visible_students` and `teachesClass`/`reachesClass` are shared, but the
`schoolWide` flag that opens the whole school is set locally with differing
capability sets:

- `classes:manage`: `core/coursework-access.ts:15`, `gradebook.ts:55`, `learning.ts:292`, `home.ts:79`, `standards.ts:529`
- `people:manage`: `people.ts:163`, `records.ts:55`, `identifiers.ts:61`, `files.ts:538`, `search.ts:76`
- `classes OR people`: `classes.ts:70`, `messages.ts:57`
- `people OR privacy`: `consents.ts:80`
- `people OR support`: `records.ts:369`
- `attendance OR classes`: `attendance.ts:135`
- `timetable OR classes`: `timetable.ts:67`

`core/access.ts`, `core/coursework-access.ts` and `core/learning-access.ts`
are three helpers rather than one model.

**Effect.** The same student is visible on one screen and "not found" on
another. A reviewer has no single place to check, and every new system copies
the nearest example.

**Consolidation.** Add `core/reach.ts` with named scopes
(`scopeFor(context, "teaching" | "people" | "attendance" | …)`), so a
difference is declared and tested. Size M.

### 11. Announcements and news posts are two parallel broadcast systems

The tables mirror each other column for column:

- `announcement_audiences` and `site_post_audiences` (`tables/announcements.ts:121`, `tables/site.ts:409`)
- `announcement_recipients` and `site_post_recipients` (`:169`, `:457`)
- `title_en`/`title_ar` and the translation-review columns on both

Each system has its own save, publish, review, archive, duplicate and seen
procedures (`systems/announcements.ts:151-573`, `systems/news.ts:236-883`),
its own stores, and an editor of about 700 to 900 lines. A post with
`visibility = 'school'` already is an announcement. The real differences are
acknowledgement (announcements) and slug, category, cover and the public
copy (posts). A stale comment at `tables/site.ts:250` mentions a post
`announcement_id` column that does not exist.

**Consolidation.** After finding 1, either:

- merge them into one broadcast host with a `kind` (L); or
- at minimum share recipients, read state, report and review in core (M).

### 12. The website builder has its own shell, history, player and picture model

Every other editor uses `DocumentPage`, `useAutosave` and `DocumentHistory`:
news, announcements, assignments, lessons, plans, events and consents. The
studio differs in four ways:

- **Shell.** It has its own Save button (`site/Studio.tsx:1110`, which `design-system.md` forbids) and its own save-state words (`Studio.tsx:1075-1080`).
- **History.** It has its own history UI and endpoint (`site/History.tsx`, `server/site.ts:58`, `api/systems/site.ts` ~`:735`, against `systems/documents.ts:84,103`). The version reasons are named differently ("Published" against "Shown to readers").
- **Video.** Site video uses the browser's native `<video controls>` (`site/render/parts.tsx:503-563`), against "our controls, never the browser's" (`design-system.md`, Media). Embeds already go through `ContentView`.
- **Pictures.** Site pictures carry `alt` and `focus` but no `decorative` or `credit` (`site-sections.ts:113-125`). Editor pictures carry `decorative` and `credit` but no focal point (`domain/content.ts:317-335`).

**Consolidation.**

- Keep the full-screen layout and the manual undo.
- Share the save indicator and `DocumentHistory`, extended to two languages (M).
- Render site media through the shared player (S).
- Use one picture shape, which Media also uses (done: `Picture` in `domain/commons.ts`).

### 13. Templates will split three ways when "saved sections" arrive

Today there are two template mechanisms:

- `document_templates` covers eight document kinds but not pages (`domain/templates.ts:8-16`).
- Site page templates and starters are code data (`domain/site-templates.ts:931-1100`).

The website roadmap's "saved sections, copied or kept in step"
(`docs/systems/website.md` Next #1) is what `document_templates` plus
`shared_blocks` already do, and `site_page` is already a shared-block host
(`stores/shared.ts:168`). Build saved sections as a template kind on that
system, not a third store. Media is likewise a files area
(`files/authorize.ts` `registerArea`), not a new store; see
[../systems/media.md](../systems/media.md).
Saved sections are a design decision only, now.

### 14. Questions and answers: two models exist, and application forms would make a third

**Mechanisms.**

- Website form questions are site-section items (`label`, `hint`, `required`, `options`; kinds `short | long | choice | date | number`) in `domain/site-sections.ts:619-633` and `domain/enquiries.ts:95-121`. Answers are a label snapshot in `site_enquiries.answers`.
- Editor question blocks have 23 kinds, one marker (`markResponse`, `domain/learning.ts:1738`) and their own ids and versions.
- `docs/plans/school-front-door.md` §6.4 wants application answers "stored against a versioned form", with documents as file blocks. That is closer to editor blocks than to section items, but the plan names neither.
- Consents will want questions too.

**Consolidation.** Before application forms are built, define one
form-question schema (field kinds, required, options, versioned form, answer
snapshot), shared by the website form, applications and consents. The website
enquiry form becomes its first consumer. Size M.

### 15. API conventions diverge

- **Optimistic concurrency is partial.**
  - These updates take no version: `stores/exams.ts:162` `updateExamSession`, `stores/persons.ts:204` `replaceContact` and `:236` `replaceAddress`, `stores/privacy.ts:451` `updateRequest` and `:639` `updateBreach`, plus templates, badges, cover, descriptors and invites. AGENTS.md says every update names its version.
  - A stale write is reported three ways: `conflict.version` (53 sites, plus DB `F0412`), `attendance.stale` and `site.stale` (`packages/database/src/errors.ts:70-97,214`). The web maps each separately (`apps/web/src/utils/error.ts:44,282,588`).
  - The name drifts: `expectedRevision` (`domain/access.ts:14,25`) and `revision` (`systems/site.ts` ~`:203`).
- **Pagination comes in five shapes.**
  - Fixed page sizes: access 25, notifications 30, enquiries 25.
  - `page` plus a 25/50 `pageSize`: people only (`domain/people.ts:73`).
  - A keyset `before` timestamp with a `rows.length === 100` heuristic: messages (`systems/messages.ts:183`).
  - A `rank:id` cursor: search.
  - Hard caps and no paging: the inbox (`limit 200`, `systems/messages.ts:112`), managed announcements (`stores/announcements.ts:238`) and news (`stores/news.ts:142`), follow-up and shared work. Item 201 silently disappears.
- **List filters bypass search normalisation.** The directories use `app.search` (trigram plus Arabic `normalize_name`). The inbox, announcement, news and enquiry filters use raw `ilike` (`stores/messages.ts:134,278-286`, `announcements.ts:235`, `news.ts:128,315`, `enquiries.ts:86`). "احمد" finds "أحمد" in the launcher but not in the inbox.
- **Error parameters travel two ways**: in the message string (`enrollment.registers_after:${date}`, `classes.ts:101`, parsed in web `error.ts:833`) or in `data`.

**Consolidation.**

- Require `expectedVersion` on every mutable aggregate, and send every stale write to `conflict.version` (M).
- One page schema and result shape in domain, plus keyset for feeds (M).
- Normalised filters (S-M).
- Parameters in `data` (S).

### 16. History tabs miss most events, and history UIs are built three ways

- `historyOf` filters on `subject_user_id` only (`stores/history.ts:38`). Coursework, exams, standards and learning set only `studentUserId`, the FERPA disclosure field (for example `coursework.ts:2652-2655`, `exams.ts:485-571`). So hand-ins, marks and declarations never reach a student's History tab.
- Foundation §6.14 promises before and after values on every create and update. Only about 25 of roughly 250 audit calls pass `change`.
- There are three history UIs:
  - `HistorySection` (`people/record-parts.tsx:142`)
  - `AccessChanges` (`admin/AccessRolesPanel.tsx:157`)
  - `ExamHistory` (`exams/ExamHistory.tsx:81`)

  Each has its own label map, and each falls back to the raw action code (`ACTION_LABEL[x]?.() ?? x`).

**Consolidation.**

- Match either subject column, or set `subjectUserId` wherever a row is about a student (S).
- One audit timeline component and one label registry (S-M).
- Emit `change` from stores over time (M).

### 17. Erasure is a hand-kept table list, and conversation tables are missing

`stores/erasure.ts` and the `redact`/`erase*` policies cover `discussion_posts`
and `peer_reviews`. They do not cover `messages`, `work_comment_replies`,
`site_enquiries`, `site_enquiry_entries`, `attendance_contacts`, or
`absence_reports` (its note and file). No gate checks that a table with a
person column has an erasure rule.

The Messages unification will put prospective families' words into
`messages`, which has no erasure path. Declare an erasure rule per table and
add a gate in `packages/database/src/gates.ts`. Size M. Do it before outside
participants ship.

### 18. Translation review has a core table nobody uses and four host copies

- `core.document_translations` (`tables/documents.ts:387`, foundation 6.12) is unused outside a test fixture.
- Review state is instead three columns (`translation_reviewed_at`, `_by`, `_source_digest`) on each host (`tables/announcements.ts:69`, `coursework.ts:200`, `documents.ts:560`, `site.ts:281`).
- Five systems each expose their own review procedure, about 12 `reviewTranslation` calls. History, by contrast, is one generic procedure (`systems/documents.ts:86`).
- Bilingual support is uneven:
  - Site pages have gaps (`website.ts:122`) but no review state.
  - Calendar events have bilingual titles but a description in one language.
  - Translated lessons and briefs keep a single `title` (`coursework.ts:142`, `learning.ts:254`).

**Consolidation.** Move review state onto the translation document (or use
`document_translations`), expose one `documents.reviewTranslation` behind
host access, and treat titles uniformly. Size M.

### 19. The school's identity is split between school and website settings

- **Two logos.**
  - `orgs.logo_file_id` (`admin/SchoolEditors.tsx`, used for print, `systems/school.ts:24-83`).
  - `site_settings.chrome.logoFileId` (`domain/site-theme.ts:642`, used by the website and the sign-in face, `core/portal-face.ts:140`).
- **Two default languages.** `orgs.default_locale`, versus `site_settings.primary_locale` plus `bilingual`.
- **A hand-typed website URL.** `orgs.website_url` (`SchoolEditors.tsx:319`), although the platform knows the school's hosts.

**Consolidation.** One logo and one default language on the org, with the
site holding only overrides, and the URL derived from hosts. Size S.

### 20. Page access is gated three ways

- the role prefix (`routes/_app/admin.tsx:5-15`);
- ad hoc `user.capabilities.includes(...)` in route loaders (about 25, for example `consent-form-editor.tsx:21-23`, `teach/assignment-editor.tsx:37-39`);
- nothing at all: `news-editor.tsx` and `event-editor.tsx`.

In the last case the options query raises FORBIDDEN (`api/systems/news.ts:262-263`)
outside `record()`, so a parent opening `/news-editor` sees the error boundary
instead of a redirect. Add one route helper that checks a capability and
redirects. Size S-M.

### 21. Plan modules and feature switches disagree

- `SCHOOL_MODULES` is `elearning, early_years, video, coding` (`domain/plans.ts:4-9`); `FEATURES` is `elearning, early_years` (`domain/features.ts:6`). Video and coding can be sold in a plan, but nothing gates them.
- `early_years` is enforced only in the web (`LessonEditor.tsx:179`, `LessonPlayer.tsx:808`, `Practice.tsx:43`).
- `elearning` is enforced in the API (`learning.ts:269`, `search.ts:272`).

**Consolidation.** One list, enforced in the API. Size S. Do it before
selling plans.

### 22. The forms convention is not followed

AGENTS.md says forms are `@tanstack/react-form` plus Valibot. Only three web
files use it (`SignInForm`, `ForgotPasswordForm`, `SubjectCatalogue`); the
rest are `useState` drafts with hand-written checks that repeat domain rules.
For example, `AssignmentEditor.tsx` `issuesOf` repeats
`validation.due_after_available`. Four editors (Year, Class, Assignment,
Staff) each keep a `FIELD_ERRORS` map from server code to field, beside the
central `utils/error.ts` and `utils/validation.ts`.

Decide whether to change the doc or the code. At minimum, use one
field-error mapper and the domain schemas on the client. Size M-L,
incremental.

### 23. The docs describe a different system

These statements mislead developers and agents:

- `docs/architecture.md` describes a control database and per-school databases. The code has cells, a directory and RLS (AGENTS.md, foundation §3).
- It says "There is no search index"; `search.entries` and `app.search` exist.
- It says pages are built from the "newsletter block document"; they are site sections.
- It says sessions last seven days; family sessions last 30 (`core/session.ts:91`).
- It describes a site file route, `/v1/sites/{slug}/files/{id}/content`, replaced by `file_publications`.
- It names a `notification_events` table that does not exist.
- **Resolved** (`2471a676`) for `architecture.md`: it was rewritten against the code and now describes the cell, the directory and row level security, the search index, site sections, the session lifetimes per context, `file_publications`, and `core.notifications` with its deliveries.
- Foundation 6.12 says hosts hold the foreign key to their document. Only `privacy_notices.document_id` does; the rest are looked up by host. Access is still safe through `files/authorize.ts`.

Rewrite `architecture.md` against the code. Size S.

---

## P2: later

- **Dead foundation schema.** `core.idempotency_keys` (`tables/records.ts:217`, foundation §7.9) and `core.activity_events` (`tables/partitioned.ts:68`, §6.15) are written by nothing; only erasure touches them. Wire them through `procedure.ts` before mobile write retries, or mark them deferred in the foundation doc.
- **Two answer ledgers.** `core.quiz_answers` (`tables/coursework.ts:925`) and `core.lesson_responses` (`tables/learning.ts:726`) store answers to the same blocks with different state names, though both are marked by `markResponse`. The split is defensible (attempts against a tries ledger). Share the marking-queue read and the state names.
- **One audience shape, two semantics.** Assignments snapshot their audience into `assignment_recipients` at save time. Modules resolve `module_audiences` live (`stores/learning.ts:290-335`). A student who joins a group later gets the module but not the assignment. Decide deliberately, then share one helper.
- **Two spam guards.** The product demo form (`api/systems/product.ts:7-24`) uses an in-process limit and no Turnstile; the enquiry form uses DB counts, an HMAC network key and Turnstile. Reuse the enquiry guard.
- **Small duplications.**
  - Core web helpers live in a feature folder: `coursework/useDocumentMedia` (14 outside importers) and `coursework/format` (22).
  - There are three `formatDate` copies (`utils/datetime.ts:74`, `family/format.ts:5`, `admin/format.ts`).
  - `routes/public-media/p.$token.$name.ts` and `routes/feeds/$school/$file.ts` re-implement `relayed()`.
  - The brand greens are literals (`globals.css:14`, `SchoolFace.tsx:33`, about 8 in `ProductSite.tsx`).
  - Person names travel as about 20 differently named field pairs with 86 inline `inLocale(xEn, xAr)` calls, and there is no shared person-reference type.
  - `core/` mixes cross-cutting code (procedure, purpose, audit) with feature helpers (`quiz.ts`, `module-copy.ts`, `homerooms.ts`), and `core/sessions.ts` (exam sessions) sits beside `core/session.ts` (auth).
  - `components/files/AreaFiles.tsx:235-237` keeps search, kinds and sort in `useState`, not the URL.
- **`apps/ops`** is a separate operator console. It is English only and uses raw `ui/table` with no mobile layout. Acceptable for an internal tool. If it grows, move the web component kit into a package so it can reuse it.

---

## Checked and found consistent

These suspicions did not hold up:

- **One web renderer.** `ContentView` serves readers, print (`PrintSheet.tsx:554`) and the site's rich fields. `contentHtml` (`domain/content-html.ts:307`) is a deliberate HTML-string renderer for cartridge export; its only risk is drift as blocks are added.
- **Site sections apart from prose documents** is deliberate and reasonable.
- **Three ways of fixing published words** (version snapshots, `frozen_at` for legal wording, `site_published_*` for the `site` role) each have a reason.
- **Notifications.** Every `notify` goes through `core/notify.ts`. There is one provider abstraction for email and SMS and one set of server templates. Mentions go through `publishTelling` everywhere.
- **Audit.** `writeAudit` and `audit()` are the only writers. Access history and person history both read `audit.log`; neither is a parallel table.
- **Audiences.** Announcements, news and calendar share `stores/audiences.ts`, `core/audiences.ts` and the web `AudienceList`.
- **Files.** There is one upload procedure (`systems/files.ts:86`), all `core.files` inserts are in `stores/files.ts`, one read-authorisation registry (`files/authorize.ts`, 25+ hosts), and publication goes through `file_publications`.
- **People.** There is one users, contact_points and relationships model; the front desk reads it (`stores/front-desk.ts:81-86`). Preferred language is stored once.
- **Web UI.** `IndexPage` (70 files), `DataTable` (45), `Pagination`, `EmptyState`, `RecordHeader`/`RecordTabs`, `ComboboxField` (17), `ConfirmDialog` (18), `StatusBadge` and `SettingsSection` are shared. No file uses `ui/table` or `useReactTable` directly. Raw grids (gradebook, week, calendar, year planner) are special-purpose and have captions or scroll regions.
- **Server bridge.** There is one pattern: `backend()`, `record()` and `relayTo`. `useQuery` is used mostly for lazy sheets; the one loading branch is `routes/_app/search.tsx:55-78`.
- **Quizzes.** One quiz engine (`core/quiz.ts`) serves briefs and lessons.
- **Validation.** Valibot only. Capability checks use `requireCapability`/`can` almost everywhere. There is one `featuresOf`.
- **Theming.** There are three systems (app tokens, `site-theme.ts` for the site and the sign-in accent, the product site), and that is acceptable apart from the brand-green literals.
- **Holidays and acknowledgements.** Holidays live only in school days. Announcement acknowledgements and consent decisions are distinct concepts.

## Suggested order

1. Read the published snapshot for announcements; normalise the time zone handling; add the guardian predicate function (all S).
2. Inside the Messages unification: settle the body model, logged contacts, templates, erasure rules and normalised enquiry contacts (findings 4, 6, 17).
3. The publication module with one `publishIssues` and go-live notifications (findings 1 and 2), then the teaching notifications (finding 3).
4. Delete the legacy stack and lesson fallbacks, port the ten e2e specs, and rewrite `architecture.md` (findings 7 and 23).
5. The reach model, API conventions and history (findings 10, 15 and 16), then the broadcast merge, builder shell, translation review and forms (findings 11, 12, 18 and 22).
