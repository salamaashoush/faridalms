import { ManagementError } from "@faridalms/database/repositories/management";
import {
  getNewsletterDraft as getDraft,
  getNewsletterEdition,
  listNewsletterDrafts,
  getNewsletterEditorContext as getEditorContext,
  publishNewsletterDraft as publishDraft,
  saveNewsletterDraft as saveDraft,
} from "@faridalms/database/repositories/newsletter-drafts";
import { saveNewsletterDraftSchema } from "@faridalms/domain/newsletter";
import { publishNewsletterDraftSchema } from "@faridalms/domain/notification";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getNewsletterEditorContext = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "announcements:manage");
    return getEditorContext(context.db);
  },
);

export const getNewsletterDraft = protectedProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ context, input }) => {
    await requirePermission(context, "announcements:manage");
    const draft = await getDraft(context.db, input.id);
    if (!draft) throw new ORPCError("NOT_FOUND");
    return draft;
  });

export const getNewsletterDrafts = protectedProcedure
  .input(
    v.object({
      schoolYearId: v.pipe(v.string(), v.uuid()),
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    }),
  )
  .handler(async ({ context, input }) => {
    await requirePermission(context, "announcements:manage");
    return listNewsletterDrafts(context.db, input.schoolYearId, input.page);
  });

export const saveNewsletterDraft = protectedProcedure
  .input(saveNewsletterDraftSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "announcements:manage");
    try {
      return await saveDraft(context.db, context.user.id, input);
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });

export const publishNewsletterDraft = protectedProcedure
  .input(publishNewsletterDraftSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "announcements:manage");
    try {
      return await publishDraft(context.db, input, {
        id: user.id,
        name: user.name,
      });
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });

/** A published edition, readable by everyone who may read newsletters. */
export const getNewsletter = protectedProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ context, input }) => {
    await requirePermission(context, "newsletters:read");
    const edition = await getNewsletterEdition(context.db, input.id);
    if (!edition) throw new ORPCError("NOT_FOUND");
    return edition;
  });
