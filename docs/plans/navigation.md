# Navigation

How the staff portal's sidebar stays calm for a person whose role reaches
much of the school, and why. The owner raised three complaints: the
sidebar of an administrator who also teaches is cluttered, the Library,
the Media library and Letters overlap in name and content (Library and
Media library were the old names of Templates and Media), and Admission
reports reads unlike the pages around it.

## What was there

Staff share one tree (`apps/web/src/components/app/navigation.ts`),
filtered by capability and by the school's modules. An administrator at a
school with every module saw 30 links in six groups: Today; Teaching (10);
People (3); Communication (4); Admissions (5); School (7). A teacher saw
15, office staff 8, a family 13 and a student 10. Every link was visible
at once and each carried the same weight, so the daily ones (Today, To
review, Attendance, Messages) sat among yearly ones (School year, Billing,
Delivery log).

The search (Ctrl/Cmd+K) already jumps to pages: with nothing typed it
offers the first six links of the person's tree, and typing narrows them
by label beside the record results and recent hits.

## What others do

Read in November 2026 from the products' own help pages, unless marked.

- **Linear** lets each person reorder the sidebar, hide items or move them
  into a More menu, and keeps Favorites above the teams
  (linear.app/changelog/2024-12-18-personalized-sidebar,
  linear.app/docs/favorites).
- **Notion** groups the sidebar into Recents, Favorites, Teamspaces,
  Shared and Private. Each section collapses by its name and shows a set
  number of items before a More link
  (notion.com/help/navigate-with-the-sidebar).
- **GitHub** pairs a menu of frequently visited places with breadcrumbs
  that follow the information architecture, and a command palette scoped
  to where you are (docs.github.com, github-command-palette).
- **Stripe Dashboard** shows five primary items, then Shortcuts (pinned
  and recently visited pages), then the products in use, with the rest
  under More (docs.stripe.com/dashboard/basics).
- **Shopify admin** keeps the main sections in the sidebar with pinned
  apps beneath and Ctrl/Cmd+K search; its app navigation guidance caps a
  list at seven before "View more" and uses one- or two-word nouns
  (help.shopify.com, shopify.dev/docs/apps/design/navigation). Its admin
  lists a section's pages under the section while it is open (Products,
  then Collections, Inventory); the help pages do not describe this, so
  it is from use rather than documentation.
- **Atlassian** (Jira and Confluence, 2025) shows For you, Recent and
  Starred, and puts everything else behind More, where each person picks
  what shows (support.atlassian.com, what-is-the-new-navigation-in-jira).
- **Microsoft 365** keeps a few pinned apps on the bar and the rest under
  "More added apps", searchable; administrators may pin up to three for
  everyone.
- **School systems.** Toddle's admin portal moved from a card dashboard
  to a sidebar with a section per programme, hides a module the school
  has not enabled even when the role permits it, and varies the teacher's
  home by permission (support.toddleapp.com). PowerSchool removes links a
  role may not use ("Set Menu Security"). ManageBac and Veracross publish
  little; ManageBac's help describes pinned tiles on the home menu, which
  could not be confirmed from the page itself.

Nielsen Norman Group:

- Neither flat nor deep wins outright; flat suits distinct, recognisable
  categories (nngroup.com/articles/flat-vs-deep-hierarchy).
- Hidden navigation costs: on desktop, people used a hidden menu in 27%
  of cases against 48% for a visible one, and took longer
  (nngroup.com/articles/hamburger-menus). Hiding is a cost to spend only
  on what is rarely needed.
- Labels are specific, familiar and front-loaded, and categories must not
  overlap in meaning (nngroup.com/articles/menu-design,
  category-names-suck).
- Show where the person is, and give closely related pages local
  navigation (menu-design, guidelines 5 and 6).
- Progressive disclosure: show the few most important options first;
  more than two levels of disclosure usually fail
  (nngroup.com/articles/progressive-disclosure).
- Accelerators such as a search palette are an addition for experts,
  never the only way to a page (nngroup.com/articles/ui-accelerators).
- People rarely customise; the default has to carry the load
  (nngroup.com/articles/customization-of-uis-and-products).

## Decisions

### 1. Areas are one link (hubs)

A group of pages that serve one job becomes one link, and its pages list
beneath that link while the person is inside it, as Shopify admin does.
Two areas:

- **Admissions**: Enquiries, Applications, Intakes, Reports, Letters.
  Five links become one; the link lands on the first page the person may
  open (`/admissions` redirects there).
- **Library**: Templates and Media (below). The area has no address of
  its own: its link is Templates, the first of its pages anyone who sees
  the area may open.

Area tabs on the page were considered and refused: Enquiries,
Applications, Intakes and Templates already have their own status tabs,
and a second row of tabs above them would be two levels of the same
control. Listing the pages in the sidebar keeps every page's anatomy as
it was and shows where the person is (NN/g), and the breadcrumb names the
area and the page (Admissions › Reports).

### 2. What is opened now and then folds under its section's More

An item is marked `more` when it is set up once or opened now and then:
Grading, Standards, Website, School year, Billing, Data
protection, Delivery log. They fold under a More row at the end of their
section, which opens in place (not a popover) and is remembered in a
cookie, as the sidebar's own open state is.

Folding is a per-person default rather than a fixed list: a section folds
only when the person sees more than five links in it and at least two
would fold. A teacher, office staff, a family and a student see their
sections whole; an administrator sees the daily links and two Mores. The
page open now always stays in view even while its More is folded.

### 3. Labels that do not overlap

See "Library: Templates, Media and Letters" below.

### 4. No favourites or pins, for now

Pinning needs somewhere to keep each person's pins. School computers are
shared, and NN/g finds people rarely customise, so a per-role default
carries the load and the search covers jumping to anything. Recents
already exist in the search (kept per tab, not per device, for the same
reason). Pins stay an open question for the owner.

### 5. The search finds every page by its own name

With nothing typed it offers the person's links; typing also matches an
area's pages by their own names ("media" finds Library › Media,
"reports" finds Admissions › Reports), since the sidebar lists them only
inside the area.

### 6. Collapsible sections were not adopted

Notion and Linear collapse sections because their sections are made by
the user and unbounded. Ours are five fixed groups whose daily links
should never be one click away; the More does the folding where it pays.

### 7. Phones

The bottom bar keeps its rule (the first three of a preference list the
person sees, then Messages, then More). Admissions joins the preference
list after Students, so someone who runs admissions without teaching
gets it on the bar. More opens the same sidebar, with the same folds and
area pages.

## Library: Templates, Media and Letters

What each holds:

- `/templates` holds **templates**: lessons, unit plans, assignments,
  announcements, events, consent forms, whole modules, reply templates
  (kind "Reply"), letters of admission and website sections. Each is a
  starting copy; using one makes a new document.
- `/media` holds the school's **pictures, video and files**, shown by
  reference: a change to one shows wherever it is used.
- `/admissions/letters` lists the **letters of admission** the school was
  given, one per phase in each language: templates of kind
  "Letter of admission" that the product sends from and the school edits
  but never removes.

Decisions:

- One **Library** area holds both stores of reusable things, with two
  pages named by what they hold: **Templates** (`/templates`) and **Media**
  (`/media`). "Library" names only the area, in the sidebar and nowhere
  else: the code, the API (`templates.*`, `media.*`, and `pictures.*` for
  the open picture search) and the wording say templates or media.
  Templates moved from `/library` to `/templates` with no redirect, and
  `/library` no longer exists. Wording that said library now names what it
  means: "Share as a template", "Remove from templates", "Choose from
  media", "Keep in media", "Add to media".
- **Letters** stays where it is used, as a page of Admissions, since only
  those who configure admissions edit it. Its letters also appear in
  Templates under the kind "Letter of admission".
- Templates' **Use** for a letter of admission and for a reply used to
  open the assignment editor with the template, which made a broken
  assignment. A letter now offers "Edit the letter", which opens the
  letter editor; a reply says it is used from a message's "Start from a
  template" and offers no Use.
- The Library link is shown to whoever may open Templates, as its page
  already allowed: every capability that writes some kind of template.
  It used to be shown for `assignments:author` or the reviewer capability
  (now `templates:review`), so
  office staff who keep letters, replies and consent forms had no link,
  and a reviewer who wrote nothing had a link whose page refused them.
  Media is offered to those its page admits (`MEDIA_USERS`); before, its
  link needed `site:manage`, so teachers reached it only from an editor.
  Everyone Media admits also writes some kind of template, so Templates is
  always the first page of the area they may open.
- Website section templates keep their two entrances: the builder's
  Saved list where they are used, and Templates where they are kept.
  Consent form templates likewise open from Data protection and from
  Templates.

## Reports

Admission reports was the only report standing alone as a long page of
four framed sections. It is now a tabbed page like the others: the school
year above, then one report per tab (By stage, By grade and intake, By
origin, Time in each state), the tab in the address. The year and every
chart and table are kept; the year chosen holds across tabs. Attendance's
reports were already a tab of Attendance. No other report page stands
alone: the delivery log is a log, and media storage is a sheet of the
media page.

## Links before and after

Seeded Northwind school, every module on, counted in the browser.

| Person                       | Before | After                      |
| ---------------------------- | ------ | -------------------------- |
| Administrator (also teaches) | 30     | 18, with 7 under two Mores |
| Teacher                      | 15     | 15                         |
| Office staff                 | 8      | 8                          |
| Family                       | 13     | 13                         |
| Student                      | 10     | 10                         |

Inside Admissions an administrator sees its five pages beneath its link
(23 then); inside Library, its two.

## For the owner

- Whether to add pins or favourites later, and where they would be kept.
- Whether Website belongs under More for an administrator; it folds
  because the school's site changes seldom once it is built.
- Whether teachers should see Media inside Library (they may open it and
  choose from it in every editor; the link is new to them).
- Whether the family's tree, nine links before Communication, should
  fold Permissions and Applications the same way.
