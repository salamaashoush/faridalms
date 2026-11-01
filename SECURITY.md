# Security

Farida LMS holds children's records, so a vulnerability in it is taken
seriously and handled privately.

## Reporting

Report it through GitHub's private vulnerability reporting: the repository's
Security tab, "Report a vulnerability". Do not open a public issue or pull
request, and do not test against a school's live portal or anyone else's
data; a local copy (`README.md`, "Development") has everything needed.

Say what is affected, how to reproduce it, and what it lets an attacker do.
You will get an answer within a week, and a fix or a plan within thirty
days for anything that exposes one school's data to another, to a family
it does not belong to, or to anyone signed out.

## What counts

Anything that breaks the isolation between schools, lets a role read or
change what it should not, reveals a secret or a signed link, survives
sign-out or a password reset, or runs code on the server or in another
person's browser. The design these rest on is in `docs/architecture.md`
and `docs/systems/platform-foundation.md`.

## Supported versions

Only the latest commit on `main` receives fixes.
