import type { TemplateKind } from "@faridalms/domain/templates";

import { templateById } from "@faridalms/database/stores/templates";
import { wordOn } from "@faridalms/domain/modules";
import { TEMPLATE_AUTHORS, TEMPLATE_KINDS } from "@faridalms/domain/templates";

import type { UnitContext } from "./context";

import { contributionsTo, point } from "./extension";
import { modulesOf } from "./modules";
import { can } from "./procedure";

/** Whether the viewer writes a kind of document, and so keeps and uses its templates. */
export const writesKind = (context: UnitContext, kind: TemplateKind) =>
  TEMPLATE_AUTHORS[kind].some((capability) => can(context, capability));

/** The kinds of template the school has: core's, and those of the modules on. */
export async function kindsOn(context: UnitContext): Promise<TemplateKind[]> {
  const on = await modulesOf(context);
  return TEMPLATE_KINDS.filter((kind) => wordOn("templateKinds", kind, on));
}

/** Where a template's document is kept. */
export const templateHost = (id: string) => ({ type: "document_template", id });

/**
 * A template of this school the viewer may open: one it shares, the
 * viewer's own, or one waiting for a reviewer the viewer is.
 */
export async function usableTemplate(context: UnitContext, id: string) {
  const row = await templateById(context.tx, context.tenantId, id);
  return row &&
    row.orgId === context.schoolId &&
    writesKind(context, row.kind) &&
    (await kindsOn(context)).includes(row.kind) &&
    (row.state === "shared" ||
      row.ownerUserId === context.actor.userId ||
      can(context, "templates:review"))
    ? row
    : null;
}

/** What a module keeps beside a template of its own, and lets go of when the template is removed. */
export interface TemplatePart {
  removed(context: UnitContext, templateId: string): Promise<void>;
}

export const templateParts = point<TemplatePart>("template parts");

export async function templateRemoved(
  context: UnitContext,
  templateId: string,
): Promise<void> {
  for (const part of await contributionsTo(context, templateParts))
    await part.removed(context, templateId);
}
