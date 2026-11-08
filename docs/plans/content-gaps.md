# Content, messages and timetable gaps

Everything still open in the editor and teaching content, messages, the
timetable and the school's files, gathered from `teaching-content.md`,
`open-work.md`, `timetable-and-attendance.md` and `video-and-coding.md`.
Each workstream below is built on its own and merged onto main; an item is
deleted from this file, and from the plan it came from, when it lands.

Rules for every workstream: AGENTS.md in full (one document model, logical
CSS, Base UI, i18n in both catalogues, RLS and tombstones on every new
table with an `erasure-rules.ts` entry, capabilities through
`requireCapability`/`can`, reach through `core/reach.ts`), design-system
components in `packages/ui` with named props, a spec and a
`docs/design-system.md` entry, and no feature lost on the way.

## A. Files and the media library

The library landed on 2026-11-07 (`docs/systems/media-library.md`). What a
school needs from it next, measured against WordPress, Payload, Sanity's
media plugin and Uppy:

1. **Uploading that survives a bad connection.** Several files at once by
   picking, dropping or pasting, each with its own progress, cancel and
   retry; large files sent in parts that resume after a dropped connection
   or a reload; a clear refusal by type and size before anything is sent.
2. **Safe files.** The type read from the bytes, not the name; SVG
   cleaned of scripts or refused; photo location and camera data removed;
   orientation fixed; a malware scan before a file is shown to anyone.
3. **Pictures that load fast.** Sizes made once on upload, modern formats,
   `srcset` in the reader and on the website, a placeholder while loading,
   a focal point that every crop and size respects.
4. **Finding things.** List and grid views, search by name, words and
   who a picture shows, filters by kind, date, uploader, folder and tag,
   sorting, bulk select with move, tag, delete and download as a zip.
5. **Looking after an item.** Replace the file and keep every place it is
   shown; rotate, flip and resize beside crop; previews of PDF pages,
   office files, audio and video; where it is used; unused items found.
6. **Every upload reaches the library.** Files added in the editor and the
   website builder are kept in the library's view of the school's media
   (unless private to a student's work), so a picture is uploaded once and
   reused.
7. **Bringing files in.** From a link, and from the free picture searches
   already offered to questions.
8. **The school's space.** Storage used by kind and by person, warnings
   before the limit, and duplicates found by their bytes.

The exact gaps come from an audit of the code; the workstream's first
commit records it here.

## B. Timetable

1. More than one bell schedule in a year, chosen per day.
2. Rotating day cycles (A/B weeks, six-day cycles), with closures moving
   the cycle or not as the school chooses.
3. More than one timetable in a year, each from a date.
4. One period with different times on different days.

Every week view, register, cover board, feed and print follows them.

## C. Messages and communication

1. The contract step of the conversation move: copy anything written to
   `site_enquiry_entries` and `attendance_contacts` after the move, then
   drop both.
2. Staff search over internal entries.
3. Presence: "someone is replying" in a conversation.
4. Merging two contacts who write from different addresses.
5. Accepting a held email into the conversation as the family's.
6. Bounce and complaint webhooks that mark a contact unreachable.
7. Announcements and news under one API namespace, so the web keeps one
   server bridge.

## D. Courses and live lessons

1. Routing a student across modules by a single lesson's score.
2. Live lessons pushed to students as the teacher moves, in place of
   asking now and then, and live mode for young lessons.

## E. Collaboration and reading

1. Discussions inside a module, and liking a post.
2. Peer review: its own review date and reminders, rating a review's
   helpfulness, reviews of quizzes and discussions, passage comments by
   reviewers.
3. A file copied for each student: who has uploaded their version, at a
   glance.
4. Reading aloud: words-correct-per-minute over the year, the student
   seeing the words to practise, reading aloud in quizzes and young
   lessons, prosody on a rubric. Speech recognition marking a first draft
   waits on decision 3.

## F. Early years

1. Line-art pictures for colouring, and a fill that spreads in slowly.
2. The progress profile's "exemption applies" code, the end-of-year
   return, a goals report for families, judging a goal from a quiz
   answer, and Development Matters as a ready-made framework.

## G. Interoperability

1. LTI Advantage: Names and Role Provisioning, Submission Review, picking
   several items at once, content embedded in the page, a tool's columns
   in the class gradebook, Dynamic Registration.
2. xAPI: statements sent to a school's own record store as they happen,
   assignment marks and outside tools' scores as statements, and cmi5 for
   packages launched from a store.

## H. Editor core

1. One question-and-answer model shared by quizzes, forms and admission
   forms. Built after D and E land, since both touch questions.
2. The picture, gallery, file and recording blocks' floating bars tested
   in the browser with real uploads.

## Waiting for the owner

Each has a recommendation; nothing is built until the owner chooses.

1. **Saved sections** in the website builder: a section kind in templates
   and shared blocks (recommended: one reuse system), or a section library
   of its own.
2. **Wikimedia Commons** in the picture search: recommended only behind a
   staff-only switch, since Commons has no safe search.
3. **A language model** for teachers (question suggestions, levelling,
   translating, marking reading aloud): recommended as an opt-in per
   school with a named provider and no student data sent.
4. **Hosted video** (Mux and similar) beside our pipeline, and whether
   streams count against storage.
5. **Office files edited in the browser** (Collabora or OnlyOffice, self
   hosted).
6. **Languages** beyond English and Arabic; **how far LTI and QTI go**;
   **generated narration** for young children.
7. **Messages:** whether staff without `people:read` count as staff.

## Outside the code

- Offer the Lexical fix upstream, then drop the patch (an outside pull
  request in the owner's name).
- Check Vimeo playback in a desktop browser, and Canvas import against a
  live Canvas site.
- Route inbound replies through `connect.` once a second cell exists.
