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
  - media and embeds: their caption with a QR code to the online copy
- **A short options panel** before printing: paper size and orientation, text
  size (12, 14, 16 or 20 pt; 14 by default, as RNIB recommends), a
  Name/Class/Date line, the school's name and logo, and for teachers an answer
  key on its own page at the end. A student's copy never carries keys, because
  the content a student receives has none.
- **Layout rules:**
  - A question never splits across pages (`break-inside: avoid`, which every
    engine honours).
  - Print is always light, since a class-based dark theme prints dark.
  - The document's own direction drives Arabic pages.
  - Page numbers use `@page` margin boxes; Chrome 131 and later prints them,
    and other browsers print without them.
- **Later:**
  - a page-break block
  - one named copy per student in a single print job
  - a server-rendered PDF for class sets on devices whose browsers lack
    margin boxes, chiefly iPad Safari
