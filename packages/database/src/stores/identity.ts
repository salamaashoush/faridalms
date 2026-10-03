import type { Capability, Profile } from "@faridalms/domain/capabilities";
import type { Feature } from "@faridalms/domain/features";
import type { SessionContext } from "@faridalms/domain/workspace";

import { PROFILE_CAPS } from "@faridalms/domain/capabilities";
import { YOUNG_STUDENT_GRADES } from "@faridalms/domain/descriptors/catalogue";
import { FEATURE_DEFAULTS, FEATURES } from "@faridalms/domain/features";
import {
  ADMINISTRATION_ROLES,
  builtinFor,
  contextsFor,
} from "@faridalms/domain/workspace";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ClientKind } from "../tables/accounts";

import {
  accounts,
  authAttempts,
  loginIdentities,
  orgFeatures,
  orgs,
  sessions,
  users,
} from "../tables/index";

type Tx = CellTransaction;

/** The org and its ancestors, nearest first. */
export async function orgPath(tx: Tx, tenantId: string, orgId: string) {
  const rows = await tx.execute<{ id: string; depth: number }>(sql`
    with recursive path as (
      select id, parent_id, 0 as depth from core.orgs where tenant_id = ${tenantId}::uuid and id = ${orgId}::uuid
      union all
      select o.id, o.parent_id, p.depth + 1
      from core.orgs o join path p on o.tenant_id = ${tenantId}::uuid and o.id = p.parent_id
    )
    select id, depth from path order by depth`);
  return rows.map((row) => row.id);
}

export interface EffectiveAccess {
  profile: Profile;
  capabilities: ReadonlySet<Capability>;
  roles: string[];
  contexts: SessionContext[];
}

/**
 * Capabilities of a person at a school on a date: the access roles assigned
 * there or above; unless one of them replaces the built-ins, the built-in role
 * of each natural role held there or above, from the most specific org that
 * has one; all capped by the profile the session's context derives.
 */
export async function effectiveAccess(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    orgId: string;
    today: string;
    context: SessionContext;
  },
): Promise<EffectiveAccess> {
  const path = await orgPath(tx, input.tenantId, input.orgId);
  if (path.length === 0)
    return {
      profile: "family",
      capabilities: new Set(),
      roles: [],
      contexts: [],
    };
  const depth = new Map(path.map((id, index) => [id, index]));
  const roleRows = await tx.execute<{ role: string }>(sql`
    select distinct role from core.user_roles
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id in ${path} and status = 'active' and valid_during @> ${input.today}::date`);
  const roles = roleRows.map((row) => row.role);
  const assigned = await tx.execute<{
    replaces_builtin: boolean;
    capabilities: string[];
  }>(sql`
    select a.replaces_builtin, r.capabilities
    from core.access_role_assignments a
    join core.access_roles r on r.tenant_id = a.tenant_id and r.id = a.access_role_id
    where a.tenant_id = ${input.tenantId}::uuid and a.user_id = ${input.userId}::uuid
      and a.org_id in ${path} and a.status = 'active' and r.status = 'active'
      and a.valid_during @> ${input.today}::date`);
  const granted = new Set<string>();
  for (const row of assigned)
    for (const cap of row.capabilities) granted.add(cap);
  if (!assigned.some((row) => row.replaces_builtin) && roles.length > 0) {
    const keys = [...new Set(roles.map(builtinFor))];
    const builtins = await tx.execute<{
      builtin_key: string;
      org_id: string | null;
      capabilities: string[];
    }>(sql`
      select builtin_key, org_id, capabilities from core.access_roles
      where tenant_id = ${input.tenantId}::uuid and builtin_key in ${keys}
        and (org_id is null or org_id in ${path}) and status = 'active'`);
    for (const key of keys) {
      const nearest = builtins
        .filter((row) => row.builtin_key === key)
        .toSorted(
          (a, b) =>
            (a.org_id === null
              ? path.length
              : (depth.get(a.org_id) ?? path.length)) -
            (b.org_id === null
              ? path.length
              : (depth.get(b.org_id) ?? path.length)),
        )[0];
      for (const cap of nearest?.capabilities ?? []) granted.add(cap);
    }
  }
  let contexts = contextsFor(roles);
  // A legal guardian holds a family role without portal access; only a
  // portal link opens the family workspace.
  if (contexts.includes("family")) {
    const portal = await tx.execute<{ found: boolean }>(sql`
      select exists (
        select 1 from core.user_relationships r
        join core.user_roles s on s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
          and s.role = 'student' and s.status = 'active' and s.org_id in ${path}
          and s.valid_during @> ${input.today}::date
        where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = ${input.userId}::uuid
          and r.status = 'active' and r.portal_access and r.valid_during @> ${input.today}::date
      ) as found`);
    if (!portal[0]?.found)
      contexts = contexts.filter((context) => context !== "family");
  }
  let profile: Profile;
  if (input.context === "staff")
    profile =
      roles.some((role) =>
        (ADMINISTRATION_ROLES as readonly string[]).includes(role),
      ) ||
      granted.has("school:manage") ||
      granted.has("access:manage")
        ? "staff_admin"
        : "staff";
  else if (input.context === "family") profile = "family";
  else {
    const grade = await tx.execute<{ meaning: string | null }>(sql`
      select d.system_meaning as meaning
      from core.student_school_years s
      join core.descriptors d on d.tenant_id = s.tenant_id and d.id = s.grade_level_descriptor_id
      where s.tenant_id = ${input.tenantId}::uuid and s.student_user_id = ${input.userId}::uuid
        and s.org_id = ${input.orgId}::uuid and s.status = 'active'
        and s.valid_during @> ${input.today}::date
      limit 1`);
    const meaning = grade[0]?.meaning ?? null;
    profile =
      meaning && (YOUNG_STUDENT_GRADES as readonly string[]).includes(meaning)
        ? "young_student"
        : "student";
  }
  if (!contexts.includes(input.context))
    return { profile, capabilities: new Set(), roles, contexts };
  const cap = PROFILE_CAPS[profile];
  return {
    profile,
    capabilities: new Set(
      [...granted].filter((value): value is Capability =>
        cap.has(value as Capability),
      ),
    ),
    roles,
    contexts,
  };
}

export async function findPasswordIdentity(tx: Tx, loginName: string) {
  const [row] = await tx
    .select({
      identityId: loginIdentities.id,
      secretHash: loginIdentities.secretHash,
      lockedUntil: loginIdentities.lockedUntil,
      failedAttempts: loginIdentities.failedAttempts,
      accountId: accounts.id,
      accountState: accounts.state,
      userId: users.id,
      firstAuthenticatedAt: accounts.firstAuthenticatedAt,
    })
    .from(loginIdentities)
    .innerJoin(
      accounts,
      and(
        eq(accounts.tenantId, loginIdentities.tenantId),
        eq(accounts.id, loginIdentities.accountId),
      ),
    )
    .innerJoin(
      users,
      and(eq(users.tenantId, accounts.tenantId), eq(users.id, accounts.userId)),
    )
    .where(
      and(
        eq(loginIdentities.loginName, loginName),
        eq(loginIdentities.kind, "password"),
        eq(loginIdentities.status, "active"),
        isNull(loginIdentities.voidedAt),
        eq(accounts.status, "active"),
        eq(users.status, "active"),
      ),
    );
  return row ?? null;
}

/**
 * Counts an attempt against a key and returns the count in its window. The key
 * is an HMAC, never a raw login name or address.
 */
export async function countAttempt(
  tx: Tx,
  tenantId: string,
  keyHash: Buffer,
  windowMinutes: number,
): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    insert into core.auth_attempts (tenant_id, key_hash, count, window_ends_at)
    values (${tenantId}::uuid, ${keyHash}::bytea, 1, statement_timestamp() + make_interval(mins => ${windowMinutes}))
    on conflict (tenant_id, key_hash) do update set
      count = case when core.auth_attempts.window_ends_at < statement_timestamp() then 1
                   else core.auth_attempts.count + 1 end,
      window_ends_at = case when core.auth_attempts.window_ends_at < statement_timestamp()
                            then statement_timestamp() + make_interval(mins => ${windowMinutes})
                            else core.auth_attempts.window_ends_at end
    returning count`);
  return rows[0]?.count ?? 1;
}

/** The attempts counted against a key in its open window, counting none. */
export async function attemptsSoFar(
  tx: Tx,
  tenantId: string,
  keyHash: Buffer,
): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    select count from core.auth_attempts
    where tenant_id = ${tenantId}::uuid and key_hash = ${keyHash}::bytea
      and window_ends_at >= statement_timestamp()`);
  return rows[0]?.count ?? 0;
}

export async function clearAttempts(tx: Tx, tenantId: string, keyHash: Buffer) {
  await tx
    .update(authAttempts)
    .set({ windowEndsAt: sql`statement_timestamp()` })
    .where(
      and(
        eq(authAttempts.tenantId, tenantId),
        eq(authAttempts.keyHash, keyHash),
      ),
    );
}

export interface NewSession {
  tenantId: string;
  accountId: string;
  tokenHash: Buffer;
  loginIdentityId: string | null;
  context: SessionContext;
  activeOrgId: string;
  idleMinutes: number;
  absoluteMinutes: number;
  ipPrefix: string | null;
  userAgentSummary: string | null;
  /** How the person proved who they are; a password unless named. */
  method?: "pwd" | "badge" | "guardian";
  /** A badge signs in on a device several children share. */
  clientKind?: ClientKind;
}

export async function createSession(tx: Tx, input: NewSession) {
  const now = new Date();
  const [row] = await tx
    .insert(sessions)
    .values({
      tenantId: input.tenantId,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      authenticatedAt: now,
      lastSeenAt: now,
      idleExpiresAt: new Date(now.getTime() + input.idleMinutes * 60_000),
      absoluteExpiresAt: new Date(
        now.getTime() + input.absoluteMinutes * 60_000,
      ),
      aal: 1,
      amr: [input.method ?? "pwd"],
      loginIdentityId: input.loginIdentityId,
      context: input.context,
      activeOrgId: input.activeOrgId,
      clientKind: input.clientKind ?? "web",
      ipPrefix: input.ipPrefix,
      userAgentSummary: input.userAgentSummary,
    })
    .returning({
      id: sessions.id,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
    });
  if (!row) throw new Error("session was not created");
  return row;
}

export interface ActiveSession {
  id: string;
  accountId: string;
  userId: string;
  context: SessionContext;
  clientKind: ClientKind;
  activeOrgId: string | null;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  authenticatedAt: Date;
}

export async function findSession(
  tx: Tx,
  tenantId: string,
  tokenHash: Buffer,
): Promise<ActiveSession | null> {
  const now = new Date();
  const [row] = await tx
    .select({
      id: sessions.id,
      accountId: sessions.accountId,
      userId: accounts.userId,
      context: sessions.context,
      clientKind: sessions.clientKind,
      activeOrgId: sessions.activeOrgId,
      lastSeenAt: sessions.lastSeenAt,
      idleExpiresAt: sessions.idleExpiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      authenticatedAt: sessions.authenticatedAt,
    })
    .from(sessions)
    .innerJoin(
      accounts,
      and(
        eq(accounts.tenantId, sessions.tenantId),
        eq(accounts.id, sessions.accountId),
      ),
    )
    .innerJoin(
      users,
      and(eq(users.tenantId, accounts.tenantId), eq(users.id, accounts.userId)),
    )
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
        eq(accounts.state, "active"),
        eq(accounts.status, "active"),
        eq(users.status, "active"),
      ),
    );
  return row ?? null;
}

/** Moves the idle expiry forward, at most once a minute so reads stay reads. */
export async function touchSession(
  tx: Tx,
  session: ActiveSession,
  idleMinutes: number,
) {
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() < 60_000) return;
  const idle = new Date(
    Math.min(now + idleMinutes * 60_000, session.absoluteExpiresAt.getTime()),
  );
  await tx
    .update(sessions)
    .set({ lastSeenAt: new Date(now), idleExpiresAt: idle })
    .where(eq(sessions.id, session.id));
}

export async function sessionExpiresAt(
  tx: Tx,
  sessionId: string,
): Promise<Date | null> {
  const [row] = await tx
    .select({ absoluteExpiresAt: sessions.absoluteExpiresAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  return row?.absoluteExpiresAt ?? null;
}

export async function revokeSession(
  tx: Tx,
  sessionId: string,
  reason: "sign_out" | "context_switch" | "admin" | "credential_change",
  replacedBy?: string,
) {
  await tx
    .update(sessions)
    .set({
      revokedAt: new Date(),
      revokedReason: reason,
      replacedBySessionId: replacedBy ?? null,
    })
    .where(eq(sessions.id, sessionId));
}

export async function recordSignIn(
  tx: Tx,
  input: { accountId: string; identityId: string; firstTime: boolean },
) {
  const now = new Date();
  await tx
    .update(accounts)
    .set({
      lastAuthenticatedAt: now,
      ...(input.firstTime ? { firstAuthenticatedAt: now } : {}),
    })
    .where(eq(accounts.id, input.accountId));
  await tx
    .update(loginIdentities)
    .set({ lastUsedAt: now, failedAttempts: 0, lockedUntil: null })
    .where(eq(loginIdentities.id, input.identityId));
}

export async function recordFailure(
  tx: Tx,
  identityId: string,
  attempts: number,
) {
  await tx
    .update(loginIdentities)
    .set({
      failedAttempts: Math.min(attempts, 100),
      lockedUntil: attempts >= 100 ? new Date(Date.now() + 86_400_000) : null,
    })
    .where(eq(loginIdentities.id, identityId));
}

export async function rehashSecret(
  tx: Tx,
  identityId: string,
  secretHash: string,
) {
  await tx
    .update(loginIdentities)
    .set({ secretHash, secretSetAt: new Date() })
    .where(eq(loginIdentities.id, identityId));
}

export interface Viewer {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  preferredGivenName: string | null;
  username: string | null;
  photoFileId: string | null;
  preferredLocale: "ar" | "en" | null;
}

export async function viewer(tx: Tx, userId: string): Promise<Viewer | null> {
  const [row] = await tx
    .select({
      id: users.id,
      fullNameEn: users.fullNameEn,
      fullNameAr: users.fullNameAr,
      preferredGivenName: users.preferredGivenName,
      username: users.username,
      photoFileId: users.photoFileId,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

export async function schoolProfile(tx: Tx, orgId: string) {
  const [row] = await tx
    .select({
      id: orgs.id,
      nameEn: orgs.nameEn,
      nameAr: orgs.nameAr,
      timeZone: orgs.timeZone,
      defaultLocale: orgs.defaultLocale,
      weekStart: orgs.weekStart,
      weekendDays: orgs.weekendDays,
      secondaryCalendar: orgs.secondaryCalendar,
      countryCode: orgs.countryCode,
      logoFileId: orgs.logoFileId,
    })
    .from(orgs)
    .where(and(eq(orgs.id, orgId), eq(orgs.type, "school")));
  return row ?? null;
}

export async function schoolFeatures(
  tx: Tx,
  tenantId: string,
  schoolId: string,
): Promise<Record<Feature, boolean>> {
  const path = await orgPath(tx, tenantId, schoolId);
  const result = { ...FEATURE_DEFAULTS };
  if (path.length === 0) return result;
  const rows = await tx
    .select({
      orgId: orgFeatures.orgId,
      feature: orgFeatures.feature,
      enabled: orgFeatures.enabled,
    })
    .from(orgFeatures)
    .where(
      and(eq(orgFeatures.status, "active"), inArray(orgFeatures.orgId, path)),
    );
  for (const feature of FEATURES) {
    const nearest = rows
      .filter((row) => row.feature === feature)
      .toSorted((a, b) => path.indexOf(a.orgId) - path.indexOf(b.orgId))[0];
    if (nearest) result[feature] = nearest.enabled;
  }
  return result;
}
