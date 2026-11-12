import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { AudienceScope } from "../tables/broadcasts";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Audience {
  scope: AudienceScope;
  classId: string | null;
  gradeId: string | null;
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

/** The people each audience names on a day: staff, students and their portal guardians. */
function audienceSql(
  input: { tenantId: string; schoolId: string; on: string },
  audience: Audience,
): SQL {
  const enrolled = (classFilter: SQL) => sql`
    select e.user_id from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${input.tenantId}::uuid and e.role = 'student' and e.status = 'active'
      and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
      and c.status = 'active' and ${classFilter}`;
  const guardiansOf = (students: SQL) => sql`
    select l.related_user_id from core.user_relationships l
    where l.tenant_id = ${input.tenantId}::uuid and app.guardian_permits(l, ${input.on}::date, 'contact')
      and l.student_user_id in (${students})`;
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
    case "families":
      return guardiansOf(enrolled(sql`true`));
    case "school":
      return sql`${staff} union ${enrolled(sql`true`)} union ${guardiansOf(enrolled(sql`true`))}`;
    case "class": {
      const inClass = sql`c.id = ${audience.classId}::uuid`;
      return sql`${enrolled(inClass)} union ${guardiansOf(enrolled(inClass))}
        union ${teachersOf(sql`c.id = ${audience.classId}::uuid`)}`;
    }
    default: {
      const inGrade = sql`c.grade_level_descriptor_id = ${audience.gradeId}::uuid`;
      return sql`${enrolled(inGrade)} union ${guardiansOf(enrolled(inGrade))}
        union ${teachersOf(sql`c.org_id = ${input.schoolId}::uuid and ${inGrade}`)}`;
    }
  }
}

/** Everyone the audiences reach on a day, each once. */
export async function audienceUsers(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
  audiences: readonly Audience[],
): Promise<string[]> {
  if (audiences.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from (${sql.join(
      audiences.map((audience) => audienceSql(input, audience)),
      sql` union `,
    )}) reached(user_id)
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = reached.user_id
      and u.status = 'active'`);
  return rows.map((row) => row.user_id);
}

/** Which of some people the school reaches on a day: its staff, its students and their families. */
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
      gradeId: null,
    })}) reached(user_id)
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = reached.user_id
      and u.status = 'active'
    where reached.user_id = any(${uuidArray(userIds)})`);
  return rows.map((row) => row.user_id);
}

/** The grades the classes running on the date teach, for choosing an audience. */
export async function gradesRunning(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
): Promise<{ id: string; labelEn: string | null; labelAr: string | null }[]> {
  const rows = await tx.execute<{
    id: string;
    label_en: string | null;
    label_ar: string | null;
  }>(sql`
    select distinct d.id, d.label_en, d.label_ar, d.sort_order from core.classes c
    join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.grade_level_descriptor_id
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.runs @> ${input.on}::date and c.status = 'active'
    order by d.sort_order`);
  return rows.map((row) => ({
    id: row.id,
    labelEn: row.label_en,
    labelAr: row.label_ar,
  }));
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
    gradeLabelEn: string | null;
    gradeLabelAr: string | null;
  })[]
> {
  const rows = await tx.execute<{
    scope: AudienceScope;
    class_id: string | null;
    grade_descriptor_id: string | null;
    code: string | null;
    title_en: string | null;
    title_ar: string | null;
    label_en: string | null;
    label_ar: string | null;
  }>(sql`
    select x.scope, x.class_id, x.grade_descriptor_id, c.code, c.title_en, c.title_ar,
           d.label_en, d.label_ar
    from ${ownerSql(owner).table} x
    left join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    left join core.descriptors d on d.tenant_id = x.tenant_id and d.id = x.grade_descriptor_id
    where x.tenant_id = ${tenantId}::uuid and x.${ownerSql(owner).column} = ${owner.id}::uuid
      and x.status = 'active'
    order by x.created_at, x.id`);
  return rows.map((row) => ({
    scope: row.scope,
    classId: row.class_id,
    gradeId: row.grade_descriptor_id,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    gradeLabelEn: row.label_en,
    gradeLabelAr: row.label_ar,
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
    insert into ${table} (tenant_id, ${column}, scope, class_id, grade_descriptor_id)
    values ${sql.join(
      input.audiences.map(
        (audience) =>
          sql`(${input.tenantId}::uuid, ${input.owner.id}::uuid, ${audience.scope},
               ${audience.classId}::uuid, ${audience.gradeId}::uuid)`,
      ),
      sql`, `,
    )}`);
}

/** What a person belongs to on a day, as the audience scopes see it. */
export interface Reach {
  staff: boolean;
  student: boolean;
  guardian: boolean;
  classIds: string[];
  gradeIds: string[];
}

/**
 * The same membership `audienceUsers` resolves, turned around: whether the
 * scopes name this person. A class covers its students, their families and
 * its teachers; a grade covers its classes the same way.
 */
export async function reachOf(
  tx: Tx,
  input: { tenantId: string; schoolId: string; userId: string; on: string },
): Promise<Reach> {
  const [row] = await tx.execute<{
    staff: boolean;
    student: boolean;
    guardian: boolean;
    class_ids: string[];
    grade_ids: string[];
  }>(sql`
    with children as (
      select l.student_user_id as user_id from core.user_relationships l
      where l.tenant_id = ${input.tenantId}::uuid and l.related_user_id = ${input.userId}::uuid
        and app.guardian_permits(l, ${input.on}::date, 'contact')
    ), enrolled as (
      select e.user_id, e.class_id from core.enrollments e
      join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
      where e.tenant_id = ${input.tenantId}::uuid and e.role = 'student' and e.status = 'active'
        and e.valid_during @> ${input.on}::date and c.org_id = ${input.schoolId}::uuid
        and c.status = 'active'
        and (e.user_id = ${input.userId}::uuid or e.user_id in (select user_id from children))
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
      exists (select 1 from enrolled where user_id <> ${input.userId}::uuid) as guardian,
      coalesce((select json_agg(distinct class_id) from member), '[]'::json) as class_ids,
      coalesce((select json_agg(distinct c.grade_level_descriptor_id) from core.classes c
        where c.tenant_id = ${input.tenantId}::uuid
          and c.grade_level_descriptor_id is not null
          and c.id in (select class_id from enrolled union select class_id from taught)), '[]'::json)
        as grade_ids`);
  return {
    staff: row?.staff ?? false,
    student: row?.student ?? false,
    guardian: row?.guardian ?? false,
    classIds: row?.class_ids ?? [],
    gradeIds: row?.grade_ids ?? [],
  };
}

/** Whether any audience of the owner in `ownerId` names someone with this reach. */
export function reaches(
  input: { tenantId: string; kind: AudienceOwner["kind"]; ownerId: SQL },
  reach: Reach,
): SQL {
  const { table, column } = ownerSql({ kind: input.kind, id: "" });
  return sql`exists (select 1 from ${table} x
    where x.tenant_id = ${input.tenantId}::uuid and x.${column} = ${input.ownerId}
      and x.status = 'active'
      and ((x.scope = 'school' and ${reach.staff || reach.student || reach.guardian})
        or (x.scope = 'staff' and ${reach.staff})
        or (x.scope = 'students' and ${reach.student})
        or (x.scope = 'families' and ${reach.guardian})
        or (x.scope = 'class' and x.class_id = any(${uuidArray(reach.classIds)}))
        or (x.scope = 'grade' and x.grade_descriptor_id = any(${uuidArray(reach.gradeIds)}))))`;
}
