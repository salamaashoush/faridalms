# Farida LMS

A multilingual learning workspace for schools, teachers, students and families.
Each registered school has its own identity, accounts and records.

## Development

```sh
bun install      # also compiles i18n and writes a local .env
bun run db:up    # Postgres 18 in Docker on port 5433
bun run db:reset # provision roles, create the cell and directory, migrate, seed
bun run dev
```

The web app listens on port 3000; the independent API listens on 3001.
`db:reset` recreates the local databases and loads demonstration records, so it
must never run against a database holding work you need to keep; `db:migrate`
applies pending migrations without touching data.

The seed creates a school group, Northwind Schools (school codes `northwind`
and `northwind-east`), and a standalone school, `acme`. `db:reset` prints every
login; all use the password `farida-development-password`. Credential shortcuts
appear on the sign-in page only in development builds. Production schools
provision their own accounts.

## Workspaces

- `apps/web`: React, TanStack Start/Router/Query/Form/Table, shadcn Base UI,
  Tailwind CSS, and server-rendered English/Arabic with Paraglide.
- `apps/api`: independent Bun service, oRPC procedures, authentication,
  school resolution, authorisation, and business operations.
- `packages/domain`: pure scheduling logic, permissions and input schemas.
- `packages/database`: school schema, control schema, migrations' source of truth,
  and repositories with explicit database arguments.
- `packages/api-client`: typed HTTP client shared by web and native clients.

Read [the architecture](docs/architecture.md) before changing school isolation,
API contracts or session handling. [Operations](docs/operations.md) covers school
registration, migrations, connection budgets and deployment.

## Verification

```sh
bun run ready
```

This runs lint, TypeScript, unit tests, the database and API suites, then
production Playwright tests across Chromium, Firefox and WebKit. Those suites
create and drop their own throwaway cell and directory; they never reset the
development databases. They exercise
role navigation, SSR, Arabic RTL, mobile layouts, session revocation, concurrent
school isolation, pagination, and the assignment/submission/grading workflow.

`bun run build` uses Turborepo to build the deployable apps (web, api, collab,
ops). Shared packages are
TypeScript source packages consumed by their app bundlers. Dependency versions
are locked in `bun.lock`.

## API

The API exposes typed RPC at `/rpc`, JSON HTTP operations at `/v1`, and its
OpenAPI document at `/openapi.json`. `/health/live` checks the process;
`/health/ready` checks the cell and the directory. Protected operations require a bearer
token returned by `/v1/auth/signIn`, using `school`, `email` and `password`.
The web server retains that token in an HTTP-only cookie. Native apps store it
in platform secure storage and call the same API.

The implemented learning workflow supports authored assignments, written
submissions, feedback and scoring, attendance, timetables, family progress,
messages, newsletters and school calendars, with file storage on disk or S3,
adaptive video through the media service, and emailed sign-in links for
students' families. Billing, invitations for adults, password reset and
admissions are not implemented yet.

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
