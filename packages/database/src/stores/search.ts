import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Reach } from "./audiences";
import type { Scope } from "./students";

import { reaches } from "./audiences";
import { taughtClasses } from "./classes";
import { publishedPostText } from "./news";
import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Candidate {
  type: string;
  id: string;
  rank: number;
}

/**
 * Index hits for a query, best first. The index holds ids only; every caller
 * joins them back through the kind's own reading rule before showing any.
 */
export async function candidates(
  tx: Tx,
  input: {
    q: string;
    types: readonly string[];
    orgScope: readonly string[];
    after: { rank: number; id: string } | null;
    max: number;
  },
): Promise<Candidate[]> {
  const rows = await tx.execute<{
    result_type: string;
    result_id: string;
    rank: number;
  }>(sql`
    select result_type, result_id, rank
    from app.search(${input.q}, ${textArray(input.types)}, ${uuidArray(input.orgScope)},
      ${input.after?.rank ?? null}::real, ${input.after?.id ?? null}::uuid, ${input.max})`);
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

/** Students among `ids` the viewer reaches, with their grade this year. */
export async function studentsAmong(tx: Tx, scope: Scope, input: Among) {
  return found(
    await tx.execute<Raw>(sql`
      select u.id, 'user' as type, ${name(input.ar, "u")} as title, null as snippet, null as "when",
        null as flag, null as roles,
        (select case when ${input.ar} then coalesce(d.label_ar, d.label_en) else coalesce(d.label_en, d.label_ar) end
           from core.student_school_years s
           join core.descriptors d on d.tenant_id = s.tenant_id and d.id = s.grade_level_descriptor_id
           where s.tenant_id = u.tenant_id and s.student_user_id = u.id and s.org_id = ${scope.schoolId}::uuid
             and s.status = 'active' and s.valid_during @> ${scope.today}::date
           order by upper(s.valid_during) desc limit 1) as context
      from core.users u
      where u.tenant_id = ${scope.tenantId}::uuid and u.id = any(${uuidArray(input.ids)}) and u.status = 'active'
        and u.id in (select student_user_id from app.visible_students(${scope.viewerId}::uuid,
          ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`),
  );
}

/** Staff and family members among `ids` the viewer reaches, with the roles they hold today. */
export async function peopleAmong(tx: Tx, scope: Scope, input: Among) {
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
        and u.status = 'active' and not coalesce('student' = any(h.roles), false)
        and u.id in (select user_id from app.visible_people(${scope.viewerId}::uuid,
          ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`),
  );
}

/** Classes among `ids` the viewer reaches. */
export async function classesAmong(tx: Tx, scope: Scope, input: Among) {
  return found(
    await tx.execute<Raw>(sql`
      select c.id, 'class' as type, ${titled(input.ar, "c")} as title, null as snippet, c.code as context,
        null as "when", null as flag, null as roles
      from core.classes c
      where c.tenant_id = ${scope.tenantId}::uuid and c.id = any(${uuidArray(input.ids)}) and c.status = 'active'
        and c.id in (select class_id from app.visible_classes(${scope.viewerId}::uuid,
          ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`),
  );
}

/**
 * Assignments among `ids` the viewer may open: in a class they teach, or
 * published to one of `learners` (the viewer, or the children they follow).
 */
export async function assignmentsAmong(
  tx: Tx,
  input: Among & { teaching: Scope | null; learners: readonly string[] },
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
      where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid
        and a.id = any(${uuidArray(input.ids)}) and a.status = 'active'
        and (${input.teaching ? sql`a.class_id in ${taughtClasses(input.teaching)}` : sql`false`}
          or (a.state = 'published' and exists (select 1 from core.assignment_recipients r
            where r.tenant_id = a.tenant_id and r.assignment_id = a.id and r.status = 'active'
              and r.student_user_id = any(${uuidArray(input.learners)}))))`),
  );
}

interface LearningAccess {
  /** Set for those who write modules: the classes they teach and themselves as author. */
  teaching: Scope | null;
  /** The classes whose published modules the viewer may study or follow. */
  learnerClassIds: readonly string[];
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
  or (m.state = 'published' and m.publish_at <= statement_timestamp() and exists (
    select 1 from core.module_classes x
    where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
      and x.class_id = any(${uuidArray(access.learnerClassIds)}))))`;

/** Modules and lessons among `ids` the viewer may open. */
export async function learningAmong(
  tx: Tx,
  input: Among & LearningAccess & { viewerId: string },
) {
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

/** Announcements among `ids`: every one for those who manage them, otherwise those received and out. */
export async function announcementsAmong(
  tx: Tx,
  input: Among & { viewerId: string; manage: boolean },
) {
  return found(
    await tx.execute<Raw>(sql`
      select a.id, 'announcement' as type, a.title, ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        null as context, ${isoOf(sql`coalesce(a.publish_at, a.date_last_modified)`)} as "when",
        case when a.state in ('draft', 'scheduled', 'archived') then a.state end as flag, null as roles
      from core.announcements a
      left join core.documents d on d.tenant_id = a.tenant_id and d.host_type = 'announcement'
        and d.host_id = a.id and d.status = 'active' and d.translation_of_id is null
      where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid
        and a.id = any(${uuidArray(input.ids)}) and a.status = 'active'
        and (${input.manage} or (a.state in ('scheduled', 'published') and a.publish_at <= statement_timestamp()
          and exists (select 1 from core.announcement_recipients r
            where r.tenant_id = a.tenant_id and r.announcement_id = a.id
              and r.user_id = ${input.viewerId}::uuid and r.status = 'active')))`),
  );
}

/**
 * School news among `ids`: every post for those who manage news, otherwise
 * posts out that are public or reached the viewer. Readers are matched
 * against the post as published, never a draft of its next revision.
 */
export async function newsAmong(
  tx: Tx,
  input: Among & { viewerId: string; manage: boolean },
) {
  const text = input.manage
    ? sql`(select d.plain_text from core.documents d where d.tenant_id = p.tenant_id
        and d.host_type = 'site_post' and d.host_id = p.id and d.status = 'active'
        and d.translation_of_id is null)`
    : publishedPostText;
  return found(
    await tx.execute<Raw>(sql`
      select p.id, 'site_post' as type,
        ${input.ar ? sql`coalesce(nullif(p.title_ar, ''), p.title_en)` : sql`coalesce(nullif(p.title_en, ''), p.title_ar)`} as title,
        ${snippetOf(text, input.q)} as snippet, null as context,
        ${isoOf(sql`coalesce(p.published_at, p.date_last_modified)`)} as "when",
        case when p.state <> 'published' then p.state
             when p.published_at > statement_timestamp() then 'scheduled' end as flag, null as roles
      from core.site_posts p
      where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
        and p.id = any(${uuidArray(input.ids)}) and p.status = 'active'
        and (${input.manage} or (p.state = 'published' and p.published_at <= statement_timestamp()
          and (p.visibility = 'public' or exists (select 1 from core.site_post_recipients r
            where r.tenant_id = p.tenant_id and r.post_id = p.id
              and r.user_id = ${input.viewerId}::uuid and r.status = 'active'))))`),
  );
}

/**
 * Calendar events among `ids` whose audience names the viewer or that they
 * wrote; with no reach, all of them. Drafts stay with their author and those
 * who manage the calendar.
 */
export async function eventsAmong(
  tx: Tx,
  input: Among & { reach: Reach | null; viewerId: string },
) {
  const own = sql`e.author_user_id = ${input.viewerId}::uuid`;
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
      where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid
        and e.id = any(${uuidArray(input.ids)}) and e.status = 'active'
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
        }`),
  );
}

/**
 * Conversations among `ids` the viewer is still in, named by their subject
 * or the others in them, with the latest message that matched.
 */
export async function threadsAmong(
  tx: Tx,
  input: Among & { viewerId: string },
) {
  return found(
    await tx.execute<Raw>(sql`
      select t.id, 'message_thread' as type,
        coalesce(t.subject, (select string_agg(${name(input.ar, "u")}, ', ' order by ${name(input.ar, "u")})
          from core.thread_members o join core.users u on u.tenant_id = o.tenant_id and u.id = o.user_id
          where o.tenant_id = t.tenant_id and o.thread_id = t.id and o.status = 'active'
            and o.left_at is null and o.user_id <> ${input.viewerId}::uuid)) as title,
        (select ${snippetOf(sql`g.body`, input.q)} from core.messages g
          where g.tenant_id = t.tenant_id and g.thread_id = t.id and g.status = 'active'
            and (to_tsvector('english'::regconfig, g.body) @@ websearch_to_tsquery('english'::regconfig, ${input.q})
              or to_tsvector('arabic'::regconfig, g.body) @@ websearch_to_tsquery('arabic'::regconfig, ${input.q}))
          order by g.created_at desc limit 1) as snippet,
        null as context, ${isoOf(sql`t.last_message_at`)} as "when", null as flag, null as roles
      from core.message_threads t
      join core.thread_members m on m.tenant_id = t.tenant_id and m.thread_id = t.id
        and m.user_id = ${input.viewerId}::uuid and m.status = 'active' and m.left_at is null
      where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.schoolId}::uuid
        and t.id = any(${uuidArray(input.ids)}) and t.status = 'active'`),
  );
}
