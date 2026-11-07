import { describe, expect, test } from "bun:test";

import { RUNTIME_ROLES } from "../src/provision";
import { harness, probe } from "./harness";

const DELETE_ALLOWED = new Set([
  "core.sessions",
  "core.auth_attempts",
  "core.external_ids",
  "core.contact_points",
  "core.relationship_restrictions",
  "core.login_identities",
  "core.passkeys",
  "core.devices",
  "core.files",
  "core.document_files",
  "core.calendar_feeds",
  "core.file_subjects",
  "core.user_preferences",
  "core.saved_views",
  "core.lesson_runs",
  "core.lesson_code",
  "core.lesson_projects",
  "core.lesson_shares",
  "core.access_arrangements",
  "core.quiz_draws",
  "core.quiz_sittings",
  "core.standard_evidence",
  "core.goal_judgements",
  "core.standard_observations",
  "core.peer_reviews",
  "core.lti_replays",
  "core.lti_scores",
  "core.module_audiences",
  "core.lesson_openings",
  "core.document_holds",
  "health.records",
  "health.requested_changes",
  "audit.payloads",
]);

const PURPOSE_OF: Record<string, string> = {
  "health.records": "health",
  "health.requested_changes": "health",
  "core.demographics": "demographics",
  "core.relationship_restrictions": "custody",
};

interface TableInfo {
  name: string;
  columns: string[];
}

async function tenantTables(): Promise<TableInfo[]> {
  const { su } = harness();
  const rows: { name: string; columns: string[] }[] = await su`
    select n.nspname || '.' || c.relname as name,
           array_agg(a.attname order by a.attnum) filter (where a.attgenerated = '') as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname in ('core', 'audit', 'health') and c.relkind in ('r', 'p') and not c.relispartition
    group by 1 order by 1`;
  return rows;
}

const ident = (name: string) =>
  name
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");

const tables = await tenantTables();

describe("tenant isolation", () => {
  test("the fixture holds rows of both tenants in every tenant table", async () => {
    const { su, a, b } = harness();
    const empty: string[] = [];
    for (const table of tables) {
      const [row] = await su.unsafe(
        `select count(*) filter (where tenant_id = $1)::int as a, count(*) filter (where tenant_id = $2)::int as b from ${ident(table.name)}`,
        [a.tenantId, b.tenantId],
      );
      if (!row || row.a === 0 || row.b === 0) empty.push(table.name);
    }
    expect(empty).toEqual([]);
  });

  for (const table of tables) {
    describe(table.name, () => {
      for (const role of RUNTIME_ROLES) {
        test(`${role} cannot read, write or delete across tenants`, async () => {
          const { su, a, b } = harness();
          const purpose = PURPOSE_OF[table.name];
          const t = ident(table.name);
          for (const withPurpose of purpose
            ? [undefined, purpose]
            : [undefined]) {
            const read = await probe<{ other: number; all: number }>(
              role,
              a.tenantId,
              [
                {
                  text: `select count(*) filter (where tenant_id <> $1)::int as other, count(*)::int as all from ${t}`,
                  params: [a.tenantId],
                },
              ],
              { purpose: withPurpose },
            );
            if (read.error) expect(read.error.code).toBe("42501");
            else {
              expect(read.rows[0]?.other).toBe(0);
              if (purpose && !withPurpose) expect(read.rows[0]?.all).toBe(0);
            }
          }

          const [foreign] = await su.unsafe(
            `select to_jsonb(x) as row from ${t} x where tenant_id = $1 limit 1`,
            [b.tenantId],
          );
          const columns = table.columns
            .map((column) => `"${column}"`)
            .join(", ");
          const insert = await probe(
            role,
            a.tenantId,
            [
              {
                text: `insert into ${t} (${columns}) select ${columns} from jsonb_populate_record(null::${t}, $1::jsonb)`,
                params: [foreign?.row],
              },
            ],
            { purpose },
          );
          expect(insert.error?.code).toBe("42501");

          const update = await probe(
            role,
            a.tenantId,
            [
              {
                text: `update ${t} set tenant_id = $1 where tenant_id = $2`,
                params: [b.tenantId, a.tenantId],
              },
            ],
            { purpose },
          );
          if (update.error) expect(update.error.code).toBe("42501");
          else expect(update.count).toBe(0);

          const remove = await probe(
            role,
            a.tenantId,
            [
              {
                text: `delete from ${t} where tenant_id = $1`,
                params: [a.tenantId],
              },
            ],
            { purpose },
          );
          if (role === "retention" && DELETE_ALLOWED.has(table.name)) {
            expect(remove.error).toBeUndefined();
            expect(remove.count).toBe(0);
          } else expect(remove.error?.code).toBe("42501");

          const unbound = await probe(
            role,
            null,
            [{ text: `select count(*) from ${t}` }],
            {
              purpose,
            },
          );
          expect(unbound.error?.code).toBe("42501");
          const session = await probe(
            role,
            null,
            [{ text: `select count(*) from ${t}` }],
            {
              purpose,
              sessionTenant: a.tenantId,
            },
          );
          expect(session.error?.code).toBe("42501");
        });
      }
    });
  }
});
