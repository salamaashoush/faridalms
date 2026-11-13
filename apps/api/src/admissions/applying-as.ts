import { openApplicantRole } from "@faridalms/database/stores/admissions";
import { applyAsSchema } from "@faridalms/domain/admissions";
import {
  APPLICANT_ROLE,
  SELF_APPLICANT_ROLE,
} from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";

import { contributionsTo } from "../core/extension";
import {
  audit,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import { filingForOthers, filingModule } from "./points";

type SchoolProcedureContext = Parameters<
  Parameters<typeof schoolProcedure.handler>[0]
>[0]["context"];

/**
 * Whether the school takes applications filed for someone else, before
 * anyone signs in: only where a module lets someone apply for another
 * person.
 */
export async function takesOthers(context: SchoolProcedureContext) {
  const { school } = context;
  return context.cell.withTenant(
    {
      tenantId: school.tenantId,
      requestId: context.requestId,
      actor: { kind: "user" },
    },
    "read",
    async (tx) =>
      (
        await contributionsTo(
          {
            tx,
            tenantId: school.tenantId,
            schoolId: school.schoolId,
            school,
            extensions: context.extensions,
          },
          filingForOthers,
        )
      ).length > 0,
  );
}

/** Who the portal's registration lets someone apply for. */
export const registration = schoolProcedure.handler(async ({ context }) => ({
  forOthers: await takesOthers(context),
}));

/**
 * Someone applying chooses whom the next application is for: themself, in
 * their own context, or someone in their care, in the family context only a
 * school that lets people apply for others opens. They take the applying
 * role of that context, as registering for it would have given them, and
 * are told which context to continue in.
 */
export const applyAs = writeProcedure
  .input(applyAsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "applications:submit");
    if (
      context.actor.context !== "family" &&
      context.actor.context !== "student"
    )
      throw new ORPCError("FORBIDDEN");
    const forOthers = input.applyingFor === "other";
    if (forOthers && !(await filingModule(context)))
      throw new ORPCError("BAD_REQUEST", { message: "application.self_only" });
    const role = forOthers ? APPLICANT_ROLE : SELF_APPLICANT_ROLE;
    if (
      await openApplicantRole(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        userId: context.actor.userId,
        today: context.today,
        role,
      })
    )
      await audit(context, {
        action: "user_role.create",
        objectType: "user_role",
        subjectUserId: context.actor.userId,
        details: { role, source: "applying" },
      });
    return { context: forOthers ? ("family" as const) : ("student" as const) };
  });
