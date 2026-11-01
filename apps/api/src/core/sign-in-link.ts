import type { CellTransaction } from "@faridalms/database/context";
import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { PlatformDomains } from "@faridalms/domain/hosts";

import { signInOf, takenLoginNames } from "@faridalms/database/stores/accounts";
import {
  inviteeOf,
  issueInvite,
  reserveLoginName,
} from "@faridalms/database/stores/invites";
import { reachability } from "@faridalms/database/stores/notifications";
import { INVITE_DAYS } from "@faridalms/domain/first-sign-in";
import { ORPCError } from "@orpc/server";

import type { Provider } from "../notifications/providers";

import { adultInviteMessage } from "../notifications/templates";
import { welcomeLink } from "./portal";
import { issueBadgeSecret } from "./session";

/**
 * Emails an adult a link to choose their own password, so nobody else ever
 * knows it. Someone who has a password gets a link that replaces it and
 * keeps their sign-in name; a turned-off account gets none. The email goes
 * before the caller's transaction commits, and a refusal throws, so no link
 * is kept that nobody received.
 */
export async function emailSignInLink(
  tx: CellTransaction,
  input: {
    tenantId: string;
    userId: string;
    school: Pick<DirectorySchool, "hosts" | "slug" | "nameEn" | "nameAr">;
    domains: PlatformDomains;
    /**
     * The sign-in name to keep for someone who has no password yet; by
     * default the one already kept for them, or else their email address.
     */
    loginName?: string;
    linkedByUserId: string | null;
    mail: Provider;
    now: Date;
    /**
     * The language of the email instead of the person's own, for someone
     * just added who has had no chance to choose one.
     */
    locale?: "en" | "ar";
  },
) {
  const [reach] = await reachability(tx, {
    tenantId: input.tenantId,
    userIds: [input.userId],
  });
  const invitee = await inviteeOf(tx, input.tenantId, input.userId);
  if (!invitee || !reach?.email)
    throw new ORPCError("CONFLICT", { message: "sign_in.no_address" });
  const current = await signInOf(tx, input.tenantId, input.userId);
  const reset = Boolean(current?.identityId);
  const loginName =
    (reset ? current?.loginName : null) ??
    input.loginName ??
    invitee.username ??
    reach.email.toLowerCase();
  if (!reset && loginName !== invitee.username) {
    const taken = await takenLoginNames(tx, input.tenantId, {
      names: [loginName],
      numbered: [],
    });
    if (taken.has(loginName))
      throw new ORPCError("CONFLICT", {
        message: "login_identity.login_name_taken",
      });
  }
  const { secret, secretHash } = issueBadgeSecret();
  const invite = await issueInvite(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    secretHash,
    expiresAt: new Date(input.now.getTime() + INVITE_DAYS * 86_400_000),
    sentToUserId: input.userId,
    linkedByUserId: input.linkedByUserId,
    purpose: reset ? "reset" : "invite",
  });
  if (!invite) throw new ORPCError("CONFLICT", { message: "account.disabled" });
  if (!reset)
    await reserveLoginName(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      loginName,
    });
  const locale = input.locale ?? reach.locale;
  const arabic = locale === "ar";
  const message = adultInviteMessage({
    locale,
    school:
      (arabic ? input.school.nameAr : input.school.nameEn) ??
      input.school.nameEn ??
      input.school.nameAr ??
      "",
    name:
      (arabic
        ? (invitee.preferredGivenName ?? invitee.givenNameAr)
        : invitee.givenNameEn) ??
      invitee.givenNameEn ??
      invitee.givenNameAr ??
      loginName,
    loginName,
    link: welcomeLink(input.school, input.domains, secret),
    days: INVITE_DAYS,
  });
  // A gateway may refuse by throwing before it returns a promise.
  try {
    await input.mail.send({ to: reach.email, ...message });
  } catch {
    throw new ORPCError("BAD_GATEWAY", { message: "sign_in.not_sent" });
  }
  return {
    accountId: invite.accountId,
    created: invite.created,
    reset,
    loginName,
    sentTo: reach.email,
  };
}
