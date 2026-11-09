# Farida LMS design system

Every screen is built from the rules below. They come from the published
guidance of Shopify Polaris, GitHub Primer, Atlassian, IBM Carbon, the GOV.UK
Design System, Nielsen Norman Group research, and the way Notion and Linear
present documents. Where those sources disagree, the rule says which one we
follow and why. A screen that needs something these rules do not cover extends
this document first.

## Where the components live

Every rule below is implemented once, in `packages/ui/src/system/`, and
both the school portal (`apps/web`) and the operator console (`apps/ops`)
build their screens from it. A screen never re-creates one of these with
its own markup; when a screen needs something the package lacks, the
package gains it first, with a test and a line in this table.

| Rule           | Module                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell          | `app-shell` (`AppShell`, `ShellBrand`, `ShellAccount`, `ThemeSubmenu`, section More, area pages, breadcrumb steps), `page-actions`                                                                                         |
| Index page     | `page-header`, `index-toolbar`, `data-table`, `selection-bar` (`SelectionBar`), `cell-note` (`CellWithNote`), `empty-state`                                                                                                |
| Page width     | `page` (`Page`; `SettingsPage` and `RecordForm` take theirs from it)                                                                                                                                                       |
| Record page    | `record-page` (`RecordHeader`, `RecordStack`, `RecordTabs`, `RecordColumns`, `RecordSection`, `Facts`, `Fact`, `RecordList`), `stage-path` (`StagePath`), `attention-list` (`AttentionList`), `value`                      |
| Record content | `usage-list` (`UsageList`), `summary-list` (`SummaryList`), `change-log` (`ChangeLog`), `dns-records` (`DnsRecords`), `copy-button`, `document-view` (`DocumentView`, a printable document in a tab, printed alone)        |
| Content editor | `editing-hold` (`EditingHold`, who else is editing and taking over), `version-compare` (`VersionCompare`, two versions side by side, keep one)                                                                             |
| Section sheets | `sheet-form` (edits), `sheet-panel` (reads)                                                                                                                                                                                |
| Record form    | `record-form` (`RecordForm`, `FormSection`, danger zone), `unsaved-changes-guard`                                                                                                                                          |
| Settings page  | `settings-section` (`SettingsPage`, `SettingsSection`, `SettingsGroup`)                                                                                                                                                    |
| Data editors   | `data-grid` (`DataGrid`, `GridFigure`, `NumberCell`, `TextCell`, `NoteCell`, `SelectCell`, `CheckCell`, `GridAddButton`, `GridRemoveButton`, `useFocusAfterRender`): figures and rows read at a glance and edited in place |
| Forms          | `form-field` (`FormField`, `TextField`, `SelectField`, `ChoiceField`, `CheckboxGroupField`, `FieldError`), `combobox-field`, `time-zone-field`                                                                             |
| Status         | `status` (`StatusBadge`, `StatusText`, `toneSurface`)                                                                                                                                                                      |
| Empty states   | `empty-state` (`EmptyState`, `FilteredEmptyState`, `EmptyStateScope`), `record-page` (`RecordEmpty`), `value` (`Value absent`)                                                                                             |
| Feedback       | `action-menu` (`ActionMenu`, `useRunAndReport`), `confirm-dialog`, `dialog`                                                                                                                                                |
| Comments       | `comment-thread` (`CommentThread`, `CommentComposer`), `side-panel` (`SidePanel`)                                                                                                                                          |
| Side panels    | `panel` (`PanelGroup`, `Segmented`)                                                                                                                                                                                        |
| Media          | `media-grid` (`MediaGrid`, pictures and files as tiles that open, are chosen or are selected for a batch), `crop-frame` (`CropFrame`), `upload-queue` (`UploadQueue`, `FileDropZone`), `focus-picker` (`FocusPicker`)      |
| Metrics        | `metrics` (`MetricGrid`, `Metric`), `trend-chart` (`TrendChart`, one measure over time against a reference line)                                                                                                           |
| Steps          | `step-nav` (`StepNav`), `form-footer` (`FormFooter`)                                                                                                                                                                       |
| Setup          | `setup-guide` (`SetupGuide`, an organisation's first setup as ordered steps ticked from its data)                                                                                                                          |
| Status pages   | `status-page` (`StatusPage`, `ErrorPage`, `NotFoundPage`)                                                                                                                                                                  |
| Sign-in pages  | `auth-layout` (`AuthLayout`, `AuthBand`, `AuthHeading`), `theme-toggle`                                                                                                                                                    |

The package says nothing in a language of its own. Each app wraps its pages
in `DesignSystemProvider` with a `DesignSystemValue`: the strings the
components say (`SystemStrings`), the reading direction, how numbers are
written, and how an error or a validation issue reads. The portal builds
it from its message catalogue (`components/app/design-system.ts`); the
console, which is English only, passes `ENGLISH` from
`@faridalms/ui/system/english`. Component tests render through
`renderWithSystem` from `@faridalms/ui/system/testing`.

Every component's props are a named, exported interface beside it
(`RecordSectionProps`, `DataTableProps`), never an inline object type, so
a screen can see what it may pass and a reviewer can see what changed.

## Principles

- **One accent.** Teal marks the primary action, links, focus and selection.
  Nothing else competes for attention.
- **One primary action per surface.** A page, a dialog or a card has at most
  one filled button.
- **Quiet chrome, loud content.** Borders are 1px and neutral; cards appear
  only where grouping needs them.
- **State in words.** Colour never carries meaning alone (Primer, Carbon).
- **Both directions.** Every layout mirrors for Arabic. Numbers inside a value
  never reverse; back and forward chevrons do (Apple HIG, Material). Media
  playback controls are the one exception (see Media and activities).
- **Work before decoration.** A home page leads with the next useful action
  and the records behind it; nothing decorative pushes coursework, grading,
  attendance or a child's progress below the first screen.
- **Done is a round trip.** A workflow is finished when a person can start
  it, correct what they got wrong, save it, reload and find what they saved,
  and read a useful message when their permission or the record changed
  underneath them.

## Tokens

Colours live in `apps/web/src/styles/globals.css` as CSS variables and are
exposed to Tailwind. Components use the semantic names only
(`bg-background`, `text-muted-foreground`, `border`, `bg-primary`).

| Role                                | Use                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| background / foreground             | the canvas and body text                                                           |
| card, popover                       | raised surfaces                                                                    |
| muted / muted-foreground            | secondary surfaces and text                                                        |
| accent                              | hover and focus on rows, cards and menu items                                      |
| primary                             | the one accent: primary buttons, links, focus ring, selected rows (a 5% tint)      |
| success, warning, info, destructive | status only                                                                        |
| brand (`brand-*`)                   | the platform's green: school sidebar, product site bands, an unstyled sign-in page |

Radius: 8px base (`rounded-lg`), 6px for controls (`rounded-md`), 12px for
dialogs (`rounded-xl`). Spacing follows a 4px grid.

## Type

| Style           | Size / line | Weight | Use                                 |
| --------------- | ----------- | ------ | ----------------------------------- |
| page title      | 24 / 32     | 600    | one per page                        |
| document title  | 30 / 38     | 600    | the title field of a content editor |
| section heading | 16 / 24     | 600    | form sections, record sections      |
| card heading    | 14 / 20     | 600    | cards and panels                    |
| body            | 14 / 20     | 400    | all interface text                  |
| document body   | 16 / 26     | 400    | content written in the editor       |
| small           | 13 / 18     | 400    | descriptions, hints, metadata       |
| label           | 14 / 20     | 500    | form labels                         |

Interface text is 14px (Carbon, Atlassian, Fluent, Primer all default to
14/20). Documents are read, so they are 16px.

## Sizes

- Controls: 36px (`h-9`) everywhere a person types or picks: inputs, selects,
  pickers, buttons. Controls in one row are always the same height.
- Compact controls: 32px (`h-8`) only in toolbars, table toolbars and the top
  bar.
- Table rows: 48px. Touch targets never below 32px, 40px on phones.
- Widths follow the expected answer (GOV.UK, NN/g): names and emails up to
  480px, phone about 20 characters, student references 24 (their longest
  allowed value), codes about 10, dates 160px, scores 6.

## Shell

One 48px top bar per page (Polaris, Notion, Linear):

- start: sidebar toggle, then the breadcrumb;
- end: the page's own actions when it has any, otherwise nothing.

The sidebar lists the app's sections (`ShellNavSection`), each a short
titled group of links (Polaris, Linear). Two rules keep it calm for
someone whose role reaches much of the app (`docs/plans/navigation.md`):

- **An area is one link.** Pages that serve one job (Admissions:
  enquiries, applications, intakes, reports, letters) are one link whose
  pages (`ShellNavItem.pages`) list beneath it, indented, while one of
  them is open (Shopify admin). The open page is marked, not the area as
  well. An area's own page tabs stay on the page; the area never adds a
  second row of tabs.
- **What is opened now and then folds under the section's More**
  (`ShellNavSection.more`): a row at the section's end, named "More in
  Teaching" for screen readers, that opens in place and is remembered
  (`moreOpen`, `onMoreOpenChange`). A folded link that is open now stays
  in view. The app decides what folds for whom; the portal folds a
  section only when a person sees more than five links in it and at
  least two would fold, so a lighter role sees its sections whole.

Global tools live in the sidebar header on desktop: search (Ctrl/Cmd+K),
notifications, and the school-year switch. The sidebar footer holds the
account, language and theme. On phones the bar keeps search and the
notification bell at the end and page actions collapse into a `•••` menu
(Primer PageHeader).

Page padding is 24px, 16px on phones.

## Page types

Every page sets its width once, by its kind, with `Page` (Polaris and
Shopify's app guidelines draw the same three lines). The content is centred
in the space the shell leaves, and the header, the tabs and every tab share
that one width, so changing tab never moves the page's edges.

| Kind                                                      | Width  | Why                                          |
| --------------------------------------------------------- | ------ | -------------------------------------------- |
| Index, board, home, report, dashboard                     | 1600px | Tables and boards need the room for columns. |
| Record, and an account page such as Billing               | 1280px | Tables in a tab keep their columns readable. |
| Form, settings (the whole settings area), steps, a reader | 720px  | One column, one path from top to bottom.     |

- **Settings are 720px throughout**, the settings area's header, tabs and
  every tab included, tables too (GitHub's and Linear's settings hold their
  lists in the same column). A settings tab never runs wider than its
  neighbours.
- **A document read as a page** (a post, an assignment's brief, a lesson)
  reads at 720px, and its reader's Wide switch widens it to the list width.
- **A document editor** keeps its own anatomy (Content editor below): a
  720px writing column with its 280px settings panel beside it.
- **The width lives in the components.** `SettingsPage` and `RecordForm`
  take the form width from `Page` themselves. A `Page` inside a wider page
  narrows at the start edge (a settings tab under a hub's wider tabs keeps
  its measure), and one inside a page as narrow adds nothing.
- `scripts/check-sources.ts` refuses a file in either app that draws a page
  header (`PageHeader`, `RecordHeader`) without a `Page`, or that caps a
  page's width by hand (`mx-auto max-w-…` around the header).

### Page anatomy

Top to bottom, every page in either app (Polaris page, Primer PageHeader,
Atlassian page header):

1. **Header**: `PageHeader` for a list, a form or settings, `RecordHeader`
   for one record. Title (24px; a document's 30px), an optional count, at
   most one muted line of description, and the actions at the end: at most
   one filled button and a `•••` menu. 24px below it.
2. **Figures and To do** (`MetricGrid`, `AttentionList`), only where a
   number or an item decides what to do next.
3. **Tabs** (`RecordTabs`), one per thing the page holds or one per fixed
   queue of a list with its count (Polaris index tabs); a tab is never a
   filter that a facet could be.
4. **The toolbar row** (`IndexToolbar`, or a table's `toolbar`), then the
   table, grid or sections.
5. **Sections**: parts of a page that are not a table are titled.
   `RecordSection` frames a part as a card on a page and rules it off with
   `variant="page"` inside a tab; `SettingsSection` frames a settings card
   with its own Save; `SummaryList` frames name-and-value rows. Parts stack
   24px apart (`RecordStack`), ruled sections in a tab 40px apart. A heading
   is never written by hand under a page header, and a card is never a
   hand-built `rounded-lg border bg-card` box.

### Index page

Lists of students, classes, assignments, messages (Polaris resource index,
Carbon data table, shadcn tasks).

- Header: title with the count in muted text, an optional one-line
  description, and the create action as the only primary button at the end.
- Toolbar (32px controls, 40px on phones): search up to 240px, at most three
  facets, a Reset link, and the view or sort menu at the end, by the rules of
  Filters, scope, search and views below. The search narrows first and the
  toolbar then wraps, with the view menu kept at the end; it never pushes
  past the page edge.
- A control in a toolbar or any other row of controls carries its name as
  `aria-label` (or a placeholder that states it), never a visible label
  stacked above it: a stacked label shifts the row off its line. Every
  control in the row shares one height, and the row centres them.
- Selecting rows replaces the toolbar with a batch bar: "n selected", actions,
  Cancel.
- Rows are 48px. The whole row opens the record. The last cell is a `•••` menu;
  at most one action is pulled out inline (Primer). Delete is last, after a
  separator.
- Pagination in the footer, 25 or 50 per page.
- Empty state: an action-led title and one primary button. A filtered view with
  no results offers "Clear filters" instead. Both follow Empty states below.
- Below 768px rows become stacked cards (name, status, one key fact) and the
  filters move into a sheet; a scope stays in the row.
- The count beside the title is the size of the list for the chosen year. It
  is hidden while a search is active, because it would then count matches; the
  footer states the number of results.
- The primary column takes the width the other columns leave and truncates
  its name there, so one long name never scrolls the table sideways. Every
  other column is as wide as its content and never wraps, and no header
  ever wraps. A column whose content runs to several words (a list of
  changes, a next step) sets a width (`Column.width`: narrow 10rem, medium
  16rem, wide 24rem) and wraps inside it. Names
  carry `dir="auto"` and truncate at the end of the name in either script.
- Lists that span years show the school year as a single-choice facet in the
  toolbar, kept in the URL. Its default is the workspace year (the current
  year), and Reset returns to it; picking another year narrows this list only,
  so a shared link opens the same year.
- A choice of classes lists the viewer's own first. For someone who
  oversees the school as well, the options carry a `group` ("Your classes",
  "Other classes"), which a facet and a `SelectField` show as headed groups;
  a list with one group shows no heading.
- Selection and batch actions are a desktop tool. Below 768px cards have no
  checkboxes and each card keeps its own `•••` menu, so anything phones need
  must not exist only as a batch action.
- Selecting rows raises the `SelectionBar` at the foot of the list, sticky
  above the bottom of the window, as Linear, GitHub and Polaris do; the
  toolbar stays where it was, so selecting moves nothing. It says how many
  are selected with a Clear button, stands the first three regular actions
  as buttons (`promoted`), keeps the rest under More, and puts a
  destructive action last: beside the others when nothing waits under
  More, else at the end of More after its separator, always confirmed.
  Escape clears the selection unless a field, menu or dialog takes it. A
  grid that selects (the media library) uses the same bar. Order actions by
  use: the one most often wanted first.
- A value that cannot exist for a record, such as the grade of a student with
  no class, is a muted dash read as "Not applicable" (`<Value notApplicable>`).
  "Not recorded" stays for values that should exist and are missing.
- Free text about a row (why it was done, a note, an outcome) is never a
  column of its own, where it wraps every row to several lines. It is the
  second line of the row's primary cell (`CellWithNote`): one muted line cut
  off with an ellipsis, whole on hover and to a screen reader. Columns are
  for values someone compares or sorts down the table.

### Filters, scope, search and views

One control per job, in one row (`IndexToolbar`), in this order: search,
scope, filters, period, Reset, then the view switch and the list's own
actions at the end. Every control in the row is 32px (40px on phones) and
named by `aria-label` or its own text, never a label stacked above it.

| Job                                                              | Control                                       | Looks                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search a list                                                    | the toolbar's `search`                        | first in the row, up to 240px, the query in the URL after a 250ms pause                                                                                                        |
| Scope: one value always chosen (school year, class, child, term) | a `single` facet with `defaultSelected`       | solid, the label then its value, a radio menu; stays in the row on a phone; Reset returns it to its default                                                                    |
| Filter: narrows from everything (kind, grade, status, assignee)  | a facet with no default, `single` or multiple | unset: dashed, the label alone; set: solid, the label then the chosen values (three or more read "3 selected"); Clear filter in its menu; folds into the phone's Filters sheet |
| Period (a day, a week, a date range)                             | the toolbar's `period` slot: `DayNav`, dates  | 32px stepper and date fields named by `aria-label`, after the filters; kept when the list is empty                                                                             |
| View: the same list shown another way, or a two-way quick switch | `Segmented` in the toolbar's `view` slot      | 32px, one pressed, at the row's end (grid or list, month, week or agenda, All or Unread)                                                                                       |

- **When dashed is right.** A dashed facet is an offer to add a filter that
  is not applied, as in Polaris's filter pills and shadcn's faceted filter;
  once it holds a value it is solid and shows the value, as Polaris, Linear
  and Primer do. A choice that always holds a value is never dashed, so a
  school year is solid even at its default, and there is no "Any" or "All"
  option: an unset filter already means all.
- **Focus never doubles up.** The dashed edge turns solid on hover, on
  focus and while the menu is open, so the focus ring circles one solid
  line, as every other control's does.
- At most three facets; a list needing more needs a design first. Reset
  appears only while something is narrowed and clears search and filters
  back to every scope's default.
- Scopes, filters and periods live in the URL (`validateSearch`), so a
  shared link opens the same list.
- A labelled `SelectField` is a form field that saves a value; it never
  filters a page. Chips and tabs never filter a list either, except a
  list's fixed queues with counts as tabs.

Sources: Polaris Filters and FilterPill (dashed while unset, solid once
selected), shadcn's tasks faceted filter, Linear's filter chips, Primer's
filter buttons and SegmentedControl, Carbon's data table toolbar, GOV.UK's
filter a list pattern (selected filters shown, one Clear filters).

### Record page

A customer, a school, a subscription, a lead, a student, a class (HubSpot's
record page, Stripe's customer page, Chargebee's customer page). A record is
read top to bottom in one column at the record width; there is no supporting
column beside the tabs, because it squeezed the tabs into a strip and put the
same facts in two places.

Top to bottom:

1. **Header** (`RecordHeader`): identity (photo, name), the status pill, at
   most three facts on one muted line separated by `·`, at most one primary
   action and a `•••` menu holding every other action. The primary action is
   the record's next step in its current state (Log activity on a lead,
   Publish now when changes wait, Issue on a draft); a record with no such
   step has none. Every action a tab offers is also in the menu, so it is
   reachable from any tab. Below 768px the action and the menu move into
   the top bar's `•••`. A separator never ends a line when the facts wrap.
   A change of state the status names (access, a lead's stage) is a menu
   action, never a second display of the state.
2. **Path** (`StagePath`), only for a record that moves through ordered
   stages (a lead in the pipeline): the stages behind it ticked, its own
   filled, those ahead plain, and where it left the path when it did.
3. **Figures** (`MetricGrid`): at most four numbers that decide what someone
   does next: money owed, use against a limit, days a term has left, how far
   onboarding has come. A count of related records is not a figure (the
   tab's count shows it), and neither is a number nobody acts on. A record
   with no such number has no figures.
4. **To do** (`AttentionList`): what is wrong or due on this record, most
   urgent first, each item a title, one line saying what it means or what
   to do, and the button that does it (Open invoice, Add contact, Publish
   now, Set its term). It draws nothing when nothing needs doing, so its
   presence is the signal; on a home page, where the list is the page's
   first job, it says in one line that nothing is due (`empty`). Alert chips are not used on a record with a To do
   list: the list says the same thing with the fix beside it. Two buttons on
   one page never share a name, so an item's button names its own job
   ("Set its term", not "Change the terms" when the Terms tab has that).
5. **Tabs** (`RecordTabs`): one tab per thing the record has, never a tab
   that groups unrelated things. The first tab is **About**, the record's
   own details; then one tab per collection (Invoices, Payments, Schools,
   Contacts, Tasks, Items, Overrides, Activity, Quotes, Addresses); then
   **History**, always last. A tab that lists things shows how many after
   its name (`RecordTab.count`). A tab is named by what it holds, never
   "Details", "Overview" or "Other". Tabs live in the URL; switching one
   replaces the history entry and keeps the scroll position
   (`resetScroll: false`); a tab the viewer may not open is not offered and
   its URL falls back to the first.

The parts under the header stack in a `RecordStack`, and so do the titled
lists of a details tab: one column as wide as the page and no wider, so a
wide table scrolls in its own place rather than widening the page on a
phone.

Inside a tab:

- **One tab is one thing.** The tab's name is its heading: no section
  heading repeats it, and no sentence explains it. A collection tab is one
  `DataTable`: its filter (a facet in the URL) at the start of the toolbar
  row, the tab's own action ("Add contact", "Record a payment", "New
  invoice") at the end through `DataTable actions`, the table, money totals
  under it (`totals`), and the row actions in each row's menu.
- **An empty tab is one designed empty state** (`EmptyState` through the
  table's `empty`): an action-led title ("Add the people to write to",
  "Sell it a plan"), one sentence of what will fill it and how, and the same
  action as a button. Never a heading followed by "No X yet".
- **A details tab** (About, Terms, Limits) is one or more titled summary
  lists (`SummaryList title align="start"`), each a group a person reads
  down: legal details, relationship, agreements. A group's edit is a ghost
  button in its title bar; a single row's change sits at the row's end
  (`SummaryItem.action`). Values that can be missing go through `<Value>`.
  Limits against use are a titled `UsageList`.
- **History** is the audit table (`ChangeLog`): what was done and the
  fields it moved with readable names (never `taxNumber`), why, by whom,
  when. A log across records (the console's Changes) is the same table
  with a Record column linking each change to its record, and search,
  filters and pages that run on the server.
- Content a person wrote (a lead's message) is a titled block in About.
- A record that is a document (an invoice, a quote) reads its paper as
  the first tab (`DocumentView`): how it is shown (its language) at the
  start of one row above it, what is done with it (Print) at the end, and
  the paper at the tab's full width, printed alone.
- Cards frame only figures, the To do list and titled lists; a tab is never
  a stack of framed sections.
- Nothing is edited inline in a table; edits open a sheet.
- One record looks the same to every role; the role changes which tabs and
  actions it offers, never its layout. A name of another record links to it
  where the viewer may open it.

`RecordColumns` (main column and a supporting column) remains for records
without tabs that read as one page, such as a portal student's own page; a
record with tabs never uses it.

#### Section sheets

- A section is edited in a sheet from the end side, 480px wide, full width on
  phones. The title sits in a header row with the close button (32px, 40px on
  phones) centred on it.
- Fields follow the Forms rules. Save and Cancel sit in the footer, start side;
  a server error that belongs to a field appears on that field.
- A change with consequences beyond the section (moving a student) takes two
  steps in the same sheet: choose, then check a summary of what changes, with
  a Change link back. Removing something is never a cleared field; it is its
  own destructive action in the `•••` menu and confirms.
- A sheet that holds something being written, such as a new message, keeps
  it as a draft while it is written, and says how the draft stands at the
  end of the footer ("Saving draft…", "Draft saved"). Closing it (Cancel,
  the close button, Escape or a click outside) keeps the draft and says so
  in a toast. Writing that cannot be kept, such as one message to several
  families at once, or a draft that failed to save, asks before it is
  thrown away: "Keep editing" or "Discard changes". Nothing a person wrote
  is lost without being asked.

### Content editor

Announcements, newsletters, assignments, lessons, posts: long documents where
publishing changes state (Notion, Linear, Polaris).

- Top bar start: Back, breadcrumb, status badge.
- Top bar end: save state in small muted text ("Saving…", "Saved",
  "Couldn't save · Retry"), Preview (ghost), the primary action (Publish,
  becoming "Schedule…" when a date is set), and `•••` with Duplicate, Copy
  link, Version history, a separator, then Delete (opens a confirmation).
- Drafts save automatically about 1.5s after the last change and when a field
  loses focus. There is no Save button; Ctrl/Cmd+S saves now. Leaving with a
  save in flight warns.
- Once published, edits still save as they are made but are held back from
  readers, who keep the copy last published until it is updated, whichever
  client made the edit: the save-state slot says what waits, with Discard
  (back to the copy readers have) and Update. Announcements and news are one
  broadcast editor (`components/broadcasts/BroadcastEditor.tsx`) configured by
  kind; updating an announcement asks whether to notify recipients again.
- The editor's floating bar is reached from the keyboard as well as the
  pointer (TinyMCE, CKEditor): Tab on a chosen block or Alt+F10 anywhere
  moves focus into it, the arrow keys, Home and End move along it (mirrored
  in Arabic), and Escape goes back to the text with the selection it had.
- A formula is written in MathLive's field drawn as the design's text field
  (`math-input.tsx`, `.fe-math-field` in `editor.css`): one focus ring, the
  caret and selection in `--primary`. MathLive's own toggles are hidden;
  its keyboard of symbols and its menu are the field's own ghost buttons
  with the design's tooltip (Alt+Shift+Space and Alt+Space), and both are
  themed with the design's tokens through MathLive's custom properties. A
  plain field stands in while MathLive loads and hands it every key.
- Body: the document title (30px) above a 720px content column; settings for
  the item (audience, dates, class) sit in a 280px panel beside it and move
  above the content on phones.
- One person edits a document that is not written live at a time. Opening
  its editor holds it, the open editor renews the hold, and leaving lets go;
  a hold nobody renews lapses within a minute and a half. Anyone else who
  opens it reads it under `EditingHold` (who, since when, Take over), with
  its settings and actions out of reach. Taking over asks first; the
  previous holder's editor turns read-only on its next renewal or save and
  says who took it, offering a change it had not saved to copy or to
  compare. Lessons, unit plans and assignment briefs are written live and
  never held.
- A save refused because someone saved first, or a change left unsaved when
  the document was taken, opens `VersionCompare`: the reader's version and
  the saved one, each drawn by the page's own static renderer, side by side
  (one at a time on a phone), and Keep mine or Keep the saved one. Keeping
  mine saves it on top of the latest version, taking the document over
  first where it was taken. Every document page and the website builder use
  the same pair through `useHeldDocument`
  (`apps/web/src/components/content/held-document.tsx`).
- Comments (Google Docs, Notion): a toggle in the top bar, before `•••`,
  saying how many threads are open, opens them in a `SidePanel`, docked at
  the end side below the top bar on wide screens, the page making room for
  it, and a sheet on narrower ones (from the bottom on phones). Open threads
  come first in the order their passages stand, then those whose passage
  is gone; resolved ones fold under a disclosure. Each is a `CommentThread`:
  its passage, which goes to it, or "The passage was deleted" with the
  words struck through; each comment with author and time, its writer's own
  Edit and Delete in its `•••`; a Reply that opens a `CommentComposer`; and
  Resolve or Reopen. Typing @ in a composer offers colleagues by name.

### Record form

Creating or editing a student, a class, a staff member (Carbon, Primer, GOV.UK).

- One column, at most 720px wide.
- Save (primary) and Cancel at the bottom, start side. The buttons stick to the
  bottom only when the form is taller than the screen, and the page reserves
  their height so a focused field never sits under them (WCAG 2.4.11).
- Editing never goes around a record's confirmed steps: a value whose change
  has consequences (a student's class, guardians) shows read-only with the
  button that opens the record's own sheet for it.
- Cancel and Save return to where the form was opened from, the list with its
  filters when that is where it started.
- Destructive actions sit in a final "Danger zone" section and confirm.

### Steps

A record built over several sittings (a new school sold to a customer) is
kept as a draft and filled in step by step (GOV.UK question pages, Polaris).

- The steps are a row of links under the header, numbered, the current one
  filled, those before it ticked; any step can be reopened.
- Each step is one form of sections. "Save and continue" sits at the bottom,
  start side, with Back beside it; the step's error appears above them.
- Leaving a step saves it, so a draft can be finished later or by someone
  else; the last step reviews everything before the record is made.

### Setup guide

A new organisation's first setup (a school's details, year, classes, staff,
students, timetable) is a `SetupGuide` on its administrators' home, after
Stripe's and Linear's setup lists and NN/g's advice that an empty product
points straight at the task that fills it.

- One card at the top of the home page while setup is under way: the title,
  "3 of 8 steps done" and a thin progress bar in the primary colour.
- The steps are numbered in the order each depends on the last, every one
  ticked from what the data shows, never by hand, so two administrators
  never disagree about what is left.
- The next step is tinted and its link is the card's one filled button,
  Start; the rest are outline Open or, once done, Review. Each link is
  named for its step, since they share a word.
- A step the viewer may not take shows who does instead of a link.
- Optional steps (the website, admissions) say so and never hold the setup
  open. Hide appears only once everything else is done.

### Settings page

School settings, website settings, notification preferences.

- One column of cards, at most 720px wide and 24px apart, the same cards
  record pages use: the heading and a short description in the card's header
  above a rule, the fields below.
- A long card splits its fields into titled groups divided by a rule (name
  and number, language and time, contact details), still under one Save.
- Each card saves on its own with Save at the card's footer, start side.

### Data editors

Figures and rows a school sets once and reads often: reading norms, grade
bands, weights, prices, periods (Carbon's data table edit modes, Polaris
IndexTable, Shopify's variants editor, Airtable and Google Sheets, Canvas
grading schemes, GOV.UK "Add another"). Each is one `DataGrid`; the full
reasoning and the list of editors still to move is
`docs/plans/data-editors.md`.

- **Read first, Edit to change.** Reference data shows as a table of
  plain figures; one Edit button (named for what it edits, "Edit English
  norms") turns the same table into fields, with Save and Cancel in the
  card's footer. Cancel throws the draft away and gives focus back to
  Edit. A sheet that edits a list (a scale's bands) is already the edit
  mode and shows the grid editing. Work entered as the job itself (marks,
  the register) stays editable all the time and is not a `DataGrid` of
  this kind.
- **Rows under headings.** Rows that belong together (a grade's three
  times of year) sit under one heading row (`GridGroup`) instead of
  repeating the heading on every row; while editing, the heading carries
  the group's `•••` (Remove, go back to the source).
- **Figures are text, not spinners.** `NumberCell` is a text field with a
  numeric keyboard: no spinner, digits at the end of the cell in tabular
  figures and the reader's digits, Arabic-Indic digits accepted. A cell is
  a calm tint until hovered or focused. Reaching a cell selects its figure
  so typing replaces it; Escape puts back what it held.
- **Where figures came from.** When figures start from a published source
  (`baselineName`, "Hasbrouck and Tindal"), each one the school changed
  carries a dot in the accent and says what the source had to a screen
  reader; a line under the grid counts them ("3 changed from Hasbrouck and
  Tindal"). The focused cell's line names the cell and the source's figure
  with Put it back. A whole group goes back from its `•••`, the whole
  table from the card's footer.
- **Adding and removing.** A grid of a fixed shape adds from a menu of
  what is missing ("Add grade") and removes a group from its `•••`; never
  a trash icon on every row. A list of like rows (bands, lines, periods)
  adds with an "Add" button under it and removes with a quiet × at each
  row's end, named for the row (GOV.UK "Add another").
- **Sentences get a line of their own.** Text too long for a column (what
  work at a rubric level looks like) is a `NoteCell` on the row's own
  line under it (`rowDetail`), never a one-line field squeezed into a
  column, and never a stack of boxes per row.
- **What a list derives is shown beside it.** A figure worked out from the
  rows sits in the grid, never in a sentence under it: the scores each
  grade band covers are a column ("70 to under 90"), and weights that must
  make 100 end in a Total row (`totals`, "90 of 100").
- **Keyboard.** Every cell stays in the tab order, so the grid reads as a
  form. The arrows move between cells as in a spreadsheet, up and down
  always and along the row once the figure is selected or typed over;
  Enter moves down and Shift+Enter up; F2 puts the caret in the text. Left
  and right are mirrored in Arabic.
- **Validation** runs on Save, then live. Each problem names its cell in
  a list under the grid ("Grade 3, winter, 75th percentile is lower than
  the 50th percentile, 97"), each a link to the cell, which is marked
  invalid; Save moves focus to the first. A rule about the figures (each
  percentile at least the one before) lives in the domain, so the server
  refuses what the grid refuses.
- **Phones and Arabic.** At 390px a grid of five figure columns fits
  without scrolling: cells are 44px wide and 40px tall and the first
  column's heading is read, not shown. A wider grid scrolls in its own
  named region with its first column held in place. Columns follow the
  reading direction; figures never reverse.

## Forms

The field, in order (GOV.UK, Primer):

1. Label above the control, sentence case, no colon, 1–3 words.
2. "(optional)" in muted text after the label on optional fields, outside the
   label, so the field's accessible name stays the label. No asterisks
   (GOV.UK). Most fields should be required; cut the rest.
3. The control, 36px, directly under the label.
4. One line under the control (Carbon, Polaris): the hint, 13px muted, only
   when it helps, or in its place the error, 13px destructive with an icon.
   Nothing sits between label and control, so fields sharing a row keep
   their labels and their controls on one line whether or not each has a
   hint.

A hint says what a person needs to fill the field in, in one sentence: the
format ("Two letters, such as EG."), a limit, or what the value is used for.
It never repeats the label. A radio or checkbox group is the one exception
to the order: its hint sits under its legend, since it speaks of the whole
list of options.

Fields are 24px apart, sections 40px. Related short inputs may share a row
(Carbon): start and end date, city and postcode.

Typed text takes its own direction (`dir="auto"`); an empty field keeps the
page's, so the caret starts on the right in Arabic. Codes and references are
always left to right.

Validation runs on submit, then live only on fields still invalid (Primer).
Forms with more than five fields show an error summary at the top that takes
focus and links to each field (GOV.UK); a shorter form moves focus to its
first invalid field, else to the form's error. Focus stays put when the
person has already gone on to another field by the time the errors draw.
Save is never disabled except
before the page has hydrated, when the fields are disabled too because
WebKit drops what is typed before then, and while a submit is in flight.
Placeholders never replace labels.

Leaving a form or an editor with changes not yet saved (a record or
settings form, the attendance register, the assignment, lesson and plan
editors, the website studio) asks first, "Keep editing" or "Discard
changes", with Discard disabled while a save is under way, and the browser
warns before the page is closed. Error messages travel as keys
(`validation.*` from the domain schemas, `<area>.<reason>` from the API)
and are read in the person's language; raw validator text is never shown.

## Status

Five tones (Atlassian, Carbon, Primer): neutral, info, success, warning,
danger. Labels are one or two words, sentence case, past tense for outcomes
("Published", "Returned").

- Pill (20px, tinted, with a 6px dot): the object's lifecycle state in headers
  and the status column of tables.
- Dot and text (13px): dense places, metadata, a second status in a row.

| State                            | Tone           |
| -------------------------------- | -------------- |
| Draft                            | neutral        |
| Scheduled, In progress           | info           |
| Published, Submitted, Present    | success        |
| Pending, Needs review, Late      | warning        |
| Overdue, Missing, Failed, Absent | danger         |
| Archived                         | neutral, muted |

## Metrics

A home page or a board may open with a strip of metrics: the counts its
work is measured by (Polaris, Carbon); a record may open with figures, as
its section says. At most five on a list page, four on a record; each is a 13px label,
the value at 24px (20px on phones, where two tiles share a row) in tabular figures, and at most one line under it, toned
only when it reports a state ("2 need help"). A metric that counts a list
opens it from the whole tile, its label naming the link. Metrics never
replace the list itself: the records follow below.

A measure followed over time, such as a student's words correct a minute
across the year, is a `TrendChart`: one thin line with its points in the
primary colour, and at most one dashed reference line in muted ink (a
norm, a target) named beside the chart's title, so the line is never told
by colour alone. One y-axis from zero with three recessive gridlines; time
runs in the reading direction. Each point names itself when hovered or
focused, and the same figures always stand in a table beside the chart.

## Empty states

Something that has nothing in it says so in one of the ways below,
chosen by where it stands and why it is empty, never drawn by hand. Polaris keeps
its empty state for a whole page and says less inside a card; Carbon
separates large spaces from small tiles and panels, and first use from
no results and from what a person may not see; Primer gives each a
short title, one line of what happens next and at most one action.

| Kind                                          | Draw it with                                       |
| --------------------------------------------- | -------------------------------------------------- |
| A page, tab or index with nothing yet         | `EmptyState` (page)                                |
| A search or filter that matched nothing       | `FilteredEmptyState`                               |
| A section, card, panel, sheet or popover list | `EmptyState placement="section"`, or `RecordEmpty` |
| A value or a table cell with nothing in it    | `Value absent` (or `Value` for "Not recorded")     |
| Nothing left to do                            | `EmptyState kind="done"`                           |
| Something the viewer may not see or use       | `EmptyState kind="restricted"`                     |

- **Page.** The area a page's or tab's list would fill: a 40px round icon
  of the thing the list holds in muted ink, the title at 16/24 semibold as
  the area's heading, one sentence at 14/20 muted, and the one action that
  fills it as a primary button, centred in a dashed card with 64px above
  and below. A table, a grid and a board draw it through their `empty`,
  any other page area with `EmptyState`.
- **Section.** Inside anything with its own heading (a `RecordSection`, a
  `SettingsSection`, a `PanelGroup`, a home card) the heading already names
  what is missing, so the empty state is a line: the title at 14/20 muted,
  start-aligned, an optional sentence under it at 13/18, and its action
  below them. No icon of the thing, no frame, no centring: a box inside
  a box is the inconsistency this rule removes.
  Those containers wrap their content in `EmptyStateScope`, so an
  `EmptyState` or a `DataTable` inside them draws as a section by itself;
  a sheet, a popover, a split pane or a block in a lesson says
  `placement="section"`. `RecordEmpty` is the same line for a record's
  section.
- **Filtered.** `FilteredEmptyState` says "Nothing matches your search or
  filters" with the search icon, or a title naming what was searched ("No
  word matches."), and always offers Clear filters when the filters can be
  cleared from where it stands. It is never the first-use state: an empty
  list with a search typed is filtered, one without is empty.
- **Value.** A value that is not there is never a blank: `Value` says "Not
  recorded" where the record is missing it, a dash where it cannot apply,
  and `absent` says what its absence means where there is simply none
  ("No guardian", "Nobody yet", "No due date"), muted, not italic.
- **Done.** Nothing to do is good news: a success check before the title
  in either placement. An `AttentionList` with `empty` draws it.
- **Restricted.** A part the viewer may not see, or the school cannot use
  yet, carries a lock and says who can change that ("The school has not
  shared this"; "Ask Farida LMS support to switch it on"). A page the
  viewer may not open at all is the 404 page, never an empty state.

Wording:

- A page title is action-led where the viewer can fill it ("Add the
  people to write to"), else says what will be here or that there is none
  yet ("No invoices yet"). No full stop on a page title; a section line is
  a sentence and keeps its own.
- The sentence under it says what fills the space and how, or why it is
  empty; it never repeats the title or the heading above it.
- A family or a student is never told to do what only staff can do; their
  empty states say what will appear and when.
- One action at most, the same action the page or section offers once it
  has content; an empty state never removes an action, and its button
  names the job ("New invoice"), not "Get started".

`scripts/empty-states.spec.ts` fails on muted text or a dashed box that
says a thing is empty without one of the components above.

## Feedback

- Toasts confirm an action that happened elsewhere on screen; they never carry
  the only copy of an error. They appear top centre, so they never cover a
  bottom action bar.
- Errors from the server appear inline where the person is looking: on the
  field, or in the form's summary.
- Destructive actions confirm in a dialog that names the thing being removed.
  The red button appears only on that final confirmation (GOV.UK).

## Media and activities

Video, sound, embeds and coding projects are blocks in a document; their
controls are ours, built from Video.js parts (`packages/editor/src/player.tsx`),
never the browser's own.

- **Video is a dark surface in both themes** (YouTube, Vimeo, Apple TV): the
  player carries the `dark` class, so its chrome uses the same semantic tokens
  resolved dark and reads on any picture. 8px radius, no border.
- Controls sit on a bottom scrim: the timeline on its own row, then play,
  volume and time at the start, and captions, speed, picture-in-picture and
  fullscreen at the end. Buttons are 32px with 20px icons (icons on moving
  pictures need the extra size), 40px on phones, where picture-in-picture
  and the volume slider drop out because the device owns them.
- The played part of the timeline is the accent; buffered is a light tint.
  The thumb appears on hover, drag and focus; hovering shows the frame and
  the time above the pointer.
- **Playback controls and the timeline stay left to right in Arabic**
  (Material bidirectionality, Apple HIG): time runs one way in every script.
  Labels, tooltips and menus follow the page.
- Tooltips and menus are the app's: `bg-foreground` tooltips with the
  keyboard shortcut, `bg-popover` menus with 32px rows and a check on the
  chosen item. They stay inside the player so they survive fullscreen.
- Captions are on by default when a video has them, and rise above the
  controls while those show.
- Keyboard: Space or K plays, J and L skip 10s, arrows skip 5s and change
  volume, M mutes, C captions, F fullscreen, 0–9 jump through the video.
- Sound is one 48px row in the page's own theme (56px on phones): play,
  time, timeline, length, speed, volume.
- **Starting a picture** (a video before it plays, an embed before it
  loads, a coding project before it runs) uses one round 56px `StartMark` in
  `bg-foreground`, not the accent, since several can share a page.
- **A list of pictures may show as a grid** (`MediaGrid`): 4:3 tiles, the
  picture itself or a file's icon, its name and one fact below, two a row on
  phones, five on wide screens. The same index toolbar, empty states and
  pagination as a table, and each tile's `•••` menu at its top end. As a
  chooser each tile is a toggle (`aria-pressed`) with a check on the chosen,
  one or several at a time. A page offering both says which with a
  `Segmented` switch at the toolbar's end, kept in the address. A tile
  fetches a small size of its picture, never the original, shows the
  picture's placeholder while it loads and keeps its subject in view.
- **Uploading** reads alike wherever files are given: the media library,
  the editor, a class's or module's files and a picture field. Each file on
  its way is a row of `UploadQueue` with its name, kind and size, a
  progress bar and its percentage, and a Stop button; one that failed says
  why in red, offers Try again only where a second try can help, and is
  taken off the list by hand (Uppy, Polaris DropZone). `FileDropZone` takes
  files dragged onto its area, outlining it with what a drop will do, and
  files pasted into it; a page whose purpose is uploading, such as the
  library, also takes files pasted anywhere outside a field. A paste into
  a field is always the field's.
- **A grid selects like a table**: given batch actions, each tile carries
  a checkbox at its top start (desktop only, as with tables), and while
  any are selected the same `SelectionBar` floats at the grid's foot; the
  toolbar stays.
- **Cropping** (`CropFrame`) shades what a crop leaves out and draws the
  frame clear over the picture; dragging or the arrow keys move it (Shift
  for finer steps), and its shape and size are the caller's controls. The
  frame works in the picture's own pixels, left to right in either script.
- **A picture's subject** (`FocusPicker`) is a round mark over the picture,
  put by a press or a drag and moved by the arrow keys (Shift for finer
  steps), in percent of the picture, left to right in either script. Crops
  start from it and every shape the picture is shown in keeps it in view.
- **Pictures load at the size they are drawn**: a reader's picture has a
  `srcset` of the sizes made on upload and a `sizes` from its block's size,
  holds its own shape before it loads (`aspect-ratio`), and shows its
  ThumbHash placeholder until it arrives.
- Content keeps its own colours: a Scratch stage is white in either theme.
  Everything around it (frames, placeholders, loading) uses `bg-muted` and
  `text-muted-foreground`.

## Motion

150–200ms ease-out for popovers, menus and sheets. Nothing animates on page
load. `prefers-reduced-motion` removes movement.

## Product site

The platform's own page on its bare domain (`components/product/`) sells
the product rather than running a school, so it departs from the rules
above where a marketing page needs to, and only there.

- **Type is larger.** Body text is 16 to 18px and section headings 30 to
  44px, because the page is read once by someone deciding, not worked in
  all day. Arabic display lines are set in Noto Naskh Arabic against Inter
  (`.product-display`), with Latin tracking undone, since Arabic is cursive.
- **The hero is bilingual in both locales.** Its headline is one line in
  each language, each in its own direction, the page's language first.
  Below it the same timetable is shown in English and Arabic, divided by a
  range input, so mirroring is something a visitor moves rather than reads
  about.
- **Brand colour leads.** The header, hero, security band and footer use
  the brand tokens, the school-sidebar green (`brand`) with the pale accent
  (`brand-accent`) for primary actions on it, never colour literals; teal stays the accent on the light sections. In
  dark mode the canvas leans green (`.dark .product-site`) so the bands
  belong to the page.
- **One motif.** The eight-pointed star of the region's geometric patterns,
  as a line lattice (`.product-lattice`, a mask filled with
  `currentColor`), faded out behind the hero, the security band and the
  screenshot panels.
- **Screens are real.** Screenshots in `apps/web/public/product/` are taken
  from the development seed (the Northwind school) and only from it, in
  each language; images carry width and height so nothing shifts, and
  everything below the hero loads lazily.
- **Motion is restrained.** Sections rise in as they scroll into view, only
  where the browser ties the animation to scrolling, only on screen, and
  never with `prefers-reduced-motion`. Nothing waits for an animation and
  nothing moves on its own.

## Sources

- Polaris: page, resource index, resource details and settings layouts,
  badge, contextual save bar, Filters and FilterPill
  (github.com/Shopify/polaris, polaris-react/src/components/Filters,
  shopify.dev/docs/apps/design/user-experience/forms)
- shadcn: the tasks example's faceted filter (ui.shadcn.com/examples/tasks);
  Linear's filters (linear.app/docs/filters)
- Primer: saving pattern, PageHeader, StateLabel, Label, DataTable
  (primer.style/product)
- Atlassian: form, button, lozenge, page header (atlassian.design/components)
- Carbon: forms pattern, data table, status indicators, global header,
  empty states pattern (carbondesignsystem.com)
- Primer: empty states pattern, Blankslate (primer.style/product)
- Polaris: EmptyState, for a whole page and not single elements
  (polaris.shopify.com, from github.com/Shopify/polaris)
- GOV.UK: question pages, text input, error summary, validation, button
  (design-system.service.gov.uk)
- NN/g: required fields, web form design, cancel vs close, efficiency vs
  expectations (nngroup.com/articles)
- Notion help (writing and editing basics, publishing), Linear docs (documents)
- Apple HIG right-to-left; Material bidirectionality (media controls are not
  mirrored)
- Video.js 10 skins and accessibility guide (videojs.org/docs)
