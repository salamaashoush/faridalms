import { and, eq, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities, sessions } from "../tables/accounts";
import { users } from "../tables/people";

type Tx = CellTransaction;

/**
 * A WebAuthn user handle: the tenant id, then 48 random bytes. The prefix
 * lets a passkey sign-in find its tenant before anyone has chosen a school.
 */
export function newUserHandle(tenantId: string): Buffer {
  const handle = new Uint8Array(64);
  const hex = tenantId.replaceAll("-", "");
  for (let index = 0; index < 16; index += 1)
    handle[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  handle.set(crypto.getRandomValues(new Uint8Array(48)), 16);
  return Buffer.from(handle);
}

export interface SignIn {
  accountId: string;
  state: string;
  identityId: string | null;
  loginName: string | null;
}

export async function signInOf(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<SignIn | null> {
  const rows = await tx.execute<{
    account_id: string;
    state: string;
    identity_id: string | null;
    login_name: string | null;
  }>(sql`
    select a.id as account_id, a.state, l.id as identity_id, l.login_name
    from core.accounts a
    left join core.login_identities l on l.tenant_id = a.tenant_id and l.account_id = a.id
      and l.kind = 'password' and l.status = 'active' and l.voided_at is null
    where a.tenant_id = ${tenantId}::uuid and a.user_id = ${userId}::uuid and a.status = 'active'
    limit 1`);
  const row = rows[0];
  return row
    ? {
        accountId: row.account_id,
        state: row.state,
        identityId: row.identity_id,
        loginName: row.login_name,
      }
    : null;
}

/**
 * The student's account, opened when they have none, since a young child's
 * first sign-in is often a badge or a guardian's hand-over rather than a
 * password. A disabled account gives null, so neither can reopen it. The row
 * stays locked to the transaction, so two sign-ins prepared at once queue.
 */
export async function ensureAccount(
  tx: Tx,
  input: { tenantId: string; userId: string },
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
    .for("update");
  if (existing)
    return existing.state === "active"
      ? { accountId: existing.id, created: false }
      : null;
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
  return { accountId: created.id, created: true };
}

/** Opens an account with a password an administrator set. */
export async function createPasswordAccount(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    loginName: string;
    secretHash: string;
    linkedByUserId: string;
  },
) {
  const [account] = await tx
    .insert(accounts)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      state: "active",
      webauthnUserHandle: newUserHandle(input.tenantId),
    })
    .returning({ id: accounts.id });
  if (!account) throw new Error("account was not created");
  await tx.insert(loginIdentities).values({
    tenantId: input.tenantId,
    accountId: account.id,
    kind: "password",
    loginName: input.loginName,
    secretHash: input.secretHash,
    secretSetAt: new Date(),
    linkMethod: "admin",
    linkedByUserId: input.linkedByUserId,
  });
  await tx
    .update(users)
    .set({ username: input.loginName })
    .where(and(eq(users.tenantId, input.tenantId), eq(users.id, input.userId)));
  return account.id;
}

/**
 * Changes the password sign-in of an account: its login name, and its
 * password when one is given. A new password clears failed attempts.
 */
export async function updatePasswordSignIn(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    accountId: string;
    identityId: string | null;
    loginName: string;
    secretHash: string | null;
    linkedByUserId: string;
  },
) {
  if (input.identityId) {
    await tx
      .update(loginIdentities)
      .set({
        loginName: input.loginName,
        ...(input.secretHash
          ? {
              secretHash: input.secretHash,
              secretSetAt: new Date(),
              failedAttempts: 0,
              lockedUntil: null,
              compromisedAt: null,
            }
          : {}),
      })
      .where(
        and(
          eq(loginIdentities.tenantId, input.tenantId),
          eq(loginIdentities.id, input.identityId),
        ),
      );
  } else {
    if (!input.secretHash) return false;
    await tx.insert(loginIdentities).values({
      tenantId: input.tenantId,
      accountId: input.accountId,
      kind: "password",
      loginName: input.loginName,
      secretHash: input.secretHash,
      secretSetAt: new Date(),
      linkMethod: "admin",
      linkedByUserId: input.linkedByUserId,
    });
  }
  await tx
    .update(users)
    .set({ username: input.loginName })
    .where(and(eq(users.tenantId, input.tenantId), eq(users.id, input.userId)));
  return true;
}

/** Disables or re-enables an account; disabling ends its open sessions. */
export async function setAccountState(
  tx: Tx,
  input: {
    tenantId: string;
    accountId: string;
    state: "active" | "disabled";
    reason: string | null;
    byUserId: string;
  },
) {
  await tx
    .update(accounts)
    .set({
      state: input.state,
      stateChangedAt: new Date(),
      stateChangedByUserId: input.byUserId,
      stateReason: input.reason,
    })
    .where(
      and(
        eq(accounts.tenantId, input.tenantId),
        eq(accounts.id, input.accountId),
      ),
    );
  if (input.state === "disabled")
    await revokeAccountSessions(tx, input.tenantId, input.accountId);
}

export async function revokeAccountSessions(
  tx: Tx,
  tenantId: string,
  accountId: string,
) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: "admin" })
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.accountId, accountId),
        isNull(sessions.revokedAt),
      ),
    );
}
