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
2. **Newsletters** (done 2026-09-27): one document per language instead of a
   list of sections, written in the same page on either language's tab, with
   the original a click away. A translation marked checked shows when the
   original changed after the check, and a changed translation needs checking
   again. The migration joined each edition's sections into one document,
   headings becoming level-two headings, and kept whole-edition checks.
3. **Calendar events** (done 2026-09-27): DocumentPage with the
   description as the document and dates, place, audiences, kind, public
   flag and telling in the details panel; an event reads in a side panel
   over the calendar instead of on its own page.
4. **Assignments** (editor done 2026-10-01): DocumentPage with the brief as
   the document; class, audience, dates, grading, hand-in and quiz settings in
   the details panel; a draft may change class until assigned; work already
   out holds every edit, a brief written together live included, until Update
   or Discard, because students read the brief as last published. A quiz's
   questions stay in today's question list under the brief until question
   blocks land (item 5), then move into the document. Next: readers as pages,
   then extend due date per student, hand in for a student, inline comments
   and a comment bank, voice feedback, and a starting document per student
   ([../research/interactive-coursework.md](../research/interactive-coursework.md)
   section 1.5).
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
Pictures, drawings, video and embeds share one width and alignment, set from
the floating bar that also formats text; the editor keeps exactly two bars,
the fixed toolbar (whose tools that do not fit move into a More menu) and that
floating bar. A document reads in its own direction, taken from its first
letter, and the server draws it in the editor's frame before the editor loads.
Document pages put the text first on phones, with the details in a sheet.

Next, in order:

1. **Question block framework**, as researched in
   [../research/editor-question-blocks.md](../research/editor-question-blocks.md):
   questions are ElementNode trees (prompt and parts as child nodes, so text
   merges and carets work in live editing) with their settings in NodeState,
   gaps are inline atomic nodes, and only text-free widgets such as the gate
   are decorator blocks. Settings appear in a question mode of the one
   floating bar. Ids stay UUIDs and survive paste; the server derives today's
   lesson blocks from the document, so marking is unchanged, and strips keys
   for students from an allowlist. The content schema stays permissive about
   question internals, with completeness checked at publish.
2. **Question and gate blocks** on that framework (section 2, item 5), each
   check gaining a note per wrong option, a help ladder (try again, hint,
   worked steps) recording first-try correctness, a feedback timing setting,
   and redemption of missed checks at the end
   ([../research/interactive-coursework.md](../research/interactive-coursework.md)
   section 3).
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
2. Question block framework, then lessons and quizzes as one document, with
   the teacher's who-chose-what and class progress views.
3. Grouped slash menu, media blocks, history and templates.
4. Early-years presentations and narration, Arabic rendering (joiner-aware
   gaps and tiles, a harakat setting, an Arabic type scale); module switches.
   Then mixed review, worked examples with fading, predict blocks and unit
   checkpoints.
5. Video module; coding module; blocks module.

Each step lands in small commits with the gates the change can break, and
is checked in the browser in English and Arabic, desktop and phone.
