# Farida LMS

A learning platform for schools, their teachers, students and families, in
English and Arabic. Each school has its own portal, website, accounts and
records, kept apart from every other school's down to the database.

What a school gets:

- **Learning**: courses and lessons, assignments, quizzes and coding work
  (a Scratch studio, Python, p5.js and micro:bit), feedback, marking and a
  gradebook, standards and early-years goals.
- **School life**: attendance, timetables, the school year and its terms,
  calendars, announcements, news, messages and notifications by email.
- **Records**: students and families, placements, documents, consents, and
  a history of every change.
- **Website**: a public site built from sections, with news, events and
  contact forms, at `<school>.<SITES_DOMAIN>` or the school's own domain.
- **Portal**: sign-in at `<school>.<PORTAL_DOMAIN>` or the school's own
  domain, with emailed invitations and password resets.

Schools are created by the platform's operators from the operator console,
which also manages their domains.

## Development

Needs [Bun](https://bun.sh) 1.4 and Docker; the media service also needs
Rust.

```sh
bun install      # also compiles i18n and writes a local .env
bun run db:up    # Postgres 18 in Docker on port 5433
bun run db:reset # provision roles, create the cell and directory, migrate, seed
bun run dev
```

The web app listens on port 3000 and the API on 3001. `db:reset` recreates
the local databases and loads demonstration records, so it must never run
against a database holding work you need to keep; `db:migrate` applies
pending migrations without touching data.

The seed creates a school group, Northwind Schools (school codes `northwind`
and `northwind-east`), and a standalone school, `acme`. `db:reset` prints
every login; all use the password `farida-development-password`. Credential
shortcuts appear on the sign-in page only in development builds.

## Workspaces

- `apps/web`: the portal and the school websites. React, TanStack
  Start/Router/Query/Form/Table, Base UI, Tailwind CSS, and server-rendered
  English and Arabic with Paraglide.
- `apps/api`: the Bun service behind them: oRPC procedures, authentication,
  school resolution, authorisation and business operations, the files host,
  the notification worker and the provisioner.
- `apps/collab`: live editing (Hocuspocus).
- `apps/ops`: the operator console, signed in through OpenID Connect.
- `apps/media`: video upload and adaptive streaming (Rust).
- `packages/domain`: pure rules, permissions and input schemas.
- `packages/database`: the cell and directory schemas, migrations and stores.
- `packages/api-client`: the typed client shared by the web and native apps.
- `packages/editor`, `packages/ui`, `packages/puzzles`, `packages/makecode`:
  the rich-text editor, the component library, and the coding activities.

Read [the architecture](docs/architecture.md) before changing school
isolation, API contracts or session handling, and [AGENTS.md](AGENTS.md)
before changing anything. [Operations](docs/operations.md) covers school
registration, migrations, domains and connection budgets;
[deploy/single-server](deploy/single-server/README.md) runs the whole
platform on one machine.

## Verification

```sh
bun run ready
```

This runs lint, TypeScript, unit tests, database checks and the API suite,
then production Playwright tests across Chromium, Firefox and WebKit. The
suites create and drop their own throwaway databases; they never reset the
development ones. `bun run test:db` runs the database suite.

`bun run build` uses Turborepo to build the deployable apps. Dependency
versions are locked in `bun.lock`.

## API

The API exposes typed RPC at `/rpc`, JSON HTTP operations at `/v1`, and its
OpenAPI document at `/openapi.json`. `/health/live` checks the process;
`/health/ready` checks the cell and the directory. Protected operations
require a bearer token returned by `/v1/auth/signIn`, using `school`,
`email` and `password`. The web server keeps that token in an HTTP-only
cookie; native apps store it in platform secure storage and call the same
API.

## Security

Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes,
not in a public issue.

## Licence

Farida LMS is free software under the GNU Affero General Public License,
version 3 only ([LICENSE](LICENSE)). Copyright (C) 2026 Salama Ashoush.

Whoever runs a changed copy for other people over a network must offer them
its source (section 13 of the licence). `SOURCE_URL` on the API names where
that is.

The coding studio is built on the Scratch editor, also under the AGPL.
Scratch is a trademark of the Scratch Foundation, which does not endorse this
project. Pictures in the library, fonts and the Scratch media library keep
their own licences.
