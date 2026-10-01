# Documents and files: access, hand-ins and records

Written 2026-10-01 to answer: what is the standard way to run documents and
files in a school platform, with proper access control and every school
function intact? Farida is curriculum-neutral; its first schools follow IB,
IGCSE/A level (Cambridge, Pearson Edexcel) and American international
curricula, and law and exam-board rules are per-school settings. The file
mechanics already built are in [interactive-coursework.md](interactive-coursework.md)
section 4; the foundation's file tables are in
[../systems/platform-foundation.md](../systems/platform-foundation.md) section 6.5.

## 1. How the leading platforms do it

**Access comes from the container, not from per-file lists.**

- Moodle files live in file areas keyed by context, component, area and
  item; serving a file calls the owning component, which checks access
  (https://moodledev.io/docs/apis/subsystems/files). Contexts nest (system,
  category, course, module, user) and roles are assigned per context,
  inheriting downwards; Prohibit cannot be overridden lower down
  (https://docs.moodle.org/en/Context,
  https://docs.moodle.org/en/Override_permissions).
- Canvas folders belong to a course, a user or a group; a file's visibility
  (course, institution, public, hidden link) and its module lock govern it
  wherever it is linked
  (https://github.com/instructure/canvas-lms/blob/master/app/models/attachment.rb).
- OneNote Class Notebook: each student's section is private to the student
  and teachers, the content library is read-only to students, the
  collaboration space is shared
  (https://learn.microsoft.com/en-us/previous-versions/office/office-365-api/how-to/onenote-classnotebook).
- Google Drive is the exception with per-file permissions, which is why
  Classroom has to move file ownership to freeze work.

**Reusing a file elsewhere is a copy or an explicit alias,** never access
by being embedded. Canvas copies on submit, Moodle offers copy or alias for
private files (https://docs.moodle.org/en/Private_files), Class Notebook
distributes copies of pages.

**Hand-in freezes a copy, and there is always a way back.**

- Classroom: turning in moves ownership of the student's Drive files to the
  teacher, returning moves it back
  (https://developers.google.com/classroom/reference/rest/v1/courses.courseWork.studentSubmissions/turnIn).
- Microsoft: a submission has `resources` (working) and `submittedResources`
  (read-only copy the teacher grades)
  (https://learn.microsoft.com/en-us/graph/api/educationsubmission-submit).
- Canvas copies submitted files into a submissions folder nobody can edit or
  delete, and keeps every attempt
  (https://github.com/instructure/canvas-lms/blob/master/app/models/folder.rb).
- Moodle locks after submit until the teacher reverts to draft, and offers
  download of all submissions as a zip
  (https://docs.moodle.org/en/Assignment_settings).

**Families see what teachers choose.** Seesaw can require approval before a
post reaches the journal and families
(https://help.seesaw.me/hc/en-us/articles/4403040931981); Toddle shows
families only what the teacher shared
(https://help.toddleapp.com/en/articles/8612361); ManageBac gives parents
read-only access to the whole portfolio or single items
(https://help.managebac.com/hc/en-us/articles/360033494791). Google sends
guardians summaries without grades
(https://support.google.com/edu/classroom/answer/6388136).

**Minors and links.** Google restricts services for users not marked 18+ and
lets schools set external sharing per unit
(https://knowledge.workspace.google.com/admin/getting-started/editions/control-access-to-google-services-by-age);
Seesaw links work only for signed-in members; Canvas upload signatures last
30 minutes.

**Trash, versions, quotas, export.** Trash: Moodle 7 days, Google 30 days plus
25 for admins, Microsoft 93 days. Versions: Google keeps 100 or 30 days for
uploads unless pinned, Microsoft 500. Quotas are pooled per school with caps
per user or course (Google, Canvas, Moodle). Exports are a zip per student
(Seesaw, Moodle portfolios) and per assignment; leaving students' data is
deleted on a retention schedule set per context (Moodle data registry,
https://docs.moodle.org/en/Data_privacy).

## 2. What Farida has today

- Files carry a purpose, a host (the record they belong to) and a verified
  state (quarantine, content check, malware scan, sha256), with
  tenant-prefixed storage keys, tenant encryption for health reports, purpose
  gates for health and custody files, a publication pipeline with per-person
  photo consent, legal holds, and sweeps of abandoned and unlinked files
  (foundation 6.5).
- Documents index the files they embed (`document_files`). Since c7097c0 a
  file opens for its uploader, readers of its host, or readers of any
  document that embeds it; saving refuses a file the author cannot open.
- Hand-ins: the student's draft document and files are frozen into an
  attempt on hand-in (`freezeCopy`, `rehostFiles`); the teacher returns or
  asks for revision, which opens a new attempt.
- Gaps: no audit of who opened a file or record; files stream through the
  API rather than short-lived signed URLs on a files domain; no trash with
  restore; no per-school quota; no zip export; families see coursework state
  but no teacher-chosen work; student work still has a files field beside
  its answer document.

## 3. Legal and exam-board requirements

Researched 2026-10-01 from primary sources where they were readable. The IB's
regulations sit behind a login and are not covered; Pearson's international
rules, Kuwait's Decision 26/2024 and the UAE's executive regulations remain to
be confirmed.

**Exam boards.**

- Cambridge International (Handbook 2026,
  https://www.cambridgeinternational.org/Images/746922-cambridge-handbook-2026.pdf):
  the centre authenticates work before submitting marks; the version
  submitted is the one moderated and cannot be replaced; until the
  enquiries-about-results period ends the centre keeps the work sent, the
  marks, the moderation summary, the sample and all work outside it, and
  returns none of it to candidates (3.2.1, 3.3.1, 3.6.4). Teachers must not
  use AI as the main marker.
- JCQ (UK awarding bodies, Pearson's UK centres): candidates sign an
  authentication statement and keep their AI prompts and outputs in a
  non-editable form with the work; failing to keep work secure after
  authentication is malpractice; sanctions are kept permanently
  (https://www.jcq.org.uk/wp-content/uploads/sites/2/2026/09/Malpractice-September-2026.pdf.pdf).
- College Board: AP Seminar and Research have checkpoints and teacher
  affirmations of authenticity, and the College Board may ask for interim
  work (https://apcentral.collegeboard.org/media/pdf/ap-digital-portfolio-teacher-user-guide.pdf).

**Accreditation and FERPA.** Cognia requires accurate records and data
protection under local law, without fixed periods
(https://www.cognia.org/wp-content/uploads/2020/05/Accreditation-and-Certification-Policies.pdf).
FERPA binds only schools funded by the US Education Department but is often
adopted: parents inspect records within 45 days, nothing is destroyed while
a request is open, and disclosures are logged for as long as the record is
kept (34 CFR 99.10, 99.32). A US state schedule keeps transcripts
permanently and cumulative records five years after withdrawal
(https://www.tsl.texas.gov/slrm/recordspubs/sd.html).

**Regional law, as per-school packs.** Abu Dhabi's ADEK records policy
classifies documents by access level, sets minimum and maximum retention
(student records at least five years after leaving, graduation records
indefinitely), wants proof of destruction, keeps medical records
view-only, and its digital policy requires written parental consent before
photographing and again before publishing
(https://www.adek.gov.ae/-/media/Project/TAMM/ADEK/Policies/School-Policies/Governance-and-Operations/ADEK_S_Records-Policy_EN.pdf).
Oman counts a facial image as biometric data needing a permit, gives guardians
access within 45 days and requires 72-hour breach notice
(https://qanoon.om/p/2024/mtcit20240034/). Saudi Arabia answers access
requests in 30 days, extendable, and destruction must reach backups. The UK
DfE keeps pupil records to age 25 and answers access requests within a
month (https://www.gov.uk/guidance/data-protection-in-schools); COPPA forbids
indefinite retention. OWASP's upload guidance (allowlist, content check,
scan, separate file domain) is largely in place already.

**What a school chooses.** A jurisdiction pack (none, Egypt, Abu Dhabi, Dubai,
Saudi Arabia, Qatar, Bahrain, Oman, Kuwait), the boards it enters candidates
with (Cambridge, Pearson, JCQ, IB, AP), whether it follows FERPA, its
accreditor and its data residency. Each fills in defaults for: retention per
record class with a minimum and a maximum; an exam hold that freezes entered
coursework until the board's enquiry period ends; an immutable submitted
version with its hash; authentication declarations by candidate and teacher;
AI-use evidence kept read-only where a board asks; consent to photograph and
to publish; view-only health files; a per-file access log; an access-request
clock that also freezes deletion; a breach clock; residency and transfer
basis; per-tenant keys so erasure reaches backups; proof of deletion;
expiring, audited links with no anonymous access to files showing a child;
and a classification label on every file.

## 4. Design for Farida

**Contexts.** Every file belongs to exactly one context: a school, a class,
an assignment, a student's submission attempt, a message thread, a person's
record (health, custody), the website. Access to a file is access to its
context, decided by the same readers the records already use. Roles stay
per context and inherit downwards; health and custody keep their
purpose gates, which nothing overrides.

**Embedding across contexts copies.** Revising c7097c0: a file embedded into
a document of another context becomes a new file row in that context
pointing at the same stored object (the foundation already allows rows to
share a storage key). A teacher putting a student's work into an
announcement therefore shares it deliberately, and removing it from the
announcement never touches the student's copy. Opening stays a check on the
file's own context; "readable because some document embeds it" goes.

**Student work is one document, frozen at hand-in.** The working layer is
the answer document, editable by the student, holding text, files, photos
and recordings as blocks (a large "Add files" control on phones). Hand-in
freezes the document version and copies each embedded file into the attempt
context, read-only to everyone; return or revision opens a new attempt and
earlier ones stay readable. Grading, the download-all zip, exam-board
samples and retention all read the frozen attempt. A list of files is a
view derived from the frozen copy, never a second upload surface. This is
Microsoft's working and submitted buckets and Canvas's copy on submit, with
one document as the surface the owner asked for.

**A teacher's starting document per student.** A template part of the brief
is copied into each student's answer the first time they open it
(Classroom's copy for each student), owned by the submission context.

**Families.** Nothing by default beyond status and returned results; a
teacher shares chosen work to families, optionally behind per-class
approval, as Seesaw and Toddle do.

**Links and sharing.** Copy link gives an internal address that works only
for people allowed by the file's context. No public links for content about
minors; public pages use the existing publication pipeline with consent.
Downloads move to short-lived signed URLs on the files domain the foundation
specifies.

**Records.** Who opened which student file or record is logged, kept as long
as the record when a school follows FERPA. Trash keeps
deleted files and documents 30 days with restore, then purges unless under
legal hold. Documents keep their history; frozen attempts are pinned.
Retention is set per record type and per exam board (section 3). Exports:
a zip per assignment of all frozen attempts and a portfolio per student.
Quotas pool per school with caps per user and class, and per-assignment
limits on file types and sizes.

## 5. Order of work

1. File contexts and copy on embed, replacing embed-grants-access, with a
   migration giving every embedded file a row in its document's context.
2. Student work as one document frozen at hand-in, with the files field
   migrated into answers and attempts.
3. Access audit, trash with restore, signed downloads on the files domain.
4. Download all submissions, student portfolio export, starting document per
   student.
5. Family sharing of chosen work, quotas.
6. School packs (section 3): retention per record class, exam hold with
   authentication declarations and AI-use evidence, access-request clock,
   proof of deletion, photo consent at capture.
