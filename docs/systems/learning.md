# Learning

What modules and lessons do, built from
[../research/course-design.md](../research/course-design.md).

## Lessons

- A lesson is a list of parts: text with pictures, video and files, media
  with a caption and a transcript, a continue gate, and questions. A teacher
  adds any of them from one menu, at the end or between two parts, and can
  move, copy or remove each.
- Questions come in nine kinds. Multiple choice has one or several right
  options, feedback per option and shuffling; true or false is its short form.
  A typed answer, blanks in a passage (typed or chosen from a list) and a
  number (exact give or take, or a range) check what students write.
  Matching pairs prompts with answers, extra answers included. Ordering gives
  credit for the whole order or for each neighbouring pair. Sorting puts items
  into two to four groups. A written answer goes to the teacher.
- None needs dragging: matches are chosen from a list, items move with arrow
  buttons, and groups are chosen per item.
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
  with eight colours, two pens, an eraser and undo, or with a photo, which is
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
  index; ARASAAC's violent and sexual pictograms are left out.
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

- Students play the version a teacher last showed them. Saving a lesson in an
  open module shows it at once unless the teacher saves without showing.
  Lessons of a draft module are shown when the module opens.
- A preview marks answers in the browser and saves nothing, and starts over
  on request.
- The module's Answers tab lists each written question with its class's
  answers, unmarked first. A question with points takes a mark and feedback;
  one without takes feedback alone. The student sees both, and the answer
  closes once marked.

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
  teacher, who marks it from the grading page, and the score follows.
- The score that counts goes onto the latest attempt's assessment, so the
  gradebook reads a quiz like any other work. A quiz that marks itself
  completely is returned at once unless the teacher keeps results back.
- Once a student has started, the questions stay as they are; the settings
  can still change.

## Next

Voice, drawing and photo answers, counting and tracing activities, a word
builder, memory pairs and the young student's home (see
[../research/early-years.md](../research/early-years.md) section 4), time
limits on quizzes with extra time per student, and a question bank.
