# Course design research: interactive lessons, activities and coursework

Researched 2026-09-27. Part 1 is the current Farida implementation, read from
source. Parts 2 to 4 rest on vendor documentation, help centres, specifications
and open-source code; every claim carries its URL. Where a vendor page was
login-gated or only a search excerpt was available, that is said.

## 1. What exists today

Sources: `packages/domain/src/learning.ts`, `apps/api/src/systems/learning.ts`,
`packages/database/src/tables/learning.ts`, `packages/domain/src/content.ts`,
`packages/domain/src/embed.ts`, `packages/editor/src/blocks.ts`,
`apps/web/src/components/learning/*.tsx`, `packages/database/src/tables/coursework.ts`,
`packages/domain/src/coursework.ts`, `docs/product-spec.md`, `docs/rewrite-tracker.md`
(learning modules checkpoint).

### 1.1 Structure a teacher can build

- E-learning is a per-school feature switch (`elearning`); every learning call
  answers not found while it is off.
- Module: title (200), summary (1000), 1 to 20 classes the author teaches this
  year, one optional prerequisite module, a `sequential` flag (default on),
  state draft / published / archived with an optional `publishAt` for
  scheduling. Publishing needs at least one lesson and no lesson with empty
  plain text. Unpublishing keeps student progress. Duplicate makes a draft copy
  for other classes (the prerequisite is dropped). Audience is whole classes
  only; there is no group or student audience as assignments have.
- Lesson: title, position, one completion rule and up to 40 blocks in a lesson
  document (`version: 1`). Completion rules: `view` (opening it), `mark`
  (student presses Mark complete), `quiz` (every quiz block answered), `score`
  (every quiz answered and the lesson score at least `passScore` 1 to 100),
  `reflection` (every reflection prompt has text).
- Lesson content is authored once, in one language; no side-by-side English and
  Arabic like the website, and no translation record (only newsletters and the
  site use document translations). Rendering uses `dir="auto"`.

### 1.2 Lesson block types

1. `content`: a shared Lexical document. Accepted nodes: paragraph, headings
   H1 to H3 in the inserter, bullet, numbered and check lists, quote, code,
   callout (neutral, info, success, warning, danger), toggle (collapsible),
   divider, table, columns (1:1, 1:2, 2:1, 1:1:1, 1:1:1:1), image (file, alt,
   caption, size), file attachment, audio/video `media` node with a captions
   file, embed and diagram (an Excalidraw scene rendered to PNG for readers).
   Embeds are an allowlist of nine providers: YouTube (nocookie), Vimeo (dnt),
   Loom, Google Drive, Docs, Slides, Sheets, Forms and Canva.
2. `media`: an older lesson-level media block (file, name, MIME type, caption,
   WebVTT captions required for audio and video, captions language en/ar, 200 MB
   limit). The lesson editor can no longer add one; it only shows its name.
   Media is now inserted inside a content block.
3. `quiz`: one question per block. Plain-text question (1000), 2 to 6
   plain-text options, one or more correct options (single or multiple
   response, told to the student as "choose all that apply") and one
   explanation shown after answering whether right or wrong. No images or media
   in options, no per-option feedback, no hints, no points weighting.
4. `reflection`: a prompt; the student saves free text up to 4000 characters.
   Not graded, no teacher feedback, no attachments, audio or drawing.

Not built although the product spec promises them: audio narration per block,
a K-2 quiz mode, and hints, attempt limits and review for older students.

### 1.3 What students, families and teachers see

- Student: open modules for current classes with a progress bar; a module
  locked behind its prerequisite; lessons shown done / open / locked (locked
  after the first unfinished lesson when sequential). The player shows
  "Lesson n of N", renders the blocks, and ends with Previous / Next (Next
  hidden while the next lesson is locked) and Mark complete when the rule is
  `mark`.
- Quiz behaviour: Check reveals right or "Not quite", highlights the key and
  shows the explanation. After a wrong answer "Try again" clears the choice,
  unlimited times, with the key already seen, so the lesson score (share of
  quiz blocks whose latest answer is right) can always reach 100. The key never
  leaves the server before the first answer.
- Reading position: the API stores the last block id (`learning.position`) and
  the web server function `saveReadingPosition` exists, but no component calls
  it, so lessons do not reopen where the student stopped.
- Family: read-only view of a child's modules and progress.
- Teacher: preview with the key shown; a class progress matrix (students by
  lessons) with completion time, whether a teacher override did it, score and
  attempts; override complete and undo, audited.

### 1.4 Data today

- `lesson_progress`: one row per lesson and student with `answers` jsonb
  (`{quiz: {blockId: {optionIds, correct, tries}}, reflections: {blockId:
  {text}}}`, 64 KB cap), `score` 0 to 100, `attempts` (incremented on every quiz
  answer in the lesson), `position`, `completed_at` and `completed_by`
  (student or teacher).
- The lesson document lives in `core.documents` keyed by host and is
  overwritten in place with a version counter; no revision history. Answers are
  keyed by block id only, so editing a quiz's options or key after students
  answered leaves stale `correct` flags, deleting a block orphans its answers,
  and the stored score is only recomputed on the student's next answer.
- Lesson scores do not reach the gradebook; its only line item is the
  assignment (section 1.5).

### 1.5 Assignments (separate from modules)

- One assignment kind for one class: rich-text brief, up to 10 resource files,
  audience class or selected groups and students (with a per-recipient due
  column), available from / due / closes, late policy accept / deduct (percent)
  / refuse, a 2-minute grace, hand-in format online (rich text) / files (1 to 20) / both / none, resubmission on or off, points or ungraded, optional rubric
  (criteria by levels with points), grading period.
- Handing in freezes the draft into an attempt; the teacher's assessment is a
  draft until released. Learner states are computed, not stored.
- An assignment cannot sit inside a module, and a lesson cannot contain an
  assignment. There are no question banks, no quiz assignment type, no
  templates, no reusable blocks.

## 2. What the field does (primary sources)

Fetch limits: community.articulate.com and helpx.adobe.com refused the fetcher,
so Rise facts come from help.rise.com and articulatesupport.com, and Captivate
facts from search excerpts. Toddle's help centre is login-gated. Canvas KB
numbers below are `https://community.instructure.com/en/kb/articles/<n>`.

### 2.1 Lesson authoring with blocks

- **Articulate Rise 360**, the reference block authoring tool. Three lesson
  kinds: blank lessons built by stacking blocks, lesson templates, and graded
  quiz lessons (https://help.rise.com/en/articles/2059261-choose-lesson-and-block-types).
  Block families: text (paragraph, heading, two columns, table), statement (four
  styles plus a note), quote (styles plus a carousel), list (numbered, bulleted,
  checkbox), image (with text or alone), gallery (carousel or grid), multimedia
  (audio, video, embed, attachment, code snippet), interactive (accordion, tabs,
  labeled graphic, process, scenario, sorting activity, flashcard grid or stack,
  button or button stack, timeline, Storyline block), knowledge check (multiple
  choice, multiple response, fill in the blank, matching; ungraded), chart (bar,
  line, pie), divider (divider, numbered divider, spacer, continue)
  (same URL; https://www.articulatesupport.com/article/Rise-360-Choose-Lesson-and-Block-Types).
  Sorting activity allows up to four categories
  (https://help.rise.com/en/articles/2447593-how-to-use-sorting-activity-blocks).
- **Rise gating inside a lesson**: the continue block offers "None", "Complete
  Block Directly Above" and "Complete All Blocks Above"; content below stays
  hidden until met. Requirable: carousel, checkbox list, audio, video,
  accordion, tabs, labeled graphic, process, sorting, flashcards, knowledge
  check, scenario; buttons and attachments cannot be required
  (https://www.articulatesupport.com/article/Rise-360-How-to-Use-Continue-Blocks).
  Course navigation is free by default; "Restrict Navigation" forces order and
  removes learner "mark complete"
  (https://help.rise.com/en/articles/2066420-control-course-navigation).
- **Rise quiz lessons**: passing score (default 80 percent), require passing to
  continue, retries (default unlimited), randomise question order, shuffle
  answers, and a reveal policy of "Reveal All Answers", "Hide All Answers" or
  "Show Incorrect Answers with Feedback"
  (https://help.rise.com/en/articles/3120680-rise-quiz-settings).
- **Rise authoring UX**: a shortcut bar of common blocks, an "All Blocks"
  library, a (+) between any two blocks, a side panel for content
  (https://help.rise.com/en/articles/2059261-choose-lesson-and-block-types);
  block templates, duplicate block, copy lesson to another course
  (https://help.rise.com/en/articles/4168977-7-ways-to-reuse-your-content);
  preview at desktop, tablet and phone sizes
  (https://help.rise.com/en/articles/2071145-preview-a-course). Forum titles
  show the pain: continue blocks "not working", retrying only wrong answers,
  moving blocks between lessons
  (https://community.articulate.com/discussions/share-ideas/copy-or-move-blocks-from-one-lesson-to-another-in-rise/1222355).
  Its canvas stays left to right; output flips only through a paid localisation
  add-on (search excerpt, https://community.articulate.com/discussions/discuss/seeking-right-to-left-rtl-support-in-rise-360-for-arabic-training-courses/1213654).
- **iSpring** has 14 question types (adding sequence, hotspot, drag the words,
  drop-down, numeric, Likert, essay to the usual) and 14 interaction templates
  (tabs, FAQ, glossary, timeline, steps, process, labeled graphic and others)
  (https://ispringhelpdocs.com/qm11/question-types-62856521.html,
  https://www.ispringsolutions.com/blog/interactions-in-ispring-suite-9).
  **Captivate 13** sets each question slide Graded or Knowledge Check and draws
  from question pools (https://helpx.adobe.com/captivate/help/add-question-pools-and-random-question-slides.html).
  **Genially** sells interactive images, escape rooms and "1400+
  classroom-ready games" (https://genially.com/solutions/for-schools/).
- **Canvas Pages** are rich-content documents with "Add to student to-do",
  scheduled publish, Assign To and change notification (KB 660947). **Moodle
  Page** is one screen of content; **Book** is chapters with two levels and
  print (https://docs.moodle.org/501/en/Book_resource); **Moodle Lesson**
  mixes content pages whose buttons jump anywhere with question pages,
  clusters, max tries, custom scoring and multiple attempts, and its own docs
  warn that "This page" jumps trap students and max tries override review
  (https://docs.moodle.org/501/en/Lesson_settings, https://docs.moodle.org/501/en/Using_Lesson).
- **Google Classroom** has no lesson pages: classwork is flat, topic then post
  (https://support.google.com/edu/classroom/answer/9093681). Practice sets
  (paid editions) offer short answer, paragraph, single and multi-select, math
  keyboard, text or YouTube hints per question, "Allow equivalent answers",
  instant Check and unlimited Try again, and ink "Show your work"
  (https://support.google.com/edu/classroom/answer/13455315,
  https://support.google.com/edu/classroom/answer/13457451). Read Along
  supports Arabic and English with accuracy, speed and comprehension reports
  (https://support.google.com/edu/classroom/answer/14174515).

### 2.2 Interactive content types (H5P) and what is actually used

- H5P.com share of all content, December 2022: Course Presentation 13.84
  percent, Interactive Video 12.31, Question Set 9.82, Drag and Drop 5.94, Drag
  the Words 5.80, Column 5.19, Multiple Choice 5.10, Fill in the Blanks 4.69,
  Interactive Book 4.63, Image Hotspots 4.14, Accordion 4.00, Dialog Cards 2.88,
  Documentation Tool 1.80, Memory Game 1.71, True/False 1.53, Flashcards 1.36,
  Single Choice Set 1.23, Branching Scenario 1.00. Counting nested use, Text,
  Video and Image lead and Multiple Choice (8.61) is the most embedded question
  (https://h5p.org/blog/status-update-february-2023).
- The live H5P Hub ranks its 53 types with Interactive Video, Course
  Presentation, Multiple Choice, Quiz and Fill in the Blanks on top
  (https://api.h5p.org/v1/content-types/, POST). No K-12-segmented H5P data
  exists; 94 pre-service teachers rated it at least as effective as other tools
  (97 percent), authoring time being the barrier
  (https://files.eric.ed.gov/fulltext/EJ1481635.pdf).
- Not scored, per each library's code: Image Hotspots, Accordion, Dialog Cards,
  Timeline, Juxtaposition, Virtual Tour, Audio Recorder, Chart, Personality
  Quiz. Question types and containers are scored, Branching Scenario only
  optionally (https://github.com/h5p/).
- Shared question base (H5P.Question): fixed sections media, introduction,
  content, explanation, feedback, score bar, buttons, and an aria-live read
  region; Check, Show solution and Retry buttons each toggled by
  `enableCheckButton`, `enableSolutionsButton`, `enableRetry`; banded overall
  feedback `[{from, to, feedback}]`; "+1/-1" score points per answer; the score
  announced as "You got :num out of :total points"
  (https://github.com/h5p/h5p-question, scripts/question.js). Containers push
  one `override` block into every child and sum `getScore()`/`getMaxScore()`
  (https://github.com/h5p/h5p-question-set/blob/master/semantics.json). Contract:
  `getAnswerGiven, getScore, getMaxScore, showSolutions, resetTask,
  getXAPIData, getCurrentState` (https://h5p.org/documentation/developers/contracts).
- Concrete behaviour worth copying: Fill in the Blanks `*a/b:tip*`
  alternatives, `caseSensitive` (default true), `acceptSpellingErrors` (one
  Damerau-Levenshtein edit for 3 to 9 characters, two above 9)
  (https://github.com/h5p/h5p-blanks, js/cloze.js); Drag and Drop
  `applyPenalties` on by default because without it "learners can drop
  everything everywhere" (https://github.com/h5p/h5p-drag-question/blob/master/semantics.json);
  Sort the Paragraphs scores by positions or transitions and adds move buttons
  for keyboard users (https://github.com/otacke/h5p-sort-paragraphs); Multiple
  Choice has chosen and not-chosen feedback per option and `passPercentage`
  (https://github.com/h5p/h5p-multi-choice/blob/master/semantics.json).
- Editing content resets learners' saved state: saving H5P content calls
  `resetContentUserData`, and the player shows "This content has changed since
  you last used it. You'll be starting over."
  (https://github.com/h5p/h5p-php-library, h5p.classes.php around line 2302 and
  js/h5p.js line 120, commit cb64a1f).
- **H5P has no RTL layout**: zero `rtl` occurrences in core or the key
  libraries at commit cb64a1f; the core RTL pull request closed unmerged in 2016
  (https://github.com/h5p/h5p-php-library/pull/23); the editor RTL issue open
  since 2016 (https://github.com/h5p/h5p-editor-php-library/issues/14); an open
  2025 bug has Multiple Choice checkboxes on the left in an Arabic Interactive
  Book (https://github.com/h5p/h5p-interactive-book/issues/208). Positional
  content (Drag and Drop, Interactive Video, Course Presentation store x/y
  percent) does not mirror.
- H5P's own WCAG 2.2 AA list (2026-04-29): Accordion, Dialog Cards, Fill in
  the Blanks, Image Hotspots, Interactive Video and Summary support it; Drag and
  Drop and Course Presentation are partial (2.5.8); Find the Hotspot,
  Juxtaposition, Image Sequencing and Timeline are "Not recommended"
  (https://help.h5p.com/hc/en-us/articles/7505649072797-Content-types-recommendations).

### 2.3 Interactive video and live slides

- **Edpuzzle**: question types multiple choice (auto-graded), open-ended
  (manual, or an Autograde comparing with the teacher's ideal answer),
  notes, polls, reflection
  (https://support.edpuzzle.com/hc/en-us/articles/360007501671-What-types-of-questions-can-I-add,
  https://support.edpuzzle.com/hc/en-us/articles/14355700455693); several
  questions per timestamp; "Prevent Skipping" lets students resume "but no
  further" and pauses on tab switch
  (https://support.edpuzzle.com/hc/en-us/articles/360007745911); with N
  attempts only the final attempt counts, a retry jumps to wrong answers, and
  correct options show only on the last attempt
  (https://support.edpuzzle.com/hc/en-us/articles/12883625699981).
- **PlayPosit**: ten interaction types including fill in the blank with
  partial credit, reflective pause, poll and discussion; jumps per answer;
  retries up to 10; "only show feedback on last attempt"
  (https://knowledge.playposit.com/article/213-building-a-bulb-in-playposit-3-0).
- **H5P Interactive Video** data: interactions at `{from, to}` seconds with
  `pause`, `displayType` button or poster, position, an embedded question, and
  `adaptivity` (seek to a time on right or wrong, `requireCompletion`);
  `preventSkippingMode` none, forward or both, with `maxTimeReached` kept in
  saved state; each answer stamped with its video time
  (https://github.com/h5p/h5p-interactive-video/blob/master/semantics.json).
- **Nearpod** (Draw It, Open-Ended, Quiz, Poll, Collaborate Board, Fill in the
  Blanks, Matching Pairs, Drag and Drop, Time to Climb) runs live or
  student-paced (https://nearpod.com/formative-assessment,
  https://nearpod.com/frequently-asked-questions). **Pear Deck** (Draggable,
  Drawing, Text, Number, Choice, Poll) syncs an anonymous projector view with a
  named teacher dashboard and can lock answers on a countdown
  (https://docs.goguardian.com/products/pear-deck/use-interactive-question-types,
  https://docs.goguardian.com/products/pear-deck/use-projector-view-and-teacher-dashboard).

### 2.4 Assessment items, marking, attempts and banks

- **Canvas New Quizzes**: 12 types (categorization, essay, file upload, fill in
  the blank, formula, hot spot, matching, multiple answer, multiple choice,
  numeric, ordering, true/false) plus stimulus (KB 661046). All but essay and
  file upload auto-grade (KB 661073). Fill in the blank per blank: open entry
  (contains, "close enough" Levenshtein, exact, accepted list), dropdown, word
  bank (KB 661054). Partial credit: multiple answer "partial credit with
  penalty" (points divided by correct count, added per right choice, deducted
  per wrong, floor 0) or exact (KB 661058); matching and categorization
  partial; ordering all-or-nothing (KB 661061). Feedback: general, correct,
  incorrect, and per answer on choice types (KB 661066). Hot Spot "is currently
  not accessible to keyboard-only and screen reader users" (KB 664245).
- Canvas attempts: unlimited by default, score to keep highest, average,
  latest or first, cooling period, "build on last attempt" (redo only wrong
  items) (KB 661070); per-student accommodations for extra time, time
  multiplier, unlimited time (KB 661093); results visibility toggles for
  responses, correctness, correct answer, points and feedback, each timed after
  every attempt or only the last, with dates (KB 661071). Item banks: once an
  item has answers "you can only edit a copy" (KB 661081); random selection of
  N from a bank (KB 661082); regrade awards for the new key only or both
  (KB 661074).
- **Moodle**: 17 core question types (calculated family, drag and drop into
  text, markers, onto image, description, essay, matching, Cloze, multiple
  choice, ordering, short answer, numerical, random short-answer matching,
  select missing words, true/false) (https://docs.moodle.org/501/en/Question_types).
  Short answer matches only with a `*` wildcard and a case flag. Ordering has
  nine grading strategies from all-or-nothing to longest ordered subset
  (https://github.com/moodle/moodle/blob/main/public/question/type/ordering/question.php).
  Essay always uses manual grading.
- Moodle behaviours: deferred feedback, immediate feedback (one response),
  interactive with multiple tries (Check, hint, Try again; tries = hints + 1;
  score = fraction minus penalty per extra try), adaptive with or without
  penalty, certainty-based marking, manual grading
  (https://docs.moodle.org/501/en/Question_behaviours,
  https://github.com/moodle/moodle/blob/main/public/question/behaviour/interactive/behaviour.php).
  Review options are a matrix of eight items (attempt, whether correct, marks,
  specific feedback, general feedback, right answer, overall feedback) by four
  times (during, immediately after, later while open, after close)
  (https://docs.moodle.org/501/en/Quiz_settings).
- Moodle versions every question save; a quiz slot uses "Always latest" or a
  pinned version (https://docs.moodle.org/501/en/Question_bank). Each question
  attempt is pinned to a version with its shuffle order and holds an
  append-only log of steps (state, fraction, user, response); a manual grade is
  a new step; regrade replays the steps; the attempt total stays null while any
  question needs grading
  (https://github.com/moodle/moodle/blob/main/public/question/engine/questionattempt.php,
  https://github.com/moodle/moodle/blob/main/public/question/engine/questionusage.php).
- **QTI 3.0** (1EdTech, final 2022; implementation guide v2.0, 2024) defines
  21 interactions: choice, text entry, extended text, gap match, hotspot, hot
  text, inline choice, match, order, graphic order, associate, graphic
  associate, graphic gap match, media, position object, select point, slider,
  upload, drawing, custom (PCI), end attempt
  (https://www.imsglobal.org/spec/qti/v3p0/impl, section 3.2). A response
  declaration has a cardinality (single, multiple, ordered, record) and a base
  type (identifier, string, integer, float, boolean, point, pair, directedPair,
  duration, file, uri); scoring templates are match_correct, map_response and
  map_response_point with mappings for partial credit; it also has feedback,
  adaptive items, randomised clones, shared stimulus, accessibility catalogs,
  and `dir` inherited as in HTML. Appendix C gives a JSON form for response
  values such as `{"list":{"identifier":["A","C"]}}`.
- **Auto versus teacher marking** agrees across products: choice, matching,
  ordering, gap and inline choice, numeric and hotspot are automatic; short
  text is automatic only against an accepted-answer list (Canvas adds
  Levenshtein, Moodle a wildcard, Forms several answers; none does regex in
  core); essay, file upload, drawing and audio are always manual (KB 661073;
  https://support.google.com/docs/answer/7032287). Google Forms releases scores
  "Immediately after each submission" or "Later, after manual review"
  (same URL). LTI AGS encodes the state as `gradingProgress` FullyGraded,
  Pending, PendingManual (https://www.imsglobal.org/spec/lti-ags/v2p0/).

### 2.5 Younger learners, practice loops and live games

- **Seesaw** response tools: draw, photo, video, voice, upload, note, label,
  draw-and-record, and "Frames" marking where a child answers; up to twenty
  voice recordings per page; teacher-set 15, 45 or 90 second recording caps
  (https://help.seesaw.me/hc/en-us/articles/12088644884493-How-to-use-Frames-in-Seesaw-Creative-Tools,
  https://help.seesaw.me/hc/en-us/articles/360057131152-How-to-add-audio-recordings-to-Activities,
  https://help.seesaw.me/hc/en-us/articles/23426369018253-Seesaw-Product-Updates-2024).
  Auto-checked multiple choice, true/false, short answer (with "Flexible
  Spelling") and reading fluency; "Practice Mode" gives hints and unlimited
  tries, "Assessment Mode" shows results only after teacher approval
  (https://help.seesaw.me/hc/en-us/articles/18087810807181-Creating-and-adding-Formative-Assessment-questions).
  Its AI translation leaves audio and video untranslated
  (https://help.seesaw.me/hc/en-us/articles/42824752296973-How-to-translate-Activities-and-Lessons).
- **Book Creator**: text, image, audio, video, pen, embeds, Read to Me with word
  highlighting and a right-to-left page turn
  (https://intercom.help/bookcreator/en/articles/2398649-read-to-me-in-book-creator).
- **Khan Academy**: Attempted under 70 percent, Familiar 70 to 99, Proficient
  100; Mastered only from mixed-skill assessments, where a miss drops a level
  (https://support.khanacademy.org/hc/en-us/articles/5548760867853--How-do-Khan-Academy-s-Mastery-levels-work);
  one wrong answer can be redeemed by a bonus question
  (https://support.khanacademy.org/hc/en-us/articles/35916723756685-How-does-a-student-earn-Proficient-on-a-practice-exercise);
  skipping to the worked solution marks the question wrong
  (https://support.khanacademy.org/hc/en-us/articles/26236154715789-Update-Navigate-Questions-at-Your-Own-Pace-with-the-Skip-Button).
- **Brilliant** pretests and gives "instant, custom feedback based on your
  answer" (https://brilliant.org/about/). **Duolingo** lessons "take just a few
  minutes" (https://blog.duolingo.com/duolingo-teaching-method); streak features
  moved day-7 retention +1.7 percent and daily actives +0.38 percent
  (https://blog.duolingo.com/how-duolingo-streak-builds-habit); completed lessons
  were "the strongest predictor of learning gains"
  (https://blog.duolingo.com/time-spent-learning-well/).
- **Kahoot**: quiz, true/false, type answer (up to 4 accepted answers, not
  case-sensitive), puzzle, slider, pin answer, poll, word cloud, open-ended
  (https://support.kahoot.com/hc/en-us/articles/115002308428-Kahoot-question-types);
  an Accuracy mode without the speed factor
  (https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work);
  colours paired with shapes (https://support.kahoot.com/hc/en-us/articles/115004537447-Does-Kahoot-meet-accessibility-standards);
  RTL for players but not for the web creator
  (https://support.kahoot.com/hc/en-us/articles/360015801953-What-languages-does-Kahoot-support).
- **Wayground (formerly Quizizz)** adds multi-select partial credit, math
  response with equivalence, graphing, match, hot text, reorder, categorize,
  labelling, hotspot, audio/video response and draw
  (https://help.wayground.com/support/solutions/articles/158000411419-question-types-explained);
  Practice, Accuracy (redo misses to a target) and Testing homework modes
  (https://help.wayground.com/support/solutions/articles/158000404919-async-homework-session-modes-on-wayground);
  per-student extra time and read aloud
  (https://help.wayground.com/support/solutions/articles/158000404955-accommodations-available-on-wayground);
  keyboard drag and drop by numbered tiles
  (https://help.wayground.com/support/solutions/articles/158000433934-keyboard-only-navigation-how-students-complete-activities-without-a-mouse).
- **Evidence**: tested material outlasts restudied material at 2 days and a
  week (https://doi.org/10.1111/j.1467-9280.2006.01693.x); low-stakes quizzes
  raised grade-6 exam scores (https://doi.org/10.1037/a0026252); 57 percent of
  50 classroom experiments showed medium or large benefits
  (https://doi.org/10.1007/s10648-021-09595-9); recall beats recognition
  (https://doi.org/10.1037/a0037559). The IES guide rates "Use quizzes to
  re-expose students to key content" Strong, spacing and worked examples
  Moderate, and asks for corrective feedback "whenever a substantial number of
  errors are expected" (https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/20072004.pdf).
  Feedback averages d = 0.48, scaling with its information content
  (https://doi.org/10.3389/fpsyg.2019.03087). Gamification shows g = .49 on
  cognitive outcomes (https://doi.org/10.1007/s10648-019-09498-w), yet a badge
  and leaderboard course lost motivation over a semester
  (https://doi.org/10.1016/j.compedu.2014.08.019) and contingent rewards
  lowered children's intrinsic motivation (https://doi.org/10.1037/0033-2909.125.6.627).

### 2.6 Course structure, pacing, differentiation and reuse

- **Canvas modules** hold pages, assignments, quizzes, discussions, files,
  headers, links and tools, with "Complete all" or "Complete one", optional
  sequential order, and per item view, mark as done, contribute, submit or
  score at least N. Documented traps: score-at-least waits for a posted grade
  and late deductions can block it; editing fulfilled requirements asks to
  re-lock
  (https://community.instructure.com/t5/Instructor-Guide/How-do-I-add-requirements-to-a-module/ta-p/1131).
- **Mastery Paths**: a graded source item splits students into three score
  ranges (default 70, 40, 0 percent), each releasing up to three item sets,
  "And" or "Or"; manual grading stalls sequential modules; regrades can move a
  student to another path (KB 660914, KB 660916).
- **Moodle completion and restrictions**: manual, or view, receive a grade,
  passing grade, submit, "passing grade or all available attempts completed",
  lesson "require end reached" (https://docs.moodle.org/501/en/Activity_completion_settings);
  restrict access by date, grade range, completion, group, grouping, profile
  field and nested AND/OR sets, each shown greyed with the reason or hidden
  (https://docs.moodle.org/501/en/Restrict_access_settings).
- **Differentiation**: Canvas assigns modules and items to sections, students
  or private differentiation tags; unassigned gradebook cells are greyed and
  excluded; "Unassigning a graded student deletes the grade and submission"
  (KB 660898, KB 660688). Moodle uses groupings with restrictions
  (https://docs.moodle.org/501/en/Groupings); Classroom assigns to student
  groups (https://support.google.com/edu/classroom/answer/15263790).
- **Reuse**: Canvas copies a module, item or page to another course or teacher
  (KB 660892), copies whole courses with a date shift (KB 660726), syncs
  Blueprints with per-attribute locks (KB 660770) and shares through Commons
  with approved resources and update notices (KB 664537, KB 664549);
  Classroom has Reuse post and Share classwork
  (https://support.google.com/edu/classroom/answer/6272593). MoodleNet was
  "discontinued on 20 April 2026" (https://docs.moodle.org/501/en/MoodleNet).
- **Unit planning**: Understanding by Design has three stages, desired results
  (goals, understandings, essential questions, knowledge and skills), evidence
  (performance tasks with criteria, other evidence) and learning plan, and
  advises against "isolated lesson planning separate from unit planning"
  (https://files.ascd.org/staticfiles/ascd/pdf/siteASCD/publications/UbD_WhitePaper0312.pdf).
  Toddle, ManageBac and Atlas carry unit planners linked to standards and
  lessons (https://www.toddleapp.com/ubd/, https://www.managebac.com/multicurricula/feature/curriculum,
  https://www.onatlas.com/atlas-features); Canvas, Moodle and Classroom do not.

### 2.7 Standards: what matters for import and export

- **LTI 1.3 with Deep Linking 2.0 and AGS 2.0** is how schools plug in
  publisher tools and pick their content into a module, with scores returned as
  `scoreGiven`, `activityProgress` and `gradingProgress`
  (https://www.imsglobal.org/spec/lti-dl/v2p0/, https://www.imsglobal.org/spec/lti-ags/v2p0/).
  Thin Common Cartridge, a manifest of LTI links, is described by Canvas as
  "most commonly used by K12 institutions" (KB 660736); Common Cartridge 1.4
  adds a K-12 profile and accepts QTI 3.0 (https://www.1edtech.org/standards/cc).
- **QTI**: Canvas New Quizzes imports only QTI 1.2 and 2.x (KB 661079); Moodle
  core has no general QTI importer (https://docs.moodle.org/501/en/Import_questions).
  QTI 3.0 is the best vocabulary for our own response model even if we never
  import it.
- **xAPI and cmi5**: an xAPI result carries score (scaled, raw, min, max),
  success, completion, response and duration
  (https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Data.md); cmi5 adds LMS
  launch and `moveOn` (Passed, Completed, CompletedAndPassed, CompletedOrPassed,
  NotApplicable) with a `masteryScore`
  (https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md). H5P
  emits xAPI in the browser with "no built-in LRS" (https://h5p.org/documentation/x-api).
- **SCORM**: 1.2 keeps a 4096-character suspend_data; 2004 4th edition 64000
  (https://scorm.com/scorm-explained/technical-scorm/run-time/run-time-reference/).
  Moodle says "SCORM 2004 is not supported" (https://docs.moodle.org/501/en/SCORM_FAQ);
  Canvas needs an account-level SCORM app (KB 660683); Google Classroom add-on
  docs mention neither SCORM nor xAPI (https://developers.google.com/workspace/classroom/add-ons).
  None of the three treats SCORM as a first-class K-12 path.

### 2.8 Accessibility and RTL in interactive widgets

- WCAG 2.2 (https://www.w3.org/TR/WCAG22/): **2.5.7 Dragging Movements (AA)**
  requires a single-pointer alternative to every drag; keyboard support alone
  does not satisfy it; technique G219 reveals arrows or a drop-position menu on
  tap (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html,
  https://www.w3.org/WAI/WCAG22/Techniques/general/G219). **2.1.1 Keyboard (A)**
  exempts only path-dependent input such as free drawing. **2.5.8 Target Size
  (AA)** 24 by 24 CSS px. **1.2.1 (A)** audio-only needs a text alternative
  unless the audio itself is an alternative for on-screen text; **1.2.2 (A)**
  captions; **1.2.3 (A)** and **1.2.5 (AA)** audio description. **2.2.1 Timing
  Adjustable (A)** requires turn off, adjust to at least 10 times, or extend.
  **4.1.3 Status Messages (AA)** for feedback without moving focus (role=status;
  assertive alerts only for time-critical content). **1.4.1 Use of Color (A)**:
  right and wrong need an icon and text. **2.4.11 Focus Not Obscured (AA)**:
  sticky Check bars and toasts must not cover focus.
- There is no ARIA drag-and-drop pattern (aria-grabbed and aria-dropeffect are
  deprecated, https://www.w3.org/TR/wai-aria-1.2/); the reference for ordering
  is the APG rearrangeable listbox with Up/Down buttons, Alt+Arrow shortcuts and
  a live-region confirmation
  (https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/).
- Direction: use `dir` and logical properties, never CSS for base direction,
  `dir="auto"` on inputs (https://www.w3.org/International/questions/qa-html-dir);
  isolate inserted text with FSI/PDI in plain-text contexts such as WebVTT and
  option strings (https://www.w3.org/International/questions/qa-bidi-unicode-controls).
  Mirror back/next, timelines, progress bars and sliders; do not mirror media
  scrubbers, clocks, charts or numbers
  (https://m2.material.io/design/usability/bidirectionality.html).
- Measured in Chrome 153 by the research agent: under `dir="rtl"`, "3 - 2 = 1"
  renders as "1=2-3" and "(1, 2)" as "(2 ,1)" while "x + 2 = 5" is unchanged, so
  expressions need explicit isolation; a native RTL range input puts the
  minimum on the right and ArrowRight decreases, contradicting the APG slider's
  "Right Arrow: Increase"; `<input type="number">` silently drops Arabic-Indic
  digits "١٢٣" (value empty, no validity error). `Intl.NumberFormat("ar")` gives
  Latin digits but ar-EG and ar-SA give Arabic-Indic, so digits must be pinned
  per school with `-u-nu-latn` or `-u-nu-arab`.
- Arabic math direction differs by region: Moroccan left to right, Maghreb and
  Machrek right to left with mirrored symbols (https://www.w3.org/TR/arabic-math/).
- Arabic answer matching: Lucene's ArabicNormalizer folds آ أ إ to ا, ة to ه,
  ى to ي, and removes tatweel and harakat; DecimalDigitFilter folds all
  decimal digits to ASCII
  (https://lucene.apache.org/core/9_12_0/analysis/common/org/apache/lucene/analysis/ar/ArabicNormalizer.html).
  NFC and NFKC fold none of these. Moodle short answer does only NFC, trim, case
  and `*` (https://github.com/moodle/moodle/blob/main/public/question/type/shortanswer/question.php).
- Where RTL broke elsewhere: Moodle drag and drop onto image flipped in RTL
  (https://tracker.moodle.org/browse/MDL-69414), mixed tokens reorder inside a
  drag chip, "1'b1" shown as "b1'1" (https://tracker.moodle.org/browse/MDL-79854,
  open), numeric answer fields must stay left-aligned
  (https://tracker.moodle.org/browse/MDL-36033).

## 3. Synthesis for Farida

### 3.1 What the evidence settles

1. A lesson is a vertical stack of typed blocks. Rise, iSpring Page, Seesaw
   lessons and H5P Interactive Book all converge on it, and teachers already
   know the vocabulary (2.1, 2.2). Farida's lesson document already has this
   shape; the work is widening the block set, not changing the model.
2. Two assessment tiers, never mixed: ungraded knowledge checks with instant
   feedback and retries (Rise knowledge checks, Classroom practice sets, Seesaw
   Practice Mode), and graded quizzes with attempts, score to keep and a reveal
   policy (Rise quiz lessons, Canvas New Quizzes, Moodle). Retrieval practice
   with corrective feedback is the best-evidenced thing a lesson can do (IES
   "Strong"; Agarwal 2021).
3. Usage concentrates on a few types: presentation containers and video lead,
   then question sets, multiple choice, the two gap-fills and drag and drop
   (H5P 2022 shares and Hub rank). A tier-1 catalogue of about fifteen block
   types covers the bulk of real use.
4. Recall beats recognition (Rowland 2014), so typed answers matter, which in
   an Arabic school makes Arabic answer normalisation and Arabic-Indic digit
   handling core requirements (2.8), not polish. No surveyed product documents
   Arabic folding (Moodle and Kahoot fold only case, spaces or punctuation).
5. Every drag interaction needs a tap-to-select, tap-to-place path and buttons
   (WCAG 2.5.7); keyboard support alone fails. The spatial types (hotspot,
   label an image, juxtaposition, timeline) are where accessibility fails in
   Canvas and H5P, so they belong in later tiers with list alternatives.
6. None of the surveyed tools handles RTL fully. Rise authors left to right; H5P has no RTL at all;
   Kahoot's creator cannot be RTL; Moodle's drag and drop flipped. Direction as a
   first-class property of every block is a real differentiator for Farida.
7. Gating must depend only on what the student can finish alone. Every gating
   complaint found (Canvas score-at-least waiting for a posted grade, Rise
   continue blocks, Moodle Lesson jumps) comes from violating that.
8. Answered items must never change underneath their answers: Moodle pins each
   attempt to a question version, Canvas copies a bank item once answered, and
   H5P throws saved state away on edit. Farida today overwrites in place.
9. Gamification is optional seasoning: measured gains are small and rewards can
   lower children's intrinsic motivation (2.5). Tie any reward to completed
   learning, never to upkeep.

### 3.2 Catalogue of lesson blocks and activities

Notation: "auto" is auto-marked, "teacher" is teacher-marked, "none" has no
score. Data uses the QTI response forms (2.4): `id`, `ids`, `ordered ids`,
`pairs`, `text per gap`, `number`, `point`, `file`. T1 must-have now, T2 next,
T3 advanced. "Exists" means built today.

**A. Content** (none)

- **Rich text, headings, lists, quote, code, table, columns, callout, toggle,
  divider** (exists, T1). The Lexical content block. Rise text, statement,
  quote, list and divider families map onto it. A11y: headings in order, one
  H1 is the lesson title. Data: none.
- **Image with alt text and caption** (exists, T1). Add a "decorative" flag so
  an empty alt is a choice, and check alt before publish. Data: none.
- **Gallery or carousel** (T2). Rise gallery; Seesaw multi-page. Buttons, no
  autoplay (2.2.2), mirrored order in RTL. Completion: all slides seen.
- **Math expression** (T2). Needed across K-12 maths and science. Render with
  MathML and an explicit `dir` from a school setting (Arabic notation differs by
  region; digit-only expressions flip under RTL, measured). Data: none.
- **Chart** (T3). Rise chart. Charts do not mirror in RTL. Data: none.
- **File attachment** (exists, T1). Data: none.

**B. Media**

- **Uploaded video with captions** (exists, T1). Captions are required today;
  add the captions editor the tracker lists as open, so a teacher is never
  blocked by not having a WebVTT file. Completion: watched to the end
  (Edpuzzle reports percent watched).
- **Uploaded audio with transcript** (exists, change in T1). WCAG 1.2.1 accepts
  a text transcript for audio-only; requiring WebVTT for a voice note is
  stricter than the standard and costs teachers time.
- **Embed** (exists, T1). Nine allowlisted providers; captions come from the
  provider when the uploader added them.
- **Narration on any block** (T1 for K-2). The teacher records their voice onto
  a block; a speaker button plays it. Seesaw allows twenty recordings per page,
  Book Creator reads aloud with highlighting, and the product spec already
  promises it. Because it narrates on-screen text it meets 1.2.1 without a
  transcript. Data: `fileId` on the block.
- **Interactive video** (T2). Questions at `{from, to}` seconds that pause the
  video, optional forward-skip prevention kept server-side (`maxTimeReached`),
  each answer stamped with its video time, and an adaptive "rewatch from" on a
  wrong answer. Evidence: H5P Hub rank 1 and 12.31 percent of H5P content;
  Edpuzzle, PlayPosit, Wayground. A11y: captions plus a list of the questions
  reachable without playing. Data: check responses plus `at`, watch progress.
- **Screen-by-screen presentation** (T3). Course Presentation is H5P's most
  used type; offer the same lesson shown one block group per screen rather
  than a second slide editor, and later a teacher-paced live mode (T3, F).

**C. Interactive reveal** (none; completion "opened all" only when a gate asks)

- **Continue gate** (T1). Rise's continue block: None, complete the block above,
  or complete everything above; content below stays hidden until met. Only
  requirable blocks that a student can finish alone (checks answered, video
  watched, reveals opened). This replaces most uses of the lesson-wide
  completion rule and keeps long lessons paced.
- **Accordion** (exists as toggle, T1). APG accordion: button inside a heading.
- **Tabs** (T2). Rise, iSpring, Captivate. APG tabs; arrow keys follow the
  visual direction in RTL.
- **Flip cards and flashcards** (T2). Rise flashcard grid and stack, H5P Dialog
  Cards (2.88 percent), Seesaw Flexcards. A flip button, never hover-only;
  optional self-rating ("I knew it") for a practice stack.
- **Labelled image (info hotspots)** (T2). Rise labeled graphic, H5P Image
  Hotspots (4.14 percent, WCAG 2.2 "supports"). Markers stay at image
  coordinates (images do not mirror); a numbered list of the labels in reading
  order is the keyboard and screen-reader path.
- **Process or steps** (T2) and **timeline** (T3). Rise process and timeline,
  iSpring steps and timeline. Next and previous buttons, mirrored in RTL. H5P
  Timeline is "Not recommended", so build it as ordered steps, not a canvas.
- **Before and after slider** (T3). H5P marks it not recommended; needs a
  keyboard slider with the RTL arrow convention decided (2.8).

**D. Knowledge checks** (auto)

- **Multiple choice, single or multiple, and true/false** (exists, extend in
  T1). Add feedback per option (H5P chosen and not-chosen feedback, Canvas
  answer feedback), an image or audio per option for K-2 (Seesaw image
  options), a hint shown before answering, shuffle, and partial credit for
  multiple response with Canvas's formula (points divided by the correct
  count, added per right choice, deducted per wrong, floor 0). A11y: native
  radio and checkbox, icon plus text for right and wrong. Data: `id` or `ids`.
- **Typed answer** (T1). Accepted answers, a case flag, spelling tolerance (H5P:
  one edit for 3 to 9 characters, two above 9; Seesaw "Flexible Spelling";
  Canvas "close enough") and Arabic folding (hamza-seated alef, alef maksura,
  tatweel, harakat, all decimal digits; teh marbuta as a per-question choice).
  Recall format with the strongest evidence; Seesaw, Kahoot and Classroom
  practice sets all ship it. A11y: labelled text input. Data: raw text, folded
  text, matched key.
- **Gap fill in text** (T1). Blanks inside a passage, each typed or a dropdown
  (Canvas fill-in-the-blank modes; H5P Fill in the Blanks 4.69 percent). Author
  by marking words in the editor, store a structure, not markup (H5P's
  `*a/b:tip*` syntax cannot escape `*`, `/` or `:`,
  https://github.com/h5p/h5p-blanks/issues/148). A11y: each gap labelled
  "blank n of m" (H5P's Blanks meets WCAG 2.2 AA). Data: text or `id` per gap.
- **Number answer** (T1). Exact, tolerance absolute or percent, or a range
  (Canvas numeric; Pear Deck number). A text field with `inputmode="decimal"`,
  never `type="number"`, which drops Arabic-Indic digits (measured); fold
  digits and the Arabic decimal separator before comparing; keep the field
  left-aligned and isolated (MDL-36033). Data: raw text and parsed `number`.
- **Word bank** (T2). Drag words into blanks (H5P Drag the Words 5.80 percent,
  Canvas word bank, Nearpod). Tap a blank, then tap a word (Wayground's
  numbered tiles). Data: `pairs` gap to word.
- **Matching pairs** (T2). Canvas matching with partial credit per pair; same
  select-then-place interaction. Data: `pairs`.
- **Ordering** (T2). APG rearrangeable listbox with Up and Down buttons; the
  first end is on the right in RTL. Scoring all-or-nothing or by correct
  neighbours (Moodle has nine strategies, Canvas none). Data: `ordered ids`.
- **Sorting into groups** (T2). Rise sorting (up to 4 categories), Canvas
  categorization, Wayground (4 groups, 20 items). A11y: tap an item, then a
  group, or a group menu per item. Data: `pairs` item to group.
- **Find on an image** (T3). Canvas Hot Spot is "not accessible to
  keyboard-only and screen reader users"; H5P Find the Hotspot is "Not
  recommended". Ship only with named regions offered as a list. Data: `point`
  or region `id`.
- **Highlight the words** (T3). H5P Mark the Words, Wayground hot text. Arabic
  words carry attached clitics, so selection must be by author-defined spans,
  not whitespace tokens. Data: `ids`.
- **Label an image** (T3). Wayground labelling, Moodle drag onto image (which
  flipped in RTL, MDL-69414). Data: `pairs` label to zone.
- **Maths response with equivalence and graphing** (T3). Classroom "allow
  equivalent answers", Wayground math response. Needs an expression engine.

**E. Open responses** (teacher, can carry points)

- **Written response** (exists as reflection, extend in T1). Add optional
  points, teacher feedback, a word limit and a needs-marking state so it can
  count in a graded quiz; autosave. Data: text.
- **Photo or file** (T2). Seesaw photo frame, Canvas file upload. Reuse the
  submission file lifecycle. Data: `file` ids.
- **Voice recording** (T2). Seesaw voice frames with 15, 45 or 90 second caps,
  Wayground audio response (5 s to 5 min). The pre-reader's way to answer.
  A11y: typed answer as the alternative. Data: `file`, duration.
- **Drawing** (T2). Seesaw draw and draw-and-record, Pear Deck drawing,
  Classroom "Show your work". Freehand is exempt from 2.1.1, but offer a typed
  or photo alternative. Load lazily (Excalidraw is about 2.4 MB). Data: PNG
  `file`, optional vector scene.
- **Poll** (T2). Pear Deck, Kahoot, Edpuzzle polls: no right answer, the class
  aggregate shown after answering, names hidden from students. Data: `id` or
  short text.
- **Video response** (T3). Seesaw, Wayground. Storage-heavy.

**F. Practice and games**

- **Practice set** (T1). The checks of a lesson played one per screen with a
  score bar, banded overall feedback and "retry the ones I missed" (H5P
  Question Set 9.82 percent, Rise retry request, Wayground Accuracy mode,
  Canvas "build on last attempt"). The K-2 form from the spec: audio on
  question and options, big targets, stars instead of percentages, no timer.
- **Graded quiz** (T1). The same items as an assignment format: attempts,
  score to keep (highest, latest, average, first), shuffle, a reveal policy
  (all, none, incorrect with feedback), optional time limit with per-student
  extra time or none (2.2.1). This is how lesson items reach the gradebook.
- **Mistakes review and spaced re-quiz** (T3). Duolingo Mistakes, Wayground
  redemption questions, IES spacing (Moderate) and quizzing (Strong).
- **Memory game, crossword, word search** (T3). H5P shares of 1.71 and 1.48
  percent; no learning evidence found here; Arabic crosswords need RTL cells.
- **Live teacher-paced session** (T3). Nearpod, Pear Deck, Edpuzzle Live,
  Kahoot: a projector view with anonymous aggregates, a named teacher
  dashboard, lock with countdown. Needs realtime infrastructure.
- **Streaks, XP, leaderboards** (not recommended now). Section 2.5.

**G. Branching, release and adaptive**

- **Sequential lessons and module prerequisite** (exists, T1). Keep; show the
  reason for a lock (Moodle's "Not available unless").
- **Assign modules and lessons to groups** (T2). Reuse the class groups and
  audience model assignments already have; unassigned students never lose work
  (Canvas unassigning deletes grades; Farida principle 5 forbids it).
- **Release by score** (T2). The next lesson or module opens at a score of N,
  only from auto-marked items so no student waits on a teacher.
- **Mastery paths** (T3). Canvas-style bands (default 70, 40, 0 percent) on one
  source quiz releasing different lesson sets; simpler to author than free
  jumps.
- **Branching scenario** (T3). Rise scenario, H5P Branching Scenario (1.00
  percent), Moodle Lesson. Author as a graph with validation (no dead ends, no
  self-loops), since Moodle's "This page" jump traps students.
- **Skill mastery levels** (T3). Khan's Attempted, Familiar, Proficient,
  Mastered; needs standards or skill tags on items first.

### 3.3 Authoring UX

Patterns that make teachers productive:

- **One inserter.** Today the lesson editor has three add buttons (text,
  quiz, reflection) outside the content editor, which has its own slash menu
  and block handle (`packages/editor/src/plugins/SlashMenu.tsx`,
  `BlockHandle.tsx`). Rise uses a shortcut bar of common blocks, a searchable
  library grouped by family, and a (+) between every two blocks. Farida should
  offer content and activity blocks from the same grouped, searchable menu,
  while activity blocks stay top-level lesson blocks, since the server must
  strip their keys (`studentBlocks`) and score them.
- **Defaults that make the minimum enough** (product spec principle 4): a new
  check is single choice with two options, practice mode, unlimited tries;
  settings summarised in one sentence with More options, as the assignment
  editor does. Moodle's all-settings-at-once page is the anti-pattern the
  coursework research already named.
- **Lesson templates**: "Read, check, reflect", "Watch and answer", "Worked
  example then practice" (IES worked examples, Moderate), and for K-2 "Listen,
  choose, record". A template is a saved lesson document.
- **Preview as student** with phone and desktop widths and English and Arabic,
  interactions live and resettable (Rise preview). Canvas Student View cannot
  show differentiation or Mastery Paths, which argues for previewing as a
  chosen group.
- **Reuse**: duplicate block, copy a lesson to another module, save blocks as a
  template (Rise's only cross-lesson path; moving blocks between lessons is an
  open Rise feature request), module
  copy to a class (exists), later a school library with an approved flag and
  update notices (Canvas Commons).
- **Question bank** (T2): items saved once and reused by reference with a
  version pin (Moodle), random N from a bank for graded quizzes (Canvas, Moodle).
- **Checks before publishing**: alt text, captions or transcript, a heading
  structure, empty checks, a gate nobody can pass; the website CMS spec already
  has this pattern.
- **No AI dependency.** Everything above works without it; Rise sells AI blocks
  as a paid add-on and Classroom's AI tags are English-only.

Pitfalls to design out:

- Too many options: Rise has eleven core block families with several variants each;
  start with the tier-1 set and one way to do each thing.
- Gating that stalls: gate only on self-completable work; always say why
  something is locked; keep the teacher override (exists).
- Drag-only interactions (WCAG 2.5.7) and colour-only right and wrong (1.4.1).
- Media rules that block authoring: a WebVTT requirement with no way to make one.
- A revealed key followed by unlimited retries, which makes the score
  meaningless (Farida today, 1.3).
- Silent edits to answered items (Farida today, 1.4).
- Positional content in RTL: H5P and Moodle store x/y and flip or fail.
- Timed quizzes without adjustable time (2.2.1).

### 3.4 Student experience

- **Where am I**: the outline with done, open and locked states and the reason
  for a lock; a progress bar filling in the reading direction; "Lesson n of N"
  (exists); reopen at the last block by wiring the existing position API.
- **Immediate, informative feedback**: right or not with icon and text, the
  explanation, the feedback for the chosen option, announced through
  `role="status"` without moving focus (4.1.3) and never covered by a sticky
  bar (2.4.11). Feedback effects scale with information content (d = 0.48).
- **Retries by mode**: practice allows retries but withholds the key until the
  student asks for it or runs out of tries (Moodle interactive: tries = hints +
  1 with a penalty per extra try; Edpuzzle shows correct answers only on the
  last attempt); record first-try correctness for the teacher. Graded quizzes
  follow the attempt and reveal policy.
- **Hints before answers** (Classroom practice sets, Moodle interactive); Khan
  treats seeing the worked solution as a wrong answer, a rule worth copying for
  graded work only.
- **Phones first**: targets at least 24 px (larger for K-2), one question per
  screen in practice sets on narrow screens, `inputmode` keyboards, autosave of
  open responses, lazy-loaded heavy widgets.
- **K-2**: audio on every instruction and option, big cards, stars, voice or
  photo answers, no timers, a big "I'm done" (Seesaw, Schoology Elementary).
- **Finish**: a completion screen pointing onward (spec); graded results appear
  when returned, practice results at once.

### 3.5 Data model implications

1. **Item definition.** An activity block is `{id, kind, prompt, config, key,
   scoring, feedback, hints, points}`. Each kind declares a QTI cardinality and
   base type (choice: identifier single or multiple; typed and gap: string;
   number: float; dropdown: identifier; word bank, matching, sorting:
   directedPair multiple; ordering: identifier ordered; image find: point;
   written: string, manual; photo, voice, drawing: file, manual). Scoring is a
   separate strategy: exact, partial per key, partial with penalty, manual. This
   keeps QTI 3 export lossless and lets new kinds reuse storage. Scoring stays
   on the server and keys stay stripped until the answer is final, as today.
2. **Responses as rows, not one jsonb.** An append-only responses table:
   tenant, lesson version, block id, student, attempt number, try number,
   response (QTI Appendix C JSON), folded response for text kinds, fraction
   0..1 or null, state (answered, needs marking, marked), marked by, feedback,
   file ids, created at. `lesson_progress` stays the per-student summary
   (score, completion, position, first-try flags) derived from it. This lifts
   the 64 KB cap, gives per-item analytics (facility, frequent wrong answers,
   as Forms and Khan report) and makes a teacher's mark a new row, as Moodle's
   manual-grade step is.
3. **Attempts.** Practice has one running attempt with unlimited tries.
   Graded quizzes number their attempts and store the shuffle order and any
   random draw at the start (Moodle stores `_order` in the first step), so a
   review shows what the student saw.
4. **Scores.** Score = sum(fraction x points) / sum(points). It stays null
   while any counted item needs marking (Moodle null `sumgrades`; LTI AGS
   `PendingManual`), which maps onto Farida's "Handed in" until returned.
5. **Gradebook.** Keep one path to the gradebook: the assignment line item.
   Either a quiz assignment format built from the same items, or "count this
   lesson" creating an assignment linked to the lesson. Both inherit audience,
   due dates, missing and excused states, release on Return and families
   seeing returned results only. Inline practice checks feed teacher progress,
   not grades (Rise and Canvas both separate them).
6. **Versions.** Publishing freezes the lesson document into an immutable
   version (the documents store already has `freezeCopy` for submission
   attempts); students play the published version; edits make a draft;
   "Publish changes" makes a new version. Responses reference their version.
   Per block, compare a content hash: text-only changes move students to the
   new version with answers carried (same block id, same item hash); a changed
   key or option set on an answered item asks the teacher to apply it to new
   answers only (Canvas copy, Moodle pin) or regrade existing ones (Canvas
   regrade: new key only, or both keys). Removed blocks keep their answers in
   history. Completion never moves backwards silently (Canvas asks "Re-Lock
   Modules"; H5P's reset-on-edit is the behaviour to avoid).
7. **Direction and language.** A lesson carries its teaching language, which
   sets `dir` instead of relying on `dir="auto"`; an optional translation can
   reuse the document translations newsletters and the site already have.
   Typed-answer keys may list both languages; digits fold both ways; display
   digits follow a school setting (`-u-nu-latn` or `-u-nu-arab`).
8. **Files.** Voice, drawing and photo answers and block narration go through
   the private file lifecycle with the lesson (or response) as host, as lesson
   media does today.

### 3.6 Standards decision

- T2: LTI 1.3 with Deep Linking and AGS as a module item kind, so publisher
  content and tools drop into modules with scores returned.
- T3: QTI 3 export of Farida items, QTI 1.2 and 2.x import (what Canvas
  exports), Common Cartridge import for moving courses in.
- Not now: SCORM import (weak K-12 signal; Moodle dropped 2004, Canvas gates it
  behind an admin app) and an xAPI LRS. Shape internal events like xAPI results
  (score scaled, raw, max, success, completion, duration) so either stays cheap
  later. Do not build on H5P: it has no RTL, and its positional types cannot
  mirror; allow H5P only through an embed or LTI.

### 3.7 Gaps in today's build to close first

1. Stop revealing the key before the last try; record first-try correctness.
2. Wire the existing reading-position API into the player.
3. Freeze a version on publish and pin responses to it.
4. Move answers into response rows.
5. Give written responses teacher feedback and optional points.
6. Accept a transcript for audio-only media; add a captions editor for video.
7. Let modules target groups and students, reusing the assignment audience.

### 3.8 Tiers at a glance

- **T1 (now)**: content blocks (exist), image alt and decorative flag, video
  with captions editor, audio with transcript, embed, block narration, continue
  gate, accordion, multiple choice and true/false with option feedback, hints,
  shuffle and partial credit, typed answer with Arabic folding, gap fill (typed
  and dropdown), number answer, written response with feedback, practice set
  with a K-2 mode, graded quiz as an assignment format, versioned lessons and
  response rows.
- **T2 (next)**: gallery, math, interactive video, tabs, flip cards, labelled
  image, steps, word bank, matching, ordering, sorting, photo, voice, drawing,
  poll, group audiences, release by score, question bank, templates library,
  LTI 1.3.
- **T3 (advanced)**: chart, presentation and live modes, timeline,
  juxtaposition, find on image, highlight words, label image, maths
  equivalence, video response, mistakes review, word games, mastery paths,
  branching scenarios, skill mastery, QTI and Common Cartridge interchange.
