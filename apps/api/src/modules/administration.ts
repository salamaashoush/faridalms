import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import { managementOptions } from "@faridalms/database/repositories/management";
import { managementOptionsSchema } from "@faridalms/domain/administration-schema";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

// Class, parent and student pickers serve editors gated on users:manage, so
// that permission is enough to list those choices.
const STUDENT_CHOICES = new Set(["classes", "parents", "students"]);

export const getManagementOptions = protectedProcedure
  .input(managementOptionsSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(
      context,
      STUDENT_CHOICES.has(input.kind) &&
        !context.user.permissions.includes("school:manage")
        ? "users:manage"
        : "school:manage",
    );
    const year = await currentSchoolYear(context.db);
    return managementOptions(
      context.db,
      input.kind,
      input.q,
      year.id,
      input.selectedIds,
      input.studentId,
    );
  });
