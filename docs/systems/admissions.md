# Admissions

From a family's first question to a child applying for a place: enquiries,
intakes, family registration and applications. Decisions, offers, the
waiting list and conversion into a student follow
([plan, sections 6.4 and 6.5](../plans/school-front-door.md)). The doors a
family meets are pages of the school's site ([website.md](website.md)).

## Intakes

One per school, school year and grade (`core.admission_intakes`): the
first and last day families may apply, the places, the application form,
the checklist template (documents, assessment, interview, fee, reference,
each required or not), fees as amounts in one currency, the day decisions
are released, how many days an offer stays open, the day ages are counted
on and the youngest and oldest age in months, and the order of preference
(sibling, staff child, returning student, additional needs). The year and
grade never change once made.

Ages default to Egypt's rule: counted on 1 October of the year of entry,
KG1 from 4 years to 5 years and 11 months, grade 1 from 6, a year more for
each grade after. A child outside the range cannot be sent.

## Forms

A form (`core.admission_forms`) holds the school's own questions, each in
both languages, of the kinds the website's enquiry form asks (short, long,
choice, date, number); a family reads them in their language and answers
are checked by the same code. Publishing copies the form into a numbered,
unchanging version (`core.admission_form_versions`). An application is
answered against the version current when it started.

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

Every state exists in the table; one move table in
`packages/domain/src/admissions.ts` says who may make each move. Today a
family sends or withdraws a draft and withdraws a sent one, and the office
starts a review or withdraws on the family's word. Checklist steps go
`pending` -> `received` -> `verified` | `waived` | `rejected`.

The office's notes and every change of state or step are the application's
history (`core.admission_entries`), which the family never reads. What the
office and the family say to each other is a conversation in Messages.

## Capabilities

`admissions:read` and `admissions:manage` work enquiries and applications,
`admissions:decide` decides and releases, `admissions:configure` sets up
intakes and forms. The site administrator and the Admissions officer role
hold all four.

## Retention

The school sets how many months an application that was withdrawn or not
offered a place is kept after its intake closes. Such applicants then come
up in the privacy review, and erasing one empties the application and
tombstones it.
