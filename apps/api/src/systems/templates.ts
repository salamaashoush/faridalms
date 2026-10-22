import type { TemplateRow } from "@faridalms/database/stores/templates";
import type { ContentDocument } from "@faridalms/domain/content";

import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import {
  insertTemplate,
  removeTemplate,
  reviewTemplate,
  templateById,
  templatesOf,
} from "@faridalms/database/stores/templates";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  librarySchema,
  reviewTemplateSchema,
  saveTemplateSchema,
  TEMPLATE_KINDS,
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

/**
 * A piece of this school's library the viewer may open: one it shares, the
 * viewer's own, or one waiting for a reviewer the viewer is.
 */
async function usable(context: UnitContext, id: string) {
  const row = await templateById(context.tx, context.tenantId, id);
  return row &&
    row.orgId === context.schoolId &&
    can(context, AUTHOR[row.kind]) &&
    (row.state === "shared" ||
      row.ownerUserId === context.actor.userId ||
      can(context, "library:review"))
    ? row
    : null;
}

const listed = (context: UnitContext, row: TemplateRow) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  description: row.description,
  subjectId: row.subjectId,
  state: row.state,
  reviewNote: row.ownerUserId === context.actor.userId ? row.reviewNote : null,
  ownerNameEn: row.ownerNameEn,
  ownerNameAr: row.ownerNameAr,
  updatedAt: row.updatedAt,
  mine: row.ownerUserId === context.actor.userId,
});

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
      viewerId: context.actor.userId,
      kind: input.kind,
    });
    return rows.map((row) => listed(context, row));
  });

/** The school library: what it shares of the kinds the viewer writes, and their own. */
export const library = readProcedure
  .input(librarySchema)
  .handler(async ({ input, context }) => {
    const kinds = TEMPLATE_KINDS.filter((kind) => can(context, AUTHOR[kind]));
    if (kinds.length === 0) throw new ORPCError("FORBIDDEN");
    const rows = await templatesOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      viewerId: context.actor.userId,
      kind: input.kind || null,
      subjectId: input.subjectId,
      q: input.q,
    });
    return {
      rows: rows
        .filter((row) => kinds.includes(row.kind))
        .map((row) => listed(context, row)),
      reviews: can(context, "library:review"),
    };
  });

/** What teachers have offered the library and waits for a reviewer. */
export const queue = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "library:review");
  const rows = await templatesOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    viewerId: context.actor.userId,
    kind: null,
    pending: true,
  });
  return rows.map((row) => listed(context, row));
});

/** Shares a piece with the school, or sends it back to its owner with a note. */
export const review = writeProcedure
  .input(reviewTemplateSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "library:review");
    const row = await templateById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const done = await reviewTemplate(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      state: input.share ? "shared" : "declined",
      note: input.note || null,
      reviewerId: context.actor.userId,
    });
    if (!done)
      throw new ORPCError("CONFLICT", { message: "templates.reviewed" });
    await audit(context, {
      action: input.share ? "template.share" : "template.decline",
      objectType: "document_template",
      objectId: row.id,
      details: { title: row.title },
    });
    return { state: input.share ? "shared" : "declined" };
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
    return {
      kind: row.kind,
      title: row.title,
      content: document.content as unknown as ContentDocument,
    };
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
    // A reviewer's own piece needs no other reviewer.
    const state = can(context, "library:review") ? "shared" : "pending";
    const created = await insertTemplate(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ownerUserId: context.actor.userId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      subjectId: input.subjectId || null,
      state,
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
    return { ...created, state };
  });

/** Takes away a library piece its owner, or a reviewer, no longer wants offered. */
export const remove = writeProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (
      row.ownerUserId !== context.actor.userId &&
      !can(context, "library:review")
    )
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
