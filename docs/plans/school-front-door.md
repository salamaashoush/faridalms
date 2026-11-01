# Plan: a school's front door

Written 2026-10-31. A school reaches production through its own addresses,
a sign-in page that looks like the school, a website that takes enquiries,
registrations and applications, and a back office where staff work them
through to enrolled students. The operator console creates the school and
keeps its settings. Research behind it:
[../research/website-builder.md](../research/website-builder.md),
[../systems/website.md](../systems/website.md), and the foundation's host,
session and directory model
([../systems/platform-foundation.md](../systems/platform-foundation.md)
sections on domains, sign-in and the directory).

## 1. Principles

1. **Extend the surfaces that exist.** Hosts live in `directory.hosts`,
   schools are made by `provisionTenant`, the site's look is
   `site_settings.theme` and `chrome`, the public form is `submitEnquiry`, a
   student is made by `people.saveStudent`, mail goes through `context.mail`.
   Nothing here opens a second way to do any of those.
2. **Admissions is a domain, not a page.** Enquiries, family registration,
   applications, decisions and conversion are tables, capabilities,
   procedures and audit like attendance or coursework. The website only
   offers the doors into it.
3. **Two kinds of address per school.** A _site_ host serves the public
   website and nothing that reads a session. A _portal_ host serves sign-in
   and the signed-in application. They never share an origin, so a page the
   school writes can never read a session cookie, the app's routes (`/news`,
   `/calendar`) never collide with the site's, and the foundation's rule that
   sign-in never happens on the site domain still holds. A school may bind
   one, both or neither of its own; the platform names always work.
4. **Every absolute URL comes from the school's canonical host**, stored in
   the directory, never from the request's `Host` header.
5. **Every front door is a website-builder page.** The school's sign-in,
   registration, application, contact and admissions pages are pages of the
   school's site, made in the same builder from the same sections, theme and
   chrome, and drawn by the same renderer. What only the platform can
   provide (the sign-in form, the registration form, the application form,
   the enquiry form, the list of open intakes) is a _system section_: a
   section the builder places and styles like any other but whose behaviour
   belongs to its system. A door that holds a session (sign-in, registration,
   applying) is a page the builder makes for the _portal_ host and the portal
   draws it there with the site's renderer; the site host only links or posts
   to it. There is no second editor, no second theme and no second renderer
   for any door.
6. **Applicants are people before they are students.** A family registers an
   account once; their applications, and later their children's records,
   hang off the same identities, so nothing is typed twice and duplicates are
   caught at the door.

## 2. Addresses

### 2.1 Names

| Role   | Platform name           | School's own name (optional) |
| ------ | ----------------------- | ---------------------------- |
| site   | `<slug>.faridalms.site` | `www.school.edu.eg` or apex  |
| portal | `<slug>.faridalms.com`  | `portal.school.edu.eg`       |

The platform names come from wildcard certificates (DNS-01). A school's own
names are optional and, once verified, become canonical: the platform name
answers with a 308 to them, so links already printed keep working.

The product apex signs nobody in: its sign-in asks for an email, then a
password, finds the school once the password is right and hands off to the
school's portal (section 4).

### 2.2 Directory

`directory.hosts` gains:

- `role` (`site` | `portal`), `canonical` (one per school and role),
- `challenge` (random token) and `verified_at` (exists), `checked_at`,
  `last_error`,
- `state`: `pending` → `verified` → `active`, with `failing` when a recheck
  no longer finds the records and `removed` as a tombstone.

Slugs and host labels such as `www`, `api`, `files`, `collab`, `auth`,
`admin`, `ops`, `connect` are reserved.

### 2.3 Verification and certificates

Copying the pattern Vercel, Netlify, Shopify and Webflow share:

1. The operator, or the school's site manager, adds a hostname. The directory
   stores it as `pending` with a challenge.
2. The school publishes `TXT _farida-challenge.<host> = <challenge>` and the
   routing record: CNAME to `<slug>.<sites|cell domain>` for a subdomain, A
   to the platform's reserved address for an apex (many registrars in Egypt
   and the Gulf have no ALIAS).
3. A worker checks both on demand and then hourly, shows expected against
   found, and moves the host to `verified`.
4. The edge (Caddy) issues the certificate on the first TLS handshake through
   on-demand TLS. Its `ask` endpoint answers from one indexed lookup: 2xx only
   for `verified` or `active` hosts. Nothing else ever gets a certificate,
   which closes subdomain takeover and certificate-quota abuse.
5. Once a request has arrived over TLS, the host becomes `active` and, if
   canonical, the platform name starts redirecting to it.
6. A recheck that fails three times marks it `failing`, stops the redirect
   and notifies the operator and the school. Seven days later it is removed.

Let's Encrypt limits fit this. Each school apex has its own budget of 50
certificates a week, and the platform names share one wildcard.

### 2.4 What changes in the app

- `currentSchool()` resolves in order: platform wildcard label, then a
  verified `directory.hosts` row through `byHost` (cached). The bare cell
  host names none and holds no session; its `farida-school` cookie only
  remembers where to send the browser. An unknown host gets a 404, never a
  guess.
- The API builds links (invites, feeds, exports, notification mail) from the
  school's canonical portal host, through one helper replacing the
  `https://<appHost>/...` strings in `people.ts`, `calendar/feed.ts` and
  `files/exports.ts`.
- Cookies stay host-only `__Host-` cookies. A school's custom portal and its
  platform portal are different origins, so a user signs in once on the
  canonical one. The redirect happens before sign-in.
- CSRF: server functions keep the `Sec-Fetch-Site` check. The sign-in form's
  POST also accepts the school's own site hosts as `Origin`, because the
  site's sign-in section posts there.
- LTI, OIDC and other registered callbacks stay on one platform host
  (`connect.<product domain>`) and hand off to the school's portal with a
  one-time code bound to `state`, because redirect URIs must match exactly.
- Collab, files and play URLs are per cell, not per school. They are reached
  with tickets, not cookies, so they need no change beyond an `Origin` check
  on the WebSocket handshake against the school's hosts.
- HSTS: preload the product and sites domains. Schools' own hosts get HSTS
  without `includeSubDomains`, never preloaded.

## 3. Operator console

The console holds only `directory_admin` and must keep no access to school
data. Creating a school needs the cell owner. So the API gains an operator
surface, reachable only from the console's network and authenticated with a
short-lived token the console signs (the operator's OIDC identity in it, for
the audit log). It runs as a new `provisioner` login with exactly the grants
provisioning needs.

The console then offers:

- **Create a school or group:** names in both languages, slug, kind, time
  zone, country, default language, plan and modules. It runs
  `provisionTenant`, writes the directory rows, and creates the first site
  administrator, who receives a set-password link (2.5 below).
- **School settings:** names, state (active, suspended, closing), plan and
  modules (exists), hosts with their verification status, the first
  administrator again if the link expired.
- **Every change** is written to `directory.changes` (exists).

Inside the school, the site administrator then does what the console does
not: logo, address (missing from `saveSchoolSchema` today), year, periods and
rooms (no editor today), people.

### 3.1 Prerequisite: adult invitations and password reset

Today an administrator types a password for every adult, and nobody can
reset a forgotten one. Both block onboarding.

- **Invitations:** extend `openLinks` from students' guardians to any adult
  account: the person receives a one-use link to `/welcome` on the canonical
  portal and chooses a password.
- **Reset:** "Forgot password" on the sign-in page sends the same kind of
  link to the account's verified email, rate-limited per name and per
  network, with the same answer whether or not the account exists.

## 4. Branded sign-in

The portal's sign-in, welcome, badge and reset pages render inside the
school's identity, not the platform's:

- The look comes from the site's theme and chrome (palette, fonts, scheme,
  logo), read through a new public, cached `identity.portalFace` procedure.
  It returns only what a stranger may see: names, logo, theme, and the
  published sign-in page.
- The sign-in page is a page of the site, made in the site builder like any
  other (principle 5): the school arranges sections (a heading, text, a
  picture, help contacts) around the **Sign-in** system section, which holds
  the form and cannot be removed. The portal draws that page with the site's
  renderer, theme and chrome; forgot-password, welcome and badge pages use
  the same page's frame with their own system section. A school that has not
  edited it gets a starter page.
- There is no school-code field anywhere: a school's portal host names the
  school. The bare domain hosts no sign-in and no session; it asks for an
  email, then a password, finds the school only after the password is
  checked (so nobody learns which school an address belongs to), and hands
  the person to their school's portal with a single-use token. A remembered
  school (the `farida-school` cookie) goes straight to its portal.
- The platform name and links to legal pages appear in a small footer.

## 5. Website doors

New site sections, each a door into a system rather than a system itself:

- **Sign in:** a button, or a compact form that POSTs to the portal's
  sign-in, which sets its cookie on the portal and lands the user in their
  workspace.
- **Contact:** the existing `form` section, whose fields become configurable
  (website.md roadmap item 5): a fixed core (name, email or phone) plus the
  school's own questions, stored with the enquiry.
- **Register and apply:** opens the portal's family registration, preset to
  an intake and grade if the section names them.
- **Admissions:** the existing section, now reading open intakes, their
  grades, dates and fees from the admissions system rather than from text.

Spam protection stays as it is (honeypot, minimum fill time, per-network and
per-school limits) and gains Cloudflare Turnstile, verified on the server, on
public forms and on account registration only.

## 6. Admissions

### 6.1 Enquiries

`site_enquiries` becomes the enquiry record for every channel:

- source (web form, phone, walk-in, event, referral), the form's answers,
- state `open` → `in_progress` → `converted` | `closed` (with a reason),
  replacing handled/unhandled,
- assignee, first-response time, a thread of notes and logged contacts,
- links to the family and applicant it became.

Staff are notified when one arrives (a new notification kind), and reply from
templates in either language.

### 6.2 Intakes

One per school, year of entry and grade: opening and closing dates,
capacity, the application form version, the checklist template, fees
(amounts only), the date decisions are released, how long an offer stays
open, an age cut-off (Egypt: 1 October) and ordered priority rules
(sibling, staff child, returning student, additional needs).

### 6.3 Families and applicants

A parent registers on the portal (email verification, Turnstile) and gets an
account with an `applicant_family` role that reaches only their own
applications. Guardians and children are people (`insertPerson`), matched
against existing people at submission through `people.matches` and
`findGuardians`, so a current family applying for a sibling is recognised.
Children's identifiers (national ID, Emirates ID, iqama, passport) go
through the existing identifiers system.

### 6.4 Applications

One per applicant and intake. Answers are stored against a versioned form
(fixed core blocks for the child, guardians, previous schools, health and
needs, consents, plus the school's questions). Drafts are kept on the server
and resumed after sign-in.

Phases are fixed by the product and renamable by the school, with the
school's own sub-statuses inside them:

```
draft -> submitted -> in_review -> decided -> offered -> accepted -> enrolled
                                 \-> waitlisted (ranked) -> offered
exits: declined_by_school, withdrawn, offer_declined, offer_expired,
       deferred (moves to a later intake)
```

- A decision is staff-only until the intake's release date or a manual
  release, then becomes an offer with an expiry.
- Waitlist order is priority rules, then the intake's tiebreak (age).
- Capacity shown on the board is seats minus accepted minus open offers.

**Checklist items** come from the intake's template: documents, assessment,
interview, fee, reference. Each is `pending` → `received` → `verified` |
`waived` | `rejected`. Documents are file blocks in the application, held
under the school's storage limits. **Events** (tour, assessment, interview)
have a slot, attendees and a result.

### 6.5 Conversion

One transaction, from an accepted application:

- the applicant becomes a student, or the existing student on re-application,
  with the school reference;
- guardians are linked with their relationship and legal-guardian flags;
- identifiers, health data and consents are carried over;
- a future placement is made for the intake's year and grade (entry type and
  date, which is what Ed-Fi's StudentSchoolAssociation needs);
- the family's `applicant_family` role is replaced by the guardian role;
- the application is closed, read-only, and linked to the student.

### 6.6 Consent, retention and audit

At submission the guardian gives separate consents for admission processing,
special-category data (health, needs, religion) and marketing, each with the
wording version and time, through the consents system. Egypt's law treats
children's data as sensitive and needs this explicit consent for under-15s.

Unsuccessful and withdrawn applications get a school-set retention period
counted from the intake's close, then go through the existing review and
erasure. Every transition is audited.

### 6.7 Capabilities

`admissions:read`, `admissions:manage` (enquiries, applications, checklist,
events), `admissions:decide` (decisions, offers, release) and
`admissions:configure` (intakes, forms, templates), granted by default to the
site administrator and an "Admissions officer" built-in role.

### 6.8 Staff screens

An enquiries inbox; a board per intake and grade by phase, with capacity; an
application page (answers, checklist, events, notes, history); bulk decide,
release and convert; templates for each phase's letter; reports of the
funnel by stage, source, grade and intake, and time in stage.

## 7. Order of work

Each slice ships with its migrations, both languages, API and browser tests,
and the full gate.

1. **Production baseline.** Dependencies, deploy files, the security fixes,
   the operations guide rewritten for cells.
2. **Adult invitations and password reset** (3.1).
3. **Operator onboarding** (3): the provisioner, create school, settings.
4. **Hosts** (2): the hosts model, verification worker, `ask` endpoint,
   canonical URLs, redirects, the console and site-studio domain screens.
5. **Branded sign-in** (4) and the school finder.
6. **Enquiries** (6.1) and the configurable contact form (5).
7. **Intakes, family registration, applications** (6.2 to 6.4, 6.6).
8. **Decisions, offers, waitlist, conversion** (6.4, 6.5), staff screens and
   reports (6.8).
9. **Re-enrolment**: each returning student's intention for next year
   (returning, undecided, leaving) feeding the existing rollover.

Deferred: online payment and refunds, e-signed contracts, financial aid,
lotteries, agent portals and appeals, ministry integrations (Egypt MoE,
Noor, KHDA), transfers within a group.

## 8. Decisions

Settled on 2026-10-31:

1. **Edge:** self-hosted Caddy with on-demand TLS behind the `ask`
   endpoint, and a DNS-01 wildcard for the platform names. Apex domains work
   with a plain A record, with no upload cap and no per-host fee. Cloudflare
   for SaaS was set aside because apex domains need its Enterprise plan.
2. **Two hosts per school:** site and portal stay separate origins (2.1).
3. **Turnstile** on public forms and account registration only.

4. **Domains:** `faridalms.com` is the product domain and every school's
   platform portal (`<slug>.faridalms.com`); its apex is the product site
   and school finder. `faridalms.site` serves schools' websites
   (`<slug>.faridalms.site`). Two registrable domains keep pages schools
   write off the session's site and their reputation apart. Portal names
   carry no region: while there is one cell the edge routes them all to it,
   and a second cell adds a cached directory lookup at the edge.
