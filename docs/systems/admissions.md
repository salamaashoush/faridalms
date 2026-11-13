# Admissions

From a family's first question to a child starting at the school:
enquiries, intakes, family registration, applications, decisions, offers,
the waiting list and enrolment
([plan, sections 6.4 and 6.5](../plans/school-front-door.md)). The doors a
family meets are pages of the school's site ([website.md](website.md)).

## Intakes

An intake (`core.admission_intakes`) has a title and the day its entrants
start, and belongs to no year or grade itself. Where the school keeps
years it admits into one (`core.intake_years`), and where it keeps grades
into one grade (`core.intake_grades`); each link is admissions' own,
needing that module, and shows only where both are on. Where the school
keeps no families, the applicant is an adult applying for themself, and
sign-in, registration and the application speak to them in their own
words.

An intake holds the first and last day families may apply, the places and
the application form. It also holds the checklist template (documents, assessment, interview, fee, reference,
each required or not), fees as amounts in one currency, the day decisions
are released, how many days an offer stays open, the day ages are counted
on and the youngest and oldest age in months, and the order of preference
(sibling, staff child, returning student, additional needs). The year and
grade never change once made.

Ages default to Egypt's rule: counted on 1 October of the year of entry,
KG1 from 4 years to 5 years and 11 months, grade 1 from 6, a year more for
each grade after. A child outside the range cannot be sent.

## Forms

A form (`core.admission_forms`) holds the school's own questions as
question blocks written in the editor, in the language the school chose
first with their translation beside it, of the kinds the website's
enquiry form asks (a typed answer or a day, words, a choice, a number),
each optional or required ([questions.md](questions.md)). A family reads
them in their language; their answers are responses checked by the same
code as an enquiry's and kept in the words they read. Publishing copies
the form into a numbered, unchanging version
(`core.admission_form_versions`). An application is answered against the
version current when it started.

Every application also asks the fixed blocks: the child, the family, the
schools before, health and needs, and consents.

## Families

A parent registers on the portal's registration page: a name, an email and
a phone, checked by Turnstile where it is set up, then by the hidden field,
the fill time and limits per network and per address. The answer is the
same whatever happened. A new address is sent a link that confirms it and
chooses the password; an address that already signs in is told so in its
inbox. Using the link opens an `applicant_family` role at the school, which
opens the family workspace with `applications:submit` and nothing of the
school's. A family already at the school applies from its own account.

Confirming the address runs `adoptFamilyRecords`, the one place a family is
joined to what the school holds under their address: their open enquiries
name them as the family. Conversations the Messages system kept with them
as an outside participant are adopted in the same function.

## Applications

One per child and intake (`core.admission_applications`). The child is a
person from the first save; their names, birth date and sex are on their
person, an identity document goes through the identifiers system sealed,
and health and needs are health records of their kinds behind the health
purpose. The other guardian, the schools before and the answers stay on
the application until it is sent. Documents are files of the
`admission_document` purpose filed under their checklist step
(`core.admission_items`), counted against the school's and the family's
storage.

Sending checks the child's age, the family's parental responsibility and
the school's questions, then:

- records each consent asked (application processing, health and needs,
  news) with the published words agreed to, through the consents system,
  against the relationship the family declared;
- makes the other guardian a person with their contacts and relationship;
- finds people the school may know: students with the same name and birth
  date or identity document, people holding the family's email or phone,
  current students sharing a parent, and parents on the staff, from which
  the intake's preferences are ranked;
- marks the family's open enquiry converted and links it to the family and
  child;
- numbers the application by year of entry (`2027-0042`);
- tells the office and the family through notifications.

### States

```
draft -> submitted -> in_review -> decided -> offered -> accepted -> enrolled
                                 \-> waitlisted -> offered
exits: declined_by_school, withdrawn, offer_declined, offer_expired, deferred
```

One move table in `packages/domain/src/admissions.ts` says who may make
each move: the family, the office, or the school's clock, and which of the
office's moves need `admissions:decide`. Every move goes through
`moveApplication` (`apps/api/src/core/decisions.ts`), which writes the
history, the audit log, the letter the move sends and the family's notice,
so no move records less than another. Checklist steps go `pending` ->
`received` -> `verified` | `waived` | `rejected`.

## Decisions and offers

The office decides an application under review: offer a place, the
waiting list, or decline. Until it is released the decision is the
office's alone; the family still reads "in review". Decisions are released
by hand, from the application or many at once from the intake's board, or
by the clock (`core/admissions-clock.ts`, every five minutes) on the
intake's decisions day at the school's own midnight; one made after that
day is released at once.

The places left are the seats less the offers accepted (and enrolled) and
the offers still open. The office's release goes all or not at all, so an
offer with no place refuses the release; the clock releases what fits and
leaves the rest decided. An offer stays open for the intake's days; the
family accepts or declines it in their account, or the office records the
answer they gave by phone, and the clock lets an unanswered one lapse. The
waiting list is ranked by the intake's priorities in its order, then the
older child, then who sent first; places are offered from it while any
remain, and closing it sends the refusal.

Deferring carries an application to an intake of a later year as it was
sent, with that year's number and checklist; the first ends `deferred` and
each links to the other.

Tours, assessments and interviews (`core.admission_events`) have a day,
hours, a place, the admissions staff who attend and an outcome with notes;
the family sees what is booked, and attending an assessment or interview
step has that step in.

## Letters

Each phase sends a letter: the offer, the waiting list, the refusal and
the welcome. They are templates of the `admission_letter` kind in the
Templates system, one per phase in each language, given to every school
when it is made (`giveLetterTemplates`) and edited on the Letters screen;
they are never removed. A letter is written from the template in the
language the family applied in, its fields in braces (`{family}`,
`{child}`, `{grade}`, `{year}`, `{school}`, `{reference}`, `{expires}`)
filled in, and frozen as sent (`core.admission_letters`, its words hosted
as `admission_letter`). The family reads it with their application, and
the same words are a message in their conversation with admissions,
written through Messages' `writeEntry`, so they reach the family by email
like any other message.

## Enrolment

Enrolling an accepted applicant runs in one transaction
(`core/enrolment.ts`). The child becomes a student with the school's
reference (the application number unless the office gives another), or,
when matching found the school's own former student and the office
confirms it, that student keeps one record: the applicant's identity
document, consents, health and needs and family links are joined to it and
the duplicate person is retired. The guardians the family named are linked
with their relationship and legal-guardian flags, the applying parent now
with the portal and notices; the identity document, health and consents
stay with the child as they were kept from the first save. A placement for
the intake's year and grade starts on the year's first day, with how the
child came (first enrolment, transfer with the school before, or
re-entry). The family role the links give replaces the applying role,
which ends the day the child starts so the family keeps their workspace
until then. The application closes read-only, linked to the student, and
the welcome letter is sent.

## The office's screens

Each intake has a board by phase with its places, where applications are
decided, released, offered from the waiting list and enrolled several at
once; each application has its own page for one at a time. Reports show a
year's funnel by stage, by grade and intake and by where families came
from, and how long applications stay in each state, measured from their
history.

The office's notes and every change of state or step are the application's
history (`core.admission_entries`), which the family never reads. What the
office and the family say to each other is a conversation in Messages.

## Capabilities

`admissions:read` and `admissions:manage` work enquiries and applications,
`admissions:decide` decides and releases, `admissions:configure` sets up
intakes and forms. The site administrator and the Admissions officer role
hold all four.

## Retention

The school sets how many months an application that was withdrawn, not
offered a place, or whose offer was declined or lapsed, is kept after its
intake closes. Such applicants then come up in the privacy review, and
erasing one empties the application, the events booked for it and the
letters sent, removes the documents its checklist held, and tombstones it.
