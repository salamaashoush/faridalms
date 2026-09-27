import { describe, expect, test } from "bun:test";

import { currentPurpose, withPurpose } from "../src/context";
import { appCell, harness, probe } from "./harness";

async function one<T>(text: string, params: unknown[] = []): Promise<T> {
  const [row] = await harness().su.unsafe(text, params);
  if (!row) throw new Error(`no row for ${text}`);
  return row as T;
}

async function schoolOf(tenantId: string) {
  return one<{ id: string; year: string; calendar: string; term: string }>(
    `select o.id, y.id as year, c.id as calendar, t.id as term
     from core.orgs o
     join core.academic_sessions y on y.tenant_id = o.tenant_id and y.org_id = o.id and y.type = 'school_year'
     join core.calendars c on c.tenant_id = o.tenant_id and c.school_year_id = y.id
     join core.academic_sessions t on t.tenant_id = o.tenant_id and t.parent_id = y.id and t.sequence = 1
     where o.tenant_id = $1 and o.type = 'school' order by o.created_at limit 1`,
    [tenantId],
  );
}

describe("row level security", () => {
  test("a write for another tenant is refused by the policy, a delete by the privilege", async () => {
    const { a, b } = harness();
    const insert = await probe("app", a.tenantId, [
      {
        text: "insert into core.users (tenant_id, full_name_en) values ($1, 'Intruder')",
        params: [b.tenantId],
      },
    ]);
    expect(insert.error?.message).toContain(
      "new row violates row-level security policy",
    );
    const move = await probe("app", a.tenantId, [
      {
        text: "update core.users set tenant_id = $1 where tenant_id = $2",
        params: [b.tenantId, a.tenantId],
      },
    ]);
    expect(move.error?.message).toContain(
      "new row violates row-level security policy",
    );
    const remove = await probe("app", a.tenantId, [
      { text: "delete from core.users" },
    ]);
    expect(remove.error?.message).toContain("permission denied");
  });

  test("an unbound tenant raises, even with a session-level setting left behind", async () => {
    const { a } = harness();
    const unbound = await probe("app", null, [
      { text: "select count(*) from core.users" },
    ]);
    expect(unbound.error?.message).toContain("tenant context is not set");
    const left = await probe(
      "app",
      null,
      [{ text: "select count(*) from core.users" }],
      {
        sessionTenant: a.tenantId,
      },
    );
    expect(left.error?.message).toContain("tenant context is not set");
  });

  test("app cannot reach partitions, the search index or operations tables", async () => {
    const { a } = harness();
    for (const text of [
      "select count(*) from parts.audit_log_2026_09",
      "select count(*) from search.entries",
      "select count(*) from ops.tenant_registry",
    ]) {
      const result = await probe("app", a.tenantId, [{ text }]);
      expect(result.error?.code).toBe("42501");
    }
  });
});

describe("temporal keys", () => {
  test("a term outside its year, a date outside the year and a week under a term are refused", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const term = await probe("app", a.tenantId, [
      {
        text: `insert into core.academic_sessions (tenant_id, org_id, type, parent_id, parent_type, school_year_id, title_en, span, school_year)
               values ($1, $2, 'term', $3, 'school_year', $3, 'Summer', '[2027-06-18,2027-08-01)', 2027)`,
        params: [a.tenantId, school.id, school.year],
      },
    ]);
    expect(term.error?.code).toBe("23503");
    const date = await probe("app", a.tenantId, [
      {
        text: `insert into core.calendar_dates (tenant_id, calendar_id, school_year_id, day_on, event_descriptor_id)
               select $1, $2, $3, '2027-08-01', id from core.descriptors
               where tenant_id = $1 and namespace = 'calendar_event' and code_value = 'weekend'`,
        params: [a.tenantId, school.calendar, school.year],
      },
    ]);
    expect(date.error?.code).toBe("23503");
    const week = await probe("app", a.tenantId, [
      {
        text: `insert into core.academic_weeks (tenant_id, school_year_id, number, span)
               values ($1, $2, 59, '[2026-09-13,2026-09-20)')`,
        params: [a.tenantId, school.term],
      },
    ]);
    expect(week.error?.code).toBe("23503");
  });

  test("sibling terms may not overlap, a term under a semester is accepted, and school_year follows the end", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const overlap = await probe("app", a.tenantId, [
      {
        text: `insert into core.academic_sessions (tenant_id, org_id, type, parent_id, parent_type, school_year_id, title_en, span, school_year)
               values ($1, $2, 'term', $3, 'school_year', $3, 'Overlap', '[2026-12-01,2027-02-15)', 2027)`,
        params: [a.tenantId, school.id, school.year],
      },
    ]);
    expect(overlap.error?.message).toContain("academic_sessions_sibling_excl");
    const nested = await probe("app", a.tenantId, [
      {
        text: `with semester as (
                 insert into core.academic_sessions (tenant_id, org_id, type, parent_id, parent_type, school_year_id, title_en, span, school_year)
                 values ($1, $2, 'semester', $3, 'school_year', $3, 'Semester', '[2026-09-13,2027-01-22)', 2027) returning id)
               insert into core.academic_sessions (tenant_id, org_id, type, parent_id, parent_type, school_year_id, title_en, span, school_year)
               select $1, $2, 'term', id, 'semester', $3, 'Quarter', '[2026-09-13,2026-11-15)', 2027 from semester`,
        params: [a.tenantId, school.id, school.year],
      },
    ]);
    expect(nested.error).toBeUndefined();
    const wrongYear = await probe("app", a.tenantId, [
      {
        text: `insert into core.academic_sessions (tenant_id, id, org_id, type, school_year_id, title_en, span, school_year, lifecycle)
               values ($1, $2, $3, 'school_year', $2, 'Next', '[2030-09-01,2031-07-01)', 2030, 'upcoming')`,
        params: [a.tenantId, Bun.randomUUIDv7(), school.id],
      },
    ]);
    expect(wrongYear.error?.message).toContain(
      "academic_sessions_year_end_check",
    );
  });

  test("a year cannot shrink under its calendar except through change_year_span", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const direct = await probe("app", a.tenantId, [
      {
        text: "update core.academic_sessions set span = '[2026-09-13,2027-06-10)' where id = $1",
        params: [school.year],
      },
    ]);
    expect(direct.error?.code).toBe("23503");
    const version = (
      await one<{ version: number }>(
        "select version from core.academic_sessions where id = $1",
        [school.year],
      )
    ).version;
    const refused = await probe("app", a.tenantId, [
      {
        text: "select app.change_year_span($1, '[2026-09-13,2027-06-10)', $2)",
        params: [school.year, version],
      },
    ]);
    expect(refused.error?.code).toBe("23514");
    const stale = await probe("app", a.tenantId, [
      {
        text: "select app.change_year_span($1, '[2026-09-13,2027-06-18)', $2)",
        params: [school.year, version + 7],
      },
    ]);
    expect(stale.error?.code).toBe("F0412");
    const changed = await probe<{ audited: number }>("app", a.tenantId, [
      {
        text: `update core.student_school_years set valid_during = '[2026-09-13,2027-06-10)' where tenant_id = $1 and school_year_id = $2`,
        params: [a.tenantId, school.year],
      },
      {
        text: `update core.class_periods set valid_during = '[2026-09-13,2027-06-10)' where tenant_id = $1 and school_year_id = $2`,
        params: [a.tenantId, school.year],
      },
      {
        text: `update core.enrollments set valid_during = '[2026-09-13,2027-06-10)' where tenant_id = $1 and school_year_id = $2`,
        params: [a.tenantId, school.year],
      },
      {
        text: `update core.class_meetings set valid_during = '[2026-09-13,2027-06-10)' where tenant_id = $1 and school_year_id = $2`,
        params: [a.tenantId, school.year],
      },
      {
        text: `update core.academic_sessions set span = '[2027-02-07,2027-06-10)' where tenant_id = $1 and parent_id = $2 and sequence = 2`,
        params: [a.tenantId, school.year],
      },
      {
        text: `update core.academic_weeks set status = 'tobedeleted' where tenant_id = $1 and school_year_id = $2 and not '[2026-09-13,2027-06-10)'::daterange @> span`,
        params: [a.tenantId, school.year],
      },
      {
        text: "select app.change_year_span($1, '[2026-09-13,2027-06-10)', $2) as removed",
        params: [school.year, version],
      },
      {
        text: `select count(*)::int as audited from audit.log
               where action = 'academic_session.span_change' and object_id = $1`,
        params: [school.year],
      },
    ]);
    expect(changed.error).toBeUndefined();
    expect(changed.all.at(-2)?.[0]?.removed).toBe(8);
    expect(changed.rows[0]?.audited).toBe(1);
  });

  test("one current relationship per pair", async () => {
    const { a } = harness();
    const result = await probe("app", a.tenantId, [
      {
        text: `insert into core.user_relationships (tenant_id, student_user_id, related_user_id, relation_descriptor_id,
                 relation_meaning, valid_during)
               select tenant_id, student_user_id, related_user_id, relation_descriptor_id, relation_meaning, '[2026-10-01,)'
               from core.user_relationships where tenant_id = $1 limit 1`,
        params: [a.tenantId],
      },
    ]);
    expect(result.error?.message).toContain("user_relationships_excl");
  });
});

describe("pinned references", () => {
  test("a sex value cannot be stored as a relation, nor a meaning that disagrees with its value", async () => {
    const { a } = harness();
    const wrongNamespace = await probe("app", a.tenantId, [
      {
        text: `update core.user_relationships set relation_descriptor_id =
                 (select id from core.descriptors where tenant_id = $1 and namespace = 'sex' and code_value = 'male')
               where tenant_id = $1`,
        params: [a.tenantId],
      },
    ]);
    expect(wrongNamespace.error?.code).toBe("23503");
    const wrongMeaning = await probe("app", a.tenantId, [
      {
        text: "update core.user_relationships set relation_meaning = 'guardian' where relation_meaning = 'mother'",
      },
    ]);
    expect(wrongMeaning.error?.code).toBe("23503");
  });

  test("national ids are sealed and carry no plaintext suffix", async () => {
    const { a } = harness();
    const base = `insert into core.external_ids (tenant_id, user_id, system_descriptor_id, system_meaning, identifier,
                    identifier_ciphertext, identifier_hmac, identifier_last4, key_version, valid_during)
                  select $1, u.id, d.id, 'national_id', $2, $3, $4, $5, $6, '[2026-01-01,)'
                  from core.users u, core.descriptors d
                  where u.tenant_id = $1 and d.tenant_id = $1 and d.code_value = 'national_id' limit 1`;
    const plain = await probe("app", a.tenantId, [
      {
        text: base,
        params: [a.tenantId, "30001010112345", null, null, null, null],
      },
    ]);
    expect(plain.error?.message).toContain("external_ids_sensitive_check");
    const sealed = Buffer.alloc(40, 1);
    const hmac = Buffer.alloc(32, 2);
    const suffix = await probe("app", a.tenantId, [
      { text: base, params: [a.tenantId, null, sealed, hmac, "2345", 1] },
    ]);
    expect(suffix.error?.message).toContain("external_ids_suffix_check");
  });

  test("the relation token follows the meaning, and a teacher role cannot sit at the group", async () => {
    const { a } = harness();
    const token = await probe("app", a.tenantId, [
      {
        text: `insert into core.descriptors (tenant_id, namespace, code_value, label_en, system_meaning, oneroster_token)
               values ($1, 'relation', 'aunt_by_marriage', 'Aunt by marriage', 'other_relative', 'parent')`,
        params: [a.tenantId],
      },
    ]);
    expect(token.error?.message).toContain("descriptors_relation_token_check");
    const teacher = await probe("app", a.tenantId, [
      {
        text: `insert into core.user_roles (tenant_id, user_id, org_id, org_type, role, valid_during, source)
               select $1, u.id, $2, 'school_group', 'teacher', '[2026-09-01,)', 'manual'
               from core.users u where u.tenant_id = $1 limit 1`,
        params: [a.tenantId, a.rootOrgId],
      },
    ]);
    expect(teacher.error?.message).toContain("user_roles_org_type_check");
  });

  test("two schools may each own a code while a second tenant-wide one is refused", async () => {
    const { a } = harness();
    const [first, second] = a.schoolIds;
    const insert = (org: string | null) => ({
      text: `insert into core.descriptors (tenant_id, namespace, code_value, label_en, system_meaning, org_id)
             values ($1, 'subject', 'math', 'Mathematics', 'mathematics', $2)`,
      params: [a.tenantId, org],
    });
    const perSchool = await probe("app", a.tenantId, [
      insert(first ?? null),
      insert(second ?? null),
    ]);
    expect(perSchool.error).toBeUndefined();
    const tenantWide = await probe("app", a.tenantId, [
      insert(null),
      insert(null),
    ]);
    expect(tenantWide.error?.message).toContain("descriptors_code_key");
  });
});

describe("what app cannot change", () => {
  test("storage keys, org types, jurisdictions, keyed extension keys and school tombstones", async () => {
    const { a } = harness();
    const attempts = [
      "update core.files set storage_key = storage_key where tenant_id = $1",
      "update core.orgs set type = 'department' where tenant_id = $1",
      "update core.tenants set jurisdictions = '{AE}' where tenant_id = $1",
    ];
    for (const text of attempts) {
      const result = await probe("app", a.tenantId, [
        { text, params: [a.tenantId] },
      ]);
      expect(result.error?.message).toContain("permission denied");
    }
    const key = await probe(
      "app",
      a.tenantId,
      [
        {
          text: "update core.demographics set user_id = gen_random_uuid() where tenant_id = $1",
          params: [a.tenantId],
        },
      ],
      { purpose: "demographics" },
    );
    expect(key.error?.code).toBe("42501");
    const tombstone = await probe("app", a.tenantId, [
      {
        text: "update core.orgs set status = 'tobedeleted' where tenant_id = $1 and type = 'school'",
        params: [a.tenantId],
      },
    ]);
    expect(tombstone.error?.message).toContain("row-level security");
  });

  test("a storage key or derivative in another tenant's prefix fails for worker too", async () => {
    const { a, b } = harness();
    const key = await probe("worker", a.tenantId, [
      {
        text: `update core.files set storage_key = $2 where tenant_id = $1 and purpose = 'site_media'`,
        params: [a.tenantId, `t/${b.tenantId}/f/stolen`],
      },
    ]);
    expect(key.error?.message).toContain("files_storage_prefix_check");
    const derivative = await probe("worker", a.tenantId, [
      {
        text: `update core.files set derivatives = $2 where tenant_id = $1 and purpose = 'site_media'`,
        params: [
          a.tenantId,
          {
            thumb: {
              key: `t/${b.tenantId}/d/x`,
              media_type: "image/webp",
              size: 1,
            },
          },
        ],
      },
    ]);
    expect(derivative.error?.message).toContain(
      "files_derivatives_prefix_check",
    );
  });

  test("a health report with a telling name, or embedded in a document, is refused", async () => {
    const { a } = harness();
    const id = Bun.randomUUIDv7();
    const named = await probe(
      "worker",
      a.tenantId,
      [
        {
          text: `insert into core.files (tenant_id, id, purpose, name, media_type, size_bytes, storage_key)
               values ($1, $2, 'health_report', 'asthma-plan.pdf', 'application/pdf', 10, $3)`,
          params: [a.tenantId, id, `t/${a.tenantId}/q/${id}`],
        },
      ],
      { purpose: "health" },
    );
    expect(named.error?.message).toContain("files_health_report_check");
    const embedded = await probe(
      "app",
      a.tenantId,
      [
        {
          text: `insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
               select d.tenant_id, d.id, f.id, 'health_report' from core.documents d, core.files f
               where d.tenant_id = $1 and f.tenant_id = $1 and f.purpose = 'health_report' limit 1`,
          params: [a.tenantId],
        },
      ],
      { purpose: "health" },
    );
    expect(embedded.error?.code).toBe("23514");
  });
});

describe("purpose gates", () => {
  test("health records, health reports and demographics are invisible and unwritable without their purpose", async () => {
    const { a } = harness();
    for (const [table, purpose] of [
      ["health.records", "health"],
      ["core.demographics", "demographics"],
      ["core.relationship_restrictions", "custody"],
    ] as const) {
      const hidden = await probe<{ n: number }>("app", a.tenantId, [
        { text: `select count(*)::int as n from ${table}` },
      ]);
      expect(hidden.rows[0]?.n).toBe(0);
      const shown = await probe<{ n: number }>(
        "app",
        a.tenantId,
        [{ text: `select count(*)::int as n from ${table}` }],
        { purpose },
      );
      expect(shown.rows[0]?.n).toBeGreaterThan(0);
    }
    const reports = await probe<{ n: number }>("app", a.tenantId, [
      {
        text: "select count(*)::int as n from core.files where purpose = 'health_report'",
      },
    ]);
    expect(reports.rows[0]?.n).toBe(0);
    const write = await probe("app", a.tenantId, [
      { text: "update health.records set has_alert = true", params: [] },
    ]);
    expect(write.count).toBe(0);
  });

  test("health metadata must stay empty", async () => {
    const { a } = harness();
    const result = await probe(
      "app",
      a.tenantId,
      [{ text: `update health.records set metadata = '{"note": "asthma"}'` }],
      { purpose: "health" },
    );
    expect(result.error?.message).toContain("records_metadata_empty_check");
  });

  test("a caught error inside withPurpose leaves no purpose set", async () => {
    const { a } = harness();
    const cell = appCell();
    try {
      const after = await cell.withTenant(
        {
          tenantId: a.tenantId,
          requestId: "purpose",
          actor: { kind: "system" },
        },
        "read",
        async (tx) => {
          await withPurpose(tx, "health", async () => {
            throw new Error("fails inside");
          }).catch(() => undefined);
          return currentPurpose(tx);
        },
      );
      expect(after).toBe("");
    } finally {
      await cell.close();
    }
  });
});

describe("erasure", () => {
  test("retention changes nothing without an approval, deletes with one, and a legal hold blocks it", async () => {
    const { a } = harness();
    const { erasedSubject } = harness().fixtures.get(a.tenantId) ?? {};
    const person = await one<{ id: string }>(
      "select user_id as id from core.user_preferences where tenant_id = $1 limit 1",
      [a.tenantId],
    );
    const without = await probe("retention", a.tenantId, [
      {
        text: "update core.user_preferences set status = 'tobedeleted' where user_id = $1",
        params: [person.id],
      },
    ]);
    expect(without.count).toBe(0);
    const approved = await probe<{ n: number }>("retention", a.tenantId, [
      { text: "set local role cell_owner" },
      {
        text: `insert into core.erasure_approvals (tenant_id, subject_user_id, basis, approved_by_user_id)
               values ($1, $2, 'data_subject_request', $2)`,
        params: [a.tenantId, person.id],
      },
      { text: "set local role retention" },
      {
        text: "update core.user_preferences set status = 'tobedeleted' where user_id = $1",
        params: [person.id],
      },
      {
        text: "delete from core.user_preferences where user_id = $1",
        params: [person.id],
      },
      {
        text: "select count(*)::int as n from core.user_preferences where user_id = $1",
        params: [person.id],
      },
    ]);
    expect(approved.error).toBeUndefined();
    expect(approved.rows[0]?.n).toBe(0);
    const held = await probe("retention", a.tenantId, [
      {
        text: "update core.users set status = 'tobedeleted' where id = $1",
        params: [erasedSubject],
      },
    ]);
    expect(held.count).toBe(0);
    const outside = await probe("retention", a.tenantId, [
      {
        text: "update core.users set medical_alert = true where id = $1",
        params: [erasedSubject],
      },
    ]);
    expect(outside.error?.message).toContain("permission denied");
  });
});

describe("audit", () => {
  test("rows take their time and actor from the context and refuse change, even for the owner", async () => {
    const { a } = harness();
    const forged = await probe<{
      occurred_at: string;
      actor_kind: string;
      actor_user_id: string | null;
    }>("app", a.tenantId, [
      {
        text: `insert into audit.log (tenant_id, occurred_at, actor_kind, actor_user_id, action, object_type)
                 values ($1, now() - interval '1 hour', 'operator', $1, 'user.update', 'user')
                 returning occurred_at::text, actor_kind, actor_user_id`,
        params: [a.tenantId],
      },
    ]);
    expect(forged.error).toBeUndefined();
    expect(forged.rows[0]?.actor_kind).toBe("system");
    expect(forged.rows[0]?.actor_user_id).toBeNull();
    const backdated = await probe("app", a.tenantId, [
      {
        text: `insert into audit.log (tenant_id, occurred_at, action, object_type) values ($1, now() - interval '400 days', 'user.update', 'user')`,
        params: [a.tenantId],
      },
    ]);
    expect(backdated.error).toBeDefined();
    const owner = await probe("cell_owner", a.tenantId, [
      {
        text: "update audit.log set action = 'user.read' where tenant_id = $1",
        params: [a.tenantId],
      },
    ]);
    expect(owner.error?.message).toContain("is not allowed");
  });

  test("a payload that does not match its digest is refused", async () => {
    const { a } = harness();
    const result = await probe("app", a.tenantId, [
      {
        text: `with row as (
                 insert into audit.log (tenant_id, action, object_type, payload_digest)
                 values ($1, 'user.update', 'user', sha256('x'::bytea)) returning id, occurred_at)
               insert into audit.payloads (tenant_id, event_id, occurred_at, salt, before, after)
               select $1, id, occurred_at, '\\x00112233445566778899aabbccddeeff'::bytea, '{}'::jsonb, '{}'::jsonb from row`,
        params: [a.tenantId],
      },
    ]);
    expect(result.error?.message).toContain("payload does not match");
  });

  test("the sealer seals the unsealed rows of one tenant", async () => {
    const { a } = harness();
    const sealed = await probe<{ n: number }>("worker", a.tenantId, [
      {
        text: "insert into audit.log (tenant_id, action, object_type) values ($1, 'user.update', 'user')",
        params: [a.tenantId],
      },
      { text: "select app.lock('audit_seal')" },
      {
        text: `with prev as (
                 select batch_no, hash, sealed_at from audit.seal_batches
                 where tenant_id = app.tenant_id() order by batch_no desc limit 1
               ), pending as (
                 select l.tenant_id, l.id, l.occurred_at, l.row_hash from audit.log l
                 where l.tenant_id = app.tenant_id()
                   and l.occurred_at >= coalesce((select sealed_at from prev) - interval '60 seconds', '-infinity')
                   and not exists (select 1 from audit.seal_members m where m.tenant_id = l.tenant_id and m.event_id = l.id)
               ), batch as (
                 select coalesce((select batch_no from prev), 0) + 1 as batch_no,
                        (select hash from prev) as prev_hash,
                        count(*)::int as event_count,
                        sha256(coalesce(string_agg(row_hash, ''::bytea order by id), ''::bytea)) as root
                 from pending
               ), sealed as (
                 insert into audit.seal_batches (tenant_id, batch_no, event_count, root, prev_hash, hash)
                 select app.tenant_id(), b.batch_no, b.event_count, b.root, b.prev_hash,
                        sha256(coalesce(b.prev_hash, ''::bytea) || b.root || int8send(b.batch_no) || int4send(b.event_count))
                 from batch b where b.event_count > 0
                 returning batch_no
               )
               insert into audit.seal_members (tenant_id, event_id, event_occurred_at, batch_no)
               select p.tenant_id, p.id, p.occurred_at, s.batch_no from pending p, sealed s`,
      },
      {
        text: "select count(*)::int as n from audit.seal_batches where tenant_id = app.tenant_id()",
      },
    ]);
    expect(sealed.error).toBeUndefined();
    expect(sealed.rows[0]?.n).toBe(2);
  });
});

describe("other runtime roles", () => {
  test("collab cannot read or checkpoint a frozen document", async () => {
    const { a } = harness();
    const result = await probe<{ n: number }>("collab", a.tenantId, [
      { text: "set local role cell_owner" },
      {
        text: `insert into core.documents (tenant_id, id, host_type, host_id, kind, schema_version, collaborative, content, frozen_at)
               values ($1, $2, 'message', $2, 'rich_text', 1, false, '{}', now())`,
        params: [a.tenantId, Bun.randomUUIDv7()],
      },
      { text: "set local role collab" },
      {
        text: "select count(*)::int as n from core.documents where frozen_at is not null",
      },
    ]);
    expect(result.rows[0]?.n).toBe(0);
  });

  test("site reads only public org columns, integration reads users but not health or documents", async () => {
    const { a } = harness();
    const orgs = await probe<{ n: number }>("site", a.tenantId, [
      { text: "select count(*)::int as n from core.orgs" },
    ]);
    expect(orgs.rows[0]?.n).toBeGreaterThan(0);
    const hidden = await probe("site", a.tenantId, [
      { text: "select identifier from core.orgs" },
    ]);
    expect(hidden.error?.message).toContain("permission denied");
    const users = await probe("site", a.tenantId, [
      { text: "select count(*) from core.users" },
    ]);
    expect(users.error?.message).toContain("permission denied");
    const integrationUsers = await probe<{ n: number }>(
      "integration",
      a.tenantId,
      [{ text: "select count(*)::int as n from core.users" }],
    );
    expect(integrationUsers.rows[0]?.n).toBeGreaterThan(0);
    for (const table of ["health.records", "core.documents"]) {
      const denied = await probe("integration", a.tenantId, [
        { text: `select count(*) from ${table}` },
      ]);
      expect(denied.error?.code).toBe("42501");
    }
    const release = await probe("integration", a.tenantId, [
      {
        text: "insert into audit.log (tenant_id, actor_kind, action, object_type) values ($1, 'integration', 'oneroster.release', 'user')",
        params: [a.tenantId],
      },
    ]);
    expect(release.error).toBeUndefined();
  });

  test("cell_io keeps a supplied version and times, app cannot", async () => {
    const { a } = harness();
    const insert = (role: "cell_io" | "app") =>
      probe<{ version: number; created_at: string }>(role, a.tenantId, [
        {
          text: `insert into core.households (tenant_id, name_en, version, created_at, date_last_modified)
                 values ($1, 'Imported', 7, '2020-01-01', '2020-01-02') returning version, created_at::date::text as created_at`,
          params: [a.tenantId],
        },
      ]);
    const imported = await insert("cell_io");
    expect(imported.rows[0]).toEqual({ version: 7, created_at: "2020-01-01" });
    const live = await insert("app");
    expect(live.rows[0]?.version).toBe(1);
  });

  test("the passkey user handle must carry the account's tenant", async () => {
    const { a, b } = harness();
    const handle = Buffer.concat([
      Buffer.from(b.tenantId.replaceAll("-", ""), "hex"),
      Buffer.alloc(48, 7),
    ]);
    const result = await probe("app", a.tenantId, [
      {
        text: `insert into core.accounts (tenant_id, user_id, webauthn_user_handle)
               select $1, id, $2 from core.users where tenant_id = $1 and erased_at is null
                 and not exists (select 1 from core.accounts x where x.user_id = users.id) limit 1`,
        params: [a.tenantId, handle],
      },
    ]);
    expect(result.error?.message).toContain("accounts_handle_check");
  });
});

describe("search", () => {
  test("finds Arabic and English names and folds Arabic letter forms", async () => {
    const { a } = harness();
    const folded = await probe<{ n: string }>("app", a.tenantId, [
      { text: "select app.normalize_name('أحمد إيمان آمال مصطفى فاطمة') as n" },
    ]);
    expect(folded.rows[0]?.n).toBe("احمد ايمان امال مصطفي فاطمه");
    const principal = await one<{ en: string; ar: string }>(
      `select full_name_en as en, full_name_ar as ar from core.users u
       join core.user_roles r on r.tenant_id = u.tenant_id and r.user_id = u.id and r.role = 'principal'
       where u.tenant_id = $1 limit 1`,
      [a.tenantId],
    );
    for (const query of [principal.en, principal.ar]) {
      const found = await probe<{ n: number }>("app", a.tenantId, [
        {
          text: "select count(*)::int as n from app.search($1, array['user'])",
          params: [query],
        },
      ]);
      expect(found.rows[0]?.n).toBeGreaterThan(0);
    }
  });

  test("keeps one document's text when another on the same host is tombstoned, within the school scope", async () => {
    const { a } = harness();
    const host = Bun.randomUUIDv7();
    const [school, other] = a.schoolIds;
    const result = await probe<{ n: number }>("app", a.tenantId, [
      {
        text: `insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, locale, content, plain_text)
               values ($1, 'site_page', $2, $3, 'page', 1, 'en', '{}', 'Swimming gala on Thursday'),
                      ($1, 'site_page', $2, $3, 'page', 1, 'ar', '{}', 'مسابقة السباحة يوم الخميس')`,
        params: [a.tenantId, host, school],
      },
      {
        text: "update core.documents set status = 'tobedeleted' where host_id = $1 and locale = 'en'",
        params: [host],
      },
      {
        text: `select (select count(*)::int from app.search('السباحة', array['site_page'], array[$1::uuid]))
                    + (select count(*)::int from app.search('السباحة', array['site_page'], array[$2::uuid]))
                    + (select count(*)::int from app.search('swimming', array['site_page'])) as n`,
        params: [school, other],
      },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.n).toBe(1);
  });
});

describe("teaching", () => {
  test("a student is in one homeroom at a time, and no enrollment outlasts its year", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const second = await probe("app", a.tenantId, [
      {
        text: `insert into core.classes (tenant_id, org_id, school_year_id, class_type, code, title_en)
               values ($1, $2, $3, 'homeroom', 'X-B', 'XB') returning id`,
        params: [a.tenantId, school.id, school.year],
      },
      {
        text: `insert into core.enrollments (tenant_id, class_id, class_type, school_year_id, org_id, user_id, role,
                 valid_during, source)
               select e.tenant_id, (select id from core.classes where tenant_id = $1 and code = 'X-B'), 'homeroom',
                 e.school_year_id, e.org_id, e.user_id, 'student', '[2026-10-01,2027-06-18)', 'manual'
               from core.enrollments e
               where e.tenant_id = $1 and e.role = 'student' and e.class_type = 'homeroom' limit 1`,
        params: [a.tenantId],
      },
    ]);
    expect(second.error?.code).toBe("23P01");
    const outlast = await probe("app", a.tenantId, [
      {
        text: `update core.enrollments set valid_during = '[2026-09-13,2027-07-01)'
               where tenant_id = $1 and role = 'student'`,
        params: [a.tenantId],
      },
    ]);
    expect(outlast.error?.code).toBe("23503");
  });

  test("a teacher reaches the students of the classes they teach, and no others", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const taught = await one<{
      teacher: string;
      reached: number;
      placed: number;
    }>(
      `select t.user_id as teacher,
              (select count(*)::int from core.enrollments s
                 where s.tenant_id = t.tenant_id and s.class_id = t.class_id and s.role = 'student') as reached,
              (select count(*)::int from core.student_school_years p
                 where p.tenant_id = t.tenant_id and p.org_id = $2) as placed
       from core.enrollments t
       join core.classes c on c.tenant_id = t.tenant_id and c.id = t.class_id and c.class_type = 'homeroom'
       where t.tenant_id = $1 and t.role = 'teacher' and c.org_id = $2 limit 1`,
      [a.tenantId, school.id],
    );
    const seen = await probe<{ reached: number }>("app", a.tenantId, [
      {
        text: `select count(*)::int as reached
               from app.visible_students($1, $2, '2026-10-01', false)`,
        params: [taught.teacher, school.id],
      },
    ]);
    expect(seen.error).toBeUndefined();
    expect(seen.rows[0]?.reached).toBe(taught.reached);
    expect(taught.reached).toBeLessThan(taught.placed);
  });
});
