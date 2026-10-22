import {
  insertTool,
  removeTool as dropTool,
  toolById,
  toolsOf,
  updateTool,
} from "@faridalms/database/stores/lti";
import { saveToolSchema, toolRefSchema } from "@faridalms/domain/lti";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { issuerOf } from "../lti/routes";

/** What a tool's maker needs to register the school with it. */
function platformOf(context: UnitContext) {
  const issuer = issuerOf(context.school);
  return {
    issuer,
    jwksUrl: `${issuer}/jwks`,
    authUrl: `${issuer}/auth`,
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

/** The tools a teacher may place in a lesson or brief. */
export const available = readProcedure.handler(async ({ context }) => {
  if (!can(context, "learning:author") && !can(context, "assignments:author"))
    throw new ORPCError("FORBIDDEN");
  return (
    await toolsOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
    })
  ).map((tool) => ({
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
      sendNames: input.sendNames,
      custom: input.custom,
    };
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    if (input.id) {
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

export const removeTool = writeProcedure
  .input(toolRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const tool = await toolById(context.tx, { ...scope, id: input.id });
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
