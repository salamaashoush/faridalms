import {
  emptyContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import { currentPurpose, withPurpose } from "../src/context";
import { ensureCourse } from "../src/stores/classes";
import { saveDocument } from "../src/stores/documents";
import {
  approveErasure,
  erasurePlan,
  eraseSubject,
} from "../src/stores/erasure";
import { holds } from "../src/stores/sql";
import { appCell, harness, probe, urlFor } from "./harness";

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

describe("erasing a student's work", () => {
  test("redacts their documents and lesson answers and removes what was only theirs, in one rolled-back unit", async () => {
    const { a } = harness();
    const t = a.tenantId;
    const client = new SQL(urlFor(null));
    const db = drizzle({ client });
    const rollback = new Error("rolled back");
    let checked = false;
    try {
      await db.transaction(async (tx) => {
        const [work] = await tx.execute<{
          student: string;
          submission: string;
          attempt: string;
          document: string;
        }>(sql`
          select t.student_user_id as student, t.submission_id as submission, t.id as attempt,
            d.id as document
          from core.submission_attempts t
          join core.documents d on d.tenant_id = t.tenant_id and d.host_type = 'submission_attempt'
            and d.host_id = t.id and d.status = 'active'
          where t.tenant_id = ${t}::uuid and t.status = 'active'
          limit 1`);
        if (!work) throw new Error("the seed hands in no written work");
        const fileId = crypto.randomUUID();
        await tx.execute(sql`
          insert into core.files (tenant_id, id, purpose, name, media_type, size_bytes, storage_key,
                                  host_type, host_id, uploaded_by_user_id)
          values (${t}::uuid, ${fileId}::uuid, 'document_media', 'river.png', 'image/png', 10,
                  ${`t/${t}/erasure-test`}, 'submission_attempt', ${work.attempt}::uuid,
                  ${work.student}::uuid)`);
        await tx.execute(sql`
          insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
          values (${t}::uuid, ${work.document}::uuid, ${fileId}::uuid, 'document_media')`);

        // What the student answered, ran, kept and offered in a lesson, and
        // the recording one answer was made of.
        const [lesson] = await tx.execute<{ id: string }>(sql`
          select id from core.lessons where tenant_id = ${t}::uuid and status = 'active' limit 1`);
        if (!lesson) throw new Error("the seed has no lesson");
        const spoken = crypto.randomUUID();
        const block = crypto.randomUUID();
        const digest = "0".repeat(64);
        await tx.execute(sql`
          insert into core.files (tenant_id, id, purpose, name, media_type, size_bytes, storage_key,
                                  host_type, host_id, uploaded_by_user_id)
          values (${t}::uuid, ${spoken}::uuid, 'document_media', 'answer.webm', 'audio/webm', 10,
                  ${`t/${t}/erasure-spoken`}, 'lesson_answer', ${lesson.id}::uuid,
                  ${work.student}::uuid)`);
        await tx.execute(sql`
          insert into core.lesson_responses (tenant_id, lesson_id, student_user_id, block_id, try, kind,
                                             response, fraction, state, feedback, marked_by_user_id)
          values (${t}::uuid, ${lesson.id}::uuid, ${work.student}::uuid, ${block}::uuid, 1, 'written',
                  ${JSON.stringify({ type: "written", text: "My family lives by the river." })}::text::jsonb,
                  0.5, 'marked', 'Say more about the river.', ${work.student}::uuid)`);
        // A classmate's review of their work, and one they wrote.
        await tx.execute(sql`
          insert into core.peer_reviews (tenant_id, assignment_id, attempt_id, author_user_id,
                                         reviewer_user_id, strengths, suggestion)
          select ${t}::uuid, s.assignment_id, ${work.attempt}::uuid, a, b, 'Clear.', 'Longer.'
          from core.submissions s,
            lateral (select e.user_id from core.enrollments e
                     where e.tenant_id = s.tenant_id and e.role = 'student'
                       and e.user_id <> ${work.student}::uuid limit 1) other,
            lateral (values (${work.student}::uuid, other.user_id),
                            (other.user_id, ${work.student}::uuid)) as pair(a, b)
          where s.tenant_id = ${t}::uuid and s.id = ${work.submission}::uuid`);
        // What they posted in a class discussion.
        await tx.execute(sql`
          insert into core.discussion_posts (tenant_id, assignment_id, author_user_id, content, plain_text)
          select ${t}::uuid, assignment_id, ${work.student}::uuid,
                 ${JSON.stringify({ root: { type: "root", version: 1, children: [] } })}::text::jsonb,
                 'The river floods in spring.'
          from core.submissions where tenant_id = ${t}::uuid and id = ${work.submission}::uuid`);
        await tx.execute(sql`
          insert into core.lesson_runs (tenant_id, lesson_id, student_user_id, block_id, attempt, code, outcome)
          values (${t}::uuid, ${lesson.id}::uuid, ${work.student}::uuid, ${block}::uuid, 1,
                  'print("my name")', 'done')`);
        await tx.execute(sql`
          insert into core.lesson_code (tenant_id, lesson_id, student_user_id, block_id, code, based_on)
          values (${t}::uuid, ${lesson.id}::uuid, ${work.student}::uuid, 'a1b2c3d4', 'print("me")', ${digest})`);
        await tx.execute(sql`
          insert into core.lesson_projects (tenant_id, lesson_id, student_user_id, block_id, files, based_on)
          values (${t}::uuid, ${lesson.id}::uuid, ${work.student}::uuid, ${block}::uuid, '[]', ${digest})`);
        await tx.execute(sql`
          insert into core.lesson_shares (tenant_id, lesson_id, student_user_id, block_id, response)
          values (${t}::uuid, ${lesson.id}::uuid, ${work.student}::uuid, ${block}::uuid, '{}')`);
        // When they sat a timed quiz, and the question it drew for them.
        await tx.execute(sql`
          insert into core.quiz_sittings (tenant_id, submission_id, student_user_id, attempt,
                                          started_at, ends_at)
          values (${t}::uuid, ${work.submission}::uuid, ${work.student}::uuid, 9,
                  statement_timestamp(), statement_timestamp() + interval '20 minutes')`);
        await tx.execute(sql`
          insert into core.quiz_draws (tenant_id, submission_id, student_user_id, attempt, draw_id,
                                       position, bank_question_id, question)
          values (${t}::uuid, ${work.submission}::uuid, ${work.student}::uuid, 9, ${block}::uuid,
                  0, ${block}::uuid, '{"type":"question","version":1}')`);
        // What their answers showed of a standard their school keeps.
        await tx.execute(sql`
          with framework as (
            insert into core.standard_frameworks (tenant_id, org_id, title)
            select ${t}::uuid, m.org_id, 'Erasure check'
            from core.lessons l
            join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
            where l.tenant_id = ${t}::uuid and l.id = ${lesson.id}::uuid
            returning id),
          standard as (
            insert into core.standards (tenant_id, framework_id, statement, position)
            select ${t}::uuid, id, 'Read aloud.', 0 from framework
            returning id)
          insert into core.standard_evidence (tenant_id, student_user_id, standard_id, source,
                                              lesson_id, attempt, block_id, fraction, answered_at)
          select ${t}::uuid, ${work.student}::uuid, id, 'lesson', ${lesson.id}::uuid, 1,
                 ${block}::uuid, 1, statement_timestamp()
          from standard`);
        // Where their teacher judged them against that standard.
        await tx.execute(sql`
          insert into core.goal_judgements (tenant_id, student_user_id, standard_id, level, note,
                                            judged_by_user_id, judged_at)
          select ${t}::uuid, ${work.student}::uuid, s.id, 'emerging', 'Reads with help.',
                 e.user_id, statement_timestamp()
          from core.standards s
          join core.enrollments e on e.tenant_id = s.tenant_id and e.role = 'teacher'
          where s.tenant_id = ${t}::uuid and s.statement = 'Read aloud.'
          limit 1`);
        // Named for a module set for only some of a class.
        await tx.execute(sql`
          insert into core.module_audiences (tenant_id, module_id, class_id, student_user_id)
          select ${t}::uuid, x.module_id, x.class_id, ${work.student}::uuid
          from core.lessons l
          join core.module_classes x on x.tenant_id = l.tenant_id and x.module_id = l.module_id
            and x.status = 'active'
          where l.tenant_id = ${t}::uuid and l.id = ${lesson.id}::uuid
          limit 1`);
        // A score an outside tool sent for them.
        await tx.execute(sql`
          with tool as (
            insert into core.lti_tools (tenant_id, org_id, name, client_id, deployment_id, login_url,
                                        launch_url, redirect_urls, jwks_url)
            select ${t}::uuid, org_id, 'Simulator', gen_random_uuid()::text, gen_random_uuid()::text,
                   'https://tool.example.com/login', 'https://tool.example.com/launch',
                   '["https://tool.example.com/launch"]', 'https://tool.example.com/jwks'
            from core.learning_modules m join core.lessons l on l.tenant_id = m.tenant_id and l.module_id = m.id
            where l.tenant_id = ${t}::uuid and l.id = ${lesson.id}::uuid
            returning id),
          item as (
            insert into core.lti_line_items (tenant_id, tool_id, module_id, label, score_maximum)
            select ${t}::uuid, tool.id, l.module_id, 'Flood simulation', 10
            from tool, core.lessons l where l.tenant_id = ${t}::uuid and l.id = ${lesson.id}::uuid
            returning id)
          insert into core.lti_scores (tenant_id, line_item_id, student_user_id, score_given,
                                       score_maximum, activity_progress, grading_progress, scored_at)
          select ${t}::uuid, item.id, ${work.student}::uuid, 8, 10, 'Completed', 'FullyGraded',
                 statement_timestamp()
          from item`);
        // The time and the reader their school gave them.
        await tx.execute(sql`
          insert into core.access_arrangements (tenant_id, org_id, student_user_id, extra_time, read_aloud)
          select ${t}::uuid, m.org_id, ${work.student}::uuid, 25, true
          from core.lessons l
          join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
          where l.tenant_id = ${t}::uuid and l.id = ${lesson.id}::uuid
          on conflict do nothing`);

        const plan = await erasurePlan(tx, {
          tenantId: t,
          subjectUserId: work.student,
        });
        expect(plan.documents).toContain(work.document);
        expect(plan.files).toContain(fileId);
        expect(plan.files).toContain(spoken);
        await approveErasure(tx, {
          tenantId: t,
          subjectUserId: work.student,
          basis: "retention_schedule",
          requestReference: null,
          approvedByUserId: work.student,
          plan,
        });
        await tx.execute(sql`delete from core.legal_holds where tenant_id = ${t}::uuid
          and subject_user_id = ${work.student}::uuid`);

        await tx.execute(sql`set local role retention`);
        await tx.execute(
          sql`select app.begin_unit(${t}::uuid, null, null, null, 'probe', 'system')`,
        );
        const result = await eraseSubject(tx, {
          tenantId: t,
          subjectUserId: work.student,
          emptyContent: emptyContent(),
        });
        await tx.execute(sql`reset role`);

        expect(result.counts.users).toBe(1);
        expect(result.counts.files).toBeGreaterThanOrEqual(1);
        expect(result.storageKeys).toContain(`t/${t}/erasure-test`);
        const [after] = await tx.execute<{
          plain: string;
          redacted: number;
          files: number;
          links: number;
          name: string | null;
        }>(sql`
          select (select plain_text from core.documents where tenant_id = ${t}::uuid and id = ${work.document}::uuid) as plain,
                 (select count(*)::int from core.document_versions where tenant_id = ${t}::uuid
                   and document_id = ${work.document}::uuid and redacted_at is null) as redacted,
                 (select count(*)::int from core.files where tenant_id = ${t}::uuid and id = ${fileId}::uuid) as files,
                 (select count(*)::int from core.document_files where tenant_id = ${t}::uuid
                   and document_id = ${work.document}::uuid) as links,
                 (select full_name_en from core.users where tenant_id = ${t}::uuid and id = ${work.student}::uuid) as name`);
        expect(after).toEqual({
          plain: "",
          redacted: 0,
          files: 0,
          links: 0,
          name: null,
        });

        expect(result.storageKeys).toContain(`t/${t}/erasure-spoken`);
        expect(result.counts.lesson_responses).toBeGreaterThanOrEqual(1);
        const [answered] = await tx.execute<{
          response: Record<string, unknown>;
          feedback: string | null;
          fraction: string;
          redacted: boolean;
        }>(sql`
          select response, feedback, fraction, redacted_at is not null as redacted
          from core.lesson_responses
          where tenant_id = ${t}::uuid and student_user_id = ${work.student}::uuid and block_id = ${block}::uuid`);
        // The answer and what was said of it are gone; its mark stays.
        expect(answered).toMatchObject({
          response: {},
          feedback: null,
          redacted: true,
        });
        expect(Number(answered?.fraction)).toBe(0.5);
        // A post stays in its thread, emptied of what they wrote.
        const posts = await tx.execute<{
          content: Record<string, unknown>;
          plain_text: string;
          redacted: boolean;
        }>(sql`
          select content, plain_text, redacted_at is not null as redacted
          from core.discussion_posts
          where tenant_id = ${t}::uuid and author_user_id = ${work.student}::uuid`);
        // The fixture's post is theirs too, so every one they wrote is checked.
        expect(posts.length).toBeGreaterThanOrEqual(2);
        for (const post of posts)
          expect(post).toEqual({ content: {}, plain_text: "", redacted: true });
        const [left] = await tx.execute<{
          runs: number;
          code: number;
          projects: number;
          shares: number;
          unread: number;
          quizzes: number;
          arrangements: number;
          sittings: number;
          draws: number;
          evidence: number;
          judgements: number;
          reviews: number;
          audiences: number;
          tools: number;
        }>(sql`
          select (select count(*)::int from core.lesson_runs where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as runs,
                 (select count(*)::int from core.lesson_code where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as code,
                 (select count(*)::int from core.lesson_projects where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as projects,
                 (select count(*)::int from core.lesson_shares where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as shares,
                 (select count(*)::int from core.lesson_responses where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid and redacted_at is null) as unread,
                 (select count(*)::int from core.quiz_answers where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid
                   and (status = 'active' or response <> '{}' or feedback is not null)) as quizzes,
                 (select count(*)::int from core.access_arrangements where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as arrangements,
                 (select count(*)::int from core.quiz_sittings where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as sittings,
                 (select count(*)::int from core.quiz_draws where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as draws,
                 (select count(*)::int from core.standard_evidence where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as evidence,
                 (select count(*)::int from core.goal_judgements where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as judgements,
                 (select count(*)::int from core.peer_reviews where tenant_id = ${t}::uuid
                   and (author_user_id = ${work.student}::uuid
                     or reviewer_user_id = ${work.student}::uuid)) as reviews,
                 (select count(*)::int from core.module_audiences where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as audiences,
                 (select count(*)::int from core.lti_scores where tenant_id = ${t}::uuid
                   and student_user_id = ${work.student}::uuid) as tools`);
        expect(left).toEqual({
          runs: 0,
          code: 0,
          projects: 0,
          shares: 0,
          unread: 0,
          quizzes: 0,
          arrangements: 0,
          sittings: 0,
          draws: 0,
          evidence: 0,
          judgements: 0,
          reviews: 0,
          audiences: 0,
          tools: 0,
        });
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await client.close();
    }
    expect(checked).toBe(true);
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
                 values ($1, date_trunc('month', now()), 'operator', $1, 'user.update', 'user')
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

  test("site adds only a website enquiry nobody has worked, and reads none of it back", async () => {
    const { a } = harness();
    const schoolId = a.schoolIds[0];
    const add = (columns: string, values: string) =>
      probe("site", a.tenantId, [
        {
          text: `insert into core.site_enquiries (tenant_id, id, org_id, locale, purpose, name, email${columns})
                 values ($1, $2, $3, 'en', 'enquiry', 'Salama Ashoush', 'salama@example.com'${values})`,
          params: [a.tenantId, Bun.randomUUIDv7(), schoolId],
        },
      ]);
    expect((await add("", "")).error).toBeUndefined();
    for (const [column, value] of [
      ["state", "'in_progress'"],
      ["first_responded_at", "now()"],
      ["assignee_user_id", `'${Bun.randomUUIDv7()}'`],
      ["applicant_user_id", `'${Bun.randomUUIDv7()}'`],
      ["thread_id", `'${Bun.randomUUIDv7()}'`],
    ] as const) {
      const refused = await add(`, ${column}`, `, ${value}`);
      expect(refused.error?.code).toBe("42501");
    }
    const read = await probe("site", a.tenantId, [
      { text: "select name from core.site_enquiries" },
    ]);
    expect(read.error?.message).toContain("permission denied");
    const thread = await probe("site", a.tenantId, [
      { text: "select count(*) from core.site_enquiry_entries" },
    ]);
    expect(thread.error?.message).toContain("permission denied");
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
          text: `insert into core.users (tenant_id, full_name_en, version, created_at, date_last_modified)
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
        // Counted on this host alone: the seeded website has words of its own.
        text: `select (select count(*)::int from app.search('السباحة', array['site_page'], array[$1::uuid]) where result_id = $3)
                    + (select count(*)::int from app.search('السباحة', array['site_page'], array[$2::uuid]) where result_id = $3)
                    + (select count(*)::int from app.search('swimming', array['site_page']) where result_id = $3) as n`,
        params: [school, other, host],
      },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.n).toBe(1);
  });
});

const words = (text: string) =>
  plainContent(text) as unknown as Record<string, unknown>;

describe("documents", () => {
  test("a save of the same words keeps the revision, and new words make the next", async () => {
    const { a } = harness();
    const cell = appCell();
    try {
      const writer = await one<{ id: string }>(
        "select id from core.users where tenant_id = $1 limit 1",
        [a.tenantId],
      );
      const versions = await cell.withTenant(
        { tenantId: a.tenantId, requestId: "save", actor: { kind: "system" } },
        "write",
        async (tx) => {
          const input = {
            tenantId: a.tenantId,
            orgId: a.schoolIds[0] ?? "",
            host: { type: "site_page", id: Bun.randomUUIDv7() },
            content: words("Chess club"),
            plainText: "Chess club",
            mediaIds: [],
            userId: writer.id,
          };
          const first = await saveDocument(tx, input);
          const same = await saveDocument(tx, input);
          const changed = await saveDocument(tx, {
            ...input,
            content: words("Chess club on Monday"),
            plainText: "Chess club on Monday",
          });
          return [first.version, same.version, changed.version];
        },
      );
      expect(versions).toEqual([1, 1, 2]);
    } finally {
      await cell.close();
    }
  });

  test("its search entry is rebuilt when its words change, not when only its content does", async () => {
    const { a } = harness();
    const host = Bun.randomUUIDv7();
    // Counted on this host alone: the seeded website has words of its own.
    const found = `select (select count(*)::int from app.search('zzqx', array['site_page']) where result_id = '${host}') as marked,
                          (select count(*)::int from app.search('swimming', array['site_page']) where result_id = '${host}') as swimming`;
    const result = await probe("cell_owner", a.tenantId, [
      {
        text: `insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, locale, content, plain_text)
               values ($1, 'site_page', $2, $3, 'page', 1, 'en', '{}', 'Chess club on Monday')`,
        params: [a.tenantId, host, a.schoolIds[0]],
      },
      // A mark the trigger would overwrite, to tell whether it ran.
      {
        text: `update search.entries e set text_vector = to_tsvector('simple', 'zzqx')
               from core.documents d
               where d.host_id = $1 and e.entity_type = 'document' and e.entity_id = d.id`,
        params: [host],
      },
      {
        text: `update core.documents set content = '{"edited": true}', plain_text = 'Chess club on Monday'
               where host_id = $1`,
        params: [host],
      },
      { text: found },
      {
        text: "update core.documents set plain_text = 'Swimming gala on Thursday' where host_id = $1",
        params: [host],
      },
      { text: found },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.all[3]).toEqual([{ marked: 1, swimming: 0 }]);
    expect(result.all[5]).toEqual([{ marked: 0, swimming: 1 }]);
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

describe("courses", () => {
  test("a course made for a taken code takes the first free one, within the length allowed", async () => {
    const { a } = harness();
    const school = await schoolOf(a.tenantId);
    const subjects = (
      await harness().su.unsafe(
        `select id from core.descriptors
         where tenant_id = $1 and namespace = 'subject' and status = 'active'
         order by code_value limit 5`,
        [a.tenantId],
      )
    ).map((row: { id: string }) => row.id);
    expect(subjects).toHaveLength(5);
    const long = `SALAMA-${"L".repeat(33)}`;
    const cell = appCell();
    try {
      const ids = await cell.withTenant(
        {
          tenantId: a.tenantId,
          requestId: "courses",
          actor: { kind: "system" },
        },
        "write",
        async (tx) => {
          const make = (subjectId: string | undefined, code: string) =>
            ensureCourse(tx, {
              tenantId: a.tenantId,
              orgId: school.id,
              subjectId: subjectId ?? "",
              gradeId: null,
              code,
              titleEn: "Salama course",
              titleAr: null,
            });
          return [
            await make(subjects[0], "SALAMA-4A"),
            await make(subjects[1], "SALAMA-4A-3"),
            await make(subjects[2], "SALAMA-4A"),
            await make(subjects[3], long),
            await make(subjects[4], long),
          ];
        },
      );
      const codes = [];
      for (const id of ids)
        codes.push(
          (
            await one<{ code: string }>(
              "select code from core.courses where tenant_id = $1 and id = $2",
              [a.tenantId, id],
            )
          ).code,
        );
      expect(codes).toEqual([
        "SALAMA-4A",
        "SALAMA-4A-3",
        "SALAMA-4A-2",
        long,
        `${long.slice(0, 38)}-2`,
      ]);
    } finally {
      await cell.close();
    }
  });
});

describe("searching", () => {
  test("a filter folds Arabic letter forms, vowel marks and case, and takes what is typed literally", async () => {
    const { a } = harness();
    const cell = appCell();
    try {
      const hits = await cell.withTenant(
        { tenantId: a.tenantId, requestId: "holds", actor: { kind: "system" } },
        "read",
        async (tx) => {
          const hit = async (typed: string, text: string) => {
            const [row] = await tx.execute<{ hit: boolean }>(
              sql`select ${holds(typed, [sql`${text}::text`])} as hit`,
            );
            return row?.hit;
          };
          return [
            await hit("احمد", "أحمد سالم"),
            await hit("مدرسه", "مدرسة النيل"),
            await hit("محمد", "مُحَمَّد"),
            await hit("SALAMA", "salama ashoush"),
            await hit("50%", "50% off"),
            await hit("50%", "500 pages"),
            await hit("a_b", "axb"),
            await hit("", "anything"),
          ];
        },
      );
      expect(hits).toEqual([true, true, true, true, true, false, false, true]);
    } finally {
      await cell.close();
    }
  });
});
