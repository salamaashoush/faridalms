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

| #   | Editor                                   | Where                                                     | State                                          |
| --- | ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| 1   | Reading norms                            | `apps/web/src/components/reading/ReadingNorms.tsx`        | Rebuilt: read view, Edit, groups, source marks |
| 2   | Gradebook term grades                    | `apps/web/src/routes/_app/_staff/gradebook.tsx`           | Rebuilt: calm cells, range check, leave guard  |
| 3   | Grade bands                              | `apps/web/src/components/grading/ScalesTab.tsx`           | Rebuilt: per-cell checks, scores covered       |
| 4   | Grading categories (weights)             | `apps/web/src/components/grading/ProgrammesTab.tsx`       | Rebuilt: per-cell checks, Total row            |
| 5   | Rubric (criteria by levels)              | `apps/web/src/components/coursework/RubricSheet.tsx`      | Left                                           |
| 6   | Intake checklist, fees and priorities    | `apps/web/src/components/admissions/IntakeEditor.tsx`     | Left                                           |
| 7   | Periods                                  | `apps/web/src/components/years/YearPeriods.tsx`           | Left                                           |
| 8   | Invoice and credit note lines (console)  | `apps/ops/src/components/InvoiceLinesForm.tsx`            | Left                                           |
| 9   | Quote and provisioning add-ons (console) | `apps/ops/src/components/QuoteForm.tsx`, `provisioning.*` | Left                                           |
| 10  | Bell schedule extras                     | `apps/web/src/components/years/BellSchedules.tsx`         | Left                                           |
| 11  | Prices (console)                         | `apps/ops/src/components/PriceFields.tsx`                 | Left                                           |
| 12  | Feedback bands                           | `apps/web/src/components/learning/FeedbackBands.tsx`      | Left                                           |
| 13  | Rollover classes                         | `apps/web/src/components/years/Rollover.tsx`              | Left                                           |
| 14  | Previous schools (apply)                 | `apps/web/src/components/admissions/ApplicationForm.tsx`  | Left                                           |
| 15  | Hosts in provisioning (console)          | `apps/ops/src/routes/provisioning.$draftId.tsx`           | Left                                           |
| 16  | Schools in a school spec (console)       | `apps/ops/src/components/SchoolSpecForm.tsx`              | Left                                           |
| 17  | Limits (console)                         | `apps/ops/src/components/LimitFields.tsx`                 | Left                                           |
| 18  | Social links                             | `apps/web/src/components/site/SiteSettings.tsx`           | Left                                           |
| 19  | Audience list                            | `apps/web/src/components/broadcasts/AudienceList.tsx`     | Left                                           |
| 20  | Class subjects                           | `apps/web/src/components/classes/ClassEditor.tsx`         | Left                                           |
| 21  | Guardians                                | `apps/web/src/components/people/StudentEditor.tsx`        | Left                                           |
| 22  | Notification preferences                 | `apps/web/src/routes/_app/notification-preferences.tsx`   | Fine                                           |
| 23  | Module toggles (console)                 | `apps/ops/src/components/ModuleFields.tsx`                | Fine                                           |
| 24  | Role capabilities                        | `apps/web/src/components/admin/AccessRolesPanel.tsx`      | Fine                                           |
| 25  | Attendance register                      | `apps/web/src/components/attendance/Register.tsx`         | Fine, the model for work entered as the job    |

## What the ones left need

- **Rubric**: a criteria by levels matrix with the level names as columns
  and points in each column's header, descriptions as cells; today each
  criterion is a stack of boxes and levels cannot be compared across.
- **Intake**: the fees are a fixed list of money figures (`NumberCell`
  with a currency); the checklist is like rows with kind and required.
- **Periods and bell extras**: one row per period with start and end time
  cells and the weekdays as a compact toggle row; needs a time cell.
- **Invoice lines, add-ons, prices (console)**: like rows with quantity,
  price and discount as figure cells and the line's net worked out beside
  it, then a Total row; the description goes on the row's second line.
- **Feedback bands**: like bands, from-score and message, with the range
  covered beside each.

## For the owner to decide

- Percentiles that fall along a row are now refused by the server too. A
  school that had saved falling figures must fix them before it can save
  again; none of the seeds do.
- Enter moves down a column in every grid, as in a spreadsheet, rather
  than submitting the form, so saving is always the Save button.
