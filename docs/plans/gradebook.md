# Gradebook

The teacher's gradebook (`/gradebook`) put a class's students against its
work, a calculated percentage, a term grade field and a wide comment field,
with Save grades, Use calculated grades and Release grades stacked under the
table and a hint about the arrow keys between them. It looked like no other
portal page: its actions sat at the foot instead of the header, its table
had none of the portal's table frame, and a result students could not see
yet was set in italic with nothing saying so. This is the research behind
its redesign, the decisions taken, and what is left. The rules it led to are
in `docs/design-system.md` under "Work entered as the job: the gradebook".

## What other gradebooks do

Read from each product's own help pages where they are public, otherwise
from district training guides (marked). Read on 2026-11-09.

### Canvas

Sources: community.instructure.com Instructor Guide, "How do I use the
Gradebook?" (ta-p/701) and kb articles 660840 (icons and colours), 660846
(post grades), 660848 (change status), 660860 (final grade override),
664338 (status icons); `Gradebook.tsx` in instructure/canvas-lms for the
frozen columns.

- Students are rows and assignments columns. The student column and
  custom columns such as Notes are frozen while the rest scrolls. Total is
  last by default; its menu can move it to the front, which freezes it.
- A grade is typed in the cell; the Grade Detail Tray, a side tray,
  holds the grade, the status, the comments and the next student. Typing
  `EX` excuses and `MI` marks missing.
- Final Grade Override is a column at the far end, after Total, so the
  calculated and the given grade sit side by side.
- Saving is per cell; there is no Save button (Stonehill's guide, a
  secondary source: "clicking anywhere outside the cell saves").
- Posting is deliberate when the policy is Manual: Post grades in the
  assignment's header menu opens a tray (everyone, graded only, sections)
  and nothing posts until Post. Hidden grades carry an eye icon on the
  column header and a dot in each cell.
- Statuses: Late blue, Missing red, Resubmitted green, Dropped orange,
  Excused yellow, each with an optional icon for colour-blind readers; the
  colours are explained in Settings, not on the grid.
- Phones: no grid. The Teacher app grades one assignment, one student at a
  time.
- Enhanced Gradebook Filters (on for everyone since August 2023) are saved
  presets of sections, grading periods, modules and statuses.

### Google Classroom

Sources: support.google.com/edu/classroom/answer/9199710 and 6020294.

- Students are rows, work columns, the overall grade next to the name.
  A grading-period filter chooses which work counts.
- Typing in a cell saves a draft grade; Tab or Enter moves on. There is
  no Save button.
- Return, in the work's menu, confirms and sends the grade; students see
  nothing before. A draft grade is green, a returned one black.
- Phones: open the work, pick a student, add a grade, return.

### Schoology

Sources: uc.powerschool-docs.com/en/schoology/latest (grade student work,
final grade settings, exceptions, review and organise grades).

- Grades save as a cell is changed.
- Course and grading-period override columns, marked with an icon; a blank
  override falls back to the calculated grade.
- Exceptions (absent, collected, exempt, incomplete, missing, late) are
  icons in the cell; comments attach to the cell and to the overall grade.

### PowerTeacher Pro

Sources (PowerSchool's own pages need a login): Nova Scotia's "Scoring
assignments" and "Using the scoresheet" guides (ednet.ns.ca), SCCPSS's
score inspector page.

- The course grade is the first column after the names.
- A score is typed in the cell or in the Score Inspector, a right-hand
  panel with arrows to the next student, codes, flags, fill down and a
  comment.
- An overridden final grade shows the calculated one under its field and a
  small triangle in the cell's corner.
- An explicit Save Scores button, the one product here that has one.
- Flags: Missing, Incomplete, Late, Absent, Exempt, Collected, each a
  coloured glyph.

### Toddle, ManageBac, Seesaw, Microsoft Teams

Sources: support.toddleapp.com article 9595291 (override); ManageBac
help articles 360019106591 and 360019109591; help.seesaw.me 360060511831
and 39981062552717; Microsoft support "Track student progress in the
Grades tab" and "Grade, return and reassign assignments".

- Toddle shows an overridden grade in yellow with the calculated one in its
  corner.
- ManageBac saves as you type, with a ring round the student's name and an
  "Auto-Saved" message, and asks you to wait for it before leaving. Term
  grades are set by the teacher's judgement with the calculated progress
  beside them, a comment box per student, and reach families only in
  reports.
- Seesaw's grades become visible on approval; its grid marks not started,
  draft, waiting and approved with distinct glyphs.
- Teams saves feedback as you go and returns work with Return at the top of
  the page; graded students are ticked and can be unticked.

### Nielsen Norman Group

Sources: nngroup.com/articles/data-tables and /mobile-tables.

- Freeze the header row and the identifying column when a table is larger
  than the screen; highlight the row being pointed at.
- Inline editing suits narrow edits; for a whole record, a non-modal side
  panel beats a modal, which hides the records around it.
- On phones, hold the headers and the first column, or let people choose
  what to see.
- No NN/g article settles autosave against an explicit Save.

### What they share and where they differ

Shared: students down, work across; a held student column; typing in the
cell and a side panel for the rest of a student's record; the calculated
grade kept in view when it is overridden; statuses that do not rely on
colour alone; release as a deliberate act; and no grid on a phone.

Different: the overall grade first (PowerTeacher Pro, Classroom, Teams) or
last (Canvas, which lets it move to the front); saving per cell (Canvas,
Classroom, Schoology, ManageBac, Teams) or with a button (PowerTeacher
Pro); visible at once (Canvas automatic, ManageBac) or held until released
(Classroom, Teams, Seesaw, and this platform).

## Decisions

- **The portal's table, extended once.** The grid is `DataGrid` with a new
  `frame="table"`: the same bordered card, tinted header and 48px rows as
  `DataTable`, the header row held at the top while the rows scroll within
  the window and the student column held at the start (Canvas, NN/g), and
  the row tinted while pointed at or edited. It lives in `packages/ui`, so
  any later grid of people against work uses it.
- **Calculated, then Term grade, right after the name.** The term grade is
  what the page is for, so it is in view without scrolling, as in
  PowerTeacher Pro and Classroom; the calculated grade sits before it as
  the suggestion it decides from (Canvas's Total beside its override).
- **An override is marked, not hidden.** A term grade that differs from
  the calculated one carries the grid's changed dot (PowerTeacher Pro's
  triangle, Toddle's yellow), the focused cell's line says the calculated
  grade and offers Put it back, and the panel's field says it in its hint
  with "Use the calculated grade".
- **Saved as typed.** Every product but PowerTeacher Pro saves per cell,
  and the platform's editors already autosave (`useAutosave`). A changed
  row saves 0.8s after typing stops; the header says Saving…, Saved or
  Couldn't save with Retry (ManageBac's Auto-Saved); Ctrl/Cmd+S saves now;
  leaving with a save waiting asks. A grade over 100 is marked as typed and
  listed under the grid with a link to its cell, and it is held back while
  every other row saves. Save grades is gone.
- **Comments live with the student.** A term comment is a few sentences,
  which the design system keeps out of table columns. It is written in the
  student panel and shows under the student's name as one muted line
  (`CellWithNote`), as Canvas's tray and PowerTeacher Pro's inspector hold
  theirs.
- **One student at a time in a side panel.** The student's name opens a
  `SidePanel` (Canvas's grade detail tray, PowerTeacher Pro's score
  inspector, NN/g's non-modal panel): the term grade, the comment, every
  result, and the previous and next student. It is docked beside the grid
  from 1024px and a sheet below, and its student is in the address.
- **Phones get a list of students.** Below 768px the grid gives way to a
  list of students with their term grade and calculated grade, each opening
  the same panel from the bottom: no product offers its grid on a phone.
- **Release is the header's one action, confirmed.** Release grades is the
  filled button in the header only while a saved grade waits for it, and it
  confirms with the count and what families will be told. It saves anything
  still waiting first. Use calculated grades is in the header's `•••` menu
  and confirms, since it replaces every typed term grade that has a
  calculated one. Neither confirmation is red.
- **Statuses in words and marks with a legend.** A result shows its score,
  with a clock when it came in late and an eye struck through while the
  student cannot see it. Without a score it says To grade (handed in),
  Missing (past the student's own due date with nothing in) or Excused, and
  work not set for that student says Not assigned. The legend under the
  grid names each mark on screen and a screen reader hears the same words
  in the cell. The italic is gone.
- **Each result opens its grading.** A handed-in result links to the
  grading view for that student and work, and each work's heading opens the
  work, so the gradebook is a way into grading rather than a dead end.
- **Scope.** Class and Term are scope facets with their defaults (the
  teacher's first class, the term under way), so both stay in the toolbar
  on a phone and Reset returns to them.

## What changed in the data

- `classResults` (`packages/database/src/stores/gradebook.ts`) now says
  whether each student handed the work in and when it is due for them (an
  extension or the work's date); the API derives `missing` with the
  platform's grace period (`isLate`).
- `classBook` returns `currentPeriodId`, the term the book opens on, which
  the Term facet takes as its default.
- Saving sends only the rows that changed. The API already took any subset
  of a class's students, so no endpoint changed.

## Kept

Every term grade, comment, calculated grade, release, use of the calculated
grades, the range check, the
closed-year read-only view, the leave guard, the `submissions:grade` page
gate and the API's class reach are as they were.

## For the owner to decide

- Release sends every waiting grade in the class at once, as before.
  Classroom and Teams return per student; a per-student release from the
  panel would need a `studentIds` filter on `releasePeriod`.
- Two teachers editing one class's term grades at once still overwrite each
  other row by row, as the old Save did for the whole sheet. Rows carry no
  version yet.
- Late work is shown but not penalised, and Missing does not count as zero
  in the calculated grade; Schoology counts missing as zero by default.
- There is no class average row or per-work statistics (Teams shows a class
  average at the top).
