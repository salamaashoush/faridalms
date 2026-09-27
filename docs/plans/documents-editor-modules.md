# Plan: documents, the editor, and teaching modules

Written 2026-09-27 after the owner's review. It governs the order of work
until it is done or replaced. Research behind it:
[../design-system.md](../design-system.md) (Content editor),
[../content-editor.md](../content-editor.md),
[../research/course-design.md](../research/course-design.md), and the
interactive-modules report kept beside the session notes (summarised in
section 4).

## 1. Principles

1. **Everything people write is one document.** Announcements, newsletters,
   events, assignment briefs, quizzes, lessons and website posts are written
   in the shared editor as one full-width document, the way Notion works.
   Nothing wraps the editor in cards, and no separate list of "parts" or
   "sections" sits beside it.
2. **Interactive things are editor blocks.** Questions, continue gates,
   media, embeds and children's activities are nodes inserted from the slash
   menu or the block handle. Their settings open in a popover or the details
   panel. The server reads what it must (answer keys, gate rules) from the
   node's JSON and never ships keys to students.
3. **Writing uses DocumentPage.** Title at 30px over a 720px column, a 280px
   details panel for the item's attributes, drafts saving themselves, Publish
   or Schedule in the top bar, and edits after publishing held for Update,
   which asks whether to notify again (design system, Content editor).
4. **Reading looks like a page.** The published document sits in the same
   720px column under its title with no card around it. Supporting data
   (who it reached, history, marks) opens in a side panel from the header.
5. **Backend work stays.** Moving a surface to this pattern changes the
   screen, not the features the API already has, unless the content model
   itself was sections or parts (newsletters, lessons), where it becomes one
   document with a migration that keeps every existing item.

## 2. Surfaces, in order

1. **Announcements** (done 2026-09-27): DocumentPage editor with audiences,
   urgency, pinning, expiry, acknowledgement and scheduling in the details
   panel; reader as a page, delivery report in a side panel.
2. **Newsletters**: content becomes one document per language instead of a
   list of sections. The translation is edited beside the original, and a
   translation marked reviewed shows when the original changed after the
   review. The migration joins each edition's sections into one document,
   headings becoming level-two headings.
3. **Calendar events**: DocumentPage with the description as the document
   and dates, place, audiences, kind and public flag in the details panel;
   event page as a reader.
4. **Assignments**: DocumentPage with the brief as the document; due dates,
   audience, grading and hand-in settings in the details panel. A quiz's
   questions become question blocks in the same document instead of a
   separate question list.
5. **Lessons**: one document per lesson. The nine question kinds, continue
   gates and media become editor blocks with inline editing and a settings
   popover; the student player renders the same document with the blocks
   live. The migration turns each lesson's block list into one document,
   text blocks inlined and each question kept with its id, so answers
   already given still match.
6. **Readers and previews**: announcements, newsletters, events, assignment
   briefs and lesson previews all read as pages (principle 4), with teacher
   data in side panels.

Website pages stay a visual section builder: that is its own design
(docs/research/website-builder.md). Website posts move to DocumentPage.

## 3. The editor as the core

Done: tables worked in place (grips to drag or open row and column menus,
cell menu with colour and alignment, merge and split, resizing, stripes).

Next, in order:

1. **Block widget framework**: a decorator-node base with an inline editing
   view, a settings popover, keyboard entry and exit, copy and paste, and a
   read-only renderer, so each widget is written once and works in writing,
   reading and preview.
2. **Question and gate blocks** on that framework (section 2, item 5).
3. **Slash menu and block handle grouped by family** (text, lists, media,
   layout, questions, activities), searchable, the same in every surface,
   with surfaces able to leave families out (a newsletter has no questions).
4. **Media blocks**: captions editor with automatic right-to-left marks for
   Arabic, transcript for audio, alt text with a decorative flag, image
   sizing and alignment.
5. **Document history and templates**: version list with restore, saved
   templates per school ("Read, check, reflect", "Weekly newsletter").

## 4. Teaching modules

From the interactive-modules research (2026-09-27): for KG and early primary
the biggest gains need no new question kinds but pictures, audio and
tap-to-place; Scratch's editor became AGPL-3.0 on 2024-11-25, so block coding
starts with Blockly (Apache-2.0); code previews need their own domain; video
cost is bandwidth and data residency decides the vendor.

Each module is a per-school switch in `core.org_features`, and turning one
off keeps content and work, showing a placeholder where the activity was.

Early years is part of elearning. Matching, ordering and sorting get
pictures, alt text and recorded audio on their parts, and a picture-card
presentation where the child taps a card, then its place, with drag only as
an extra (WCAG 2.5.7). Targets are about 76px. Teachers record narration on
any block, because browser Arabic voices are missing or poor. Memory pairs
and counting are presentations of the same kinds.

Video adds a captions editor, chapters beside the player and watch progress
as a completion rule. Questions at timestamps sit beside the player, since
YouTube's terms forbid drawing over it. Cells that must keep data in-country
get our own ffmpeg-to-HLS pipeline, others Stream or Mux. Whisper drafts
captions for the teacher to approve.

Coding is a CodeMirror 6 HTML, CSS and JS playground whose preview runs on a
separate registrable domain in a sandboxed frame. Practice checks run in a
worker; browser checks can be faked, so graded checks run on the server
later. Python starts with Skulpt for turtle graphics, Pyodide after.

Blocks starts with Blockly puzzles (maze, sequences, loops) at levels a
teacher picks, with Arabic and right-to-left support. A Scratch-compatible
studio waits for a licence decision and would run in its own frame on the
preview domain.

## 5. Order of work

1. Newsletters, events, assignments to DocumentPage; readers as pages.
2. Widget framework, then lessons and quizzes as one document.
3. Grouped slash menu, media blocks, history and templates.
4. Early-years presentations and narration; module switches.
5. Video module; coding module; blocks module.

Each step lands in small commits with the gates the change can break, and
is checked in the browser in English and Arabic, desktop and phone.
