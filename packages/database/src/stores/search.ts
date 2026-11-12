import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Reach } from "./audiences";
import type { Scope } from "./students";

import { reaches } from "./audiences";
import { publishedText } from "./broadcasts";
import { taughtClasses } from "./classes";
import { reachedBy } from "./learning";
import { liveSql, scheduledSql } from "./publication";
import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Candidate {
  type: string;
  id: string;
  rank: number;
}

/**
 * Index hits for a query, best first, among the ids `within` gives: the
 * kind's own reading rule, so a narrow viewer's hits are ranked and limited
 * among what they may open rather than lost behind the school's. Every
 * caller still joins them back through that rule before showing any.
 */
export async function candidates(
  tx: Tx,
  input: {
    q: string;
    types: readonly string[];
    orgScope: readonly string[];
    after: { rank: number; id: string } | null;
    max: number;
    /** A class running on this day ranks first. */
    preferOn?: string | null;
    within: SQL;
  },
): Promise<Candidate[]> {
  const rows = await tx.execute<{
    result_type: string;
    result_id: string;
    rank: number;
  }>(sql`
    select result_type, result_id, rank
    from app.search(${input.q}, ${textArray(input.types)}, ${uuidArray(input.orgScope)},
      ${input.after?.rank ?? null}::real, ${input.after?.id ?? null}::uuid, ${input.max},
      ${input.preferOn ?? null}::date, array${input.within})`);
  return rows.map((row) => ({
    type: row.result_type,
    id: row.result_id,
    rank: row.rank,
  }));
}

const HEADLINE = sql`concat('StartSel=', chr(2), ', StopSel=', chr(3),
  ', MaxWords=24, MinWords=10, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "')`;

/** A few words around the match in `text`, the matched words marked; null when the text did not match. */
function snippetOf(text: SQL, q: string): SQL {
  const body = sql`left(${text}, 20000)`;
  const language = (config: "english" | "arabic") =>
    sql`when to_tsvector(${config}::regconfig, ${body}) @@ websearch_to_tsquery(${config}::regconfig, ${q})
      then ts_headline(${config}::regconfig, ${body}, websearch_to_tsquery(${config}::regconfig, ${q}), ${HEADLINE})`;
  return sql`(case when coalesce(${text}, '') = '' then null
    ${language("english")} ${language("arabic")} end)`;
}

function name(ar: boolean, alias: string): SQL {
  const u = sql.identifier(alias);
  return ar
    ? sql`coalesce(${u}.full_name_ar, ${u}.full_name_en, ${u}.preferred_given_name)`
    : sql`coalesce(${u}.full_name_en, ${u}.full_name_ar, ${u}.preferred_given_name)`;
}

function titled(ar: boolean, alias: string): SQL {
  const c = sql.identifier(alias);
  return ar
    ? sql`coalesce(${c}.title_ar, ${c}.title_en, ${c}.code)`
    : sql`coalesce(${c}.title_en, ${c}.title_ar, ${c}.code)`;
}

export interface FoundRow {
  id: string;
  title: string;
  snippet: string | null;
  context: string | null;
  when: string | null;
  flag: string | null;
  roles: string[];
  type: string;
}

type Raw = {
  id: string;
  title: string | null;
  snippet: string | null;
  context: string | null;
  when: string | null;
  flag: string | null;
  roles: string[] | null;
  type: string;
};

const found = (rows: Raw[]): FoundRow[] =>
  rows.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    snippet: row.snippet,
    context: row.context,
    when: row.when,
    flag: row.flag,
    roles: row.roles ?? [],
    type: row.type,
  }));

interface Among {
  tenantId: string;
  schoolId: string;
  ids: readonly string[];
  q: string;
  ar: boolean;
}

/** The students the viewer reaches. */
export const studentsReached = (scope: Scope) =>
  sql`(select student_user_id from app.visible_students(${scope.viewerId}::uuid,
    ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)}))`;

/**
 * The grown-ups the viewer reaches, with those a module opens to them
 * besides, students left to their own kind.
 */
export const peopleReached = (scope: Scope, besides: readonly string[]) =>
  sql`(select v.user_id from (select user_id from app.visible_people(${scope.viewerId}::uuid,
      ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide})
      union select unnest(${uuidArray(besides)})) v
    where not exists (select 1 from core.user_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = ${scope.schoolId}::uuid
        and r.user_id = v.user_id and r.role = 'student' and r.status = 'active'
        and r.valid_during @> ${scope.today}::date)
      and not exists (select 1 from core.student_departures d
        where d.tenant_id = ${scope.tenantId}::uuid and d.org_id = ${scope.schoolId}::uuid
          and d.student_user_id = v.user_id and d.status = 'active'
          and d.left_on <= ${scope.today}::date and d.access_ends_on > ${scope.today}::date))`;

/** The classes the viewer reaches, with those a module opens to them besides. */
export const classesReached = (scope: Scope, besides: readonly string[]) =>
  sql`(select class_id from app.visible_classes(${scope.viewerId}::uuid,
    ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)})
    union select unnest(${uuidArray(besides)}))`;

/** Students among `ids` the viewer reaches. */
export async function studentsAmong(tx: Tx, scope: Scope, input: Among) {
  return found(
    await tx.execute<Raw>(sql`
      select u.id, 'user' as type, ${name(input.ar, "u")} as title, null as snippet, null as "when",
        null as flag, null as roles, null as context
      from core.users u
      where u.tenant_id = ${scope.tenantId}::uuid and u.id = any(${uuidArray(input.ids)}) and u.status = 'active'
        and u.id in ${studentsReached(scope)}`),
  );
}

/** Grown-ups among `ids` the viewer reaches, with the roles they hold today. */
export async function peopleAmong(
  tx: Tx,
  scope: Scope,
  input: Among & { besides: readonly string[] },
) {
  return found(
    await tx.execute<Raw>(sql`
      with held as (
        select r.user_id, array_agg(distinct r.role order by r.role) as roles
        from core.user_roles r
        where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = ${scope.schoolId}::uuid
          and r.user_id = any(${uuidArray(input.ids)}) and r.status = 'active'
          and r.valid_during @> ${scope.today}::date
        group by r.user_id
      )
      select u.id, 'user' as type, ${name(input.ar, "u")} as title, null as snippet, null as context,
        null as "when", null as flag, h.roles
      from core.users u
      left join held h on h.user_id = u.id
      where u.tenant_id = ${scope.tenantId}::uuid and u.id = any(${uuidArray(input.ids)})
        and u.status = 'active' and u.id in ${peopleReached(scope, input.besides)}`),
  );
}

/** Classes among `ids` the viewer reaches, each with its code and school year. */
export async function classesAmong(
  tx: Tx,
  scope: Scope,
  input: Among & { besides: readonly string[] },
) {
  return found(
    await tx.execute<Raw>(sql`
      select c.id, 'class' as type, ${titled(input.ar, "c")} as title, null as snippet,
        concat_ws(' · ', c.code, to_char(lower(c.runs), 'YYYY-MM-DD') || ' – ' ||
          coalesce(to_char(upper(c.runs) - 1, 'YYYY-MM-DD'), '')) as context,
        null as "when", null as flag, null as roles
      from core.classes c
      where c.tenant_id = ${scope.tenantId}::uuid and c.id = any(${uuidArray(input.ids)}) and c.status = 'active'
        and c.id in ${classesReached(scope, input.besides)}`),
  );
}

interface AssignmentAccess {
  tenantId: string;
  schoolId: string;
  teaching: Scope | null;
  learners: readonly string[];
}

const assignmentOpen = (input: AssignmentAccess) => sql`(
  a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid and a.status = 'active'
  and (${input.teaching ? sql`a.class_id in ${taughtClasses(input.teaching)}` : sql`false`}
    or (a.state = 'published' and exists (select 1 from core.assignment_recipients r
      where r.tenant_id = a.tenant_id and r.assignment_id = a.id and r.status = 'active'
        and r.student_user_id = any(${uuidArray(input.learners)})))))`;

/** The assignments the viewer may open: in a class they teach, or published to one of `learners`. */
export const assignmentsReached = (input: AssignmentAccess) =>
  sql`(select a.id from core.assignments a where ${assignmentOpen(input)})`;

/**
 * Assignments among `ids` the viewer may open: in a class they teach, or
 * published to one of `learners` (the viewer, or the children they follow).
 */
export async function assignmentsAmong(
  tx: Tx,
  input: Among & AssignmentAccess,
) {
  return found(
    await tx.execute<Raw>(sql`
      select a.id, 'assignment' as type, a.title, ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        ${titled(input.ar, "c")} as context, ${isoOf(sql`a.due_at`)} as "when",
        case when a.state = 'draft' then 'draft' when a.state = 'scheduled' then 'scheduled' end as flag,
        null as roles
      from core.assignments a
      join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
      left join core.documents d on d.tenant_id = a.tenant_id and d.host_type = 'assignment'
        and d.host_id = a.id and d.status = 'active' and d.translation_of_id is null
      where a.id = any(${uuidArray(input.ids)}) and ${assignmentOpen(input)}`),
  );
}

interface LearningAccess {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  /** Set for those who write modules: the classes they teach and themselves as author. */
  teaching: Scope | null;
  /** The classes whose published modules the viewer may study or follow. */
  learnerClassIds: readonly string[];
  /** The students they study or follow them for: themselves, or their children. */
  learnerIds: readonly string[];
}

const moduleOpen = (access: LearningAccess, viewerId: string) => sql`(
  ${
    access.teaching
      ? sql`(m.state <> 'archived' and (m.author_user_id = ${viewerId}::uuid or exists (
          select 1 from core.module_classes x
          where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
            and x.class_id in ${taughtClasses(access.teaching)})))`
      : sql`false`
  }
  or (${liveSql(sql`m.state`, sql`m.publish_at`)} and exists (
    select 1 from core.module_classes x
    where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
      and x.class_id = any(${uuidArray(access.learnerClassIds)})
      and ${reachedBy(sql`x`, access.learnerIds)})))`;

/** The modules and lessons the viewer may open. */
export function learningReached(input: LearningAccess) {
  const open = moduleOpen(input, input.viewerId);
  return sql`(select m.id from core.learning_modules m
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and ${open}
    union all
    select l.id from core.lessons l
    join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
      and m.status = 'active' and m.org_id = ${input.schoolId}::uuid
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active' and ${open})`;
}

/** Modules and lessons among `ids` the viewer may open. */
export async function learningAmong(tx: Tx, input: Among & LearningAccess) {
  const open = moduleOpen(input, input.viewerId);
  return found(
    await tx.execute<Raw>(sql`
      select m.id, 'learning_module' as type, m.title,
        ${snippetOf(sql`m.summary`, input.q)} as snippet, null as context, null as "when",
        case when m.state = 'draft' then 'draft' end as flag, null as roles
      from core.learning_modules m
      where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
        and m.id = any(${uuidArray(input.ids)}) and m.status = 'active' and ${open}
      union all
      select l.id, 'lesson' as type, l.title, ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        m.title as context, null as "when", case when m.state = 'draft' then 'draft' end as flag, null as roles
      from core.lessons l
      join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
        and m.status = 'active' and m.org_id = ${input.schoolId}::uuid
      left join core.documents d on d.tenant_id = l.tenant_id and d.host_type = 'lesson'
        and d.host_id = l.id and d.status = 'active' and d.translation_of_id is null
      where l.tenant_id = ${input.tenantId}::uuid and l.id = any(${uuidArray(input.ids)})
        and l.status = 'active' and ${open}`),
  );
}

interface BroadcastAccess {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  manage: boolean;
  /** Subqueries of the ids modules open to everyone at the school. */
  opened: readonly SQL[];
}

const broadcastOpen = (input: BroadcastAccess) => sql`(
  b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.schoolId}::uuid
  and b.status = 'active'
  and (${input.manage} or (${liveSql(sql`b.state`, sql`b.publish_at`)}
    and (${
      input.opened.length
        ? sql`(${sql.join(
            input.opened.map((query) => sql`b.id in ${query}`),
            sql` or `,
          )}) or `
        : sql``
    }exists (select 1 from core.broadcast_recipients r
      where r.tenant_id = b.tenant_id and r.broadcast_id = b.id
        and r.user_id = ${input.viewerId}::uuid and r.status = 'active')))))`;

/** The announcements the viewer may open, by the rule `broadcastsAmong` reads them with. */
export const broadcastsReached = (input: BroadcastAccess) =>
  sql`(select b.id from core.broadcasts b where ${broadcastOpen(input)})`;

/**
 * Announcements among `ids`: every one for those who manage them, otherwise
 * those out that reached the viewer or that a module opens to everyone.
 * Readers are matched against the words as published, never a
 * draft of the next revision.
 */
export async function broadcastsAmong(tx: Tx, input: Among & BroadcastAccess) {
  const text = input.manage
    ? sql`(select d.plain_text from core.documents d where d.tenant_id = b.tenant_id
        and d.host_type = 'announcement' and d.host_id = b.id and d.status = 'active'
        and d.translation_of_id is null)`
    : publishedText;
  return found(
    await tx.execute<Raw>(sql`
      select b.id, 'announcement' as type,
        ${input.ar ? sql`coalesce(nullif(b.title_ar, ''), b.title_en)` : sql`coalesce(nullif(b.title_en, ''), b.title_ar)`} as title,
        ${snippetOf(text, input.q)} as snippet, null as context,
        ${isoOf(sql`coalesce(b.publish_at, b.date_last_modified)`)} as "when",
        case when ${scheduledSql(sql`b.state`, sql`b.publish_at`)} then 'scheduled'
             when b.state <> 'published' then b.state end as flag, null as roles
      from core.broadcasts b
      where b.id = any(${uuidArray(input.ids)}) and ${broadcastOpen(input)}`),
  );
}

interface EventAccess {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  reach: Reach | null;
}

function eventOpen(input: EventAccess) {
  const own = sql`e.author_user_id = ${input.viewerId}::uuid`;
  return sql`(
    e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid and e.status = 'active'
    and (e.state = 'published' or ${input.reach === null} or ${own})
    and ${
      input.reach
        ? sql`(${own} or ${reaches(
            {
              tenantId: input.tenantId,
              kind: "calendar_event",
              ownerId: sql`e.id`,
            },
            input.reach,
          )})`
        : sql`true`
    })`;
}

/** The calendar events the viewer may open. */
export const eventsReached = (input: EventAccess) =>
  sql`(select e.id from core.calendar_events e where ${eventOpen(input)})`;

/**
 * Calendar events among `ids` whose audience names the viewer or that they
 * wrote; with no reach, all of them. Drafts stay with their author and those
 * who manage the calendar.
 */
export async function eventsAmong(tx: Tx, input: Among & EventAccess) {
  return found(
    await tx.execute<Raw>(sql`
      select e.id, 'calendar_event' as type,
        ${input.ar ? sql`coalesce(e.title_ar, e.title_en)` : sql`coalesce(e.title_en, e.title_ar)`} as title,
        ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        e.location as context, e.starts_on::text as "when",
        case when e.cancelled then 'cancelled' when e.state = 'draft' then 'draft' end as flag, null as roles
      from core.calendar_events e
      left join core.documents d on d.tenant_id = e.tenant_id and d.host_type = 'calendar_event'
        and d.host_id = e.id and d.status = 'active' and d.translation_of_id is null
      where e.id = any(${uuidArray(input.ids)}) and ${eventOpen(input)}`),
  );
}

interface ThreadAccess {
  tenantId: string;
  schoolId: string;
  viewerId: string;
}

/** The conversations the viewer is still in; in a mailbox's, as one of its contacts. */
export const threadsReached = (input: ThreadAccess) =>
  sql`(select t.id from core.message_threads t
    join core.thread_members m on m.tenant_id = t.tenant_id and m.thread_id = t.id
      and m.user_id = ${input.viewerId}::uuid and m.status = 'active' and m.left_at is null
      and (t.mailbox is null or m.role = 'member')
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
      and t.status = 'active')`;

/**
 * Conversations among `ids` the viewer is still in, named by their subject
 * or the others in them, with the latest message that matched.
 */
export async function threadsAmong(tx: Tx, input: Among & ThreadAccess) {
  return found(
    await tx.execute<Raw>(sql`
      select t.id, 'message_thread' as type,
        coalesce(t.subject, (select string_agg(${name(input.ar, "u")}, ', ' order by ${name(input.ar, "u")})
          from core.thread_members o join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
          where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
            and o.left_at is null and o.user_id <> ${input.viewerId}::uuid)) as title,
        (select ${snippetOf(sql`g.body`, input.q)} from core.messages g
          where g.tenant_id = t.tenant_id and g.thread_id = t.id and g.status = 'active'
            and g.kind = 'message'
            and (to_tsvector('english'::regconfig, g.body) @@ websearch_to_tsquery('english'::regconfig, ${input.q})
              or to_tsvector('arabic'::regconfig, g.body) @@ websearch_to_tsquery('arabic'::regconfig, ${input.q}))
          order by g.created_at desc limit 1) as snippet,
        null as context, ${isoOf(sql`t.last_message_at`)} as "when", null as flag, null as roles
      from core.message_threads t
      where t.id = any(${uuidArray(input.ids)}) and t.id in ${threadsReached(input)}`),
  );
}

interface TeamAccess {
  tenantId: string;
  schoolId: string;
  /** The mailboxes the viewer's capabilities read. */
  mailboxes: readonly string[];
}

/** The conversations of the mailboxes the viewer's team shares, internal entries and all. */
export const teamThreadsReached = (input: TeamAccess) =>
  sql`(select t.id from core.message_threads t
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
      and t.status = 'active' and t.mailbox = any(${textArray(input.mailboxes)}))`;

/**
 * Team conversations among `ids` the viewer's mailboxes still hold, named
 * by their subject or the family in them, with the latest internal entry
 * that matched: a note, a contact logged, or held mail.
 */
export async function teamThreadsAmong(tx: Tx, input: Among & TeamAccess) {
  return found(
    await tx.execute<Raw>(sql`
      select t.id, 'team_thread' as type,
        coalesce(t.subject, (select string_agg(coalesce(${name(input.ar, "u")}, c.display_name), ', ')
          from core.thread_members o
          left join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
          left join core.message_contacts c on c.tenant_id = o.tenant_id and c.id = o.contact_id
          where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
            and o.left_at is null and o.role = 'member'),
          (select ${name(input.ar, "s")} from core.users s
            where s.tenant_id = t.tenant_id and s.id = t.student_user_id)) as title,
        (select ${snippetOf(sql`g.body`, input.q)} from core.messages g
          where g.tenant_id = t.tenant_id and g.thread_id = t.id and g.status = 'active'
            and g.kind not in ('message', 'event') and g.redacted_at is null
            and (to_tsvector('english'::regconfig, g.body) @@ websearch_to_tsquery('english'::regconfig, ${input.q})
              or to_tsvector('arabic'::regconfig, g.body) @@ websearch_to_tsquery('arabic'::regconfig, ${input.q}))
          order by g.created_at desc limit 1) as snippet,
        null as context, ${isoOf(sql`t.last_message_at`)} as "when", null as flag, null as roles
      from core.message_threads t
      where t.id = any(${uuidArray(input.ids)}) and t.id in ${teamThreadsReached(input)}`),
  );
}
