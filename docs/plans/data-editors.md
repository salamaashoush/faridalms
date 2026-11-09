# Data editors

Grids of inputs, repeating rows of fields, matrices and lists of rule rows
in the portal and the console, ranked by how badly they serve the person
using them, and the patterns that replace them. The rules themselves are
in `docs/design-system.md` under Data editors; this file is the reasoning
and the work list.

## What strong products do

- **Carbon (data table) and Polaris (IndexTable).** Carbon separates
  editing one cell from editing a whole table: a table of settings is read
  first and put into an edit mode with Save and Cancel as a batch. Polaris
  keeps inline fields inside index rows only where the field is the work
  (a price, a quantity), and draws them borderless until hovered.
- **Shopify's variants editor.** Rows grouped under a heading (variants by
  their first option), the group's own row carrying what applies to all of
  them. This is the model for a grade's three times of year.
- **Airtable, Notion, Google Sheets.** Cells look like text until hovered
  or focused; arriving at a cell selects it, so typing replaces it; arrows
  and Enter move between cells; F2 or a click edits the text in place;
  Escape undoes the cell.
- **WAI-ARIA data grid.** A true grid has one tab stop and arrow keys for
  the rest. Our grids are forms first, so every cell stays a field in the
  tab order (a screen reader reads it as a form with table headers) and
  the arrow keys are added on top.
- **Stripe's tiered pricing and Canvas grading schemes.** Each row's range
  is worked out from its neighbour and shown beside it ("70 to under 90"),
  so nobody has to infer which band a score falls in.
- **Linear and Stripe settings.** Values read as text; one Edit opens them;
  defaults are named and can be gone back to.
- **GOV.UK "Add another".** Like rows are added with a button under the
  list and removed with a link at each row's end that names the row; the
  list never shows a trash icon on rows that cannot sensibly be removed.
- **Primer saving pattern.** Explicit Save for batches, with a guard when
  leaving unsaved.

## Patterns decided

1. **Read first, Edit to change** for reference data (norms, scales,
   weights, prices, periods); always-on calm cells for work entered as the
   job (term grades, marks). Reason: settings are read far more than they
   are written, and a wall of boxes hides the figures.
2. **Grouped rows** under a heading row with the group's `•••`.
3. **Figures as text cells** (`NumberCell`): no spinners, tabular digits
   at the end, Arabic-Indic digits accepted, select on arrival.
4. **Defaults against the school's own**: a dot on each changed figure, a
   count under the grid, the focused cell's source figure with Put it
   back, a group reset in its menu and the whole reset in the footer.
5. **Adding and removing**: from a menu of what is missing for a grid of
   fixed shape; Add under the list and a named × per row for like rows.
6. **Keyboard**: arrows, Enter and Shift+Enter, F2, Escape, mirrored in
   Arabic.
7. **Validation** on Save then live, each problem linked to its cell, and
   the rule in the domain so the server agrees.
8. **390px and RTL**: five figure columns fit at 390px; wider grids scroll
   in a named region with the first column held.

All of it is `packages/ui/src/system/data-grid.tsx`.

## Ranking, worst first

| #   | Editor                                   | Where                                                     | State                                                |
| --- | ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Reading norms                            | `apps/web/src/components/reading/ReadingNorms.tsx`        | Rebuilt: read view, Edit, groups, source marks       |
| 2   | Gradebook term grades                    | `apps/web/src/routes/_app/_staff/gradebook.tsx`           | Rebuilt: calm cells, range check, leave guard        |
| 3   | Grade bands                              | `apps/web/src/components/grading/ScalesTab.tsx`           | Rebuilt: per-cell checks, scores covered             |
| 4   | Grading categories (weights)             | `apps/web/src/components/grading/ProgrammesTab.tsx`       | Rebuilt: per-cell checks, Total row                  |
| 5   | Rubric (criteria by levels)              | `apps/web/src/components/coursework/RubricSheet.tsx`      | Redesigned: a matrix, one criterion opened at a time |
| 6   | Intake checklist, fees and priorities    | `apps/web/src/components/admissions/IntakeEditor.tsx`     | Rebuilt: checklist and fees; priorities left         |
| 7   | Periods                                  | `apps/web/src/components/years/YearPeriods.tsx`           | Rebuilt: times in columns, days on each row's line   |
| 8   | Invoice and credit note lines (console)  | `apps/ops/src/components/InvoiceLinesForm.tsx`            | Rebuilt: lines with net, details on their line       |
| 9   | Quote and provisioning add-ons (console) | `apps/ops/src/components/QuoteForm.tsx`, `provisioning.*` | Quote add-ons rebuilt; provisioning add-ons left     |
| 10  | Bell schedule extras                     | `apps/web/src/components/years/BellSchedules.tsx`         | Rebuilt: day's times and own periods as rows         |
| 11  | Prices (console)                         | `apps/ops/src/components/PriceFields.tsx`                 | Rebuilt                                              |
| 12  | Feedback bands                           | `apps/web/src/components/learning/FeedbackBands.tsx`      | Rebuilt                                              |
| 13  | Rollover classes                         | `apps/web/src/components/years/Rollover.tsx`              | Left                                                 |
| 14  | Previous schools (apply)                 | `apps/web/src/components/admissions/ApplicationForm.tsx`  | Left                                                 |
| 15  | Hosts in provisioning (console)          | `apps/ops/src/routes/provisioning.$draftId.tsx`           | Rebuilt                                              |
| 16  | Schools in a school spec (console)       | `apps/ops/src/components/SchoolSpecForm.tsx`              | Left                                                 |
| 17  | Limits (console)                         | `apps/ops/src/components/LimitFields.tsx`                 | Left                                                 |
| 18  | Social links                             | `apps/web/src/components/site/SiteSettings.tsx`           | Rebuilt                                              |
| 19  | Audience list                            | `apps/web/src/components/broadcasts/AudienceList.tsx`     | Left                                                 |
| 20  | Class subjects                           | `apps/web/src/components/classes/ClassEditor.tsx`         | Rebuilt: added from a menu of subjects               |
| 21  | Guardians                                | `apps/web/src/components/people/StudentEditor.tsx`        | Left                                                 |
| 22  | Notification preferences                 | `apps/web/src/routes/_app/notification-preferences.tsx`   | Fine                                                 |
| 23  | Module toggles (console)                 | `apps/ops/src/components/ModuleFields.tsx`                | Fine                                                 |
| 24  | Role capabilities                        | `apps/web/src/components/admin/AccessRolesPanel.tsx`      | Fine                                                 |
| 25  | Attendance register                      | `apps/web/src/components/attendance/Register.tsx`         | Fine, the model for work entered as the job          |

## What the ones left need

- **Intake priorities**: an ordered list with up and down buttons; it
  wants a reorderable list (drag and the keyboard), which DataGrid does
  not do yet.
- **Provisioning add-ons (console)**: the same rows as a quote's add-ons,
  with a per-school check box group beside them.
- **Rollover classes**: a fixed list of homerooms with an include check,
  code, grade, names and teacher; a DataGrid with CheckCell, TextCell
  and SelectCell, the names on each row's own line.
- **Previous schools (apply)**: a family's form on a phone; cards suit it,
  so it stays unless the owner wants it otherwise.
- **Schools in a school spec, limits, audience list, guardians**: each
  row is a record of its own (a school, a guardian) or a dependent pair of
  choices; they read well as they are.

## Rubric

The rubric was the editor least suited to a `DataGrid`. Put into one, a
four-level criterion became a table of name and points with each
description squeezed onto the row's second line, every criterion of the
rubric open as one long form at once, and nothing in it looked like the
rubric a grader or a student meets. The research below is why it is now
its own component (`packages/ui/src/system/rubric.tsx`).

### What the products do

- **Canvas** (classic and enhanced rubrics): a matrix of criteria rows,
  ratings belonging to each criterion so criteria may differ in count,
  points on every rating and the criterion's total beside it. The
  enhanced builder edits one criterion in its own dialog: name,
  description, then each rating's points, name and description, with a
  live "Total points possible"; ratings are inserted between others and
  dragged to reorder. Criteria are edited, duplicated, deleted, and moved
  up or down from a menu or by a drag handle. Settings choose points or
  ranges ("Enable range") and the rating order, high to low or low to
  high. Rubrics are imported from another course or a CSV template.
  SpeedGrader offers three views: the grid, horizontal (criteria side by
  side), and vertical (levels stacked under each criterion); a rating is
  chosen by clicking its box, totals add up and can be overridden, and
  each criterion takes a comment.
- **Google Classroom**: each criterion is a card with its title and
  levels (points, title, description), up to 10 levels and 50 criteria,
  levels per criterion. Criteria are added, duplicated and moved up or
  down from a menu (no drag). Points can be sorted descending or
  ascending and levels sort by points. Rubrics are reused from any class
  (a copy), exported to and imported from Sheets. The grading panel
  lists criteria with their levels; one is clicked, Clear undoes it, the
  score adds up and can be overridden. On a phone criteria are collapsed
  and levels are swiped or tapped. Students see the chosen level
  outlined in colour.
- **Schoology**: a matrix edited in place: "+ Criteria" adds a row, a
  hover "+" adds a scale column, rows drag to reorder. A course grading
  scale can replace the columns. Rubrics live in Resources and copy to
  any course; grading clicks a cell per criterion, with a total
  override; "Show to students" shows it with the assignment.
- **Turnitin Feedback Studio**: standard (scale values as column
  headers, criteria weighted to 100%), qualitative and custom (points in
  every cell) rubrics and grading forms (a list with no levels); up to
  20 scales and 50 criteria; import from a spreadsheet. Marking opens a
  compact side panel listing criteria, a criterion's description shown
  below it, with a button to expand the full grid.
- **Toddle and ManageBac** (IB): rubrics as criteria rows and level
  columns with descriptors, kept in a school library of templates. MYP
  criteria A to D carry achievement-level bands (0, 1 to 2, 3 to 4, 5 to
  6, 7 to 8) with descriptors set per subject, which a teacher clarifies
  for a task; the gradebook shows the descriptors beside the work while
  marking. The help centres refuse automated reading, so these points
  come from their published summaries.
- **Microsoft Teams Assignments**: a grid of criteria rows and level
  columns shared by every criterion, points per level and optional
  weights per row that must make 100. Rows are added, copied and
  deleted. Every rubric attached is kept in the teacher's list and can
  be downloaded or uploaded as CSV. Marking shows one criterion at a
  time beside the document, the chosen cell turning blue, with a
  feedback box per criterion and the full grid a click away.
- **Brightspace**: analytic or holistic rubrics; levels are columns
  shared by every criterion (Points) or per criterion (Custom points);
  no ranges. Levels are added at either edge, criteria added, copied and
  moved up or down, and the level order can be reversed. Cells take a
  description, points and initial feedback. Marking moves a slider per
  criterion with the chosen level's description below it, and the
  level's feedback fills the criterion's comment.

Sources read: Google Classroom help on creating and grading with rubrics
(support.google.com/edu/classroom/answer/9335069 and 9335428, desktop
and Android); Microsoft's "Create and manage grading rubrics in
Microsoft Teams" (support.microsoft.com/en-us/education/assignments);
PowerSchool's Schoology "Create rubrics" and "Use rubrics"
(uc.powerschool-docs.com/en/schoology/latest); Canvas's enhanced rubrics
through university guides that mirror Instructure's articles
(ready.msudenver.edu create and grade with a rubric,
help.canvas.brown.edu, utsa.screenstepslive.com); Turnitin through City
University's guide (city-uk-ett.libguides.com); Brightspace through
Utrecht's and CUNY's guides (brightspace-support.sites.uu.nl,
openlab.sps.cuny.edu). Instructure's, D2L's, Turnitin's, ManageBac's and
Toddle's own help centres refuse automated reading; their search
summaries were used and are marked as such above.

### What they agree on

- **The matrix is how a rubric is read.** Every product shows criteria
  by levels, with points on each level and the criterion's most beside
  its name, to the teacher, the grader and the student alike.
- **Long descriptors are not written in a cell.** The products that
  handle long text well (Canvas enhanced, Classroom) take one criterion
  out of the matrix to edit it, its levels one per row with the
  description given the room.
- **Moving is a menu.** Move up and Move down sit in a criterion's menu
  everywhere; drag is the extra. Duplicating a criterion is everywhere.
- **Marking is a choice per criterion beside the work**, with the
  descriptors in view, Clear to undo, a comment per criterion and the
  total adding up but able to be overridden.
- **On a phone** criteria come one after another and levels stack.
- **Reuse is a copy**: from another class, a library or a file.

### What we decided

- **One component for every place a rubric appears**:
  `RubricMatrix` (written, read by the student and the family),
  `RubricLevelPicker` (the grader and a classmate's review) and
  `RubricLevelEditor` (a criterion's levels). An awarded level and a
  chosen one share the same outline, so the rubric a student reads looks
  like the one the teacher marked.
- **The sheet reads as the matrix** and is 960px wide, so four levels
  stand side by side with their descriptions. Each criterion has Edit
  and a `•••` (Move up, Move down, Duplicate, Remove, which asks).
- **One criterion is written at a time, in place** (Canvas's criterion
  dialog, without a second layer over the sheet): its name, its levels
  one per row (name, points, description growing with its text, each
  with Move up, Move down, Remove), then its standards, with Done and
  Cancel. Done, opening another, adding one or using the rubric checks
  it first. A new rubric opens on its first criterion with the four
  starting levels.
- **Levels stay per criterion**, as Canvas and Classroom keep them, since
  the prosody rubric and IB criteria need their own levels. Levels stand
  side by side while each gets about 9rem and stack below that.
- **The grader chooses from radio rows**, each with its points and
  description (Canvas's vertical view), in the 480px grading sheet;
  Clear takes a choice back; the score fills from the levels and stays
  editable. A classmate's review uses the same rows without points.
- **The student and the family read the whole matrix** with the reached
  level outlined and named "Awarded" (Classroom), the criterion's
  "3 of 4 points", and the grader's comment under it, instead of only
  the level reached, so they see what the next level asks for.
- **Kept as before**: every criterion, level, point value, description,
  order and standard; keeping a rubric among the teacher's own, changing
  or removing it; the ready-made prosody rubric; per-criterion comments
  and comments on passages linked to a criterion.

## For the owner to decide

- Percentiles that fall along a row are now refused by the server too. A
  school that had saved falling figures must fix them before it can save
  again; none of the seeds do.
- Enter moves down a column in every grid, as in a spreadsheet, rather
  than submitting the form, so saving is always the Save button.
- Rubrics: a level is worth one figure. Canvas offers point ranges and
  IB criteria use bands (5 to 6); either needs a change to the rubric's
  schema and to how a mark is worked out, so it waits for a decision.
- Rubrics: levels keep the order written (the starting levels run from
  the highest). Canvas, Classroom and Brightspace add a switch for the
  order; a teacher here moves levels instead.
- Rubrics: students see a rubric only once their work is returned.
  Every product reviewed lets a student read it with the brief; that is
  one `RubricMatrix` on the brief, and is the owner's call.
- Rubrics: on a phone a returned rubric shows every level of every
  criterion. Classroom collapses each criterion to its reached level;
  that would hide what the next level asks for.
