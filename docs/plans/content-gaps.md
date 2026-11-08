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

## Editor

The question model is one (`docs/systems/questions.md`), the editor holds
its key-press budget on a 336-block lesson (`docs/content-editor.md`), and
the picture, file, video, audio and embed bars are exercised with real
uploads. Left:

1. Keys typed straight after inserting a formula are lost while its field
   loads.
2. Each gallery picture says who it shows, as a single picture does, so
   the consent check covers galleries (owner's decision).
3. The maths bar, question blocks' bars and recording capture exercised
   in a browser.

## Decided by the owner (2026-11-08)

Built: saved sections in the one reuse system, Commons for staff behind
a school setting, an opt-in language model for teachers (lessons and
briefs), video streams counted against storage, and timetable dates run
as another day with schedule-only periods.

Settled, nothing to build:

- Narration for young children uses the device's own voices only.
- No office editing in the browser; download, a new version and PDF
  previews stay.
- English and Arabic stay the interface languages.
- LTI and QTI stay at their current scope: LTI 1.3 Advantage as a
  platform, QTI 3 and Common Cartridge import and export.
- Messages: anyone signed in with a staff role counts as staff, whatever
  their capabilities.

## Left by the landed workstreams

- A shared section's earlier versions are kept, with no restore in the
  builder yet.
- Commons pictures are offered from the media library's search only: a
  question's picture keeps no credit.
- The language model helps in lessons and assignment briefs only, and
  hides students' full names, not a given name alone.

## Outside the code

- Firefox cannot start on the owner's Mac: it may not create
  `~/Library/Application Support/Firefox` ("Operation not permitted",
  likely a device-management or security rule). CI runs Firefox on Linux.

- Offer the Lexical fix upstream, then drop the patch (an outside pull
  request in the owner's name).
- Check Vimeo playback in a desktop browser, and Canvas import against a
  live Canvas site.
- Route inbound replies through `connect.` once a second cell exists.
