# Decisions

Decisions taken with Salama on 2026-09-26, the research each rests on, and
what follows from them. A decision changes only by a new entry here.

## Product and design

- **Revamp, not repair.** Every system, page and widget is rebuilt from the
  research in this folder. The previous screens and flows are not a base.
- **Visual direction: calm workspace.** Notion/Linear feel: neutral canvas, teal
  as the single accent, dense lists, document-first editors, one primary action
  per surface. See [ui-patterns.md](ui-patterns.md) and
  [../design-system.md](../design-system.md).
- **Product scope per system** follows [../product-spec.md](../product-spec.md),
  built from [coursework.md](coursework.md),
  [communication.md](communication.md),
  [administration.md](administration.md) and
  [navigation-and-content.md](navigation-and-content.md).

## Content

- **Editor engine: our own package on the Lexical core** (`packages/editor`).
  Compared against ProseMirror, TipTap, BlockNote, Slate and a from-scratch core
  in [editor-engines.md](editor-engines.md).
- **Rich content is a core object:** a `documents` table (Yjs state, derived
  validated JSON, plain text, revision), versions, file references and link
  references; hosts point at documents.
- **Real-time collaboration now**, on Yjs, with the server validating the
  derived JSON before persisting it.

## Platform

- **Real schools hold data; they move by verified import.** The new cell schema
  is built once; each school is frozen, exported, transformed, imported,
  verified and switched over, with its untouched old database kept read-only
  as the rollback. See [../platform-migration.md](../platform-migration.md).
- **Tenancy: shared database per regional cell with Row-Level Security.**
  `tenant_id` leads every primary, foreign and unique key; RLS is forced; the
  application connects as a non-owner role; CI fails any tenant table without
  a policy. A school group (several schools) is one tenant. A school needing
  its own keys or restore gets a cell of one. See
  [backend-architecture.md](backend-architecture.md).
- **Data model aligned to OneRoster 1.2 and Ed-Fi:** accounts and users with
  multiple roles, an academic-session tree, courses with homeroom and
  scheduled classes, teacher enrolments (co-teaching), a gradebook of line
  items and results, attendance events, descriptor tables for code values.
- **Hosting: decide later, build cell-ready.** Regions are chosen per sale; the
  directory maps a school to its cell. Egypt needs a legal decision (local data
  centre or PDPC transfer licence) before a cell is placed there.

## 2026-09-27

- **Refactor and replace in place; keep nothing old alongside.** The old
  per-school database model, its schema and its backend code are not kept
  next to the new ones: no compatibility layers, no switches between old and
  new. The code is refactored and rewritten in place, system by system; an old
  part is removed in the same change that lands its replacement, never
  before. The new design-system components, the editor package and the pages
  already rebuilt on them stay and move onto the new backend. This supersedes
  rule 1 of section 9 of
  [../systems/platform-foundation.md](../systems/platform-foundation.md): the
  schema is `packages/database/src` itself and `drizzle.config.ts` writes its
  migrations to `drizzle/`.

## Website (2026-09-27)

- **The school website is a marketing site, not an app screen.** Salama rejected
  a form-based page editor with one fixed look. The website gets themes, starter
  templates, a section library with layout variants and a live canvas editor,
  built from [website-builder.md](website-builder.md) and specified in
  [../systems/website.md](../systems/website.md).
- **Themes are data.** A school picks one of seven themes and adjusts palette
  roles, fonts, shape and chrome; content never carries colours or CSS, so a
  theme switch re-skins every page.
- **Both languages are authored.** No machine-translation widget; every page
  keeps its second language as a translation document, as the foundation
  requires.
