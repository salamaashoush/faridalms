import { changeOf } from "@faridalms/database/audit";
import {
  activateTool as putToUse,
  insertTool,
  removeTool as dropTool,
  toolById,
  toolsOf,
  updateTool,
} from "@faridalms/database/stores/lti";
import {
  activateToolSchema,
  registerToolSchema,
  saveToolSchema,
  toolRefSchema,
} from "@faridalms/domain/lti";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registrationAddress } from "../lti/registration";
import { issuerOf } from "../lti/shared";

/** What a tool's maker needs to register the school with it. */
function platformOf(context: UnitContext) {
  const issuer = issuerOf(context.school);
  return {
    issuer,
    jwksUrl: `${issuer}/jwks`,
    authUrl: `${issuer}/auth`,
    tokenUrl: `${issuer}/token`,
    configurationUrl: `${issuer}/openid-configuration`,
  };
}

/** The school's outside tools, with what each tool needs to know of the school. */
export const tools = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  return {
    platform: platformOf(context),
    tools: await toolsOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
    }),
  };
});

/** The tools a teacher may place in a lesson or brief, those in use. */
export const available = readProcedure.handler(async ({ context }) => {
  if (!can(context, "learning:author") && !can(context, "assignments:author"))
    throw new ORPCError("FORBIDDEN");
  return (
    await toolsOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
    })
  )
    .filter((tool) => tool.state === "active")
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      deepLinking: tool.deepLinkUrl !== null,
    }));
});

/**
 * Registers an outside tool or changes one. A new tool is given its client
 * and deployment ids here, which never change after.
 */
export const saveTool = writeProcedure
  .input(saveToolSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const fields = {
      name: input.name,
      loginUrl: input.loginUrl,
      launchUrl: input.launchUrl,
      redirectUrls: [...new Set(input.redirectUrls)],
      jwksUrl: input.jwksUrl,
      deepLinkUrl: input.deepLinkUrl || null,
      reviewUrl: input.reviewUrl || null,
      sendNames: input.sendNames,
      grades: input.grades,
      roster: input.roster,
      custom: input.custom,
    };
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    if (input.id) {
      const before = await toolById(context.tx, {
        ...scope,
        id: input.id,
        pending: true,
      });
      const saved = await updateTool(context.tx, {
        ...scope,
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      await audit(context, {
        action: "lti_tool.update",
        objectType: "lti_tool",
        objectId: input.id,
        details: { name: input.name },
        change: changeOf("core.lti_tools", before, fields),
      });
      return { id: input.id, version: saved.version };
    }
    const created = await insertTool(context.tx, {
      ...scope,
      ...fields,
      clientId: crypto.randomUUID(),
      deploymentId: crypto.randomUUID(),
    });
    await audit(context, {
      action: "lti_tool.create",
      objectType: "lti_tool",
      objectId: created.id,
      details: { name: input.name },
    });
    return created;
  });

/**
 * Puts a tool that registered itself to use, once an administrator has
 * looked at what it asked for and set what the school gives it.
 */
export const activateTool = writeProcedure
  .input(activateToolSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const tool = await toolById(context.tx, {
      ...scope,
      id: input.id,
      pending: true,
    });
    if (!tool) throw new ORPCError("NOT_FOUND");
    const saved = await putToUse(context.tx, {
      ...scope,
      id: input.id,
      expectedVersion: input.expectedVersion,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "lti_tool.activate",
      objectType: "lti_tool",
      objectId: input.id,
      details: { name: tool.name },
    });
    return { version: saved.version };
  });

/**
 * Starts a tool registering itself from the address its maker gives, LTI
 * Dynamic Registration: the address to open, carrying where the school
 * describes itself and a token for one registration within the hour.
 */
export const startRegistration = writeProcedure
  .input(registerToolSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const url = await registrationAddress(context, input.url);
    await audit(context, {
      action: "lti_tool.registration_started",
      objectType: "lti_tool",
      details: { host: new URL(input.url).host },
    });
    return { url };
  });

export const removeTool = writeProcedure
  .input(toolRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const tool = await toolById(context.tx, {
      ...scope,
      id: input.id,
      pending: true,
    });
    if (!tool || !(await dropTool(context.tx, { ...scope, id: input.id })))
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "lti_tool.remove",
      objectType: "lti_tool",
      objectId: input.id,
      details: { name: tool.name },
    });
    return {};
  });
