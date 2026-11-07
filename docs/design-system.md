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

| Rule           | Module                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell          | `app-shell` (`AppShell`, `ShellBrand`, `ShellAccount`, `ThemeSubmenu`, breadcrumb steps), `page-actions`                                                                               |
| Index page     | `page-header`, `index-toolbar`, `data-table`, `cell-note` (`CellWithNote`), `empty-state`                                                                                              |
| Page width     | `page` (`Page`)                                                                                                                                                                        |
| Record page    | `record-page` (`RecordHeader`, `RecordTabs`, `RecordColumns`, `RecordSection`, `Facts`, `Fact`, `RecordList`), `stage-path` (`StagePath`), `attention-list` (`AttentionList`), `value` |
| Record content | `usage-list` (`UsageList`), `summary-list` (`SummaryList`), `change-log` (`ChangeLog`), `dns-records` (`DnsRecords`), `copy-button`                                                    |
| Section sheets | `sheet-form` (edits), `sheet-panel` (reads)                                                                                                                                            |
| Record form    | `record-form` (`RecordForm`, `FormSection`, danger zone), `unsaved-changes-guard`                                                                                                      |
| Settings page  | `settings-section` (`SettingsPage`, `SettingsSection`, `SettingsGroup`)                                                                                                                |
| Forms          | `form-field` (`FormField`, `TextField`, `SelectField`, `ChoiceField`, `CheckboxGroupField`, `FieldError`), `combobox-field`, `time-zone-field`                                         |
| Status         | `status` (`StatusBadge`, `StatusText`, `toneSurface`)                                                                                                                                  |
| Feedback       | `action-menu` (`ActionMenu`, `useRunAndReport`), `confirm-dialog`, `dialog`                                                                                                            |
| Side panels    | `panel` (`PanelGroup`, `Segmented`)                                                                                                                                                    |
| Metrics        | `metrics` (`MetricGrid`, `Metric`)                                                                                                                                                     |
| Steps          | `step-nav` (`StepNav`), `form-footer` (`FormFooter`)                                                                                                                                   |
| Status pages   | `status-page` (`StatusPage`, `ErrorPage`, `NotFoundPage`)                                                                                                                              |
| Sign-in pages  | `auth-layout` (`AuthLayout`, `AuthBand`, `AuthHeading`), `theme-toggle`                                                                                                                |

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

Global tools live in the sidebar header on desktop: search (Ctrl/Cmd+K),
notifications, and the school-year switch. The sidebar footer holds the
account, language and theme. On phones the bar keeps search and the
notification bell at the end and page actions collapse into a `•••` menu
(Primer PageHeader).

Page padding is 24px, 16px on phones.

## Page types

Every page sets its width once, by its kind, with `Page` (Polaris and
Shopify's app guidelines draw the same three lines). The content is centred
in the space the shell leaves.

| Kind                         | Width  | Why                                          |
| ---------------------------- | ------ | -------------------------------------------- |
| Index, board, home, report   | 1600px | Tables and boards need the room for columns. |
| Record                       | 1280px | Tables in a tab keep their columns readable. |
| Form, settings, step-by-step | 720px  | One column, one path from top to bottom.     |

### Index page

Lists of students, classes, assignments, messages (Polaris resource index,
Carbon data table, shadcn tasks).

- Header: title with the count in muted text, an optional one-line
  description, and the create action as the only primary button at the end.
- Toolbar (32px controls, 40px on phones): search up to 240px, at most three
  faceted filters, a Reset link, and the view or sort menu at the end. The
  search narrows first and the toolbar then wraps, with the view menu kept at
  the end; it never pushes past the page edge.
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
  no results offers "Clear filters" instead.
- Below 768px rows become stacked cards (name, status, one key fact) and the
  filters move into a sheet.
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
- Selection and batch actions are a desktop tool. Below 768px cards have no
  checkboxes and each card keeps its own `•••` menu, so anything phones need
  must not exist only as a batch action.
- A value that cannot exist for a record, such as the grade of a student with
  no class, is a muted dash read as "Not applicable" (`<Value notApplicable>`).
  "Not recorded" stays for values that should exist and are missing.
- Free text about a row (why it was done, a note, an outcome) is never a
  column of its own, where it wraps every row to several lines. It is the
  second line of the row's primary cell (`CellWithNote`): one muted line cut
  off with an ellipsis, whole on hover and to a screen reader. Columns are
  for values someone compares or sorts down the table.

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
   presence is the signal. Alert chips are not used on a record with a To do
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
  when.
- Content a person wrote (a lead's message) is a titled block in About.
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
- Body: the document title (30px) above a 720px content column; settings for
  the item (audience, dates, class) sit in a 280px panel beside it and move
  above the content on phones.

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

### Settings page

School settings, website settings, notification preferences.

- One column of cards, at most 720px wide and 24px apart, the same cards
  record pages use: the heading and a short description in the card's header
  above a rule, the fields below.
- A long card splits its fields into titled groups divided by a rule (name
  and number, language and time, contact details), still under one Save.
- Each card saves on its own with Save at the card's footer, start side.

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
first invalid field, else to the form's error. Save is never disabled except
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
the value at 24px in tabular figures, and at most one line under it, toned
only when it reports a state ("2 need help"). A metric that counts a list
opens it from the whole tile, its label naming the link. Metrics never
replace the list itself: the records follow below.

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
  badge, contextual save bar (github.com/Shopify/polaris,
  shopify.dev/docs/apps/design/user-experience/forms)
- Primer: saving pattern, PageHeader, StateLabel, Label, DataTable
  (primer.style/product)
- Atlassian: form, button, lozenge, page header (atlassian.design/components)
- Carbon: forms pattern, data table, status indicators, global header
  (carbondesignsystem.com)
- GOV.UK: question pages, text input, error summary, validation, button
  (design-system.service.gov.uk)
- NN/g: required fields, web form design, cancel vs close, efficiency vs
  expectations (nngroup.com/articles)
- Notion help (writing and editing basics, publishing), Linear docs (documents)
- Apple HIG right-to-left; Material bidirectionality (media controls are not
  mirrored)
- Video.js 10 skins and accessibility guide (videojs.org/docs)
