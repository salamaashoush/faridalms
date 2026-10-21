# Teaching content: the editor, questions and courses

What the shared editor and the teaching tools built on it still lack, from
an audit of the code against the research on 2026-10-21. It governs the
order of work until every item is done or replaced. Video and coding keep
their own plan, [video-and-coding.md](video-and-coding.md); its open items
are listed here only so nothing is lost between the two.

Sources: [../research/course-design.md](../research/course-design.md),
[../research/interactive-coursework.md](../research/interactive-coursework.md),
[../research/editor-question-blocks.md](../research/editor-question-blocks.md),
[../research/early-years-activities.md](../research/early-years-activities.md),
[../research/early-years-ux.md](../research/early-years-ux.md),
[../design-system.md](../design-system.md) and the plans beside this one.

## Rules for every item

- What is part of the content is a block; what describes the document is a
  setting in the details panel (AGENTS.md, "One document model"). Block
  settings live in the one floating bar or, when they need room, a tab in
  the block's sheet. Nothing new sits under or beside a block.
- Every block works the same in lessons, assignments, quizzes and the other
  documents that offer it, prints through its paper form, and reaches
  students with no answers in it.
- Heavy runtimes (a maths field, a video API, a chart library) load only
  when a document holds such a block, and the reader never loads the
  editing runtime.
- Checked in the browser in English and Arabic, light and dark, desktop and
  phone, by keyboard as well as pointer, before an item counts as done.
- Each item lands as its own commit with the gate it can break.

## 1. Fixes

1. **The right answer from the keyboard.** A teacher marks a choice right
   only by clicking within 30px of the option's edge
   (`nodes/question.ts`), so a keyboard or screen-reader user cannot set
   the key. The question mode of the floating bar gains "Right answer" for
   the option holding the caret, and Parsons "Belongs nowhere" likewise.
   Done: the bar's Right answer (Doesn't belong in a code puzzle) and
   Mod+Enter share the click's toggle.
2. **Hotspot by keyboard.** A key press on the picture finds nothing
   (`young/YoungHotspot.tsx`), and regions are unnamed. Regions take a name
   from the teacher, and the student may pick from the named list as well as
   tap the picture (course-design, hotspot). Done: a picture's places are
   named and each is one to find or another place; a keyboard or screen
   reader chooses among them in reading order, which counts as a tap in the
   middle of the place, and publishing asks for every name.
3. **A question asked in a video can be answered without playing it.** It
   shows only a placeholder until the video reaches it (`LessonPlayer.tsx`),
   which shuts out a student who cannot hear or stream the video.
   Done: the placeholder offers Answer now, which opens the question in
   place and takes focus to it; once answered the video no longer stops.
4. **Subscript and superscript.** The reader draws them, the editor offers
   no way to make them. They join the floating bar's marks. Done: x² and x₂
   in the bar, Mod+. and Mod+, as Google Docs and Word take them.
5. **Publish checks.** Before publishing, the lesson list of issues also
   names pictures with no alternative text (and not marked decorative),
   headings that skip a level, and a continue gate nobody can pass.
   Done: one check (`content-checks.ts`) names undescribed pictures not
   marked decorative, a heading level skipped below the largest the
   document uses (readers number headings from there) and a vague link,
   and lessons, assignments, news, announcements, events and website
   bodies refuse to go out with any of them, in the browser and the API.
   Every check can be settled by its student (answered, revealed or handed
   in), so a gate always opens; what the check finds instead is a gate with
   nothing after it.
6. **Duplicate and Copy link** in a document page's menu, as the design
   system names them. Done: Copy link, for every document readers open at
   an address. Duplicate needs a copy operation per kind and lands with
   section 5, item 1.
7. **Mark one quiz question across the class**, as lessons already can,
   with one score and feedback for many answers. Done: a quiz's Answers tab
   and a module's share one board, question by question with the waiting
   answers first; a teacher chooses several (or all waiting) and gives them
   one mark and feedback, which the API stores in one transaction.
8. **Documents describe the code as it is.** `docs/content-editor.md`,
   `docs/systems/learning.md` and `documents-editor-modules.md` still
   describe lessons as a list of parts and media as waiting for storage. Done:
   each now describes the one document, its seventeen question kinds and
   its publishing checks, and points here for what is left.

## 2. Maths and science

1. **Maths in the text and as a block.** Inline maths and an equation
   block, typed in a maths field, stored as LaTeX, drawn as MathML, with
   Arabic notation direction as a school setting. Printing, paper forms and
   the reader draw it without the editing field. Done: a `math` node
   (LaTeX, in the line or on its own, right to left for Arabic notation)
   written with MathLive from the floating bar, typed as $…$ or $$…$$,
   Alt+= or the Equation block, and drawn as MathML by Temml in Latin
   Modern Math, each loaded only where a page needs it. Questions carry
   formulas in their text as \(…\), drawn in the player, paper and
   boards. Still to do: a school-wide default for Arabic notation, Arabic
   notation inside question text, and formulas read aloud as speech.
2. **Maths answers checked for equivalence**, a question kind that accepts
   `2(x+1)` for `2x+2`, with tolerance and units for numbers.
3. **Embeds for teaching**: GeoGebra, Desmos, PhET, Wikimedia Commons and
   Microsoft 365 files beside today's YouTube, Vimeo, Loom, Google and Canva.

## 3. Questions and assessment

1. **Question bank.** Questions saved with tags to a personal or school
   bank, a quiz drawing N at random from a tag, and each attempt pinned to
   the version it met.
2. **Time limits and access arrangements.** A quiz time limit, extra time
   and other arrangements per student set once (extra time, read aloud,
   fewer choices, default extension days), as exam boards require.
3. **Feedback timing** per check: at once, at the end, or when the teacher
   returns the work.
4. **Ask for a hint before answering**, not only after a wrong try.
5. **A continue gate** that waits for the block directly above it, or for
   nothing, as well as for everything above.
6. **Marking again when a key changes** after students answered: rescore
   or apply only to new answers, the teacher's choice at publish.
7. **Quiz reveals and practice**: "which were wrong, with feedback" as a
   reveal, and a practice mode with tries and hints.
8. **Overall feedback in bands** for a practice set's score.
9. **Suggested checks** made from a document, held as unreviewed until a
   teacher accepts each, so publishing waits for that review.
10. **More question kinds**: word bank, poll, highlight words, label an
    image, number line, crossword and word search.

## 4. Standards, skills and planning

1. **Objectives and standards per school**, as configuration (IB, Cambridge,
   Common Core and AERO, a school's own), tagged on questions and lessons.
2. **Skill progress**: "N of M skills secure" per student and per class,
   from the tagged checks.
3. **Unit planning** with the fields a school's framework asks for (IB unit
   planner, backward design), linked to the modules that teach it.

## 5. Reuse and course structure

1. **Copy a lesson to another module, and "Use again"** for an assignment
   from any class or year, offered as Duplicate in every document's menu.
2. **School library** with copy and edit, and a school's approval before a
   piece is shared there.
3. **Templates for every kind of document** (newsletter and news as well),
   and the built-in lessons "Read, check, reflect", "Watch and answer" and
   "Listen, choose, record".
4. **Preview a lesson** at phone and desktop width, in either language, and
   as a given group of students would meet it.
5. **Module audiences** by group or named students, not only whole classes.
6. **Paths**: release by score across modules, mastery paths and branching.
7. **Live lesson**: the teacher paces a lesson for the class, as Nearpod and
   Pear Deck do, with answers gathered on the teacher's screen.

## 6. Editor capabilities

1. **Layout blocks**: tabs, flip cards, labelled image, steps and timeline,
   gallery, chart, before and after.
2. **Writing tools**: text size, clear formatting, find and replace.
3. **Reusable blocks** kept once and shown in many documents.
4. **Footnotes and citations** for older students and universities.
5. **Mentions** of people and documents.
6. **Glossary terms** a reader can open in place.
7. **A document's own language**: lessons record the language they teach
   in, may carry a translation, and digits follow a school setting.
8. **Word import**: a `.docx` opens as a document, its pictures uploaded.

## 7. Video

1. **YouTube and Vimeo through our player.** They play in a bare frame
   (`media-view.tsx`), so they get no questions on the timeline, watch
   progress or chapters. Their player APIs drive our `VideoPlayer` instead,
   with nothing drawn over the frame.
2. **Audio description** as a track a teacher can add.
3. Hosted video adapters: an owner decision (section 11).

## 8. Early years

1. **Drawing over a picture and colouring**: the drawing answer has a
   background picture the teacher chooses.
2. **Children's reading type**: Andika for Latin and a naskh face for
   Arabic in young lessons, with the Arabic scale applied there.
3. **Teacher judgements per early-learning goal** (EYFS and the like),
   recorded from a child's work.

## 9. Coding

Tracked in [video-and-coding.md](video-and-coding.md): turtle, events and
music puzzle packs, functions in puzzles, micro:bit flashing over USB, and
Scratch Text to Speech, Translate and tutorials.

## 10. Online schools and universities

1. **Discussions**: a class or module discussion as a document kind, with
   replies, grading when asked and moderation.
2. **Peer review**: students review each other's work against a rubric,
   anonymously when the teacher chooses.
3. **Translate a brief in place** for a reader in another language.
4. **Reading fluency** assignments, teacher-marked first.
5. **A file block copied for each student** to work in.

## 11. Interoperability and owner decisions

1. **LTI 1.3** with Deep Linking and Assignment and Grade Services, so a
   school plugs in outside tools.
2. **QTI 3 and Common Cartridge** import and export, so content comes in
   from Moodle and Canvas and leaves again.
3. **Results shaped for xAPI** (score, duration, completion).

Waiting for the owner: help from a language model for teachers (drafting
questions, levelling a text, translating), teaching languages beyond
English and Arabic, how far LTI and QTI go, hosted video beside our own
pipeline, and generated narration audio for young children.

## Order of work

Section 1 in order, then 2, 3.1 to 3.2, 7.1, 4, 5, 6.1, 10.1, and the
rest of each section in turn.
