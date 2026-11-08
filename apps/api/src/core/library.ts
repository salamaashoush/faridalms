import type { TemplateKind } from "@faridalms/domain/templates";

import { schoolSwitch } from "@faridalms/database/stores/identity";
import { templateById } from "@faridalms/database/stores/templates";
import { COMMONS_SWITCH } from "@faridalms/domain/library";
import { LIBRARY_USERS } from "@faridalms/domain/media-library";
import { TEMPLATE_AUTHORS } from "@faridalms/domain/templates";

import type { UnitContext } from "./context";

import { can } from "./procedure";
import { isStaff } from "./reach";

/**
 * Whether the viewer may search Wikimedia Commons for pictures: someone
 * signed in as staff who writes for others, at a school that turned it on.
 * Students and families never may, whatever they hold.
 */
export async function searchesCommons(context: UnitContext) {
  return (
    isStaff(context) &&
    LIBRARY_USERS.some((capability) => can(context, capability)) &&
    (await schoolSwitch(
      context.tx,
      context.tenantId,
      context.schoolId,
      COMMONS_SWITCH,
    ))
  );
}

/** Whether the viewer writes a kind of document, and so keeps and uses its library pieces. */
export const writesKind = (context: UnitContext, kind: TemplateKind) =>
  TEMPLATE_AUTHORS[kind].some((capability) => can(context, capability));

/** Where a library piece's document is kept. */
export const templateHost = (id: string) => ({ type: "document_template", id });

/**
 * A piece of this school's library the viewer may open: one it shares, the
 * viewer's own, or one waiting for a reviewer the viewer is.
 */
export async function usableTemplate(context: UnitContext, id: string) {
  const row = await templateById(context.tx, context.tenantId, id);
  return row &&
    row.orgId === context.schoolId &&
    writesKind(context, row.kind) &&
    (row.state === "shared" ||
      row.ownerUserId === context.actor.userId ||
      can(context, "library:review"))
    ? row
    : null;
}
