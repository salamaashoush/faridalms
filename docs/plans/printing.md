# Printing documents

Research: the print and attendance notes kept in the research scratch, summarised
here. Schools still hand out paper: worksheets, homework, quizzes, letters home.
Every document is written in the one editor, so printing is a way of rendering
that document, not a second worksheet builder (Wordwall prints each activity as
its own worksheet the same way).

## Decisions

- **One document, a paper form per block.** Text, pictures and tables print as
  they read. Each question kind has a paper form built from the same structured
  question the player marks:
  - choice: lettered options with an empty circle or box
  - typed and number answers: a write-on line or box
  - written: ruled lines, or a drawing frame
  - gaps: blanks sized to the answer
  - matching: two columns with a box for the letter
  - ordering: a box for each number
  - sorting: a column per group under a word bank
  - counting: the things to count, or ten frames to colour
  - tracing: the teacher's model, dotted
  - word builder: letter boxes under a tile bank
  - find on a picture: the picture, to circle on
  - a Scratch project: a note to build it on a computer, with a QR code
- **What cannot print as it reads has a paper form too,** wherever it sits:
  at the top of the document or inside a column, a callout, a toggle or a
  student's copy.
  - a picture or a drawing: itself, at the size it was given, loaded before
    the pages are counted
  - a video: its name, a frame of it where there is room, its chapters, and
    a QR code to the document online
  - a sound recording: its name and the same code; what recordings say is
    printed under them when the teacher asks for transcripts
  - an embed: its provider, its title, a QR code to its own page and that
    address written out when it is short enough to type
  - a file: its name, type and size with the code; a picture kept as a file
    prints as a picture
  - code a student runs: the code, then lines to write a prediction on
    where the block waits for one, or a code to scan where it only runs
  - an AI acknowledgement: every part it holds, open
  - a link: its address after its words, when short enough to type
  - a consent form: a reply slip to fill in, sign and hand back, one for
    each child the family may answer for
- **A print preview, not a dialog of switches.** Printing opens the pages
  as they will print beside a settings panel, in the frame the site studio
  uses: paper size and orientation, text size (12, 14, 16 or 20 pt; 14 by
  default, as RNIB recommends), the school's name and logo, a Name/Class/Date
  line (on by default only when the document has questions), one named copy
  per student, and for teachers the answers: none, in place in grey, or a key
  on its own page at the end. A student's copy never carries keys, because
  the content a student receives has none. Paper words (Name, Page 2 of 3,
  the facts under the title) follow the document's language, not the
  reader's.
- **The preview is the paper.** Chrome lays each copy out as columns one
  page high that wrap onto new rows (`column-height`, `column-wrap`), on
  screen and in print alike, so the preview breaks where the paper will:
  checked across both sizes, both orientations and every text size, the
  preview's page count matches the PDF's page for page. The page margins are
  the flow's padding, cloned onto every page, and `@page` has no margin, so
  the browser has no room to print its own date and address. Each page's
  footer (the title, the student's name on a named copy, and "Page 2 of 3",
  counted per copy) is drawn on the page itself, which `@page` counters
  cannot do per copy. Browsers without `column-wrap`, chiefly Safari, fall
  back to the browser's own pagination with the same break rules and no
  footer.
- **Where a page may end:**
  - never inside a question, picture, table row, callout, quote, code block
    or column layout; a question moves whole to the next page;
  - never straight after a heading, or after a table's header row;
  - never leaving a single line of a paragraph alone (`orphans`, `widows`);
  - a picture is never taller than a page, and a long table or code block
    flows on rather than being cut, since a box that scrolls cannot split;
  - a page-break block starts a new page, and one with nothing before it,
    another right after it, or nothing after it is dropped, with the empty
    lines around it, so no blank page prints;
  - a named copy and the answer key each start a new page.
  - Chrome repeats a table's header on a new page but not in a new column,
    so in the paged layout the header prints once, kept with its rows, and
    the paper keeps matching its preview.
  - a rule beside a page break goes with the empty lines there, since it
    would print on a page of its own.
- **Nothing is wider than the sheet.** A printer that meets anything wider
  shrinks every page to fit it. A table with set column widths gives each
  column its share of the page instead, and what still runs over is cut.
- **A line is as tall on paper as on screen.** A line set in two fonts is as
  tall as both need, by an amount that differs between a screen and a
  printer; a reader's code block did that, and a page of code broke one
  place in the preview and another on paper. Blocks keep one font a line.
- **Printing waits for the pictures,** up to eight seconds, since a picture
  still loading prints as an empty box and moves every page after it.
- **Print is always light,** since a class-based dark theme prints dark.
- **Where it prints:** every page that shows a document, writer's or
  reader's: the editors, announcement and news pages, an event, an
  assignment's record and a student's view of it (the brief, and their own
  work), the lesson player and preview, and a family's consent forms. A
  bilingual document prints the language on screen.
- **Later:** a server-rendered PDF for class sets, and for iPad Safari, which
  prints without footers today.
