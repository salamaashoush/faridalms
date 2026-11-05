import type { SchoolHost } from "@faridalms/database/directory/hosts";

import { HostRefusedError } from "@faridalms/database/directory/hosts";
import {
  addHostSchema,
  customHostProblem,
  expectedRecords,
  hostRefSchema,
  platformName,
} from "@faridalms/domain/hosts";
import { ORPCError } from "@orpc/server";
import { randomBytes } from "node:crypto";

import type { SchoolContext, UnitContext } from "../core/context";

import {
  audit,
  openUnit,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";

/** The cell's host access, or a refusal where this deployment has none. */
function hostAccess(context: SchoolContext) {
  if (!context.hosts)
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "hosts.unavailable",
    });
  return context.hosts;
}

function shown(context: SchoolContext, host: SchoolHost) {
  return {
    ...host,
    records: expectedRecords(
      host,
      context.school.slug,
      context.domains,
      context.edgeAddress,
    ),
  };
}

// The directory holds no personal data; the cell's audit names the person.
const REASON = {
  add: "Added by the school's site manager",
  remove: "Removed by the school's site manager",
  canonical: "Chosen by the school's site manager",
};

/**
 * The school's addresses: its platform names, which always work, and the
 * hosts of its own it binds, each with the records it must publish.
 */
export const list = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "site:manage");
  const hosts = context.hosts
    ? await context.hosts.registry.list(context.schoolId)
    : [];
  return {
    available: context.hosts !== null,
    platform: {
      site: platformName(context.school.slug, "site", context.domains),
      portal: platformName(context.school.slug, "portal", context.domains),
    },
    hosts: hosts.map((host) => shown(context, host)),
  };
});

/** Binds a hostname of the school's own, pending until its records are found. */
export const add = writeProcedure
  .input(addHostSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const access = hostAccess(context);
    const problem = customHostProblem(input.hostname, context.domains);
    if (problem) throw new ORPCError("BAD_REQUEST", { message: problem });
    let host: SchoolHost;
    try {
      host = await access.registry.add({
        schoolId: context.schoolId,
        hostname: input.hostname,
        role: input.role,
        challenge: randomBytes(24).toString("base64url"),
        reason: REASON.add,
      });
    } catch (error) {
      if (error instanceof HostRefusedError)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    }
    await audit(context, {
      action: "site.host_add",
      objectType: "org",
      objectId: context.schoolId,
      details: { hostname: host.hostname, role: host.role },
    });
    return shown(context, host);
  });

export const remove = writeProcedure
  .input(hostRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const removed = await hostAccess(context).registry.remove({
      schoolId: context.schoolId,
      hostname: input.hostname,
      reason: REASON.remove,
    });
    if (!removed) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "site.host_remove",
      objectType: "org",
      objectId: context.schoolId,
      details: { hostname: input.hostname },
    });
    return { ok: true };
  });

export const makeCanonical = writeProcedure
  .input(hostRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const made = await hostAccess(context).registry.makeCanonical({
      schoolId: context.schoolId,
      hostname: input.hostname,
      reason: REASON.canonical,
    });
    if (!made) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "site.host_canonical",
      objectType: "org",
      objectId: context.schoolId,
      details: { hostname: input.hostname },
    });
    return { ok: true };
  });

/**
 * Checks a host's records now. The lookups run after the unit that
 * authorised them has closed, so no transaction waits on DNS.
 */
export const check = schoolProcedure
  .input(hostRefSchema)
  .handler(async ({ input, context }) => {
    await openUnit(context, "write", async (unit) => {
      const full: UnitContext = { ...context, ...unit };
      requireCapability(full, "site:manage");
      await audit(full, {
        action: "site.host_check",
        objectType: "org",
        objectId: context.school.schoolId,
        details: { hostname: input.hostname },
      });
    });
    const host = await hostAccess(context).checks.check(
      context.school.schoolId,
      input.hostname,
    );
    if (!host) throw new ORPCError("NOT_FOUND");
    return shown(context, host);
  });
