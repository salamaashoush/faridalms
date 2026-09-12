# Build contract

Working notes for the route work in progress. Delete once the app is finished.

Read `AGENTS.md` first and follow it exactly. The traps listed there are real:
Base UI not Radix, `render` not `asChild`, every string in both message
catalogues, logical CSS properties only, no `*.server.ts` filenames.

## Already built, do not rewrite

| Path                                     | What it is                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                       | Drizzle Postgres schema, 25 tables. Migrations are applied.                           |
| `src/db/relations.ts`                    | Drizzle v1 `defineRelations` config for `db.query.*`.                                 |
| `src/db/repositories/*.ts`               | All database reads and writes.                                                        |
| `src/server/school.ts`                   | Every server function. Authorisation lives here.                                      |
| `src/queries/school.ts`                  | TanStack Query options for each server function.                                      |
| `src/utils/session.ts`                   | `requireUser`, `requirePermission`, `requireStudentAccess`.                           |
| `src/components/app/AppShell.tsx`        | Sidebar, top bar, mobile drawer.                                                      |
| `src/components/app/navigation.ts`       | Per-role nav tree. Routes must match these paths.                                     |
| `src/components/app/primitives.tsx`      | `PageHeader`, `StatTile`, `Field`, `FieldGrid`, `Value`, `EmptyState`, `SectionCard`. |
| `src/components/app/labels.tsx`          | `SubmissionBadge`, `AttendanceBadge`, `ScorePill`, `SubjectIcon`, label maps.         |
| `src/components/app/StudentSwitcher.tsx` | Child picker, driven by a URL search param.                                           |

If a server function or query you need does not exist, add it to
`src/server/school.ts` and `src/queries/school.ts` rather than querying the
database from a component.

## Route conventions

Routes live under `src/routes/_app/<prefix>/`. The prefix decides the role:
`admin`, `teach`, `family`, `me`. `_app.tsx` already handles the auth gate and
renders the shell, so a route file renders page content only.

```tsx
export const Route = createFileRoute("/_app/family/assignments")({
  validateSearch: (search) => v.parse(assignmentsQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(assignmentsQuery(deps));
  },
  component: AssignmentsPage,
});
```

- Read data with `useSuspenseQuery`, never `useQuery` plus a loading branch.
- Filters, the selected child, the selected week and the open folder all live in
  the URL via `validateSearch`. None of them belong in `useState`.
- Navigate with `Route.useNavigate()` and `search: (prev) => ({ ...prev, ... })`.
- Run `bun run dev` once after adding routes so the plugin regenerates
  `src/routeTree.gen.ts`. Never hand-edit that file.

## Guardrails a reviewer will check

**Say "not recorded", never render a blank.** Wrap any value that can be absent
in `<Value>`. This is the single worst flaw in the system being replaced: it
printed a label and then nothing, so a parent could not tell missing data from a
broken page.

**Never print a raw counter.** The old portal leaked server variables into the
markup (`53`, `58 1 0 0`). Every number on screen needs a label.

**No dead links.** A third of the old navigation 404'd. If a page is not built,
it does not go in `navigation.ts`.

**Every table needs a mobile layout.** Either a card list below `sm:`, or a
horizontally scrollable region with a caption. A table that overflows the
viewport is not responsive.

**Both catalogues, every string.** Add to `messages/en.json` and
`messages/ar.json`, then `bun scripts/compile-i18n.ts`. `bun run lint` fails on
drift. Many keys already exist; check before adding.

**Logical properties only.** `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`,
`text-start`, `text-end`. Arabic is a first-class locale here, not an
afterthought.

## Verifying

```sh
bun run type-check
bun run lint
bun run test
```

`bun run db:up` starts Postgres, `bun run db:reset` migrates and re-seeds.
Sign in as any of `admin@example.com`, `teacher@example.com`,
`parent@example.com`, `omar@example.com` with password `northwind1234`.
