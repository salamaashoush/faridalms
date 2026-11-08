# Interoperability

How a school's teaching meets other systems: outside tools by LTI 1.3
with LTI Advantage, learning sent to the school's own record store as
xAPI statements, and course packages in the cmi5 profile. Farida is the
platform in LTI, and the LMS in cmi5; it keeps no record store of its own.

## Outside tools (LTI 1.3 and LTI Advantage)

The school's issuer is `https://<app host>/lti`. Settings, Outside tools,
lists each tool with the client and deployment ids the school gave it,
and the addresses a tool's maker needs: issuer, key set, authorization,
token and registration configuration.

- **Registering.** An administrator adds a tool by hand, or pastes the
  registration address its maker gives (LTI Dynamic Registration). The
  tool's window opens with `openid_configuration` and a
  `registration_token` that is the school's, single use and good for an
  hour. The tool reads `/lti/openid-configuration` and posts its
  configuration to `/lti/register`; every launch, redirect, selection and
  review address must lie in the domains it names. It is kept
  `pending`: no teacher is offered it, no launch reaches it and the token
  endpoint refuses it until an administrator has looked at what it asked
  for (domain, services, claims, its pages) and put it to use. Names and
  the class list are never granted at registration.
- **Services.** Each tool has two switches: keep grades (Assignment and
  Grade Services) and read class lists (Names and Role Provisioning). The
  token endpoint grants only the scopes those allow, and each service call
  checks the scope against what the school allows now, so turning one off
  stops a token already issued.
- **Launching.** A link in a lesson or brief launches signed in as whoever
  opens it, an instructor if they teach it. A link may be shown in the
  page: the reader launches it in a frame under its card, which still
  opens it in a window. A cross-site frame loses the session cookie on its
  way back to `/lti/auth`, so a framed launch is made at its start while
  the person is signed in, sealed into its hint, and taken once, by the
  tool it was made for, within two minutes. A launch in a window still
  needs the session at `/lti/auth`.
- **Picking content (Deep Linking).** A pick accepts several items:
  `ltiResourceLink`, `link` and `html`, shown in a frame, a window or
  embedded. The first link to the tool fills the block; further links are
  blocks of their own; an address becomes an embed where the school's
  embeds allow it, else a link; HTML is read as a paste is, so nothing in
  it runs. Items of other kinds are left out and the teacher told.
- **Class lists (Names and Role Provisioning).** A launch names
  `context_memberships_url` for its course, under an address tagged for
  that tool and course. Members are the students of the class, or of the
  classes a module is set for, as learners, and those who teach them as
  instructors, by the id launches give them; names only when the school
  sends the tool names. `role`, `limit` with a `next` link, and `rlid` for
  one of the tool's links in the course are supported. Each read is
  recorded in the audit log.
- **Grades and review.** Tool columns sit beside a module's lessons in its
  progress, in a brief's grade sheet, and in the class gradebook, where
  they count towards nothing until a teacher takes a score as a mark. A
  column whose line item carries `submissionReview` launches an
  `LtiSubmissionReviewRequest` from a student's score, for one who marks
  the course, once the tool has sent something for that student, with
  `for_user`, the link's and the review's custom parameters, and a return
  to where the teacher was.

## Learning sent to the school's record store (xAPI)

Settings, Learning records, sets the store's xAPI endpoint, the key and
secret it gave the school, and whether statements are sent. The secret is
sealed with a key derived from the cell secret for that use alone, never
returned, and kept when left empty. Sending belongs to the integrations
module.

As they happen, in the request's own transaction, these are queued in
`core.xapi_statements`:

- a lesson finished (`completed`, with its score, success and time);
- a question that marks itself answered (`answered`, by the answer's id,
  as the module's export names it);
- a mark released to the student (`scored`, out of the assignment's
  points, in its class); a mark kept private is not sent;
- an outside tool's score once the tool has fully graded it (`scored`,
  by the id the module's export also gives it);
- every statement of a launched cmi5 unit, and the school's own.

A worker in the API process takes due statements per tenant with a lease,
posts them in batches of fifty with Basic authentication and
`X-Experience-API-Version: 1.0.3`, and settles them in a second
transaction, so no request or transaction waits on the store. A batch the
store refuses for its content goes again one statement at a time by
`PUT ?statementId=`; `409` counts as sent; any other `4xx` leaves the
statement failed with the store's status; anything else is retried on
the delivery backoff (one minute to half a day, five tries). A sent row
keeps its id and time without its body for 30 days
(`SENT_STATEMENT_DAYS`), then a pass on the files sweep's timer deletes
it as `retention`, whose policy on the table refuses any sent more
lately. Failed statements are sent again from settings. A student's
statements go when they are erased.

## Course packages (cmi5)

A teacher inserts a course package in a lesson: the zip is read in the
browser, its `cmi5.xml` at the root gives the course and its units, every
unit inside it must be in the zip, and the zip is stored with the school
as the block's file. A unit outside the package must be https.

- **Launching.** A unit launches in a window of its own from
  `/cmi5/launch`. The school makes the registration, abandons a session
  of the same unit still open (with its duration), writes
  `LMS.LaunchData` with the launch mode, makes the `launched` statement
  carrying it, and sends the browser
  to the unit with `endpoint`, `fetch`, `actor` (an account under the
  school's portal, with no name), `registration` and an `activityId` of
  the school's own. A unit inside the package is served from the files
  host at `/pkg/<grant>/<path>`, which reads and sets no cookies and opens
  only a grant made for a package launch.
- **Token.** The fetch address gives the session's token once; a second
  call answers `error-code` 1. The token lasts the session.
- **Record store.** `/cmi5/xapi/` takes statements, state documents, the
  learner preferences profile and `about`. Each statement is checked
  against cmi5's rules for its session. It names the launched learner and
  registration; `initialized` comes first and nothing follows
  `terminated`. Each cmi5 verb comes once a session, `completed` and
  `passed` once a registration, and no `failed` after `passed`. Scores
  come only on `passed` and `failed` and agree with the mastery score;
  durations, the cmi5 and move-on categories and the session id are
  where cmi5 asks. A batch with one statement that
  breaks them keeps none; voiding is refused. An abandoned session takes
  nothing more. Statements kept are sent on to the school's store when it
  has one.
- **Launch modes.** The teacher chooses on the block's bar how its units
  open: Normal, Browse (to look around) or Review (to look back), as cmi5
  10.2.2 has them. The session keeps the mode it was launched in; in
  Browse or Review a unit may send `initialized`, `terminated` and
  statements cmi5 does not define, and `completed`, `passed` or `failed`
  is refused, so nothing it does counts towards moving on. Readers see
  that on the block.
- **Moving on.** Where each unit stands is kept with the registration;
  when every unit meets its `moveOn`, in a Normal session, the school says
  the course is `satisfied`, once. Blocks are read for their units; no
  statement is made for a block on its own.
- **Finishing the lesson.** A lesson whose rule is "every course package
  is satisfied" finishes for a student its module reaches once every
  package in its published version is satisfied, as their own work
  finishes any other lesson, with the `completed` statement that goes
  with it. Saving such a lesson needs at least one package.
