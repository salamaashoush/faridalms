import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import {
  getPersonProfile,
  personReachable,
} from "@faridalms/database/repositories/people";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { visibleClassIds, visibleStudentIds } from "../authorization";
import { protectedProcedure } from "../procedure";

/**
 * A person's school profile. Reachability comes from relationships rather than
 * a capability: a class you belong to, a student you are related to, or a
 * conversation you took part in. Contact details need a capability on top.
 */
export const getPerson = protectedProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    const user = context.user;
    const scope = {
      viewerId: user.id,
      school: user.role === "admin",
      classIds: await visibleClassIds(context, user),
      studentIds: await visibleStudentIds(context, user),
    };
    if (!(await personReachable(context.db, input.id, scope)))
      throw new ORPCError("NOT_FOUND");
    const target = await context.db.query.users.findFirst({
      where: { id: input.id },
      columns: { role: true },
    });
    if (!target) throw new ORPCError("NOT_FOUND");
    const contact =
      input.id === user.id ||
      user.permissions.includes("users:read") ||
      target.role === "admin" ||
      target.role === "teacher" ||
      user.permissions.includes("student-contacts:read");
    const year = await currentSchoolYear(context.db);
    const profile = await getPersonProfile(context.db, input.id, scope, {
      contact,
      schoolYearId: year.id,
      today: context.today,
    });
    if (!profile) throw new ORPCError("NOT_FOUND");
    return {
      profile,
      access: {
        contact,
        manage: user.permissions.includes("users:manage"),
        self: input.id === user.id,
      },
    };
  });
