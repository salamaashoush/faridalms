import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import {
  deleteAnnouncement as deleteRow,
  getAnnouncement as getRow,
  listAnnouncements,
  publishAnnouncement as publishRow,
  saveAnnouncement as saveRow,
} from "@faridalms/database/repositories/announcements";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  announcementRevisionSchema,
  saveAnnouncementSchema,
} from "@faridalms/domain/notification";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { SchoolContext } from "../context";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

function viewer(context: SchoolContext) {
  return {
    role: context.user.role,
    manage: context.user.permissions.includes("announcements:manage"),
  };
}

async function manage<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

export const getAnnouncements = protectedProcedure
  .input(
    v.object({
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    }),
  )
  .handler(async ({ input, context }) => {
    await requirePermission(context, "newsletters:read");
    return {
      ...(await listAnnouncements(context.db, viewer(context), input.page)),
      canManage: viewer(context).manage,
    };
  });

export const getAnnouncement = protectedProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "newsletters:read");
    const row = await getRow(context.db, input.id, viewer(context));
    if (!row) throw new ORPCError("NOT_FOUND");
    return { ...row, canManage: viewer(context).manage };
  });

export const saveAnnouncement = protectedProcedure
  .input(saveAnnouncementSchema)
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "announcements:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() => saveRow(context.db, input, user.id, year.id));
  });

export const publishAnnouncement = protectedProcedure
  .input(announcementRevisionSchema)
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "announcements:manage");
    return manage(() =>
      publishRow(context.db, input.id, input.expectedRevision, {
        id: user.id,
        name: user.name,
      }),
    );
  });

export const deleteAnnouncement = protectedProcedure
  .input(announcementRevisionSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "announcements:manage");
    await manage(() => deleteRow(context.db, input.id, input.expectedRevision));
    return { deleted: true as const };
  });
