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
   more. An optional skip setting and the young children's pause remain.
5. **Teacher insight.** Drop-off, rewind peaks and each answer with its time,
   per class and per student. Done: a module's Videos tab shows, for each
   recording, how many of the class watched each moment, where it stops for
   questions, and how much each student watched, least first. Rewind peaks
   need play counts per moment, which watches do not keep yet.
6. **Pipeline**, decided 2026-10-03: our own media service, in Rust.
   Resumable upload, ffmpeg to HLS (360, 540, 720p and audio only), a
   thumbnail sprite and poster, stored through the file store and streamed
   behind sealed links as the files host serves files. It pulls jobs from
   the API and holds no database role. Done: `apps/media` encodes and
   serves, the API queues each new video on its file and hands out sealed
   stream links, and the media player streams with captions; resumable
   upload, deleting streams with their file, and hosted adapters remain.
7. **Captions and chapters.** Whisper drafts captions on the worker for the
   teacher to approve in the existing captions editor; chapters edited on the
   timeline and shown on the scrub bar.
8. **Teacher studio and student replies.** Record camera, screen and voice in
   the browser, trim, publish; the same recorder gives students a video or
   audio answer kind.

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
   much output. Turtle drawing and keeping a student's changes remain.
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
   student's language. JavaScript exercises, hints in order and every run
   kept remain.
4. **Projects and the sandbox domain.** A multi-file HTML, CSS and JavaScript
   or Python (turtle, p5.js) project with live preview on the separate
   domain, autosaved as the student's work, a class gallery with remix, and
   the teacher's live view of the class.
5. **Blocks puzzles.** Our Blockly puzzle engine and level packs (paths,
   loops, turtle art, events, music) in Arabic and English, an arrow-path
   activity for early years, and unplugged versions through print.
6. **MakeCode.** Arcade and micro:bit, self-hosted, in controller mode with
   the project saved in Farida and the language set per lesson.
7. **Scratch**, decided 2026-10-03: the real Scratch editor, framed. Done: a
   coding question kind (`scratch`) whose teacher builds the starter in the
   studio, whose students build on it and hand in an `.sb3` with their stage,
   and whose teacher opens, runs and marks the project; the studio lives in
   its own AGPL repository (`farida-scratch`) and is set up as in
   [../operations.md](../operations.md). The media library is mirrored and
   the studio may reach only its own origin; below 1024px wide it asks for a
   computer or a tablet held sideways; the file sweep keeps each student's
   last three saves of a question. Next: Text to Speech and Translate on Farida's own services, tutorials
   self-hosted on the media service, project checks a teacher can turn on,
   and a class gallery with remix.

Video phases 1 to 4 and coding phases 1 to 3 need no new infrastructure;
video phase 6 needs ffmpeg on the worker, coding phase 4 the sandbox domain.
