import { and, eq, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { accounts, loginIdentities } from "../tables/accounts";
import { users } from "../tables/people";
import { newUserHandle } from "./accounts";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

/**
 * Sends someone a way to choose an account's password: a secret that works
 * once, until it expires. The account is opened as invited when the person
 * has none, and holds no password until the secret is used. A turned-off
 * account gives null, so a link cannot reopen it.
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
    linkedByUserId: string;
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
      metadata: { sentToUserId: input.sentToUserId },
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
  }>(sql`
    select l.id as identity_id, a.id as account_id, a.state, u.id as user_id, u.username,
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
      }
    : null;
}

/**
 * Uses an invite: the account takes the password chosen, becomes active,
 * and every link sent for it stops working, the others as well as this one.
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

/**
 * The guardians who decide for each student and take the school's notices:
 * the ones a link to choose the student's password may go to.
 */
export async function decidingGuardians(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; today: string },
): Promise<{ studentId: string; guardianId: string }[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    student_user_id: string;
    related_user_id: string;
  }>(sql`
    select r.student_user_id, r.related_user_id from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.student_user_id = any(${uuidArray(input.studentIds)})
      and r.valid_during @> ${input.today}::date and r.educational_rights = 'full'
      and r.receives_notifications and not coalesce(r.communication_isolated, false)
    order by r.primary_contact desc, r.contact_priority nulls last, r.id`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    guardianId: row.related_user_id,
  }));
}
