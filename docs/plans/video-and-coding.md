# Video and coding lessons

The evidence and the tools are in
[../research/video-and-coding.md](../research/video-and-coding.md). This is
the order of work. Every piece is an editor block in the one document model,
so it works in lessons, assignments and quizzes alike, prints through the
print module, and reaches students with no answers in it. Each phase is
checked in the browser in English and Arabic, desktop and phone, and lands
with the gate it can break.

## Video

1. **Player.** Video.js 10 (`@videojs/react`) behind our own `VideoPlayer`,
   skinned with the design tokens, for uploaded files and for YouTube and
   Vimeo embeds. Arabic, right-to-left, captions, speed, keyboard, resume.
   On YouTube nothing is drawn over the frame; controls and questions sit
   beside or below it.
2. **Watch progress.** Played ranges reported by the player and merged on the
   server, so skipped parts never count. A lesson can finish on "watched",
   and a continue gate can wait for a video. Done: `lesson_watches` keeps
   each student's played seconds as a multirange with their place, a lesson
   can finish when nine tenths of every recording is played, and the player
   picks up where the student stopped. A continue gate waits for the
   recordings above it as it does for the questions.
3. **Transcript panel** from the captions: follows playback, click to jump,
   search. Done: under every captioned video and recording, folded until
   opened; it holds still while a student scrolls it.
4. **Questions on the timeline.** Question blocks placed at a time inside the
   video block; the video pauses and the question opens beside it; rewatch
   from the segment on a wrong answer; skip prevention as a setting; for
   young children, tap, say or draw at a pause. Done: a teacher asks any
   question "at 0:42" from the video block, and it stays a question block
   in the document; the video stops there, opens it below, and plays on
   past it only once answered; marks show on the timeline and the paper
   says when it is asked. After a wrong try the student can watch the part
   since the stop before again, and the video holds at the question once
   more. A teacher can also turn on "No skipping ahead" for a recording:
   students may go back over it freely but seek on only as far as they have
   played without a gap, which the server works out from what they watched.
   In a lesson for young children the questions asked in a video stay on the
   video's screen out of sight until it stops for them; the question is
   brought into view and read aloud, and once the child has answered it the
   video comes back into view and plays on by itself.
5. **Teacher insight.** Drop-off, rewind peaks and each answer with its time,
   per class and per student. Done: a module's Videos tab shows, for each
   recording, how many of the class watched each moment, where it stops for
   questions, and how much each student watched, least first. Rewind
   peaks too: watches keep the seconds each student played more than once,
   the tab draws how many went back to each moment, and it names the
   stretches most gone back to as worth going over with the class.
6. **Pipeline**, decided 2026-10-03: our own media service, in Rust.
   Resumable upload, ffmpeg to HLS (360, 540, 720p and audio only), a
   thumbnail sprite and poster, stored through the file store and streamed
   behind sealed links as the files host serves files. It pulls jobs from
   the API and holds no database role. Done: `apps/media` encodes and
   serves, the API queues each new video on its file and hands out sealed
   stream links, and the media player streams with captions. A video that
   is gone (trashed, saved over, never used or erased) loses its stream
   folder on the next sweep of its school's files. A large file goes up in
   parts of 8 MiB that the API joins and then checks as one upload; a part
   the network drops is sent again, after a wait or once the browser is
   back online. A video in a document may weigh up to 200 MiB, so a
   ten-minute recording fits; every upload used to stop at 25 MiB, which
   refused a recording of much over a minute. Done after that: a
   recording made in Firefox, which states no length, is encoded (it used
   to fail three times and stay unstreamed); each size is encoded to a
   constant quality under its rate; HDR video from a phone is brought down
   to ordinary colours; every video plays at one loudness; NVENC cuts
   segments where it is told to; a worker proves its tools as it starts,
   keeps its lease through every step, hands a job back when it stops or
   its machine fails, and is counted at `/metrics`; a video's link stays
   the same for a four-hour window so browsers keep what they fetched;
   schools take turns in the queue; the service has a container image and
   runs its tests in CI. Hosted adapters remain, and so does the decision
   whether streams count against a school's storage.
7. **Captions and chapters.** Whisper drafts captions on the worker for the
   teacher to approve in the existing captions editor; chapters edited on the
   timeline and shown on the scrub bar. Done for chapters: a teacher writes a
   video's chapters as video sites take them, a time and a name a line, or
   adds one at the moment the video is paused on; students see the timeline
   split at each chapter, the chapter's name over the time as they seek, the
   chapter playing beside the clock, and a list of chapters to play from.
   Done next: the captions editor drafts captions from what a recording
   says, in Arabic or English, with whisper.cpp on the media service; the
   draft arrives as lines the teacher checks and fixes before saving, and a
   note asks them to read every line against the recording. Drafts are now
   offered in all twelve languages the captions editor lists, and a
   voice-detection model keeps Whisper from writing words over music and
   silence.
8. **Teacher studio and student replies.** Record camera, screen and voice in
   the browser, trim, publish; the same recorder gives students a video or
   audio answer kind. Done first: "Record a video" in the editor's insert
   menu records the teacher's camera, their screen, or the screen with the
   camera in a round corner (the corner away from where the page's text
   starts), with their voice and what the screen plays, after a count of
   three, with pause, up to ten minutes. The screen and camera are drawn
   together on a timer kept in a worker, so a teacher working in another
   tab still records smoothly. A take plays back before it is added, and is
   uploaded and streamed as any other video. Done next: a written question
   can be answered on video, up to ninety seconds or three minutes; the
   student records it in the same studio, camera or screen, watches it
   back and sends it, and the teacher watches and marks it with the class's
   other answers. Done last: a take's start and end can be cut off before
   it is kept, by two handles under the take that show the picture where
   they stand; the media service makes the cut and puts it in the upload's
   place, and until it has, nobody but the maker can open the recording.

## Coding

Coding is a per-school switch (`coding` in `core.org_features`); turning it
off keeps the work and shows a placeholder.

1. **Runnable code with Predict.** A code block a student can run (Python in
   a Pyodide worker, JavaScript in a sandboxed worker), optionally locked
   behind a prediction question: PRIMM's predict and run. Done: a teacher
   sets a Python or JavaScript code block to "Run it" or "Predict, then run
   it"; students change it in CodeMirror, give the program its input, run it
   and see what it prints, with the traceback and the failing line marked.
   A predicting block opens once the question above it has a try, right or
   not. Programs run in a worker inside an opaque-origin sandboxed frame, as
   in [../operations.md](../operations.md), and stop after ten seconds or too
   much output. Done next: Python's turtle, a module of our own that records
   what the turtle draws for the lesson to play back on a canvas at the
   speed the program sets, within four seconds. A student's changes to a
   runnable block are kept as they type and come back with them; when the
   teacher has changed the block since, a note says so and Reset code gives
   the teacher's.
2. **Parsons problems** as a question kind: shuffled lines, indentation,
   distractors, marked and printable. Done: a teacher types the program as
   lines of a code puzzle (Tab indents, Enter keeps the indent, the circle
   marks a line that belongs nowhere) and picks its language; students build
   it from the shuffled lines with buttons to add, move, indent and take
   out, and Python alone is marked on indentation. Alike lines count either
   way round, the answer shows as the indented program, and on paper the
   student numbers the lines.
3. **Code exercises.** Starter code, visible and hidden tests run in the
   worker, hints in order, friendly errors in Arabic and English, every run
   kept for the teacher's replay. Done for Python: a teacher writes the
   starter a line at a time and each test as what the program reads beside
   what it must print, and can hide a test. Students write and run the
   program in the browser; Check answer sends it to the API, which runs it
   once per test in CPython built for WASI, in a worker with no host file,
   network or process, 256 MiB and five seconds a test, between two short
   transactions, and gives credit per test. A hidden test shows only
   whether it passed and the error's name; a quiz keeps results back until
   it shows its answers. Errors come with a plain explanation in the
   student's language. JavaScript exercises work the same way, marked in
   QuickJS compiled to WebAssembly with 64 MiB, four seconds a test and
   nothing of the host; one console formatter, shared by the browser and
   the API, makes a program print alike when run and when checked. Every
   question, a code exercise among them, now takes up to five hints in
   order: each wrong try opens the next, a line says when another waits,
   and the last of limited tries shows the answer rather than a hint. Every
   run a student makes in the browser is kept with its input, what it
   printed and how it ended, a repeat of the last run once only; on the
   Questions tab a teacher replays one student's runs and checks in order,
   stepping or playing through them, with the lines each step changed
   marked.
4. **Projects and the sandbox domain.** A multi-file HTML, CSS and JavaScript
   or Python (turtle, p5.js) project with live preview on the separate
   domain, autosaved as the student's work, a class gallery with remix, and
   the teacher's live view of the class. Done first: an HTML code block set
   to run is a playground, its page drawn again as the student types, with
   its console and errors below. The page plays on the files host's domain
   in a frame with an opaque origin and no network, and every loop in its
   scripts is checked, so one that never ends stops after three seconds.
   Done next: a web project is a question kind (`project`). A teacher
   writes the files every student starts from in the studio the students
   use, or leaves them an empty page; students write HTML, CSS, JavaScript
   and SVG files beside the page they make, which follows links to the
   project's other pages and names the file and line of an error. The
   project is kept as they type (`core.lesson_projects`) and reaches the
   teacher when handed in, or with the rest of a quiz; the teacher runs,
   reads and marks it, and on paper the starting files print to read.
   Done after it: a teacher can give a project question a class gallery.
   A student offers the project they handed in; classmates see it, by
   name, once the teacher shows it and once they have handed in their own,
   and may begin theirs again from it, which their next hand-in says to
   the teacher. The rules follow what schools already use: sharing is off
   until a teacher turns it on (Code.org), a teacher sees each piece
   before the class does (Seesaw), and building on another's work names
   it (Scratch). Done last: a module's Right now tab shows the projects
   being built, each page as its student last left it, marks a page that
   has an error and a student who has changed nothing for five minutes,
   and opens any one large with its code to show the room. A project can
   be a p5.js sketch: the slash menu offers one whose starter already
   draws, and a page that asks for `p5.js` is given the copy the files host
   serves. A project can also be a Python program of several files: its
   `main.py` runs in the browser with the others there to import, with the
   turtle, input and error lines a runnable block has, and it is kept,
   handed in, shown in the gallery and read on the live view as a web
   project is. The live view reads a Python project's code rather than
   running a class's programs at once. A teacher deciding on a project a
   student offered is shown that project where the student has handed in
   a newer one since, because the gallery holds what was offered and the
   class would see that.
5. **Blocks puzzles.** Our Blockly puzzle engine and level packs (paths,
   loops, turtle art, events, music) in Arabic and English, an arrow-path
   activity for early years, and unplugged versions through print. Done: a
   puzzle is a question kind (`puzzle`) built on a package of its own
   (`packages/puzzles`). A puzzle is a grid of up to eight squares a side
   with walls, a hero, a star to reach and gems to pick up on the way. A
   young child answers with a row of arrows, each a step up, down, left or
   right. Which way the hero faces is hard before about seven, and
   Code.org's first course steps by the compass for the same reason. An
   older child builds a program of blocks that go forward and turn, repeat
   a number of times or until the star, and choose by whether there is a
   way ahead or to a side. The blocks are Blockly 13's, in the school's
   language and right to left in Arabic, with its keyboard and screen
   reader support; its catalogue lacked the Arabic for those, which the
   package adds. An answer is kept as what its blocks do, not as the
   editor's own save, so the same small interpreter runs it in the browser,
   where the board plays it back a block at a time, and at the API, which
   marks it: no browser's word is taken that the star was reached. Each
   program run is a try, a wrong one opening the next hint. A teacher makes
   a puzzle in a designer: paints the grid, picks how it is answered, which
   blocks it offers and how many a program may have, starts from one of
   sixteen ready-made puzzles (arrows, paths, loops, choices), and builds
   their own answer, without which a puzzle cannot be saved. That answer is
   what students are shown once the question settles and how few blocks
   they are told it can be done in. A solved program can be read as Python.
   On paper the board prints with boxes for the arrows or ruled lines for
   the blocks it names, and a teacher's copy carries the answer. Not done:
   turtle art, events and music packs, and functions.
6. **MakeCode.** Arcade and micro:bit, self-hosted, in controller mode with
   the project saved in Farida and the language set per lesson. Done for
   the micro:bit: a project question can be a micro:bit project, on a
   package of its own (`packages/makecode`). Students build it in the
   board's own editor, with blocks, JavaScript or Python and the board
   that runs them on screen, in Arabic or English after the page. The
   files host serves the editor from two pinned npm packages, as in
   [../operations.md](../operations.md), with nothing of it reaching
   Microsoft. The project is the editor's few text files, so it is kept as
   the student builds, handed in, marked, shown in the class gallery and
   read on the live view as any project is; a teacher builds the starter
   in the same editor, and opens a student's where nothing can be changed.
   A project opens in the language it was last worked in, which is how a
   teacher's starter sets it for a class. The compiled program is saved as
   a `.hex` file to copy onto a board. A teacher can hold a question to
   blocks, JavaScript or Python alone: the hold is written into the
   project students start from, which is where the editor reads it, and it
   then offers no way into the other two. The server holds whatever files
   reach it for such a question the same way. Not done: flashing over USB,
   and extensions that need Microsoft's compile service. Arcade is blocked: its simulator comes from a private
   repository and is not published for anyone else to host.
7. **Scratch**, decided 2026-10-03: the real Scratch editor, framed. Done: a
   coding question kind (`scratch`) whose teacher builds the starter in the
   studio, whose students build on it and hand in an `.sb3` with their stage,
   and whose teacher opens, runs and marks the project; the files host
   serves the studio on its own domain, as in
   [../operations.md](../operations.md). The media library is mirrored and
   the studio may reach only the files host; below 1024px wide it asks for a
   computer or a tablet held sideways; the file sweep keeps each student's
   last three saves of a question. Done next: a coding question can have a
   class gallery, as a project of files can. A student offers the project
   as they last saved it; once their teacher shows it, classmates who have
   saved a project of their own may open it, look inside, and build on it,
   which opens it in their own studio and saves it as theirs. Each save
   from then on names the classmate, and the server keeps the name only
   while that classmate's project is in the gallery or the save before
   said the same. A project in the gallery is a file, so it opens to those
   classmates alone and is kept from the sweep while it is offered or
   shown. The Right now tab shows each coding project's stage as last
   saved, to open and run for the room. A change made in the studio is
   told to the page at once, so one made a moment before Done is saved.
   Done after it: a teacher says what a finished project does, picked
   from ten things a project can be read for: it starts with the flag,
   repeats, chooses, keeps a number in a variable, sends a message that is
   heard, has two sprites, answers a key or a click, plays a sound, uses a
   block of the student's making, makes clones. The server reads each
   saved project for them, counting only blocks that run, and the student
   and the teacher see which are there; the list prints with boxes to
   tick. They give no points. Dr. Scratch scores projects this way, and
   its scores differ by the kind of project and from what a teacher judges
   of the same work, so here they are a list to work to and to mark
   beside. The same reading notes what is worth a second look, for the
   student and the teacher alike: a message sent that no script hears or
   heard that nothing sends, a key or a touch checked once straight after
   the flag, and a "forever" inside another loop. These are the mistakes
   beginners make most (LitterBox's bug patterns), put as what the project
   does. Next: Text to Speech and Translate on Farida's own services, and
   tutorials self-hosted on the media service.

Video phases 1 to 4 and coding phases 1 to 3 need no new infrastructure;
video phase 6 needs ffmpeg on the worker, coding phase 4 the sandbox domain.
