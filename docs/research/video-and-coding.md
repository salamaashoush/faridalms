# Video and coding lessons: what works, what to use, what to build

Written 2026-10-03. It follows [course-design.md](course-design.md), which
already covers interactive video as a block (questions at timestamps,
skip prevention, captions), and does not repeat it. Section 1 is the evidence,
section 2 the tools checked at their source, sections 3 and 4 what Farida
builds for video and for coding, section 5 the calls only the owner can make.
Licences and activity were read from each project's repository and the npm
registry on 2026-10-03.

## 1. What the evidence says

### Video

- **Short beats long.** Across 6.9 million edX sessions, video length was
  "by far the most significant indicator of engagement"; viewers rarely
  finished anything past nine minutes, so the authors advise six minutes or
  less, a talking head cut with the material, and a fast, enthusiastic voice
  (Guo, Kim and Rubin 2014, Learning@Scale,
  https://www.semanticscholar.org/paper/409090a8fa7edfededc03c396a16f6f57144270c).
- **Questions inside the video work.** Short tests between lecture segments
  halved mind wandering, tripled note-taking and improved final recall
  (Szpunar, Khan and Schacter 2013, PNAS,
  https://www.pnas.org/doi/pdf/10.1073/pnas.1221764110).
- **Where students rewind is where they struggle.** Second-by-second data from
  862 edX videos: 61 percent of interaction peaks sit on visual transitions,
  and replays cluster on missed or non-visual explanations (Kim, Guo et al.
  2014, https://dash.harvard.edu/handle/1/30856855). A teacher wants that map.
- **Design for cognitive load and active viewing.** Signal, segment, weed out
  extras, match words to pictures, and give viewers a task while they watch
  (Brame 2016, CBE Life Sciences Education,
  https://www.semanticscholar.org/paper/f40dd059283c0a6308b955de38e7aae72172f5fa).
- **Young children learn from video they act on, not video they watch.**
  Toddlers learned new verbs only from socially contingent video (Roseberry,
  Hirsh-Pasek and Golinkoff 2014,
  https://onlinelibrary.wiley.com/doi/abs/10.1111/cdev.12166), and children
  who had to touch the screen to advance a video learned more than those who
  watched it (Kirkorian, Choi and Pempek 2016,
  https://srcd.onlinelibrary.wiley.com/doi/abs/10.1111/cdev.12508). For the
  youngest, every video needs something to tap, say or draw.

### Coding

- **Read before you write (PRIMM).** Predict, Run, Investigate, Modify, Make
  counters novices writing programs before they can read them; trialled with
  about 500 students aged 11 to 14, teachers valued its structure and its
  differentiation (Sentance, Waite and Kallia 2019, Computer Science
  Education, https://computingeducationresearch.org/projects/primm/).
- **Parsons problems teach as well as writing code, in less time.** Ordering
  given lines (with distractors) took significantly less time than fixing or
  writing the same code, with no difference in learning or one-week
  retention (Ericson, Margulieux and Rick 2017,
  https://www.semanticscholar.org/paper/2f1b7c75a3cc2f33fc34575bbe77eeb1f336debc).
- **Blocks first, then text, with a bridge.** In a five-week high-school study
  the blocks group gained more and wanted more computing; the text group felt
  closer to real programming (Weintrop and Wilensky 2017,
  https://terpconnect.umd.edu/~weintrop/papers/Weintrop_Wilensky_TOCE_2017.pdf).
  A blocks-and-text view of the same program is the bridge.
- **Use, modify, create.** Starting from a working program the learner changes
  before writing their own is the progression behind PRIMM, Code.org and
  MakeCode tutorials; it maps onto our lesson blocks directly.

### What kids actually do

Kids return to what lets them make something that is theirs and show it:
Scratch's remix culture, MakeCode Arcade's games, a turtle drawing. Puzzles
(Code.org, Blockly Games) teach a concept fast but run out; projects keep
them. A best-in-class system gives both, in the child's language, on the
devices schools have (Chromebooks, iPads, cheap Android phones).

## 2. Tools, checked at the source

### Video

- **Player: Video.js 10** (`@videojs/react` 10.0.1, Apache-2.0, GA on
  2026-10-01). The rebuild merged Video.js, Plyr, Vidstack and Media Chrome
  into one React-first player of unstyled parts, the same model as Base UI.
  Read in its repository (github.com/videojs/v10): an Arabic locale, captions
  menu, chapters on the time slider, thumbnails, playback rate, hotkeys,
  gestures, a status announcer, picture-in-picture, quality selection, and a
  played-ranges tracker. Media adapters for HLS (hls.js and native), DASH,
  YouTube, Vimeo, Cloudflare Stream and Mux, so one player, one progress
  model and one question timeline for uploads and for YouTube alike.
- **YouTube's rules** (Required Minimum Functionality): "You must not display
  overlays, frames, or other visual elements in front of any part of a
  YouTube embedded player, including player controls", and the player is at
  least 200 by 200 pixels. Questions and our own controls for a YouTube video
  therefore sit beside or below it, never over it.
- **Streaming.** `hls.js` 1.7 (Apache-2.0) plus ffmpeg on the worker turns an
  upload into adaptive HLS. Hosted alternatives, list prices on 2026-10-03:
  Cloudflare Stream $5 per 1,000 stored minutes a month and $1 per 1,000
  delivered; Mux $0.003 a stored minute a month, $0.001 a delivered minute
  after 100,000 free a month, auto captions included; Bunny Stream from $0.01
  a stored GB and $0.005 a delivered GB. For one 800-student school (about
  2,400 stored minutes, 38,000 watched a month) that is roughly $50 on
  Cloudflare, $7 on Mux, and under a dollar of storage on our own pipeline,
  which also keeps video in the country of a cell that requires it.
- **Captions.** whisper.cpp and faster-whisper (MIT) run on the worker;
  transformers.js 4 (Apache-2.0) can run Whisper in the teacher's browser.
  Arabic quality: about 10 to 16 percent word error on Modern Standard Arabic
  (FLEURS), but 65 percent on Egyptian, 61 on Gulf
  (https://arxiv.org/pdf/2511.18774) and 66 on children's speech
  (https://arxiv.org/pdf/2510.23319). Drafts are worth making; a teacher
  always reviews them, and dialect videos need real editing. The captions
  editor already exists on the media block.
- **Student video replies have no home.** Microsoft retired Flip on
  2024-09-30, keeping only a reduced camera inside Teams
  (https://en.wikipedia.org/wiki/Flip_(software)). Seesaw and Teams own the
  rest. A recorded reply as an answer kind fills a real gap.

### Coding

- **Blockly** 13.3 (Apache-2.0, active): the block editor behind Code.org,
  MakeCode and App Inventor, with an Arabic message file and a right-to-left
  workspace. **Blockly Games** (Apache-2.0, last push 2024) shows the puzzle
  progression (maze, bird, turtle, movie, music) but is unmaintained; we take
  the ideas, not the code.
- **Scratch.** The editor, VM, renderer and paint moved into the
  `scratch-editor` monorepo under **AGPL-3.0**; the old `scratch-gui` and
  `scratch-vm` repositories are archived. **`scratch-blocks` is still
  Apache-2.0** (its LICENSE file, read 2026-10-03): the Scratch look of blocks
  is free to use, the engine that runs projects is not. TurboWarp is
  GPL-3.0, Snap! AGPL-3.0. Embedding a shared project from scratch.mit.edu is
  allowed and costs nothing, but needs Scratch accounts and public projects.
- **MakeCode** (`pxt` and `pxt-arcade`, MIT, active): blocks, JavaScript and
  Python views of one program, a game engine (Arcade) and micro:bit. Read in
  its source: a controller mode where the host page loads and saves the
  project (`workspacesync`, `workspacesave`, `importproject`), and can also
  start tutorials, restrict the language to blocks, JavaScript or Python, run
  an evaluation and stop the simulator. `pxt staticpkg` builds a static copy
  we can host ourselves, so student work stays in Farida.
- **Text editors.** CodeMirror 6 (MIT, `@codemirror/view` 6.43, published
  2026-09) works on phones and with screen readers and handles mixed
  direction per line; its GitHub repository is archived, but the npm
  packages are current.
  Monaco (MIT) is heavier and poor on touch.
- **Running code.** Pyodide 314 (MPL-2.0; an 8.6 MB WebAssembly core,
  cached after the first load) runs real CPython in a Web Worker; it has no
  turtle, so we write a small canvas turtle. Skulpt (MIT) has not published
  to npm since 2022. p5.js 2.3 (LGPL-2.1, loaded unmodified inside the
  preview) suits creative coding. Student HTML, CSS and JavaScript run in a
  sandboxed frame on a separate registrable domain, so a page can never read
  Farida's cookies or storage and an endless loop stays in its own process;
  loop guards inserted with acorn (MIT) stop the loop itself.

## 3. Video in Farida

Use Video.js 10 and our own HLS pipeline; build everything that teaches.

1. **One player** for uploads, YouTube and Vimeo, skinned with our tokens,
   Arabic and right-to-left, captions on by default when the reader's
   language differs from the video's, speed, chapters, thumbnails while
   scrubbing, and resume where the student stopped.
2. **Transcript beside the video**: follows playback, click to jump, search;
   it doubles as the WCAG text alternative and as revision notes.
3. **Watch progress** from played ranges, kept server-side, as a completion
   rule and as a gate ("watch this before the questions open"), never
   counting skipped parts.
4. **Questions in the video** (course-design.md B): the existing question
   blocks placed on the timeline, pausing the video and shown beside it;
   rewatch-from on a wrong answer; skip prevention as a setting. For young
   children: tap, say or draw at a pause, picture answers and narration, per
   the contingency evidence.
5. **Do-while-watching tasks**: a prediction before a segment, a drawing on
   the paused frame, a private note stamped with the time.
6. **Teacher insight**: where students stopped, where they rewound (the
   confusing moments), and each answer with its time, per class and student.
7. **Teacher studio**: record camera, screen and voice in the browser, trim,
   get a caption draft and suggested chapters, publish; a Loom for lessons
   with the data kept in the school.
8. **Student replies**: a video or audio answer kind, recorded in the
   browser, with the same review and family-visibility rules as other work.
9. **Pipeline**: resumable upload, ffmpeg to HLS at 360, 540 and 720p plus an
   audio-only rendition for weak connections, a thumbnail sprite and poster,
   stored through the file store adapter and served with signed links. A
   hosted service (Mux, Cloudflare) becomes another adapter later.
10. **Safety for children**: youtube-nocookie, no autoplay into the next
    video, nothing shown from a platform's recommendations.

## 4. Coding in Farida

Bands, curriculum-neutral (IB PYP and MYP, Cambridge Primary and IGCSE
Computer Science, American CSTA and AP CSP):

- **Ages 4 to 7**: sequencing with arrows and pictures as an early-years
  activity (a bee-bot path, tap the steps), and unplugged sheets through the
  print module.
- **Ages 7 to 11**: Blockly puzzles in Arabic and English (paths, loops,
  turtle art, events, music), then making stories and games.
- **Ages 10 to 14**: MakeCode Arcade and micro:bit for games and devices, a
  Scratch-style studio for animation and stories, and the first text with
  PRIMM in Python turtle and HTML.
- **Ages 13 to 18**: Python and the web (HTML, CSS, JavaScript), exercises
  with tests, projects, and exam-style tracing for IGCSE and IB.

Build, in the one document model (every piece is an editor block):

1. **Runnable code block** with a Predict step: the student commits a
   prediction (an existing question kind) before Run reveals the output. This
   is PRIMM's first half in one block.
2. **Parsons question kind**: shuffled lines, indentation for Python,
   distractors, marked like any question, printable.
3. **Code exercise block**: starter code, visible and hidden tests run in a
   Worker (Pyodide or a JavaScript sandbox), hints that unlock in order,
   friendly error messages in Arabic and English, every run saved so the
   teacher can replay how the student got there.
4. **Project block**: a multi-file HTML, CSS and JavaScript or Python project
   with live preview on the sandbox domain, autosaved as the student's work,
   shared to a class gallery where classmates can remix a copy.
5. **Blocks puzzle block**: our own Blockly puzzle engine with levels a
   teacher picks, the Scratch look from `scratch-blocks` if wanted, Arabic
   right-to-left, and a printable unplugged version.
6. **MakeCode block**: Arcade or micro:bit in controller mode, project saved
   in Farida, language restricted per lesson, tutorials as the lesson's steps.
7. **Teacher live view**: every student's code or blocks in a grid, who is
   stuck (no run for minutes, the same error), show one on the projector.

## 5. Owner calls

- **Scratch.** Either (a) embed shared scratch.mit.edu projects and build our
  own Scratch-style studio on `scratch-blocks` (Apache-2.0) with our own
  runtime, or (b) host the real Scratch editor (AGPL-3.0) in its own frame on
  the sandbox domain, publishing our save integration as a public fork.
  Farida's code stays outside the AGPL either way, since it only talks to the
  frame by messages; (b) gives children the editor and media library they
  already know, (a) keeps everything under our licence and design.
- **Video hosting.** Our own pipeline by default (recommended: cheapest,
  in-country), with Mux or Cloudflare as an optional adapter per cell.
- **The sandbox domain.** Student code needs a second registrable domain
  (for example `farida-usercontent.org`) that the owner registers and points
  at the cell.
