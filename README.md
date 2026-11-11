# Farida LMS

A learning platform for schools, their teachers, students and families,
built for English and Arabic from the start. Each school gets its own
portal, public website, accounts and records, kept apart from every other
school's down to the database.

**Use it at [faridalms.com](https://faridalms.com).** We run it for you:
updates, backups, security, email and your school's own domain names
included. Ask for a demonstration there. Prefer to run it yourself? See
[Self-hosting](#self-hosting).

## What a school gets

- **Learning**: courses and lessons, assignments, quizzes, and coding work
  in a Scratch studio, Python, p5.js and the micro:bit editor; feedback,
  marking, a gradebook, standards and early-years goals.
- **School life**: attendance, timetables, the school year and its terms,
  calendars, announcements (on the website too), messages and
  notifications by email.
- **Records**: students and families, enrolment, documents, consents, and
  a history of every change.
- **A website**: built from sections, with news, events and contact forms,
  at the school's own domain or `<school>.faridalms.site`.
- **A portal for everyone**: sign-in at the school's own domain or
  `<school>.faridalms.com`, invitations and password resets by email, and
  a home for each role: leaders, teachers, students and families.
- **Two languages**: English and Arabic throughout, right to left where it
  should be, with each family reading in the language it chose.

## Self-hosting

Farida runs on a single server with Docker: one Compose file, one settings
file, and a command to create the first school. You need a server with 4
CPUs and 8 GB of memory, two domain names, and an email sender.
[deploy/single-server](deploy/single-server/README.md) walks through it from
DNS to the first sign-in, and covers upgrades, backups and restores.

A school or a group of schools may host Farida for its own students, staff
and families. Offering it to other schools as a paid service is the one
thing the licence keeps for faridalms.com (see [Licence](#licence)).

## Development

Needs [Bun](https://bun.sh) 1.4 and Docker; the media service also needs
Rust.

```sh
bun install      # also compiles i18n, fetches the coding tools and writes .env
bun run db:up    # Postgres 18 in Docker on port 5433
bun run db:reset # roles, the cell and directory databases, migrations, seed
bun run dev
```

The web app listens on port 3000 and the API on 3001. Each school signs in
on its own portal, such as `http://northwind.localhost:3000`; `localhost:3000`
itself asks for an email and finds the school. `db:reset` recreates
the local databases with demonstration records, so never point it at a
database holding work you need to keep; `db:migrate` applies pending
migrations without touching data. The seed creates a school group, Northwind
Schools (`northwind` and `northwind-east`), and a standalone
school, `acme`; `db:reset` prints every login, and all use the password
`farida-development-password`.

`bun run ready` runs lint, TypeScript, the unit, database, API and browser
suites. Each suite creates and drops its own databases.

### How it fits together

- `apps/web`: the portals and the school websites. React, TanStack Start,
  Base UI, Tailwind CSS, server-rendered English and Arabic with Paraglide.
- `apps/api`: the Bun service behind them: oRPC procedures, authentication,
  each request's school, authorisation and business rules, the files host,
  the notification worker and the provisioner.
- `apps/collab`: live editing (Hocuspocus).
- `apps/ops`: the operator console, signed in through OpenID Connect.
- `apps/media`: video upload and adaptive streaming (Rust).
- `packages/database`: the schemas of the cell (schools' data) and the
  directory (which school is where), their migrations and stores.
- `packages/domain`: pure rules, permissions and input schemas.
- `packages/editor`, `packages/ui`, `packages/puzzles`, `packages/makecode`,
  `packages/api-client`: the rich-text editor, the component library, the
  coding activities and the typed API client.

Read [the architecture](docs/architecture.md) before changing school
isolation, API contracts or sessions, and [AGENTS.md](AGENTS.md) before
changing anything. [Operations](docs/operations.md) covers registering
schools, migrations, domains and connection budgets.

### API

The API exposes typed RPC at `/rpc`, JSON HTTP operations at `/v1`, and its
OpenAPI document at `/openapi.json`. `/health/live` checks the process and
`/health/ready` the databases. Protected operations take a bearer token from
`/v1/auth/signIn` (`school`, `email`, `password`); the web keeps it in an
HTTP-only cookie, and native apps in the platform's secure storage.

## Security

Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes,
never in a public issue.

## Licence

Farida LMS is under the [Functional Source License, version 1.1, with the
Apache 2.0 future licence](LICENSE) (FSL-1.1-ALv2). Copyright 2026 Salama
Ashoush.

- You may use, study, change and share it for any purpose except a
  competing one: offering it, or something substantially like it, to others
  as a commercial product or service.
- A school or group of schools hosting it for its own people, teaching and
  research with it, and services to someone who uses it that way are all
  allowed.
- Each version also becomes available under the Apache License 2.0 two
  years after it is published.

The coding studio, the Scratch editor in a page of its own, is published
separately under the AGPL as
[farida-studio](https://github.com/salamaashoush/farida-studio); the
platform frames it from another site and talks to it only by messages.
Scratch is a trademark of the Scratch Foundation, which does not endorse
this project. The Scratch library's pictures and sounds, the fonts and the
other coding tools keep their own licences.
