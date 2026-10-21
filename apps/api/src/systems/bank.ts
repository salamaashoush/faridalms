import type { ContentDocument } from "@faridalms/domain/content";

import {
  bankQuestionById,
  bankQuestionsOf,
  bankTagCounts,
  bankTagsOf,
  insertBankQuestion,
  removeBankQuestion,
  updateBankQuestion,
} from "@faridalms/database/stores/bank";
import { teachesClass } from "@faridalms/database/stores/classes";
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import { questionAskedOf } from "@faridalms/database/stores/quizzes";
import {
  bankQuerySchema,
  bankQuestionOf,
  bankRefSchema,
  saveBankQuestionSchema,
} from "@faridalms/domain/bank";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { scopeOf } from "../core/coursework-access";
import { audit, can, readProcedure, writeProcedure } from "../core/procedure";
import { placeMedia, registerHostReader } from "../files/authorize";

const hostOf = (id: string) => ({ type: "bank_question", id });

/** Whoever writes lessons or assignments may keep and ask the school's questions. */
function requireAuthor(context: UnitContext) {
  if (!can(context, "learning:author") && !can(context, "assignments:author"))
    throw new ORPCError("FORBIDDEN");
}

/** A question in the viewer's bank or the school's, or nothing. */
async function usable(context: UnitContext, id: string) {
  const row = await bankQuestionById(context.tx, context.tenantId, id);
  return row &&
    row.orgId === context.schoolId &&
    (row.scope === "school" || row.ownerUserId === context.actor.userId) &&
    (can(context, "learning:author") || can(context, "assignments:author"))
    ? row
    : null;
}

/** Whether a quiz asked the viewer the question, or one in a class they teach. */
async function askedOrTaught(context: UnitContext, id: string) {
  const asked = await questionAskedOf(context.tx, {
    tenantId: context.tenantId,
    bankQuestionId: id,
    orgId: context.schoolId,
  });
  if (asked.some((row) => row.studentId === context.actor.userId)) return true;
  if (!can(context, "submissions:grade")) return false;
  const classes = [...new Set(asked.map((row) => row.classId))];
  const taught = await Promise.all(
    classes.map((classId) =>
      teachesClass(context.tx, scopeOf(context), classId),
    ),
  );
  return taught.some(Boolean);
}

// Whoever may ask a question may open the pictures and recordings in it, as
// may a student a quiz drew it for and the teachers who mark that quiz.
registerHostReader(
  "bank_question",
  async (context, id) =>
    Boolean(await usable(context, id)) || askedOrTaught(context, id),
);

/** The questions the viewer may ask, with every tag among them. */
export const list = readProcedure
  .input(bankQuerySchema)
  .handler(async ({ input, context }) => {
    requireAuthor(context);
    const scope = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userId: context.actor.userId,
    };
    const [rows, tags] = await Promise.all([
      bankQuestionsOf(context.tx, { ...scope, ...input }),
      bankTagsOf(context.tx, scope),
    ]);
    return {
      tags,
      questions: rows.map((row) => ({
        id: row.id,
        version: row.version,
        kind: row.kind,
        title: row.title,
        tags: row.tags,
        scope: row.scope,
        ownerNameEn: row.ownerNameEn,
        ownerNameAr: row.ownerNameAr,
        mine: row.ownerUserId === context.actor.userId,
        updatedAt: row.updatedAt,
      })),
    };
  });

/** Every tag the viewer's quizzes may draw by, with how many questions carry it. */
export const tags = readProcedure.handler(async ({ context }) => {
  requireAuthor(context);
  return bankTagCounts(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    authorUserId: context.actor.userId,
  });
});

/** A kept question's document, to ask it in another. */
export const open = readProcedure
  .input(bankRefSchema)
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
 * Keeps a question in the viewer's bank or the school's, or changes one they
 * keep. Its pictures and recordings are copied in, so it stays whole
 * whatever becomes of the document it came from.
 */
export const save = writeProcedure
  .input(saveBankQuestionSchema)
  .handler(async ({ input, context }) => {
    requireAuthor(context);
    const question = bankQuestionOf(input.content);
    const [prompt] = question?.children ?? [];
    const title = prompt
      ? contentPlainText({ root: { ...prompt, type: "root" } })
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(0, 300)
      : "";
    if (!question?.kind || !title)
      throw new ORPCError("BAD_REQUEST", { message: "bank.prompt_needed" });
    const fields = {
      tenantId: context.tenantId,
      scope: input.scope,
      kind: question.kind,
      title,
      tags: input.tags,
    };
    let saved: { id: string; version: number };
    if (input.id) {
      const row = await usable(context, input.id);
      if (!row) throw new ORPCError("NOT_FOUND");
      if (row.ownerUserId !== context.actor.userId)
        throw new ORPCError("FORBIDDEN", { message: "bank.not_owner" });
      const version = await updateBankQuestion(context.tx, {
        ...fields,
        id: row.id,
        expectedVersion: input.expectedVersion,
      });
      if (version === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      saved = { id: row.id, version };
    } else
      saved = await insertBankQuestion(context.tx, {
        ...fields,
        orgId: context.schoolId,
        ownerUserId: context.actor.userId,
      });
    const host = hostOf(saved.id);
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
      action: input.id ? "bank_question.update" : "bank_question.create",
      objectType: "bank_question",
      objectId: saved.id,
      details: { kind: question.kind, scope: input.scope },
    });
    return saved;
  });

/** Takes a question out of the bank; only the teacher who kept it may. */
export const remove = writeProcedure
  .input(bankRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.ownerUserId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", { message: "bank.not_owner" });
    await removeBankQuestion(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
    });
    await audit(context, {
      action: "bank_question.remove",
      objectType: "bank_question",
      objectId: row.id,
    });
    return { removed: true };
  });
