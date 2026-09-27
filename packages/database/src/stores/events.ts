import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { EventCategory, EventState } from "../tables/events";
import type { Reach } from "./audiences";

import { reaches } from "./audiences";
import { isoOf } from "./sql";

type Tx = CellTransaction;

export interface EventRow {
  id: string;
  version: number;
  orgId: string;
  titleEn: string | null;
  titleAr: string | null;
  category: EventCategory;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provisional: boolean;
  cancelled: boolean;
  state: EventState;
  public: boolean;
  publishedAt: string | null;
  updateSentAt: string | null;
  authorUserId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
}

const columns = sql`e.id, e.version, e.org_id, e.title_en, e.title_ar, e.category,
  to_char(e.starts_on, 'YYYY-MM-DD') as starts_on, to_char(e.ends_on, 'YYYY-MM-DD') as ends_on,
  to_char(e.start_time, 'HH24:MI') as start_time, to_char(e.end_time, 'HH24:MI') as end_time,
  e.location, e.provisional, e.cancelled, e.state, e.public, ${isoOf(sql`e.published_at`)} as published_at,
  ${isoOf(sql`e.update_sent_at`)} as update_sent_at, e.author_user_id,
  u.full_name_en as author_en, u.full_name_ar as author_ar`;

type EventRecord = {
  id: string;
  version: number;
  org_id: string;
  title_en: string | null;
  title_ar: string | null;
  category: EventCategory;
  starts_on: string;
  ends_on: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  provisional: boolean;
  cancelled: boolean;
  state: EventState;
  public: boolean;
  published_at: string | null;
  update_sent_at: string | null;
  author_user_id: string;
  author_en: string | null;
  author_ar: string | null;
};

function rowOf(row: EventRecord): EventRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    category: row.category,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    provisional: row.provisional,
    cancelled: row.cancelled,
    state: row.state,
    public: row.public,
    publishedAt: row.published_at,
    updateSentAt: row.update_sent_at,
    authorUserId: row.author_user_id,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
  };
}

export async function eventById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<EventRow | null> {
  const [row] = await tx.execute<EventRecord>(sql`
    select ${columns} from core.calendar_events e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.author_user_id
    where e.tenant_id = ${tenantId}::uuid and e.id = ${id}::uuid and e.status = 'active'`);
  return row ? rowOf(row) : null;
}

/** Whether someone with this reach is in the event's audience. */
export async function eventReaches(
  tx: Tx,
  input: { tenantId: string; eventId: string },
  reach: Reach,
): Promise<boolean> {
  const [row] = await tx.execute<{ reached: boolean }>(sql`
    select ${reaches(
      {
        tenantId: input.tenantId,
        kind: "calendar_event",
        ownerId: sql`${input.eventId}::uuid`,
      },
      reach,
    )} as reached`);
  return row?.reached ?? false;
}

/**
 * The school's events overlapping `[from, to]`, in the order they happen. With
 * a reach, only those whose audience names that person or that they wrote;
 * without, all of them. Drafts only when asked for, and then only the
 * viewer's own unless they manage the calendar.
 */
export async function eventsBetween(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    from: string;
    to: string;
    reach: Reach | null;
    drafts: boolean;
  },
): Promise<EventRow[]> {
  const own = sql`e.author_user_id = ${input.viewerId}::uuid`;
  const rows = await tx.execute<EventRecord>(sql`
    select ${columns} from core.calendar_events e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.author_user_id
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid
      and e.status = 'active' and e.starts_on <= ${input.to}::date and e.ends_on >= ${input.from}::date
      and (e.state = 'published' or ${input.drafts} and (${input.reach === null} or ${own}))
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
      }
    order by e.starts_on, e.start_time nulls first, coalesce(e.title_en, e.title_ar), e.id
    limit 1000`);
  return rows.map(rowOf);
}

export interface EventFields {
  titleEn: string | null;
  titleAr: string | null;
  public: boolean;
  category: EventCategory;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provisional: boolean;
}

/** A new event, a draft until it is published. */
export async function insertEvent(
  tx: Tx,
  input: EventFields & { tenantId: string; schoolId: string; authorId: string },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.calendar_events (tenant_id, org_id, title_en, title_ar, category, starts_on, ends_on,
      start_time, end_time, location, provisional, public, state, author_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.titleEn}, ${input.titleAr}, ${input.category},
      ${input.startsOn}::date, ${input.endsOn}::date, ${input.startTime}::time, ${input.endTime}::time,
      ${input.location}, ${input.provisional}, ${input.public}, 'draft', ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("event not written");
  return row;
}

export async function updateEvent(
  tx: Tx,
  input: EventFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
    /** Its audience is being told of this change. */
    updateSent: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.calendar_events
    set title_en = ${input.titleEn}, title_ar = ${input.titleAr}, public = ${input.public},
        category = ${input.category}, starts_on = ${input.startsOn}::date,
        ends_on = ${input.endsOn}::date, start_time = ${input.startTime}::time,
        end_time = ${input.endTime}::time, location = ${input.location},
        provisional = ${input.provisional},
        update_sent_at = case when ${input.updateSent} then statement_timestamp() else update_sent_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function setCancelled(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    cancelled: boolean;
    updateSent: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.calendar_events set cancelled = ${input.cancelled},
      update_sent_at = case when ${input.updateSent} then statement_timestamp() else update_sent_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function publishEvent(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.calendar_events set state = 'published', published_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and state = 'draft'
    returning version`);
  return row?.version ?? null;
}

export async function removeEvent(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.calendar_events set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface PublicEvent {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  category: EventCategory;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provisional: boolean;
  cancelled: boolean;
}

/** A school's public events still to come or under way, soonest first, for its website. */
export async function publicEvents(
  tx: Tx,
  input: { orgId: string; from: string; limit: number },
): Promise<PublicEvent[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    category: EventCategory;
    starts_on: string;
    ends_on: string;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    provisional: boolean;
    cancelled: boolean;
  }>(sql`
    select e.id, e.title_en, e.title_ar, e.category,
      to_char(e.starts_on, 'YYYY-MM-DD') as starts_on, to_char(e.ends_on, 'YYYY-MM-DD') as ends_on,
      to_char(e.start_time, 'HH24:MI') as start_time, to_char(e.end_time, 'HH24:MI') as end_time,
      e.location, e.provisional, e.cancelled
    from core.calendar_events e
    where e.org_id = ${input.orgId}::uuid and e.status = 'active' and e.public
      and e.state = 'published' and e.ends_on >= ${input.from}::date
    order by e.starts_on, e.start_time nulls first, e.id
    limit ${input.limit}`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    category: row.category,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    provisional: row.provisional,
    cancelled: row.cancelled,
  }));
}

export interface SpecialDay {
  day: string;
  meaning: string;
  labelEn: string | null;
  labelAr: string | null;
  noteEn: string | null;
  noteAr: string | null;
}

/**
 * The days of the school calendar that are not ordinary teaching or weekend
 * days (holidays, closures, exam days), with their notes.
 */
export async function specialDays(
  tx: Tx,
  input: { tenantId: string; schoolId: string; from: string; to: string },
): Promise<SpecialDay[]> {
  const rows = await tx.execute<{
    day: string;
    meaning: string;
    label_en: string | null;
    label_ar: string | null;
    note_en: string | null;
    note_ar: string | null;
  }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day, x.system_meaning as meaning,
           x.label_en, x.label_ar, d.note_en, d.note_ar
    from core.calendar_dates d
    join core.calendars c on c.tenant_id = d.tenant_id and c.id = d.calendar_id
      and c.kind = 'school' and c.status = 'active'
    join core.descriptors x on x.tenant_id = d.tenant_id and x.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and d.status = 'active' and d.day_on between ${input.from}::date and ${input.to}::date
      and x.system_meaning not in ('instructional_day', 'weekend')
    order by d.day_on`);
  return rows.map((row) => ({
    day: row.day,
    meaning: row.meaning,
    labelEn: row.label_en,
    labelAr: row.label_ar,
    noteEn: row.note_en,
    noteAr: row.note_ar,
  }));
}

export interface FeedRow {
  id: string;
  createdAt: string;
  lastFetchedAt: string | null;
}

/** A person's calendar link at a school, if they have made one. */
export async function feedOf(
  tx: Tx,
  input: { tenantId: string; userId: string; orgId: string },
): Promise<FeedRow | null> {
  const [row] = await tx.execute<{
    id: string;
    created_at: string;
    last_fetched_at: string | null;
  }>(sql`
    select id, ${isoOf(sql`created_at`)} as created_at, ${isoOf(sql`last_fetched_at`)} as last_fetched_at
    from core.calendar_feeds
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active'`);
  return row
    ? {
        id: row.id,
        createdAt: row.created_at,
        lastFetchedAt: row.last_fetched_at,
      }
    : null;
}

/** Retires a person's calendar link, if any, and records a new one by its hash. */
export async function resetFeed(
  tx: Tx,
  input: { tenantId: string; userId: string; orgId: string; tokenHash: string },
) {
  await tx.execute(sql`
    update core.calendar_feeds set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active'`);
  await tx.execute(sql`
    insert into core.calendar_feeds (tenant_id, user_id, org_id, token_hash)
    values (${input.tenantId}::uuid, ${input.userId}::uuid, ${input.orgId}::uuid, ${input.tokenHash})`);
}

/**
 * The live link a secret opens, with its owner's language, and records the
 * fetch. Null for a retired link or an owner who is no longer active.
 */
export async function openFeed(
  tx: Tx,
  input: { tenantId: string; orgId: string; tokenHash: string },
): Promise<{ userId: string; locale: "ar" | "en" } | null> {
  const [row] = await tx.execute<{
    user_id: string;
    locale: string | null;
  }>(sql`
    update core.calendar_feeds f set last_fetched_at = statement_timestamp()
    from core.users u
    where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and f.token_hash = ${input.tokenHash} and f.status = 'active'
      and u.tenant_id = f.tenant_id and u.id = f.user_id and u.status = 'active'
    returning f.user_id, u.preferred_locale as locale`);
  return row
    ? { userId: row.user_id, locale: row.locale === "ar" ? "ar" : "en" }
    : null;
}
