import { YOUNG_STUDENT_GRADES } from "@faridalms/domain/descriptors/catalogue";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities, sessions } from "../tables/accounts";
import { users } from "../tables/people";
import { newUserHandle } from "./accounts";
import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface BadgeHolder {
  identityId: string;
  accountId: string;
  accountState: string;
  userId: string;
  firstAuthenticatedAt: Date | null;
}

/** The person a badge signs in, while it is neither voided nor expired. */
export async function findBadge(
  tx: Tx,
  secretHash: string,
): Promise<BadgeHolder | null> {
  const [row] = await tx
    .select({
      identityId: loginIdentities.id,
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
        eq(loginIdentities.secretHash, secretHash),
        eq(loginIdentities.kind, "badge"),
        eq(loginIdentities.status, "active"),
        isNull(loginIdentities.voidedAt),
        gt(loginIdentities.expiresAt, new Date()),
        eq(accounts.status, "active"),
        eq(users.status, "active"),
      ),
    );
  return row ?? null;
}

/** A badge that is used stays valid for another full term from now. */
export async function slideBadge(tx: Tx, identityId: string, expiresAt: Date) {
  await tx
    .update(loginIdentities)
    .set({ expiresAt })
    .where(eq(loginIdentities.id, identityId));
}

type VoidReason = "lost" | "admin" | "aged_out";

/**
 * Stops every working badge of the accounts and ends the sessions they
 * opened, so a lost card stops working on the device that last used it too.
 */
export async function voidBadges(
  tx: Tx,
  input: { tenantId: string; accountIds: string[]; reason: VoidReason },
) {
  if (input.accountIds.length === 0) return 0;
  const voided = await tx
    .update(loginIdentities)
    .set({ voidedAt: new Date(), voidReason: input.reason })
    .where(
      and(
        eq(loginIdentities.tenantId, input.tenantId),
        inArray(loginIdentities.accountId, input.accountIds),
        eq(loginIdentities.kind, "badge"),
        eq(loginIdentities.status, "active"),
        isNull(loginIdentities.voidedAt),
      ),
    )
    .returning({ id: loginIdentities.id });
  if (voided.length > 0)
    await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "credential_change" })
      .where(
        and(
          eq(sessions.tenantId, input.tenantId),
          inArray(
            sessions.loginIdentityId,
            voided.map((row) => row.id),
          ),
          isNull(sessions.revokedAt),
        ),
      );
  return voided.length;
}

/**
 * Gives a student a new badge in place of any they had. A student with no
 * account gets one, since a badge is often the first way a young child signs
 * in; a disabled account gets nothing, so a badge cannot reopen it.
 */
export async function issueBadge(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    secretHash: string;
    expiresAt: Date;
    linkedByUserId: string;
  },
): Promise<{ accountId: string; created: boolean } | null> {
  const [existing] = await tx
    .select({ id: accounts.id, state: accounts.state })
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, input.tenantId),
        eq(accounts.userId, input.userId),
        eq(accounts.status, "active"),
      ),
    )
    // Two prints for one child at once would otherwise each void the old
    // badge and both insert, leaving two that work.
    .for("update");
  if (existing && existing.state !== "active") return null;
  let accountId = existing?.id;
  if (!accountId) {
    const [created] = await tx
      .insert(accounts)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        state: "active",
        webauthnUserHandle: newUserHandle(input.tenantId),
      })
      .returning({ id: accounts.id });
    if (!created) throw new Error("account was not created");
    accountId = created.id;
  } else
    await voidBadges(tx, {
      tenantId: input.tenantId,
      accountIds: [accountId],
      reason: "lost",
    });
  await tx.insert(loginIdentities).values({
    tenantId: input.tenantId,
    accountId,
    kind: "badge",
    secretHash: input.secretHash,
    secretSetAt: new Date(),
    expiresAt: input.expiresAt,
    linkMethod: "admin",
    linkedByUserId: input.linkedByUserId,
  });
  return { accountId, created: !existing };
}

export interface BadgeState {
  accountId: string;
  issuedAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

/** Each student's newest badge that has not been stopped, expired or not. */
export async function badgesOf(
  tx: Tx,
  tenantId: string,
  userIds: readonly string[],
): Promise<Map<string, BadgeState>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.execute<{
    user_id: string;
    account_id: string;
    issued_at: string;
    last_used_at: string | null;
    expires_at: string;
  }>(sql`
    select distinct on (a.user_id) a.user_id, a.id as account_id,
      ${isoOf(sql`l.secret_set_at`)} as issued_at, ${isoOf(sql`l.last_used_at`)} as last_used_at,
      ${isoOf(sql`l.expires_at`)} as expires_at
    from core.accounts a
    join core.login_identities l on l.tenant_id = a.tenant_id and l.account_id = a.id
      and l.kind = 'badge' and l.status = 'active' and l.voided_at is null
    where a.tenant_id = ${tenantId}::uuid and a.status = 'active'
      and a.user_id = any(${uuidArray(userIds)})
    order by a.user_id, l.secret_set_at desc`);
  return new Map(
    rows.map((row) => [
      row.user_id,
      {
        accountId: row.account_id,
        issuedAt: row.issued_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
      },
    ]),
  );
}

/** Which of the students are in a young grade at the school on the day. */
export async function youngStudents(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userIds: readonly string[];
    today: string;
  },
): Promise<Set<string>> {
  if (input.userIds.length === 0) return new Set();
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct s.student_user_id as user_id
    from core.student_school_years s
    join core.descriptors d on d.tenant_id = s.tenant_id and d.id = s.grade_level_descriptor_id
    where s.tenant_id = ${input.tenantId}::uuid and s.org_id = ${input.orgId}::uuid
      and s.student_user_id = any(${uuidArray(input.userIds)})
      and s.status = 'active' and s.valid_during @> ${input.today}::date
      and d.system_meaning = any(${textArray(YOUNG_STUDENT_GRADES)})`);
  return new Set(rows.map((row) => row.user_id));
}
