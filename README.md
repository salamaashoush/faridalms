# Farida LMS

A multilingual learning workspace for schools, teachers, students and families.
The platform is Farida LMS. Northwind School is the development school.
Each registered school has its own academic database and accounts.

## Development

```sh
bun install
bun run db:up
bun run db:init
bun run dev
```

The web app listens on port 3000; the independent API listens on 3001.
`db:init` applies additive migrations and registers the existing local school. It
preserves existing records. On a new, empty development database, `bun run db:seed`
loads demonstration records. That seed command truncates school data and must
never run against a database containing work you need to keep.

Development sign-in uses school code `northwind`. The demo accounts are
`admin@example.com`, `teacher@example.com`, `parent@example.com`, and
`omar@example.com`, with password `northwind1234`. Credential shortcuts appear only
in development builds. Production schools provision their own accounts.

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

This runs lint, TypeScript, unit tests, then production Playwright tests across
Chromium, Firefox and WebKit. End-to-end tests create independent school databases
and a control database; they do not reset the development school. They exercise
role navigation, SSR, Arabic RTL, mobile layouts, session revocation, concurrent
school isolation, pagination, and the assignment/submission/grading workflow.

`bun run build` uses Turborepo to build both deployable apps. Shared packages are
TypeScript source packages consumed by their app bundlers. Dependency versions
are locked in `bun.lock`.

## API

The API exposes typed RPC at `/rpc`, JSON HTTP operations at `/v1`, and its
OpenAPI document at `/openapi.json`. `/health/live` checks the process;
`/health/ready` checks the control database. Protected operations require a bearer
token returned by `/v1/auth/signIn`, using `school`, `email` and `password`.
The web server retains that token in an HTTP-only cookie. Native apps store it
in platform secure storage and call the same API.

The implemented learning workflow supports authored assignments, written
submissions, feedback and scoring, attendance, timetables, family progress,
messages, newsletters and school calendars. File-upload storage, billing,
video delivery and account-invitation delivery are not implemented.

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
