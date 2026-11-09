# A school's first run

What a newly created school's administrators meet, and why it is built the
way it is. The setup guide is on Today; the operators follow the same steps
in the console's Onboarding tab.

## What other products do

- **Stripe** verifies a business on a dedicated onboarding page and lets
  the account work in a sandbox before then
  (docs.stripe.com/get-started/account/activate). Its published go-live
  checklist is ticked by hand and kept in the browser
  (docs.stripe.com/get-started/account/checklist), so it goes stale as soon
  as a second person works on the account.
- **Linear** splits its start guide by company size and by admin or member
  (linear.app/docs/start-guide), lets only admins invite by default and
  assigns teams in the invite itself (linear.app/docs/invite-members), and
  previews an import before running it. Its in-product checklist lets
  invites and integrations be skipped, so they never stand between a new
  workspace and its first use.
- **Notion** asks one question (work, personal, school) and tailors a
  getting-started page and templates to it.
- **Google Workspace for Education** orders setup as domain, organisational
  units, then users, importing users from CSV 500 at a time or by directory
  sync (edu.google.com quickstart). Teachers are approved into Classroom by
  an admin.
- **Microsoft 365 Education** keeps a baseline checklist of tenant,
  identity, School Data Sync and licences, and its admin centre's Setup page
  reads completion from the tenant's own state. School Data Sync validates
  files, then headers, then data, with non-blocking data errors reported
  per file.
- **ManageBac** configures a new academic year and its terms before classes,
  which must name the terms they run in, and attendance can only be taken
  against a timetable slot. **Toddle** puts a "School setup" card in its
  admin portal, takes staff and students by SIS sync or bulk upload with a
  template that comes pre-filled, and runs a rollover wizard each year.
- **Nielsen Norman Group** on empty states: say what is going on, teach what
  belongs there, and give a direct path to the task that fills it.

## What applies here

1. **Done comes from the school's data, never a tick.** Several
   administrators set a school up together; a step reads done when the
   data shows it (a year with a term, a class, a placed student with a
   guardian). Only the operators' own steps (kick-off call, training, data
   import) are ticked, and only by an operator.
2. **The order is the order of dependence.** Details, then the year and its
   terms, then grades and classes, staff, students and families, the
   timetable, and last the website and admissions. Classes belong to a
   year, students are placed in classes, and registers follow the
   timetable, as ManageBac and Google order theirs.
3. **The next step is obvious.** It is marked, and its link is the card's
   one filled button; the rest are outline.
4. **Optional steps never hold the setup open.** The website and
   admissions say they are optional and are left out of "finished", as
   Linear lets invites wait.
5. **Every empty page points at the step that fills it.** A page that lives
   in a year, opened before there is one, says so and links whoever may set
   it up to the year editor (`NoSchoolYear`); anyone else is told who does.
6. **A step the viewer may not take says who does.** The guide shows on the
   office's Today; each step is linked only for someone holding the
   capability its page asks for, and says who sets it up otherwise.
7. **It can be put away only when it is finished.** Hide appears once every
   required step is done and is kept per person; until then the guide
   stays at the top of Today, above the day's work.
8. **One list, not two.** The guide is the onboarding the console already
   measured (`packages/domain/src/onboarding.ts`), grouped into the school's
   own steps; the operators see the same items in the same order.

## Built

- `SETUP_STEPS` in the domain groups the onboarding items into the school's
  steps; `timetable_ready` and `admissions_ready` were added to the
  measured items, and the school's details count as done with a logo and a
  phone number or email, which Settings can set (it has no address field).
- `home.admin` answers the steps, the rest of the items and whether the
  setup is finished; `home.hideOnboarding` refuses until it is.
- `SetupGuide` in the design system draws it; `SchoolSetup` on Today fills
  it from the school's data and the viewer's capabilities.
- `e2e/fresh-school.spec.ts` opens every page of a school created as
  production creates one, and `e2e/onboarding.spec.ts` walks its guide.

## Not yet

- A guided import of students and families with a preview and a per-row
  report (School Data Sync's passes, Toddle's pre-filled template); the
  step links to Students, which adds them one at a time.
- An address field in Settings: a school cannot set its postal address
  itself yet.
- The year step coming back each year for the next year's setup; the
  "next year" card on Today covers rollover for now.
