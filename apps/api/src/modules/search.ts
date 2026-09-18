import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import { searchSchool } from "@faridalms/database/repositories/search";
import { searchQuerySchema } from "@faridalms/domain/search";

import { visibleClassIds, visibleStudentIds } from "../authorization";
import { protectedProcedure } from "../procedure";

export const search = protectedProcedure
  .input(searchQuerySchema)
  .handler(async ({ input, context }) => {
    const user = context.user;
    const [studentIds, classIds, year] = await Promise.all([
      visibleStudentIds(context, user),
      visibleClassIds(context, user),
      currentSchoolYear(context.db),
    ]);
    return searchSchool(
      context.db,
      {
        viewerId: user.id,
        role: user.role,
        permissions: user.permissions,
        studentIds,
        classIds,
        schoolYearId: year.id,
        today: context.today,
      },
      input,
    );
  });
