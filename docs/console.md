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
Before it is issued (lines, purchase order, language) above the document,
and Issue is its primary action; an open invoice's primary action is
Settle from a payment. Figures once issued: Total, Paid, Credited, Owed.

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
- **Billing**: invoices by status, with Record a payment as the page action.
- **Receivables**: what is owed by age and the calls to make.

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
