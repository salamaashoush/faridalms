import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities, sessions } from "../tables/accounts";
import { users } from "../tables/people";
import { textArray } from "./sql";

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
  const held = async () => {
    const [row] = await tx
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
    if (!row) return undefined;
    return row.state === "active"
      ? { accountId: row.id, created: false }
      : null;
  };
  const existing = await held();
  if (existing !== undefined) return existing;
  // No row to lock yet: another transaction may be opening the same account,
  // and the insert waits on its key until it has, then takes its account.
  const [created] = await tx
    .insert(accounts)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      state: "active",
      webauthnUserHandle: newUserHandle(input.tenantId),
    })
    .onConflictDoNothing({
      target: [accounts.tenantId, accounts.userId],
      where: sql`status = 'active'`,
    })
    .returning({ id: accounts.id });
  if (created) return { accountId: created.id, created: true };
  const opened = await held();
  if (opened === undefined) throw new Error("account was not created");
  return opened;
}

/**
 * Which of these sign-in names are held in the tenant, with every held name
 * that begins as one of `numbered` does, so the next free number is known.
 * A person's username follows their sign-in name, so both are looked at.
 */
export async function takenLoginNames(
  tx: Tx,
  tenantId: string,
  input: { names: readonly string[]; numbered: readonly string[] },
): Promise<Set<string>> {
  if (input.names.length === 0 && input.numbered.length === 0) return new Set();
  const starts = input.numbered.map(
    (name) => `${name.replaceAll(/[\\%_]/g, "\\$&")}%`,
  );
  const rows = await tx.execute<{ name: string }>(sql`
    select n.name from (
      select login_name as name from core.login_identities
      where tenant_id = ${tenantId}::uuid and kind = 'password' and status = 'active' and voided_at is null
      union
      select username from core.users
      where tenant_id = ${tenantId}::uuid and status = 'active' and username is not null
    ) n
    where n.name = any(${textArray(input.names)}) or n.name like any(${textArray(starts)})`);
  return new Set(rows.map((row) => row.name));
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

/**
 * Ends every session of an account but the one in hand, for a person who
 * changes their own password: the other devices are signed out, this one
 * stays in.
 */
export async function revokeOtherSessions(
  tx: Tx,
  input: { tenantId: string; accountId: string; keepSessionId: string },
) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: "credential_change" })
    .where(
      and(
        eq(sessions.tenantId, input.tenantId),
        eq(sessions.accountId, input.accountId),
        ne(sessions.id, input.keepSessionId),
        isNull(sessions.revokedAt),
      ),
    );
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
