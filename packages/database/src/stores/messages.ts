import type {
  InboxBox,
  RecipientCursor,
  StartKind,
} from "@faridalms/domain/messages";
import type { Keyset } from "@faridalms/domain/paging";
import type { SQL } from "drizzle-orm";

import { feedOf } from "@faridalms/domain/paging";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  EntryKind,
  Mailbox,
  ThreadKind,
  ThreadRole,
} from "../tables/messaging";
import type { Unreachable } from "./notifications";
import type { Scope } from "./students";

import { holds, isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

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

const OFFICE_ROLES = sql`('principal', 'site_administrator', 'staff', 'counselor')`;

/**
 * Everyone the viewer may write to. Staff reach the school's staff and the
 * students they reach with those students' guardians; a guardian reaches
 * the teachers of their children's classes and the office; a student
 * reaches their own teachers. Guardians without portal access, or kept
 * apart from the school's messages, are never offered.
 */
function reachable(reach: Scope): SQL {
  return sql`
    with viewer as (
      select app.is_staff(${reach.viewerId}::uuid, ${reach.schoolId}::uuid, ${reach.today}::date) as staff
    ), students as (
      select student_user_id as user_id
      from app.visible_students(${reach.viewerId}::uuid, ${reach.schoolId}::uuid, ${reach.today}::date, ${reach.schoolWide})
      where (select staff from viewer)
    ), children as (
      select l.student_user_id as user_id from core.user_relationships l
      where l.tenant_id = ${reach.tenantId}::uuid and l.related_user_id = ${reach.viewerId}::uuid
        and app.guardian_permits(l, ${reach.today}::date, 'contact')
    ), learners as (
      select ${reach.viewerId}::uuid as user_id
      where exists (select 1 from core.enrollments e
        where e.tenant_id = ${reach.tenantId}::uuid and e.user_id = ${reach.viewerId}::uuid
          and e.role = 'student' and e.status = 'active' and e.valid_during @> ${reach.today}::date)
      union
      select user_id from children
    ), their_classes as (
      select c.id from core.enrollments e
      join core.classes k on k.tenant_id = e.tenant_id and k.id = e.class_id
      join core.classes c on c.tenant_id = k.tenant_id
        and (c.id = k.id or c.homeroom_class_id = k.id) and c.status = 'active'
      where e.tenant_id = ${reach.tenantId}::uuid and e.role = 'student' and e.status = 'active'
        and e.valid_during @> ${reach.today}::date and e.user_id in (select user_id from learners)
    ), candidates(user_id, kind) as (
      select r.user_id, 'staff' from core.user_roles r
      where (select staff from viewer) and r.tenant_id = ${reach.tenantId}::uuid
        and r.org_id = ${reach.schoolId}::uuid and r.status = 'active'
        and r.valid_during @> ${reach.today}::date and r.role = any (app.staff_roles())
      union
      select s.user_id, 'student' from students s
      union
      select l.related_user_id, 'guardian' from core.user_relationships l
      where l.tenant_id = ${reach.tenantId}::uuid and app.guardian_permits(l, ${reach.today}::date, 'contact')
        and l.student_user_id in (select user_id from students)
      union
      select e.user_id, 'staff' from core.enrollments e
      where e.tenant_id = ${reach.tenantId}::uuid and e.role in ('teacher', 'aide')
        and e.status = 'active' and e.valid_during @> ${reach.today}::date
        and e.class_id in (select id from their_classes)
      union
      select r.user_id, 'staff' from core.user_roles r
      where exists (select 1 from children) and r.tenant_id = ${reach.tenantId}::uuid
        and r.org_id = ${reach.schoolId}::uuid and r.status = 'active'
        and r.valid_during @> ${reach.today}::date and r.role in ${OFFICE_ROLES}
    )
    select distinct on (c.user_id) c.user_id, c.kind from candidates c
    where c.user_id <> ${reach.viewerId}::uuid
    order by c.user_id, case c.kind when 'staff' then 0 when 'guardian' then 1 else 2 end`;
}

/**
 * A page of the people the viewer may write to, matching a name or, for a
 * guardian, a child's name: staff, then guardians, then students, each by
 * name, and where the next page starts when there is one.
 */
export async function messageable(
  tx: Tx,
  reach: Scope,
  filter: {
    q: string;
    limit: number;
    after: RecipientCursor | null;
    among?: "all" | "people" | "students";
    /** Only these people, as a draft names them. */
    ids?: readonly string[];
  },
): Promise<{ rows: Messageable[]; next: RecipientCursor | null }> {
  const after = filter.after;
  const only = filter.ids ? uuidArray(filter.ids) : null;
  const rows = await tx.execute<{
    user_id: string;
    kind: PersonKind;
    rank: number;
    sort_name: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    children: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
    }[];
  }>(sql`
    with people as (${reachable(reach)}), ranked as (
      select p.user_id, p.kind, u.tenant_id, u.full_name_en, u.full_name_ar,
             case p.kind when 'staff' then 0 when 'guardian' then 1 else 2 end as rank,
             coalesce(u.full_name_en, '') as sort_name
      from people p
      join core.users u on u.tenant_id = ${reach.tenantId}::uuid and u.id = p.user_id and u.status = 'active'
      where ${only === null ? sql`true` : sql`p.user_id = any(${only})`}
        and (${filter.among ?? "all"} = 'all'
          or (p.kind = 'student') = (${filter.among ?? "all"} = 'students'))
        and (${holds(filter.q, [sql`u.full_name_en`, sql`u.full_name_ar`])}
             or exists (select 1 from core.user_relationships l
               join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
               where p.kind = 'guardian' and l.tenant_id = u.tenant_id and l.related_user_id = u.id
                 and l.status = 'active' and (${holds(filter.q, [sql`s.full_name_en`, sql`s.full_name_ar`])})))
    )
    select r.user_id, r.kind, r.rank, r.sort_name, r.full_name_en, r.full_name_ar,
           coalesce((select jsonb_agg(jsonb_build_object('user_id', s.id,
               'full_name_en', s.full_name_en, 'full_name_ar', s.full_name_ar)
               order by s.full_name_en)
             from core.user_relationships l
             join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
             where r.kind = 'guardian' and l.tenant_id = r.tenant_id and l.related_user_id = r.user_id
               and l.status = 'active' and l.valid_during @> ${reach.today}::date), '[]'::jsonb) as children
    from ranked r
    where ${after === null}::boolean
      or (r.rank, r.sort_name, r.user_id) > (${after?.rank ?? 0}::int, ${after?.name ?? ""}::text,
        ${after?.id ?? null}::uuid)
    order by r.rank, r.sort_name, r.user_id
    limit ${filter.limit + 1}`);
  const feed = feedOf(rows, filter.limit, (row) => ({
    rank: row.rank,
    name: row.sort_name,
    id: row.user_id,
  }));
  return {
    rows: feed.rows.map((row) => ({
      userId: row.user_id,
      kind: row.kind,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      children: row.children.map((child) => ({
        userId: child.user_id,
        fullNameEn: child.full_name_en,
        fullNameAr: child.full_name_ar,
      })),
    })),
    next: feed.next,
  };
}

/**
 * The children a guardian may write to the school about: those they are
 * linked to with portal access and not kept apart from its messages.
 */
export async function messagingChildren(
  tx: Tx,
  input: { tenantId: string; viewerId: string; on: string },
): Promise<
  { userId: string; fullNameEn: string | null; fullNameAr: string | null }[]
> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct s.id as user_id, s.full_name_en, s.full_name_ar
    from core.user_relationships l
    join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id and s.status = 'active'
    where l.tenant_id = ${input.tenantId}::uuid and l.related_user_id = ${input.viewerId}::uuid
      and app.guardian_permits(l, ${input.on}::date, 'contact')
    order by s.full_name_en, s.id`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}

/** Which of these people the viewer may not write to. */
export async function unreachable(
  tx: Tx,
  reach: Scope,
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
      and app.guardian_permits(l, ${input.on}::date, 'contact')
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
      and app.guardian_permits(l, ${input.on}::date, 'notice')
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
  /** The messages the viewer reads in it, internal entries too for the team. */
  messageCount: number;
  /** Whether anything the viewer reads in it carries a file. */
  hasFiles: boolean;
  /** Whether the viewer is writing a reply to it. */
  hasDraft: boolean;
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

/**
 * A page of the viewer's conversations, newest first, unread ones only
 * when asked, and where the next page starts when there is one.
 * Conversations move as they are written to, so the order is the latest
 * entry's millisecond, then the id.
 */
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
    after?: Keyset | null;
  },
): Promise<{ rows: ThreadSummary[]; next: Keyset | null }> {
  const reader = { ...input, mailboxes: input.mailboxes ?? [] };
  const after = input.after ?? null;
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
    message_count: number;
    has_files: boolean;
    has_draft: boolean;
    others: NamedRecord[];
    owner: NamedRecord | null;
  }>(sql`
    ${reached(reader, input.box ?? "all")}
    select t.id, t.kind, t.mailbox, t.subject, t.student_user_id, s.full_name_en as student_en,
           s.full_name_ar as student_ar, ${isoOf(sql`t.last_message_at`)} as last_message_at,
           last.body as last_body, last.kind as last_kind, last.author_id as last_author_id,
           last.name_en as last_author_en, last.name_ar as last_author_ar,
           counted.unread, counted.message_count, counted.has_files,
           exists (select 1 from core.message_drafts d
             where d.tenant_id = t.tenant_id and d.thread_id = t.id
               and d.user_id = ${input.viewerId}::uuid and d.status = 'active') as has_draft,
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
    cross join lateral (
      select count(*) filter (where ${notBy(input.viewerId)} and ${unreadBy})::int as unread,
        count(*)::int as message_count,
        coalesce(bool_or(exists (select 1 from core.files f
          where f.tenant_id = x.tenant_id and f.host_type = 'message' and f.host_id = x.id
            and f.status = 'active')), false) as has_files
      from core.messages x
      where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
        and x.kind <> 'event' and ${visible(sql`r.team`)}) counted
    -- A family sees a team's conversation with them once it holds a word for them.
    where (r.team or t.mailbox is null or last.kind is not null)
      and (not ${input.unreadOnly} or counted.unread > 0)
      and (${after === null}::boolean
        or date_trunc('milliseconds', t.last_message_at) < ${after?.at ?? null}::timestamptz
        or (date_trunc('milliseconds', t.last_message_at) = ${after?.at ?? null}::timestamptz
          and t.id > ${after?.id ?? null}::uuid))
      and (${holds(input.q, [sql`t.subject`, sql`s.full_name_en`, sql`s.full_name_ar`])}
           or exists (select 1 from core.thread_members o
             left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
             left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
             where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
               and (${holds(input.q, [sql`u.full_name_en`, sql`u.full_name_ar`, sql`c.display_name`, sql`c.email`])}))
           or exists (select 1 from core.messages x
             where x.tenant_id = t.tenant_id and x.thread_id = t.id and x.status = 'active'
               and ${visible(sql`r.team`)} and ${holds(input.q, [sql`x.body`])}))
    order by date_trunc('milliseconds', t.last_message_at) desc, t.id
    limit ${input.limit + 1}`);
  const feed = feedOf(rows, input.limit, (row) => ({
    at: row.last_message_at,
    id: row.id,
  }));
  return {
    rows: feed.rows.map((row) => ({
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
      messageCount: row.message_count,
      hasFiles: row.has_files,
      hasDraft: row.has_draft,
      others: row.others.map(named),
      owner: row.owner ? named(row.owner) : null,
    })),
    next: feed.next,
  };
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
  /** A contact's address, which only the team that shares the mailbox reads. */
  email: string | null;
  /** Why mail no longer reaches a contact's address, if it does not. */
  unreachable: Unreachable | null;
  /** The other addresses of a contact's family, merged into it. */
  aliases: string[];
}

/** Why mail no longer reaches contact `c`, the worse reason first. */
const unreachableOf = sql`case when c.complaint_at is not null then 'complained'
  when c.bounced_at is not null then 'bounced' end`;

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
    unreachable: Unreachable | null;
    aliases: string[];
  }>(sql`
    select m.id, m.user_id, m.contact_id,
           coalesce(u.full_name_en, case when u.id is null then c.display_name end) as full_name_en,
           coalesce(u.full_name_ar, case when u.id is null then c.display_name end) as full_name_ar,
           c.email, m.role, ${isoOf(sql`m.last_read_at`)} as last_read_at,
           ${unreachableOf} as unreachable,
           array(select a.email from core.message_contacts a
             where a.tenant_id = m.tenant_id and a.merged_into_id = m.contact_id
               and a.status = 'active' and a.email is not null order by a.email) as aliases
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
    unreachable: row.unreachable,
    aliases: row.aliases,
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
 * The latest entries of a thread, oldest first, or when paging back those
 * before the entry given. Internal entries only when the reader is of the
 * team.
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
        and (${input.before}::uuid is null or (x.created_at, x.id) < (
          select b.created_at, b.id from core.messages b
          where b.tenant_id = x.tenant_id and b.thread_id = x.thread_id and b.id = ${input.before}::uuid))
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
 * A direct conversation about one child is not the one about another.
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
      and t.student_user_id is not distinct from ${input.studentId}::uuid
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
 * reads the conversation up to now for whoever wrote it, and what they
 * were writing to it is sent, so their draft of it goes.
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
  if (input.authorId) {
    await markRead(tx, {
      tenantId: input.tenantId,
      threadId: input.threadId,
      userId: input.authorId,
    });
    await dropDrafts(
      tx,
      input.tenantId,
      sql`thread_id = ${input.threadId}::uuid and user_id = ${input.authorId}::uuid`,
    );
  }
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
  },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.thread_members set last_read_at = statement_timestamp()
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

export interface DraftRow {
  id: string;
  version: number;
  /** The conversation it replies to; null for the first message of one. */
  threadId: string | null;
  kind: StartKind | null;
  recipientIds: string[];
  studentId: string | null;
  subject: string | null;
  body: string;
  /** Its document; null until its first words are kept. */
  content: Record<string, unknown> | null;
  updatedAt: string;
}

type DraftRecord = {
  id: string;
  version: number;
  thread_id: string | null;
  kind: StartKind | null;
  recipient_ids: string[];
  student_user_id: string | null;
  subject: string | null;
  body: string;
  content: Record<string, unknown> | null;
  updated_at: string;
};

const draftOfRecord = (row: DraftRecord): DraftRow => ({
  id: row.id,
  version: row.version,
  threadId: row.thread_id,
  kind: row.kind,
  recipientIds: row.recipient_ids,
  studentId: row.student_user_id,
  subject: row.subject,
  body: row.body,
  content: row.content,
  updatedAt: row.updated_at,
});

/** A draft of the writer's at this school, by its id or as their reply to a conversation. */
export async function draftOf(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    userId: string;
    id?: string;
    threadId?: string;
  },
): Promise<DraftRow | null> {
  const [row] = await tx.execute<DraftRecord>(sql`
    select d.id, d.version, d.thread_id, d.kind, d.recipient_ids, d.student_user_id, d.subject,
           d.body, ${isoOf(sql`d.date_last_modified`)} as updated_at,
           (select x.content from core.documents x
             where x.tenant_id = d.tenant_id and x.host_type = 'message_draft' and x.host_id = d.id
               and x.status = 'active'
             order by x.created_at desc limit 1) as content
    from core.message_drafts d
    where d.tenant_id = ${input.tenantId}::uuid and d.org_id = ${input.schoolId}::uuid
      and d.user_id = ${input.userId}::uuid and d.status = 'active'
      and (${input.id ?? null}::uuid is null or d.id = ${input.id ?? null}::uuid)
      and (${input.threadId ?? null}::uuid is null or d.thread_id = ${input.threadId ?? null}::uuid)
    limit 1`);
  return row ? draftOfRecord(row) : null;
}

/**
 * Keeps what someone is writing: a new draft when no id is given, or the
 * draft named at the version they read. Null when that version moved on,
 * the draft was sent, or a reply to the conversation is already kept.
 */
export async function keepDraft(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    userId: string;
    id: string | null;
    version: number;
    threadId: string | null;
    kind: StartKind | null;
    recipientIds: readonly string[];
    studentId: string | null;
    subject: string | null;
    body: string;
  },
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(
    input.id
      ? sql`
    update core.message_drafts
    set recipient_ids = ${uuidArray(input.recipientIds)}, kind = ${input.kind},
      student_user_id = ${input.studentId}::uuid, subject = ${input.subject},
      body = ${input.body}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and org_id = ${input.schoolId}::uuid and user_id = ${input.userId}::uuid
      and thread_id is not distinct from ${input.threadId}::uuid
      and status = 'active' and version = ${input.version}
    returning id, version`
      : sql`
    insert into core.message_drafts (tenant_id, org_id, user_id, thread_id, kind, recipient_ids,
      student_user_id, subject, body)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.userId}::uuid,
      ${input.threadId}::uuid, ${input.kind}, ${uuidArray(input.recipientIds)},
      ${input.studentId}::uuid, ${input.subject}, ${input.body})
    on conflict (tenant_id, thread_id, user_id) where status = 'active' and thread_id is not null
    do nothing
    returning id, version`,
  );
  return row ?? null;
}

/**
 * Tombstones the drafts a condition names, with their documents, so
 * nothing of them is shown again. The files they held go where the
 * message took them, or with the document.
 */
async function dropDrafts(tx: Tx, tenantId: string, which: SQL) {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.message_drafts set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and status = 'active' and ${which}
    returning id`);
  if (rows.length === 0) return;
  const ids = uuidArray(rows.map((row) => row.id));
  await tx.execute(sql`
    update core.document_files l set status = 'tobedeleted'
    from core.documents d
    where l.tenant_id = ${tenantId}::uuid and l.status = 'active' and d.tenant_id = l.tenant_id
      and d.id = l.document_id and d.host_type = 'message_draft' and d.host_id = any(${ids})`);
  await tx.execute(sql`
    update core.documents set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and host_type = 'message_draft' and host_id = any(${ids})
      and status = 'active'`);
}

/**
 * Lets go of a draft at the version its writer read, as sending it or
 * deleting it does. False when it moved on since or was already sent.
 */
export async function consumeDraft(
  tx: Tx,
  input: { tenantId: string; userId: string; id: string; version: number },
): Promise<boolean> {
  const [held] = await tx.execute<{ id: string }>(sql`
    select id from core.message_drafts
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and version = ${input.version}
    for update`);
  if (!held) return false;
  await dropDrafts(tx, input.tenantId, sql`id = ${input.id}::uuid`);
  return true;
}

export interface DraftSummary {
  id: string;
  version: number;
  threadId: string | null;
  kind: StartKind | null;
  subject: string | null;
  body: string;
  updatedAt: string;
  studentNameEn: string | null;
  studentNameAr: string | null;
  hasFiles: boolean;
  /** Whom it is for: the people picked, or everyone else in the conversation it replies to. */
  to: Named[];
}

/**
 * A page of the writer's drafts at this school, last kept first, and
 * where the next page starts when there is one. A reply to a conversation
 * they no longer reach is not listed.
 */
export async function draftsOf(
  tx: Tx,
  reader: Reader & { limit: number; after: Keyset | null },
): Promise<{ rows: DraftSummary[]; next: Keyset | null }> {
  const after = reader.after;
  const rows = await tx.execute<{
    id: string;
    version: number;
    thread_id: string | null;
    kind: StartKind | null;
    subject: string | null;
    body: string;
    updated_at: string;
    student_en: string | null;
    student_ar: string | null;
    has_files: boolean;
    to: NamedRecord[];
  }>(sql`
    ${reached(reader, "all")}
    select d.id, d.version, d.thread_id, d.kind, coalesce(d.subject, t.subject) as subject, d.body,
           ${isoOf(sql`d.date_last_modified`)} as updated_at,
           s.full_name_en as student_en, s.full_name_ar as student_ar,
           exists (select 1 from core.files f
             where f.tenant_id = d.tenant_id and f.host_type = 'message_draft' and f.host_id = d.id
               and f.status = 'active') as has_files,
           case when d.thread_id is null then
             coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id, 'contact_id', null,
                 'full_name_en', u.full_name_en, 'full_name_ar', u.full_name_ar) order by p.ord)
               from unnest(d.recipient_ids) with ordinality as p(user_id, ord)
               join core.users u on u.tenant_id = d.tenant_id and u.id = p.user_id), '[]'::jsonb)
           else
             coalesce((select jsonb_agg(jsonb_build_object(${memberNames})
                 order by o.role, coalesce(u.full_name_en, c.display_name))
               from core.thread_members o
               left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
               left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
               where o.tenant_id = d.tenant_id and o.thread_id = d.thread_id and o.status = 'active'
                 and o.left_at is null and o.user_id is distinct from ${reader.viewerId}::uuid
                 and (t.mailbox is null or o.role <> 'reader')), '[]'::jsonb)
           end as to
    from core.message_drafts d
    left join core.message_threads t on t.tenant_id = d.tenant_id and t.id = d.thread_id
    left join core.users s on s.tenant_id = d.tenant_id
      and s.id = coalesce(d.student_user_id, t.student_user_id)
    where d.tenant_id = ${reader.tenantId}::uuid and d.org_id = ${reader.schoolId}::uuid
      and d.user_id = ${reader.viewerId}::uuid and d.status = 'active'
      and (d.thread_id is null or d.thread_id in (select thread_id from reached))
      and (${after === null}::boolean
        or date_trunc('milliseconds', d.date_last_modified) < ${after?.at ?? null}::timestamptz
        or (date_trunc('milliseconds', d.date_last_modified) = ${after?.at ?? null}::timestamptz
          and d.id > ${after?.id ?? null}::uuid))
    order by date_trunc('milliseconds', d.date_last_modified) desc, d.id
    limit ${reader.limit + 1}`);
  const feed = feedOf(rows, reader.limit, (row) => ({
    at: row.updated_at,
    id: row.id,
  }));
  return {
    rows: feed.rows.map((row) => ({
      id: row.id,
      version: row.version,
      threadId: row.thread_id,
      kind: row.kind,
      subject: row.subject,
      body: row.body,
      updatedAt: row.updated_at,
      studentNameEn: row.student_en,
      studentNameAr: row.student_ar,
      hasFiles: row.has_files,
      to: row.to.map(named),
    })),
    next: feed.next,
  };
}

/** Unread conversations, for the Messages count in navigation and the home pages. */
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
 * family is a contact of its own, reached by phone. An address merged into
 * another contact finds the contact it was merged into.
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
  type Row = {
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    locale: "en" | "ar";
    user_id: string | null;
    merged_into_id: string | null;
  };
  const [written] = await tx.execute<Row>(
    email
      ? sql`
    insert into core.message_contacts (tenant_id, email, phone, phone_normalized, display_name, locale)
    values (${input.tenantId}::uuid, ${email}, ${phone}, ${input.phoneNormalized},
      ${input.name}, ${input.locale})
    on conflict (tenant_id, email) where status = 'active' and email is not null
    do update set display_name = excluded.display_name, locale = excluded.locale,
      phone = coalesce(excluded.phone, core.message_contacts.phone),
      phone_normalized = coalesce(excluded.phone_normalized, core.message_contacts.phone_normalized)
    returning id, email, phone, display_name, locale, user_id, merged_into_id`
      : sql`
    insert into core.message_contacts (tenant_id, phone, phone_normalized, display_name, locale)
    values (${input.tenantId}::uuid, ${phone}, ${input.phoneNormalized}, ${input.name},
      ${input.locale})
    returning id, email, phone, display_name, locale, user_id, merged_into_id`,
  );
  const [row] = written?.merged_into_id
    ? await tx.execute<Row>(sql`
        select id, email, phone, display_name, locale, user_id, merged_into_id
        from core.message_contacts
        where tenant_id = ${input.tenantId}::uuid and id = ${written.merged_into_id}::uuid`)
    : [written];
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
  const [found] = await tx.execute<{
    id: string;
    merged_into_id: string | null;
  }>(sql`
    update core.message_contacts
    set user_id = ${input.userId}::uuid, linked_at = coalesce(linked_at, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and email = ${input.verifiedEmail.trim().toLowerCase()}
      and (user_id is null or user_id = ${input.userId}::uuid)
    returning id, merged_into_id`);
  if (!found) return { contactId: null, conversations: 0 };
  // An address merged into another contact is that contact's, whose
  // conversations it holds; it is linked too unless someone else holds it.
  const [contact] = found.merged_into_id
    ? await tx.execute<{ id: string }>(sql`
        update core.message_contacts
        set user_id = ${input.userId}::uuid, linked_at = coalesce(linked_at, statement_timestamp())
        where tenant_id = ${input.tenantId}::uuid and id = ${found.merged_into_id}::uuid
          and status = 'active' and (user_id is null or user_id = ${input.userId}::uuid)
        returning id`)
    : [found];
  if (!contact) return { contactId: found.id, conversations: 0 };
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
  unreachable: Unreachable | null;
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
    unreachable: Unreachable | null;
  }>(sql`
    select m.id as member_id, c.id as contact_id, c.email, c.locale, ${unreachableOf} as unreachable
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
    unreachable: row.unreachable,
  }));
}

/**
 * Mail came from a contact's address and passed its checks, so the
 * address takes mail again after a bounce. A complaint stays: the family
 * asked for no more of it.
 */
export async function clearBounce(
  tx: Tx,
  input: { tenantId: string; contactId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.message_contacts set bounced_at = null
    where tenant_id = ${input.tenantId}::uuid and id = ${input.contactId}::uuid
      and bounced_at is not null`);
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
  /** Every address the contact writes from: its own and those merged into it. */
  addresses: string[];
  linkedUserId: string | null;
}

/**
 * The conversation place a reply token's digest names, if it is still
 * open. A contact merged into another left its place where the other was
 * already in the conversation, so its token answers for the kept one.
 */
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
    addresses: string[];
    user_id: string | null;
  }>(sql`
    select coalesce(o.id, m.id) as member_id, t.id as thread_id, t.org_id, t.mailbox,
      c.id as contact_id, c.email, c.user_id,
      array(select a.email from core.message_contacts a
        where a.tenant_id = c.tenant_id and a.status = 'active' and a.email is not null
          and (a.id = c.id or a.merged_into_id = c.id)
        order by a.email) as addresses
    from core.thread_members m
    join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      and t.status = 'active'
    join core.message_contacts c on c.tenant_id = m.tenant_id and c.id = m.contact_id
      and c.status = 'active'
    left join core.thread_members o on o.tenant_id = m.tenant_id and o.thread_id = m.thread_id
      and o.contact_id = m.contact_id and o.status = 'active' and o.left_at is null
      and m.left_at is not null
    where m.tenant_id = ${input.tenantId}::uuid and m.reply_key = ${Buffer.from(input.key)}
      and m.status = 'active' and (m.left_at is null or o.id is not null)`);
  if (!row) return null;
  return {
    memberId: row.member_id,
    threadId: row.thread_id,
    orgId: row.org_id,
    mailbox: row.mailbox,
    contactId: row.contact_id,
    email: row.email,
    addresses: row.addresses,
    linkedUserId: row.user_id,
  };
}

export interface ContactSummary {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  linked: boolean;
  /** Addresses merged into it, which still find it. */
  aliases: string[];
  conversations: number;
}

/**
 * Outside contacts in a school's conversations of these mailboxes, by
 * name, address or number, or only those named; a contact merged into
 * another is found as the one it was merged into.
 */
export async function mailboxContacts(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    mailboxes: readonly Mailbox[];
    q: string;
    ids?: readonly string[];
    limit: number;
  },
): Promise<ContactSummary[]> {
  if (input.mailboxes.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    linked: boolean;
    aliases: string[];
    conversations: number;
  }>(sql`
    select c.id, c.display_name, c.email, c.phone, c.user_id is not null as linked,
      array(select a.email from core.message_contacts a
        where a.tenant_id = c.tenant_id and a.merged_into_id = c.id and a.status = 'active'
          and a.email is not null order by a.email) as aliases,
      count(distinct t.id)::int as conversations
    from core.message_contacts c
    join core.thread_members m on m.tenant_id = c.tenant_id and m.contact_id = c.id
      and m.status = 'active' and m.left_at is null
    join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      and t.status = 'active' and t.org_id = ${input.schoolId}::uuid
      and t.mailbox = any(${textArray(input.mailboxes)})
    where c.tenant_id = ${input.tenantId}::uuid and c.status = 'active' and c.merged_into_id is null
      and ${input.ids ? sql`c.id = any(${uuidArray(input.ids)})` : sql`true`}
      and (${holds(input.q, [sql`c.display_name`, sql`c.email`, sql`c.phone`])}
        or exists (select 1 from core.message_contacts a
          where a.tenant_id = c.tenant_id and a.merged_into_id = c.id
            and ${holds(input.q, [sql`a.email`, sql`a.phone`])}))
    group by c.tenant_id, c.id
    order by c.display_name, c.id
    limit ${input.limit}`);
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    linked: row.linked,
    aliases: row.aliases,
    conversations: row.conversations,
  }));
}

export type MergeRefusal = "same" | "gone" | "merged" | "linked_apart";

/**
 * Makes two contacts of one family one: `from`, written from another
 * address, is merged into `into`, which is kept. Every conversation
 * `from` was in and everything it wrote becomes `into`'s, in place, so
 * each conversation reads as it did; where both were in one conversation,
 * `from`'s place there is left, and its reply token still answers for
 * `into`. `from` stays, naming `into`, so its address keeps finding the
 * family, and a contact merged into `from` before follows it. A person
 * linked to either becomes linked to both; two different people refuse.
 */
export async function mergeContacts(
  tx: Tx,
  input: { tenantId: string; fromId: string; intoId: string },
): Promise<
  | { merged: false; reason: MergeRefusal }
  | {
      merged: true;
      conversations: number;
      entries: number;
      from: { email: string | null; phone: string | null };
    }
> {
  if (input.fromId === input.intoId) return { merged: false, reason: "same" };
  const t = input.tenantId;
  const rows = await tx.execute<{
    id: string;
    email: string | null;
    phone: string | null;
    user_id: string | null;
    linked_at: string | null;
    merged_into_id: string | null;
  }>(sql`
    select id, email, phone, user_id, linked_at::text as linked_at, merged_into_id
    from core.message_contacts
    where tenant_id = ${t}::uuid and id in (${input.fromId}::uuid, ${input.intoId}::uuid)
      and status = 'active'
    order by id
    for update`);
  const from = rows.find((row) => row.id === input.fromId);
  const into = rows.find((row) => row.id === input.intoId);
  if (!from || !into) return { merged: false, reason: "gone" };
  if (from.merged_into_id || into.merged_into_id)
    return { merged: false, reason: "merged" };
  if (from.user_id && into.user_id && from.user_id !== into.user_id)
    return { merged: false, reason: "linked_apart" };
  const userId = into.user_id ?? from.user_id;
  if (userId)
    await tx.execute(sql`
      update core.message_contacts
      set user_id = ${userId}::uuid, linked_at = coalesce(linked_at, statement_timestamp())
      where tenant_id = ${t}::uuid
        and (id in (${input.fromId}::uuid, ${input.intoId}::uuid) or merged_into_id = ${input.fromId}::uuid)
        and user_id is null`);
  await tx.execute(sql`
    update core.message_contacts
    set merged_into_id = ${input.intoId}::uuid, merged_at = statement_timestamp()
    where tenant_id = ${t}::uuid
      and (id = ${input.fromId}::uuid or merged_into_id = ${input.fromId}::uuid)`);
  // Where both are in one conversation, from's place is left before it
  // names into, so the two never hold one open place.
  const shared = await tx.execute<{ thread_id: string }>(sql`
    update core.thread_members m
    set left_at = statement_timestamp(), contact_id = ${input.intoId}::uuid
    where m.tenant_id = ${t}::uuid and m.contact_id = ${input.fromId}::uuid
      and m.status = 'active' and m.left_at is null
      and exists (select 1 from core.thread_members o
        where o.tenant_id = m.tenant_id and o.thread_id = m.thread_id
          and o.contact_id = ${input.intoId}::uuid and o.status = 'active' and o.left_at is null)
    returning m.thread_id`);
  const moved = await tx.execute<{ thread_id: string }>(sql`
    update core.thread_members m
    set contact_id = ${input.intoId}::uuid,
      user_id = case
        when m.user_id is not null or ${userId}::uuid is null then m.user_id
        when exists (select 1 from core.thread_members o
          where o.tenant_id = m.tenant_id and o.thread_id = m.thread_id
            and o.user_id = ${userId}::uuid and o.status = 'active' and o.left_at is null)
          then null
        else ${userId}::uuid end
    where m.tenant_id = ${t}::uuid and m.contact_id = ${input.fromId}::uuid
    returning m.thread_id`);
  const entries = await tx.execute<{ id: string }>(sql`
    update core.messages set author_contact_id = ${input.intoId}::uuid
    where tenant_id = ${t}::uuid and author_contact_id = ${input.fromId}::uuid
    returning id`);
  return {
    merged: true,
    conversations: new Set([...shared, ...moved].map((row) => row.thread_id))
      .size,
    entries: entries.length,
    from: { email: from.email, phone: from.phone },
  };
}

export interface HeldMail {
  id: string;
  /** The address it came from, as the receiving route read it. */
  from: string;
  body: string;
  content: Record<string, unknown> | null;
}

/**
 * Takes mail held back from a conversation to let it in, once: the held
 * entry records the message it became and who let it in, and is read
 * under a lock so two people accepting it at once make one message. Null
 * when it is not held mail of this conversation, was emptied by an
 * erasure, or was let in already.
 */
export async function takeHeld(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    id: string;
    acceptedAs: string;
    acceptedBy: string;
  },
): Promise<HeldMail | null> {
  const [row] = await tx.execute<{
    id: string;
    details: Record<string, unknown>;
    body: string;
  }>(sql`
    select id, details, body from core.messages
    where tenant_id = ${input.tenantId}::uuid and thread_id = ${input.threadId}::uuid
      and id = ${input.id}::uuid and kind = 'held' and status = 'active'
      and redacted_at is null and not details ? 'acceptedAs'
    for update`);
  if (!row) return null;
  await tx.execute(sql`
    update core.messages
    set details = details || jsonb_build_object('acceptedAs', ${input.acceptedAs}::text,
      'acceptedBy', ${input.acceptedBy}::text)
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  const [document] = await tx.execute<{
    content: Record<string, unknown>;
  }>(sql`
    select content from core.documents
    where tenant_id = ${input.tenantId}::uuid and host_type = 'message' and host_id = ${input.id}::uuid
      and status = 'active'
    order by created_at desc limit 1`);
  return {
    id: row.id,
    from: typeof row.details.from === "string" ? row.details.from : "",
    body: row.body,
    content: document?.content ?? null,
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
