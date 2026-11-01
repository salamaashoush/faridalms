import type {
  CloseReason,
  EnquiryAnswer,
  EnquiryListQuery,
  EnquiryPurpose,
  EnquirySource,
  EnquiryState,
  EntryKind,
} from "@faridalms/domain/enquiries";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { escapeLike, isoOf } from "./sql";

type Tx = CellTransaction;

export interface PersonName {
  id: string;
  nameEn: string | null;
  nameAr: string | null;
}

const person = (
  id: string | null,
  nameEn: string | null,
  nameAr: string | null,
): PersonName | null => (id ? { id, nameEn, nameAr } : null);

export interface EnquiryListRow {
  id: string;
  version: number;
  source: EnquirySource;
  purpose: EnquiryPurpose;
  state: EnquiryState;
  closedReason: CloseReason | null;
  name: string;
  email: string;
  phone: string;
  childName: string;
  childYear: string;
  preview: string;
  assignee: PersonName | null;
  createdAt: string;
  firstRespondedAt: string | null;
}

export interface EnquiryList {
  rows: EnquiryListRow[];
  total: number;
  /** How many there are in each state with the other filters applied. */
  counts: Record<EnquiryState, number>;
}

/**
 * A school's enquiries for the inbox: one state or all, narrowed by source,
 * purpose, assignee and words in the family's name, address, phone or
 * child's name; newest first.
 */
export async function listEnquiries(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    viewerId: string;
    query: EnquiryListQuery;
    limit: number;
    offset: number;
  },
): Promise<EnquiryList> {
  const { query } = input;
  const q = query.q ? `%${escapeLike(query.q)}%` : null;
  const assignee =
    query.assignee === "me"
      ? input.viewerId
      : query.assignee === "all" || query.assignee === "none"
        ? null
        : query.assignee;
  const narrowed = sql`e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.orgId}::uuid
    and e.status = 'active'
    and (${query.source} = 'all' or e.source = ${query.source})
    and (${query.purpose} = 'all' or e.purpose = ${query.purpose})
    and (${query.assignee} <> 'none' or e.assignee_user_id is null)
    and (${assignee}::uuid is null or e.assignee_user_id = ${assignee}::uuid)
    and (${q}::text is null or e.name ilike ${q} or e.email ilike ${q} or e.phone ilike ${q}
      or e.child_name ilike ${q})`;
  const counted = await tx.execute<{ state: EnquiryState; n: number }>(sql`
    select e.state, count(*)::int as n from core.site_enquiries e
    where ${narrowed} group by e.state`);
  const counts: Record<EnquiryState, number> = {
    open: 0,
    in_progress: 0,
    converted: 0,
    closed: 0,
  };
  for (const row of counted) counts[row.state] = row.n;
  const total =
    query.state === "all"
      ? Object.values(counts).reduce((sum, n) => sum + n, 0)
      : counts[query.state];
  const rows = await tx.execute<{
    id: string;
    version: number;
    source: EnquirySource;
    purpose: EnquiryPurpose;
    state: EnquiryState;
    closed_reason: CloseReason | null;
    name: string;
    email: string;
    phone: string;
    child_name: string;
    child_year: string;
    preview: string;
    assignee_id: string | null;
    assignee_en: string | null;
    assignee_ar: string | null;
    created_at: string;
    first_responded_at: string | null;
  }>(sql`
    select e.id, e.version, e.source, e.purpose, e.state, e.closed_reason, e.name, e.email,
      e.phone, e.child_name, e.child_year, left(e.message, 200) as preview,
      e.assignee_user_id as assignee_id, a.full_name_en as assignee_en, a.full_name_ar as assignee_ar,
      ${isoOf(sql`e.created_at`)} as created_at,
      case when e.first_responded_at is null then null else ${isoOf(sql`e.first_responded_at`)} end
        as first_responded_at
    from core.site_enquiries e
    left join core.users a on a.tenant_id = e.tenant_id and a.id = e.assignee_user_id
    where ${narrowed} and (${query.state} = 'all' or e.state = ${query.state})
    order by e.created_at desc, e.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total,
    counts,
    rows: rows.map((row) => ({
      id: row.id,
      version: row.version,
      source: row.source,
      purpose: row.purpose,
      state: row.state,
      closedReason: row.closed_reason,
      name: row.name,
      email: row.email,
      phone: row.phone,
      childName: row.child_name,
      childYear: row.child_year,
      preview: row.preview,
      assignee: person(row.assignee_id, row.assignee_en, row.assignee_ar),
      createdAt: row.created_at,
      firstRespondedAt: row.first_responded_at,
    })),
  };
}

export interface EnquiryRecord extends EnquiryListRow {
  locale: "en" | "ar";
  message: string;
  answers: EnquiryAnswer[];
  pageTitleEn: string | null;
  pageTitleAr: string | null;
  createdBy: PersonName | null;
  stateChangedAt: string;
  familyUserId: string | null;
  applicantUserId: string | null;
}

/** One enquiry of a school, with who holds it and who logged it. */
export async function enquiryById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<EnquiryRecord | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    source: EnquirySource;
    purpose: EnquiryPurpose;
    state: EnquiryState;
    closed_reason: CloseReason | null;
    locale: "en" | "ar";
    name: string;
    email: string;
    phone: string;
    child_name: string;
    child_year: string;
    message: string;
    answers: EnquiryAnswer[];
    page_title_en: string | null;
    page_title_ar: string | null;
    assignee_id: string | null;
    assignee_en: string | null;
    assignee_ar: string | null;
    creator_id: string | null;
    creator_en: string | null;
    creator_ar: string | null;
    created_at: string;
    first_responded_at: string | null;
    state_changed_at: string;
    family_user_id: string | null;
    applicant_user_id: string | null;
  }>(sql`
    select e.id, e.version, e.source, e.purpose, e.state, e.closed_reason, e.locale, e.name,
      e.email, e.phone, e.child_name, e.child_year, e.message, e.answers,
      nullif(p.title_en, '') as page_title_en, nullif(p.title_ar, '') as page_title_ar,
      e.assignee_user_id as assignee_id, a.full_name_en as assignee_en, a.full_name_ar as assignee_ar,
      e.created_by_user_id as creator_id, c.full_name_en as creator_en, c.full_name_ar as creator_ar,
      ${isoOf(sql`e.created_at`)} as created_at,
      case when e.first_responded_at is null then null else ${isoOf(sql`e.first_responded_at`)} end
        as first_responded_at,
      ${isoOf(sql`e.state_changed_at`)} as state_changed_at,
      e.family_user_id, e.applicant_user_id
    from core.site_enquiries e
    left join core.site_pages p on p.tenant_id = e.tenant_id and p.id = e.page_id
    left join core.users a on a.tenant_id = e.tenant_id and a.id = e.assignee_user_id
    left join core.users c on c.tenant_id = e.tenant_id and c.id = e.created_by_user_id
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.orgId}::uuid
      and e.id = ${input.id}::uuid and e.status = 'active'`);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    source: row.source,
    purpose: row.purpose,
    state: row.state,
    closedReason: row.closed_reason,
    locale: row.locale,
    name: row.name,
    email: row.email,
    phone: row.phone,
    childName: row.child_name,
    childYear: row.child_year,
    preview: row.message.slice(0, 200),
    message: row.message,
    answers: Array.isArray(row.answers) ? row.answers : [],
    pageTitleEn: row.page_title_en,
    pageTitleAr: row.page_title_ar,
    assignee: person(row.assignee_id, row.assignee_en, row.assignee_ar),
    createdBy: person(row.creator_id, row.creator_en, row.creator_ar),
    createdAt: row.created_at,
    firstRespondedAt: row.first_responded_at,
    stateChangedAt: row.state_changed_at,
    familyUserId: row.family_user_id,
    applicantUserId: row.applicant_user_id,
  };
}

/** The family's other enquiries at the school, found by the same email or phone. */
export async function relatedEnquiries(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    email: string;
    phone: string;
  },
): Promise<
  {
    id: string;
    name: string;
    purpose: EnquiryPurpose;
    state: EnquiryState;
    createdAt: string;
  }[]
> {
  if (!input.email && !input.phone) return [];
  const rows = await tx.execute<{
    id: string;
    name: string;
    purpose: EnquiryPurpose;
    state: EnquiryState;
    created_at: string;
  }>(sql`
    select e.id, e.name, e.purpose, e.state, ${isoOf(sql`e.created_at`)} as created_at
    from core.site_enquiries e
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.orgId}::uuid
      and e.status = 'active' and e.id <> ${input.id}::uuid
      and ((${input.email} <> '' and lower(e.email) = lower(${input.email}))
        or (${input.phone} <> '' and e.phone = ${input.phone}))
    order by e.created_at desc
    limit 10`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    state: row.state,
    createdAt: row.created_at,
  }));
}

/** An enquiry staff took by hand, worked from the start by whoever logged it. */
export async function insertLoggedEnquiry(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    source: Exclude<EnquirySource, "website">;
    purpose: EnquiryPurpose;
    locale: "en" | "ar";
    name: string;
    email: string;
    phone: string;
    childName: string;
    childYear: string;
    message: string;
    assigneeUserId: string | null;
    createdByUserId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.site_enquiries (tenant_id, org_id, source, locale, purpose, name, email, phone,
      child_name, child_year, message, assignee_user_id, created_by_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.source}, ${input.locale},
      ${input.purpose}, ${input.name}, ${input.email}, ${input.phone}, ${input.childName},
      ${input.childYear}, ${input.message}, ${input.assigneeUserId}::uuid,
      ${input.createdByUserId}::uuid)
    returning id, version`);
  if (!row) throw new Error("The enquiry was not recorded");
  return row;
}

/** Hands an enquiry to someone, or to nobody; null when it changed meanwhile. */
export async function setEnquiryAssignee(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
    assigneeUserId: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_enquiries set assignee_user_id = ${input.assigneeUserId}::uuid
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Moves an enquiry to a state, with the reason when it closes; null when it changed meanwhile. */
export async function setEnquiryState(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
    state: EnquiryState;
    closedReason: CloseReason | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_enquiries
    set state = ${input.state}, closed_reason = ${input.closedReason},
      state_changed_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Records that someone talked to the family: the first time sets the
 * response time, and an open enquiry is then in progress. Answers whether
 * the state moved. Locks the row, so two replies at once count once.
 */
export async function markResponded(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<{ moved: boolean; first: boolean }> {
  const [row] = await tx.execute<{ was_open: boolean; was_new: boolean }>(sql`
    with before as (
      select id, state = 'open' as was_open, first_responded_at is null as was_new
      from core.site_enquiries
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
        and id = ${input.id}::uuid and status = 'active'
      for update
    )
    update core.site_enquiries e
    set first_responded_at = coalesce(e.first_responded_at, statement_timestamp()),
      state = case when e.state = 'open' then 'in_progress' else e.state end,
      state_changed_at = case when e.state = 'open' then statement_timestamp() else e.state_changed_at end
    from before b
    where e.tenant_id = ${input.tenantId}::uuid and e.id = b.id
      and (b.was_open or b.was_new)
    returning b.was_open, b.was_new`);
  return { moved: row?.was_open ?? false, first: row?.was_new ?? false };
}

/** What an entry records beside its words: a change's from and to, a reply's subject. */
export type EntryDetails = Record<string, string | boolean | null>;

export interface EntryRow {
  id: string;
  kind: EntryKind;
  body: string;
  details: EntryDetails;
  author: PersonName | null;
  createdAt: string;
}

export async function insertEntry(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    enquiryId: string;
    kind: EntryKind;
    body: string;
    details?: EntryDetails;
    authorUserId: string | null;
  },
): Promise<{ id: string; createdAt: string }> {
  const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
    insert into core.site_enquiry_entries (tenant_id, org_id, enquiry_id, kind, body, details,
      author_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.enquiryId}::uuid, ${input.kind},
      ${input.body}, ${JSON.stringify(input.details ?? {})}::text::jsonb, ${input.authorUserId}::uuid)
    returning id, ${isoOf(sql`created_at`)} as created_at`);
  if (!row) throw new Error("The entry was not recorded");
  return { id: row.id, createdAt: row.created_at };
}

/** An enquiry's thread, oldest first. */
export async function entriesOf(
  tx: Tx,
  input: { tenantId: string; enquiryId: string },
): Promise<EntryRow[]> {
  const rows = await tx.execute<{
    id: string;
    kind: EntryKind;
    body: string;
    details: EntryDetails;
    author_id: string | null;
    author_en: string | null;
    author_ar: string | null;
    created_at: string;
  }>(sql`
    select n.id, n.kind, n.body, n.details, n.author_user_id as author_id,
      u.full_name_en as author_en, u.full_name_ar as author_ar,
      ${isoOf(sql`n.created_at`)} as created_at
    from core.site_enquiry_entries n
    left join core.users u on u.tenant_id = n.tenant_id and u.id = n.author_user_id
    where n.tenant_id = ${input.tenantId}::uuid and n.enquiry_id = ${input.enquiryId}::uuid
    order by n.created_at, n.id`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    body: row.body,
    details: row.details,
    author: person(row.author_id, row.author_en, row.author_ar),
    createdAt: row.created_at,
  }));
}
