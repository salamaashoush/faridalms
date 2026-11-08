# Learning

What modules and lessons do, built from
[../research/course-design.md](../research/course-design.md).

## Lessons

- A lesson is one document in the shared editor. Text, pictures, files,
  video and audio, embeds, runnable code, continue gates and questions are
  blocks written in it, inserted from the slash menu or the toolbar and
  moved, copied or removed with the block handle; a block's settings live in
  the editor's floating bar.
- A video, uploaded or from YouTube or Vimeo, can stop for a question at a
  moment, carry chapters and hold students to what they have watched. A
  YouTube or Vimeo video plays through the school's player once the reader
  chooses to load it, with the controls under the service's frame, and its
  watching counts like an upload's.
- Questions come in seventeen kinds. Multiple choice has one or several
  right options, feedback per option and shuffling; true or false is its
  short form. A typed answer (a day chosen from a calendar, where the
  teacher asks for one), blanks in a passage (typed or chosen from a
  list) and a number (exact give or take, or a range) check what students
  write. The same blocks ask a family's forms, unmarked
  ([questions.md](questions.md)). Matching pairs prompts with answers, extra answers included.
  Ordering gives credit for the whole order or for each neighbouring pair.
  Sorting puts items into two to four groups. A written answer goes to the
  teacher and may be spoken, filmed, drawn or photographed. For young
  children there are counting, tracing, a word built from tiles and finding
  things in a picture; for coding, code puzzles, programs marked by their
  tests, Scratch, web, p5.js, Python and micro:bit projects, and blocks or
  arrow puzzles.
- Dragging is offered and never needed: matches are chosen from a list,
  items move with arrow buttons, groups are chosen per item, and a place in
  a picture is chosen by its name.
- Each question has points (none makes it practice), a hint shown after a
  wrong try, an explanation, and a number of tries before the answer shows;
  unlimited tries keep the answer back until the student asks for it. The
  settings sit behind one summary line, so the defaults are enough.
- Typed answers and blanks fold Arabic before comparing: short vowels,
  tatweel, the forms of alef, alef maqsura and the three digit scripts, and
  ة as ه when the teacher allows it. A close-enough match forgives
  one slip up to nine letters and two above. Numbers read Arabic-Indic digits
  and the Arabic decimal separator.

## Students

- Keys, hints, explanations and option feedback stay on the server until a
  try calls for them. A try says right or not with an icon and text, the
  feedback of what was chosen, and the hint; the answer and explanation follow
  once the question is right, revealed or out of tries.
- A continue gate hides what follows until every question above it is
  settled and the student chooses to go on. A lesson not open yet says why
  instead of failing.
- Every try is a row of its own. A question's credit is its best try less a
  third for each extra try, nothing once the answer was shown, weighted by
  points. A student may start again once every question is settled; the best
  finished attempt's score stays.
- A student who comes back is offered the place where they stopped reading.
- Once two lessons of a module are done, its page offers a mixed review:
  up to eight questions from the finished lessons, the ones missed the first
  time first, lessons taking turns. Each try is marked and kept nowhere, so a
  review never changes a score, and only finished lessons give questions, so
  showing an answer gives nothing away. Each new review draws a fresh set; a
  module of young lessons plays it on the young stage.

## Young children

From [../research/early-years.md](../research/early-years.md).

- A teacher records or uploads narration, up to three minutes, on any block
  and on each question, option, item, side of a pair and group name. A
  speaker plays it beside the block or on the card.
- A lesson marked for young children, at a school with the early-years
  module on, plays full screen behind a big start button, one question to a
  screen with the words above it; a divider or continue gate starts a new
  screen. Each screen reads itself as it opens and again after 7 seconds
  untouched. Without a recording the browser's voice reads, except Arabic
  written without its vowels.
- A tap on a card answers. A missed card greys out; the second miss says the
  hint; the third lights the answer for the child to tap. Matching, sorting
  and ordering are done by tapping a card and then its place, or dragging it;
  once every card has a place, right cards stay and the others come back, and
  "Show me" lays out the answer after two tries. Questions with pictures on
  their parts work this way for older students as well.
- A written question can be answered by speaking, by drawing on the screen
  with eight colours, two pens, a paint bucket, an eraser and undo, over a
  picture the teacher chose as a colouring page or on a blank one, or with
  a photo. The bucket's colour spreads out from the child's tap to the
  picture's lines and their own strokes in under a second; a device that
  asks for reduced motion gets the whole area at once. A photo is
  shrunk and re-encoded so it carries no location. The teacher sees and marks
  each in the Answers tab.
- A find-on-a-picture question has the teacher drag a box over each thing to
  find. A find is judged under the child's finger, with a little slack, so
  only a tap on nothing or the last find counts as a try; after two misses
  "Show me" rings what is left.
- Adding a picture to an option, item or question opens a search of open
  pictures: ARASAAC's pictograms, with vowelled Arabic words, and OpenMoji's
  emoji. A picked picture is copied into the school as the teacher's own
  upload, with its words as the description, and the credit both sources ask
  for sits under the results. `bun scripts/picture-library.ts` rebuilds the
  index; ARASAAC's violent and sexual pictograms are left out. For a
  question answered by drawing, the search offers line drawings to colour
  first, with the coloured pictures a tap away: ARASAAC's black and white
  pictograms (from its API, `color=false`) and OpenMoji's black set, under
  the same licences and credit as their coloured versions.
- A young lesson's "Start from a template" menu offers ready-made
  activities, one of each kind (picture choice, counting, memory pairs,
  sorting, tracing, word builder, drawing), worded in the teacher's language
  with Arabic vowelled; their pictures are copied in from the library.
- The same menu turns a picture book in an EPUB file (a StoryWeaver, Book
  Dash or African Storybook download) into a read-along lesson: each picture
  starts a screen with the words after it, pictures are copied into the
  school, and the book's own credits stay as its last screen. StoryWeaver
  gives its books only to signed-in readers, so the teacher downloads them.
- Each young screen reads itself as it opens: every passage in order, by
  the teacher's recording or the browser's voice, then the question.
  Pictures are not read; their descriptions are for screen readers. Where
  the browser names each word as it speaks (Safari does, Chrome's network
  voices do not), the word lights in a marker's yellow; a lesson setting
  turns this off.
- A teacher's recording of a passage or a question's prompt lights its
  words too once they are timed: in the narration panel the recording plays,
  slower if asked, and the teacher taps as each word begins. Timing needs no speech engine, so it works for Arabic
  as for English. Words edited after timing light nothing until timed again.
- A teacher of a young class turns its lesson sound effects off on the
  class page, for a room full of tablets; read and recorded words still
  play, and the child's own sound button goes.
- A young lesson its teacher leads live takes each child, once they have
  tapped start, to the screen the teacher opens, and no further; a child
  may go back to an earlier screen. The teacher moves the class with big
  Next and Previous screen buttons. A pause covers the screen, says "Wait
  for your teacher" aloud and stops every tap until the lesson goes on.
- Children see no points or scores. Soft notes and a word of praise naming
  what they did answer each try, and the end of the lesson says so once.
- A young child's home is up to six big cards, a lesson already begun first,
  each with a speaker that reads its name; the sidebar keeps Home alone, with
  no search or notifications.
- A child signs in by showing a printed badge to the device's camera. The
  teacher prints them from the class's Students tab, credit-card size and
  eight to a page, and replaces or stops one that went missing; a new scan
  on a shared tablet signs the last child out.
- At home a guardian hands their own device to a young child from the family
  home. The child sees only their home and lessons; going back to the family
  account asks a multiplication a grown-up answers at a glance.

## Teachers

- A module opens only with at least one lesson, and only when every lesson
  passes the lesson check: it has words, no suggestion waits for review, it
  holds no draw from the question bank (only a quiz does), every video has captions
  and every sound captions or a transcript. Closing a module again keeps
  its students' progress.
- Students play the version a teacher last showed them. Saving a lesson in an
  open module shows it at once unless the teacher saves without showing.
  Lessons of a draft module are shown when the module opens.
- A preview marks answers in the browser and saves nothing, and starts over
  on request.
- A lesson, like every document, prints from its menu, the student's player
  as well as the editor: each question takes a paper form, and a teacher may
  print the answers in place or as a key at the end.
  [docs/plans/printing.md](../plans/printing.md) has the design.
- A module's Right now tab shows a teacher where each student of a class is,
  from the last 20 minutes and asked again every 10 seconds: who needs help
  (three misses on one question, or the answer shown), who is guessing
  (three wrong tries within ten seconds), who has stopped for two minutes,
  who got a question right after missing it, who is working or finished,
  and who is not in a lesson. Students never see it.
- Teach live, on a lesson of an open module, leads one class through it
  part by part, the parts split at its Continue blocks; a young lesson,
  where the school has the early years, is led screen by screen, its
  screens split as the children's player splits them. Students reach the
  parts the teacher has opened and answer nothing while it is paused; the
  teacher's screen shows who has come in and how the open part was
  answered, and a class board shows the same without names. Each start,
  move, pause and end is pushed to the students' players through the
  collaboration server: the API signs a signal to the lesson's room once
  the change is committed, and every player listening asks where the class
  is at once, as the class board does. A player may listen if it may read
  where the class is: the module's teachers, and students the module
  reaches. Listening, a player still asks every minute in case a signal
  was lost; without the channel (no `COLLAB_SIGNAL_URL`, the socket
  dropped, or a ticket refused) it asks every 3 seconds while the lesson
  is led and every 15 otherwise, and asks once more on reconnecting.
- An empty lesson's "Start from a template" menu offers teaching patterns
  filled with a worked sample in the teacher's language: a worked example
  whose steps open one at a time behind Continue, then one step to finish
  and a problem alone, then a question on which step to check; and an
  unmarked prediction with one try, then what happens and why, then an
  explanation in the student's words.
- The module's Answers tab lists each written question with its class's
  answers, unmarked first. A question with points takes a mark and feedback;
  one without takes feedback alone. The student sees both, and the answer
  closes once marked. A teacher may choose several waiting answers, or all
  of them, and give them one mark and feedback together.

- A lesson can be shown by score: to the students whose best score in
  another lesson is below a mark, at or above one, or between two. That
  lesson is an earlier scored lesson of the module, or a scored lesson of
  another module that shares a class with it and that the teacher may
  edit, chosen in the lesson's routing settings under the module's name.
  It stays hidden until that lesson is finished, then is on the student's
  path or off it; no chain of rules may lead back to the lesson itself,
  and a lesson whose score routes another, anywhere, cannot be removed. A
  copied module keeps its rules within itself and drops those on other
  modules. The student's module names the lesson elsewhere that opened a
  lesson, and the module the score came from lists where it sent them, as
  does the lesson once finished; a young child's last screen goes on
  there. The teacher's lessons table names each rule and, on the lesson a
  score comes from, the lessons it opens elsewhere; the progress grid
  names each rule and shows a lesson off a student's path, or waiting on
  a score in another module, as it does within one.
- Work for a whole class or for groups follows who is in them. A module
  reaches whoever is in its class or groups today. A student who joins a
  class, or one of its groups, is given its published assignments that are
  neither due nor closed yet; work already due stays with those it was set
  for, and a student who leaves keeps on record the work they were given.

## Graded quizzes

- A quiz is an assignment format that asks the same kinds of questions as a
  lesson, without continue gates, hints or tries. It is worth the total of
  its questions' points.
- The teacher chooses how many attempts a student has, which score counts
  (highest, latest, average or first), whether each student meets the
  questions in their own order, and what a student sees after handing in:
  the right answers and explanations, only which answers were right, or
  nothing until the teacher returns it.
- Students keep each answer as they give it and hand the attempt in whole.
  Every answer is marked then; a written answer with points waits for the
  teacher, who marks it from the grading page or question by question
  from the quiz's Answers tab, the same board as a module's, and the score
  follows.
- The score that counts goes onto the latest attempt's assessment, so the
  gradebook reads a quiz like any other work. A quiz that marks itself
  completely is returned at once unless the teacher keeps results back.
- A quiz may draw some of its questions from the question bank: so many
  with a tag, each worth the same, from the school's bank and its author's
  own. Each attempt draws as it opens and keeps what it drew, so it is
  marked, shown and graded against those questions. A question drawn by
  several students keeps one id among them, so it is marked together.
  Assigning refuses a draw the bank cannot fill.
- A quiz may have a time limit. Its questions stay hidden until the
  student begins an attempt, whose clock then runs whether or not they
  stay; answers sent after it ends are refused, and an attempt left open
  is handed in as it stood by the worker.
- A student's access arrangements apply on their own: extra time or no
  clock at all, a computer reader in quizzes and lessons, one wrong choice
  fewer in quiz questions, and later due dates.
- Once a student has started, or drawn, the questions and draws stay as
  they are; the settings can still change, and a clock already running
  keeps the time it began with.

## Early learning goals

- A school adds a ready-made framework of goals in one step, from
  Standards or a young class's empty Goals tab: the seventeen EYFS early
  learning goals under their seven areas, or Development Matters, the
  Department for Education's guidance for younger children, as its seven
  areas, three age bands each (birth to three, three and four, Reception)
  and the 298 "children will be learning to" statements worded as printed
  (September 2023 revision, Crown copyright under the Open Government
  Licence v3.0, the guidance's page 128). Adding either again brings the
  school's copy back to it.
- The statements are never machine-translated. A school words any
  statement of its copy in Arabic itself, beside the English, from the
  statement's sheet in Standards (`standards.statement_ar`); the English
  stays the framework's own, and adding the framework again keeps the
  school's wording.
- A young class's teacher judges each child expected or emerging per goal
  on the Goals tab, best fit from all they know of the child. Behind the
  note button sits "Exemption applies", the profile's code A: only for an
  individual exemption on religious or philosophical grounds, never for
  absence, illness or special needs, which are judged emerging.
- A question tagged with a goal gives evidence, never a judgement. A
  child's latest full-marks answer to one, in a lesson of the class's
  modules or a quiz set to the class, shows under them on that goal with
  "Confirm expected"; confirming records the judgement linked to the answer
  (the lesson, or the child's own quiz submission). The answer is offered
  until the goal is judged expected or exempt, or judged emerging after it.
- The teacher shares the class's report on a framework with its families,
  and may take it back. While shared, a guardian reads it on the family
  Grades page: every goal with where the child stands, never the notes or
  the work behind a judgement; in Arabic, the EYFS goals and Development
  Matters' areas and bands read in Arabic, its statements in the guidance's
  English unless the school has worded them in Arabic. Sharing again
  reaches children who joined since.
- On the EYFS goals the Goals tab makes the end-of-year return: the
  partial Common Transfer File (data type FSP, CTF 25 for 2026, 26 from 2027) a school gives its local authority, each child's goals as
  stage assessments (stage EYF, method FA, qualifier FD, result 1, 2 or A,
  components E01 to E17 as the A_comp file gives them). The teacher enters
  the authority and establishment numbers; the UPN is the child's ministry
  number, names, date of birth and sex come from their record, and what a
  child still lacks for the authority to accept it is listed. Each export
  is audited.
- Judgements, the reports shared and their links are erased with the
  child.

## Reading aloud

- A "Read aloud" question is offered wherever questions are: lessons, young
  lessons and quizzes. A young lesson shows its passage large above the
  record button and never reads it to the child.
- The teacher marks a reading word by word from a lesson's Answers tab or
  a quiz's, one student's attempt at a time, and may score its prosody on
  the Multidimensional Fluency Scale (expression and volume, phrasing,
  smoothness, pace, each 1 to 4), shown with the rest of the marking. The
  same scale is offered as a ready-made rubric for an assignment.
- Every reading marked this school year, in lessons and quizzes, comes to
  words correct a minute and accuracy. Staff who reach a student see them
  on the record's Coursework tab as a chart per language against the 50th
  percentile for the grade the student was in, at that time of year
  (autumn August to November, winter December to February, spring from
  March), each reading called below, near or above it by ten words, with
  the words to practise. The student sees their own figures and the words
  their teacher marked, without norms, on their work page.
- A school's norms live in Settings, Reading, by grade, time of year and
  percentile. English starts from Hasbrouck and Tindal's 2017 norms for
  grades 1 to 6; Arabic starts empty, as there are no published norms to
  start from. Saved norms replace the defaults until the school goes back
  to them.
- Nothing listens to the recordings: speech recognition waits on the
  owner's decision about language models.

## Discussions

- A discussion is coursework set for one class. Its teacher may stand it
  in a module set for that class: the module's Discussions tab lists the
  discussions of the classes its teacher teaches, with New discussion
  opening the editor for that module, and a student meets it in the
  module beside its lessons. A family sees its title there and nothing of
  the posts.
- A module's discussion is one discussion across every class the module
  is set for (`core/module-discussions.ts`): a part per class, sharing
  `assignments.discussion_group`, each its class's conversation and grade
  line. Each class talks among itself, as a module's audiences are set
  class by class, and the teachers of a class moderate its part. Whoever
  may edit the module writes it; saving or putting out any part brings
  every other part to the same words, settings and dates, and a class
  joining the module gets its part then. Who takes part in a class is who
  the module reaches there. A part keeps its own class, grade category
  and term, and a module's discussion stays in its module. Discussions
  set class by class before were joined by author and title, each class
  keeping its posts and grades.
- Anyone taking part likes a post they can read, once, and takes the like
  back; nobody likes their own, and a hidden post takes no likes. Students
  see how many like a post; its teacher also sees who.

## Each student's copy

- A file put in a brief's "Each student's copy" becomes each student's own
  when they first save. "Upload a new version" puts their version in the
  block's place and the block remembers the file it began as, so the
  work's Students tab shows, for a brief with such files, a "Their copy"
  column: not uploaded yet, how many of several are uploaded, or when the
  last version was uploaded, read from the latest handed-in attempt or
  else the draft. A file a student adds beside their copy does not count.

## Peer review

- Written work, files, a quiz and a discussion can be set for peer review.
  A quiz's reviewer reads the classmate's answers to the questions only a
  teacher marks, typed, or heard and seen when spoken, filmed, drawn or
  photographed: while the review is theirs, the submission's file reader
  opens to them exactly the recordings and pictures of the answers it
  shows, and no other file the classmate keeps (`reviewerReads`). A
  discussion's reviewer reads the classmate's posts, hidden ones left out.
- Reviews may have a date of their own, no earlier than the work's due
  date. Handing reviews out tells each reviewer, with the date, and the
  worker reminds those who have not sent every review once, within the
  day before it. A new date earns a new reminder.
- On written work a reviewer selects words and comments on them, anchored
  as a teacher's comment is, until the reviews are released. The author
  reads each comment with the words it is on, and the teacher reads them
  with the review.
- An author says how helpful each review of their work was: very,
  somewhat or not. The teacher sees it beside the review.

## Next

What lessons, quizzes and the editor still lack, and the order of work, is
in [../plans/teaching-content.md](../plans/teaching-content.md).
