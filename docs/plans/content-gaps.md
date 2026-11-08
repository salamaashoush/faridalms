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

## H. Editor core

1. One question-and-answer model shared by quizzes, forms and admission
   forms. D and E have landed, so it can start.
2. The picture, gallery, file and recording blocks' floating bars tested
   in the browser with real uploads.

## Decided by the owner (2026-11-08)

To build:

1. **Saved sections** in the website builder join the one reuse system:
   templates and shared blocks learn a section kind.
2. **Wikimedia Commons** in the picture search, for staff only, behind a
   school setting; students never see it.
3. **A language model** for teachers, opt-in per school with a named
   provider: question suggestions, levelling a text and translating.
   Only what teachers wrote is sent, never student work.
4. **Video streams count against the school's storage**; our own pipeline
   stays the one video path (no hosted adapters).
5. **Timetable:** a single date can run as another weekday or cycle day,
   and a bell schedule can add a period normal days do not have.

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

- Media: the news cover picture is not drawn from its sizes yet; office
  previews need LibreOffice configured (`MEDIA_OFFICE_CONVERTER`) and are
  untested against it; a page published before its picture's sizes existed
  gets them at its next publication; an import from a link keeps the
  ordinary upload limit, so video cannot come in that way.
- Collaboration: a module discussion belongs to one class, not the module's
  every class; a quiz's peer reviewer reads typed answers only.
- Early years: Development Matters statements are in English only.
- Interoperability: sent statements keep their rows without bodies, so
  the queue table grows; a cmi5 package's satisfaction does not complete
  its lesson; every cmi5 launch is in Normal mode.

## Outside the code

- Offer the Lexical fix upstream, then drop the patch (an outside pull
  request in the owner's name).
- Check Vimeo playback in a desktop browser, and Canvas import against a
  live Canvas site.
- Route inbound replies through `connect.` once a second cell exists.
