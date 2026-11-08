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

What exists (audit of 2026-11-08): uploads go through the API relay in 8 MB
parts with retry and progress, are type-checked by their bytes, scanned
by clamd when configured, and quarantined until clean; SVG is refused;
video gets an HLS ladder, poster and scrub thumbnails in apps/media;
quotas per school, class, module and person; library grid and list,
search by name and words, a kind filter, folders, Move in bulk, trash
with a 30-day sweep, crop as a new item, where used, who a picture shows;
private delivery by short-lived sealed links with ranges, public website
copies cached for a year. The gaps, split in two workstreams:

**A1. Uploading and the library** (web and API)

- Resume an upload after a reload (the server already keeps its parts);
  drag and drop and paste files into the library, the editor and the
  website's picture fields; cancel in the library too; one upload queue
  component in the design system.
- Filters by date, uploader and tag; tags; bulk delete, tag and download
  as a zip, in grid and list.
- A caption and a title apart from the file name; replace keeping every
  reference, with versions, as class and module files already have.
- Uploads made in documents seen from the library ("In documents") with
  one step to keep them; import from a link (fetched by the server, safe
  against requests to private addresses); the free picture search on the
  library page.
- Storage used by kind and by person on the library page; duplicates
  found by their sha256 at upload, sharing the bytes.
- Audit of rename, describe, move, add and crop.

**A2. Pictures and previews** (apps/media and readers)

- Sizes made once on upload, in WebP and AVIF beside the original;
  image dimensions stored; a placeholder (thumbhash) shown while loading;
  `srcset` in the reader, the editor, the website and library tiles.
- Location and camera data removed and orientation fixed on the server.
- A focal point on the library item that crops, sizes and the website
  respect; rotate, flip and resize beside crop.
- Audio duration and a waveform; PDF page thumbnails; office files
  previewed as PDF when a converter is configured.

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
   forms. Built after E lands, since it touches questions.
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
8. **Timetable:** setting a single date to run as another weekday or cycle
   day, and a bell schedule adding a period normal days do not have.

## Outside the code

- Offer the Lexical fix upstream, then drop the patch (an outside pull
  request in the owner's name).
- Check Vimeo playback in a desktop browser, and Canvas import against a
  live Canvas site.
- Route inbound replies through `connect.` once a second cell exists.
