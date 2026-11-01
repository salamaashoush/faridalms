import type { AuditEntry } from "@faridalms/database/audit";
import type { Access } from "@faridalms/database/context";
import type { Capability } from "@faridalms/domain/capabilities";

import { writeAudit } from "@faridalms/database/audit";
import { bindActor, TenantUnavailableError } from "@faridalms/database/context";
import { mapDatabaseError } from "@faridalms/database/errors";
import {
  effectiveAccess,
  findSession,
  schoolProfile,
  touchSession,
} from "@faridalms/database/stores/identity";
import { WORKSPACE_OF } from "@faridalms/domain/workspace";
import { ORPCError, os } from "@orpc/server";

import type { RequestContext, SchoolContext, UnitContext } from "./context";

import { bearer, LIFETIME, parseToken, SHARED_LIFETIME } from "./session";

/** The school slug the web backend forwards, taken from the host or the school cookie. */
export const SCHOOL_HEADER = "x-farida-school";
export const LOCALE_HEADER = "x-farida-locale";

const zones = new Map<string, { at: number; zone: string }>();

export async function schoolZone(context: UnitContext["tx"], schoolId: string) {
  const hit = zones.get(schoolId);
  if (hit && Date.now() - hit.at < 300_000) return hit.zone;
  const school = await schoolProfile(context, schoolId);
  const zone = school?.timeZone ?? "UTC";
  zones.set(schoolId, { at: Date.now(), zone });
  return zone;
}

export function dateIn(zone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Database and tenant failures become stable domain codes. */
function toApiError(error: unknown): unknown {
  if (error instanceof ORPCError) return error;
  if (error instanceof TenantUnavailableError)
    return error.reason === "unknown"
      ? new ORPCError("UNAUTHORIZED")
      : new ORPCError("SERVICE_UNAVAILABLE", {
          message: "tenant.read_only",
          data: { retryAfter: 60 },
        });
  const mapped = mapDatabaseError(error);
  if (!mapped) return error;
  switch (mapped.kind) {
    case "conflict":
    case "frozen":
    case "stale":
      return new ORPCError("CONFLICT", { message: mapped.code });
    case "validation":
      return new ORPCError("BAD_REQUEST", { message: mapped.code });
    case "missing":
      return new ORPCError("NOT_FOUND");
    case "retry":
      return new ORPCError("SERVICE_UNAVAILABLE", {
        message: mapped.code,
        data: { retryAfter: 5 },
      });
    case "bug":
      return error;
  }
  return error;
}

export const publicProcedure = os
  .$context<RequestContext>()
  .use(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw toApiError(error);
    }
  });

/** Resolves the school named by the request, for flows before sign-in. */
export const schoolProcedure = publicProcedure.use(
  async ({ context, next }) => {
    const school = await schoolOf(context);
    if (!school) throw new ORPCError("UNAUTHORIZED");
    return next({ context: { school } satisfies Partial<SchoolContext> });
  },
);

/** The school a request names, from the host or the school cookie the web forwards. */
export async function schoolOf(
  context: RequestContext,
): Promise<SchoolContext["school"] | null> {
  const slug = context.headers.get(SCHOOL_HEADER)?.trim().toLowerCase();
  return slug ? context.directory.bySlug(slug) : null;
}

/**
 * One transaction per unit of work. The tenant comes from the session token,
 * the school from the request, and they must agree; then the session is found
 * under row level security, the actor bound for the audit trigger, and the
 * person's access at that school resolved once for the whole unit of work.
 */
export async function openUnit<T>(
  context: SchoolContext,
  access: Access,
  run: (unit: Omit<UnitContext, keyof SchoolContext>) => Promise<T>,
): Promise<T> {
  const token = parseToken(bearer(context.headers));
  if (!token || token.tenantId !== context.school.tenantId)
    throw new ORPCError("UNAUTHORIZED");
  const deferred: (() => Promise<void>)[] = [];
  const result = await context.cell.withTenant(
    {
      tenantId: token.tenantId,
      requestId: context.requestId,
      actor: { kind: "user" },
    },
    access,
    async (tx, lifecycle, now) => {
      const session = await findSession(tx, token.tenantId, token.tokenHash);
      if (!session) throw new ORPCError("UNAUTHORIZED");
      await bindActor(tx, {
        tenantId: token.tenantId,
        requestId: context.requestId,
        actor: {
          kind: "user",
          userId: session.userId,
          accountId: session.accountId,
          sessionId: session.id,
        },
      });
      if (lifecycle === "active")
        await touchSession(
          tx,
          session,
          session.clientKind === "shared_device"
            ? SHARED_LIFETIME.idle
            : LIFETIME[session.context].idle,
        );
      const schoolId = context.school.schoolId;
      const today = dateIn(await schoolZone(tx, schoolId), now);
      const resolved = await effectiveAccess(tx, {
        tenantId: token.tenantId,
        userId: session.userId,
        orgId: schoolId,
        today,
        context: session.context,
      });
      if (!resolved.contexts.includes(session.context))
        throw new ORPCError("UNAUTHORIZED");
      return run({
        tx,
        tenantId: token.tenantId,
        schoolId,
        today,
        now,
        actor: {
          userId: session.userId,
          accountId: session.accountId,
          sessionId: session.id,
          context: session.context,
          profile: resolved.profile,
          workspace: WORKSPACE_OF[resolved.profile],
          roles: resolved.roles,
          capabilities: resolved.capabilities,
          contexts: resolved.contexts,
        },
        afterCommit: (task) => {
          deferred.push(task);
        },
      });
    },
  );
  for (const task of deferred) {
    try {
      await task();
    } catch (error) {
      console.error(
        JSON.stringify({
          requestId: context.requestId,
          afterCommit: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  return result;
}

function unit(access: Access) {
  return schoolProcedure.use(async ({ context, next }) =>
    openUnit(context, access, async (unitContext) =>
      next({ context: unitContext }),
    ),
  );
}

/** Reads; they succeed while the tenant is frozen for a move. */
export const readProcedure = unit("read");
/** Writes; they need an active tenant. */
export const writeProcedure = unit("write");

export function can(context: UnitContext, capability: Capability): boolean {
  return context.actor.capabilities.has(capability);
}

/** Authorise by capability. A capability lets a procedure run; it grants no record. */
export function requireCapability(
  context: UnitContext,
  ...capabilities: Capability[]
): void {
  if (!capabilities.some((capability) => can(context, capability)))
    throw new ORPCError("FORBIDDEN");
}

export function audit(context: UnitContext, entry: AuditEntry) {
  return writeAudit(context.tx, context.tenantId, {
    orgId: context.schoolId,
    ...entry,
  });
}

/** The reader's language, for sorting names and resolving labels. */
export function localeOf(context: RequestContext): "ar" | "en" {
  return context.headers.get(LOCALE_HEADER) === "ar" ? "ar" : "en";
}
