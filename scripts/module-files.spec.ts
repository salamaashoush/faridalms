import { describe, expect, it } from "vitest";

import {
  functionBodyProblems,
  moduleImportProblems,
  sqlNameProblems,
} from "./module-files";

describe("the families tables in SQL", () => {
  it("refuses a core store that names a guardian link or its predicate", () => {
    expect(
      sqlNameProblems([
        {
          path: "packages/database/src/stores/audiences.ts",
          text: "sql`select 1 from core.user_relationships r where app.guardian_permits(r, now(), 'follow')`",
        },
      ]),
    ).toEqual([
      "packages/database/src/stores/audiences.ts: names core.user_relationships in SQL, which only the module that owns it and its links may",
      "packages/database/src/stores/audiences.ts: names app.guardian_permits in SQL, which only the module that owns it and its links may",
    ]);
  });

  it("lets the module's own store, a link that needs it and the registries name them", () => {
    const text = "sql`select 1 from core.user_relationships`";
    expect(
      sqlNameProblems([
        { path: "packages/database/src/stores/families.ts", text },
        { path: "packages/database/src/stores/follow-up.ts", text },
        { path: "packages/database/src/stores/erasure.ts", text },
      ]),
    ).toEqual([]);
  });

  it("leaves tables of modules not carved in SQL alone", () => {
    expect(
      sqlNameProblems([
        {
          path: "packages/database/src/stores/people.ts",
          text: "sql`select 1 from core.attendance_records`",
        },
      ]),
    ).toEqual([]);
  });
});

describe("functions in the migrations", () => {
  it("refuses a core function whose body reads a module's table", () => {
    expect(
      functionBodyProblems([
        {
          path: "migrations/views.sql",
          text: "create function app.visible_people(p uuid) returns setof uuid language sql as $$ select student_user_id from core.user_relationships $$;",
        },
      ]),
    ).toEqual([
      "migrations/views.sql: app.visible_people names core.user_relationships, which its owner may not reach",
    ]);
  });

  it("lets the module's own function read its tables", () => {
    expect(
      functionBodyProblems([
        {
          path: "migrations/views.sql",
          text: "create function app.guardian_permits(r core.user_relationships, p date, p_purpose text) returns boolean language plpgsql as $$ begin return r.status = 'active'; end $$;",
        },
      ]),
    ).toEqual([]);
  });
});

describe("imports of the families module", () => {
  it("refuses one from a core file and lets a link file that needs families make it", () => {
    const text = 'import { childrenQuery } from "~/queries/families";';
    const problems = moduleImportProblems([
      { path: "apps/web/src/routes/_app/me/details.tsx", text },
      { path: "apps/web/src/routes/_app/family/timetable.tsx", text },
    ]).filter((problem) => !problem.includes("listed as pending"));
    expect(problems).toEqual([
      "apps/web/src/routes/_app/me/details.tsx: imports ~/queries/families, which belongs to the families module",
    ]);
  });
});
