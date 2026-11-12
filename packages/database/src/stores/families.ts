import type { ActingPurpose } from "@faridalms/domain/acting";

import {
  familyRoleFor,
  PARENTAL_MEANINGS,
} from "@faridalms/domain/family-roles";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PostalAddress } from "../tables/tenancy";
import type { MessageReach, RecipientFilter, RecipientRow } from "./messages";
import type { ContactPoint, Scope } from "./students";

import { userRelationships } from "../tables/families";
import { userRoles } from "../tables/membership";
import { bounds, holds, uuidArray } from "./sql";

type Tx = CellTransaction;

const parental = sql`(${sql.join(
  PARENTAL_MEANINGS.map((meaning) => sql`${meaning}`),
  sql`, `,
)})`;

/** One guardian's link to one learner. */
export interface ActingLink {
  studentId: string;
  userId: string;
  linkId: string;
}

/** The learners a person's links permit the purpose for on the day. */
export async function learnersOf(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    on: string;
    purpose: ActingPurpose;
  },
): Promise<ActingLink[]> {
  const rows = await tx.execute<{ id: string; student_user_id: string }>(sql`
    select r.id, r.student_user_id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = ${input.userId}::uuid
      and app.guardian_permits(r, ${input.on}::date, ${input.purpose})
    order by r.student_user_id, r.id`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    userId: input.userId,
    linkId: row.id,
  }));
}

/** The guardians whose links permit the purpose for these learners on the day, first contact first. */
export async function actorsOf(
  tx: Tx,
  input: {
    tenantId: string;
    studentIds: readonly string[];
    on: string;
    purpose: ActingPurpose;
  },
): Promise<ActingLink[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    related_user_id: string;
  }>(sql`
    select r.id, r.student_user_id, r.related_user_id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid
      and r.student_user_id = any(${uuidArray(input.studentIds)})
      and app.guardian_permits(r, ${input.on}::date, ${input.purpose})
    order by r.student_user_id, r.primary_contact desc, r.contact_priority nulls last, r.id`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    userId: row.related_user_id,
    linkId: row.id,
  }));
}

/**
 * Whether the person follows a student of the school on the day: one who
 * holds the student role there, or who left and still reads their record.
 */
export async function followsAtSchool(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    path: readonly string[];
    on: string;
  },
): Promise<boolean> {
  if (input.path.length === 0) return false;
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from core.user_relationships r
      where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = ${input.userId}::uuid
        and app.guardian_permits(r, ${input.on}::date, 'follow')
        and (exists (select 1 from core.user_roles s
               where s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
                 and s.role = 'student' and s.status = 'active' and s.org_id = any(${uuidArray(input.path)})
                 and s.valid_during @> ${input.on}::date)
             or exists (select 1 from core.student_departures d
               where d.tenant_id = r.tenant_id and d.student_user_id = r.student_user_id
                 and d.status = 'active' and d.org_id = any(${uuidArray(input.path)})
                 and d.left_on <= ${input.on}::date and d.access_ends_on > ${input.on}::date))
    ) as found`);
  return row?.found ?? false;
}

/**
 * Of these people, the guardians the viewer reaches through a student they
 * reach: staff, or the school as a whole, open the record of an adult linked
 * to such a student on the day.
 */
export async function guardiansAmong(
  tx: Tx,
  scope: Scope,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct l.related_user_id as user_id from core.user_relationships l
    where l.tenant_id = ${scope.tenantId}::uuid and l.status = 'active'
      and l.valid_during @> ${scope.today}::date
      and l.related_user_id = any(${uuidArray(userIds)})
      and (${scope.schoolWide} or app.is_staff(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date))
      and l.student_user_id in (select student_user_id from app.visible_students(${scope.viewerId}::uuid,
        ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)}))`);
  return rows.map((row) => row.user_id);
}

/** The students on the day with a guardian who follows them or holds legal guardianship. */
export async function studentsWithGuardians(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; on: string },
): Promise<Set<string>> {
  if (input.studentIds.length === 0) return new Set();
  const rows = await tx.execute<{ student_user_id: string }>(sql`
    select distinct r.student_user_id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.valid_during @> ${input.on}::date
      and r.student_user_id = any(${uuidArray(input.studentIds)})
      and (r.portal_access or r.legal_guardian)`);
  return new Set(rows.map((row) => row.student_user_id));
}

/** Each student's first guardian's phone on the day, by contact order. */
export async function guardianPhones(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; on: string },
): Promise<Map<string, string>> {
  if (input.studentIds.length === 0) return new Map();
  const rows = await tx.execute<{ student_user_id: string; phone: string }>(sql`
    select distinct on (r.student_user_id) r.student_user_id, c.normalized as phone
    from core.user_relationships r
    join core.contact_points c on c.tenant_id = r.tenant_id and c.user_id = r.related_user_id
      and c.status = 'active' and c.kind = 'phone' and c.normalized is not null
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.valid_during @> ${input.on}::date
      and r.student_user_id = any(${uuidArray(input.studentIds)})
    order by r.student_user_id, r.primary_contact desc, r.contact_priority nulls last,
      c.priority nulls last, c.created_at`);
  return new Map(rows.map((row) => [row.student_user_id, row.phone]));
}

/** The students whose guardian holds this phone. */
export async function studentsByGuardianPhone(
  tx: Tx,
  input: { tenantId: string; phone: string },
): Promise<string[]> {
  const rows = await tx.execute<{ student_user_id: string }>(sql`
    select distinct r.student_user_id from core.user_relationships r
    join core.contact_points c on c.tenant_id = r.tenant_id and c.user_id = r.related_user_id
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and c.status = 'active' and c.kind = 'phone' and c.normalized = ${input.phone}`);
  return rows.map((row) => row.student_user_id);
}

/**
 * The students who on the day have a link the office must mind: one not
 * allowed to collect them, with limited rights, or cut off from the school.
 */
export async function custodyAlerts(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; on: string },
): Promise<Set<string>> {
  if (input.studentIds.length === 0) return new Set();
  const rows = await tx.execute<{ student_user_id: string }>(sql`
    select distinct r.student_user_id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.valid_during @> ${input.on}::date
      and r.student_user_id = any(${uuidArray(input.studentIds)})
      and (r.pickup = 'not_allowed' or r.educational_rights <> 'full' or r.communication_isolated)`);
  return new Set(rows.map((row) => row.student_user_id));
}

/** Keeps the link a guardian answered a consent through. */
export async function keepConsentLink(
  tx: Tx,
  input: { tenantId: string; consentId: string; relationshipId: string },
) {
  await tx.execute(sql`
    insert into core.consent_guardians (tenant_id, consent_record_id, relationship_id)
    values (${input.tenantId}::uuid, ${input.consentId}::uuid, ${input.relationshipId}::uuid)`);
}

/** The relation each consent answered through a link names, by the consent. */
export async function consentRelations(
  tx: Tx,
  input: { tenantId: string; consentIds: readonly string[] },
): Promise<
  Map<
    string,
    {
      relationshipId: string;
      relationEn: string | null;
      relationAr: string | null;
    }
  >
> {
  if (input.consentIds.length === 0) return new Map();
  const rows = await tx.execute<{
    consent_record_id: string;
    relationship_id: string;
    label_en: string | null;
    label_ar: string | null;
  }>(sql`
    select g.consent_record_id, g.relationship_id, d.label_en, d.label_ar
    from core.consent_guardians g
    join core.user_relationships r on r.tenant_id = g.tenant_id and r.id = g.relationship_id
    left join core.descriptors d on d.tenant_id = r.tenant_id and d.id = r.relation_descriptor_id
    where g.tenant_id = ${input.tenantId}::uuid
      and g.consent_record_id = any(${uuidArray(input.consentIds)})`);
  return new Map(
    rows.map((row) => [
      row.consent_record_id,
      {
        relationshipId: row.relationship_id,
        relationEn: row.label_en,
        relationAr: row.label_ar,
      },
    ]),
  );
}

export interface Guardian {
  relationshipId: string;
  version: number;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationId: string;
  relationMeaning: string;
  legalGuardian: boolean | null;
  portalAccess: boolean;
  receivesNotifications: boolean;
  primaryContact: boolean;
  emergencyContact: boolean;
  contactPriority: number | null;
  residence: "primary" | "secondary" | "none" | null;
  pickup: "allowed" | "not_allowed" | "ask_office" | null;
  educationalRights: "full" | "restricted" | "none";
  communicationIsolated: boolean;
  accessBasis: string;
  from: string;
  hasAccount: boolean;
  contacts: ContactPoint[];
}

export async function guardiansOf(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "today">,
  studentId: string,
): Promise<Guardian[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    related_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_descriptor_id: string;
    relation_meaning: string;
    legal_guardian: boolean | null;
    portal_access: boolean;
    receives_notifications: boolean;
    primary_contact: boolean;
    emergency_contact: boolean;
    contact_priority: number | null;
    residence: Guardian["residence"];
    pickup: Guardian["pickup"];
    educational_rights: Guardian["educationalRights"];
    communication_isolated: boolean;
    access_basis: string;
    valid_during: string;
    has_account: boolean;
  }>(sql`
    select r.id, r.version, r.related_user_id, u.full_name_en, u.full_name_ar, r.relation_descriptor_id,
           r.relation_meaning, r.legal_guardian, r.portal_access, r.receives_notifications, r.primary_contact,
           r.emergency_contact, r.contact_priority, r.residence, r.pickup, r.educational_rights,
           r.communication_isolated, r.access_basis, r.valid_during::text as valid_during,
           exists (select 1 from core.accounts a where a.tenant_id = u.tenant_id and a.user_id = u.id
                   and a.status = 'active' and a.state <> 'disabled') as has_account
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.related_user_id
    where r.tenant_id = ${scope.tenantId}::uuid and r.student_user_id = ${studentId}::uuid
      and r.status = 'active' and r.valid_during @> ${scope.today}::date
    order by r.primary_contact desc, r.contact_priority nulls last, r.created_at`);
  const people = rows.map((row) => row.related_user_id);
  const contacts = people.length
    ? await tx.execute<{
        id: string;
        user_id: string;
        kind: ContactPoint["kind"];
        label: string;
        value: string;
        normalized: string | null;
        postal: PostalAddress | null;
        verified_at: string | null;
      }>(sql`
        select id, user_id, kind, label, value, normalized, postal, verified_at::text as verified_at
        from core.contact_points
        where tenant_id = ${scope.tenantId}::uuid and user_id = any(${uuidArray(people)}) and status = 'active'
        order by priority nulls last, created_at`)
    : [];
  return rows.map((row) => ({
    relationshipId: row.id,
    version: row.version,
    userId: row.related_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    relationId: row.relation_descriptor_id,
    relationMeaning: row.relation_meaning,
    legalGuardian: row.legal_guardian,
    portalAccess: row.portal_access,
    receivesNotifications: row.receives_notifications,
    primaryContact: row.primary_contact,
    emergencyContact: row.emergency_contact,
    contactPriority: row.contact_priority,
    residence: row.residence,
    pickup: row.pickup,
    educationalRights: row.educational_rights,
    communicationIsolated: row.communication_isolated,
    accessBasis: row.access_basis,
    from: bounds(row.valid_during).from,
    hasAccount: row.has_account,
    contacts: contacts
      .filter((contact) => contact.user_id === row.related_user_id)
      .map((contact) => ({
        id: contact.id,
        kind: contact.kind,
        label: contact.label,
        value: contact.value,
        normalized: contact.normalized,
        postal: contact.postal,
        verified: contact.verified_at !== null,
      })),
  }));
}

/**
 * Brings the family roles a person holds in line with their current
 * relationships: a role at each school where a related student holds a
 * current student role, while the relationship grants portal access or legal
 * guardianship. Roles no relationship supports any more end today.
 */
export async function syncFamilyRoles(
  tx: Tx,
  tenantId: string,
  personId: string,
  today: string,
) {
  const links = await tx.execute<{
    relation_meaning: string;
    portal_access: boolean;
    legal_guardian: boolean | null;
    access_basis: string;
    org_id: string;
  }>(sql`
    select r.relation_meaning, r.portal_access, r.legal_guardian, r.access_basis, s.org_id
    from core.user_relationships r
    join lateral (
      select s.org_id from core.user_roles s
      where s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
        and s.role = 'student' and s.status = 'active'
        and (upper_inf(s.valid_during) or upper(s.valid_during) > ${today}::date)
      union
      select d.org_id from core.student_departures d
      where d.tenant_id = r.tenant_id and d.student_user_id = r.student_user_id
        and d.status = 'active' and d.access_ends_on > ${today}::date) s on true
    where r.tenant_id = ${tenantId}::uuid and r.related_user_id = ${personId}::uuid and r.status = 'active'
      and (upper_inf(r.valid_during) or upper(r.valid_during) > ${today}::date)`);
  const wanted = new Set<string>();
  for (const link of links) {
    const role = familyRoleFor(link.relation_meaning, {
      portalAccess: link.portal_access,
      legalGuardian: link.legal_guardian,
      accessBasis: link.access_basis,
    });
    if (role) wanted.add(`${link.org_id}:${role}`);
  }
  const held = await tx.execute<{
    id: string;
    org_id: string;
    role: string;
    lower: string;
  }>(sql`
    select id, org_id, role, lower(valid_during)::text as lower from core.user_roles
    where tenant_id = ${tenantId}::uuid and user_id = ${personId}::uuid and source = 'derived'
      and role in ('parent', 'guardian', 'relative') and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${today}::date)`);
  for (const row of held) {
    if (wanted.delete(`${row.org_id}:${row.role}`)) continue;
    await tx
      .update(userRoles)
      .set(
        row.lower >= today
          ? { status: "tobedeleted" }
          : { validDuring: `[${row.lower},${today})` },
      )
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.id, row.id)));
  }
  for (const key of wanted) {
    const [orgId, role] = key.split(":") as [
      string,
      "parent" | "guardian" | "relative",
    ];
    await tx.insert(userRoles).values({
      tenantId,
      userId: personId,
      orgId,
      orgType: "school",
      role,
      validDuring: `[${today},)`,
      source: "derived",
    });
  }
}

export async function insertRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    relatedUserId: string;
    relationId: string;
    relationMeaning: string;
    flags: {
      legalGuardian: boolean | null;
      portalAccess: boolean;
      receivesNotifications: boolean;
      primaryContact: boolean;
      emergencyContact: boolean;
      residence: "primary" | "secondary" | "none" | null;
      pickup: "allowed" | "not_allowed" | "ask_office" | null;
    };
    from: string;
    /** Who on the staff confirmed it; null for a link a family declared, still to be checked. */
    verifiedByUserId: string | null;
  },
) {
  const [row] = await tx
    .insert(userRelationships)
    .values({
      tenantId: input.tenantId,
      studentUserId: input.studentId,
      relatedUserId: input.relatedUserId,
      relationDescriptorId: input.relationId,
      relationMeaning: input.relationMeaning,
      ...input.flags,
      validDuring: `[${input.from},)`,
      ...(input.verifiedByUserId
        ? {
            verificationMethod: "staff_attested" as const,
            verifiedAt: new Date(),
            verifiedByUserId: input.verifiedByUserId,
          }
        : {}),
    })
    .returning({ id: userRelationships.id });
  if (!row) throw new Error("relationship was not created");
  return row.id;
}

export async function updateRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    expectedVersion: number;
    relationId: string;
    relationMeaning: string;
    flags: {
      legalGuardian: boolean | null;
      portalAccess: boolean;
      receivesNotifications: boolean;
      primaryContact: boolean;
      emergencyContact: boolean;
      residence: "primary" | "secondary" | "none" | null;
      pickup: "allowed" | "not_allowed" | "ask_office" | null;
    };
    editorId: string;
  },
) {
  // Ticking legal guardian is the office confirming it, which is what lets
  // the adult consent for the child; an unchanged tick keeps its confirmation.
  const confirms =
    input.flags.legalGuardian === true
      ? sql`(legal_guardian is not true or verified_at is null)`
      : sql`false`;
  const [row] = await tx
    .update(userRelationships)
    .set({
      relationDescriptorId: input.relationId,
      relationMeaning: input.relationMeaning,
      ...input.flags,
      verificationMethod: sql`case when ${confirms} then 'staff_attested' else verification_method end`,
      verifiedAt: sql`case when ${confirms} then statement_timestamp() else verified_at end`,
      verifiedByUserId: sql`case when ${confirms} then ${input.editorId}::uuid else verified_by_user_id end`,
    })
    .where(
      and(
        eq(userRelationships.tenantId, input.tenantId),
        eq(userRelationships.id, input.relationshipId),
        eq(userRelationships.version, input.expectedVersion),
        eq(userRelationships.status, "active"),
      ),
    )
    .returning({
      id: userRelationships.id,
      relatedUserId: userRelationships.relatedUserId,
    });
  return row ?? null;
}

/** Ends a link today; a link that only began today is withdrawn instead. */
export async function endRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    expectedVersion: number;
    today: string;
  },
) {
  const rows = await tx.execute<{
    related_user_id: string;
    student_user_id: string;
  }>(sql`
    update core.user_relationships
    set valid_during = case when lower(valid_during) >= ${input.today}::date then valid_during
                            else daterange(lower(valid_during), ${input.today}::date, '[)') end,
        status = case when lower(valid_during) >= ${input.today}::date then 'tobedeleted' else status end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.relationshipId}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning related_user_id, student_user_id`);
  return rows[0] ?? null;
}

export async function relationshipOf(
  tx: Tx,
  tenantId: string,
  relationshipId: string,
) {
  const [row] = await tx
    .select({
      id: userRelationships.id,
      studentUserId: userRelationships.studentUserId,
      relatedUserId: userRelationships.relatedUserId,
      version: userRelationships.version,
      relationMeaning: userRelationships.relationMeaning,
      legalGuardian: userRelationships.legalGuardian,
      portalAccess: userRelationships.portalAccess,
      receivesNotifications: userRelationships.receivesNotifications,
      primaryContact: userRelationships.primaryContact,
      emergencyContact: userRelationships.emergencyContact,
      residence: userRelationships.residence,
      pickup: userRelationships.pickup,
    })
    .from(userRelationships)
    .where(
      and(
        eq(userRelationships.tenantId, tenantId),
        eq(userRelationships.id, relationshipId),
        eq(userRelationships.status, "active"),
      ),
    );
  return row ?? null;
}

export interface ChildLink {
  relationshipId: string;
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationId: string;
  /** Whether the link lets the person follow the child in the portal today. */
  follows: boolean;
  /** Full rights decide for the child; restricted ones only follow. */
  educationalRights: "full" | "restricted" | "none";
  /** A legal guardian the office has confirmed, who may consent for the child. */
  consents: boolean;
  visible: boolean;
}

/** The students a person is linked to, marking those the viewer may open. */
export async function childrenOf(
  tx: Tx,
  scope: Scope,
  userId: string,
): Promise<ChildLink[]> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_descriptor_id: string;
    follows: boolean;
    educational_rights: "full" | "restricted" | "none";
    consents: boolean;
    visible: boolean;
  }>(sql`
    select r.id, r.student_user_id, u.full_name_en, u.full_name_ar, r.relation_descriptor_id,
           app.guardian_permits(r, ${scope.today}::date, 'follow') as follows, r.educational_rights,
           app.guardian_permits(r, ${scope.today}::date, 'consent') as consents,
           r.student_user_id in (select student_user_id from app.visible_students(${scope.viewerId}::uuid,
             ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide},
             ${uuidArray(scope.followed)})) as visible
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.student_user_id and u.status = 'active'
    where r.tenant_id = ${scope.tenantId}::uuid and r.related_user_id = ${userId}::uuid and r.status = 'active'
      and r.valid_during @> ${scope.today}::date
    order by u.full_name_en, u.full_name_ar`);
  return rows
    .filter((row) => row.visible)
    .map((row) => ({
      relationshipId: row.id,
      studentId: row.student_user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      relationId: row.relation_descriptor_id,
      follows: row.follows,
      educationalRights: row.educational_rights,
      consents: row.consents,
      visible: row.visible,
    }));
}

/**
 * The viewer's link to a child when it permits the purpose today, as
 * `app.guardian_permits` decides; null when it does not.
 */
export async function permittingLink(
  tx: Tx,
  input: {
    tenantId: string;
    viewerId: string;
    studentId: string;
    today: string;
    purpose: ActingPurpose;
  },
): Promise<string | null> {
  const rows = await tx.execute<{ id: string }>(sql`
    select r.id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = ${input.viewerId}::uuid
      and r.student_user_id = ${input.studentId}::uuid
      and app.guardian_permits(r, ${input.today}::date, ${input.purpose})
    limit 1`);
  return rows[0]?.id ?? null;
}

export interface Sibling {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/** Children who share a parent with this one and whom the viewer reaches. */
export async function siblingsOf(
  tx: Tx,
  scope: Scope,
  studentId: string,
): Promise<Sibling[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id as user_id, u.full_name_en, u.full_name_ar
    from core.user_relationships mine
    join core.user_relationships theirs on theirs.tenant_id = mine.tenant_id
      and theirs.related_user_id = mine.related_user_id and theirs.student_user_id <> mine.student_user_id
      and theirs.status = 'active' and theirs.valid_during @> ${scope.today}::date
      and theirs.relation_meaning in ${parental}
    join core.users u on u.tenant_id = theirs.tenant_id and u.id = theirs.student_user_id and u.status = 'active'
    where mine.tenant_id = ${scope.tenantId}::uuid and mine.student_user_id = ${studentId}::uuid
      and mine.status = 'active' and mine.valid_during @> ${scope.today}::date
      and mine.relation_meaning in ${parental}
      and theirs.student_user_id in (
        select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid,
          ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)}))
    order by u.full_name_en, u.full_name_ar`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}

export interface PickupContact {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationEn: string | null;
  relationAr: string | null;
  pickup: "allowed" | "not_allowed" | "ask_office" | null;
  phone: string | null;
}

/** A child's contacts, with whether each may collect them. */
export async function pickupContacts(
  tx: Tx,
  input: { tenantId: string; studentId: string; day: string },
): Promise<PickupContact[]> {
  const rows = await tx.execute<{
    related_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_en: string | null;
    relation_ar: string | null;
    pickup: PickupContact["pickup"];
    phone: string | null;
  }>(sql`
    select l.related_user_id, u.full_name_en, u.full_name_ar, d.label_en as relation_en,
           d.label_ar as relation_ar, l.pickup,
           (select coalesce(c.normalized, c.value) from core.contact_points c
             where c.tenant_id = u.tenant_id and c.user_id = u.id and c.kind = 'phone'
               and c.status = 'active'
             order by c.priority nulls last, c.created_at limit 1) as phone
    from core.user_relationships l
    join core.users u on u.tenant_id = l.tenant_id and u.id = l.related_user_id
    left join core.descriptors d on d.tenant_id = l.tenant_id and d.id = l.relation_descriptor_id
    where l.tenant_id = ${input.tenantId}::uuid and l.student_user_id = ${input.studentId}::uuid
      and l.status = 'active' and l.valid_during @> ${input.day}::date
    order by l.pickup = 'not_allowed', l.primary_contact desc, l.contact_priority nulls last,
             u.full_name_en`);
  return rows.map((row) => ({
    userId: row.related_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    relationEn: row.relation_en,
    relationAr: row.relation_ar,
    pickup: row.pickup,
    phone: row.phone,
  }));
}

/**
 * The guardians staff may write to: those the school may contact about a
 * student the viewer reaches. Never one without portal access, or one the
 * school keeps apart from its messages.
 */
const guardianCandidates = (reach: MessageReach) => sql`
  select distinct l.related_user_id as user_id from core.user_relationships l
  where l.tenant_id = ${reach.tenantId}::uuid
    and app.is_staff(${reach.viewerId}::uuid, ${reach.schoolId}::uuid, ${reach.today}::date)
    and app.guardian_permits(l, ${reach.today}::date, 'contact')
    and l.related_user_id <> ${reach.viewerId}::uuid
    and l.student_user_id in (select student_user_id from app.visible_students(${reach.viewerId}::uuid,
      ${reach.schoolId}::uuid, ${reach.today}::date, ${reach.schoolWide}, ${uuidArray(reach.followed)}))`;

/**
 * A page of the guardians the viewer may write to, matching their name or
 * a child's, each with the children they are linked to, ranked after staff
 * and before students.
 */
export async function guardianRecipients(
  tx: Tx,
  reach: MessageReach,
  filter: RecipientFilter,
): Promise<RecipientRow[]> {
  if ((filter.among ?? "all") === "students") return [];
  const after = filter.after;
  const only = filter.ids ? uuidArray(filter.ids) : null;
  const rows = await tx.execute<{
    user_id: string;
    sort_name: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    children: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
    }[];
  }>(sql`
    with ranked as (
      select u.id as user_id, u.tenant_id, u.full_name_en, u.full_name_ar,
             coalesce(u.full_name_en, '') as sort_name
      from (${guardianCandidates(reach)}) p
      join core.users u on u.tenant_id = ${reach.tenantId}::uuid and u.id = p.user_id and u.status = 'active'
      where ${only === null ? sql`true` : sql`p.user_id = any(${only})`}
        and (${holds(filter.q, [sql`u.full_name_en`, sql`u.full_name_ar`])}
             or exists (select 1 from core.user_relationships l
               join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
               where l.tenant_id = u.tenant_id and l.related_user_id = u.id and l.status = 'active'
                 and (${holds(filter.q, [sql`s.full_name_en`, sql`s.full_name_ar`])})))
    )
    select r.user_id, r.sort_name, r.full_name_en, r.full_name_ar,
           coalesce((select jsonb_agg(jsonb_build_object('user_id', s.id,
               'full_name_en', s.full_name_en, 'full_name_ar', s.full_name_ar)
               order by s.full_name_en)
             from core.user_relationships l
             join core.users s on s.tenant_id = l.tenant_id and s.id = l.student_user_id
             where l.tenant_id = r.tenant_id and l.related_user_id = r.user_id
               and l.status = 'active' and l.valid_during @> ${reach.today}::date), '[]'::jsonb) as children
    from ranked r
    where ${after === null}::boolean
      or (1, r.sort_name, r.user_id) > (${after?.rank ?? 0}::int, ${after?.name ?? ""}::text,
        ${after?.id ?? null}::uuid)
    order by r.sort_name, r.user_id
    limit ${filter.limit + 1}`);
  return rows.map((row) => ({
    userId: row.user_id,
    kind: "guardian" as const,
    rank: 1,
    sortName: row.sort_name,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    children: row.children.map((child) => ({
      userId: child.user_id,
      fullNameEn: child.full_name_en,
      fullNameAr: child.full_name_ar,
    })),
  }));
}

/** Of these people, the guardians the viewer may write to. */
export async function guardiansReachable(
  tx: Tx,
  reach: MessageReach,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select c.user_id from (${guardianCandidates(reach)}) c
    where c.user_id = any(${uuidArray(userIds)})`);
  return rows.map((row) => row.user_id);
}

/** Whether any student of the school has a guardian linked. */
export async function guardiansLinked(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.user_relationships u
      join core.enrollments s on s.tenant_id = u.tenant_id and s.user_id = u.student_user_id
        and s.org_id = ${input.orgId}::uuid and s.role = 'student' and s.status = 'active'
      where u.tenant_id = ${input.tenantId}::uuid and u.status = 'active') as found`);
  return row?.found ?? false;
}

/**
 * Keeps, for consents recorded again for a learner, the link each guardian
 * who gave one now has to them, where they have one.
 */
export async function relinkConsents(
  tx: Tx,
  input: { tenantId: string; studentId: string; consentIds: readonly string[] },
) {
  if (input.consentIds.length === 0) return;
  await tx.execute(sql`
    insert into core.consent_guardians (tenant_id, consent_record_id, relationship_id)
    select c.tenant_id, c.id, r.id
    from core.consent_records c
    join lateral (select r.id from core.user_relationships r
      where r.tenant_id = c.tenant_id and r.student_user_id = ${input.studentId}::uuid
        and r.related_user_id = c.given_by_user_id and r.status = 'active'
      order by r.created_at desc limit 1) r on true
    where c.tenant_id = ${input.tenantId}::uuid and c.id = any(${uuidArray(input.consentIds)})
      and c.capacity = 'guardian'`);
}

/**
 * Current students who share a parent with any of the people given: the
 * brothers and sisters an applicant would join.
 */
export async function currentChildrenOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    parentIds: readonly string[];
    today: string;
  },
): Promise<{ id: string; nameEn: string | null; nameAr: string | null }[]> {
  if (input.parentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id, u.full_name_en, u.full_name_ar
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.student_user_id and u.status = 'active'
    join core.user_roles s on s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
      and s.role = 'student' and s.status = 'active' and s.org_id = ${input.orgId}::uuid
      and s.valid_during @> ${input.today}::date
    where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = any(${uuidArray(input.parentIds)})
      and r.status = 'active' and r.valid_during @> ${input.today}::date
      and r.relation_meaning in ${parental}
    limit 10`);
  return rows.map((row) => ({
    id: row.id,
    nameEn: row.full_name_en,
    nameAr: row.full_name_ar,
  }));
}

/**
 * Everyone whose record the viewer reaches as a guardian of a student they
 * reach on the day: staff, or the school as a whole.
 */
export async function guardiansOpenedTo(
  tx: Tx,
  scope: Scope,
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct l.related_user_id as user_id from core.user_relationships l
    where l.tenant_id = ${scope.tenantId}::uuid and l.status = 'active'
      and l.valid_during @> ${scope.today}::date
      and (${scope.schoolWide} or app.is_staff(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date))
      and l.student_user_id in (select student_user_id from app.visible_students(${scope.viewerId}::uuid,
        ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)}))`);
  return rows.map((row) => row.user_id);
}

/**
 * What the student list says of each of the school's students' guardians
 * on the day: the first guardian's phone, `linked` for a guardian with
 * none, or `missing` where no guardian follows the student or holds legal
 * guardianship.
 */
export async function guardianColumn(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
): Promise<Map<string, string>> {
  const rows = await tx.execute<{
    student_user_id: string;
    has_guardian: boolean;
    phone: string | null;
  }>(sql`
    select s.user_id as student_user_id,
           exists (select 1 from core.user_relationships r
             where r.tenant_id = s.tenant_id and r.student_user_id = s.user_id and r.status = 'active'
               and r.valid_during @> ${input.on}::date and (r.portal_access or r.legal_guardian)) as has_guardian,
           (select c.normalized from core.user_relationships r
              join core.contact_points c on c.tenant_id = r.tenant_id and c.user_id = r.related_user_id
              where r.tenant_id = s.tenant_id and r.student_user_id = s.user_id and r.status = 'active'
                and r.valid_during @> ${input.on}::date and c.status = 'active' and c.kind = 'phone'
              order by r.primary_contact desc, r.contact_priority nulls last, c.priority nulls last,
                c.created_at
              limit 1) as phone
    from (select distinct tenant_id, user_id from core.user_roles
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
        and role = 'student' and status = 'active') s`);
  return new Map(
    rows.map((row) => [
      row.student_user_id,
      !row.has_guardian ? "missing" : (row.phone ?? "linked"),
    ]),
  );
}

/** The order the guardian column sorts by: no guardian, one without a phone, then the phones. */
export function guardianColumnOrder(values: ReadonlyMap<string, string>) {
  const phones = new Set(values.values());
  phones.delete("missing");
  phones.delete("linked");
  return ["missing", "linked", ...[...phones].toSorted()];
}

/** How many of the school's students have a link on the day that restricts what a guardian may do. */
export async function restrictedLinks(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
): Promise<number> {
  const [row] = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.valid_during @> ${input.on}::date
      and (r.pickup = 'not_allowed' or r.educational_rights <> 'full' or r.communication_isolated)
      and exists (select 1 from core.user_roles s
        where s.tenant_id = r.tenant_id and s.user_id = r.student_user_id and s.org_id = ${input.schoolId}::uuid
          and s.role = 'student' and s.status = 'active')`);
  return row?.count ?? 0;
}

type AudienceOwnerKind = "broadcast" | "calendar_event";

const FAMILY_AUDIENCES = {
  broadcast: { table: "broadcast_families", column: "broadcast_id" },
  calendar_event: { table: "calendar_event_families", column: "event_id" },
} as const;

const familyAudience = (kind: AudienceOwnerKind) => ({
  table: sql`core.${sql.identifier(FAMILY_AUDIENCES[kind].table)}`,
  column: sql.identifier(FAMILY_AUDIENCES[kind].column),
});

/** Whether an announcement or event goes to the families of every student. */
export async function toFamilies(
  tx: Tx,
  input: { tenantId: string; kind: AudienceOwnerKind; id: string },
): Promise<boolean> {
  const { table, column } = familyAudience(input.kind);
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from ${table}
      where tenant_id = ${input.tenantId}::uuid and ${column} = ${input.id}::uuid
        and status = 'active') as found`);
  return row?.found ?? false;
}

/** Sends an announcement or event to the families of every student, or stops. */
export async function setToFamilies(
  tx: Tx,
  input: { tenantId: string; kind: AudienceOwnerKind; id: string; on: boolean },
) {
  const { table, column } = familyAudience(input.kind);
  await tx.execute(sql`
    update ${table} set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and ${column} = ${input.id}::uuid
      and status = 'active'`);
  if (input.on)
    await tx.execute(sql`
      insert into ${table} (tenant_id, ${column}) values (${input.tenantId}::uuid, ${input.id}::uuid)`);
}

/** The announcements or events that go to the families of every student. */
export async function ownersToFamilies(
  tx: Tx,
  input: { tenantId: string; kind: AudienceOwnerKind },
): Promise<string[]> {
  const { table, column } = familyAudience(input.kind);
  const rows = await tx.execute<{ id: string }>(sql`
    select ${column} as id from ${table}
    where tenant_id = ${input.tenantId}::uuid and status = 'active'`);
  return rows.map((row) => row.id);
}
