import type { ContentDocument } from "@faridalms/domain/content";

import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import {
  insertTemplate,
  removeTemplate,
  templateById,
  templatesOf,
} from "@faridalms/database/stores/templates";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  saveTemplateSchema,
  templateKindSchema,
  templateRefSchema,
} from "@faridalms/domain/templates";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { placeMedia, registerHostReader } from "../files/authorize";

/** Who writes each kind of document, and so may keep and use its templates. */
const AUTHOR = {
  lesson: "learning:author",
  assignment: "assignments:author",
  unit_plan: "learning:author",
} as const;

const hostOf = (id: string) => ({ type: "document_template", id });

/** A template of this school that the viewer may use, or nothing. */
async function usable(context: UnitContext, id: string) {
  const row = await templateById(context.tx, context.tenantId, id);
  return row && row.orgId === context.schoolId && can(context, AUTHOR[row.kind])
    ? row
    : null;
}

// Whoever may start from a template may open the pictures and files in it.
registerHostReader("document_template", async (context, id) =>
  Boolean(await usable(context, id)),
);

/** The school's templates of a kind, for those who write that kind. */
export const list = readProcedure
  .input(templateKindSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, AUTHOR[input.kind]);
    const rows = await templatesOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      kind: input.kind,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      ownerNameEn: row.ownerNameEn,
      ownerNameAr: row.ownerNameAr,
      mine: row.ownerUserId === context.actor.userId,
    }));
  });

/** A template's document, to start a new one from. */
export const open = readProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const document = await documentOf(
      context.tx,
      context.tenantId,
      hostOf(row.id),
    );
    if (!document) throw new ORPCError("NOT_FOUND");
    return { content: document.content as unknown as ContentDocument };
  });

/**
 * Keeps a document as a template for the school. Its pictures and files are
 * copied into the template, so it stays whole whatever becomes of the
 * document it came from.
 */
export const save = writeProcedure
  .input(saveTemplateSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, AUTHOR[input.kind]);
    const created = await insertTemplate(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ownerUserId: context.actor.userId,
      kind: input.kind,
      title: input.title,
    });
    const host = hostOf(created.id);
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(
        context,
        host,
        input.content,
        contentFileIds(input.content),
      )),
      plainText: contentPlainText(input.content),
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "template.create",
      objectType: "document_template",
      objectId: created.id,
      details: { kind: input.kind, title: input.title },
    });
    return created;
  });

/** Takes away a template its owner no longer wants the school to use. */
export const remove = writeProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.ownerUserId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", { message: "templates.not_owner" });
    await removeTemplate(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
    });
    await audit(context, {
      action: "template.remove",
      objectType: "document_template",
      objectId: row.id,
    });
    return { removed: true };
  });
