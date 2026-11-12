import { describe, expect, test } from "bun:test";

import { harness, probe } from "./harness";

const ON = "2026-10-01";

async function one<T>(text: string, params: unknown[] = []): Promise<T> {
  const [row] = await harness().su.unsafe(text, params);
  if (!row) throw new Error(`no row for ${text}`);
  return row as T;
}

interface Family {
  school: string;
  student: string;
  mother: string;
  homeroom: string;
  teacher: string;
  /** Another teacher of the school, whom `apart` leaves teaching none of the child's classes. */
  stranger: string;
}

/**
 * A child in a homeroom with its teacher, its portal mother, and another
 * teacher of the school. Every teacher of the seeded school takes a subject
 * in every homeroom, so a teacher the child does not have is made by
 * ending that one's place in the child's classes inside the probe.
 */
async function family(tenantId: string): Promise<Family> {
  return one<Family>(
    `with placed as (
       select c.org_id as school, s.user_id as student, c.id as homeroom, t.user_id as teacher
       from core.enrollments s
       join core.homerooms h on h.tenant_id = s.tenant_id and h.class_id = s.class_id
       join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
       join core.enrollments t on t.tenant_id = s.tenant_id and t.class_id = c.id and t.role = 'teacher'
         and t.status = 'active' and t.valid_during @> $2::date
       where s.tenant_id = $1 and s.role = 'student' and s.status = 'active' and s.valid_during @> $2::date
     )
     select p.school, p.student, p.homeroom, p.teacher, r.related_user_id as mother,
       (select x.user_id from core.enrollments x
        join core.classes k on k.tenant_id = x.tenant_id and k.id = x.class_id and k.org_id = p.school
        where x.tenant_id = $1 and x.role = 'teacher' and x.status = 'active'
          and x.valid_during @> $2::date and x.user_id <> p.teacher
        order by x.user_id limit 1) as stranger
     from placed p
     join core.user_relationships r on r.tenant_id = $1 and r.student_user_id = p.student
       and r.relation_meaning = 'mother' and r.portal_access and r.status = 'active'
     order by p.student limit 1`,
    [tenantId, ON],
  );
}

/** Leaves the stranger teaching none of the child's classes and in no conversation with the family. */
const apart = (tenantId: string, seen: Family) => [
  {
    text: `update core.enrollments set status = 'tobedeleted'
           where tenant_id = $1 and user_id = $2 and class_id in (
             select $3::uuid
             union select k.class_id from core.homeroom_classes k
             where k.tenant_id = $1 and k.homeroom_class_id = $3)`,
    params: [tenantId, seen.stranger, seen.homeroom],
  },
  {
    text: `update core.thread_members set status = 'tobedeleted'
           where tenant_id = $1 and user_id = $2`,
    params: [tenantId, seen.stranger],
  },
];

async function reached(tenantId: string, viewer: string, seen: Family) {
  const result = await probe<{ user_id: string; record: boolean }>(
    "app",
    tenantId,
    [
      ...apart(tenantId, seen),
      {
        text: `select user_id, record from app.reached_people($1, $2, $3::date, false)`,
        params: [viewer, seen.school, ON],
      },
    ],
  );
  if (result.error) throw new Error(result.error.message);
  return new Map(result.rows.map((row) => [row.user_id, row.record]));
}

describe("how far a viewer reaches a person", () => {
  test("a family reaches its child's teachers as a profile, and no other teacher", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    expect(seen.stranger).toBeString();
    const reach = await reached(a.tenantId, seen.mother, seen);
    expect(reach.get(seen.teacher)).toBe(false);
    expect(reach.has(seen.stranger)).toBe(false);
    expect(reach.get(seen.mother)).toBe(true);
  });

  test("a student reaches their own teachers as a profile, and no other teacher", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    const reach = await reached(a.tenantId, seen.student, seen);
    expect(reach.get(seen.teacher)).toBe(false);
    expect(reach.has(seen.stranger)).toBe(false);
  });

  test("a guardian the portal link does not let follow the child reaches none of its teachers", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    const result = await probe<{ n: number }>("app", a.tenantId, [
      {
        text: `update core.user_relationships set portal_access = false
               where tenant_id = $1 and related_user_id = $2`,
        params: [a.tenantId, seen.mother],
      },
      {
        text: `update core.thread_members set status = 'tobedeleted'
               where tenant_id = $1 and user_id = $2`,
        params: [a.tenantId, seen.mother],
      },
      {
        text: `select count(*)::int as n from app.reached_people($1, $2, $3::date, false)
               where user_id = $4`,
        params: [seen.mother, seen.school, ON, seen.teacher],
      },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.n).toBe(0);
  });

  test("staff reach their colleagues' whole records, as before", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    const reach = await reached(a.tenantId, seen.teacher, seen);
    expect(reach.get(seen.stranger)).toBe(true);
    expect(reach.get(seen.mother)).toBe(true);
  });

  test("a conversation opens the other grown-ups' profiles, never a student's", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    const other = await one<{ guardian: string; student: string }>(
      `select r.related_user_id as guardian, r.student_user_id as student
       from core.user_relationships r
       where r.tenant_id = $1 and r.status = 'active' and r.relation_meaning = 'mother'
         and r.student_user_id <> $2 and r.related_user_id <> $3
         and not exists (select 1 from core.user_relationships m
           where m.tenant_id = r.tenant_id and m.related_user_id = $3
             and m.student_user_id = r.student_user_id)
       order by r.created_at limit 1`,
      [a.tenantId, seen.student, seen.mother],
    );
    const thread = crypto.randomUUID();
    const result = await probe<{ user_id: string; record: boolean }>(
      "app",
      a.tenantId,
      [
        {
          text: `insert into core.message_threads (tenant_id, id, org_id, kind, created_by_user_id)
                 values ($1, $2, $3, 'group', $4)`,
          params: [a.tenantId, thread, seen.school, seen.teacher],
        },
        {
          text: `insert into core.thread_members (tenant_id, thread_id, user_id, role)
                 values ($1, $2, $3, 'owner'), ($1, $2, $4, 'member'), ($1, $2, $5, 'member'),
                        ($1, $2, $6, 'member')`,
          params: [
            a.tenantId,
            thread,
            seen.teacher,
            seen.mother,
            other.guardian,
            other.student,
          ],
        },
        {
          text: `select user_id, record from app.reached_people($1, $2, $3::date, false)
                 where user_id = any($4::uuid[])`,
          params: [
            seen.mother,
            seen.school,
            ON,
            `{${other.guardian},${other.student}}`,
          ],
        },
      ],
    );
    expect(result.error).toBeUndefined();
    expect(result.rows).toEqual([{ user_id: other.guardian, record: false }]);
  });
});

describe("search within what the viewer reaches", () => {
  test("the index ranks and limits only among the ids it is given", async () => {
    const { a } = harness();
    const seen = await family(a.tenantId);
    const named = await one<{ name: string }>(
      `select split_part(coalesce(full_name_en, full_name_ar), ' ', 1) as name
       from core.users where tenant_id = $1 and id = $2`,
      [a.tenantId, seen.teacher],
    );
    const result = await probe<{ result_id: string }>("app", a.tenantId, [
      {
        text: `select result_id from app.search($1, array['user'], null, null, null, 1, null, $2::uuid[])`,
        params: [named.name, `{${seen.teacher}}`],
      },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows.map((row) => row.result_id)).toEqual([seen.teacher]);
    const none = await probe<{ result_id: string }>("app", a.tenantId, [
      {
        text: `select result_id from app.search($1, array['user'], null, null, null, 50, null, $2::uuid[])`,
        params: [named.name, `{${seen.stranger}}`],
      },
    ]);
    expect(none.rows.map((row) => row.result_id)).not.toContain(seen.teacher);
  });
});
