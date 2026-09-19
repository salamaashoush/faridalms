import type { Permission, Role } from "@faridalms/domain/identity";
import type {
  SearchGroup,
  SearchHit,
  SearchKind,
  SearchQuery,
} from "@faridalms/domain/search";
import type { SQLWrapper } from "drizzle-orm";

import {
  SEARCH_PAGE_SIZE,
  SEARCH_PREVIEW_SIZE,
  searchableKinds,
} from "@faridalms/domain/search";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type { Database } from "../index";

import { schema as s } from "../index";

/** What the viewer may reach, resolved by the API before any query runs. */
export interface SearchScope {
  viewerId: string;
  role: Role;
  permissions: readonly Permission[];
  studentIds: string[];
  classIds: string[];
  schoolYearId: string;
  today: string;
}

interface Needles {
  contains: string;
  prefix: string;
}

interface Page {
  total: number;
  rows: SearchHit[];
}

type Searcher = (
  db: Database,
  scope: SearchScope,
  needles: Needles,
  limit: number,
  offset: number,
) => Promise<Page>;

const EMPTY: Page = { total: 0, rows: [] };

const escape = (query: string) => query.replaceAll(/[\\%_]/g, "\\$&");
const prefixFirst = (column: SQLWrapper, prefix: string) =>
  sql`case when ${column} ilike ${prefix} then 0 else 1 end`;
const iso = (value: Date | string | null) =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;
const clip = (value: string | null) =>
  value === null || value.trim() === "" ? null : value.slice(0, 160);

const students: Searcher = async (db, scope, needles, limit, offset) => {
  if (scope.studentIds.length === 0) return EMPTY;
  const name = sql<string>`${s.students.firstName} || ' ' || ${s.students.lastName}`;
  const where = and(
    inArray(s.students.id, scope.studentIds),
    or(
      ilike(name, needles.contains),
      ilike(s.students.reference, needles.contains),
    ),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.students)
    .where(where);
  const rows = await db
    .select({
      id: s.students.id,
      name,
      reference: s.students.reference,
      className: sql<string | null>`(select c.name from ${s.enrolments} e
        join ${s.classes} c on c.id = e.class_id
        where e.student_id = ${s.students}.id and c.school_year_id = ${scope.schoolYearId}
          and e.since <= ${scope.today} and (e.until is null or e.until > ${scope.today})
        order by e.since desc limit 1)`,
    })
    .from(s.students)
    .where(where)
    .orderBy(prefixFirst(name, needles.prefix), asc(name), asc(s.students.id))
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "students",
      id: row.id,
      title: row.name,
      snippet: row.className,
      context: row.reference,
      when: null,
    })),
  };
};

const classes: Searcher = async (db, scope, needles, limit, offset) => {
  if (scope.classIds.length === 0) return EMPTY;
  const where = and(
    inArray(s.classes.id, scope.classIds),
    or(
      ilike(s.classes.name, needles.contains),
      ilike(s.classes.grade, needles.contains),
    ),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.classes)
    .where(where);
  const rows = await db
    .select({
      id: s.classes.id,
      name: s.classes.name,
      grade: s.classes.grade,
      homeroom: sql<
        string | null
      >`(select u.name from ${s.users} u where u.id = ${s.classes}.homeroom_teacher_id)`,
    })
    .from(s.classes)
    .where(where)
    .orderBy(
      prefixFirst(s.classes.name, needles.prefix),
      asc(s.classes.name),
      asc(s.classes.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "classes",
      id: row.id,
      title: row.name,
      snippet: row.homeroom,
      context: row.grade,
      when: null,
    })),
  };
};

/**
 * Everyone for a school-wide reader; otherwise the people the viewer already
 * shares something with: administrators, teachers of their classes, the
 * accounts and guardians of their students, and anyone they have messaged.
 */
const people: Searcher = async (db, scope, needles, limit, offset) => {
  const schoolWide = scope.permissions.includes("users:read");
  const match = schoolWide
    ? or(
        ilike(s.users.name, needles.contains),
        ilike(s.users.email, needles.contains),
      )
    : ilike(s.users.name, needles.contains);
  const reach = schoolWide
    ? undefined
    : or(
        eq(s.users.role, "admin"),
        scope.classIds.length > 0
          ? sql`exists (select 1 from ${s.classes} c
              where c.id in ${scope.classIds}
                and (c.homeroom_teacher_id = ${s.users}.id
                  or exists (select 1 from ${s.classSubjects} cs
                    where cs.class_id = c.id and cs.teacher_id = ${s.users}.id)))`
          : sql`false`,
        scope.studentIds.length > 0
          ? sql`exists (select 1 from ${s.students} st
              where st.id in ${scope.studentIds}
                and (st.user_id = ${s.users}.id
                  or exists (select 1 from ${s.guardianships} g
                    where g.student_id = st.id and g.guardian_id = ${s.users}.id)))`
          : sql`false`,
        sql`exists (select 1 from ${s.messages} m
          left join ${s.messageRecipients} r on r.message_id = m.id
          where (m.sender_id = ${s.users}.id and r.recipient_id = ${scope.viewerId})
             or (m.sender_id = ${scope.viewerId} and r.recipient_id = ${s.users}.id))`,
      );
  const where = and(
    eq(s.users.isActive, true),
    ne(s.users.id, scope.viewerId),
    match,
    reach,
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.users)
    .where(where);
  const rows = await db
    .select({
      id: s.users.id,
      name: s.users.name,
      role: s.users.role,
      title: s.users.title,
      email: s.users.email,
    })
    .from(s.users)
    .where(where)
    .orderBy(
      prefixFirst(s.users.name, needles.prefix),
      asc(s.users.name),
      asc(s.users.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "people",
      id: row.id,
      title: row.name,
      snippet: schoolWide ? row.email : row.title,
      context: row.role,
      when: null,
    })),
  };
};

const assignments: Searcher = async (db, scope, needles, limit, offset) => {
  const now = new Date();
  const visible =
    scope.role === "admin"
      ? ne(s.assignments.status, "archived")
      : scope.role === "teacher"
        ? scope.classIds.length > 0
          ? and(
              inArray(s.assignments.classId, scope.classIds),
              ne(s.assignments.status, "archived"),
              or(
                eq(s.assignments.status, "published"),
                eq(s.assignments.authorId, scope.viewerId),
              ),
            )
          : sql`false`
        : scope.studentIds.length > 0
          ? and(
              eq(s.assignments.status, "published"),
              or(
                isNull(s.assignments.availableFrom),
                lte(s.assignments.availableFrom, now),
              ),
              sql`(exists (select 1 from ${s.assignmentRecipients} r
                    where r.assignment_id = ${s.assignments}.id
                      and r.student_id in ${scope.studentIds})
                or (${s.assignments}.audience = 'class' and exists (select 1 from ${s.enrolments} e
                    where e.class_id = ${s.assignments}.class_id
                      and e.student_id in ${scope.studentIds}
                      and e.since <= ${scope.today}
                      and (e.until is null or e.until > ${scope.today}))))`,
            )
          : sql`false`;
  const where = and(
    visible,
    eq(s.classes.schoolYearId, scope.schoolYearId),
    or(
      ilike(s.assignments.title, needles.contains),
      ilike(s.assignments.description, needles.contains),
    ),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.assignments)
    .innerJoin(s.classes, eq(s.classes.id, s.assignments.classId))
    .where(where);
  const rows = await db
    .select({
      id: s.assignments.id,
      title: s.assignments.title,
      description: s.assignments.description,
      dueAt: s.assignments.dueAt,
      className: s.classes.name,
      subject: s.subjects.name,
    })
    .from(s.assignments)
    .innerJoin(s.classes, eq(s.classes.id, s.assignments.classId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.assignments.subjectId))
    .where(where)
    .orderBy(
      prefixFirst(s.assignments.title, needles.prefix),
      desc(s.assignments.dueAt),
      asc(s.assignments.title),
      asc(s.assignments.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "assignments",
      id: row.id,
      title: row.title,
      snippet: clip(row.description),
      context: `${row.className} · ${row.subject}`,
      when: iso(row.dueAt),
    })),
  };
};

const messages: Searcher = async (db, scope, needles, limit, offset) => {
  const threads = sql`
    with participation as (
      select coalesce(m.parent_message_id, m.id) as root_id, max(m.sent_at) as latest_at
      from ${s.messages} m
      left join ${s.messageRecipients} r on r.message_id = m.id and r.recipient_id = ${scope.viewerId}
      where m.sender_id = ${scope.viewerId} or r.recipient_id is not null
      group by 1
    ),
    hits as (
      select root.id, root.subject, p.latest_at,
        (select u.name from ${s.users} u where u.id = root.sender_id) as sender_name,
        (select left(x.body, 160) from ${s.messages} x
          where coalesce(x.parent_message_id, x.id) = root.id
            and (x.subject ilike ${needles.contains} or x.body ilike ${needles.contains})
          order by x.sent_at desc, x.id desc limit 1) as snippet
      from participation p
      join ${s.messages} root on root.id = p.root_id
      where exists (select 1 from ${s.messages} x
        where coalesce(x.parent_message_id, x.id) = root.id
          and (x.subject ilike ${needles.contains} or x.body ilike ${needles.contains}))
    )`;
  const counted = (await db.execute(
    sql`${threads} select count(*)::int as total from hits`,
  )) as unknown as { total: number }[];
  const rows = (await db.execute(
    sql`${threads} select id, subject, latest_at, sender_name, snippet from hits
      order by latest_at desc, id limit ${limit} offset ${offset}`,
  )) as unknown as {
    id: string;
    subject: string;
    latest_at: Date | string;
    sender_name: string | null;
    snippet: string | null;
  }[];
  return {
    total: counted[0]?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "messages",
      id: row.id,
      title: row.subject,
      snippet: clip(row.snippet),
      context: row.sender_name,
      when: iso(row.latest_at),
    })),
  };
};

const events: Searcher = async (db, scope, needles, limit, offset) => {
  const where = and(
    eq(s.calendarEvents.schoolYearId, scope.schoolYearId),
    or(
      ilike(s.calendarEvents.title, needles.contains),
      ilike(s.calendarEvents.description, needles.contains),
    ),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.calendarEvents)
    .where(where);
  const rows = await db
    .select({
      id: s.calendarEvents.id,
      title: s.calendarEvents.title,
      description: s.calendarEvents.description,
      startsOn: s.calendarEvents.startsOn,
      category: s.calendarEvents.category,
    })
    .from(s.calendarEvents)
    .where(where)
    .orderBy(
      prefixFirst(s.calendarEvents.title, needles.prefix),
      desc(s.calendarEvents.startsOn),
      asc(s.calendarEvents.title),
      asc(s.calendarEvents.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "events",
      id: row.id,
      title: row.title,
      snippet: clip(row.description),
      context: row.category,
      when: row.startsOn,
    })),
  };
};

const newsletters: Searcher = async (db, _scope, needles, limit, offset) => {
  const where = or(
    ilike(s.newsletters.title, needles.contains),
    ilike(s.newsletters.summary, needles.contains),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.newsletters)
    .where(where);
  const rows = await db
    .select({
      id: s.newsletters.id,
      title: s.newsletters.title,
      summary: s.newsletters.summary,
      publishedOn: s.newsletters.publishedOn,
    })
    .from(s.newsletters)
    .where(where)
    .orderBy(
      prefixFirst(s.newsletters.title, needles.prefix),
      desc(s.newsletters.publishedOn),
      asc(s.newsletters.title),
      asc(s.newsletters.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "newsletters",
      id: row.id,
      title: row.title,
      snippet: clip(row.summary),
      context: null,
      when: row.publishedOn,
    })),
  };
};

const ANNOUNCEMENT_AUDIENCES: Record<Role, readonly string[]> = {
  admin: ["everyone", "teachers", "parents", "students"],
  teacher: ["everyone", "teachers"],
  parent: ["everyone", "parents"],
  student: ["everyone", "students"],
};

const announcements: Searcher = async (db, scope, needles, limit, offset) => {
  const manage = scope.permissions.includes("announcements:manage");
  const where = and(
    manage
      ? undefined
      : and(
          eq(s.announcements.status, "published"),
          inArray(s.announcements.audience, [
            ...ANNOUNCEMENT_AUDIENCES[scope.role],
          ] as (typeof s.announcements.audience.enumValues)[number][]),
        ),
    or(
      ilike(s.announcements.title, needles.contains),
      ilike(s.announcements.summary, needles.contains),
    ),
  );
  const [counted] = await db
    .select({ total: count() })
    .from(s.announcements)
    .where(where);
  const rows = await db
    .select({
      id: s.announcements.id,
      title: s.announcements.title,
      summary: s.announcements.summary,
      publishedAt: s.announcements.publishedAt,
      status: s.announcements.status,
    })
    .from(s.announcements)
    .where(where)
    .orderBy(
      prefixFirst(s.announcements.title, needles.prefix),
      desc(s.announcements.publishedAt),
      asc(s.announcements.title),
      asc(s.announcements.id),
    )
    .limit(limit)
    .offset(offset);
  return {
    total: counted?.total ?? 0,
    rows: rows.map((row) => ({
      kind: "announcements",
      id: row.id,
      title: row.title,
      snippet: clip(row.summary),
      context: row.status === "published" ? null : row.status,
      when: iso(row.publishedAt),
    })),
  };
};

const SEARCHERS: Record<SearchKind, Searcher> = {
  students,
  classes,
  people,
  assignments,
  messages,
  events,
  newsletters,
  announcements,
};

/**
 * Searches only what the viewer's capabilities open and their relationships
 * reach. Medical and contact details are never queried; snippets come from
 * titles, summaries and message bodies the viewer could already read.
 */
export async function searchSchool(
  db: Database,
  scope: SearchScope,
  query: SearchQuery,
): Promise<{ groups: SearchGroup[]; page: number; pages: number }> {
  const kinds = searchableKinds(scope.permissions);
  const needles: Needles = {
    contains: `%${escape(query.q)}%`,
    prefix: `${escape(query.q)}%`,
  };
  if (query.kind === "all") {
    const groups = await Promise.all(
      kinds.map(async (kind) => ({
        kind,
        ...(await SEARCHERS[kind](db, scope, needles, SEARCH_PREVIEW_SIZE, 0)),
      })),
    );
    return {
      groups: groups.filter((group) => group.total > 0),
      page: 1,
      pages: 1,
    };
  }
  if (!kinds.includes(query.kind)) return { groups: [], page: 1, pages: 1 };
  const search = SEARCHERS[query.kind];
  let page = query.page;
  let result = await search(
    db,
    scope,
    needles,
    SEARCH_PAGE_SIZE,
    (page - 1) * SEARCH_PAGE_SIZE,
  );
  const pages = Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE));
  if (page > pages) {
    page = pages;
    result = await search(
      db,
      scope,
      needles,
      SEARCH_PAGE_SIZE,
      (page - 1) * SEARCH_PAGE_SIZE,
    );
  }
  return {
    groups: [{ kind: query.kind, total: result.total, rows: result.rows }],
    page,
    pages,
  };
}
