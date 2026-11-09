# The operator console, page by page

The console (`apps/ops`) is where the business sells, sets up, bills and
supports schools. This document says what each page is for and how it is
laid out. A page changes by changing its design here first. The general
rules and components are in [design-system.md](design-system.md), above
all its Record page section; this document applies them to the console.

## Who works here

| Role    | Comes to                                                                              |
| ------- | ------------------------------------------------------------------------------------- |
| Sales   | move leads forward, quote, sell a school, look after the customers they own           |
| Support | see which schools struggle and why, finish their onboarding, fix addresses and access |
| Finance | issue the invoices the daily round drafts, record what was paid, chase what is late   |
| Owner   | all of it, plus the catalogue, the operators and the business's own details           |

Each opens the console with a question ("who owes us money?", "which schools
are stuck?", "what do I call about today?") and then works one record at a
time. Lists answer the question; records are where the work is done.

## The model the pages follow

- A **customer** is the account: the legal entity that pays. It runs one
  tenant, which holds its **schools**, and it holds one **subscription** in
  force at a time. Invoices, payments, contacts, agreements and tasks belong
  to the customer.
- A **subscription** is the contract: the terms, what was sold (plan and
  add-ons) at what price for which schools, and the exceptions (overrides).
  Publishing it gives the schools what it says.
- A **school** is one running school: its health, onboarding, use against
  its limits, modules, addresses and access.
- A **lead** is a school or group that may buy, from first contact to won
  or lost.

No record repeats another's job. The customer shows its plan as a figure
and links to the subscription; the school shows its limits and modules and
says its subscription sets them; the subscription lists its schools and
what publishing would change for each.

## Home

Every operator opens the console here, first thing. They come for two
things: what is due for them today, and whether anything in the areas
their roles work needs someone.

- **Your day** leads the page (an `AttentionList` with an `empty` line):
  the tasks due by today that are theirs or nobody's yet (with Open
  customer and Close), their leads' next steps due by today, and for
  finance one item for the drafts the daily round left to issue. Someone
  else's work is not here. With nothing due it says so in one line, so the
  page never opens on a blank.
- **Figures**, only for areas the operator's roles open, each opening its
  list filtered: Overdue money (largest currency, then customers and the
  other currencies), Drafts to issue, Schools needing help (red, then
  amber), Trials ending within a fortnight (and how many are already
  over), Leads' next steps due for everyone.
- **Schools that need help**: support's queue as one table, worst first,
  each school's reasons as the second line of its name, with onboarding
  progress and sign-ins this week; All schools in its heading row. A
  stalled onboarding is one of the health reasons, so it has no list of
  its own. With every school healthy the section is not drawn; the figure
  says so.

Removed: the two columns with an Onboarding stalled card and a Tasks card
beside the attention list, a Schools count nobody acts on, and an Open
tasks count that the day's list now replaces.

## Records

Every record follows the anatomy in design-system.md: header, path where
the record has stages, figures, To do, then tabs with About first and
History last, each tab one thing. The tables below say what each record
puts in each place. "Menu" lists the header's `•••` actions.

### Customer

Sales and finance open it before a call: is the account in good standing,
what does it hold and until when, what does it owe, who do I speak to.

| Place   | Content                                                                                                                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header  | legal name; the subscription's state; facts: Arabic legal name, country and currency, who looks after it. Menu: New invoice, Record a payment, Pause reminders, Add contact, Record acceptance, Change the account owner, Edit legal details                                                                                 |
| Figures | Owed (overdue amount and since when), Last payment, Plan (when it ends; opens the subscription), Students against those contracted                                                                                                                                                                                           |
| To do   | each overdue invoice (Open invoice), tasks due today or earlier (Close task), running reminder pause (End the pause), no billing contact (Add contact), data processing agreement not accepted (Record acceptance), trial ending within 14 days or over, term ending within 60 days without renewal, nobody looking after it |
| Tabs    | About (legal details, relationship, agreements), Invoices (status facet, New invoice, owed total), Payments (what each settled, Record a payment), Schools (access, health, students, sign-ins), Contacts (Add contact), Tasks (To do or Done facet; Close in the row), History                                              |

### School

Support opens it when a school struggles or is new.

| Place   | Content                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header  | name; access as status; facts: Arabic name, portal address, customer (linked). Menu: Change access, Send the administrator a new link, Edit limits and modules (only where no subscription sets them)                                                                                                                                         |
| Figures | Signed in this week, Students against the limit, Storage against the pool, Onboarding steps taken                                                                                                                                                                                                                                             |
| To do   | each health reason with what to do (Send a new sign-in link, Open its invoices, Open onboarding, Open addresses), a cell that has not finished creating it, an address waiting for its DNS records, a trial ending                                                                                                                            |
| Tabs    | About (school, account with its plan and access explained, where its data lives), Onboarding (steps by phase), Limits (use against limits, allowances), Modules (each with what it gives, status, who turns it on; facet), Addresses (web addresses, then the DNS records any waits for), Sign-in domains (only with single sign-on), History |

### Subscription

Sales opens it to sell, renew or change the contract.

| Place   | Content                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header  | the tenant's name; state; facts: "Sold to" the customer (linked), the plan, the term. Primary: Publish now when changes wait. Menu: Change the terms, Add item, Add override                                                    |
| Figures | Value a term (items in force, before VAT, how billed), Term or trial ends (days left), Students against contracted                                                                                                              |
| To do   | changes waiting to be published (Publish now), a trial ending or over (Set its term), a term ending within 60 days that does not renew itself (Extend the term), nothing sold                                                   |
| Tabs    | Terms, Items (status, when, quantity, unit price, a term; total in force; End in the row; Add item), Overrides (batch End; Add override), Schools (access, usable modules, what publishing would change), Publications, History |

### Lead

Sales opens it to move it forward.

| Place   | Content                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header  | the school or group; stage; facts: the person, email and phone as links. Primary: Log activity. Menu: Move the lead, Plan the next step, New quote, Edit lead details |
| Path    | the pipeline's stages to Won; a lost lead shows Lost and why                                                                                                          |
| Figures | Open for (days), Latest quote (total and state), Last contact (warning after a fortnight)                                                                             |
| To do   | no next step (Plan the next step), next step due or overdue (Log what happened, Plan the next one), won with a customer to set up (Open the customer)                 |
| Tabs    | About (what they wrote, next step, lead details), Activity (Log activity), Quotes (New quote), History                                                                |

### Invoice and quote

Documents. The printable document is the first tab; payments, credit notes,
reminders and history follow as tabs of their own. A draft invoice puts
its lines, then Before it is issued (purchase order, language) above the document,
and Issue is its primary action; an open invoice's primary action is
Settle from a payment. Figures once issued: Total, Paid, Credited, Owed.

### Invoice

Finance opens a draft to check it and issue it, and an issued invoice to
settle it, credit it or enter the tax authority's id from the e-invoice it
submitted; sales and support open one to see what a customer was billed.
The document is what the customer receives, so it is the first tab and
read at full width, not squeezed beside a column of cards.

| Place   | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header  | "Invoice INV-…", or "Draft invoice"; its status, Overdue once an owed invoice passes its due day; facts: the customer (linked), what it is for, the tax authority's id once recorded. Primary: Issue this invoice on a draft; on an open invoice Settle from a payment when the customer has money not yet settled, otherwise Record a payment. Menu: Add a line and Edit the purchase order and language (drafts); Record a payment, Settle from a payment, Make a payment link, Pause reminders (open invoices), Credit it, Record the tax authority's id; Print or save as PDF                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Figures | once issued: Total (issued on), Paid (the last payment) and Credited only when something was, Owed (due on, or overdue since in red)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| To do   | a draft that cannot be issued yet: the customer reverse-charges the VAT without a tax registration number (Open the customer), the business's legal details are missing (Open settings); an issued invoice or credit note whose tax authority id is not recorded (Record its id)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tabs    | Document (the paper; a toolbar row with Show in English or Arabic, the payment link with its copy button, and Print; a draft puts its Lines above the paper, a table of each line's description (the Arabic under it), period and discount only when a line has one, quantity, unit price and net, with the subtotal, VAT and total under it; Add line, a click anywhere on a line or its Edit opens that one line in a sheet that saves it at once, and Remove asks first and is not offered for the last line; then Before it is issued, its purchase order and language with Edit; a credit note opened from its tab replaces the paper, with Show the invoice), Payments (received, how, reference, amount settled; Record a payment; paid total), Credit notes (number with its reason as the second line, issued, tax authority id, amount; Credit it; Record its id in the row; credited total), Reminders (each step the payment clock took, when, who was emailed; Pause reminders), History. A draft has Document and History only |

Removed: the side column of five stacked cards (Paid, Pay by card,
Reminders, Credit notes, Tax authority), each a heading over a list or
"Nothing yet"; the Overdue chip, which the status now says; the Owed fact,
which the figures say; the draft's form, which stood between the paper
and its history; and the grid of every line's fields in its sheet, where
a description was cut to a few letters and a period sat on a third row,
now the Lines table with one line edited at a time.

New invoice is a form at the form width for a service sold once or
anything off the schedule. Opened from a customer it names the customer
and its currency in its description; opened from Billing its first field
chooses the customer. Then the day it is for, and the lines as the same
table the draft shows: empty until Add line opens the first line's sheet
(both descriptions, quantity, unit price and discount with what the line
comes to, then the period and item code), with the subtotal, VAT and
total under them, so what will be issued is checked before it is saved.
The lines are kept on the page until Save the draft, which opens the
draft.

A quote, new or changed, is a form at the form width: what is sold (the
currency, how long it stands, the plan with its quantity, unit price and
discount), its add-ons as a table (each add-on, quantity, unit price,
discount when one has one, and net) with Add add-on, an add-on's row or
its Edit opening that one in a sheet that starts at its list price in the
quote's currency, then the term and the notes. The quote saves as a
whole, since changing a sent one makes a new version.

Credit it opens the credit note as a page at the form width (Stripe's,
Chargebee's and Recurly's credit notes all start from the invoice): the
lines it takes back as the same table, Take back a line (a menu of the
invoice's lines, each opening the sheet filled from it to change its
quantity or price) beside Add line, the total at the invoice's VAT, Why,
then Issue credit note and Cancel, which returns to the invoice. Issued,
it opens the invoice's Credit notes tab.

## Lists and queues

A list is one table at the list width, with search and at most three
facets in the URL; its columns are what someone sorts or decides by. A
queue (Receivables, Billing's drafts) leads with what needs doing and
orders by urgency.

- **Customers**: customer with its Arabic name, the subscription's state,
  schools, owed (overdue in red), looked after by.
- **Schools**: school and address, access, health, onboarding progress,
  students against limit, storage.
- **Subscriptions**: what ends next: customer, plan, state, students against
  contracted, ends (days left, red once past). The daily round is a page
  action with when it last ran.
- **Leads**: a sales rep's queue and pipeline, not a record. No figure
  strip: the counts it would show are the columns' own. Next steps due
  lead the page as a To do list when there are any. One toolbar row holds
  search, Owner, Came from and Include (won, lost) facets and a Board or
  List switch, all in the URL. The board's columns share the width (none
  narrower than 14rem, scrolling sideways past that); each column says its
  count and what its leads were quoted; its cards are most pressing first
  (late, due today, unplanned, planned), each card the organisation, the
  person and size, the next step coloured by urgency, the owner and the
  quote. The list is the same leads as a table to search and scan. With no
  leads at all the page is one empty state saying where leads come from.
- **Billing**: finance's invoices (Stripe's invoices list). Finance comes
  to issue what the daily round drafted, to record money received, and to
  find the invoice a customer asks about. One table of every invoice, not
  one per state: a draft and a paid invoice are the same record at
  different points, and separate tables split the search and hid paid and
  credited invoices altogether. Record a payment is the page action, since
  a transfer arrives for a customer rather than for a row; New invoice is
  in the menu. Search by customer or number, a Status facet (Draft,
  Issued, Partly paid, Overdue, Paid, Credited; Overdue replaces Issued or
  Partly paid once the due day passes, so each invoice has one status and
  the counts add up) and a Tax authority id facet (Not recorded, for the
  ids still to enter after submitting e-invoices). Rows come by urgency:
  drafts oldest first, then overdue longest first, then open by due day,
  then settled newest first. Columns: customer, with what the invoice is
  for as its second line; number; status; issued; due; total; owed. Under
  the table one total per currency of the rows the filters keep, the one
  number the rows do not say; there is no figure strip, since Receivables
  carries what is owed by age. Showing drafts alone offers selection and
  Issue as a batch, confirmed, for the morning the round drafts many; each
  draft's menu also has Issue, so a phone can issue one. An open row's menu
  records a payment from its customer or its tax authority id.
- **Receivables**: what is owed by age and the calls to make; designed
  below.
- **Catalogue**: every plan and add-on as it is sold; designed below,
  with the plan and add-on records it opens.

### Receivables

Finance opens it every morning to make the calls the daily round asked
for, and to see who owes what and how late (QuickBooks' and Xero's aged
receivables summary, Upflow's To do list of collection actions).

- **Header**: the title and one line saying when reminders go and when a
  school loses access, so the steps in the rows read without a manual.
- **Figures**: one per currency, Overdue, with what is owed in all under
  it. It is the one sum the rows do not show (money past due across every
  customer); counts of customers and calls are gone, since the table and
  the To do list say them.
- **Calls to make** (`AttentionList`): each open task the round made, the
  customer and the task, then who to call at the customer (its billing
  contact, the phone a link), whom the task is for and since when; a
  contract's end is danger, a call warning. Close opens the sheet that
  records what came of it. It draws nothing when no call waits.
- **Owed by age** (`DataTable`, most overdue first): the customer, its
  oldest unpaid invoice and where that invoice's reminders stand as the
  second line (how late it is, what the reminders have told or done to
  the school, or that they are paused and until when), access as the
  schools have it, then the five age buckets and the total. The buckets
  carry amounts alone and the total names the currency, so six columns
  of money leave the customer room at 1440px. Each currency's total sits
  under the table. With nothing owed it is one empty state.
- Removed: the "Owed by age" and "Calls to make" headings and the
  sentence under the second, the two count tiles, the Oldest column (it
  is the customer's second line) and the badges squeezed into the name.

### Catalogue

The owner opens it to see what is sold and at what price, to start a new
plan or add-on, and to reach one to change its price or limits (Stripe's
and Chargebee's product catalogues: a list of products, each a page
centred on its prices, archived rather than deleted). A version never
changes once it exists, because contracts hold it; a change is a new
version, and a version no longer offered is retired.

- **The list** is one table of every plan and add-on, as the version a
  contract made today gets: name with the Arabic name under it, kind
  (Plan, Module, Limit pack, Service), what it gives (a plan's modules
  and students, an add-on's module or pack), its price, its version and
  since when (with a version still to go on sale under it), and whether
  it is sold. Search, a Kind facet and Include retired sit in the
  toolbar. New plan is the page action, New add-on in its menu. The
  stacked cards, each listing every version with every limit as a grid of
  facts, are gone: they made the catalogue a wall of numbers nobody
  compares.
- **A plan** is a record, read as the version sold today. Header: name,
  Sold, Not sold yet or Retired, the Arabic name, that version and since
  when, and its price. Primary: New version (it starts from the newest).
  Menu: Retire version n for each version still sold. To do: a version
  waiting to go on sale, with why it was made and See what changes. Tabs:
  About (the plan's names and code; the version's day and prices),
  Modules (the modules it includes, each with what it gives), Limits
  (storage, then the counted allowances, as summary lists), Versions,
  History.
- **An add-on** is the same record without Modules and Limits: About
  says what it gives (a module, or how much one pack adds to which
  limit, or a service that changes nothing in the schools).
- **Versions** is a table, newest first: the version with why it was
  made as its second line, the day it is sold from, its price, what
  changed from the version before (modules gained or lost, limits and
  prices from and to), and whether it is sold, retired (and when) or
  sold from a later day. Retire is in each row's menu and asks why.
- **History** is the record's change log: each version added and retired,
  by whom, when and why.
- **The version sheet** groups its fields under headings: the version
  (names, the day it is sold from), Prices (a table of each price, how
  it is charged and the least a year, with Add price; Add, or a price's
  row, opens that one price in a sheet over the version's: currency, how
  it is charged, the amount and the least a year; Remove asks first),
  Modules, Storage (empty takes the platform's default) and Allowances
  (empty is unlimited), each field as wide as its answer, then Why.

## Administration

Two pages only an owner opens, rarely and with a purpose. Neither is a
record or a queue, so neither has figures.

### Operators

The owner comes here to let a newcomer work (give them roles), to change
what someone may do, to take access away from someone who left, and to
answer "who can get in, and who changed that?" (Stripe's Team page,
GitHub's People page, Linear's Members: one table of people with their
role, state and last sign-in, invitations kept apart, the audit log a
separate view.)

Who may sign in is decided by the identity provider (its group, or the
addresses the console is set to admit); the console decides what each
person may do. Nobody is invited here: a person appears when they first
sign in, holding no role until an owner gives one. The page is an index
page at the list width:

- **Header**: Operators and how many; one line saying who may sign in, as
  the console is set up (the provider's group by name, or the number of
  addresses it admits). No primary action, since nobody is created here.
- **To do**: each person who signed in and waits for a role (Give roles),
  then each operator with a role who has not signed in for 90 days
  (Remove access), the way an access review flags stale accounts. Nothing
  else: a To do here is a decision only the owner can make.
- **Tabs**: Operators (the count) and History. They are two things: who
  holds access now, and how it came to be so.
- **Operators**: one table. Search by name or email; facets Role and
  Access. Columns: the person (name, "You" on the viewer's row, the email
  under it), Roles (the names, "None" while waiting), Access (Active,
  Waiting for a role, Removed, or Not signed in yet for an admitted
  address nobody has used), Last signed in ("Never" where so). Change
  roles is the row's inline action; Remove access (confirms, with why) or
  Restore access sit in its menu. The viewer's own row offers no Remove
  access: another owner does that, so nobody locks themselves out by a
  slip. An admitted address that never signed in has no actions; it is
  there so the owner sees the whole of who can get in.
- **History**: the audit log of access, newest first: who was given which
  roles, whose access was removed or restored, who became the first
  owner, each with why, by whom and when.
- **Change roles** is a sheet: the four roles, each with what it opens,
  and why. Leaving the console without an active owner is refused on the
  Roles field before anything is sent.

Removed from the old page: the State checkbox inside the role sheet
(taking access away is its own confirmed action, never a cleared box),
and the description that only said what a newcomer sees.

### Settings

The owner comes here before the first quote (the business's legal
details, which every quote and invoice prints), when the company moves or
changes bank, and when VAT changes or a new country is sold to. It is a
settings page: one column of cards at the form width, each saving on its
own (Stripe's Business details and Tax settings).

- **Legal details**, one card and one Save, because the details are one
  version printed together and a first save needs all the required ones.
  Groups: Name (English and Arabic side by side), Address (the same),
  Registration (tax registration number, commercial registry), Contact
  (email, phone, website), Bank details (English and Arabic, optional),
  then Why. Each missing or malformed field says so on the field, in its
  own words; a change someone else saved first is the card's error.
- **VAT rates**, a card holding one table rather than a form, since rates
  are added and never edited: a rate takes over from the one before on
  its day. Columns: country by name with how invoices print the tax under
  it (and "reverse charge" where the customer accounts for it), rate,
  from, and whether it is in force, starts later or was replaced. Add
  rate is the table's action; Change rate on a row opens the same sheet
  with the country's details filled in. With no rates the card is one
  empty state: every customer is charged none until a rate is set. The
  add sheet picks the country by name, and a rate that already starts on
  that day is refused on the From field.
- **History**, a card holding the audit log of these settings: the first
  save of the legal details, each later save with the fields it changed,
  each rate added, why, by whom and when. Every save asks why; this is
  where the answer is read. Until something is saved the card is absent,
  since an empty log tells the owner nothing the empty cards above do not.

Removed from the old page: the two-letter country code where a person
reads a country, and the "No rates yet" line under a heading.

## Exam sessions

The owner or support keeps the boards' official sessions (Cambridge
International, Pearson Edexcel, the IB, the UK boards under JCQ) that a
school's exams officer adds to keep coursework for. Each session is a board,
the month it sits in and the day its work may be deleted, after results
enquiries and appeals close. The operator comes to do three things: add next
year's sessions when a board publishes its dates, move a session's
keep-until day when the board changes it, and withdraw a session added by
mistake. Every one of these asks why, for the change log.

A session has four facts and no collections, so it is a row, not a record:
the page is one index table at the list width.

- **Header**: the count of sessions, one line on what they are for, and Add
  a session as the primary action. The menu holds Changes to sessions,
  which opens the Changes page filtered to them, since a session's history
  belongs to the directory's audit log rather than a second table under
  this one.
- **Toolbar**: Board, Year (the year it sits in) and Status facets in the
  URL. Status is derived for the reader: Offered (schools can add it),
  Ended (its keep-until day has passed, so schools no longer see it) or
  Retired (withdrawn by an operator).
- **Columns**: Session (the month it sits in), Board, Keep until, Status.
  Newest sitting first, so next year's sessions lead and the ones long over
  sink to the bottom. On a phone each row is a card: board and month, keep
  until, status.
- **Rows**: Change (inline) edits the keep-until day with a reason; the
  menu offers Retire or Offer again, each with a reason, and Show its
  changes, which opens Changes searched to that session.
- **Adding** asks for board, month, keep-until day and why. A board and
  month already listed is refused on the month field, pointing at the row,
  instead of silently changing the existing session.
- **Empty**: "Add the first session", saying what schools do with one.

Removed: the session's raw id (`cambridge-2027-06`) under its name, the
History section stacked under the table (a second collection on an index
page; it is the Changes page's job), the explanatory sentence at the top of
the sheet, and the Retired checkbox inside the edit sheet, since withdrawing
a session is its own action, not a field.

The console cannot say which schools added a session: that lives in each
cell's database and no cell reports it to the directory yet.

## Changes

Everyone with access to schools reads it, most often support asking "who
changed this school, and why?" and the owner checking what was done across
the platform. It is the directory's audit log (GitHub's organisation audit
log): every change operators and the platform made to schools, school
groups, web addresses, sign-in domains and exam sessions, newest first.
Customers, subscriptions and invoices keep their own history on their
records.

- **Header**: the number of changes in the log and one line naming what it
  covers. No action: the log is read, never written.
- **Toolbar**: search (a school, a group, a web address, a session or words
  in the reason), then Change (what was done, with how many of each), By
  (each operator by name, and the platform's own cells) and When (today,
  the last 7, 30 or 90 days, any time) facets, all in the URL. Filtering
  happens on the server, so it covers the whole log, not the latest page.
- **Columns**: Change (what was done, the reason on the second line and the
  fields it moved, with readable names, below), Record (the school the
  change is about, linked to its History tab, with the address, domain or
  group under it; a session links to Exam sessions), By, When. The whole
  row opens the record.
- **Pagination**: 50 a page in the footer.
- **Empty**: a log with nothing in it says changes will appear as soon as
  one is made; a search that matches nothing offers Clear filters.

Removed: the card around the table and its "Change log" heading, which
repeated the page title, and the 200-row cap that hid everything older.

## Checking a page before it ships

A reviewer refuses a console page that does any of these:

- puts two unrelated collections in one tab, or a tab named Details,
  Overview or Other;
- opens a tab with a heading or a sentence that repeats the tab's name;
- shows an empty collection as a heading followed by "No X yet" instead of
  one empty state with its action;
- shows a figure nobody acts on, or a count the tab, the list or its
  columns already show;
- squeezes a column until its header wraps, or gives free text such as a
  reason a column of its own (it is the row's second line);
- shows an alert chip where the To do list would say it with its fix;
- gives two buttons on one page the same name;
- leaves an action reachable only from a tab that is not open (every tab
  action is also in the header menu);
- shows a raw field name or code (`taxNumber`, `EG`, `quiet_in_term`) where a
  person reads it;
- places a supporting column beside tabs.
