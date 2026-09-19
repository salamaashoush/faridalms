import { ManagementError } from "@faridalms/database/repositories/management";
import {
  applyRollover as applyRolloverRows,
  rolloverPreview,
  saveRolloverPlan,
} from "@faridalms/database/repositories/rollover";
import {
  applyRolloverSchema,
  rolloverQuerySchema,
  saveRolloverSchema,
} from "@faridalms/domain/rollover";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

async function managed<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

export const getRollover = protectedProcedure
  .input(rolloverQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    return managed(() => rolloverPreview(context.db, input));
  });

export const saveRollover = protectedProcedure
  .input(saveRolloverSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    return managed(() => saveRolloverPlan(context.db, input));
  });

export const applyRollover = protectedProcedure
  .input(applyRolloverSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "school:manage");
    return managed(() => applyRolloverRows(context.db, input, user.id));
  });
