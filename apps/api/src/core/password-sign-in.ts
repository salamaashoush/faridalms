import type { CellTransaction } from "@faridalms/database/context";
import type { SessionContext, Workspace } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor } from "@faridalms/database/context";
import {
  attemptsSoFar,
  clearAttempts,
  countAttempt,
  createSession,
  findPasswordIdentity,
  recordFailure,
  recordSignIn,
} from "@faridalms/database/stores/identity";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { randomBytes } from "node:crypto";

import type { RequestContext, SchoolContext } from "./context";

import { accessAtSchool } from "../people/access";
import {
  attemptKey,
  ipPrefix,
  issueToken,
  LIFETIME,
  userAgentSummary,
} from "./session";

/** Stands in for a missing account, so an unknown name costs what a known one does. */
export const dummyHash = await Bun.password.hash(
  randomBytes(32).toString("hex"),
  { algorithm: "argon2id" },
);

const PER_NAME = 10;
const PER_NETWORK = 50;
const WINDOW_MINUTES = 15;

type Identity = NonNullable<Awaited<ReturnType<typeof findPasswordIdentity>>>;

export type PasswordProof =
  | { limited: true; identity: Identity | null }
  | {
      limited: false;
      identity: Identity | null;
      /** The password matched an active account. */
      valid: boolean;
      nameKey: Buffer;
      networkKey: Buffer | null;
      network: string | null;
    };

/**
 * Checks a password for a sign-in name in one tenant, counting the attempt
 * against the name and the network the way every password sign-in does.
 * The Argon2 work runs whether or not the name has an account.
 */
export async function provePassword(
  tx: CellTransaction,
  context: RequestContext,
  input: { tenantId: string; loginName: string; password: string },
): Promise<PasswordProof> {
  const { tenantId } = input;
  const nameKey = attemptKey(
    context.cellSecret,
    tenantId,
    `login:${input.loginName}`,
  );
  const network = ipPrefix(context.headers, context.trustedProxyHops);
  // A school signs in from one network, so only failures count against it,
  // as with badges.
  const networkKey = network
    ? attemptKey(context.cellSecret, tenantId, `ip:${network}`)
    : null;
  const tries = await countAttempt(tx, tenantId, nameKey, WINDOW_MINUTES);
  const networkFailures = networkKey
    ? await attemptsSoFar(tx, tenantId, networkKey)
    : 0;
  const identity = await findPasswordIdentity(tx, input.loginName);
  if (tries > PER_NAME || networkFailures >= PER_NETWORK) {
    await writeAudit(tx, tenantId, {
      action: "account.sign_in",
      outcome: "denied",
      objectType: "account",
      objectId: identity?.accountId ?? null,
      subjectUserId: identity?.userId ?? null,
      details: { reason: "rate_limited" },
    });
    return { limited: true, identity };
  }
  const matched = await Bun.password.verify(
    input.password,
    identity?.secretHash ?? dummyHash,
  );
  return {
    limited: false,
    identity,
    valid: identity !== null && matched && identity.accountState === "active",
    nameKey,
    networkKey,
    network,
  };
}

/** Records a refused sign-in: against the account when there is one, and the network. */
export async function refuseSignIn(
  tx: CellTransaction,
  tenantId: string,
  proof: Extract<PasswordProof, { limited: false }>,
) {
  const { identity } = proof;
  if (identity)
    await recordFailure(tx, identity.identityId, identity.failedAttempts + 1);
  if (proof.networkKey)
    await countAttempt(tx, tenantId, proof.networkKey, WINDOW_MINUTES);
  await writeAudit(tx, tenantId, {
    action: "account.sign_in",
    outcome: "failed",
    objectType: "account",
    objectId: identity?.accountId ?? null,
    subjectUserId: identity?.userId ?? null,
  });
}

/**
 * Opens a session at a school for an account whose sign-in was proved, in
 * the context chosen, and clears the name's counted attempts.
 */
export async function openSession(
  tx: CellTransaction,
  context: SchoolContext,
  input: {
    tenantId: string;
    schoolId: string;
    accountId: string;
    userId: string;
    identityId: string;
    firstTime: boolean;
    sessionContext: SessionContext;
    today: string;
    network: string | null;
    nameKey: Buffer | null;
    details?: Record<string, unknown>;
  },
): Promise<{ token: string; expiresAt: Date; workspace: Workspace }> {
  const { tenantId, schoolId } = input;
  const { token, tokenHash } = issueToken(tenantId);
  const lifetime = LIFETIME[input.sessionContext];
  const session = await createSession(tx, {
    tenantId,
    accountId: input.accountId,
    tokenHash,
    loginIdentityId: input.identityId,
    context: input.sessionContext,
    activeOrgId: schoolId,
    idleMinutes: lifetime.idle,
    absoluteMinutes: lifetime.absolute,
    ipPrefix: input.network,
    userAgentSummary: userAgentSummary(context.headers),
  });
  await bindActor(tx, {
    tenantId,
    requestId: context.requestId,
    actor: {
      kind: "user",
      userId: input.userId,
      accountId: input.accountId,
      sessionId: session.id,
    },
  });
  await recordSignIn(tx, {
    accountId: input.accountId,
    identityId: input.identityId,
    firstTime: input.firstTime,
  });
  if (input.nameKey) await clearAttempts(tx, tenantId, input.nameKey);
  await writeAudit(tx, tenantId, {
    action: "account.sign_in",
    objectType: "account",
    objectId: input.accountId,
    orgId: schoolId,
    subjectUserId: input.userId,
    details: { context: input.sessionContext, ...input.details },
  });
  const profile = (
    await accessAtSchool(tx, context, {
      userId: input.userId,
      today: input.today,
      context: input.sessionContext,
    })
  ).profile;
  return {
    token,
    expiresAt: session.absoluteExpiresAt,
    workspace: WORKSPACE_OF[profile],
  };
}
