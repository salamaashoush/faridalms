import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { AudienceScope } from "../tables/broadcasts";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Audience {
  scope: AudienceScope;
  classId: string | null;
}

/** What an audience list belongs to; each kind keeps its own audience table. */
export interface AudienceOwner {
  kind: "broadcast" | "calendar_event";
  id: string;
}

const OWNERS = {
  broadcast: { table: "broadcast_audiences", column: "broadcast_id" },
  calendar_event: { table: "calendar_event_audiences", column: "event_id" },
} as const;

function ownerSql(owner: AudienceOwner) {
  const names = OWNERS[owner.kind];
  return {
    table: sql`core.${sql.identifier(names.table)}`,
    column: sql.identifier(names.column),
  };
}

/**
 * The people each audience names on a day: staff, students and teachers.
 * `classIds` names classes a module's audience covers, as a class audience
 * covers its own. Those who act for the students are for the caller to add.
 */
function audienceSql(
  input: { tenantId: string; schoolId: string; on: string },
  audience: Audience | { scope: "classes"; classIds: readonly string[] },
): SQL {
  const enrolled = (classFilter: SQL) => sql`
    select e.user_id from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${input.tenantId}::uuid and e.role = 'student' and e.status = 'active'
      and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
      and c.status = 'active' and ${classFilter}`;
  const staff = sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${input.tenantId}::uuid and r.org_id = ${input.schoolId}::uuid
      and r.status = 'active' and r.valid_during @> ${input.on}::date and r.role = any (app.staff_roles())`;
  const teachersOf = (classFilter: SQL) => sql`
    select e.user_id from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${input.tenantId}::uuid and e.role in ('teacher', 'aide')
      and e.status = 'active' and e.valid_during @> ${input.on}::date and ${classFilter}`;
  switch (audience.scope) {
    case "staff":
      return staff;
    case "students":
      return enrolled(sql`true`);
    case "school":
      return sql`${staff} union ${enrolled(sql`true`)}`;
    case "class": {
      const inClass = sql`c.id = ${audience.classId}::uuid`;
      return sql`${enrolled(inClass)} union ${teachersOf(inClass)}`;
    }
    default: {
      const inClasses = sql`c.id = any(${uuidArray(audience.classIds)})`;
      return sql`${enrolled(inClasses)}
        union ${teachersOf(sql`c.org_id = ${input.schoolId}::uuid and ${inClasses}`)}`;
    }
  }
}

/**
 * The students on a day whose audiences reach those who act for them too:
 * the school's, a class's and a module's classes', not the students' alone.
 */
export async function studentsHeardFor(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
  audiences: readonly Audience[],
  classIds: readonly string[] = [],
): Promise<string[]> {
  const parts: SQL[] = [
    ...audiences.flatMap((audience) =>
      audience.scope === "school"
        ? [sql`true`]
        : audience.scope === "class"
          ? [sql`c.id = ${audience.classId}::uuid`]
          : [],
    ),
    ...(classIds.length > 0 ? [sql`c.id = any(${uuidArray(classIds)})`] : []),
  ];
  if (parts.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct e.user_id from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${input.tenantId}::uuid and e.role = 'student' and e.status = 'active'
      and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
      and c.status = 'active'
      and (${sql.join(parts, sql` or `)})`);
  return rows.map((row) => row.user_id);
}

/**
 * Everyone the audiences reach on a day, each once, with everyone in the
 * classes a module's audiences cover.
 */
export async function audienceUsers(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
  audiences: readonly Audience[],
  classIds: readonly string[] = [],
): Promise<string[]> {
  const parts = [
    ...audiences.map((audience) => audienceSql(input, audience)),
    ...(classIds.length > 0
      ? [audienceSql(input, { scope: "classes", classIds })]
      : []),
  ];
  if (parts.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from (${sql.join(parts, sql` union `)}) reached(user_id)
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = reached.user_id
      and u.status = 'active'`);
  return rows.map((row) => row.user_id);
}

/** Which of some people the school reaches on a day: its staff and its students. */
export async function reachedAmong(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from (${audienceSql(input, {
      scope: "school",
      classId: null,
    })}) reached(user_id)
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = reached.user_id
      and u.status = 'active'
    where reached.user_id = any(${uuidArray(userIds)})`);
  return rows.map((row) => row.user_id);
}

export async function audiencesOf(
  tx: Tx,
  tenantId: string,
  owner: AudienceOwner,
): Promise<
  (Audience & {
    classCode: string | null;
    classTitleEn: string | null;
    classTitleAr: string | null;
  })[]
> {
  const rows = await tx.execute<{
    scope: AudienceScope;
    class_id: string | null;
    code: string | null;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select x.scope, x.class_id, c.code, c.title_en, c.title_ar
    from ${ownerSql(owner).table} x
    left join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    where x.tenant_id = ${tenantId}::uuid and x.${ownerSql(owner).column} = ${owner.id}::uuid
      and x.status = 'active'
    order by x.created_at, x.id`);
  return rows.map((row) => ({
    scope: row.scope,
    classId: row.class_id,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
  }));
}

export async function setAudiences(
  tx: Tx,
  input: {
    tenantId: string;
    owner: AudienceOwner;
    audiences: readonly Audience[];
  },
): Promise<void> {
  const { table, column } = ownerSql(input.owner);
  await tx.execute(sql`
    update ${table} set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and ${column} = ${input.owner.id}::uuid
      and status = 'active'`);
  if (input.audiences.length === 0) return;
  await tx.execute(sql`
    insert into ${table} (tenant_id, ${column}, scope, class_id)
    values ${sql.join(
      input.audiences.map(
        (audience) =>
          sql`(${input.tenantId}::uuid, ${input.owner.id}::uuid, ${audience.scope},
               ${audience.classId}::uuid)`,
      ),
      sql`, `,
    )}`);
}

/** What a person belongs to on a day, as the audience scopes see it. */
export interface Reach {
  staff: boolean;
  student: boolean;
  /** They act for a learner, whose classes count as theirs. */
  actsFor: boolean;
  classIds: string[];
  /** The announcements and events a module's audiences name this person in. */
  owners: Record<AudienceOwner["kind"], string[]>;
}

/**
 * The same membership `audienceUsers` resolves, turned around: whether the
 * scopes name this person, or the learners they act for (`learners`). A
 * class covers its students, those who act for them and its teachers. What
 * a module's audiences name is for the module to add.
 */
export async function reachOf(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    userId: string;
    on: string;
    learners: readonly string[];
  },
): Promise<Reach> {
  const [row] = await tx.execute<{
    staff: boolean;
    student: boolean;
    acts_for: boolean;
    class_ids: string[];
  }>(sql`
    with enrolled as (
      select e.user_id, e.class_id from core.enrollments e
      join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
      where e.tenant_id = ${input.tenantId}::uuid and e.role = 'student' and e.status = 'active'
        and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
        and c.status = 'active'
        and (e.user_id = ${input.userId}::uuid or e.user_id = any(${uuidArray(input.learners)}))
    ), taught as (
      select e.class_id from core.enrollments e
      join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
      where e.tenant_id = ${input.tenantId}::uuid and e.user_id = ${input.userId}::uuid
        and e.role in ('teacher', 'aide') and e.status = 'active'
        and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
        and c.status = 'active'
    ), member as (
      select class_id from enrolled
      union select class_id from taught
    )
    select
      exists (select 1 from core.user_roles r
        where r.tenant_id = ${input.tenantId}::uuid and r.user_id = ${input.userId}::uuid
          and r.org_id = ${input.schoolId}::uuid and r.status = 'active'
          and r.valid_during @> ${input.on}::date and r.role = any (app.staff_roles())) as staff,
      exists (select 1 from enrolled where user_id = ${input.userId}::uuid) as student,
      exists (select 1 from enrolled where user_id <> ${input.userId}::uuid) as acts_for,
      coalesce((select json_agg(distinct class_id) from member), '[]'::json) as class_ids`);
  return {
    staff: row?.staff ?? false,
    student: row?.student ?? false,
    actsFor: row?.acts_for ?? false,
    classIds: row?.class_ids ?? [],
    owners: { broadcast: [], calendar_event: [] },
  };
}

/** Whether any audience of the owner in `ownerId` names someone with this reach. */
export function reaches(
  input: { tenantId: string; kind: AudienceOwner["kind"]; ownerId: SQL },
  reach: Reach,
): SQL {
  const { table, column } = ownerSql({ kind: input.kind, id: "" });
  return sql`(${input.ownerId} = any(${uuidArray(reach.owners[input.kind])})
    or exists (select 1 from ${table} x
    where x.tenant_id = ${input.tenantId}::uuid and x.${column} = ${input.ownerId}
      and x.status = 'active'
      and ((x.scope = 'school' and ${reach.staff || reach.student || reach.actsFor})
        or (x.scope = 'staff' and ${reach.staff})
        or (x.scope = 'students' and ${reach.student})
        or (x.scope = 'class' and x.class_id = any(${uuidArray(reach.classIds)})))))`;
}
