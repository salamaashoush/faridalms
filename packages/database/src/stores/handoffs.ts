import type { SessionContext } from "@faridalms/domain/workspace";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { loginIdentities } from "../tables/accounts";

type Tx = CellTransaction;

/** Every sign-in name a tenant's password accounts hold now. */
export async function passwordLoginNames(
  tx: Tx,
  tenantId: string,
): Promise<string[]> {
  const rows = await tx.execute<{ login_name: string }>(sql`
    select distinct login_name from core.login_identities
    where tenant_id = ${tenantId}::uuid and kind = 'password' and status = 'active'
      and voided_at is null and login_name is not null`);
  return rows.map((row) => row.login_name);
}

/** What a handoff carries from the sign-in that issued it to its school's portal. */
export interface HandoffClaim {
  schoolId: string;
  /** The network the sign-in came from, or null when it could not be told. */
  network: string | null;
  context: SessionContext;
  /** The password sign-in the person proved, which the session is opened with. */
  identityId: string;
}

/**
 * Leaves a sign-in proved on the bare portal domain for the school's portal
 * to open: a secret that works once, for a minute, for this account at this
 * school from this network.
 */
export async function issueHandoff(
  tx: Tx,
  input: {
    tenantId: string;
    accountId: string;
    secretHash: string;
    expiresAt: Date;
    claim: HandoffClaim;
  },
) {
  await tx.insert(loginIdentities).values({
    tenantId: input.tenantId,
    accountId: input.accountId,
    kind: "handoff",
    secretHash: input.secretHash,
    secretSetAt: new Date(),
    expiresAt: input.expiresAt,
    metadata: { ...input.claim },
    linkMethod: "self_service",
  });
}

export interface RedeemedHandoff extends HandoffClaim {
  accountId: string;
  userId: string;
  /** False once its minute has passed: it is spent all the same. */
  fresh: boolean;
  firstAuthenticatedAt: Date | null;
}

/**
 * Spends a handoff, fresh or not, so a secret is never tried twice, and says
 * whose it was. An account or person no longer active gives null.
 */
export async function redeemHandoff(
  tx: Tx,
  tenantId: string,
  secretHash: string,
): Promise<RedeemedHandoff | null> {
  const [row] = await tx.execute<{
    account_id: string;
    user_id: string | null;
    fresh: boolean;
    metadata: HandoffClaim;
    first_authenticated_at: string | Date | null;
  }>(sql`
    with spent as (
      update core.login_identities set voided_at = statement_timestamp(),
        void_reason = 'used', last_used_at = statement_timestamp()
      where tenant_id = ${tenantId}::uuid and secret_hash = ${secretHash}
        and kind = 'handoff' and status = 'active' and voided_at is null
      returning account_id, metadata, expires_at > statement_timestamp() as fresh
    )
    select s.account_id, s.metadata, s.fresh, u.id as user_id,
      a.first_authenticated_at
    from spent s
    join core.accounts a on a.tenant_id = ${tenantId}::uuid and a.id = s.account_id
      and a.status = 'active' and a.state = 'active'
    left join core.users u on u.tenant_id = a.tenant_id and u.id = a.user_id
      and u.status = 'active'`);
  if (!row?.user_id) return null;
  return {
    ...row.metadata,
    accountId: row.account_id,
    userId: row.user_id,
    fresh: row.fresh,
    firstAuthenticatedAt: row.first_authenticated_at
      ? new Date(row.first_authenticated_at)
      : null,
  };
}
