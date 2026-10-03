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
   and a continue gate can wait for a video.
3. **Transcript panel** from the captions: follows playback, click to jump,
   search.
4. **Questions on the timeline.** Question blocks placed at a time inside the
   video block; the video pauses and the question opens beside it; rewatch
   from the segment on a wrong answer; skip prevention as a setting; for
   young children, tap, say or draw at a pause.
5. **Teacher insight.** Drop-off, rewind peaks and each answer with its time,
   per class and per student.
6. **Pipeline.** Resumable upload, an ffmpeg job on the worker to HLS (360,
   540, 720p and audio only), a thumbnail sprite and poster, stored through
   the file store with signed links.
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
   behind a prediction question: PRIMM's predict and run.
2. **Parsons problems** as a question kind: shuffled lines, indentation,
   distractors, marked and printable.
3. **Code exercises.** Starter code, visible and hidden tests run in the
   worker, hints in order, friendly errors in Arabic and English, every run
   kept for the teacher's replay.
4. **Projects and the sandbox domain.** A multi-file HTML, CSS and JavaScript
   or Python (turtle, p5.js) project with live preview on the separate
   domain, autosaved as the student's work, a class gallery with remix, and
   the teacher's live view of the class.
5. **Blocks puzzles.** Our Blockly puzzle engine and level packs (paths,
   loops, turtle art, events, music) in Arabic and English, an arrow-path
   activity for early years, and unplugged versions through print.
6. **MakeCode.** Arcade and micro:bit, self-hosted, in controller mode with
   the project saved in Farida and the language set per lesson.
7. **Scratch**, as the owner decides (research section 5).

Video phases 1 to 4 and coding phases 1 to 3 need no new infrastructure;
video phase 6 needs ffmpeg on the worker, coding phase 4 the sandbox domain.
