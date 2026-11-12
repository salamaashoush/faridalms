import type { Workspace } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor } from "@faridalms/database/context";
import {
  findBadge,
  slideBadge,
  voidBadges,
} from "@faridalms/database/stores/badges";
import {
  attemptsSoFar,
  countAttempt,
  createSession,
  recordSignIn,
  schoolProfile,
} from "@faridalms/database/stores/identity";
import { BADGE_DAYS } from "@faridalms/domain/badges";
import { badgeSignInSchema } from "@faridalms/domain/identity-schema";
import { schoolDate } from "@faridalms/domain/school";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";

import { modulesOf } from "../core/modules";
import { schoolProcedure } from "../core/procedure";
import {
  attemptKey,
  BADGE_FAILURES,
  badgeHash,
  ipPrefix,
  issueToken,
  SHARED_LIFETIME,
  userAgentSummary,
  WINDOW_MINUTES,
} from "../core/session";
import { accessAtSchool } from "../people/access";

type Outcome =
  | { ok: true; token: string; expiresAt: Date; workspace: Workspace }
  | { ok: false; code: "auth.invalid_credentials" | "auth.too_many_attempts" };

/**
 * Sign-in with a printed badge, for a young child at the school the badge
 * names. Only the secret's hash is looked up; a badge that is unknown,
 * stopped or expired reads the same. A child who has left the young grades
 * has the badge stopped, since older students sign in with a password.
 */
export const signIn = schoolProcedure
  .input(badgeSignInSchema)
  .handler(async ({ input, context }) => {
    const { tenantId, schoolId } = context.school;
    const outcome = await context.cell.withTenant<Outcome>(
      { tenantId, requestId: context.requestId, actor: { kind: "user" } },
      "session",
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
        // A school without badges, or without what they need, signs no one in by one.
        const on = await modulesOf({
          tx,
          tenantId,
          schoolId,
          school: context.school,
          extensions: context.extensions,
        });
        const holder = on.badges
          ? await findBadge(tx, badgeHash(input.secret))
          : null;
        const today = schoolDate(
          (await schoolProfile(tx, schoolId))?.timeZone ?? "UTC",
        );
        const access =
          holder && holder.accountState === "active"
            ? await accessAtSchool(tx, context, {
                userId: holder.userId,
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
