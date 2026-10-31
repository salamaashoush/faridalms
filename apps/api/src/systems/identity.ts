import type { CellTransaction } from "@faridalms/database/context";
import type { InviteHolder } from "@faridalms/database/stores/invites";
import type { Workspace } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor } from "@faridalms/database/context";
import {
  ensureAccount,
  revokeOtherSessions,
  signInOf,
  updatePasswordSignIn,
} from "@faridalms/database/stores/accounts";
import {
  findBadge,
  slideBadge,
  voidBadges,
} from "@faridalms/database/stores/badges";
import {
  attemptsSoFar,
  clearAttempts,
  countAttempt,
  createSession,
  effectiveAccess,
  findPasswordIdentity,
  recordFailure,
  recordSignIn,
  revokeSession,
  schoolProfile,
  sessionExpiresAt,
  viewer,
} from "@faridalms/database/stores/identity";
import { findInvite, redeemInvite } from "@faridalms/database/stores/invites";
import { childrenOf } from "@faridalms/database/stores/persons";
import { youngStudents } from "@faridalms/database/stores/students";
import { BADGE_DAYS } from "@faridalms/domain/badges";
import {
  acceptInviteSchema,
  changePasswordSchema,
  inviteSchema,
} from "@faridalms/domain/first-sign-in";
import {
  badgeSignInSchema,
  childSessionSchema,
  signInSchema,
  switchContextSchema,
} from "@faridalms/domain/identity-schema";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import type { SchoolContext } from "../core/context";

import { scopeOf } from "../core/coursework-access";
import { featuresOf } from "../core/features";
import {
  audit,
  dateIn,
  publicProcedure,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import {
  attemptKey,
  badgeHash,
  ipPrefix,
  issueToken,
  LIFETIME,
  SHARED_LIFETIME,
  userAgentSummary,
} from "../core/session";

const dummyHash = await Bun.password.hash(randomBytes(32).toString("hex"), {
  algorithm: "argon2id",
});

const PER_NAME = 10;
const PER_NETWORK = 50;
// A class signs in together from one network, so only badges that fail
// count against it.
const BADGE_FAILURES = 20;
const WINDOW_MINUTES = 15;

type Outcome =
  | { ok: true; token: string; expiresAt: Date; workspace: Workspace }
  | { ok: false; code: "auth.invalid_credentials" | "auth.too_many_attempts" };

/**
 * Password sign-in at the school the request names. The tenant comes from
 * that school; an unknown account, a wrong password and a person with no
 * membership at the school all read the same.
 */
export const signIn = schoolProcedure
  .input(signInSchema)
  .handler(async ({ input, context }) => {
    const { tenantId, schoolId } = context.school;
    const outcome = await context.cell.withTenant<Outcome>(
      { tenantId, requestId: context.requestId, actor: { kind: "user" } },
      "write",
      async (tx) => {
        const nameKey = attemptKey(
          context.cellSecret,
          tenantId,
          `login:${input.loginName}`,
        );
        const network = ipPrefix(context.headers, context.trustedProxyHops);
        // A school signs in from one network, so only failures count
        // against it, as with badges.
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
          return { ok: false, code: "auth.too_many_attempts" };
        }
        const valid = await Bun.password.verify(
          input.password,
          identity?.secretHash ?? dummyHash,
        );
        const today = dateIn(
          (await schoolProfile(tx, schoolId))?.timeZone ?? "UTC",
        );
        const access =
          identity && valid && identity.accountState === "active"
            ? await effectiveAccess(tx, {
                tenantId,
                userId: identity.userId,
                orgId: schoolId,
                today,
                context: input.context ?? "staff",
              })
            : null;
        const chosen = access && (input.context ?? access.contexts[0]);
        if (
          !identity ||
          !access ||
          !chosen ||
          !access.contexts.includes(chosen)
        ) {
          if (identity)
            await recordFailure(
              tx,
              identity.identityId,
              identity.failedAttempts + 1,
            );
          if (networkKey)
            await countAttempt(tx, tenantId, networkKey, WINDOW_MINUTES);
          await writeAudit(tx, tenantId, {
            action: "account.sign_in",
            outcome: "failed",
            objectType: "account",
            objectId: identity?.accountId ?? null,
            subjectUserId: identity?.userId ?? null,
          });
          return { ok: false, code: "auth.invalid_credentials" };
        }
        const { token, tokenHash } = issueToken(tenantId);
        const lifetime = LIFETIME[chosen];
        const session = await createSession(tx, {
          tenantId,
          accountId: identity.accountId,
          tokenHash,
          loginIdentityId: identity.identityId,
          context: chosen,
          activeOrgId: schoolId,
          idleMinutes: lifetime.idle,
          absoluteMinutes: lifetime.absolute,
          ipPrefix: network,
          userAgentSummary: userAgentSummary(context.headers),
        });
        await bindActor(tx, {
          tenantId,
          requestId: context.requestId,
          actor: {
            kind: "user",
            userId: identity.userId,
            accountId: identity.accountId,
            sessionId: session.id,
          },
        });
        await recordSignIn(tx, {
          accountId: identity.accountId,
          identityId: identity.identityId,
          firstTime: identity.firstAuthenticatedAt === null,
        });
        await clearAttempts(tx, tenantId, nameKey);
        await writeAudit(tx, tenantId, {
          action: "account.sign_in",
          objectType: "account",
          objectId: identity.accountId,
          orgId: schoolId,
          subjectUserId: identity.userId,
          details: { context: chosen },
        });
        const profile = (
          await effectiveAccess(tx, {
            tenantId,
            userId: identity.userId,
            orgId: schoolId,
            today,
            context: chosen,
          })
        ).profile;
        return {
          ok: true,
          token,
          expiresAt: session.absoluteExpiresAt,
          workspace: WORKSPACE_OF[profile],
        };
      },
    );
    if (!outcome.ok)
      throw new ORPCError(
        outcome.code === "auth.too_many_attempts"
          ? "TOO_MANY_REQUESTS"
          : "BAD_REQUEST",
        { message: outcome.code },
      );
    return {
      token: outcome.token,
      expiresAt: outcome.expiresAt,
      workspace: outcome.workspace,
    };
  });

/**
 * Sign-in with a printed badge, for a young child at the school the badge
 * names. Only the secret's hash is looked up; a badge that is unknown,
 * stopped or expired reads the same. A child who has left the young grades
 * has the badge stopped, since older students sign in with a password.
 */
export const badgeSignIn = schoolProcedure
  .input(badgeSignInSchema)
  .handler(async ({ input, context }) => {
    const { tenantId, schoolId } = context.school;
    const outcome = await context.cell.withTenant<Outcome>(
      { tenantId, requestId: context.requestId, actor: { kind: "user" } },
      "write",
      async (tx) => {
        const network = ipPrefix(context.headers, context.trustedProxyHops);
        const networkKey = network
          ? attemptKey(context.cellSecret, tenantId, `badge:${network}`)
          : null;
        if (
          networkKey &&
          (await attemptsSoFar(tx, tenantId, networkKey)) >= BADGE_FAILURES
        ) {
          await writeAudit(tx, tenantId, {
            action: "account.sign_in",
            outcome: "denied",
            objectType: "account",
            objectId: null,
            details: { method: "badge", reason: "rate_limited" },
          });
          return { ok: false, code: "auth.too_many_attempts" };
        }
        const holder = await findBadge(tx, badgeHash(input.secret));
        const today = dateIn(
          (await schoolProfile(tx, schoolId))?.timeZone ?? "UTC",
        );
        const access =
          holder && holder.accountState === "active"
            ? await effectiveAccess(tx, {
                tenantId,
                userId: holder.userId,
                orgId: schoolId,
                today,
                context: "student",
              })
            : null;
        const young =
          access?.contexts.includes("student") &&
          access.profile === "young_student";
        if (!holder || !access || !young) {
          if (networkKey)
            await countAttempt(tx, tenantId, networkKey, WINDOW_MINUTES);
          if (holder && access?.contexts.includes("student"))
            await voidBadges(tx, {
              tenantId,
              accountIds: [holder.accountId],
              reason: "aged_out",
            });
          await writeAudit(tx, tenantId, {
            action: "account.sign_in",
            outcome: "failed",
            objectType: "account",
            objectId: holder?.accountId ?? null,
            subjectUserId: holder?.userId ?? null,
            details: { method: "badge" },
          });
          return { ok: false, code: "auth.invalid_credentials" };
        }
        const { token, tokenHash } = issueToken(tenantId);
        const session = await createSession(tx, {
          tenantId,
          accountId: holder.accountId,
          tokenHash,
          loginIdentityId: holder.identityId,
          context: "student",
          activeOrgId: schoolId,
          idleMinutes: SHARED_LIFETIME.idle,
          absoluteMinutes: SHARED_LIFETIME.absolute,
          ipPrefix: network,
          userAgentSummary: userAgentSummary(context.headers),
          method: "badge",
          clientKind: "shared_device",
        });
        await bindActor(tx, {
          tenantId,
          requestId: context.requestId,
          actor: {
            kind: "user",
            userId: holder.userId,
            accountId: holder.accountId,
            sessionId: session.id,
          },
        });
        await recordSignIn(tx, {
          accountId: holder.accountId,
          identityId: holder.identityId,
          firstTime: holder.firstAuthenticatedAt === null,
        });
        await slideBadge(
          tx,
          holder.identityId,
          new Date(Date.now() + BADGE_DAYS * 86_400_000),
        );
        await writeAudit(tx, tenantId, {
          action: "account.sign_in",
          objectType: "account",
          objectId: holder.accountId,
          orgId: schoolId,
          subjectUserId: holder.userId,
          details: { context: "student", method: "badge" },
        });
        return {
          ok: true,
          token,
          expiresAt: session.absoluteExpiresAt,
          workspace: WORKSPACE_OF[access.profile],
        };
      },
    );
    if (!outcome.ok)
      throw new ORPCError(
        outcome.code === "auth.too_many_attempts"
          ? "TOO_MANY_REQUESTS"
          : "BAD_REQUEST",
        { message: outcome.code },
      );
    return {
      token: outcome.token,
      expiresAt: outcome.expiresAt,
      workspace: outcome.workspace,
    };
  });

/**
 * Finds the account a link from an email opens, for someone who is not
 * signed in. A link that is unknown, used, expired or for an account that
 * has since been given a password reads the same, and wrong guesses from
 * one network are counted and stopped as wrong badges are.
 */
async function heldInvite(
  context: SchoolContext,
  secret: string,
  redeem?: (
    tx: CellTransaction,
    holder: InviteHolder & { loginName: string },
  ) => Promise<void>,
) {
  const { tenantId } = context.school;
  const outcome = await context.cell.withTenant(
    { tenantId, requestId: context.requestId, actor: { kind: "user" } },
    "write",
    async (tx) => {
      const network = ipPrefix(context.headers, context.trustedProxyHops);
      const networkKey = network
        ? attemptKey(context.cellSecret, tenantId, `invite:${network}`)
        : null;
      if (
        networkKey &&
        (await attemptsSoFar(tx, tenantId, networkKey)) >= BADGE_FAILURES
      )
        return { ok: false as const, code: "auth.too_many_attempts" as const };
      const holder = await findInvite(tx, badgeHash(secret));
      const loginName = holder?.loginName;
      if (
        !holder ||
        !loginName ||
        holder.hasPassword ||
        !["invited", "active"].includes(holder.accountState)
      ) {
        if (networkKey)
          await countAttempt(tx, tenantId, networkKey, WINDOW_MINUTES);
        return { ok: false as const, code: "auth.invalid_invite" as const };
      }
      if (redeem) {
        await redeem(tx, { ...holder, loginName });
        await writeAudit(tx, tenantId, {
          action: "account.password_set",
          objectType: "account",
          objectId: holder.accountId,
          orgId: context.school.schoolId,
          subjectUserId: holder.userId,
          details: { method: "invite" },
        });
      }
      return {
        ok: true as const,
        loginName,
        name: {
          en: holder.givenNameEn,
          ar: holder.preferredGivenName ?? holder.givenNameAr,
        },
      };
    },
  );
  if (!outcome.ok)
    throw new ORPCError(
      outcome.code === "auth.too_many_attempts"
        ? "TOO_MANY_REQUESTS"
        : "BAD_REQUEST",
      { message: outcome.code },
    );
  return { loginName: outcome.loginName, name: outcome.name };
}

/** Whose password a link chooses, shown before it is chosen. */
export const invite = schoolProcedure
  .input(inviteSchema)
  .handler(({ input, context }) => heldInvite(context, input.secret));

/**
 * Chooses the password a link was sent for. The account becomes active and
 * every link sent for it stops, so the email cannot be used a second time.
 */
export const acceptInvite = schoolProcedure
  .input(acceptInviteSchema)
  .handler(async ({ input, context }) => {
    const secretHash = await Bun.password.hash(input.password, {
      algorithm: "argon2id",
    });
    return heldInvite(context, input.secret, (tx, holder) =>
      redeemInvite(tx, {
        tenantId: context.school.tenantId,
        identityId: holder.identityId,
        accountId: holder.accountId,
        loginName: holder.loginName,
        secretHash,
      }),
    );
  });

/**
 * A person changes their own password. They prove who they are with the
 * one they have, since a session left open on a shared screen must not be
 * enough to take the account; wrong tries are counted as wrong sign-ins
 * are. Every other device is signed out, and this one stays in.
 */
export const changePassword = writeProcedure
  .input(changePasswordSchema)
  .handler(async ({ input, context }) => {
    const held = await signInOf(
      context.tx,
      context.tenantId,
      context.actor.userId,
    );
    const identity = held?.loginName
      ? await findPasswordIdentity(context.tx, held.loginName)
      : null;
    if (!held?.identityId || !held.loginName || !identity)
      throw new ORPCError("NOT_FOUND", { message: "account.no_password" });
    const tries = attemptKey(
      context.cellSecret,
      context.tenantId,
      `password:${held.accountId}`,
    );
    if ((await attemptsSoFar(context.tx, context.tenantId, tries)) >= PER_NAME)
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "auth.too_many_attempts",
      });
    if (
      !(await Bun.password.verify(input.current, identity.secretHash ?? ""))
    ) {
      // The count has to outlive the refusal, which rolls this unit back.
      await context.cell.withTenant(
        {
          tenantId: context.tenantId,
          requestId: context.requestId,
          actor: { kind: "user" },
        },
        "write",
        (tx) => countAttempt(tx, context.tenantId, tries, WINDOW_MINUTES),
      );
      throw new ORPCError("BAD_REQUEST", { message: "auth.wrong_password" });
    }
    await updatePasswordSignIn(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      accountId: held.accountId,
      identityId: held.identityId,
      loginName: held.loginName,
      secretHash: await Bun.password.hash(input.password, {
        algorithm: "argon2id",
      }),
      linkedByUserId: context.actor.userId,
    });
    await revokeOtherSessions(context.tx, {
      tenantId: context.tenantId,
      accountId: held.accountId,
      keepSessionId: context.actor.sessionId,
    });
    await audit(context, {
      action: "account.password_set",
      objectType: "account",
      objectId: held.accountId,
      subjectUserId: context.actor.userId,
      details: { method: "self" },
    });
    return { changed: true };
  });

export const signOut = writeProcedure.handler(async ({ context }) => {
  await revokeSession(context.tx, context.actor.sessionId, "sign_out");
  await audit(context, {
    action: "account.sign_out",
    objectType: "account",
    objectId: context.actor.accountId,
    subjectUserId: context.actor.userId,
  });
  return { signedOut: true };
});

/** Who is signed in, where, and what they may do there. */
export const currentUser = readProcedure.handler(async ({ context }) => {
  const person = await viewer(context.tx, context.actor.userId);
  const school = await schoolProfile(context.tx, context.schoolId);
  if (!person || !school) throw new ORPCError("UNAUTHORIZED");
  return {
    id: person.id,
    nameEn: person.fullNameEn,
    nameAr: person.fullNameAr,
    preferredName: person.preferredGivenName,
    loginName: person.username,
    photoFileId: person.photoFileId,
    preferredLocale: person.preferredLocale,
    context: context.actor.context,
    contexts: [...context.actor.contexts],
    profile: context.actor.profile,
    workspace: context.actor.workspace,
    roles: [...context.actor.roles],
    capabilities: [...context.actor.capabilities],
    features: await featuresOf(context),
    school: {
      id: school.id,
      slug: context.school.slug,
      nameEn: school.nameEn,
      nameAr: school.nameAr,
      timeZone: school.timeZone ?? "UTC",
      weekStart: school.weekStart,
      weekendDays: school.weekendDays,
      secondaryCalendar: school.secondaryCalendar,
      digits: school.digits,
      arabicMath: school.arabicMath,
      logoFileId: school.logoFileId,
    },
    today: context.today,
  };
});

/**
 * Moving between the staff, family and student contexts is a privilege
 * change, so it issues a new session and revokes the old one.
 */
export const switchContext = writeProcedure
  .input(switchContextSchema)
  .handler(async ({ input, context }) => {
    if (!context.actor.contexts.includes(input.context))
      throw new ORPCError("FORBIDDEN");
    const { token, tokenHash } = issueToken(context.tenantId);
    const lifetime = LIFETIME[input.context];
    const session = await createSession(context.tx, {
      tenantId: context.tenantId,
      accountId: context.actor.accountId,
      tokenHash,
      loginIdentityId: null,
      context: input.context,
      activeOrgId: context.schoolId,
      idleMinutes: lifetime.idle,
      absoluteMinutes: lifetime.absolute,
      ipPrefix: ipPrefix(context.headers, context.trustedProxyHops),
      userAgentSummary: userAgentSummary(context.headers),
    });
    await revokeSession(
      context.tx,
      context.actor.sessionId,
      "context_switch",
      session.id,
    );
    await audit(context, {
      action: "session.context_switch",
      objectType: "account",
      objectId: context.actor.accountId,
      subjectUserId: context.actor.userId,
      details: { from: context.actor.context, to: input.context },
    });
    const access = await effectiveAccess(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      orgId: context.schoolId,
      today: context.today,
      context: input.context,
    });
    return {
      token,
      expiresAt: session.absoluteExpiresAt,
      workspace: WORKSPACE_OF[access.profile],
    };
  });

/**
 * A guardian hands their device to a young child: a session as the child,
 * for the lessons and home made for them, while the guardian's own session
 * stays open for the way back. It lives as a shared-device session, so a
 * tablet put down and forgotten closes it within the half hour.
 */
export const childSession = writeProcedure
  .input(childSessionSchema)
  .handler(async ({ input, context }) => {
    if (context.actor.context !== "family") throw new ORPCError("FORBIDDEN");
    requireCapability(context, "children:read");
    const links = await childrenOf(
      context.tx,
      scopeOf(context),
      context.actor.userId,
    );
    if (!links.some((link) => link.studentId === input.studentId))
      throw new ORPCError("NOT_FOUND");
    const young = await youngStudents(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userIds: [input.studentId],
      today: context.today,
    });
    const access = await effectiveAccess(context.tx, {
      tenantId: context.tenantId,
      userId: input.studentId,
      orgId: context.schoolId,
      today: context.today,
      context: "student",
    });
    if (
      !young.has(input.studentId) ||
      !access.contexts.includes("student") ||
      access.profile !== "young_student"
    )
      throw new ORPCError("BAD_REQUEST", { message: "account.not_young" });
    const account = await ensureAccount(context.tx, {
      tenantId: context.tenantId,
      userId: input.studentId,
    });
    if (!account)
      throw new ORPCError("CONFLICT", { message: "account.disabled" });
    const { token, tokenHash } = issueToken(context.tenantId);
    const session = await createSession(context.tx, {
      tenantId: context.tenantId,
      accountId: account.accountId,
      tokenHash,
      loginIdentityId: null,
      context: "student",
      activeOrgId: context.schoolId,
      idleMinutes: SHARED_LIFETIME.idle,
      absoluteMinutes: SHARED_LIFETIME.absolute,
      ipPrefix: ipPrefix(context.headers, context.trustedProxyHops),
      userAgentSummary: userAgentSummary(context.headers),
      method: "guardian",
      clientKind: "shared_device",
    });
    await audit(context, {
      action: "session.child_start",
      objectType: "account",
      objectId: account.accountId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { childSessionId: session.id },
    });
    return {
      token,
      expiresAt: session.absoluteExpiresAt,
      workspace: WORKSPACE_OF[access.profile],
      guardianExpiresAt:
        (await sessionExpiresAt(context.tx, context.actor.sessionId)) ??
        session.absoluteExpiresAt,
    };
  });

/** The school whose own verified domain this is, for its public website. */
export const hostSchool = publicProcedure
  .input(v.object({ host: v.pipe(v.string(), v.maxLength(255)) }))
  .handler(async ({ input, context }) => {
    const hostname = input.host.split(":")[0]?.toLowerCase() ?? "";
    if (!hostname) return null;
    const school = await context.directory.byHost(hostname);
    return school
      ? { slug: school.slug, nameEn: school.nameEn, nameAr: school.nameAr }
      : null;
  });
