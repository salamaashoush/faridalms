import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities, sessions } from "../tables/accounts";
import { users } from "../tables/people";
import { ensureAccount } from "./accounts";
import { isoOf, uuidArray } from "./sql";

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

/**
 * A badge that is used stays valid for another stretch from now, but never
 * past the end of the school year it was printed in: badges are renewed
 * each year, so a lost one stops on its own by the summer.
 */
export async function slideBadge(tx: Tx, identityId: string, expiresAt: Date) {
  await tx
    .update(loginIdentities)
    .set({
      expiresAt: sql`least(${expiresAt.toISOString()}::timestamptz,
        coalesce((${loginIdentities.metadata}->>'until')::timestamptz, 'infinity'))`,
    })
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

/** Gives a student a new badge in place of any they had. */
export async function issueBadge(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    secretHash: string;
    expiresAt: Date;
    /** The end of the school year, past which the badge never slides. */
    until: Date;
    linkedByUserId: string;
  },
): Promise<{ accountId: string; created: boolean } | null> {
  const account = await ensureAccount(tx, input);
  if (!account) return null;
  if (!account.created)
    await voidBadges(tx, {
      tenantId: input.tenantId,
      accountIds: [account.accountId],
      reason: "lost",
    });
  await tx.insert(loginIdentities).values({
    tenantId: input.tenantId,
    accountId: account.accountId,
    kind: "badge",
    secretHash: input.secretHash,
    secretSetAt: new Date(),
    expiresAt: input.expiresAt < input.until ? input.expiresAt : input.until,
    metadata: { until: input.until.toISOString() },
    linkMethod: "admin",
    linkedByUserId: input.linkedByUserId,
  });
  return account;
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
