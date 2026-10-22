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
9. **Typing after a block chosen whole.** With a widget block selected (a
   continue gate, the standards block, a picture), each letter typed landed
   at the very start of the document, in reverse, and inserting a widget
   left the block before it selected. Found while building 5.7. Done: a
   letter typed with a block chosen starts the line below it, and a widget
   inserted puts the caret on the line after it.
10. **The block menu's submenus.** Turn into, a callout's tone and a set's
    layout closed the whole menu when opened, by key or pointer, as Base UI
    took each for a sibling of a menu with no trigger. Done: the grip is
    the menu's trigger, so its submenus open within it.
11. **Text committed straight after Enter in a pair question.** In a
    matching or crossword question, Enter from the prompt puts the caret
    in the first pair's first side, yet text committed whole at once (as
    the browser automation's insertText does, and as an input method may)
    lands in the side after it; typed key by key it lands right. Found
    while building the crossword in 3.10.
    Done: the side was never at fault. Lexical moves the caret past an
    "acceptance boundary" after any text of more than one character put in
    under its control, to place it after a macOS text replacement, and it
    judged that by the last key pressed, however long ago. After Enter,
    words committed whole into an empty line (dictation, an emoji picker,
    a braille display, an input method that commits without keys) left the
    caret at the start of the block below, in any document. A patch to
    Lexical (`patches/`) leaves text put in where the caret already stood
    alone, and the learning test commits its typed question that way.
    Left: offer the fix to Lexical upstream, then drop the patch.

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
   boards. Then a school sets how mathematics in Arabic is written, left
   to right or in Arabic notation, and a formula written in right-to-left
   text starts that way; a question's formulas keep their notation in its
   text, isolated right to left (U+2067 to U+2069); and a lesson read
   aloud, or a choice's label, says each formula in words, in English
   after ClearSpeak and in vowelled Arabic after its school books.
   Left: Arabic letters and digits drawn for Latin ones in Arabic notation
   (x as س, as Edraak's MathJax extension does), and speech for matrices
   and other layouts beyond school algebra.
2. **Maths answers checked for equivalence**, a question kind that accepts
   `2(x+1)` for `2x+2`, with tolerance and units for numbers. Done: the Maths
   answer question; students write in MathLive's field and the server
   marks by sampling both expressions (or both sides of an equation) at
   the same values, as WeBWorK does, with a tolerance for decimals and
   Arabic letters and digits read. LaTeX it cannot read is compared as
   written. Then a teacher may ask for a form (factorised completely,
   expanded and simplified, a fraction in lowest terms, standard form),
   checked as STACK's FacForm and Expanded tests do, with polynomials
   worked exactly over the rationals; and answers with units, compared in
   SI base units (US customary and temperature scales too) or only in the
   key's. A student whose answer meant the key is told the form or units
   it lacked. Mixed numbers read as school writes them. Significant
   figures and decimal places are forms too, marked as STACK's NumSigFigs
   does, and a key its own form or units would refuse stops at publishing.
   Left: factorising beyond school algebra (quartics with no rational
   root, three letters).
3. **Embeds for teaching**: GeoGebra, Desmos, PhET, Wikimedia Commons and
   Microsoft 365 files beside today's YouTube, Vimeo, Loom, Google and Canva. Done:
   GeoGebra activities, Desmos graphs (calculator, geometry, 3D) and PhET
   simulations, from a share link or embed code, behind the same click to
   load. Then Microsoft 365: Word, Excel and PowerPoint for the web,
   Stream, personal OneDrive, Sway and Microsoft Forms, read from their
   embed code into a compact id (tenant, site and file) the frame's
   address is rebuilt from; and Wikimedia Commons: a Commons or Wikipedia
   file link becomes a picture copied into the school, described in the
   reader's language, its author, licence and source kept under it in
   reading, print and export.
   Left: Commons in the picture search beside ARASAAC and OpenMoji, and a
   credit a teacher can write for a picture of their own.

## 3. Questions and assessment

1. **Question bank.** Questions saved with tags to a personal or school
   bank, a quiz drawing N at random from a tag, and each attempt pinned to
   the version it met. Done: a question is kept from its bar, with
   tags, in the teacher's bank or the school's, its pictures and recordings
   copied with it, and asked again from the slash menu as a copy with ids
   of its own; the bank searches by words, tag and whose it is. Done: a
   quiz's "Draw from the bank" block asks so many questions with a tag,
   each worth the same, from the school's bank and its author's own. An
   attempt draws as it opens and keeps what it drew (`core.quiz_draws`),
   so it is answered, marked, shown and graded against those questions;
   a drawn question's id comes from the draw and the kept question, so
   marking by question gathers everyone who drew it. Assigning refuses a
   draw the bank cannot fill. Done: named copies of such a quiz draw
   each student's next attempt, as opening it would, and print their own
   questions after the quiz's opening words, each with its own answer key.
2. **Time limits and access arrangements.** A quiz time limit, extra time
   and other arrangements per student set once (extra time, read aloud,
   fewer choices, default extension days), as exam boards require. Done:
   a quiz's time limit. A timed attempt keeps its questions hidden until
   the student begins it, runs on a clock kept in `core.quiz_sittings`,
   refuses answers once the clock and thirty seconds of grace have run
   out, and is handed in as it stood by the page or, if nobody is there,
   by the API's worker. Done: access arrangements, kept on the student's
   record under Support by whoever holds `support:manage`: extra time
   (10%, 25%, 50%, double, or no clock at all), a computer reader for
   questions and choices in quizzes and lessons, one wrong choice fewer in
   quiz questions, and days added to due dates, which a teacher's own date
   for the student overrides and which move the student's close time too.
   Done: supervised rest breaks, an arrangement of their own: the student
   stops the clock, their questions hidden and nothing answered meanwhile,
   and takes the quiz up again with its end moved on by the break; the
   teacher sees each attempt's breaks, and a break left open an hour ends
   the sitting.
3. **Feedback timing** per check: at once, at the end, or when the teacher
   returns the work.
   Done: a question in a lesson for older students shows how it went at
   once, at the end, or when the teacher shows the class (`feedbackAt` on
   the question, chosen in its bar beside its tries). Until then the answer
   is kept and may be changed, as in a quiz, counting once and without the
   try penalty; nothing of how it went reaches the student, the lesson's
   score included. The end comes when the student, having answered every
   such question, asks to see how they did (`lesson_progress.results_at`);
   the teacher shows a class from the Questions tab (`lesson_releases`),
   which holds for those who answer later. Another go waits until the
   student has seen how this one went. The teacher reads such a question
   by each student's last answer, a wrong one as Not right. Code, young
   children's activities and lessons set out for young children always
   answer at once, and practice does too.
   Left: showing a class from the live lesson board, and showing one
   student rather than a class.
4. **Ask for a hint before answering**, not only after a wrong try.
   Done: a question in a lesson offers Get a hint while its hints last,
   before an answer, between tries, before a written answer is sent, and
   while feedback waits. Each one asked for is kept (`lesson_responses`
   state `hint`), costs what a wrong try would, and stops the question
   counting as right first time, so it comes back at the end where the
   lesson asks again. A wrong try still opens the next hint by itself.
   Hints stay in view while the student tries again.
   Left: hints asked for in a mixed practice set, and in a young child's
   lesson, whose help ladder is its own.
5. **A continue gate** that waits for the block directly above it, or for
   nothing, as well as for everything above.
   Done: a continue gate in the editor says what it waits for: everything
   above, the question or video just above it, or nothing but the student
   choosing to go on, which splits a reading into parts (`requires` on the
   gate). The student's page and the teacher's preview open it so. The
   preview also keeps answers whose feedback waits, asks for hints, and
   stands in for the teacher showing the class.
   Left: a gate that waits for a share of the questions above, or a score.
6. **Marking again when a key changes** after students answered: rescore
   or apply only to new answers, the teacher's choice at publish.
   Done: showing students a changed lesson first counts the answers its
   keys would mark differently; when there are any, the teacher chooses to
   mark them again or keep their marks. Marking again keeps each new mark
   beside the answer it marks (`lesson_responses` state `remarked`, the
   ledger staying append only) and works out each student's score, best
   score and standards evidence again; a question answered at once ends at
   its first right answer, so an earlier try that is now right stands.
   A finished lesson stays finished.
   Left: code exercises, which need a fresh run against changed tests.
7. **Quiz reveals and practice**: "which were wrong, with feedback" as a
   reveal, and a practice mode with tries and hints.
   Done: a quiz can show which answers were wrong with the feedback on each
   choice but not the answers. Only a quiz kept until returned opens its
   answers on return; before, a quiz marked whole at hand-in showed them
   whatever its teacher chose. A quiz can be for practice
   (`assignments.quiz_practice`): each question is checked as it is
   answered, with its tries, hints and Show answer, as in a lesson; its
   answer keeps the tries and hints (`quiz_answers.tries`, `hints`,
   `revealed`) and earns at hand-in what they left. Its results read as the
   student left each question. Questions its teacher marks, and code
   exercises, are kept for hand-in as in any quiz.
   Left: code exercises checked at once in a practice quiz.
8. **Overall feedback in bands** for a practice set's score.
   Done: a scored lesson and a quiz each take up to six messages by score,
   each for scores from its own up to the next (`lessons.feedback_bands`,
   `assignments.quiz_bands`), written in the lesson's details or the quiz
   settings. A student who finishes the lesson reads the message for
   their score under it, and a quiz attempt's results open with theirs;
   none shows while the score is kept back.
   Left: messages for a module's mixed practice set.
9. **Suggested checks** made from a document, held as unreviewed until a
   teacher accepts each, so publishing waits for that review.
   Done: Questions from bold words, in the editor's tools, makes each
   sentence holding a word the teacher set in bold into a gap to fill with
   it, after the block it came from, in English or Arabic, leaving out a
   word a question already asks. Each comes as suggested (`suggested` on
   the question), drawn with a dashed border and named so, until its
   teacher keeps it from its bar or deletes it; a lesson or assignment
   holding one is not shown to students.
   Left: suggestions written by a language model, waiting on the owner's
   decision on help from one (section 11).
10. **More question kinds**: word bank, poll, highlight words, label an
    image, number line, crossword and word search.
    Done: a word bank. A gap question can be filled from a bank
    (`bank` on gaps, its extra words that fit no gap), set from its bar;
    the student sees every answer and extra word shuffled in one bank,
    taps a word into the next blank or chooses it in each blank, and paper
    prints the bank above the text. A number line: a number question can
    be answered on a line from one number to another in steps (`line`
    on the question, set where its answer is), placed by dragging or the
    arrow keys over ticks labelled as space allows, and printed as a line
    to mark. Highlight words: a passage with each word to find written in
    [brackets], as a gap is; the student taps words in or out, each word
    numbered alike so none gives itself away, and each found earns its
    share while each picked wrongly takes one back. A poll: options with
    no right one, worth nothing and answered once, kept in the order
    written so a scale reads as one. Unless its teacher keeps the answers
    to themselves, a student who has voted sees how their class answered,
    each option's share of the first answers, asked again as others vote
    and never naming anyone; the teacher's question card shows who chose
    what. Practice reviews leave polls out. Label a picture: the teacher
    drags a box over each place on a picture and writes its label, with
    extra labels that fit no place; the student sees the places numbered
    and a bank of every label, presses a label onto the next empty place
    or chooses each place's label from its list, and each place labelled
    rightly earns its share. Paper prints the bank, the numbered picture
    and a line for each label.
    A crossword: the teacher writes each word with its clue and the grid
    lays itself out, the same way every time, every word crossing
    another; a word that will not fit is named so the teacher can change
    it. Students type into the squares, moving on along the word, with
    the arrow keys, and by choosing a clue; Arabic words read from the
    right across. Each word filled rightly earns its share, and paper
    prints the empty grid and its clues. A word search: the teacher lists
    the words, and they are hidden across, down and on the diagonal in a
    grid made from them and the question, the same for the whole class,
    the spare squares filled with the words' own letters. Students press
    a word's first letter and then its last, by finger or the keyboard; a
    stretch that spells a word stays marked, and each word found earns
    its share. Paper prints the grid and the list.
    Left: a poll's class results in a quiz, polls anonymous to the teacher
    too, dragging a label onto its place, dragging across a word search,
    and words hidden backwards for older students.

## 4. Standards, skills and planning

1. **Objectives and standards per school**, as configuration (IB, Cambridge,
   Common Core and AERO, a school's own), tagged on questions and lessons.
   Done: a school keeps frameworks of standards in a tree (`/standards`,
   capability `standards:manage`), writes its own or imports a CASE
   package, the 1EdTech format CASE editors and the CASE Network export.
   Importing again updates items in place by their CASE identifiers, so
   tags hold. A question carries up to six standards (`standards` on the
   node), tagged from the question bar's Standards panel, which searches
   every framework by code or words; its label counts them, and a question
   kept in the bank keeps them. Left: a lesson's own standards, which unit
   planning (4.3) brings, and naturally ordered codes ("RL.3.2" before
   "RL.3.10") in the picker.
2. **Skill progress**: "N of M skills secure" per student and per class,
   from the tagged checks. Done: each marked answer to a tagged question
   is kept as evidence (`core.standard_evidence`): a lesson's first answer
   or its teacher's mark, a quiz's answers whenever it is scored, so a
   re-mark replaces them. Mastery is a decaying average over sittings
   (65% on the latest; one sitting's answers averaged first): secure at
   80% on two sittings or more, developing from 50%. A class's Skills tab
   shows each student against each standard its own work assessed, then
   each standard across the class; a student record's Skills tab shows
   every framework. Erasing a student removes their evidence. Left: the
   student's and family's own view, evidence a teacher records without a
   question (an observation, a rubric criterion), and the sittings behind
   a mark.
3. **Unit planning** with the fields a school's framework asks for (IB unit
   planner, backward design), linked to the modules that teach it. Done: a
   module's Plan tab holds its unit plan, one document its teachers write
   together (host `module_plan`), started from a built-in planner (IB MYP,
   DP and PYP, Understanding by Design, a Cambridge scheme of work, a plain
   plan) or a school's own kept as a template. The goals sit in a Standards
   block, which lessons can use too as learning intentions, and the plan
   shows each standard with the questions in the module assessing it, the
   ones none does yet, and those assessed but not planned. A duplicated
   module keeps its plan. Left: a year's map of units per class, and the
   IB coordinator's view of key concepts and global contexts across units.

## 5. Reuse and course structure

1. **Copy a lesson to another module, and "Use again"** for an assignment
   from any class or year, offered as Duplicate in every document's menu.
   Done: a lesson's row menu and its editor's menu copy it to the end of
   any module the teacher writes, unshown, with its files copied
   (`learning.copyLessonTo`). "Use again" on an assignment's page, editor
   and row, or from the coursework page's menu with a search across every
   year (`coursework.reusable`), sets it as a new draft in a chosen class
   with its brief, files, marking and quiz settings and no dates
   (`coursework.reuse`).
2. **School library** with copy and edit, and a school's approval before a
   piece is shared there. Done: the school's templates are its library
   (`/library`): lessons, assignments and unit plans with a description and
   subject. A piece a teacher shares waits for a reviewer
   (`library:review`, held by the roles that run a school; a reviewer's own
   share needs no review), who shares it or sends it back with a note. Any
   author previews a shared piece and uses it, which opens a new lesson,
   assignment or module plan started from it, theirs to edit. Left: whole
   modules as one piece, and telling a teacher when their piece is
   reviewed.
3. **Templates for every kind of document** (newsletter and news as well),
   and the built-in lessons "Read, check, reflect", "Watch and answer" and
   "Listen, choose, record". Done: news posts and announcements join
   lessons, assignments and unit plans in the library, each offered on an
   empty document through one "Start from" menu, which also holds the
   built-in shapes: the lesson patterns (the three named here added), the
   unit planners and the newsletters, which news offered apart before.
   Left: events and consent forms.
4. **Preview a lesson** at phone and desktop width, in either language, and
   as a given group of students would meet it. Done: the teacher's preview
   chooses the screen (desktop, tablet, phone), the students' language and
   who (everyone, or a student with the computer reader). Another screen
   or language shows the lesson in a frame drawn by the server at that
   width and in that language (`/lesson-frame/$lessonId`, its language
   from `ui` through a route-only Paraglide strategy so the teacher's own
   stays); answering and the reader are tried in the teacher's own view.
   Left: answering inside the frame, which needs scripts the sandbox keeps
   out.
5. **Module audiences** by group or named students, not only whole classes.
   Done: each class a module is set for takes it whole or only for chosen
   groups and students (`module_classes.audience`, `module_audiences`).
   A group is read as it stands, so a student who joins it later meets the
   module. The students' list, opening a module, search, and the teacher's
   progress, answers, videos, live and marking views all follow the
   audience; the module's About shows who takes it. Erasing a student
   removes them from it.
6. **Paths**: release by score across modules, mastery paths and branching.
   Done: a module that opens after another can ask for a score there too,
   the mean of the student's best scores in its scored lessons
   (`learning_modules.prerequisite_score`); the student's list and module
   say what score opens it and where they stand. A lesson can be shown by
   score in an earlier scored lesson of its module, below a mark, at or
   above one, or between two (`lessons.condition_*`), as Canvas mastery
   paths route students: it is hidden until that lesson is finished, then
   on the student's path or off it, and lessons chain. Finished work stays
   on a path. A module's count and finish follow each student's path; the
   teacher's progress shows a lesson off a student's path, or waiting on a
   score, and the lessons table names each rule. A rule's lesson cannot be
   moved after it or removed, and a copied module keeps its rules.
   Left: a teacher releasing a lesson off a student's path by hand, and
   routing across modules by a single lesson's score.
7. **Live lesson**: the teacher paces a lesson for the class, as Nearpod and
   Pear Deck do, with answers gathered on the teacher's screen.
   Done: Teach live, on a lesson of an open module, leads one class
   through it part by part, the parts split at its Continue blocks
   (`paced_lessons`). Students in the lesson reach the parts the teacher
   has opened, whatever their order or path, and answer nothing while it
   is paused; the API refuses answers in a part not yet open. The
   teacher's screen moves between parts, pauses, shows who has come in and
   how each question of the open part was answered, with names that hide
   at a click. A class board for the room's screen shows the same without
   names, and the right answers once the teacher chooses, as Pear Deck
   keeps names to the teacher. Ending it leaves each part a student
   reached open. Students' players ask every 3 seconds while a lesson is
   led and every 15 otherwise.
   Left: a push channel in place of asking, young lessons, sharing one
   student's answer on the board, and a list of running live lessons on
   the module.

## 6. Editor capabilities

1. **Layout blocks**: tabs, flip cards, labelled image, steps and timeline,
   gallery, chart, before and after.
   Done so far: tabs, steps, a timeline and flip cards are one block, a
   set of titled parts (`panels`) shown four ways, switched from the block
   menu's Show as without losing a word. As written every part shows;
   Enter goes from a title to its body, from an empty last line to the
   next part, and out of the set from an empty last title. Read, tabs
   follow the WAI-ARIA tabs pattern, steps and events are ordered lists on
   a rail, and a card turns over on a button that never holds its back;
   paper shows every tab and both sides of each card.
   A picture takes numbered labels, dragged into place or moved by the
   arrow keys; its reader opens each from a button naming the place, what
   it says shown below the picture, and paper lists them all. A gallery
   holds up to 24 pictures in a grid, each opening large; a before and
   after lays two pictures under a range slider, side by side on paper.
   Every picture in them needs a description before the document goes
   out, and their files travel with the document.
   A chart is a small table its teacher fills in (up to 24 categories and
   four series) drawn as columns, lines or a pie, its colours a validated
   categorical order stepped for light and dark. A legend shows whenever
   more than one colour does; the keyboard moves one range control along
   the categories, the readout naming every series' value there as a hover
   does; the numbers sit in a table beneath, open on paper. A pie folds
   anything past six slices into Other.
   Left: a gallery's large view stepping to the next picture; pasting a
   chart's table from a spreadsheet.
2. **Writing tools**: text size, clear formatting, find and replace.
   Done: words take a size from small to huge in the selection bar, each a
   share of the text around it so large words in a young lesson's larger
   type are larger still; Clear formatting (Mod+\) takes marks, colour
   and size off the words chosen and leaves their links. Find and replace
   (Mod+F, by the key so an Arabic keyboard finds too) highlights every
   match in place without touching the text, finds a word set half in
   bold, and finds Arabic with or without its vowel marks and forms of
   alef; Enter steps through the matches, Replace all replaces from the
   last so none moves, and closing selects the match in hand.
   Left: matches across a link's edge, and whole words only.
3. **Reusable blocks** kept once and shown in many documents.
   Done: a block at the top of a lesson, quiz, brief or unit plan is kept
   from its menu as a shared block (`shared_blocks`, its content a hosted
   document), named and kept for its teacher alone or for every teacher at
   the school; the document then holds only which one. The slash menu
   shows one in another document. In the editor it stands framed and
   named, with Edit everywhere, which opens it to change where it is
   kept, and Make a copy here; readers see it as part of the page as it
   now is, students included, and a block taken out says so. Only its
   teacher changes it, and it holds no question, gate or draw, which
   belong to one document.
   Left: shared blocks in news, announcements and the school's pages; a
   shared block's history of changes; telling a teacher which documents
   show one before they change it.
4. **Footnotes and citations** for older students and universities.
   Done: a footnote is added at the caret from the selection bar or with
   Mod+Alt+F, a number in the line counted in reading order, its words
   written in the floating bar. It may cite a source instead or as well:
   a book, a journal article or a web page, its authors, title,
   publisher, journal or site, date, pages, volume, issue and link,
   set as it is typed in APA 7, MLA 9 or Chicago notes with the title in
   italics. Readers and paper see each number linked to its note in a
   list below the text, and back again; Arabic authors may be separated
   with Arabic commas.
   Left: a bibliography gathered from a document's sources; numbering
   that runs on across a lesson's parts, which now count each part's
   footnotes apart.
5. **Mentions** of people and documents.
   Done: typing @ in any document opens the school's search beside the
   caret: people, classes, modules, lessons and assignments, found as the
   global search finds them, with a line saying which class or module
   each is in. A chosen one stands in the text as one piece, named as it
   was when chosen; readers follow a class, module, lesson or assignment
   to its page, and a person reads as a name alone, since not everyone
   may open a profile.
   Left: telling a person they were mentioned; mentioning news and the
   school's pages; a name that follows its person when it changes.
6. **Glossary terms** a reader can open in place.
   Done: words chosen in the text are defined from the selection bar:
   what they mean in words the class knows, the word in another language
   (an Arabic gloss for an English-medium lesson, or the reverse), and a
   picture from the open picture sets or the teacher's own, as glosses
   joining a word to a picture help it stay learned. The words stay text,
   marked with a dotted line; a reader taps them, or rests the pointer on
   them, to open the meaning in place. Words defined once start defined
   the same wherever else they are chosen. A Glossary block lists every
   term the document defines, once each, in alphabetical order, as it is
   written, and in a lesson it gathers the terms of every part.
   Left: a module's glossary across its lessons; turning a glossary into
   flash cards or a matching question; reading a term aloud.
7. **A document's own language**: lessons record the language they teach
   in, may carry a translation, and digits follow a school setting.
   Done: a lesson's Reading settings say which language it is taught in
   (`lessons.language`), or leave it to be read from its words as before.
   A set language gives the editor and every part a student reads its
   direction from the start and marks the words with it, prompts
   included, for screen readers, spell checkers and hyphenation; its
   printed paper follows it. Without one, the editor now reads the
   document's own words, not the labels its blocks draw in the
   interface's language, which had turned an English lesson right to
   left in the Arabic interface.
   A lesson whose language is set may also be written in the other: it
   starts as a copy to rewrite, in a tab beside the original, with its
   own title, and is checked against the original as news translations
   are. The original decides what the lesson is: its parts, stops and
   every answer; the translation gives the words, found again by each
   block's and question's id. A part the translation lacks, or a question
   it changed beyond its words (another choice, gap answer or grid),
   reads as the original, and the teacher sees which. Students switch
   language above the lesson; the choice is kept with their progress, so
   hints, feedback and explanations follow it, and their answers stand
   in either language. A student reads in their own language by default.
   A school's settings choose its digits in Arabic: Western, as before,
   or Arabic-Indic (`orgs.digits`). Dates, times and numbers format in
   the school's digits, and every Arabic message writes its numbers in
   them, with the Arabic decimal and percent signs; words holding Latin
   letters or an address, such as a class code or an email, keep theirs.
   The choice travels with each page in a cookie, so pages drawn on the
   server already carry it.
   Left: a question's own labels in the lesson's language; a young
   lesson's switch, which follows the child's language for now;
   translations of quizzes and assignment briefs; the public website's
   digits, and numbers drawn inside documents, such as a chart's, which
   keep Western digits.
8. **Word import**: a `.docx` opens as a document, its pictures uploaded.
   Done: "Word document" in the insert and slash menus brings a `.docx`
   in where the caret is, read in the browser (mammoth, loaded only when
   asked): its headings, paragraphs and their bold and italics, lists,
   tables, links, pictures with their descriptions, stored with the
   school as it is read, and its footnotes and endnotes, which become the
   editor's own footnotes in the lines they belong to. Pictures a page
   cannot show, as Word's own drawings, are left out and counted.
   Left: Word equations as formulas; a picture's size in Word; reading
   a `.docx` dropped on the page, which is attached as a file as before.

## 7. Video

1. **YouTube and Vimeo through our player.** They play in a bare frame
   (`media-view.tsx`), so they get no questions on the timeline, watch
   progress or chapters. Their player APIs drive our `VideoPlayer` instead,
   with nothing drawn over the frame. Done: Video.js's YouTube and Vimeo
   providers drive our controls, which sit under the service's frame. A
   watched video is keyed by upload or by `youtube:` or `vimeo:` and id
   (`lesson_watches.video`), so timed questions, gates, the watch rule and
   the class's viewing curves follow; the editor bar asks a question at
   the moment, writes chapters and holds students to what they watched.
   Left: Vimeo playback could not be checked in the headless browser,
   which Vimeo refuses; check it in a desktop browser.
2. **Audio description** as a track a teacher can add.
   Done: a video's sheet, uploaded or YouTube and Vimeo alike, has an
   Audio description tab where the teacher writes, a time a line, what
   the picture shows that nobody says, adding a line where the video is
   paused. Students turn it on from the player; at each line the video
   waits while the browser's voice reads it, and shows it under the
   video, then plays on, as extended description does, so nothing said
   is talked over. A browser with no voice for the language shows the
   line for as long as it takes to read. Its words are searched with the
   document's.
   Left: a recorded description track, or a described version of the
   video, to choose instead; a student's choice of voice and speed.
3. Hosted video adapters: an owner decision (section 11).

## 8. Early years

1. **Drawing over a picture and colouring**: the drawing answer has a
   background picture the teacher chooses.
   Done: a question answered by drawing takes a picture from the bar, an
   open picture or the teacher's own, shown on the question as the class
   will see it. The child draws and colours over it: a paint bucket fills
   the area around a tap up to the picture's lines and their own strokes,
   the eraser takes away only their marks, and undo steps back through
   fills as through strokes. The teacher receives the picture as the
   child coloured it; on paper the picture prints in the drawing box to
   colour by hand.
   Left: line-art pictures found for colouring in the picture library;
   a fill that spreads in slowly, as some children's apps show it.
2. **Children's reading type**: Andika for Latin and a naskh face for
   Arabic in young lessons, with the Arabic scale applied there.
   Done: a young lesson is set in Andika, SIL's face for children
   learning to read (a single-storey a and g, an l told from an I), and
   its Arabic in Noto Naskh Arabic, the hand children are taught to
   write, at the larger Arabic size and looser lines young lessons
   already give it. The fonts load only when a young lesson shows.
   Left: the same type in a teacher's editor while a lesson is young.
3. **Teacher judgements per early-learning goal** (EYFS and the like),
   recorded from a child's work.
   Done: a young class has a Goals tab where its teacher takes a
   framework's goals one at a time and judges each child expected or
   emerging, as the EYFS profile asks: best fit from all they know of the
   child, never worked out from screen tasks, with an optional note. A
   judgement can also be made from an answer: marking a young class's
   answers to a question tagged with goals offers the same choice under
   the answer, and the judgement keeps a link to it. The child's record
   shows every goal of the framework with where they stand, to staff only.
   A school adds the seventeen EYFS goals under their seven areas in one
   step from Standards or the empty Goals tab; any other framework works
   the same way. Judgements are erased with the child.
   Left: the profile's "exemption applies" code and the end-of-year
   return; a report of the goals for families; judging from a quiz
   answer; Development Matters as a ready-made framework for younger
   children.

## 9. Coding

Tracked in [video-and-coding.md](video-and-coding.md): turtle, events and
music puzzle packs, functions in puzzles, micro:bit flashing over USB, and
Scratch Text to Speech, Translate and tutorials.

## 10. Online schools and universities

1. **Discussions**: a class or module discussion as a document kind, with
   replies, grading when asked and moderation.
   Done: a class discussion is a kind of coursework (`discussion_posts`),
   its brief the prompt. Each post is an editor document, pictures and
   files included, and a reply hangs under the post it answers. Students
   can be asked to post before they read their classmates, as a question
   and answer forum keeps a first answer independent, and to reply to a
   number of classmates; their page counts both. A student's first post
   hands the work in, so it is marked as any other, the marking page
   listing their posts with the words each reply answers. A teacher posts
   too, and hides a post from the class while its author still reads it.
   It closes with the hand-in rules, and erasure empties a student's posts
   in place.
   Left: a discussion in a module rather than a class, rating or liking
   posts, and telling students of new replies.
2. **Peer review**: students review each other's work against a rubric,
   anonymously when the teacher chooses.
   Done: work handed in on the page or as files can be set for peer
   review, one to five reviews each, names hidden on both sides by
   default (anonymous reviewers give more critical feedback, and students
   value it more: Panadero and Alqassab 2019). The teacher hands reviews
   out among the work in: a shuffled ring, so every student gives and
   receives the same number, and work handed in later joins with the
   least-loaded classmates. A reviewer reads the classmate's work, files
   included, and answers the rubric with "what works well" and "even
   better if", both asked for. The teacher reads every review with names,
   hides any, and releases them; only then do authors read theirs. Work
   under review can no longer be taken back, and erasure removes the
   reviews a student wrote and those of their work.
   Left: a review date of its own and reminders, rating a review's
   helpfulness, the teacher's marking page showing the reviews, reviews
   of quizzes and discussions, and passage comments by reviewers.
3. **Translate a brief in place** for a reader in another language.
   Done: an assignment's brief says the language it is written in and
   can carry a translation in the other, written beside it in the editor
   as a lesson's is: tabs for the two, its own title, the original's
   copy to rewrite, and a check that a change to the original undoes.
   Students open the brief in their own language when it has one and
   switch with a tab; the teacher reads both the same way. Using the work
   again copies the translation.
   Left: a quiz's questions in two languages (their answers come from
   the original, as a lesson's do), the breadcrumb following the
   language read, and a family reading the brief in theirs.
4. **Reading fluency** assignments, teacher-marked first.
   Done: a "Read aloud" question holds a passage the student reads aloud,
   set large above the recorder, their recording the answer. Marking it,
   the teacher listens and taps each word misread, left out or told, and
   the word the reading stopped at when it stopped short; the seconds
   start at the recording's length. The marking page works out words
   read, errors, accuracy and words correct per minute, the measure oral
   reading fluency is tracked by, and keeps the marking with the mark. The
   passage prints to read from. Any written question can be switched to
   reading aloud from its answer menu.
   Left: speech recognition marking a first draft for the teacher; each
   student's words-correct-per-minute over the year against norms; the
   student seeing the words to practise; reading aloud in quizzes and
   young lessons; prosody on a rubric.
5. **A file block copied for each student** to work in.
   Done: a file put in "Each student's copy" of a brief becomes each
   student's own the first time they save their answer, a copy in their
   keeping rather than the teacher's file, as Google Classroom's "make a
   copy for each student" does. Selected, a file block offers "Upload a
   new version", which puts the version worked on in its place, caption
   and display kept, so a student hands back their own worksheet and a
   teacher updates a file without moving it.
   Left: editing an office file in the browser rather than downloading
   it; seeing at a glance which students uploaded their version.

## 11. Interoperability and owner decisions

1. **LTI 1.3** with Deep Linking and Assignment and Grade Services, so a
   school plugs in outside tools.
   Done: Farida is an LTI 1.3 platform, as the owner decided. A school
   registers outside tools in Settings, each given a client id and
   deployment id, and finds there the issuer, key set, authorization and
   access token addresses a tool's maker needs. A teacher places an
   "Outside tool" block in a lesson or brief; whoever opens it launches
   the tool by LTI 1.3's third-party-initiated sign-in, signed with the
   school's own RSA key, as an instructor when they teach it and a
   learner when they study it, with names only when the school says.
   Selected, the block's bar offers the school's tools and "Choose
   content": Deep Linking opens the tool's own window, and the simulation
   or exercise picked there comes back to the link, checked against the
   tool's published keys, its title, address, parameters and grade
   column with it. Assignment and Grade Services let the tool report
   back: a token endpoint that takes the tool's signed assertion once,
   columns per course (a lesson's module, a brief's class) under an
   address only a launch reveals, scores ordered by the tool's own
   timestamps, and results scaled to the column. A link's picked content
   gets its column at its first launch. Teachers see each tool column in
   a module's progress beside its lessons, and a brief's grade sheet
   lists what its tools scored the student, with a button to take the
   score, scaled to the assignment's points, as the mark. A student's
   scores go when they are erased.
   Left: Names and Role Provisioning, so a tool can read a course's
   roster, and Submission Review, launching from a score to the work
   behind it. Picking several items at once, and content embedded in the
   page rather than opened in a window. A tool's columns in the class
   gradebook; Dynamic Registration, so a tool registers itself from one
   address; rotating the school's signing key on a schedule; a student
   seeing their tool scores in Farida.
2. **QTI 3 and Common Cartridge** import and export, so content comes in
   from Moodle and Canvas and leaves again.
   Done: a module exports its questions as a QTI 3 package, each kind QTI
   can hold an item that scores itself out of the question's points, a
   test for each lesson, the pictures beside them; the items validate
   against 1EdTech's schema. The editor's Insert menu reads a QTI 2 or 3
   package or item back into questions at the caret. A module also exports
   as a Common Cartridge 1.1, the one version both Moodle and Canvas
   import, checked with Moodle's own schemas: each lesson a page, its
   questions a quiz after it in CC's QTI profile, other kinds as essays
   with the key for the marker, its tool links and its files. The modules
   page imports a cartridge: pages, discussions and briefs read as a paste
   is, with their files stored; quizzes from CC's profile and Canvas's own
   question kinds; links, embeds and files as lessons. A lesson this
   school exported comes back whole from the copy kept beside it.
   Left: trying both directions against real Moodle and Canvas sites,
   which were not to hand; a CC 1.3 option carrying assignments with
   their due dates; Canvas-shaped QTI 1.2 for New Quizzes; bringing a
   cartridge's question banks into the question bank; Canvas's module
   prerequisites and completion rules; briefs coming in as assignments
   of a class rather than as lessons.
3. **Results shaped for xAPI** (score, duration, completion).
   Done: a module's progress view exports a class's results as Experience
   API 1.0.3 statements, as the owner chose, with no store of our own:
   each student's progress in each lesson (completed or attempted, its
   score out of a hundred, whether it passed, and the time from opening to
   finishing), each marked answer as an answered interaction of its kind
   with its share of the question's points, and each video watched with
   how much was seen. Students are named by their id under the school's
   address, statements by ids the same records always give, so a record
   store takes a second export without doubling it.
   Left: sending statements to a school's own record store as they
   happen; assignments' marks and outside tools' scores as statements;
   the cmi5 profile for packages launched from a store.

Waiting for the owner: help from a language model for teachers (drafting
questions, levelling a text, translating), teaching languages beyond
English and Arabic, how far LTI and QTI go, hosted video beside our own
pipeline, and generated narration audio for young children.

## Order of work

Section 1 in order, then 2, 3.1 to 3.2, 7.1, 4, 5, 6.1, 10.1, and the
rest of each section in turn.
