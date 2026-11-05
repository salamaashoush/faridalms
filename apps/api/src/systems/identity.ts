import type { CellTransaction } from "@faridalms/database/context";
import type { InviteHolder } from "@faridalms/database/stores/invites";
import type { Workspace } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor } from "@faridalms/database/context";
import {
  ensureAccount,
  revokeAccountSessions,
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
  countAttempt,
  createSession,
  effectiveAccess,
  findPasswordIdentity,
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
  requestResetSchema,
} from "@faridalms/domain/first-sign-in";
import { hostOf, placeOf, platformName } from "@faridalms/domain/hosts";
import {
  badgeSignInSchema,
  childSessionSchema,
  signInSchema,
  switchContextSchema,
} from "@faridalms/domain/identity-schema";
import {
  findSchoolsSchema,
  findSchools as findSchoolsIn,
  portalFaceSchema,
} from "@faridalms/domain/portal-face";
import { schoolDate } from "@faridalms/domain/school";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { SchoolContext, UnitContext } from "../core/context";

import { modulesOf } from "../core/modules";
import { sendPasswordReset } from "../core/password-reset";
import {
  openSession,
  provePassword,
  refuseSignIn,
} from "../core/password-sign-in";
import { portalFace as readFace } from "../core/portal-face";
import {
  audit,
  can,
  publicProcedure,
  readProcedure,
  requireCapability,
  schoolProcedure,
  schoolZone,
  writeProcedure,
} from "../core/procedure";
import { scopeFor } from "../core/reach";
import { confirmRegistration } from "../core/registration";
import {
  attemptKey,
  badgeHash,
  ipPrefix,
  issueToken,
  LIFETIME,
  SHARED_LIFETIME,
  userAgentSummary,
} from "../core/session";

const PER_NAME = 10;
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
        const proof = await provePassword(tx, context, {
          tenantId,
          loginName: input.loginName,
          password: input.password,
        });
        if (proof.limited) return { ok: false, code: "auth.too_many_attempts" };
        const { identity } = proof;
        const today = schoolDate(
          (await schoolProfile(tx, schoolId))?.timeZone ?? "UTC",
        );
        const access =
          identity && proof.valid
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
          await refuseSignIn(tx, tenantId, proof);
          return { ok: false, code: "auth.invalid_credentials" };
        }
        return {
          ok: true,
          ...(await openSession(tx, context, {
            tenantId,
            schoolId,
            accountId: identity.accountId,
            userId: identity.userId,
            identityId: identity.identityId,
            firstTime: identity.firstAuthenticatedAt === null,
            sessionContext: chosen,
            today,
            network: proof.network,
            nameKey: proof.nameKey,
          })),
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
        const today = schoolDate(
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
 * signed in. A link that is unknown, used, expired, or an invite for an
 * account that has since been given a password reads the same, and wrong
 * guesses from one network are counted and stopped as wrong badges are. A
 * reset link replaces the password, so using it signs the account out
 * everywhere.
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
        (holder.hasPassword && holder.purpose !== "reset") ||
        !["invited", "active"].includes(holder.accountState)
      ) {
        if (networkKey)
          await countAttempt(tx, tenantId, networkKey, WINDOW_MINUTES);
        return { ok: false as const, code: "auth.invalid_invite" as const };
      }
      if (redeem) {
        await redeem(tx, { ...holder, loginName });
        if (holder.purpose === "reset")
          await revokeAccountSessions(tx, tenantId, holder.accountId);
        if (holder.purpose === "register")
          await confirmRegistration(tx, {
            tenantId,
            schoolId: context.school.schoolId,
            userId: holder.userId,
            email: loginName,
            today: schoolDate(
              await schoolZone(tx, context.school.schoolId),
              new Date(),
            ),
          });
        await writeAudit(tx, tenantId, {
          action: "account.password_set",
          objectType: "account",
          objectId: holder.accountId,
          orgId: context.school.schoolId,
          subjectUserId: holder.userId,
          details: { method: holder.purpose },
        });
      }
      return {
        ok: true as const,
        loginName,
        reset: holder.purpose === "reset",
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
  return {
    loginName: outcome.loginName,
    name: outcome.name,
    reset: outcome.reset,
  };
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
    // Hashed only once the link holds, so a stranger's guesses cost no
    // password hashing.
    const accepted = await heldInvite(
      context,
      input.secret,
      async (tx, holder) =>
        redeemInvite(tx, {
          tenantId: context.school.tenantId,
          identityId: holder.identityId,
          accountId: holder.accountId,
          loginName: holder.loginName,
          secretHash: await Bun.password.hash(input.password, {
            algorithm: "argon2id",
          }),
        }),
    );
    // The account may now hold its first password sign-in name.
    await context.logins?.refresh(context.school.tenantId);
    return accepted;
  });

/**
 * Emails a link that replaces a forgotten password to the address held for
 * the account's person. The answer is the same whether the name exists, has
 * an address, or the email went, so it tells a stranger nothing about who
 * has an account.
 */
export const requestPasswordReset = schoolProcedure
  .input(requestResetSchema)
  .handler(async ({ input, context }) => {
    const limited = await sendPasswordReset(context, {
      tenantId: context.school.tenantId,
      loginName: input.loginName,
      school: async () => context.school,
    });
    if (limited)
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "auth.too_many_attempts",
      });
    return { requested: true };
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

/** Past a soft limit nothing is refused; the school's administrators are told. */
function over(count: number | undefined, limit: number | null) {
  return count !== undefined && limit !== null && count > limit
    ? { count, limit }
    : null;
}

function contractOf(school: UnitContext["school"]) {
  const entitled = school.entitlements;
  return {
    notice: entitled.notice,
    trialEndsOn: entitled.trialEndsOn,
    students: over(school.counts?.students, entitled.students),
    staffAccounts: over(school.counts?.staffAccounts, entitled.staffAccounts),
  };
}

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
    modules: await modulesOf(context),
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
    // What the platform says about the school's contract is for those who run it.
    contract: can(context, "school:manage") ? contractOf(context.school) : null,
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
      scopeFor(context, "teaching"),
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

/**
 * What a host serves, for the web to route a request before anything else:
 * the school, whether it is the school's website or its portal, and the
 * school's own canonical host for that role when the request should be sent
 * there instead. Null for a host that serves nothing, which the web answers
 * with a 404 rather than a guess.
 */
export const resolveHost = publicProcedure
  .input(v.object({ host: v.pipe(v.string(), v.maxLength(260)) }))
  .handler(async ({ input, context }) => {
    const hostname = hostOf(input.host);
    if (!hostname) return null;
    const place = placeOf(hostname, context.domains);
    const routed =
      place.kind === "platform"
        ? await context.directory
            .bySlug(place.slug)
            .then((school) => (school ? { school, role: place.role } : null))
        : place.kind === "custom"
          ? await context.directory.byHost(hostname)
          : null;
    if (!routed) return null;
    const canonical = routed.school.hosts[routed.role];
    return {
      slug: routed.school.slug,
      role: routed.role,
      redirect: canonical && canonical !== hostname ? canonical : null,
    };
  });

/**
 * How a school's portal looks to someone not yet signed in: its names,
 * logo, website theme and the sign-in page it published. Only what the
 * school already shows strangers, kept briefly, so drawing a sign-in page
 * does not reach the cell each time.
 */
export const portalFace = publicProcedure
  .input(portalFaceSchema)
  .handler(({ input, context }) =>
    readFace(context, input.school, input.locale, input.door),
  );

const FINDER_WINDOW_MS = 60_000;
const FINDER_PER_NETWORK = 30;
// Networks come from requests, so the count must not grow without bound.
const FINDER_NETWORKS = 10_000;
const searches = new Map<string, number[]>();

/**
 * Whether one network may search again. Kept in memory: a search reads only
 * the directory's cached list, so the limit is there to slow a script
 * walking the list, and a restart forgetting a minute of it costs nothing.
 */
function finderAllows(network: string, now: number) {
  const recent = (searches.get(network) ?? []).filter(
    (at) => now - at < FINDER_WINDOW_MS,
  );
  if (recent.length >= FINDER_PER_NETWORK) return false;
  searches.delete(network);
  if (searches.size >= FINDER_NETWORKS) {
    const oldest = searches.keys().next();
    if (!oldest.done) searches.delete(oldest.value);
  }
  searches.set(network, [...recent, now]);
  return true;
}

/**
 * The school finder on the bare portal domain: schools a person may sign in
 * to now, by name in either language or by code, each with only its names
 * and the portal address to go to. A school that is not listed answers only
 * to its exact code, and nothing else about a school (its tenant, group,
 * state or website) leaves the directory.
 */
export const findSchools = publicProcedure
  .input(findSchoolsSchema)
  .handler(async ({ input, context }) => {
    const network =
      ipPrefix(context.headers, context.trustedProxyHops) ?? "unknown";
    if (!finderAllows(network, Date.now()))
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "auth.too_many_attempts",
      });
    const found = findSchoolsIn(
      input.query,
      await context.directory.signInSchools(),
    );
    return {
      schools: found.map((school) => ({
        slug: school.slug,
        nameEn: school.nameEn,
        nameAr: school.nameAr,
        portalHost:
          school.portalHost ??
          platformName(school.slug, "portal", context.domains),
      })),
    };
  });
