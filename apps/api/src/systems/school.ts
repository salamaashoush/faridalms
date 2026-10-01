import { schoolStorage } from "@faridalms/database/stores/files";
import { schoolFeatures } from "@faridalms/database/stores/identity";
import {
  schoolSettings,
  setOrgFeature,
  updateSchool,
} from "@faridalms/database/stores/school";
import { saveSchoolSchema, setFeatureSchema } from "@faridalms/domain/people";
import { availableModules, limitsOf } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

export const profile = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const settings = await schoolSettings(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  if (!settings) throw new ORPCError("NOT_FOUND");
  return settings;
});

export const saveProfile = writeProcedure
  .input(saveSchoolSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    if (!input.nameEn && !input.nameAr)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.name_required",
      });
    if (!Intl.supportedValuesOf("timeZone").includes(input.timeZone))
      throw new ORPCError("BAD_REQUEST", { message: "validation.time_zone" });
    if (input.weekendDays.includes(input.weekStart))
      throw new ORPCError("BAD_REQUEST", {
        message: "school.week_start_weekend",
      });
    const before = await schoolSettings(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const saved = await updateSchool(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      ...input,
      weekendDays: [...input.weekendDays].toSorted((a, b) => a - b),
      secondaryCalendar: input.secondaryCalendar || null,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "school.update",
      objectType: "org",
      objectId: context.schoolId,
      change: { table: "core.orgs", before, after: input },
    });
    return saved;
  });

/** The school's switches, and which modules its plan lets it switch on. */
export const features = readProcedure.handler(async ({ context }) => ({
  switches: await schoolFeatures(
    context.tx,
    context.tenantId,
    context.schoolId,
  ),
  available: availableModules(context.school.plan),
}));

export const setFeature = writeProcedure
  .input(setFeatureSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    if (
      input.enabled &&
      !availableModules(context.school.plan).some(
        (module) => module === input.feature,
      )
    )
      throw new ORPCError("FORBIDDEN", { message: "feature.not_in_plan" });
    await setOrgFeature(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      feature: input.feature,
      enabled: input.enabled,
    });
    await audit(context, {
      action: "feature.set",
      objectType: "org",
      objectId: context.schoolId,
      details: { feature: input.feature, enabled: input.enabled },
    });
    return {
      switches: await schoolFeatures(
        context.tx,
        context.tenantId,
        context.schoolId,
      ),
      available: availableModules(context.school.plan),
    };
  });

/** How much of the school's storage pool is used, for its administrators. */
export const storage = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const used = await schoolStorage(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return { ...used, limitBytes: limitsOf(context.school.plan).poolBytes };
});
