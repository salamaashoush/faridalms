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
9. **Line items are a table, not a grid**: rows a person adds one at a
   time, each with several fields (an invoice's lines, a plan's prices, a
   quote's add-ons, a school's hosts), are the standard `DataTable` with
   Add and a row menu, each row opened alone in a sheet (Console below).

Patterns 1 to 8 are `packages/ui/src/system/data-grid.tsx`; pattern 9 is
`data-table.tsx` (`RowButton`) with a `SheetForm` per row.

## Console

The console's four line editors (invoice and credit note lines, a plan's
or add-on's prices, a quote's add-ons, a new school's own hosts) were
moved into `DataGrid` with a whole-table edit mode. The owner's verdict:
these are tables, and a row is added or changed one at a time, not as one
big form. What the products an operator already knows do, and what each
editor became.

### Invoice and credit note lines

- **Stripe** edits a draft in a full-page editor: an item is added from
  "Add one-time item" or a product, with its quantity and price and an
  "Item options" disclosure for tax, coupon and supply date; anything on
  a draft may change, an open invoice only its memo and metadata, and a
  finalised one is revised as a new draft that voids the old
  ([dashboard](https://docs.stripe.com/invoicing/dashboard),
  [overview](https://docs.stripe.com/invoicing/overview),
  [edits](https://docs.stripe.com/invoicing/invoice-edits)).
- **Xero** writes lines as rows of a grid inside the document on the web,
  totals and tax worked out as you type, autosaved once a contact is set;
  its phone app adds one item at a time in a form of its own ("Add an
  item", then "Add another item" or "Done"). A draft changes freely; an
  approved invoice is edited and updated; a paid one keeps its amounts
  ([invoice a customer](https://central.xero.com/0/article/Invoice-a-customer),
  [edit an invoice](https://central.xero.com/0/article/Edit-an-invoice-US)).
- **QuickBooks Online** adds a product or service per row with
  quantity and rate; discounts are a setting
  ([create invoices](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/create-invoices-quickbooks-online/L7gSzvCld_US_en_US)).
- **Paddle** adds line items to a draft and edits it from the row menu;
  once issued "you can't make changes to it"
  ([invoices](https://developer.paddle.com/build/invoices/create-issue-invoices/)).
- **Recurly and Chargebee** do not hand-edit invoice lines at all:
  Recurly adds one charge at a time to the account (description,
  quantity, amount) and an issued invoice edits only its header
  ([adjustments](https://docs.recurly.com/recurly-subscriptions/docs/adjustments),
  [edit invoice](https://docs.recurly.com/docs/edit-invoice)); Chargebee's
  dashboard creates no multi-line invoice by hand
  ([KB](https://www.chargebee.com/docs/billing/2.0/kb/billing/can-i-create-an-invoice-with-multiple-line-items)).
- **Credit notes** start from the invoice in every billing product.
  Stripe lists each invoice line with a quantity or amount to credit and
  "Add item" for a custom line, never more than the invoice
  ([credit notes](https://docs.stripe.com/invoicing/dashboard/credit-notes));
  Chargebee ticks the lines to credit
  ([KB](https://www.chargebee.com/docs/billing/2.0/kb/billing/how-can-we-create-credit-note-for-a-particular-line-item-of-an-invoice));
  Recurly refunds by line item or the whole invoice
  ([invoice management](https://docs.recurly.com/docs/invoice-management));
  Xero copies the invoice into a credit to edit before approving
  ([credit notes](https://central.xero.com/0/article/Add-a-credit-note-to-a-customers-invoice)).

**Decision.** The standard table with a sheet per line, and no departure
for the paper. An accounting grid in the document suits a bookkeeper
typing many short lines; ours are few, and each needs two descriptions,
a period and a tax code, which is what cut the grid's description to a
few letters. Xero's own phone app makes the same choice. What every
product keeps, the totals moving as lines change, stays: the subtotal,
VAT and total sit under the table and the paper below shows the invoice
as it will be issued, which is Stripe's form-and-preview read top to
bottom. On a draft each line saves as its sheet does (Stripe and Xero
save drafts as they go); a new invoice keeps its lines on the page until
Save the draft, since there is nothing to save them to before it exists.
An issued invoice is never edited, as in all six products: it is
credited. A credit note became a page of its own with the same table,
and "Take back a line" opens the sheet filled from one of the invoice's
lines, Stripe's starting point, beside Add line for anything else.

### Prices of a plan or an add-on

- **Stripe** shows a product's prices as a list with a `•••` per price
  (Edit, Archive, Delete if never used); "Add another price" opens a
  form for one price, and a price's amount never changes once made: a
  new price replaces it
  ([manage prices](https://docs.stripe.com/products-prices/manage-prices)).
- **Chargebee** lists every price point by currency and frequency, and
  "Set Price" opens one in a page of its own; a changed price reaches new
  subscriptions only
  ([plans](https://www.chargebee.com/docs/billing/2.0/product-catalog/plans)).
- **Recurly** picks the currencies a plan is priced in, and a changed
  price never touches existing subscriptions
  ([plans](https://docs.recurly.com/recurly-subscriptions/docs/plans)).
- **Paddle** lists a product's prices with "New price", which opens a
  form, and archives rather than deletes
  ([products and prices](https://developer.paddle.com/build/products/create-products-prices/)).

**Decision.** The standard pattern, exactly: the version sheet lists its
prices as a table (price, how it is charged, the least a year) with Add
price, and Edit or Remove in each row's menu; Add and Edit open one
price in a sheet over the version's. A price saves into the version
being made, not to the server, because a price never changes once a
contract can hold it (Stripe's rule, and ours): the whole version is
saved with its reason, as before.

### A quote's add-ons

- **Chargebee CPQ** adds plans, add-ons and charges with "Add Item" into
  a table, with a `•••` per line (reset, remove, replace, edit) and a
  summary of the totals
  ([quotes](https://www.chargebee.com/docs/cpq/generate-quote/quote-for-new-business)).
- **Stripe** adds or picks a product under Items, with a PDF preview
  before the quote is finalised
  ([quotes](https://docs.stripe.com/quotes/create)).

**Decision.** The standard pattern: a table of the add-ons with their
quantity, unit price, discount and net, Add add-on opening a sheet that
chooses the add-on (its list price in the quote's currency filled in)
and its figures, Edit and Remove in each row's menu. The quote is still
saved as a whole, because a sent quote's change is a new version of it.

### A new school's own hosts

- **Vercel** lists a project's domains with each one's status, adds one
  from "Add" with the name alone, and edits one in a modal (redirect,
  environment), Remove asking first
  ([add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain),
  [edit](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting),
  [remove](https://vercel.com/docs/domains/working-with-domains/remove-a-domain)).
- **Linear** claims a domain by a DNS TXT record from its security
  settings ([SAML](https://linear.app/docs/saml-and-access-control)); how
  it lists them could not be confirmed from its documentation.

**Decision.** The standard pattern, as the school's own Addresses tab
already does it: a table of hostname, school and what it serves, Add
host and Edit opening one host in a sheet, Remove asking first. Each
saves the step at once, so leaving the step loses nothing; there is no
status column, because a host is only created, pending, when the school
is.

## Portal settings editors

The reference data a school sets once and reads often: reading norms,
grade bands, weights, messages by score, periods, bell schedules, an
intake's checklist and fees, a class's subjects and the website's social
links. They follow pattern 9, as the console's line editors do.

### The model: a table of rows, one row edited at a time

An earlier pass put each of these in a `DataGrid`: the whole table read,
then one Edit that turned every cell into an input, with Save and Cancel
for the lot. That is still one big form. A school changes one figure,
one period or one link at a time, and a wall of inputs hides the figures
it is reading and makes a mistake in one row hold up the rest.

Every editor below is now the portal's standard `DataTable`:

- **Rows read as text** in the same table as every other list, with a
  card per row on a phone.
- **Each row has its own actions** in its `•••`: Edit, a reset to the
  published figure where there is one, Remove. The row's name is a
  `RowButton`, so the whole row opens it, as a record's row opens its
  page.
- **Edit opens that one row in a `SheetForm`**, Add opens the same form
  empty, and the form validates the row against the rest (percentiles
  rising, a band's lower bound not taken). Remove asks first where it
  loses something saved.
- **One row saves at a time.** Where the list is settings of its own
  (norms, bands, periods, schedules, links), the sheet's Save writes that
  row and the rest go as they were. Where the list belongs to a record
  being written in a form with its own Save (a class, an intake, a
  lesson's messages by score, a scale or programme being added), the
  sheet puts the row in that form, and the form's Save keeps it with the
  rest of the record, as Shopify's product form does with a variant and
  the console does with a new invoice's lines. Either way the sheet's
  button names its job ("Add a grade", "Save grade"), as the console's
  do.

#### Sources, across editors

- **Primer DataTable**: actions on a row go in its last column, several
  in a menu with at most one pulled out; Primer sends a team that mainly
  edits cells to a data grid instead, which is what these are not
  (primer.style/product/components/data-table/guidelines).
- **Carbon forms pattern**: a side panel for repeated edits where the
  person needs to see what they are changing, such as a data table row;
  a dialog only for short, rare ones (carbondesignsystem.com/patterns/
  forms-pattern). Primer prefers a page to a side sheet for an edit
  form; ours are short and are made again and again against the table
  beside them, which is Carbon's case, and `SheetForm` is already the
  portal's way to edit one section.
- **GOV.UK summary list and check answers, MoJ "add to a list"**: each
  item has its own Change; a Remove asks for confirmation
  (design-patterns.service.justice.gov.uk/patterns/add-to-a-list).
- **Polaris Modal**: no complex forms in a modal; edits are titled for
  what they change ("Edit email address").
- **Stripe tax rates**: each rate is its own object, created, changed and
  archived on its own (docs.stripe.com/tax/tax-rates).

### Reading norms

`apps/web/src/components/reading/ReadingNorms.tsx`, Settings, Reading.

- **Sources.** Hasbrouck and Tindal's 2017 table runs grade by
  percentile with autumn, winter and spring as columns, grade 1's autumn
  blank. DIBELS 8 prints a page a grade with beginning, middle and end of
  year as columns (dibels.amplify.com/docs/DIBELS8thEditionGoals_4.pdf).
  FastBridge districts set their own cut points per grade and season.
- **Decision.** One table per language, a row for each grade at each time
  of year, the five percentiles as columns and a Source column saying
  "Hasbrouck and Tindal", "Changed by the school" or "Added by the
  school". A row opens in a sheet with a field per percentile, each
  carrying the published figure under it. The row's menu puts back the
  published figures for that row; the section's Go back to the defaults
  still resets the whole language.
- **Why it fits.** A student's reading is set against one grade at one
  time of year, so that is the row a teacher looks up and the unit a
  school changes when it moves a benchmark. The rule that each percentile
  is at least the one before is within a row, so the sheet checks it on
  the field that breaks it. Percentiles stay columns rather than rows, as
  the published table has them, because five short figures fit across a
  row at 720px and a phone's card reads them as one line.

### Grade bands

`apps/web/src/components/grading/ScalesTab.tsx`, Exams and grading,
Grade scales.

- **Sources.** Canvas's grading scheme editor is one row per band: a name,
  an editable lower bound, and an upper bound worked out from the band
  above and shown read-only ("< 90%"), the last row fixed at 0
  (canvas-lms, GradingSchemeDataRowInput.tsx). PowerSchool SMS keeps one
  table of lower cut-offs, each running "to the next highest grade"
  (support.powerschool.com, Setting up a letter grade). Schoology runs
  each symbol from its minimum to just below the next. All three save
  the whole set at once.
- **Decision.** A scale's row opens its grades in a panel: the standard
  table with the grade, its Arabic name, the percentage it starts at,
  the scores it covers ("70 to under 80") and GPA points where any grade
  has them. Each grade opens on its own in a sheet with its names, the
  percentage it starts at (its hint says what it now covers), GPA, and,
  because a saved scale's grades are versioned, the date the change is
  used from and why, kept in the history. Remove takes the same date and
  reason. A new scale's grades are changed the same way before it is
  added, each sheet putting the grade into the scale.
- **Why it departs from the products, and why that is safe.** They edit
  the set together because a band's range depends on its neighbour. Here
  a band holds only its lower bound and the range is derived, so one
  grade can change without touching another; every rule of the set
  (names once, lower bounds once, one grade from 0, at least two grades)
  is checked in the grade's own sheet against the others, so no save
  leaves the scale broken. What a school does in practice is move one
  boundary ("A now from 85"), and each such move is its own dated entry
  with its reason, which is the audit a board or an inspector asks for.
  Turning GPA points off for the whole scale at once is gone; each grade
  leaves its GPA empty instead.

### Grading weights

`apps/web/src/components/grading/ProgrammesTab.tsx`, a programme's sheet.

- **Sources.** Canvas creates assignment groups one at a time, then sets
  every group's weight in one dialog with a live total, and lets the total
  sit above or below 100 (community.instructure.com, kb 660669). Google
  Classroom lists grade categories as rows added with "Add grade category"
  and will not save the class's settings until they make 100
  (support.google.com/edu/classroom/answer/9184995).
- **Decision.** The programme's categories are the standard table inside
  its sheet, the weight a column and a Total row under it ("90 of 100").
  Each category opens in its own sheet with its names and weight, whose
  hint says what the weights add up to with this change; its Save puts it in
  the programme. The programme's Save refuses weights that do not make
  100, saying so under the table, as Classroom does.
- **Why it fits.** Weights are one share of 100: changing one always means
  changing another, so a save after each row would be refused every time
  but the last. Rows are still added, named and weighed one at a time, and
  the total is checked once, when the programme is saved, which is where
  the domain checks it too.

### Social links

`apps/web/src/components/site/SiteSettings.tsx`, Website, Settings.

- **Sources.** Shopify's Dawn theme gives each network a fixed field of
  its own (github.com/Shopify/dawn, config/settings_schema.json);
  Squarespace keeps a list with Add social link, a link opened to change
  it and Remove confirmed (seen in secondary sources only). Vercel's
  domains and Stripe's lists edit one entry at a time from its row.
- **Decision.** The links are the standard table in their settings card,
  the network and the address as columns. A link opens in a sheet with
  the network and the address, which must be a whole https address; Add
  opens it empty, up to ten. Saving a link writes the website's settings
  as they are saved with only that link changed; Remove asks first.
- **Why it fits.** A school adds its pages once and changes one when an
  account moves. The address was the only thing that could be wrong, and
  a blank row used to be dropped silently on save; now the sheet says
  what is wrong on the field. The card no longer has a Save of its own,
  and the other cards' Saves send the links as saved, so saving the
  banner can no longer send a half-typed link with it.

### A class's subjects and teachers

`apps/web/src/components/classes/ClassEditor.tsx`, a class's editor.

- **Sources.** PowerSchool adds a co-teacher to a section from Add on the
  section's page, one staff member, role and dates at a time (a school's
  own PowerSchool guide). Google Classroom invites teachers one at a time
  from the People tab (support.google.com/edu/classroom/answer/6190760).
- **Decision.** The subjects are the standard table in the class's form,
  the subject and its teacher as columns, "No teacher yet" where there is
  none. A subject opens in a sheet with the subject, chosen from those the
  class lacks, and its teacher; Add opens it empty. Remove asks first,
  since saving the class then drops that subject's class and teacher.
  The sheet puts the row in the class, and the class's Save keeps it.
- **Why it fits.** A class is written as one record in a form with its
  own Save and leave guard, and a new class has nothing yet to save a
  subject to, so the rows are kept with it as a new invoice's lines are.
  Choosing the subject inside the sheet, not from a menu that added a
  blank row, means a row never exists without its subject.

### An intake's checklist and fees

`apps/web/src/components/admissions/IntakeEditor.tsx`, an intake's editor.

- **Sources.** OpenApply's checklist is a list with "+ Add Checklist
  Item", an edit icon and a delete icon on each item and drag to reorder
  (help.openapply.com, article 4405307997581); its fees are created one at
  a time, each with its own lines (article 40797128736409).
- **Decision.** The checklist is the standard table in the intake's form,
  the step, its kind and whether it is required as columns. A step opens
  in a sheet with its names, kind and Required; Add opens it empty, up to
  twenty, and Remove asks first. The fees are a table of the fee kinds the
  school may charge, each with its amount or "No fee"; a fee opens in a
  sheet with its amount, and its menu removes the amount after asking.
  The currency stays a field above the fees, since it is one for all of
  them. The rows are kept with the intake and saved with it.
- **Why it fits.** An intake is one record with its own Save and leave
  guard, and a new one has nothing yet to save a step to, so rows are
  kept with it as the console keeps a new invoice's lines. Fees are a
  fixed set, so they have no Add: a school sets or clears the amount of a
  fee it charges. Priorities stay an ordered list, as before.

### Messages by score

`apps/web/src/components/learning/FeedbackBands.tsx`, a module's mixed
review, a scored lesson's and a quiz's settings.

- **Sources.** Moodle's quiz overall feedback pairs each message with a
  grade boundary, each running to the next. Canvas edits a criterion's
  ratings together in its "Edit criterion" dialog and works out where
  each starts from the next (canvas-lms, CriterionModal.tsx and
  rubricUtils.ts); Toddle's comment bank is keyed by grade and subject,
  not by score (weak source).
- **Decision.** The messages are the standard table, highest first, with
  the scores each covers worked out from the next ("80% and above",
  "0 to under 80%") and the message as a wrapping column. A message opens
  in a sheet with the score it starts at (its hint says what it covers)
  and the message; Add opens it starting at the first free score of 80
  and 0. Remove asks first. In a lesson's or a quiz's 280px settings
  panel the table draws as cards, its phone layout.
- **Why it departs from Canvas, and why that is safe.** A message holds
  only its lower score and its range is derived, so one message changes
  without touching another; the one rule of the set, a score used once,
  is checked in the sheet. The rows belong to the lesson, quiz or module
  being written and are kept with it, saved by its own Save or autosave.

### A year's periods

`apps/web/src/components/years/YearPeriods.tsx`, a year's Periods tab.

- **Sources.** PowerSchool SIS lists a bell schedule's items as a table of
  period, start, end and duration; clicking one opens "Edit Bell Schedule
  Item" with Delete and Submit (dpi.nc.gov, PowerSchool bell schedules
  quick reference). PowerSchool SMS adds and edits a period in its own
  form; periods cannot overlap and gaps are allowed
  (support.powerschool.com, Setting up a bell schedule). No source showed
  a timeline helping anyone edit a school day.
- **Decision.** The day's periods are the standard table, earliest first:
  the period with its kind and days under its name, the time, its length
  in minutes (PowerSchool's Duration) and whether it takes the day's
  register. A period opens in a sheet with the date the change starts
  from, its names, kind, start and end, its days, the day's register and
  its other times on some days; Add opens it empty, starting when the
  last period ends. Remove is its own sheet with the date, since a period
  leaves the day from a date and the days before keep it.
- **Why a table and not a timeline.** A timeline reads well but is no help
  in changing a start time, and nothing published suggests one; schools
  and their systems read a day as rows of times. Every save still sends
  the whole day from the chosen date with this one period changed, so the
  domain's checks (one register a day, no break with a register, other
  times only on the period's days) show on the field they concern.

### Bell schedules

`apps/web/src/components/years/BellSchedules.tsx`, a year's Periods tab.

- **Sources.** PowerSchool keeps several bell schedules, each a table of
  its items with start, end and duration, an item opened alone in "Edit
  Bell Schedule Item" (dpi.nc.gov, PowerSchool bell schedules quick
  reference). Veracross and Toddle could not be checked. No source showed
  a timeline helping anyone set the times of a day.
- **Decision.** The year's schedules are the standard table, each with
  the periods it holds ("6 of 8") and its own periods named under it. Add
  asks only for the names and saves a schedule holding every period at
  its own times, then opens it. A schedule opens in a panel with two
  tables: every period of the day at the schedule's time or "Not held",
  and its periods of its own with code, kind and time. A period opens in
  a sheet (held that day, start, end); a period of its own opens in a
  sheet with its names, code, kind and times, and Remove asks first. Each
  sheet saves the schedule with that one change. Rename and Remove stay
  in the schedule's menu.
- **Why a table and not a timeline.** The question a school answers is
  "what time does Period 2 start on a late-start day", one period at a
  time, and the systems schools already know answer it with rows of
  times. A timeline would show gaps and overlaps at a glance, but the
  domain already refuses overlaps on save and says so in the sheet.

## Ranking, worst first

| #   | Editor                                   | Where                                                       | State                                                                  |
| --- | ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Reading norms                            | `apps/web/src/components/reading/ReadingNorms.tsx`          | Rows: a grade's time of year per row, in a sheet                       |
| 2   | Gradebook term grades                    | `apps/web/src/components/gradebook/`                        | Redesigned: table frame, saved as typed; see `docs/plans/gradebook.md` |
| 3   | Grade bands                              | `apps/web/src/components/grading/ScalesTab.tsx`             | Rows: a grade per row, dated and with a reason                         |
| 4   | Grading categories (weights)             | `apps/web/src/components/grading/ProgrammesTab.tsx`         | Rows in the programme's sheet, total checked on Save                   |
| 5   | Rubric (criteria by levels)              | `apps/web/src/components/coursework/RubricSheet.tsx`        | Redesigned: a matrix, one criterion opened at a time                   |
| 6   | Intake checklist, fees and priorities    | `apps/web/src/components/admissions/IntakeEditor.tsx`       | Rows: a step or fee per row; priorities left                           |
| 7   | Periods                                  | `apps/web/src/components/years/YearPeriods.tsx`             | Rows: a period per row, saved from a date                              |
| 8   | Invoice and credit note lines (console)  | `apps/ops/src/components/InvoiceLinesForm.tsx`              | Rebuilt: a table, each line in its own sheet                           |
| 9   | Quote and provisioning add-ons (console) | `apps/ops/src/components/QuoteAddOns.tsx`, `provisioning.*` | Quote add-ons a table; provisioning add-ons left                       |
| 10  | Bell schedule extras                     | `apps/web/src/components/years/BellSchedules.tsx`           | Rows: a schedule opens to its periods, each saved alone                |
| 11  | Prices (console)                         | `apps/ops/src/components/PriceFields.tsx`                   | Rebuilt: a table, each price in its own sheet                          |
| 12  | Feedback bands                           | `apps/web/src/components/learning/FeedbackBands.tsx`        | Rows: a message per row, the scores it covers derived                  |
| 13  | Rollover classes                         | `apps/web/src/components/years/Rollover.tsx`                | Left                                                                   |
| 14  | Previous schools (apply)                 | `apps/web/src/components/admissions/ApplicationForm.tsx`    | Left                                                                   |
| 15  | Hosts in provisioning (console)          | `apps/ops/src/components/DraftHosts.tsx`                    | Rebuilt: a table, each host saved from its sheet                       |
| 16  | Schools in a school spec (console)       | `apps/ops/src/components/SchoolSpecForm.tsx`                | Left                                                                   |
| 17  | Limits (console)                         | `apps/ops/src/components/LimitFields.tsx`                   | Left                                                                   |
| 18  | Social links                             | `apps/web/src/components/site/SiteSettings.tsx`             | Rows: each link saved from its sheet                                   |
| 19  | Audience list                            | `apps/web/src/components/broadcasts/AudienceList.tsx`       | Left                                                                   |
| 20  | Class subjects                           | `apps/web/src/components/classes/ClassEditor.tsx`           | Rows: a subject per row, kept with the class                           |
| 21  | Guardians                                | `apps/web/src/components/people/StudentEditor.tsx`          | Left                                                                   |
| 22  | Notification preferences                 | `apps/web/src/routes/_app/notification-preferences.tsx`     | Fine                                                                   |
| 23  | Module toggles (console)                 | `apps/ops/src/components/ModuleFields.tsx`                  | Fine                                                                   |
| 24  | Role capabilities                        | `apps/web/src/components/admin/AccessRolesPanel.tsx`        | Fine                                                                   |
| 25  | Attendance register                      | `apps/web/src/components/attendance/Register.tsx`           | Fine, the model for work entered as the job                            |

## What the ones left need

- **Intake priorities**: an ordered list with up and down buttons; it
  wants a reorderable list (drag and the keyboard), which DataGrid does
  not do yet.
- **Provisioning add-ons (console)**: still a stack of hand-drawn boxes;
  it wants `QuoteAddOns`' table and sheet, with the per-school check
  boxes in the sheet and the schools as a column.
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

- A credit note is now a page under its invoice rather than a sheet, so
  the lines it takes back can be read as a table. Its lines can start
  from the invoice's own ("Take back a line"); the server still refuses a
  credit for more than the invoice stands for.
- A draft invoice's lines and a new school's hosts save as each sheet
  does. A new invoice, a credit note, a quote and a catalogue version keep
  their rows on the page until the whole is saved, since none exists to
  save a row to, or a change to it is a new version.

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
