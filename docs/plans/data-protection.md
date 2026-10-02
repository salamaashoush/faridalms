# Plan: retention, requests and erasure

Written 2026-10-02. Research behind it:
[../research/school-packs.md](../research/school-packs.md) sections 2 to 6,
and the platform foundation's erasure model
([../systems/platform-foundation.md](../systems/platform-foundation.md)
sections 4.7 and 6.13), whose tables (`erasure_approvals`, `erasure_items`,
`legal_holds`) and `retention` role already exist.

## 1. Principles

1. **The school decides how long it keeps records.** Under Egypt's
   regulations the controller chooses retention, the UK leaves it to the
   school with DfE guidance, and FERPA sets none. So retention rules are a
   school setting, and a school that has set none is never asked to destroy
   anything.
2. **Nothing is destroyed without a person's approval.** Records reaching
   their keep-until date appear in a review list; a person holding
   `erasure:approve` approves each erasure, optionally with a second
   approver, as the DfE asks of a senior leader.
3. **Holds win.** An active legal hold, an open records request, or exam
   coursework still inside its session's keep-until date blocks erasure, and
   the review list says which one.
4. **Erasure is anonymisation plus listed destruction** (foundation 4.7):
   the person's rows are tombstoned and their personal columns nulled, and
   the files and documents the approval lists are destroyed. Grades and
   attendance stay as the school's statistics, attached to nobody.
5. **Proof is kept.** The approval, what it covered and when it ran stay in
   the ledger and the audit log, because Egypt requires records of erasure
   and the UK asks for a log of what was destroyed, how much, and by whom.

## 2. Slices, in order

1. **Review and holds.**
   - A school's retention rules: students kept a number of years after
     leaving or until an age (England's guidance is the 25th birthday);
     staff a number of years after leaving (DfE: six).
   - A Data protection page with a review list of people past their date,
     each with why it is blocked if it is, and exam sessions past their
     keep-until date.
   - Placing and releasing legal holds with a reason; both are audited.
   - A `privacy:manage` capability for the register work, which
     administrators gain.
2. **Records requests.** A register of access, inspection, correction and
   erasure requests, each with its law's clock: UK subject access one month
   from proof of identity (extendable by two), England parents' educational
   record 15 school days, FERPA 45 days, Egypt 6 working days. An open
   request blocks erasure of its subject.
3. **Erasure.** Approving from the review list or a request, listing the
   person's documents and files, then running the erasure as the
   `retention` role in one transaction, with counts recorded as proof.
4. **Consent and breach registers.** Consent records per purpose (the table
   exists), and a breach register with Egypt's 72-hour regulator notice and
   3-working-day notice to people.

## 3. Erasure as built

- Approving and running are two calls. The approval must commit before the
  `retention` role can see it, and a run that fails leaves the approval
  standing, shown as "approved, not yet run", to be run again.
- The API needs `CELL_RETENTION_URL`, a connection as `retention`. Without
  it the review list says erasure is not switched on, and nothing runs.
- What a run destroys: the person's name, birth date, photo, demographics,
  contact points, external ids, sign-in (accounts tombstoned; identities,
  passkeys, devices, sessions deleted), preferences, saved views, calendar
  feeds, health records, custody restrictions, audit
  payloads and activity events; the drafts and handed-in copies of their
  work redacted with every version; the files only that work held.
- Not yet covered: quiz answers, lesson responses and messages they wrote
  stay attached to the anonymised person, because `retention` holds no
  grant on those tables; health and custody files are not listed. Each
  needs a grant and a policy reviewed against the catalogue check.
