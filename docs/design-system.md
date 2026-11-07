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

| Rule           | Module                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell          | `app-shell` (`AppShell`, `ShellBrand`, `ShellAccount`, `ThemeSubmenu`, breadcrumb steps), `page-actions`                                       |
| Index page     | `page-header`, `index-toolbar`, `data-table`, `empty-state`                                                                                    |
| Page width     | `page` (`Page`)                                                                                                                                |
| Record page    | `record-page` (`RecordHeader`, `RecordTabs`, `RecordColumns`, `RecordSection`, `Facts`, `Fact`, `RecordList`), `value`                         |
| Record content | `usage-list` (`UsageList`), `summary-list` (`SummaryList`), `dns-records` (`DnsRecords`), `copy-button`                                        |
| Section sheets | `sheet-form` (edits), `sheet-panel` (reads)                                                                                                    |
| Record form    | `record-form` (`RecordForm`, `FormSection`, danger zone), `unsaved-changes-guard`                                                              |
| Settings page  | `settings-section` (`SettingsPage`, `SettingsSection`, `SettingsGroup`)                                                                        |
| Forms          | `form-field` (`FormField`, `TextField`, `SelectField`, `ChoiceField`, `CheckboxGroupField`, `FieldError`), `combobox-field`, `time-zone-field` |
| Status         | `status` (`StatusBadge`, `StatusText`, `toneSurface`)                                                                                          |
| Feedback       | `action-menu` (`ActionMenu`, `useRunAndReport`), `confirm-dialog`, `dialog`                                                                    |
| Side panels    | `panel` (`PanelGroup`, `Segmented`)                                                                                                            |
| Metrics        | `metrics` (`MetricGrid`, `Metric`)                                                                                                             |
| Steps          | `step-nav` (`StepNav`), `form-footer` (`FormFooter`)                                                                                           |
| Status pages   | `status-page` (`StatusPage`, `ErrorPage`, `NotFoundPage`)                                                                                      |
| Sign-in pages  | `auth-layout` (`AuthLayout`, `AuthBand`, `AuthHeading`), `theme-toggle`                                                                        |

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

| Kind                         | Width  | Why                                              |
| ---------------------------- | ------ | ------------------------------------------------ |
| Index, board, home, report   | 1600px | Tables and boards need the room for columns.     |
| Record                       | 1280px | Two columns read at a glance without wide lines. |
| Form, settings, step-by-step | 720px  | One column, one path from top to bottom.         |

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
  its name there, so one long name never scrolls the table sideways. Names
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

### Record page

A school, a customer, a student, a class (Salesforce Lightning's "Header and
Right Sidebar" template, HubSpot's record page, Stripe's customer page).

- Header: identity (photo, name, key facts), status, alert chips, and at most
  one primary action plus a `•••` menu. Below 768px the action and the menu
  move into the top bar's `•••`, as on every other page; the header keeps
  identity only. A change of state the record's status names (access, a
  lead's stage) is an action in the menu, and the status badge shows where it
  stands, so the state is never shown twice.
- Key facts sit on one muted 14px line separated by `·`, at most three. A
  separator never ends a line when the facts wrap.
- Alert chips: 24px high, `rounded-md`, 12px medium text with a 14px icon,
  tinted with the status tone and a border in the same colour. Info, warning
  or danger only; they name what a reader must not miss (allergies, no
  guardian), never a count.
- Under the header, two columns on wide screens: the main column (two thirds)
  and a supporting column (one third) that stays in view as the main one
  scrolls (`RecordColumns stickyAside`). Phones stack them, supporting last.
- The main column opens with up to four widgets (`MetricGrid`), and only for
  what decides what someone does next: a health that needs help, progress
  towards a goal, a count against its limit. A number nobody acts on is not a
  widget. A record with nothing like that has no widgets.
- The supporting column holds an "About" card of facts that hold whatever
  tab is open (where the record lives, what its state means, its owner) and
  links to the records it belongs to. Nothing in it repeats a widget or a
  tab.
- Tabs follow the widgets when the record has two or more jobs worth a page
  each, named by the job ("Onboarding", "Addresses", "History"), never
  "Details" or "Other". A record with one job has no tabs. Tabs live in the
  URL; switching one replaces the history entry and keeps the scroll
  position (`resetScroll: false`), and a tab the viewer may not open
  redirects to the first, so the URL always names what is shown.
- Inside a tab, sections are ruled off, not framed (`RecordSection
  variant="page"`): a tab is one surface. Each section is designed for its
  job, not a pile of facts: several records with several attributes are a
  table (`DataTable`); settings compared down a column are a summary list
  (`SummaryList`); limits are use against allowance (`UsageList`); a
  checklist groups its steps by phase with each phase's progress. Cards are
  for widgets, the About card and groups that sit side by side.
- A section has at most one ghost Edit button at the end of its heading row,
  or one outline action that adds to it ("Add host"). Nothing is edited
  inline in a table.
- Facts are label above value (13px muted label, 14px value), in a grid that
  reflows with the section's width. A missing value reads "Not recorded";
  typed text is isolated with `dir="auto"`.
- One record looks the same to every role; the role changes which sections
  and actions it offers, never its layout. A name of a class, a student or a
  person links to its record where the viewer may open it, and is plain text
  where they may not.

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
work is measured by (Polaris, Carbon). At most five; each is a 13px label,
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
