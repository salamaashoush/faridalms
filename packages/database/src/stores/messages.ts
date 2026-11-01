import type { InboxBox } from "@faridalms/domain/messages";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  EntryKind,
  Mailbox,
  ThreadKind,
  ThreadRole,
} from "../tables/messaging";

import { escapeLike, isoOf, textArray, uuidArray } from "./sql";

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

/** The adults told about a child's absence: those the link says receive notices. */
export async function noticeGuardians(
  tx: Tx,
  input: { tenantId: string; studentId: string; on: string },
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct l.related_user_id as user_id from core.user_relationships l
    where l.tenant_id = ${input.tenantId}::uuid and l.student_user_id = ${input.studentId}::uuid
      and l.status = 'active' and l.receives_notifications and l.valid_during @> ${input.on}::date
      and not coalesce(l.communication_isolated, false)
    order by 1`);
  return rows.map((row) => row.user_id);
}

export interface Named {
  userId: string | null;
  contactId: string | null;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  mailbox: Mailbox | null;
  subject: string | null;
  studentId: string | null;
  studentNameEn: string | null;
  studentNameAr: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  lastKind: EntryKind | null;
  lastAuthorId: string | null;
  lastAuthorNameEn: string | null;
  lastAuthorNameAr: string | null;
  unread: number;
  /** Everyone else in it; in a mailbox conversation, its contacts and its owner. */
  others: Named[];
  owner: Named | null;
}

/** Who the viewer reads a conversation as: in it, or one of the team that shares its mailbox. */
export interface Reader {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  /** The mailboxes the viewer's capabilities read. */
  mailboxes: readonly Mailbox[];
}

/**
 * The conversations a viewer reaches, keyed by thread with their read
 * state: those they are in, and every conversation of a mailbox they
 * read. A staff member's row in a mailbox conversation only keeps how far
 * they read; it never lets them in, so someone who stops holding the
 * mailbox's capability stops seeing it.
 */
function reached(reader: Reader, box: InboxBox): SQL {
  return sql`
    with mine as (
      select m.thread_id, m.last_read_at, false as team from core.thread_members m
      join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
        and t.status = 'active' and t.org_id = ${reader.schoolId}::uuid
      where m.tenant_id = ${reader.tenantId}::uuid and m.user_id = ${reader.viewerId}::uuid
        and m.status = 'active' and m.left_at is null
        and (t.mailbox is null or m.role = 'member')
        and ${box} in ('all', 'personal')
      union all
      select t.id, (select r.last_read_at from core.thread_members r
          where r.tenant_id = t.tenant_id and r.thread_id = t.id and r.user_id = ${reader.viewerId}::uuid
            and r.role <> 'member' and r.status = 'active' and r.left_at is null limit 1),
        true
      from core.message_threads t
      where t.tenant_id = ${reader.tenantId}::uuid and t.org_id = ${reader.schoolId}::uuid
        and t.status = 'active' and t.mailbox = any(${textArray(reader.mailboxes)})
        and (${box} = 'all' or ${box} = t.mailbox)
    ), reached as (
      select distinct on (thread_id) thread_id, last_read_at, team from mine
      order by thread_id, team desc
    )`;
}

/** Entries `x` a reader may see: everything to the team, only messages to anyone else. */
const visible = (team: SQL) => sql`(${team} or x.kind = 'message')`;

/** Entries `x` someone other than the viewer wrote, by account or as a contact now linked to them. */
const notBy = (viewerId: string) =>
  sql`(x.author_user_id is distinct from ${viewerId}::uuid
    and not exists (select 1 from core.message_contacts mc
      where mc.tenant_id = x.tenant_id and mc.id = x.author_contact_id
        and mc.user_id = ${viewerId}::uuid))`;

/**
 * Whether an entry is past where the reader read to. A member who never
 * opened the conversation has read nothing; a team member without a row
 * read everything older than the conversation, which is how a mailbox
 * conversation made from older records starts read.
 */
const unreadBy = sql`coalesce(x.created_at > r.last_read_at,
  not r.team or x.created_at >= t.created_at)`;

type NamedRecord = {
  user_id: string | null;
  contact_id: string | null;
  full_name_en: string | null;
  full_name_ar: string | null;
};
const named = (row: NamedRecord): Named => ({
  userId: row.user_id,
  contactId: row.contact_id,
  fullNameEn: row.full_name_en,
  fullNameAr: row.full_name_ar,
});
/** A member's names: the person's, or the name a contact gave while no person is linked. */
const memberNames = sql`'user_id', o.user_id, 'contact_id', o.contact_id,
    'full_name_en', coalesce(u.full_name_en, case when u.id is null then c.display_name end),
    'full_name_ar', coalesce(u.full_name_ar, case when u.id is null then c.display_name end)`;

/** The viewer's conversations, newest first; unread ones only when asked. */
export async function threadsOf(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    mailboxes?: readonly Mailbox[];
    box?: InboxBox;
    unreadOnly: boolean;
    q: string;
    limit: number;
  },
): Promise<ThreadSummary[]> {
  const q = input.q ? `%${escapeLike(input.q)}%` : null;
  const reader = { ...input, mailboxes: input.mailboxes ?? [] };
  const rows = await tx.execute<{
    id: string;
    kind: ThreadKind;
    mailbox: Mailbox | null;
    subject: string | null;
    student_user_id: string | null;
    student_en: string | null;
    student_ar: string | null;
    last_message_at: string;
    last_body: string | null;
    last_kind: EntryKind | null;
    last_author_id: string | null;
    last_author_en: string | null;
    last_author_ar: string | null;
    unread: number;
    others: NamedRecord[];
    owner: NamedRecord | null;
  }>(sql`
    ${reached(reader, input.box ?? "all")}
    select t.id, t.kind, t.mailbox, t.subject, t.student_user_id, s.full_name_en as student_en,
           s.full_name_ar as student_ar, ${isoOf(sql`t.last_message_at`)} as last_message_at,
           last.body as last_body, last.kind as last_kind, last.author_id as last_author_id,
           last.name_en as last_author_en, last.name_ar as last_author_ar,
           (select count(*)::int from core.messages x
             where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
               and x.kind <> 'event' and ${visible(sql`r.team`)} and ${notBy(input.viewerId)}
               and ${unreadBy}) as unread,
           coalesce((select jsonb_agg(jsonb_build_object(${memberNames})
               order by o.role, coalesce(u.full_name_en, c.display_name))
             from core.thread_members o
             left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
             left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
               and o.left_at is null and o.user_id is distinct from ${input.viewerId}::uuid
               and (t.mailbox is null or o.role <> 'reader')),
             '[]'::jsonb) as others,
           (select jsonb_build_object(${memberNames})
             from core.thread_members o
             left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
             left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where t.mailbox is not null and o.tenant_id = t.tenant_id and o.thread_id = t.id
               and o.status = 'active' and o.left_at is null and o.role = 'owner'
             limit 1) as owner
    from reached r
    join core.message_threads t on t.tenant_id = ${input.tenantId}::uuid and t.id = r.thread_id
    left join core.users s on s.tenant_id = t.tenant_id and s.id = t.student_user_id
    left join lateral (
      select x.body, x.kind, coalesce(x.author_user_id, c.user_id, x.author_contact_id) as author_id,
        coalesce(u.full_name_en, case when u.id is null then c.display_name end) as name_en,
        coalesce(u.full_name_ar, case when u.id is null then c.display_name end) as name_ar
      from core.messages x
      left join core.message_contacts c on c.tenant_id = x.tenant_id and c.id = x.author_contact_id
      left join core.users u on u.tenant_id = x.tenant_id and u.id = coalesce(x.author_user_id, c.user_id)
      where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
        and x.kind <> 'event' and ${visible(sql`r.team`)}
      order by x.created_at desc, x.id desc limit 1) last on true
    -- A family sees a team's conversation with them once it holds a word for them.
    where (r.team or t.mailbox is null or last.kind is not null)
      and (${q}::text is null or t.subject ilike ${q} or s.full_name_en ilike ${q}
           or s.full_name_ar ilike ${q}
           or exists (select 1 from core.thread_members o
             left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
             left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
               and (u.full_name_en ilike ${q} or u.full_name_ar ilike ${q}
                 or c.display_name ilike ${q} or c.email ilike ${q}))
           or exists (select 1 from core.messages x
             where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
               and ${visible(sql`r.team`)} and x.body ilike ${q}))
    order by t.last_message_at desc, t.id
    limit ${input.limit}`);
  return rows
    .filter((row) => !input.unreadOnly || row.unread > 0)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      mailbox: row.mailbox,
      subject: row.subject,
      studentId: row.student_user_id,
      studentNameEn: row.student_en,
      studentNameAr: row.student_ar,
      lastMessageAt: row.last_message_at,
      lastBody: row.last_body,
      lastKind: row.last_kind,
      lastAuthorId: row.last_author_id,
      lastAuthorNameEn: row.last_author_en,
      lastAuthorNameAr: row.last_author_ar,
      unread: row.unread,
      others: row.others.map(named),
      owner: row.owner ? named(row.owner) : null,
    }));
}

export interface ThreadRow {
  id: string;
  version: number;
  orgId: string;
  kind: ThreadKind;
  mailbox: Mailbox | null;
  subject: string | null;
  studentId: string | null;
  createdByUserId: string | null;
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
    mailbox: Mailbox | null;
    subject: string | null;
    student_user_id: string | null;
    created_by_user_id: string | null;
  }>(sql`
    select id, version, org_id, kind, mailbox, subject, student_user_id, created_by_user_id
    from core.message_threads
    where tenant_id = ${tenantId}::uuid and id = ${threadId}::uuid and status = 'active'`);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    kind: row.kind,
    mailbox: row.mailbox,
    subject: row.subject,
    studentId: row.student_user_id,
    createdByUserId: row.created_by_user_id,
  };
}

export interface MemberRow extends Named {
  id: string;
  role: ThreadRole;
  lastReadAt: string | null;
  draft: string | null;
  /** A contact's address, which only the team that shares the mailbox reads. */
  email: string | null;
}

export async function membersOf(
  tx: Tx,
  tenantId: string,
  threadId: string,
): Promise<MemberRow[]> {
  const rows = await tx.execute<{
    id: string;
    user_id: string | null;
    contact_id: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
    email: string | null;
    role: ThreadRole;
    last_read_at: string | null;
    draft: string | null;
  }>(sql`
    select m.id, m.user_id, m.contact_id,
           coalesce(u.full_name_en, case when u.id is null then c.display_name end) as full_name_en,
           coalesce(u.full_name_ar, case when u.id is null then c.display_name end) as full_name_ar,
           c.email, m.role, ${isoOf(sql`m.last_read_at`)} as last_read_at, m.draft
    from core.thread_members m
    left join core.message_contacts c on c.tenant_id = m.tenant_id and c.id = m.contact_id
    left join core.users u on u.tenant_id = m.tenant_id and u.id = m.user_id
    where m.tenant_id = ${tenantId}::uuid and m.thread_id = ${threadId}::uuid
      and m.status = 'active' and m.left_at is null
    order by m.role, coalesce(u.full_name_en, c.display_name), m.id`);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    contactId: row.contact_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    email: row.email,
    role: row.role,
    lastReadAt: row.last_read_at,
    draft: row.draft,
  }));
}

export interface MessageRow {
  id: string;
  kind: EntryKind;
  /** The person who wrote it, a contact's once linked; null for a contact's or the system's. */
  authorId: string | null;
  authorContactId: string | null;
  authorNameEn: string | null;
  authorNameAr: string | null;
  body: string;
  /** The entry's document; null for a recorded event and an emptied entry. */
  content: Record<string, unknown> | null;
  details: Record<string, unknown>;
  redacted: boolean;
  createdAt: string;
}

/**
 * The latest entries of a thread, oldest first, before a moment when
 * paging back. Internal entries only when the reader is of the team.
 */
export async function messagesOf(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    before: string | null;
    limit: number;
    internal: boolean;
  },
): Promise<MessageRow[]> {
  const rows = await tx.execute<{
    id: string;
    kind: EntryKind;
    author_id: string | null;
    author_contact_id: string | null;
    name_en: string | null;
    name_ar: string | null;
    body: string;
    content: Record<string, unknown> | null;
    details: Record<string, unknown>;
    redacted: boolean;
    created_at: string;
  }>(sql`
    select * from (
      select x.id, x.kind, coalesce(x.author_user_id, c.user_id) as author_id, x.author_contact_id,
             (select d.content from core.documents d
               where d.tenant_id = x.tenant_id and d.host_type = 'message' and d.host_id = x.id
                 and d.status = 'active' and x.redacted_at is null
               order by d.created_at desc limit 1) as content,
             x.redacted_at is not null as redacted,
             coalesce(u.full_name_en, case when u.id is null then c.display_name end) as name_en,
             coalesce(u.full_name_ar, case when u.id is null then c.display_name end) as name_ar,
             x.body, x.details, ${isoOf(sql`x.created_at`)} as created_at, x.created_at as at
      from core.messages x
      left join core.message_contacts c on c.tenant_id = x.tenant_id and c.id = x.author_contact_id
      left join core.users u on u.tenant_id = x.tenant_id and u.id = coalesce(x.author_user_id, c.user_id)
      where x.tenant_id = ${input.tenantId}::uuid and x.thread_id = ${input.threadId}::uuid
        and x.status = 'active' and (${input.internal} or x.kind = 'message')
        and (${input.before}::timestamptz is null or x.created_at < ${input.before}::timestamptz)
      order by x.created_at desc, x.id desc
      limit ${input.limit}) latest
    order by at, id`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    authorId: row.author_id,
    authorContactId: row.author_contact_id,
    authorNameEn: row.name_en,
    authorNameAr: row.name_ar,
    body: row.body,
    content: row.content,
    details: row.details,
    redacted: row.redacted,
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

/** A mailbox's open conversation about a child, such as the attendance office's with a family. */
export async function mailboxThreadAbout(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    mailbox: Mailbox;
    studentId: string;
  },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select id from core.message_threads
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and mailbox = ${input.mailbox} and student_user_id = ${input.studentId}::uuid
      and status = 'active'
    order by created_at limit 1`);
  return row?.id ?? null;
}

/**
 * A new conversation with its members. A person's conversation has its
 * starter as owner; a mailbox's is owned by whoever holds it, or nobody
 * yet, and was begun by a person or, for a visitor's enquiry, by nobody.
 */
export async function createThread(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    kind: ThreadKind;
    mailbox?: Mailbox | null;
    subject: string | null;
    studentId: string | null;
    createdBy: string | null;
    ownerId: string | null;
    memberIds: readonly string[];
    contactIds?: readonly string[];
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.message_threads (tenant_id, org_id, kind, mailbox, subject, student_user_id,
      created_by_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.kind},
            ${input.mailbox ?? null}, ${input.subject}, ${input.studentId}::uuid,
            ${input.createdBy}::uuid)
    returning id`);
  if (!row) throw new Error("thread not written");
  if (input.ownerId)
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
  await addContacts(tx, {
    tenantId: input.tenantId,
    threadId: row.id,
    contactIds: input.contactIds ?? [],
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

/** Outside contacts join a conversation as members, as the person once linked. */
export async function addContacts(
  tx: Tx,
  input: { tenantId: string; threadId: string; contactIds: readonly string[] },
): Promise<void> {
  if (input.contactIds.length === 0) return;
  await tx.execute(sql`
    insert into core.thread_members (tenant_id, thread_id, contact_id, user_id, role)
    select c.tenant_id, ${input.threadId}::uuid, c.id, c.user_id, 'member'
    from core.message_contacts c
    where c.tenant_id = ${input.tenantId}::uuid and c.id = any(${uuidArray(input.contactIds)})
      and c.status = 'active'
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
      and contact_id is null
    returning id`);
  return rows.length;
}

/**
 * Hands a mailbox conversation to someone, or to nobody. The owner before
 * becomes a reader of it like the rest of the team.
 */
export async function setOwner(
  tx: Tx,
  input: { tenantId: string; threadId: string; userId: string | null },
): Promise<void> {
  await tx.execute(sql`
    update core.thread_members set role = 'reader'
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and role = 'owner' and status = 'active' and left_at is null
      and user_id is distinct from ${input.userId}::uuid`);
  if (!input.userId) return;
  const [held] = await tx.execute<{ id: string }>(sql`
    update core.thread_members set role = 'owner'
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.userId}::uuid and role = 'reader'
      and status = 'active' and left_at is null
    returning id`);
  if (!held)
    await addMembers(tx, {
      tenantId: input.tenantId,
      threadId: input.threadId,
      userIds: [input.userId],
      role: "owner",
    });
}

export interface NewEntry {
  id?: string;
  tenantId: string;
  threadId: string;
  kind?: EntryKind;
  authorId: string | null;
  authorContactId?: string | null;
  body: string;
  details?: Record<string, unknown>;
}

/**
 * Adds an entry to a conversation. A message or an entry someone wrote
 * moves the conversation up the inbox; a recorded event does not. Writing
 * reads the conversation up to now for whoever wrote it.
 */
export async function postMessage(
  tx: Tx,
  input: NewEntry,
): Promise<{ id: string; createdAt: string }> {
  const kind = input.kind ?? "message";
  const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
    insert into core.messages (tenant_id, id, thread_id, kind, author_user_id, author_contact_id,
      body, details)
    values (${input.tenantId}::uuid, coalesce(${input.id ?? null}::uuid, uuidv7()),
      ${input.threadId}::uuid, ${kind}, ${input.authorId}::uuid,
      ${input.authorContactId ?? null}::uuid, ${input.body},
      ${JSON.stringify(input.details ?? {})}::text::jsonb)
    returning id, ${isoOf(sql`created_at`)} as created_at`);
  if (!row) throw new Error("message not written");
  if (kind !== "event")
    await tx.execute(sql`
      update core.message_threads set last_message_at = statement_timestamp()
      where tenant_id = ${input.tenantId}::uuid and id = ${input.threadId}::uuid`);
  if (input.authorId)
    await markRead(tx, {
      tenantId: input.tenantId,
      threadId: input.threadId,
      userId: input.authorId,
      clearDraft: true,
    });
  return { id: row.id, createdAt: row.created_at };
}

/**
 * The reader has read the conversation up to now. In a mailbox
 * conversation a team member's first read gives them the row that keeps
 * it, which lets them in to nothing.
 */
export async function markRead(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    userId: string;
    clearDraft?: boolean;
  },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.thread_members
    set last_read_at = statement_timestamp(),
      draft = case when ${input.clearDraft ?? false} then null else draft end
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and left_at is null
    returning id`);
  if (rows.length) return;
  await tx.execute(sql`
    insert into core.thread_members (tenant_id, thread_id, user_id, role, last_read_at)
    select t.tenant_id, t.id, ${input.userId}::uuid, 'reader', statement_timestamp()
    from core.message_threads t
    where t.tenant_id = ${input.tenantId}::uuid and t.id = ${input.threadId}::uuid
      and t.mailbox is not null
    on conflict do nothing`);
}

export async function saveDraft(
  tx: Tx,
  input: { tenantId: string; threadId: string; userId: string; draft: string },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.thread_members set draft = nullif(${input.draft}, '')
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and left_at is null
    returning id`);
  if (rows.length || !input.draft) return;
  await tx.execute(sql`
    insert into core.thread_members (tenant_id, thread_id, user_id, role, draft)
    select t.tenant_id, t.id, ${input.userId}::uuid, 'reader', ${input.draft}
    from core.message_threads t
    where t.tenant_id = ${input.tenantId}::uuid and t.id = ${input.threadId}::uuid
      and t.mailbox is not null
    on conflict do nothing`);
}

/** Unread conversations for the bell and the navigation badge. */
export async function unreadThreads(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    mailboxes?: readonly Mailbox[];
  },
): Promise<number> {
  const reader = { ...input, mailboxes: input.mailboxes ?? [] };
  const [row] = await tx.execute<{ unread: number }>(sql`
    ${reached(reader, "all")}
    select count(*)::int as unread from reached r
    join core.message_threads t on t.tenant_id = ${input.tenantId}::uuid and t.id = r.thread_id
    where exists (select 1 from core.messages x
      where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
        and x.kind <> 'event' and ${visible(sql`r.team`)} and ${notBy(input.viewerId)}
        and ${unreadBy})`);
  return row?.unread ?? 0;
}

/**
 * Whether someone may open what a message carries: a member of its
 * conversation for a message, and the team of its mailbox for anything in
 * a mailbox conversation, internal entries included.
 */
export async function readsMessage(
  tx: Tx,
  input: {
    tenantId: string;
    messageId: string;
    userId: string;
    mailboxes: readonly Mailbox[];
  },
): Promise<boolean> {
  const [row] = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from core.messages x
      join core.message_threads t on t.tenant_id = x.tenant_id and t.id = x.thread_id
      where x.tenant_id = ${input.tenantId}::uuid and x.id = ${input.messageId}::uuid
        and x.status = 'active'
        and (t.mailbox = any(${textArray(input.mailboxes)})
          or (x.kind = 'message' and exists (select 1 from core.thread_members m
            where m.tenant_id = x.tenant_id and m.thread_id = x.thread_id
              and m.user_id = ${input.userId}::uuid and m.status = 'active' and m.left_at is null
              and (t.mailbox is null or m.role = 'member'))))) as ok`);
  return row?.ok ?? false;
}

/** The newest entry of a conversation someone else wrote after the one given, for a reply's guard. */
export async function writtenSince(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    afterId: string | null;
    viewerId: string;
  },
): Promise<{ id: string; kind: EntryKind } | null> {
  const [row] = await tx.execute<{ id: string; kind: EntryKind }>(sql`
    select x.id, x.kind from core.messages x
    where x.tenant_id = ${input.tenantId}::uuid and x.thread_id = ${input.threadId}::uuid
      and x.status = 'active' and x.kind in ('message', 'note', 'held')
      and ${notBy(input.viewerId)}
      and (${input.afterId}::uuid is null or (x.created_at, x.id) > (
        select a.created_at, a.id from core.messages a
        where a.tenant_id = x.tenant_id and a.id = ${input.afterId}::uuid))
    order by x.created_at desc, x.id desc limit 1`);
  return row ?? null;
}

export interface ContactRow {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  locale: "en" | "ar";
  userId: string | null;
}

/**
 * The contact for an address, made the first time someone writes from it
 * and renamed after what they call themselves now. Without an address a
 * family is a contact of its own, reached by phone.
 */
export async function contactFor(
  tx: Tx,
  input: {
    tenantId: string;
    email: string;
    phone: string;
    /** The phone in E.164, read by the caller in the school's country. */
    phoneNormalized: string | null;
    name: string;
    locale: "en" | "ar";
  },
): Promise<ContactRow> {
  const email = input.email.trim().toLowerCase() || null;
  const phone = input.phone.trim() || null;
  const [row] = await tx.execute<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    locale: "en" | "ar";
    user_id: string | null;
  }>(
    email
      ? sql`
    insert into core.message_contacts (tenant_id, email, phone, phone_normalized, display_name, locale)
    values (${input.tenantId}::uuid, ${email}, ${phone}, ${input.phoneNormalized},
      ${input.name}, ${input.locale})
    on conflict (tenant_id, email) where status = 'active' and email is not null
    do update set display_name = excluded.display_name, locale = excluded.locale,
      phone = coalesce(excluded.phone, core.message_contacts.phone),
      phone_normalized = coalesce(excluded.phone_normalized, core.message_contacts.phone_normalized)
    returning id, email, phone, display_name, locale, user_id`
      : sql`
    insert into core.message_contacts (tenant_id, phone, phone_normalized, display_name, locale)
    values (${input.tenantId}::uuid, ${phone}, ${input.phoneNormalized}, ${input.name},
      ${input.locale})
    returning id, email, phone, display_name, locale, user_id`,
  );
  if (!row) throw new Error("contact not written");
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    locale: row.locale,
    userId: row.user_id,
  };
}

/**
 * Hands a person the conversations of the outside contact that writes from
 * their address: the contact is linked to them and they become the member
 * in each of its conversations, so their portal's inbox shows them with
 * every message as it was, nothing copied. Only call this for an address
 * the person has proved they hold; a contact already linked to someone
 * else is left alone. Answers how many conversations the person gained.
 */
export async function linkOutsideParticipant(
  tx: Tx,
  input: { tenantId: string; userId: string; verifiedEmail: string },
): Promise<{ contactId: string | null; conversations: number }> {
  const [contact] = await tx.execute<{ id: string }>(sql`
    update core.message_contacts
    set user_id = ${input.userId}::uuid, linked_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and email = ${input.verifiedEmail.trim().toLowerCase()}
      and (user_id is null or user_id = ${input.userId}::uuid)
    returning id`);
  if (!contact) return { contactId: null, conversations: 0 };
  const rows = await tx.execute<{ id: string }>(sql`
    update core.thread_members m set user_id = ${input.userId}::uuid
    where m.tenant_id = ${input.tenantId}::uuid and m.contact_id = ${contact.id}::uuid
      and m.status = 'active' and m.left_at is null
      and m.user_id is distinct from ${input.userId}::uuid
      and not exists (select 1 from core.thread_members o
        where o.tenant_id = m.tenant_id and o.thread_id = m.thread_id
          and o.user_id = ${input.userId}::uuid and o.status = 'active' and o.left_at is null)
    returning m.id`);
  return { contactId: contact.id, conversations: rows.length };
}

export interface OutsideMember {
  memberId: string;
  contactId: string;
  email: string;
  locale: "en" | "ar";
}

/** The outside contacts of a conversation who are reached by email: none linked to a person yet. */
export async function mailedMembers(
  tx: Tx,
  input: { tenantId: string; threadId: string },
): Promise<OutsideMember[]> {
  const rows = await tx.execute<{
    member_id: string;
    contact_id: string;
    email: string;
    locale: "en" | "ar";
  }>(sql`
    select m.id as member_id, c.id as contact_id, c.email, c.locale
    from core.thread_members m
    join core.message_contacts c on c.tenant_id = m.tenant_id and c.id = m.contact_id
      and c.status = 'active' and c.email is not null and c.user_id is null
    where m.tenant_id = ${input.tenantId}::uuid and m.thread_id = ${input.threadId}::uuid
      and m.status = 'active' and m.left_at is null
    order by m.id`);
  return rows.map((row) => ({
    memberId: row.member_id,
    contactId: row.contact_id,
    email: row.email,
    locale: row.locale,
  }));
}

/** Keeps the digest of a contact's reply token the first time mail carries it. */
export async function keepReplyKey(
  tx: Tx,
  input: { tenantId: string; memberId: string; key: Uint8Array },
): Promise<void> {
  await tx.execute(sql`
    update core.thread_members set reply_key = ${Buffer.from(input.key)}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.memberId}::uuid
      and reply_key is null`);
}

export interface ReplyTarget {
  memberId: string;
  threadId: string;
  orgId: string;
  mailbox: Mailbox | null;
  contactId: string;
  email: string | null;
  linkedUserId: string | null;
}

/** The conversation place a reply token's digest names, if it is still open. */
export async function replyTarget(
  tx: Tx,
  input: { tenantId: string; key: Uint8Array },
): Promise<ReplyTarget | null> {
  const [row] = await tx.execute<{
    member_id: string;
    thread_id: string;
    org_id: string;
    mailbox: Mailbox | null;
    contact_id: string;
    email: string | null;
    user_id: string | null;
  }>(sql`
    select m.id as member_id, t.id as thread_id, t.org_id, t.mailbox, c.id as contact_id,
      c.email, c.user_id
    from core.thread_members m
    join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      and t.status = 'active'
    join core.message_contacts c on c.tenant_id = m.tenant_id and c.id = m.contact_id
      and c.status = 'active'
    where m.tenant_id = ${input.tenantId}::uuid and m.reply_key = ${Buffer.from(input.key)}
      and m.status = 'active' and m.left_at is null`);
  if (!row) return null;
  return {
    memberId: row.member_id,
    threadId: row.thread_id,
    orgId: row.org_id,
    mailbox: row.mailbox,
    contactId: row.contact_id,
    email: row.email,
    linkedUserId: row.user_id,
  };
}

/** How much mail reached a conversation lately, kept or held, to slow down a flood. */
export async function recentMail(
  tx: Tx,
  input: { tenantId: string; threadId: string; since: Date },
): Promise<number> {
  const [row] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from core.messages
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and details ? 'emailId' and created_at > ${input.since.toISOString()}::timestamptz`);
  return row?.n ?? 0;
}

/** Whether mail with this provider id was already taken in. */
export async function mailTaken(
  tx: Tx,
  input: { tenantId: string; emailId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ taken: boolean }>(sql`
    select exists (select 1 from core.messages
      where tenant_id = ${input.tenantId}::uuid and details ->> 'emailId' = ${input.emailId}
        and details ? 'emailId') as taken`);
  return row?.taken ?? false;
}

/** A contact of the school, active or erased. */
export async function contactById(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<(ContactRow & { erased: boolean }) | null> {
  const [row] = await tx.execute<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    locale: "en" | "ar";
    user_id: string | null;
    erased: boolean;
  }>(sql`
    select id, email, phone, display_name, locale, user_id, status = 'tobedeleted' as erased
    from core.message_contacts
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    locale: row.locale,
    userId: row.user_id,
    erased: row.erased,
  };
}

/** Whether a contact is in any of a school's conversations. */
export async function contactOfSchool(
  tx: Tx,
  input: { tenantId: string; schoolId: string; contactId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from core.thread_members m
      join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      where m.tenant_id = ${input.tenantId}::uuid and m.contact_id = ${input.contactId}::uuid
        and t.org_id = ${input.schoolId}::uuid) as ok`);
  return row?.ok ?? false;
}

/**
 * A family's conversation with a team: the one the enquiry it applied from
 * brought, or else the newest of the mailbox's they are in.
 */
export async function familyConversation(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    mailbox: Mailbox;
    userId: string;
    enquiryId: string | null;
  },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select coalesce(
      (select e.thread_id from core.site_enquiries e
        where e.tenant_id = ${input.tenantId}::uuid and e.id = ${input.enquiryId}::uuid
          and e.status = 'active' and e.thread_id is not null),
      (select t.id from core.message_threads t
        join core.thread_members m on m.tenant_id = t.tenant_id and m.thread_id = t.id
          and m.user_id = ${input.userId}::uuid and m.role = 'member' and m.status = 'active'
          and m.left_at is null
        where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
          and t.mailbox = ${input.mailbox} and t.status = 'active'
        order by t.last_message_at desc limit 1)) as id`);
  return row?.id ?? null;
}
