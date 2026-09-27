import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ThreadKind, ThreadRole } from "../tables/messaging";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Reach {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  on: string;
  /** The viewer may reach every student of the school and their families. */
  schoolWide: boolean;
}

export type PersonKind = "staff" | "guardian" | "student";

export interface Messageable {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  kind: PersonKind;
  /** For a guardian: the children the viewer reaches them through. */
  children: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
}

const STAFF_ROLES = sql`('teacher', 'aide', 'counselor', 'principal', 'site_administrator',
  'district_administrator', 'system_administrator', 'proctor', 'staff')`;
const OFFICE_ROLES = sql`('principal', 'site_administrator', 'staff', 'counselor')`;

/**
 * Everyone the viewer may write to. Staff reach the school's staff and the
 * students they reach with those students' guardians; a guardian reaches
 * the teachers of their children's classes and the office; a student
 * reaches their own teachers. Guardians without portal access, or kept
 * apart from the school's messages, are never offered.
 */
function reachable(reach: Reach): SQL {
  return sql`
    with viewer as (
      select
        exists (select 1 from core.user_roles r
          where r.tenant_id = ${reach.tenantId}::uuid and r.user_id = ${reach.viewerId}::uuid
            and r.org_id = ${reach.schoolId}::uuid and r.status = 'active'
            and r.valid_during @> ${reach.on}::date and r.role in ${STAFF_ROLES}) as staff
    ), students as (
      select student_user_id as user_id
      from app.visible_students(${reach.viewerId}::uuid, ${reach.schoolId}::uuid, ${reach.on}::date, ${reach.schoolWide})
      where (select staff from viewer)
    ), children as (
      select l.student_user_id as user_id from core.user_relationships l
      where l.tenant_id = ${reach.tenantId}::uuid and l.related_user_id = ${reach.viewerId}::uuid
        and l.status = 'active' and l.portal_access and l.valid_during @> ${reach.on}::date
        and not coalesce(l.communication_isolated, false)
    ), learners as (
      select ${reach.viewerId}::uuid as user_id
      where exists (select 1 from core.enrollments e
        where e.tenant_id = ${reach.tenantId}::uuid and e.user_id = ${reach.viewerId}::uuid
          and e.role = 'student' and e.status = 'active' and e.valid_during @> ${reach.on}::date)
      union
      select user_id from children
    ), their_classes as (
      select c.id from core.enrollments e
      join core.classes k on k.tenant_id = e.tenant_id and k.id = e.class_id
      join core.classes c on c.tenant_id = k.tenant_id
        and (c.id = k.id or c.homeroom_class_id = k.id) and c.status = 'active'
      where e.tenant_id = ${reach.tenantId}::uuid and e.role = 'student' and e.status = 'active'
        and e.valid_during @> ${reach.on}::date and e.user_id in (select user_id from learners)
    ), candidates(user_id, kind) as (
      select r.user_id, 'staff' from core.user_roles r
      where (select staff from viewer) and r.tenant_id = ${reach.tenantId}::uuid
        and r.org_id = ${reach.schoolId}::uuid and r.status = 'active'
        and r.valid_during @> ${reach.on}::date and r.role in ${STAFF_ROLES}
      union
      select s.user_id, 'student' from students s
      union
      select l.related_user_id, 'guardian' from core.user_relationships l
      where l.tenant_id = ${reach.tenantId}::uuid and l.status = 'active' and l.portal_access
        and l.valid_during @> ${reach.on}::date and not coalesce(l.communication_isolated, false)
        and l.student_user_id in (select user_id from students)
      union
      select e.user_id, 'staff' from core.enrollments e
      where e.tenant_id = ${reach.tenantId}::uuid and e.role in ('teacher', 'aide')
        and e.status = 'active' and e.valid_during @> ${reach.on}::date
        and e.class_id in (select id from their_classes)
      union
      select r.user_id, 'staff' from core.user_roles r
      where exists (select 1 from children) and r.tenant_id = ${reach.tenantId}::uuid
        and r.org_id = ${reach.schoolId}::uuid and r.status = 'active'
        and r.valid_during @> ${reach.on}::date and r.role in ${OFFICE_ROLES}
    )
    select distinct on (c.user_id) c.user_id, c.kind from candidates c
    where c.user_id <> ${reach.viewerId}::uuid
    order by c.user_id, case c.kind when 'staff' then 0 when 'guardian' then 1 else 2 end`;
}

export async function messageable(
  tx: Tx,
  reach: Reach,
  filter: { q: string; limit: number },
): Promise<Messageable[]> {
  const q = filter.q ? `%${filter.q}%` : null;
  const rows = await tx.execute<{
    user_id: string;
    kind: PersonKind;
    full_name_en: string | null;
    full_name_ar: string | null;
    children: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
    }[];
  }>(sql`
    with people as (${reachable(reach)})
    select p.user_id, p.kind, u.full_name_en, u.full_name_ar,
           coalesce((select jsonb_agg(jsonb_build_object('user_id', s.id,
               'full_name_en', s.full_name_en, 'full_name_ar', s.full_name_ar)
               order by s.full_name_en)
             from core.user_relationships l
             join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
             where p.kind = 'guardian' and l.tenant_id = u.tenant_id and l.related_user_id = u.id
               and l.status = 'active' and l.valid_during @> ${reach.on}::date), '[]'::jsonb) as children
    from people p
    join core.users u on u.tenant_id = ${reach.tenantId}::uuid and u.id = p.user_id and u.status = 'active'
    where (${q}::text is null or u.full_name_en ilike ${q} or u.full_name_ar ilike ${q}
           or exists (select 1 from core.user_relationships l
             join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
             where p.kind = 'guardian' and l.tenant_id = u.tenant_id and l.related_user_id = u.id
               and l.status = 'active' and (s.full_name_en ilike ${q} or s.full_name_ar ilike ${q})))
    order by case p.kind when 'staff' then 0 when 'guardian' then 1 else 2 end,
             u.full_name_en, u.id
    limit ${filter.limit}`);
  return rows.map((row) => ({
    userId: row.user_id,
    kind: row.kind,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    children: row.children.map((child) => ({
      userId: child.user_id,
      fullNameEn: child.full_name_en,
      fullNameAr: child.full_name_ar,
    })),
  }));
}

/** Which of these people the viewer may not write to. */
export async function unreachable(
  tx: Tx,
  reach: Reach,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    with people as (${reachable(reach)})
    select t.user_id from unnest(${uuidArray(userIds)}) as t(user_id)
    where t.user_id not in (select user_id from people)`);
  return rows.map((row) => row.user_id);
}

/** A child's guardians who take part in the school's messages. */
export async function messagingGuardians(
  tx: Tx,
  input: { tenantId: string; studentId: string; on: string },
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct l.related_user_id as user_id from core.user_relationships l
    where l.tenant_id = ${input.tenantId}::uuid and l.student_user_id = ${input.studentId}::uuid
      and l.status = 'active' and l.portal_access and l.valid_during @> ${input.on}::date
      and not coalesce(l.communication_isolated, false)
    order by 1`);
  return rows.map((row) => row.user_id);
}

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  subject: string | null;
  studentId: string | null;
  studentNameEn: string | null;
  studentNameAr: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  lastAuthorId: string | null;
  lastAuthorNameEn: string | null;
  lastAuthorNameAr: string | null;
  unread: number;
  others: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
}

/** The viewer's conversations, newest first; unread ones only when asked. */
export async function threadsOf(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    unreadOnly: boolean;
    q: string;
    limit: number;
  },
): Promise<ThreadSummary[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<{
    id: string;
    kind: ThreadKind;
    subject: string | null;
    student_user_id: string | null;
    student_en: string | null;
    student_ar: string | null;
    last_message_at: string;
    last_body: string | null;
    last_author_id: string | null;
    last_author_en: string | null;
    last_author_ar: string | null;
    unread: number;
    others: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
    }[];
  }>(sql`
    with mine as (
      select t.*, m.last_read_at from core.thread_members m
      join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
        and t.status = 'active' and t.org_id = ${input.schoolId}::uuid
      where m.tenant_id = ${input.tenantId}::uuid and m.user_id = ${input.viewerId}::uuid
        and m.status = 'active' and m.left_at is null
    )
    select t.id, t.kind, t.subject, t.student_user_id, s.full_name_en as student_en,
           s.full_name_ar as student_ar, ${isoOf(sql`t.last_message_at`)} as last_message_at,
           last.body as last_body, last.author_user_id as last_author_id,
           a.full_name_en as last_author_en, a.full_name_ar as last_author_ar,
           (select count(*)::int from core.messages x
             where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
               and x.author_user_id <> ${input.viewerId}::uuid
               and (t.last_read_at is null or x.created_at > t.last_read_at)) as unread,
           coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id,
               'full_name_en', u.full_name_en, 'full_name_ar', u.full_name_ar)
               order by u.full_name_en)
             from core.thread_members o
             join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
               and o.left_at is null and o.user_id <> ${input.viewerId}::uuid), '[]'::jsonb) as others
    from mine t
    left join core.users s on s.tenant_id = t.tenant_id and s.id = t.student_user_id
    left join lateral (
      select x.body, x.author_user_id from core.messages x
      where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
      order by x.created_at desc, x.id desc limit 1) last on true
    left join core.users a on a.tenant_id = t.tenant_id and a.id = last.author_user_id
    where (${q}::text is null or t.subject ilike ${q} or s.full_name_en ilike ${q}
           or s.full_name_ar ilike ${q}
           or exists (select 1 from core.thread_members o
             join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
               and (u.full_name_en ilike ${q} or u.full_name_ar ilike ${q}))
           or exists (select 1 from core.messages x
             where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
               and x.body ilike ${q}))
    order by t.last_message_at desc, t.id
    limit ${input.limit}`);
  return rows
    .filter((row) => !input.unreadOnly || row.unread > 0)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      studentId: row.student_user_id,
      studentNameEn: row.student_en,
      studentNameAr: row.student_ar,
      lastMessageAt: row.last_message_at,
      lastBody: row.last_body,
      lastAuthorId: row.last_author_id,
      lastAuthorNameEn: row.last_author_en,
      lastAuthorNameAr: row.last_author_ar,
      unread: row.unread,
      others: row.others.map((other) => ({
        userId: other.user_id,
        fullNameEn: other.full_name_en,
        fullNameAr: other.full_name_ar,
      })),
    }));
}

export interface ThreadRow {
  id: string;
  version: number;
  orgId: string;
  kind: ThreadKind;
  subject: string | null;
  studentId: string | null;
  createdByUserId: string;
}

export async function threadById(
  tx: Tx,
  tenantId: string,
  threadId: string,
): Promise<ThreadRow | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    org_id: string;
    kind: ThreadKind;
    subject: string | null;
    student_user_id: string | null;
    created_by_user_id: string;
  }>(sql`
    select id, version, org_id, kind, subject, student_user_id, created_by_user_id
    from core.message_threads
    where tenant_id = ${tenantId}::uuid and id = ${threadId}::uuid and status = 'active'`);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    kind: row.kind,
    subject: row.subject,
    studentId: row.student_user_id,
    createdByUserId: row.created_by_user_id,
  };
}

export interface MemberRow {
  id: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  role: ThreadRole;
  lastReadAt: string | null;
  draft: string | null;
}

export async function membersOf(
  tx: Tx,
  tenantId: string,
  threadId: string,
): Promise<MemberRow[]> {
  const rows = await tx.execute<{
    id: string;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    role: ThreadRole;
    last_read_at: string | null;
    draft: string | null;
  }>(sql`
    select m.id, m.user_id, u.full_name_en, u.full_name_ar, m.role,
           ${isoOf(sql`m.last_read_at`)} as last_read_at, m.draft
    from core.thread_members m
    join core.users u on u.tenant_id = m.tenant_id and u.id = m.user_id
    where m.tenant_id = ${tenantId}::uuid and m.thread_id = ${threadId}::uuid
      and m.status = 'active' and m.left_at is null
    order by m.role, u.full_name_en, u.id`);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    role: row.role,
    lastReadAt: row.last_read_at,
    draft: row.draft,
  }));
}

export interface MessageRow {
  id: string;
  authorId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  body: string;
  createdAt: string;
}

/** The latest messages of a thread, oldest first, before a moment when paging back. */
export async function messagesOf(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    before: string | null;
    limit: number;
  },
): Promise<MessageRow[]> {
  const rows = await tx.execute<{
    id: string;
    author_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    body: string;
    created_at: string;
  }>(sql`
    select * from (
      select x.id, x.author_user_id, u.full_name_en, u.full_name_ar, x.body,
             ${isoOf(sql`x.created_at`)} as created_at, x.created_at as at
      from core.messages x
      join core.users u on u.tenant_id = x.tenant_id and u.id = x.author_user_id
      where x.tenant_id = ${input.tenantId}::uuid and x.thread_id = ${input.threadId}::uuid
        and x.status = 'active'
        and (${input.before}::timestamptz is null or x.created_at < ${input.before}::timestamptz)
      order by x.created_at desc, x.id desc
      limit ${input.limit}) latest
    order by at, id`);
  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_user_id,
    authorNameEn: row.full_name_en,
    authorNameAr: row.full_name_ar,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/**
 * An open thread of this kind among exactly these people, so writing to
 * someone again continues the conversation rather than starting another.
 */
export async function existingThread(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    kind: "direct" | "family";
    memberIds: readonly string[];
    studentId: string | null;
    ownerId: string;
  },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(
    input.kind === "family"
      ? sql`
    select t.id from core.message_threads t
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
      and t.status = 'active' and t.kind = 'family'
      and t.student_user_id = ${input.studentId}::uuid
      and exists (select 1 from core.thread_members m
        where m.tenant_id = t.tenant_id and m.thread_id = t.id and m.status = 'active'
          and m.left_at is null and m.user_id = ${input.ownerId}::uuid and m.role = 'owner')
    order by t.last_message_at desc limit 1`
      : sql`
    select t.id from core.message_threads t
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
      and t.status = 'active' and t.kind = 'direct'
      and (select array_agg(m.user_id order by m.user_id) from core.thread_members m
           where m.tenant_id = t.tenant_id and m.thread_id = t.id and m.status = 'active'
             and m.left_at is null)
          = (select array_agg(x order by x) from unnest(${uuidArray(input.memberIds)}) x)
    order by t.last_message_at desc limit 1`,
  );
  return row?.id ?? null;
}

export async function createThread(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    kind: ThreadKind;
    subject: string | null;
    studentId: string | null;
    ownerId: string;
    memberIds: readonly string[];
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.message_threads (tenant_id, org_id, kind, subject, student_user_id, created_by_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.kind}, ${input.subject},
            ${input.studentId}::uuid, ${input.ownerId}::uuid)
    returning id`);
  if (!row) throw new Error("thread not written");
  await addMembers(tx, {
    tenantId: input.tenantId,
    threadId: row.id,
    userIds: [input.ownerId],
    role: "owner",
  });
  await addMembers(tx, {
    tenantId: input.tenantId,
    threadId: row.id,
    userIds: input.memberIds.filter((id) => id !== input.ownerId),
    role: "member",
  });
  return row.id;
}

export async function addMembers(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    userIds: readonly string[];
    role: ThreadRole;
  },
): Promise<void> {
  if (input.userIds.length === 0) return;
  await tx.execute(sql`
    insert into core.thread_members (tenant_id, thread_id, user_id, role)
    select ${input.tenantId}::uuid, ${input.threadId}::uuid, u, ${input.role}
    from unnest(${uuidArray(input.userIds)}) as u
    on conflict do nothing`);
}

/** Takes people out of a thread from now; what they wrote stays theirs. */
export async function removeMembers(
  tx: Tx,
  input: { tenantId: string; threadId: string; userIds: readonly string[] },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    update core.thread_members set left_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = any(${uuidArray(input.userIds)}) and status = 'active' and left_at is null
    returning id`);
  return rows.length;
}

export async function postMessage(
  tx: Tx,
  input: { tenantId: string; threadId: string; authorId: string; body: string },
): Promise<{ id: string; createdAt: string }> {
  const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
    insert into core.messages (tenant_id, thread_id, author_user_id, body)
    values (${input.tenantId}::uuid, ${input.threadId}::uuid, ${input.authorId}::uuid, ${input.body})
    returning id, ${isoOf(sql`created_at`)} as created_at`);
  if (!row) throw new Error("message not written");
  await tx.execute(sql`
    update core.message_threads set last_message_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.threadId}::uuid`);
  await tx.execute(sql`
    update core.thread_members set last_read_at = statement_timestamp(), draft = null
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.authorId}::uuid and status = 'active' and left_at is null`);
  return { id: row.id, createdAt: row.created_at };
}

export async function markRead(
  tx: Tx,
  input: { tenantId: string; threadId: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.thread_members set last_read_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and left_at is null`);
}

export async function saveDraft(
  tx: Tx,
  input: { tenantId: string; threadId: string; userId: string; draft: string },
): Promise<void> {
  await tx.execute(sql`
    update core.thread_members set draft = nullif(${input.draft}, '')
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and left_at is null`);
}

/** Unread conversations for the bell and the navigation badge. */
export async function unreadThreads(
  tx: Tx,
  input: { tenantId: string; schoolId: string; viewerId: string },
): Promise<number> {
  const [row] = await tx.execute<{ unread: number }>(sql`
    select count(*)::int as unread from core.thread_members m
    join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      and t.status = 'active' and t.org_id = ${input.schoolId}::uuid
    where m.tenant_id = ${input.tenantId}::uuid and m.user_id = ${input.viewerId}::uuid
      and m.status = 'active' and m.left_at is null
      and exists (select 1 from core.messages x
        where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
          and x.author_user_id <> m.user_id
          and (m.last_read_at is null or x.created_at > m.last_read_at))`);
  return row?.unread ?? 0;
}

/** Whether someone in a message's thread may open what it carries. */
export async function readsMessage(
  tx: Tx,
  input: { tenantId: string; messageId: string; userId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from core.messages x
      join core.thread_members m on m.tenant_id = x.tenant_id and m.thread_id = x.thread_id
      where x.tenant_id = ${input.tenantId}::uuid and x.id = ${input.messageId}::uuid
        and m.user_id = ${input.userId}::uuid and m.status = 'active' and m.left_at is null) as ok`);
  return row?.ok ?? false;
}
