import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  AnnouncementState,
  AudienceScope,
  Urgency,
} from "../tables/announcements";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Audience {
  scope: AudienceScope;
  classId: string | null;
  gradeId: string | null;
}

const STAFF_ROLES = sql`('teacher', 'aide', 'counselor', 'principal', 'site_administrator',
  'district_administrator', 'system_administrator', 'proctor', 'staff')`;

const isoOf = (column: SQL) =>
  sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

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

export interface AnnouncementRow {
  id: string;
  version: number;
  orgId: string;
  title: string;
  urgency: Urgency;
  state: AnnouncementState;
  publishAt: string | null;
  pinnedUntil: string | null;
  expiresOn: string | null;
  requiresAck: boolean;
  ackDueOn: string | null;
  authorUserId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  updateSentAt: string | null;
}

const columns = sql`a.id, a.version, a.org_id, a.title, a.urgency, a.state,
  ${isoOf(sql`a.publish_at`)} as publish_at, to_char(a.pinned_until, 'YYYY-MM-DD') as pinned_until,
  to_char(a.expires_on, 'YYYY-MM-DD') as expires_on, a.requires_ack,
  to_char(a.ack_due_on, 'YYYY-MM-DD') as ack_due_on, a.author_user_id,
  u.full_name_en as author_en, u.full_name_ar as author_ar,
  ${isoOf(sql`a.update_sent_at`)} as update_sent_at`;

type AnnouncementRecord = {
  id: string;
  version: number;
  org_id: string;
  title: string;
  urgency: Urgency;
  state: AnnouncementState;
  publish_at: string | null;
  pinned_until: string | null;
  expires_on: string | null;
  requires_ack: boolean;
  ack_due_on: string | null;
  author_user_id: string;
  author_en: string | null;
  author_ar: string | null;
  update_sent_at: string | null;
};

function rowOf(row: AnnouncementRecord): AnnouncementRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    title: row.title,
    urgency: row.urgency,
    state: row.state,
    publishAt: row.publish_at,
    pinnedUntil: row.pinned_until,
    expiresOn: row.expires_on,
    requiresAck: row.requires_ack,
    ackDueOn: row.ack_due_on,
    authorUserId: row.author_user_id,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
    updateSentAt: row.update_sent_at,
  };
}

export async function announcementById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<AnnouncementRow | null> {
  const [row] = await tx.execute<AnnouncementRecord>(sql`
    select ${columns} from core.announcements a
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.author_user_id
    where a.tenant_id = ${tenantId}::uuid and a.id = ${id}::uuid and a.status = 'active'`);
  return row ? rowOf(row) : null;
}

export async function audiencesOf(
  tx: Tx,
  tenantId: string,
  announcementId: string,
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
    from core.announcement_audiences x
    left join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    left join core.descriptors d on d.tenant_id = x.tenant_id and d.id = x.grade_descriptor_id
    where x.tenant_id = ${tenantId}::uuid and x.announcement_id = ${announcementId}::uuid
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

export interface AnnouncementFields {
  title: string;
  urgency: Urgency;
  pinnedUntil: string | null;
  expiresOn: string | null;
  requiresAck: boolean;
  ackDueOn: string | null;
}

export async function insertAnnouncement(
  tx: Tx,
  input: AnnouncementFields & {
    tenantId: string;
    schoolId: string;
    authorId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.announcements
      (tenant_id, org_id, title, urgency, pinned_until, expires_on, requires_ack, ack_due_on, author_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.title}, ${input.urgency},
            ${input.pinnedUntil}::date, ${input.expiresOn}::date, ${input.requiresAck},
            ${input.ackDueOn}::date, ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("announcement not written");
  return row;
}

export async function updateAnnouncement(
  tx: Tx,
  input: AnnouncementFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.announcements
    set title = ${input.title}, urgency = ${input.urgency}, pinned_until = ${input.pinnedUntil}::date,
        expires_on = ${input.expiresOn}::date, requires_ack = ${input.requiresAck},
        ack_due_on = ${input.ackDueOn}::date
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function setAudiences(
  tx: Tx,
  input: {
    tenantId: string;
    announcementId: string;
    audiences: readonly Audience[];
  },
): Promise<void> {
  await tx.execute(sql`
    update core.announcement_audiences set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and announcement_id = ${input.announcementId}::uuid
      and status = 'active'`);
  if (input.audiences.length === 0) return;
  await tx.execute(sql`
    insert into core.announcement_audiences (tenant_id, announcement_id, scope, class_id, grade_descriptor_id)
    values ${sql.join(
      input.audiences.map(
        (audience) =>
          sql`(${input.tenantId}::uuid, ${input.announcementId}::uuid, ${audience.scope},
               ${audience.classId}::uuid, ${audience.gradeId}::uuid)`,
      ),
      sql`, `,
    )}`);
}

/** Moves an announcement on; the version it was read at must still hold. */
export async function setState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: AnnouncementState;
    publishAt: string | null;
    updateSent?: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.announcements
    set state = ${input.state}, publish_at = ${input.publishAt}::timestamptz,
        update_sent_at = case when ${input.updateSent ?? false} then statement_timestamp()
                              else update_sent_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Adds the people an announcement reaches; those it already reached keep their state. */
export async function addRecipients(
  tx: Tx,
  input: {
    tenantId: string;
    announcementId: string;
    userIds: readonly string[];
  },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.announcement_recipients (tenant_id, announcement_id, user_id)
    select ${input.tenantId}::uuid, ${input.announcementId}::uuid, u
    from unnest(${uuidArray(input.userIds)}) as u
    on conflict do nothing
    returning id`);
  return rows.length;
}

export interface FeedRow extends AnnouncementRow {
  summary: string;
  pinned: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
}

/**
 * What a person has been sent and can read now: pinned first, then newest.
 * Current holds what has not expired; past what has.
 */
export async function feedOf(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    today: string;
    tab: "current" | "past";
    q: string;
  },
): Promise<FeedRow[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<
    AnnouncementRecord & {
      summary: string | null;
      pinned: boolean;
      read_at: string | null;
      acknowledged_at: string | null;
    }
  >(sql`
    select ${columns}, left(d.plain_text, 240) as summary,
           coalesce(a.pinned_until >= ${input.today}::date, false) as pinned,
           ${isoOf(sql`r.read_at`)} as read_at, ${isoOf(sql`r.acknowledged_at`)} as acknowledged_at
    from core.announcement_recipients r
    join core.announcements a on a.tenant_id = r.tenant_id and a.id = r.announcement_id
      and a.status = 'active' and a.org_id = ${input.schoolId}::uuid
      and a.state in ('scheduled', 'published') and a.publish_at <= statement_timestamp()
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.author_user_id
    left join core.documents d on d.tenant_id = a.tenant_id and d.host_type = 'announcement'
      and d.host_id = a.id and d.status = 'active' and d.translation_of_id is null
    where r.tenant_id = ${input.tenantId}::uuid and r.user_id = ${input.viewerId}::uuid
      and r.status = 'active'
      and (case when ${input.tab === "past"}
                then a.expires_on < ${input.today}::date
                else a.expires_on is null or a.expires_on >= ${input.today}::date end)
      and (${q}::text is null or a.title ilike ${q} or d.plain_text ilike ${q})
    order by (${input.tab === "current"} and coalesce(a.pinned_until >= ${input.today}::date, false)) desc,
             a.publish_at desc, a.id
    limit 200`);
  return rows.map((row) => ({
    ...rowOf(row),
    summary: row.summary ?? "",
    pinned: row.pinned,
    readAt: row.read_at,
    acknowledgedAt: row.acknowledged_at,
  }));
}

export interface ManagedRow extends AnnouncementRow {
  recipients: number;
  read: number;
  acknowledged: number;
}

/** Everything the school has written or is writing, for those who manage it. */
export async function managedAnnouncements(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    states: readonly AnnouncementState[];
    q: string;
  },
): Promise<ManagedRow[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<
    AnnouncementRecord & {
      recipients: number;
      read: number;
      acknowledged: number;
    }
  >(sql`
    select ${columns},
           (select count(*)::int from core.announcement_recipients r
             where r.tenant_id = a.tenant_id and r.announcement_id = a.id and r.status = 'active') as recipients,
           (select count(*)::int from core.announcement_recipients r
             where r.tenant_id = a.tenant_id and r.announcement_id = a.id and r.status = 'active'
               and r.read_at is not null) as read,
           (select count(*)::int from core.announcement_recipients r
             where r.tenant_id = a.tenant_id and r.announcement_id = a.id and r.status = 'active'
               and r.acknowledged_at is not null) as acknowledged
    from core.announcements a
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.author_user_id
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid
      and a.status = 'active' and a.state = any(${sql`array[${sql.join(
        input.states.map((state) => sql`${state}`),
        sql`, `,
      )}]::text[]`})
      and (${q}::text is null or a.title ilike ${q})
    order by coalesce(a.publish_at, a.date_last_modified) desc, a.id
    limit 200`);
  return rows.map((row) => ({
    ...rowOf(row),
    recipients: row.recipients,
    read: row.read,
    acknowledged: row.acknowledged,
  }));
}

export async function recipientOf(
  tx: Tx,
  input: { tenantId: string; announcementId: string; userId: string },
): Promise<{ readAt: string | null; acknowledgedAt: string | null } | null> {
  const [row] = await tx.execute<{
    read_at: string | null;
    acknowledged_at: string | null;
  }>(sql`
    select ${isoOf(sql`read_at`)} as read_at, ${isoOf(sql`acknowledged_at`)} as acknowledged_at
    from core.announcement_recipients
    where tenant_id = ${input.tenantId}::uuid and announcement_id = ${input.announcementId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'`);
  return row
    ? { readAt: row.read_at, acknowledgedAt: row.acknowledged_at }
    : null;
}

export async function markSeen(
  tx: Tx,
  input: {
    tenantId: string;
    announcementId: string;
    userId: string;
    acknowledge: boolean;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.announcement_recipients
    set read_at = coalesce(read_at, statement_timestamp()),
        acknowledged_at = case when ${input.acknowledge}
                               then coalesce(acknowledged_at, statement_timestamp())
                               else acknowledged_at end
    where tenant_id = ${input.tenantId}::uuid and announcement_id = ${input.announcementId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface ReportRow {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

/** Who an announcement reached, those yet to read or acknowledge first. */
export async function deliveryReport(
  tx: Tx,
  input: { tenantId: string; announcementId: string },
): Promise<ReportRow[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    read_at: string | null;
    acknowledged_at: string | null;
  }>(sql`
    select r.user_id, u.full_name_en, u.full_name_ar,
           ${isoOf(sql`r.read_at`)} as read_at, ${isoOf(sql`r.acknowledged_at`)} as acknowledged_at
    from core.announcement_recipients r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id
    where r.tenant_id = ${input.tenantId}::uuid and r.announcement_id = ${input.announcementId}::uuid
      and r.status = 'active'
    order by r.acknowledged_at nulls first, r.read_at nulls first, u.full_name_en, u.id
    limit 2000`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    readAt: row.read_at,
    acknowledgedAt: row.acknowledged_at,
  }));
}

/** An update was sent: everyone sees the announcement unread again. */
export async function resetReads(
  tx: Tx,
  input: { tenantId: string; announcementId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.announcement_recipients set read_at = null
    where tenant_id = ${input.tenantId}::uuid and announcement_id = ${input.announcementId}::uuid
      and status = 'active'`);
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
