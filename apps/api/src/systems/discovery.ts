import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { SessionContext } from "@faridalms/domain/workspace";

import { writeAudit } from "@faridalms/database/audit";
import {
  issueHandoff,
  redeemHandoff as spendHandoff,
} from "@faridalms/database/stores/handoffs";
import {
  clearAttempts,
  schoolProfile,
} from "@faridalms/database/stores/identity";
import {
  discoverResetSchema,
  discoverSignInSchema,
  HANDOFF_SECONDS,
  redeemHandoffSchema,
} from "@faridalms/domain/identity-schema";
import { schoolDate } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import { createHmac, randomBytes } from "node:crypto";

import type { RequestContext } from "../core/context";
import type { PasswordProof } from "../core/password-sign-in";

import { sendPasswordReset } from "../core/password-reset";
import {
  dummyHash,
  openSession,
  provePassword,
  refuseSignIn,
} from "../core/password-sign-in";
import { portalHost } from "../core/portal";
import { publicProcedure, schoolProcedure } from "../core/procedure";
import { badgeHash, ipPrefix } from "../core/session";
import { bareHumanCheck } from "../core/turnstile";
import { accessAtSchool } from "../people/access";

const WINDOW_MS = 15 * 60_000;
// Beyond each school's own limits, which still apply: the bare domain is
// one door to every school, so it is watched as a whole.
const BARE_PER_NAME = 20;
const BARE_PER_NETWORK = 100;
const MAX_TRACKED = 20_000;
const attempts = new Map<string, number[]>();

/**
 * Counts an attempt on the bare domain against a key and says whether it
 * may go ahead. Kept in memory: the counts guard one process for a quarter
 * of an hour, and a restart forgetting them costs little beside each
 * school's own limits, which the database keeps.
 */
function bareAllows(key: string, now: number, limit: number) {
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  attempts.delete(key);
  if (attempts.size >= MAX_TRACKED) {
    const oldest = attempts.keys().next();
    if (!oldest.done) attempts.delete(oldest.value);
  }
  attempts.set(key, [...recent, now]);
  return recent.length < limit;
}

function bareLimits(context: RequestContext, loginName: string) {
  const network =
    ipPrefix(context.headers, context.trustedProxyHops) ?? "unknown";
  const name = createHmac("sha256", context.cellSecret)
    .update(`bare:${loginName}`)
    .digest("hex");
  const now = Date.now();
  const byName = bareAllows(`name:${name}`, now, BARE_PER_NAME);
  const byNetwork = bareAllows(`ip:${network}`, now, BARE_PER_NETWORK);
  if (!byName || !byNetwork)
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "auth.too_many_attempts",
    });
}

/** The public key the bare domain's forms render their human check with, if any. */
export const humanCheck = publicProcedure.handler(({ context }) => ({
  siteKey: context.turnstile?.siteKey ?? null,
}));

const refused = () =>
  new ORPCError("BAD_REQUEST", { message: "auth.invalid_credentials" });

/** The cell's schools a person may be signed in to now, by tenant. */
async function schoolsOf(context: RequestContext, tenantId: string) {
  const open = new Set(
    (await context.directory.signInSchools()).map((school) => school.slug),
  );
  return (await context.directory.schoolsOfTenant(tenantId)).filter(
    (school) => school.cellId === context.cellId && open.has(school.slug),
  );
}

/** A proved sign-in: the handoff to one school, or the schools to choose from. */
export type Discovered =
  | { handoff: { slug: string; portalHost: string; token: string } }
  | {
      schools: { slug: string; nameEn: string | null; nameAr: string | null }[];
    };

interface Candidate {
  school: DirectorySchool;
  sessionContext: SessionContext;
}

type TenantOutcome =
  | { kind: "limited" }
  | {
      kind: "refused";
      tenantId: string;
      proof: Extract<PasswordProof, { limited: false }>;
    }
  | {
      kind: "proved";
      tenantId: string;
      accountId: string;
      identityId: string;
      network: string | null;
      nameKey: Buffer;
      candidates: Candidate[];
    };

/**
 * The password checked in one tenant, and the schools there it opens. A
 * refusal is recorded later, only if no tenant accepted the password, so a
 * person with accounts in two groups is not locked out of one by signing in
 * to the other.
 */
async function tryTenant(
  context: RequestContext,
  tenantId: string,
  input: { loginName: string; password: string },
): Promise<TenantOutcome> {
  const schools = await schoolsOf(context, tenantId);
  return context.cell.withTenant<TenantOutcome>(
    { tenantId, requestId: context.requestId, actor: { kind: "user" } },
    "session",
    async (tx) => {
      const proof = await provePassword(tx, context, { tenantId, ...input });
      if (proof.limited) return { kind: "limited" };
      const { identity } = proof;
      if (!identity || !proof.valid)
        return { kind: "refused", tenantId, proof };
      const candidates: Candidate[] = [];
      for (const school of schools) {
        const today = schoolDate(
          (await schoolProfile(tx, school.schoolId))?.timeZone ?? "UTC",
        );
        const access = await accessAtSchool(
          tx,
          { school, extensions: context.extensions },
          { userId: identity.userId, today, context: "staff" },
        );
        const sessionContext = access.contexts[0];
        if (sessionContext) candidates.push({ school, sessionContext });
      }
      if (candidates.length === 0) return { kind: "refused", tenantId, proof };
      return {
        kind: "proved",
        tenantId,
        accountId: identity.accountId,
        identityId: identity.identityId,
        network: proof.network,
        nameKey: proof.nameKey,
        candidates,
      };
    },
  );
}

/**
 * Sign-in on the bare portal domain, which names no school. The school is
 * found only once the password is right: an unknown name, a wrong password
 * and a name with no school to open all read exactly as a refused sign-in
 * at a school does, after the same password hashing. On success no session
 * opens here; the answer is a handoff that the school's own portal, and
 * only it, turns into one within a minute. Where the name and password open
 * more than one school, their names are the answer, to choose from.
 */
export const discoverSignIn = publicProcedure
  .input(discoverSignInSchema)
  .handler(async ({ input, context }): Promise<Discovered> => {
    bareLimits(context, input.loginName);
    if (!(await bareHumanCheck(context, input.human, "sign_in")))
      throw refused();
    const logins = context.logins;
    const tenants = logins ? await logins.tenantsOf(input.loginName) : [];
    const local = new Set(
      await context.directory.tenantsOfCell(context.cellId),
    );
    const outcomes: TenantOutcome[] = [];
    for (const tenantId of tenants.filter((tenant) => local.has(tenant)))
      outcomes.push(
        await tryTenant(context, tenantId, {
          loginName: input.loginName,
          password: input.password,
        }),
      );
    if (outcomes.length === 0)
      await Bun.password.verify(input.password, dummyHash);
    const proved = outcomes.filter(
      (outcome): outcome is Extract<TenantOutcome, { kind: "proved" }> =>
        outcome.kind === "proved",
    );
    if (proved.length === 0) {
      for (const outcome of outcomes)
        if (outcome.kind === "refused")
          await context.cell.withTenant(
            {
              tenantId: outcome.tenantId,
              requestId: context.requestId,
              actor: { kind: "user" },
            },
            "session",
            (tx) => refuseSignIn(tx, outcome.tenantId, outcome.proof),
          );
      if (outcomes.some((outcome) => outcome.kind === "limited"))
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "auth.too_many_attempts",
        });
      throw refused();
    }
    const choices = proved.flatMap((outcome) =>
      outcome.candidates.map((candidate) => ({ outcome, candidate })),
    );
    const picked =
      choices.length === 1
        ? choices[0]
        : choices.find(
            (choice) => choice.candidate.school.slug === input.school,
          );
    if (!picked)
      return {
        schools: choices.map(({ candidate: { school } }) => ({
          slug: school.slug,
          nameEn: school.nameEn,
          nameAr: school.nameAr,
        })),
      };
    const { outcome, candidate } = picked;
    const token = randomBytes(32).toString("base64url");
    await context.cell.withTenant(
      {
        tenantId: outcome.tenantId,
        requestId: context.requestId,
        actor: { kind: "user" },
      },
      "session",
      async (tx) => {
        await issueHandoff(tx, {
          tenantId: outcome.tenantId,
          accountId: outcome.accountId,
          secretHash: badgeHash(token),
          expiresAt: new Date(Date.now() + HANDOFF_SECONDS * 1000),
          claim: {
            schoolId: candidate.school.schoolId,
            network: outcome.network,
            context: candidate.sessionContext,
            identityId: outcome.identityId,
          },
        });
        await clearAttempts(tx, outcome.tenantId, outcome.nameKey);
        await writeAudit(tx, outcome.tenantId, {
          action: "account.sign_in_handoff",
          objectType: "account",
          objectId: outcome.accountId,
          orgId: candidate.school.schoolId,
        });
      },
    );
    return {
      handoff: {
        slug: candidate.school.slug,
        portalHost: portalHost(candidate.school, context.domains),
        token,
      },
    };
  });

/**
 * Turns a handoff into a session at the school whose portal received it.
 * The secret is spent on the first try, right or wrong, and holds only for
 * its account, at its school, within its minute. It is not bound to the
 * network that proved the password: carrier-grade NAT gives one browser a
 * different public address per connection, so the school's portal often
 * sees another network than the bare domain did a second earlier.
 */
export const redeemHandoff = schoolProcedure
  .input(redeemHandoffSchema)
  .handler(async ({ input, context }) => {
    const { tenantId, schoolId } = context.school;
    const network = ipPrefix(context.headers, context.trustedProxyHops);
    const session = await context.cell.withTenant(
      { tenantId, requestId: context.requestId, actor: { kind: "user" } },
      "session",
      async (tx) => {
        const held = await spendHandoff(tx, tenantId, badgeHash(input.token));
        if (!held || !held.fresh || held.schoolId !== schoolId) return null;
        const today = schoolDate(
          (await schoolProfile(tx, schoolId))?.timeZone ?? "UTC",
        );
        const access = await accessAtSchool(tx, context, {
          userId: held.userId,
          today,
          context: held.context,
        });
        if (!access.contexts.includes(held.context)) return null;
        return openSession(tx, context, {
          tenantId,
          schoolId,
          accountId: held.accountId,
          userId: held.userId,
          identityId: held.identityId,
          firstTime: held.firstAuthenticatedAt === null,
          sessionContext: held.context,
          today,
          network,
          nameKey: null,
          details: { method: "handoff" },
        });
      },
    );
    if (!session)
      throw new ORPCError("BAD_REQUEST", { message: "auth.invalid_handoff" });
    return session;
  });

/**
 * A forgotten password asked for on the bare domain: every school group
 * holding the name emails its own link, to its person's school, and the
 * answer is the same whatever happened.
 */
export const discoverReset = publicProcedure
  .input(discoverResetSchema)
  .handler(async ({ input, context }) => {
    bareLimits(context, input.loginName);
    if (!(await bareHumanCheck(context, input.human, "reset")))
      return { requested: true };
    const tenants = context.logins
      ? await context.logins.tenantsOf(input.loginName)
      : [];
    const local = new Set(
      await context.directory.tenantsOfCell(context.cellId),
    );
    let limited = false;
    for (const tenantId of tenants.filter((tenant) => local.has(tenant))) {
      const schools = await schoolsOf(context, tenantId);
      limited =
        (await sendPasswordReset(context, {
          tenantId,
          loginName: input.loginName,
          school: async (tx, person) => {
            for (const school of schools) {
              const today = schoolDate(
                (await schoolProfile(tx, school.schoolId))?.timeZone ?? "UTC",
              );
              const access = await accessAtSchool(
                tx,
                { school, extensions: context.extensions },
                { userId: person.userId, today, context: "staff" },
              );
              if (access.contexts.length > 0) return school;
            }
            return null;
          },
        })) || limited;
    }
    if (limited)
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "auth.too_many_attempts",
      });
    return { requested: true };
  });
