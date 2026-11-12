import { and, eq, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities } from "../tables/accounts";
import { users } from "../tables/people";
import { newUserHandle } from "./accounts";

type Tx = CellTransaction;

/**
 * Sends someone a way to choose an account's password: a secret that works
 * once, until it expires. The account is opened as invited when the person
 * has none, and holds no password until the secret is used. A reset link is
 * for an account that has a password and replaces it. A turned-off account
 * gives null, so a link cannot reopen it.
 */
export async function issueInvite(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    secretHash: string;
    expiresAt: Date;
    /** Who the link went to. */
    sentToUserId: string;
    /** Null when no school account sent it: an operator provisioning the school. */
    linkedByUserId: string | null;
    purpose?: InvitePurpose;
    /** For a registration: whom the person registered to apply for. */
    applyingFor?: "self" | "other";
  },
): Promise<{ accountId: string; identityId: string; created: boolean } | null> {
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
  if (existing && existing.state !== "active" && existing.state !== "invited")
    return null;
  const [opened] = existing
    ? [existing]
    : await tx
        .insert(accounts)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          state: "invited",
          webauthnUserHandle: newUserHandle(input.tenantId),
        })
        .returning({ id: accounts.id });
  if (!opened) throw new Error("account was not created");
  // A link sent again to the same person replaces the one they had.
  await tx.execute(sql`
    update core.login_identities set voided_at = statement_timestamp(), void_reason = 'admin'
    where tenant_id = ${input.tenantId}::uuid and account_id = ${opened.id}::uuid and kind = 'invite'
      and status = 'active' and voided_at is null
      and metadata->>'sentToUserId' = ${input.sentToUserId}`);
  const [identity] = await tx
    .insert(loginIdentities)
    .values({
      tenantId: input.tenantId,
      accountId: opened.id,
      kind: "invite",
      secretHash: input.secretHash,
      secretSetAt: new Date(),
      expiresAt: input.expiresAt,
      metadata: {
        sentToUserId: input.sentToUserId,
        purpose: input.purpose ?? "invite",
        ...(input.applyingFor ? { applyingFor: input.applyingFor } : {}),
      },
      linkMethod: "invitation",
      linkedByUserId: input.linkedByUserId,
    })
    .returning({ id: loginIdentities.id });
  if (!identity) throw new Error("invite was not created");
  return { accountId: opened.id, identityId: identity.id, created: !existing };
}

/** Stops a link that never reached anyone, so no secret is left unheld. */
export async function voidInvite(tx: Tx, tenantId: string, identityId: string) {
  await tx
    .update(loginIdentities)
    .set({ voidedAt: new Date(), voidReason: "unused" })
    .where(
      and(
        eq(loginIdentities.tenantId, tenantId),
        eq(loginIdentities.id, identityId),
      ),
    );
}

/**
 * What a link is for: choosing the first password of an account the office
 * opened, replacing a forgotten one, or confirming the address someone
 * registered with to apply, which also opens their applying role.
 */
export type InvitePurpose = "invite" | "reset" | "register";

export interface InviteHolder {
  identityId: string;
  accountId: string;
  accountState: string;
  userId: string;
  /** The sign-in name kept for the account until its password is chosen. */
  loginName: string | null;
  givenNameEn: string | null;
  givenNameAr: string | null;
  preferredGivenName: string | null;
  hasPassword: boolean;
  purpose: InvitePurpose;
  /** For a registration: whom the person registered to apply for. */
  applyingFor: "self" | "other";
}

/** Whose password an invite sets, while it is unused and has not expired. */
export async function findInvite(
  tx: Tx,
  secretHash: string,
): Promise<InviteHolder | null> {
  const [row] = await tx.execute<{
    identity_id: string;
    account_id: string;
    state: string;
    user_id: string;
    username: string | null;
    given_name_en: string | null;
    given_name_ar: string | null;
    preferred_given_name: string | null;
    has_password: boolean;
    purpose: string | null;
    applying_for: string | null;
  }>(sql`
    select l.id as identity_id, l.metadata->>'purpose' as purpose,
           l.metadata->>'applyingFor' as applying_for, a.id as account_id, a.state, u.id as user_id, u.username,
           u.given_name_en, u.given_name_ar, u.preferred_given_name,
           exists (select 1 from core.login_identities p
             where p.tenant_id = a.tenant_id and p.account_id = a.id and p.kind = 'password'
               and p.status = 'active' and p.voided_at is null) as has_password
    from core.login_identities l
    join core.accounts a on a.tenant_id = l.tenant_id and a.id = l.account_id and a.status = 'active'
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.user_id and u.status = 'active'
    where l.secret_hash = ${secretHash} and l.kind = 'invite' and l.status = 'active'
      and l.voided_at is null and l.expires_at > statement_timestamp()`);
  return row
    ? {
        identityId: row.identity_id,
        accountId: row.account_id,
        accountState: row.state,
        userId: row.user_id,
        loginName: row.username,
        givenNameEn: row.given_name_en,
        givenNameAr: row.given_name_ar,
        preferredGivenName: row.preferred_given_name,
        hasPassword: row.has_password,
        purpose:
          row.purpose === "reset" || row.purpose === "register"
            ? row.purpose
            : "invite",
        applyingFor: row.applying_for === "other" ? "other" : "self",
      }
    : null;
}

/**
 * Uses a link: the account takes the password chosen, replacing the one it
 * had when the link was a reset, becomes active, and every link sent for it
 * stops working, the others as well as this one.
 */
export async function redeemInvite(
  tx: Tx,
  input: {
    tenantId: string;
    identityId: string;
    accountId: string;
    loginName: string;
    secretHash: string;
  },
) {
  const replaced = await tx
    .update(loginIdentities)
    .set({
      secretHash: input.secretHash,
      secretSetAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
      compromisedAt: null,
    })
    .where(
      and(
        eq(loginIdentities.tenantId, input.tenantId),
        eq(loginIdentities.accountId, input.accountId),
        eq(loginIdentities.kind, "password"),
        eq(loginIdentities.status, "active"),
        isNull(loginIdentities.voidedAt),
      ),
    )
    .returning({ id: loginIdentities.id });
  if (replaced.length === 0)
    await tx.insert(loginIdentities).values({
      tenantId: input.tenantId,
      accountId: input.accountId,
      kind: "password",
      loginName: input.loginName,
      secretHash: input.secretHash,
      secretSetAt: new Date(),
      linkMethod: "invitation",
    });
  await tx
    .update(accounts)
    .set({ state: "active", stateChangedAt: new Date() })
    .where(
      and(
        eq(accounts.tenantId, input.tenantId),
        eq(accounts.id, input.accountId),
        eq(accounts.state, "invited"),
      ),
    );
  await tx
    .update(loginIdentities)
    .set({
      voidedAt: new Date(),
      voidReason: "used",
      lastUsedAt: sql`case when ${loginIdentities.id} = ${input.identityId}::uuid then statement_timestamp() end`,
    })
    .where(
      and(
        eq(loginIdentities.tenantId, input.tenantId),
        eq(loginIdentities.accountId, input.accountId),
        eq(loginIdentities.kind, "invite"),
        isNull(loginIdentities.voidedAt),
      ),
    );
}

/**
 * Closes what links left open once the office gives the account a password
 * itself: the account becomes active, and the links stop, since a password
 * chosen from one now would replace the one just handed over.
 */
export async function settleInvites(
  tx: Tx,
  input: { tenantId: string; accountId: string },
) {
  await tx
    .update(accounts)
    .set({ state: "active", stateChangedAt: new Date() })
    .where(
      and(
        eq(accounts.tenantId, input.tenantId),
        eq(accounts.id, input.accountId),
        eq(accounts.state, "invited"),
      ),
    );
  await tx
    .update(loginIdentities)
    .set({ voidedAt: new Date(), voidReason: "admin" })
    .where(
      and(
        eq(loginIdentities.tenantId, input.tenantId),
        eq(loginIdentities.accountId, input.accountId),
        eq(loginIdentities.kind, "invite"),
        isNull(loginIdentities.voidedAt),
      ),
    );
}

/** What a link's email calls the person, and the sign-in name they hold. */
export async function inviteeOf(tx: Tx, tenantId: string, userId: string) {
  const [row] = await tx
    .select({
      username: users.username,
      givenNameEn: users.givenNameEn,
      givenNameAr: users.givenNameAr,
      preferredGivenName: users.preferredGivenName,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.id, userId),
        eq(users.status, "active"),
      ),
    );
  return row ?? null;
}

/** Keeps a sign-in name for a person whose account has no password yet. */
export async function reserveLoginName(
  tx: Tx,
  input: { tenantId: string; userId: string; loginName: string },
) {
  await tx
    .update(users)
    .set({ username: input.loginName })
    .where(and(eq(users.tenantId, input.tenantId), eq(users.id, input.userId)));
}
