import type { CellTransaction } from "@faridalms/database/context";

import { writeAudit } from "@faridalms/database/audit";
import {
  countAttempt,
  findPasswordIdentity,
} from "@faridalms/database/stores/identity";
import { issueInvite, voidInvite } from "@faridalms/database/stores/invites";
import {
  logLinkDelivery,
  reachability,
} from "@faridalms/database/stores/notifications";
import { RESET_MINUTES } from "@faridalms/domain/first-sign-in";

import type { RequestContext, SchoolContext } from "./context";

import { resetMessage } from "../notifications/templates";
import { welcomeLink } from "./portal";
import { attemptKey, ipPrefix, issueBadgeSecret } from "./session";

// Each request may send an email, so the limits are lower than sign-in's.
const RESET_PER_NAME = 3;
const RESET_PER_NETWORK = 20;
const RESET_WINDOW_MINUTES = 60;

/**
 * Emails a reset link for a sign-in name in one tenant, to be used at the
 * school `school` picks for the person, and answers whether the name or
 * network had asked too often. Nothing else about the outcome leaves here.
 */
export async function sendPasswordReset(
  context: RequestContext,
  input: {
    tenantId: string;
    loginName: string;
    school: (
      tx: CellTransaction,
      person: { userId: string },
    ) => Promise<SchoolContext["school"] | null>;
  },
): Promise<boolean> {
  const { tenantId } = input;
  return context.cell.withTenant(
    { tenantId, requestId: context.requestId, actor: { kind: "user" } },
    "session",
    async (tx) => {
      const network = ipPrefix(context.headers, context.trustedProxyHops);
      const nameTries = await countAttempt(
        tx,
        tenantId,
        attemptKey(context.cellSecret, tenantId, `reset:${input.loginName}`),
        RESET_WINDOW_MINUTES,
      );
      const networkTries = network
        ? await countAttempt(
            tx,
            tenantId,
            attemptKey(context.cellSecret, tenantId, `reset-ip:${network}`),
            RESET_WINDOW_MINUTES,
          )
        : 0;
      if (nameTries > RESET_PER_NAME || networkTries > RESET_PER_NETWORK)
        return true;
      const identity = await findPasswordIdentity(tx, input.loginName);
      const mail = context.mail;
      if (!identity || identity.accountState !== "active" || !mail)
        return false;
      const school = await input.school(tx, identity);
      if (!school) return false;
      const [reach] = await reachability(tx, {
        tenantId,
        orgId: school.schoolId,
        userIds: [identity.userId],
      });
      if (!reach?.email) return false;
      const { secret, secretHash } = issueBadgeSecret();
      const link = await issueInvite(tx, {
        tenantId,
        userId: identity.userId,
        secretHash,
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        sentToUserId: identity.userId,
        linkedByUserId: identity.userId,
        purpose: "reset",
      });
      if (!link) return false;
      const name =
        (reach.locale === "ar" ? school.nameAr : school.nameEn) ??
        school.nameEn ??
        "";
      const outcome = await mail
        .send({
          to: reach.email,
          ...resetMessage({
            locale: reach.locale,
            school: name,
            loginName: input.loginName,
            link: welcomeLink(school, context.domains, secret),
            minutes: RESET_MINUTES,
          }),
        })
        .then(
          ({ receipt }) => ({ receipt, error: null }),
          (failure: unknown) => ({
            receipt: null,
            error: failure instanceof Error ? failure.message : "not sent",
          }),
        );
      const sent = outcome.error === null;
      await logLinkDelivery(tx, {
        tenantId,
        orgId: school.schoolId,
        userId: identity.userId,
        purpose: "reset",
        address: reach.email,
        locale: reach.locale,
        ...outcome,
      });
      if (!sent) await voidInvite(tx, tenantId, link.identityId);
      await writeAudit(tx, tenantId, {
        action: "account.reset_requested",
        outcome: sent ? "success" : "failed",
        objectType: "account",
        objectId: identity.accountId,
        orgId: school.schoolId,
        subjectUserId: identity.userId,
      });
      return false;
    },
  );
}
