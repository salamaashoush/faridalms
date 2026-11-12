import type { TemplateRow } from "@faridalms/database/stores/templates";
import type { ContentDocument } from "@faridalms/domain/content";
import type { SavedSection } from "@faridalms/domain/saved-sections";

import { changeOf } from "@faridalms/database/audit";
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import { retireModule } from "@faridalms/database/stores/learning";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  insertTemplate,
  removeTemplate,
  reviewTemplate,
  templateById,
  templatesOf,
  updateTemplate,
} from "@faridalms/database/stores/templates";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { paged, pageWindow } from "@faridalms/domain/paging";
import {
  savedSectionFileIds,
  savedSectionPlainText,
} from "@faridalms/domain/saved-sections";
import {
  KEPT_BUILTIN_KINDS,
  browseTemplatesSchema,
  reviewTemplateSchema,
  saveSectionTemplateSchema,
  saveTemplateSchema,
  TEMPLATE_AUTHORS,
  TEMPLATE_KINDS,
  templateKindSchema,
  templateRefSchema,
  updateTemplateSchema,
} from "@faridalms/domain/templates";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { refuseIfHeld } from "../core/holds";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { templateHost, usableTemplate, writesKind } from "../core/templates";
import {
  placeMedia,
  registerHostReader,
  registerHostWriter,
} from "../files/authorize";

const listed = (context: UnitContext, row: TemplateRow) => ({
  id: row.id,
  version: row.version,
  builtinKey: row.builtinKey,
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

/** Its owner or a reviewer changes a piece; a built-in one, whoever writes its kind. */
const mayChange = (context: UnitContext, row: TemplateRow) =>
  row.ownerUserId
    ? row.ownerUserId === context.actor.userId ||
      can(context, "templates:review")
    : writesKind(context, row.kind);

// Whoever may start from a template may open the pictures and files in it.
registerHostReader("document_template", async (context, id) =>
  Boolean(await usableTemplate(context, id)),
);
registerHostWriter("document_template", async (context, id) => {
  const row = await usableTemplate(context, id);
  return row !== null && mayChange(context, row);
});

/** The school's templates of a kind, for those who write that kind. */
export const list = readProcedure
  .input(templateKindSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, ...TEMPLATE_AUTHORS[input.kind]);
    const { rows } = await templatesOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      viewerId: context.actor.userId,
      kinds: [input.kind],
    });
    return rows.map((row) => listed(context, row));
  });

/** The school's templates: what it shares of the kinds the viewer writes, and their own. */
export const browse = readProcedure
  .input(browseTemplatesSchema)
  .handler(async ({ input, context }) => {
    const kinds = TEMPLATE_KINDS.filter((kind) => writesKind(context, kind));
    if (kinds.length === 0) throw new ORPCError("FORBIDDEN");
    const { rows, total } = await templatesOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      viewerId: context.actor.userId,
      kinds: input.kind ? kinds.filter((kind) => kind === input.kind) : kinds,
      subjectId: input.subjectId,
      q: input.q,
      ...pageWindow(input.page),
    });
    return {
      ...paged(
        rows.map((row) => listed(context, row)),
        total,
        input.page,
      ),
      reviews: can(context, "templates:review"),
    };
  });

/** What teachers have offered as templates and waits for a reviewer. */
export const queue = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "templates:review");
  const { rows } = await templatesOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    viewerId: context.actor.userId,
    kinds: TEMPLATE_KINDS,
    pending: true,
  });
  return rows.map((row) => listed(context, row));
});

/** Shares a piece with the school, or sends it back to its owner with a note. */
export const review = writeProcedure
  .input(reviewTemplateSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "templates:review");
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
    // Its owner hears how it went, and finds the reviewer's note in Templates.
    const [reviewer] = await namesOf(context.tx, context.tenantId, [
      context.actor.userId,
    ]);
    await notify(context, row.ownerUserId ? [row.ownerUserId] : [], {
      kind: "library",
      subject: { type: "document_template", id: row.id },
      params: {
        title: row.title,
        shared: input.share,
        actorName: reviewer?.fullNameEn ?? reviewer?.fullNameAr ?? "",
        actorNameAr: reviewer?.fullNameAr ?? reviewer?.fullNameEn ?? "",
      },
    });
    return { state: input.share ? "shared" : "declined" };
  });

/** A template's document, to start a new one from. */
export const open = readProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usableTemplate(context, input.id);
    // A section is not a document; the builder opens it with openSection.
    if (!row || row.kind === "section") throw new ORPCError("NOT_FOUND");
    const document = await documentOf(
      context.tx,
      context.tenantId,
      templateHost(row.id),
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
    requireCapability(context, ...TEMPLATE_AUTHORS[input.kind]);
    // A reviewer's own piece needs no other reviewer.
    const state = can(context, "templates:review") ? "shared" : "pending";
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
    const host = templateHost(created.id);
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

/**
 * Keeps a website section, in both languages, in the school's templates, to
 * start new sections from on any page. Its pictures and files are copied
 * in, so it stays whole whatever becomes of the page it came from, and it
 * waits for a reviewer as any other piece does.
 */
export const saveSection = writeProcedure
  .input(saveSectionTemplateSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, ...TEMPLATE_AUTHORS.section);
    const state = can(context, "templates:review") ? "shared" : "pending";
    const created = await insertTemplate(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ownerUserId: context.actor.userId,
      kind: "section",
      title: input.title,
      description: input.description,
      subjectId: null,
      state,
    });
    const host = templateHost(created.id);
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "section",
      locale: input.section.locale,
      ...(await placeMedia(
        context,
        host,
        input.section,
        savedSectionFileIds(input.section),
      )),
      plainText: savedSectionPlainText(input.section),
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "template.create",
      objectType: "document_template",
      objectId: created.id,
      details: { kind: "section", title: input.title },
    });
    return { ...created, state };
  });

/** A section template in both its languages, to start a new section on a page from. */
export const openSection = readProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usableTemplate(context, input.id);
    if (row?.kind !== "section") throw new ORPCError("NOT_FOUND");
    const document = await documentOf(
      context.tx,
      context.tenantId,
      templateHost(row.id),
    );
    if (!document) throw new ORPCError("NOT_FOUND");
    return {
      title: row.title,
      section: document.content as unknown as SavedSection,
    };
  });

/**
 * Changes a template's words in place: its owner's or a reviewer's, or one
 * the school was given, which those who write its kind keep up to date.
 */
export const update = writeProcedure
  .input(updateTemplateSchema)
  .handler(async ({ input, context }) => {
    const row = await usableTemplate(context, input.id);
    if (!row || row.kind === "section") throw new ORPCError("NOT_FOUND");
    if (!mayChange(context, row))
      throw new ORPCError("FORBIDDEN", { message: "templates.not_owner" });
    await refuseIfHeld(context, templateHost(row.id));
    const version = await updateTemplate(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      title: input.title,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const host = templateHost(row.id);
    const before = await documentOf(context.tx, context.tenantId, host);
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
      locale: before?.locale ?? null,
    });
    await audit(context, {
      action: "template.update",
      objectType: "document_template",
      objectId: row.id,
      details: { kind: row.kind, title: input.title },
      change: changeOf("core.document_templates", row, { title: input.title }),
    });
    return { version };
  });

/** Takes away a template its owner, or a reviewer, no longer wants offered. */
export const remove = writeProcedure
  .input(templateRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usableTemplate(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.builtinKey && KEPT_BUILTIN_KINDS.includes(row.kind))
      throw new ORPCError("CONFLICT", { message: "templates.kept" });
    if (
      row.ownerUserId !== context.actor.userId &&
      !can(context, "templates:review")
    )
      throw new ORPCError("FORBIDDEN", { message: "templates.not_owner" });
    await removeTemplate(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
    });
    // A whole module's copy is the piece's alone, and goes with it.
    if (row.moduleId)
      await retireModule(context.tx, {
        tenantId: context.tenantId,
        id: row.moduleId,
      });
    await audit(context, {
      action: "template.remove",
      objectType: "document_template",
      objectId: row.id,
    });
    return { removed: true };
  });
