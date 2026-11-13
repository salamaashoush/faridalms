import { changeOf } from "@faridalms/database/audit";
import { schoolStorage } from "@faridalms/database/stores/files";
import {
  schoolFeatures,
  schoolSwitch,
  viewer,
} from "@faridalms/database/stores/identity";
import { contactsOf } from "@faridalms/database/stores/persons";
import {
  schoolSettings,
  setOrgFeature,
  updateSchool,
} from "@faridalms/database/stores/school";
import { askAboutModuleSchema } from "@faridalms/domain/modules";
import { saveSchoolSchema, setFeatureSchema } from "@faridalms/domain/people";
import {
  COMMONS_SWITCH,
  commonsSwitchSchema,
} from "@faridalms/domain/pictures";
import { availableModules, limitsOf } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";

import { sendLead, stableIntakeId } from "../core/intake";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { looksToSave, publishLooks, unsetColour } from "../core/school-looks";
import { coreReader } from "../files/authorize";

// The school's logo prints on its paper, so whoever belongs to it may see it;
// strangers see its public copy on the website and the sign-in pages.
coreReader("org", (context, hostId) =>
  Promise.resolve(hostId === context.schoolId),
);

export const profile = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const settings = await schoolSettings(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  if (!settings) throw new ORPCError("NOT_FOUND");
  return { ...settings, unsetColour: await unsetColour(context) };
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
    const looks = await looksToSave(context, before, input);
    const saved = await updateSchool(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      ...input,
      ...looks,
      weekendDays: [...input.weekendDays].toSorted((a, b) => a - b),
      secondaryCalendar: input.secondaryCalendar || null,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await publishLooks(context, before, looks);
    await audit(context, {
      action: "school.update",
      objectType: "org",
      objectId: context.schoolId,
      change: { table: "core.orgs", before, after: input },
    });
    return saved;
  });

/**
 * The school's switches, which modules its plan lets it switch on, and
 * whether its administrators can ask about one it does not have.
 */
export const features = readProcedure.handler(async ({ context }) => ({
  switches: await schoolFeatures(
    context.tx,
    context.tenantId,
    context.schoolId,
  ),
  available: availableModules(context.school.entitlements),
  canAsk: Boolean(context.intake),
}));

/**
 * An administrator asks about a module the school's plan does not have:
 * the operator console gets a lead naming the school, the module and them.
 * Asked again the same day, it is the same lead.
 */
export const askAboutModule = readProcedure
  .input(askAboutModuleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    if (!context.intake)
      throw new ORPCError("FORBIDDEN", { message: "intake.unavailable" });
    if (availableModules(context.school.entitlements).includes(input.module))
      throw new ORPCError("CONFLICT", { message: "module.in_plan" });
    const [person, contacts] = await Promise.all([
      viewer(context.tx, context.actor.userId),
      contactsOf(context.tx, context.tenantId, context.actor.userId),
    ]);
    const email = contacts.find((contact) => contact.kind === "email");
    const phone = contacts.find((contact) => contact.kind === "phone");
    const sent = await sendLead(context.intake, {
      intakeId: stableIntakeId([
        "module_interest",
        context.schoolId,
        input.module,
        context.today,
      ]),
      source: "module_interest",
      name:
        person?.fullNameEn ??
        person?.fullNameAr ??
        person?.username ??
        "Unnamed",
      email: email?.normalized ?? email?.value ?? null,
      phone: phone?.value ?? null,
      organisation:
        context.school.nameEn ?? context.school.nameAr ?? context.school.slug,
      role: "leader",
      size: null,
      country: null,
      locale: person?.preferredLocale === "ar" ? "ar" : "en",
      message: null,
      schoolId: context.schoolId,
      tenantId: context.tenantId,
      module: input.module,
    });
    if (!sent)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "intake.not_sent",
      });
    return { asked: input.module };
  });

export const setFeature = writeProcedure
  .input(setFeatureSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    if (
      input.enabled &&
      !availableModules(context.school.entitlements).some(
        (module) => module === input.feature,
      )
    )
      throw new ORPCError("FORBIDDEN", { message: "feature.not_in_plan" });
    if (input.enabled && context.school.entitlements.access === "restricted")
      throw new ORPCError("FORBIDDEN", { message: "school.restricted" });
    const before = await schoolFeatures(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
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
      change: changeOf(
        "core.org_features",
        { enabled: before[input.feature] },
        { enabled: input.enabled },
      ),
    });
    return {
      switches: await schoolFeatures(
        context.tx,
        context.tenantId,
        context.schoolId,
      ),
      available: availableModules(context.school.entitlements),
      canAsk: Boolean(context.intake),
    };
  });

/** Where the school's staff may look for pictures beyond the sets the product carries. */
export const pictureSources = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  return {
    commons: await schoolSwitch(
      context.tx,
      context.tenantId,
      context.schoolId,
      COMMONS_SWITCH,
    ),
  };
});

/**
 * Lets the school's staff search Wikimedia Commons for pictures, or stops
 * them. Pictures already kept stay, with their credit.
 */
export const setCommonsPictures = writeProcedure
  .input(commonsSwitchSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const before = await schoolSwitch(
      context.tx,
      context.tenantId,
      context.schoolId,
      COMMONS_SWITCH,
    );
    await setOrgFeature(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      feature: COMMONS_SWITCH,
      enabled: input.enabled,
    });
    await audit(context, {
      action: "feature.set",
      objectType: "org",
      objectId: context.schoolId,
      details: { feature: COMMONS_SWITCH, enabled: input.enabled },
      change: changeOf(
        "core.org_features",
        { enabled: before },
        { enabled: input.enabled },
      ),
    });
    return { commons: input.enabled };
  });

/** How much of the school's storage pool is used, for its administrators. */
export const storage = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const used = await schoolStorage(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return {
    ...used,
    limitBytes: limitsOf(context.school.entitlements).poolBytes,
  };
});
