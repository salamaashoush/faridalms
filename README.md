# Northwind

A school portal for administrators, teachers, parents and students.

It replaces an ASP.NET Web Forms parent portal in which a third of the
navigation returned 404, every field with no value rendered as a blank label,
and server counters leaked into the markup. `research/PORTAL-AUDIT.md` records
what that system did, screen by screen, and `research/shots/` holds the
captures it is based on.

## Running it

```sh
bun install
bun run db:up      # Postgres 18 in Docker, on port 5433
bun run db:reset   # migrate, then seed
bun run dev        # http://localhost:3000
```

Every demo account uses the password `northwind1234`.

| Email                 | Role                 | Lands on  |
| --------------------- | -------------------- | --------- |
| `admin@example.com`   | Administrator        | `/admin`  |
| `teacher@example.com` | Teacher              | `/teach`  |
| `parent@example.com`  | Parent, two children | `/family` |
| `omar@example.com`    | Student              | `/me`     |

## How it is put together

**TanStack Start** for server-side rendering and server functions, **TanStack
Router** for typed file routes, **TanStack Query** for caching. **Drizzle ORM**
on **Bun SQL** against **PostgreSQL**. **Base UI** with **shadcn** and
**Tailwind v4** for the interface, **Paraglide** for English and Arabic,
**valibot** for every schema, **oxlint** and **oxfmt** for correctness and
formatting.

Data flows one way. A route loader primes a query, the component reads it with
`useSuspenseQuery`, the query calls a server function, and the server function
authorises the caller before asking a repository for rows. Components never
touch the database.

```
src/db/schema.ts          tables, enums, indexes
src/db/relations.ts       Drizzle v1 defineRelations, for db.query.*
src/db/repositories/      every read and write
src/server/school.ts      server functions; authorisation lives here
src/queries/school.ts     query options
src/routes/_app/<role>/   screens, one directory per role
```

### Roles are capabilities, not screens

`src/data/identity.ts` declares four roles and twenty-two permissions, and maps
one to the other. Routes and controls ask whether a capability is held rather
than which role is signed in, so adding a fifth role does not mean auditing
every comparison in the tree.

Each role gets its own information architecture rather than one menu with items
greyed out, because an administrator and the parent of a five-year-old are not
doing variations of the same job.

### Authorisation is server-side, always

`requirePermission` and `requireStudentAccess` in `src/utils/session.ts` resolve
the caller from the sealed session cookie and check them against the database on
every request. A parent who passes another family's student id gets a 403, not
that family's data. Hiding a control in the interface is a courtesy; it is never
the enforcement.

### Read state is per person

`message_recipients` carries its own `read_at` per addressee. A `read` column on
`messages` would let whoever opens a school-wide notice first mark it read for
everybody.

### Absence is stated

Every field that can legitimately be empty renders through `<Value>`, which
prints "Not recorded" rather than nothing. A blank where a birthdate should be
tells a parent nothing about whether the school holds one.

## Commands

| Command                     | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `bun run dev`               | Dev server on :3000                                     |
| `bun run db:up` / `db:down` | Start or stop Postgres                                  |
| `bun run db:generate`       | Write a migration from a schema change                  |
| `bun run db:migrate`        | Apply pending migrations                                |
| `bun run db:seed`           | Truncate and re-seed                                    |
| `bun run db:studio`         | Drizzle Studio                                          |
| `bun run lint`              | oxlint, plus a check that both message catalogues agree |
| `bun run type-check`        | `tsc --noEmit`                                          |
| `bun run test`              | vitest                                                  |
| `bun run test:e2e`          | Playwright, against a production build                  |

`AGENTS.md` documents the traps this codebase has already fallen into. Read it
before changing anything; each rule in it exists because breaking it produced a
real bug.
