import type { Workspace } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor } from "@faridalms/database/context";
import {
  clearAttempts,
  countAttempt,
  createSession,
  effectiveAccess,
  findPasswordIdentity,
  recordFailure,
  recordSignIn,
  revokeSession,
  schoolFeatures,
  schoolProfile,
  viewer,
} from "@faridalms/database/repositories/identity";
import {
  signInSchema,
  switchContextSchema,
} from "@faridalms/domain/identity-schema";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import {
  audit,
  dateIn,
  publicProcedure,
  readProcedure,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import {
  attemptKey,
  ipPrefix,
  issueToken,
  LIFETIME,
  userAgentSummary,
} from "../core/session";

const dummyHash = await Bun.password.hash(randomBytes(32).toString("hex"), {
  algorithm: "argon2id",
});

const PER_NAME = 10;
const PER_NETWORK = 50;
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
        const network = ipPrefix(context.headers);
        const tries = await countAttempt(tx, tenantId, nameKey, WINDOW_MINUTES);
        const networkTries = network
          ? await countAttempt(
              tx,
              tenantId,
              attemptKey(context.cellSecret, tenantId, `ip:${network}`),
              WINDOW_MINUTES,
            )
          : 0;
        const identity = await findPasswordIdentity(tx, input.loginName);
        const valid = await Bun.password.verify(
          input.password,
          identity?.secretHash ?? dummyHash,
        );
        if (tries > PER_NAME || networkTries > PER_NETWORK) {
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
    features: await schoolFeatures(
      context.tx,
      context.tenantId,
      context.schoolId,
    ),
    school: {
      id: school.id,
      slug: context.school.slug,
      nameEn: school.nameEn,
      nameAr: school.nameAr,
      timeZone: school.timeZone ?? "UTC",
      weekStart: school.weekStart,
      weekendDays: school.weekendDays,
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
      ipPrefix: ipPrefix(context.headers),
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
