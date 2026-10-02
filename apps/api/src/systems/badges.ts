import {
  badgesOf,
  issueBadge,
  voidBadges,
} from "@faridalms/database/stores/badges";
import {
  classById,
  classRoster,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { youngStudents } from "@faridalms/database/stores/students";
import { schoolYears } from "@faridalms/database/stores/years";
import { BADGE_DAYS, badgeYearEnd } from "@faridalms/domain/badges";
import {
  classBadgesSchema,
  issueBadgesSchema,
  stopBadgeSchema,
} from "@faridalms/domain/identity-schema";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { scopeOf } from "../core/coursework-access";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { issueBadgeSecret } from "../core/session";

/**
 * A class whose sign-in badges the teacher looks after: one they teach, or
 * any class for someone who keeps the school's classes.
 */
async function badgeClass(context: UnitContext, classId: string) {
  requireCapability(context, "badges:issue");
  const scope = scopeOf(context);
  const found = await classById(context.tx, scope, classId);
  if (!found || !(await teachesClass(context.tx, scope, classId)))
    throw new ORPCError("NOT_FOUND");
  const roster = await classRoster(
    context.tx,
    scope,
    found,
    context.today,
    false,
  );
  const young = await youngStudents(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    userIds: roster.map((row) => row.userId),
    today: context.today,
  });
  return { found, roster, young };
}

/** The class's students and the badge each holds, for the badges page. */
export const classBadges = readProcedure
  .input(classBadgesSchema)
  .handler(async ({ input, context }) => {
    const { found, roster, young } = await badgeClass(context, input.classId);
    const badges = await badgesOf(
      context.tx,
      context.tenantId,
      roster.map((row) => row.userId),
    );
    const now = context.now.toISOString();
    return {
      class: {
        id: found.id,
        code: found.code,
        titleEn: found.titleEn,
        titleAr: found.titleAr,
      },
      students: roster.map((row) => {
        const badge = badges.get(row.userId);
        return {
          userId: row.userId,
          fullNameEn: row.fullNameEn,
          fullNameAr: row.fullNameAr,
          young: young.has(row.userId),
          badge: badge
            ? {
                issuedAt: badge.issuedAt,
                lastUsedAt: badge.lastUsedAt,
                expiresAt: badge.expiresAt,
                expired: badge.expiresAt <= now,
              }
            : null,
        };
      }),
    };
  });

/**
 * New badges for young students of the class, each in place of the one they
 * had. The secrets leave the API only in this response, so a badge lost
 * before it was printed is replaced, never shown again.
 */
export const issueBadges = writeProcedure
  .input(issueBadgesSchema)
  .handler(async ({ input, context }) => {
    const { roster, young } = await badgeClass(context, input.classId);
    const inClass = new Set(roster.map((row) => row.userId));
    const wanted = [...new Set(input.studentIds)];
    if (wanted.some((studentId) => !inClass.has(studentId)))
      throw new ORPCError("NOT_FOUND");
    if (wanted.some((studentId) => !young.has(studentId)))
      throw new ORPCError("BAD_REQUEST", { message: "badges.not_young" });
    const expiresAt = new Date(context.now.getTime() + BADGE_DAYS * 86_400_000);
    const until = badgeYearEnd(
      await schoolYears(context.tx, context.tenantId, context.schoolId),
      context.today,
      expiresAt,
    );
    const issued = await Promise.all(
      wanted.map(async (studentId) => {
        const { secret, secretHash } = issueBadgeSecret();
        const account = await issueBadge(context.tx, {
          tenantId: context.tenantId,
          userId: studentId,
          secretHash,
          expiresAt,
          until,
          linkedByUserId: context.actor.userId,
        });
        if (account)
          await audit(context, {
            action: account.created ? "account.create" : "account.badge_issue",
            objectType: "account",
            objectId: account.accountId,
            subjectUserId: studentId,
            details: { method: "badge", classId: input.classId },
          });
        return { studentId, secret: account ? secret : null };
      }),
    );
    const badges = issued.flatMap(({ studentId, secret }) =>
      secret ? [{ studentId, secret }] : [],
    );
    const disabled = issued
      .filter((row) => row.secret === null)
      .map((row) => row.studentId);
    return { badges, disabled };
  });

/** Stops a student's badge, on its card and on any device it signed in. */
export const stopBadge = writeProcedure
  .input(stopBadgeSchema)
  .handler(async ({ input, context }) => {
    const { roster } = await badgeClass(context, input.classId);
    if (!roster.some((row) => row.userId === input.studentId))
      throw new ORPCError("NOT_FOUND");
    const badge = (
      await badgesOf(context.tx, context.tenantId, [input.studentId])
    ).get(input.studentId);
    if (!badge) throw new ORPCError("NOT_FOUND");
    await voidBadges(context.tx, {
      tenantId: context.tenantId,
      accountIds: [badge.accountId],
      reason: "admin",
    });
    await audit(context, {
      action: "account.badge_void",
      objectType: "account",
      objectId: badge.accountId,
      subjectUserId: input.studentId,
      details: { classId: input.classId },
    });
    return { stopped: true };
  });
