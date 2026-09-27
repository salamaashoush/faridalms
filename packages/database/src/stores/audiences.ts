import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { AudienceScope } from "../tables/announcements";

type Tx = CellTransaction;

export interface Audience {
  scope: AudienceScope;
  classId: string | null;
  gradeId: string | null;
}

/** What an audience list belongs to; each kind keeps its own audience table. */
export interface AudienceOwner {
  kind: "announcement" | "newsletter";
  id: string;
}

const OWNERS = {
  announcement: { table: "announcement_audiences", column: "announcement_id" },
  newsletter: { table: "newsletter_audiences", column: "newsletter_id" },
} as const;

function ownerSql(owner: AudienceOwner) {
  const names = OWNERS[owner.kind];
  return {
    table: sql`core.${sql.identifier(names.table)}`,
    column: sql.identifier(names.column),
  };
}

const STAFF_ROLES = sql`('teacher', 'aide', 'counselor', 'principal', 'site_administrator',
  'district_administrator', 'system_administrator', 'proctor', 'staff')`;

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
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active' and l.portal_access
      and l.valid_during @> ${input.on}::date and not coalesce(l.communication_isolated, false)
      and l.student_user_id in (${students})`;
  const staff = sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${input.tenantId}::uuid and r.org_id = ${input.schoolId}::uuid
      and r.status = 'active' and r.valid_during @> ${input.on}::date and r.role in ${STAFF_ROLES}`;
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
      const inClass = sql`c.id = coalesce((select k.homeroom_class_id from core.classes k
        where k.tenant_id = ${input.tenantId}::uuid and k.id = ${audience.classId}::uuid),
        ${audience.classId}::uuid)`;
      return sql`${enrolled(inClass)} union ${guardiansOf(enrolled(inClass))}
        union ${teachersOf(sql`c.id = ${audience.classId}::uuid`)}`;
    }
    default: {
      const inGrade = sql`c.class_type = 'homeroom'
        and c.grade_level_descriptor_id = ${audience.gradeId}::uuid`;
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

/** The grades a year's homerooms teach, for choosing an audience. */
export async function gradesInYear(
  tx: Tx,
  input: { tenantId: string; schoolId: string; yearId: string },
): Promise<{ id: string; labelEn: string | null; labelAr: string | null }[]> {
  const rows = await tx.execute<{
    id: string;
    label_en: string | null;
    label_ar: string | null;
  }>(sql`
    select distinct d.id, d.label_en, d.label_ar, d.sort_order from core.classes c
    join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.grade_level_descriptor_id
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.school_year_id = ${input.yearId}::uuid and c.class_type = 'homeroom' and c.status = 'active'
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
