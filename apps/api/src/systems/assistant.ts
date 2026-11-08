import { changeOf } from "@faridalms/database/audit";
import {
  assistantSettingsOf,
  requestsOn,
  saveAssistantSettings,
} from "@faridalms/database/stores/assistant";
import {
  ASSISTANT_PROVIDERS,
  assistantSettingsSchema,
  DEFAULT_DAILY_LIMIT,
} from "@faridalms/domain/assistant";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

/** The providers this deployment holds a key for, in the order schools are offered them. */
const offered = (context: UnitContext) =>
  ASSISTANT_PROVIDERS.filter((id) => context.assistant?.providers[id]);

const scopeOf = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

/**
 * The school's language model settings as its administrators see them:
 * whether teachers may use it, the provider chosen among those the
 * deployment offers, the daily limit and how much of today's is used. A
 * provider's key is the deployment's and never shown.
 */
export const settings = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const scope = scopeOf(context);
  const row = await assistantSettingsOf(context.tx, scope);
  return {
    settings: row && {
      version: row.version,
      enabled: row.enabled,
      provider: row.provider,
      dailyLimit: row.dailyLimit,
    },
    providers: offered(context),
    ceiling: context.assistant?.dailyCeiling ?? DEFAULT_DAILY_LIMIT,
    usedToday: await requestsOn(context.tx, { ...scope, day: context.today }),
  };
});

/** Turns the school's language model on or off, or changes its provider or limit. */
export const saveSettings = writeProcedure
  .input(assistantSettingsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    if (input.enabled && !offered(context).includes(input.provider))
      throw new ORPCError("BAD_REQUEST", { message: "assistant.unavailable" });
    if (input.dailyLimit > (context.assistant?.dailyCeiling ?? Infinity))
      throw new ORPCError("BAD_REQUEST", { message: "assistant.over_ceiling" });
    const scope = scopeOf(context);
    const before = await assistantSettingsOf(context.tx, scope);
    const saved = await saveAssistantSettings(context.tx, {
      ...scope,
      expectedVersion: input.expectedVersion,
      enabled: input.enabled,
      provider: input.provider,
      dailyLimit: input.dailyLimit,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "assistant.settings",
      objectType: "org",
      objectId: context.schoolId,
      details: {
        enabled: input.enabled,
        provider: input.provider,
        dailyLimit: input.dailyLimit,
      },
      change: changeOf(
        "core.assistant_settings",
        before && {
          enabled: before.enabled,
          provider: before.provider,
          dailyLimit: before.dailyLimit,
        },
        {
          enabled: input.enabled,
          provider: input.provider,
          dailyLimit: input.dailyLimit,
        },
      ),
    });
    return { version: saved.version };
  });

/**
 * Whether the person writing may ask the model for help here, by which
 * provider, and how many requests the school has left today. Only staff
 * are ever offered it.
 */
export const status = readProcedure.handler(async ({ context }) => {
  const scope = scopeOf(context);
  const row =
    context.actor.workspace === "staff"
      ? await assistantSettingsOf(context.tx, scope)
      : null;
  const usable =
    row?.enabled === true &&
    Boolean(context.assistant?.providers[row.provider]);
  if (!row || !usable) return { provider: null, remaining: 0 };
  const limit = Math.min(
    row.dailyLimit,
    context.assistant?.dailyCeiling ?? row.dailyLimit,
  );
  const used = await requestsOn(context.tx, { ...scope, day: context.today });
  return { provider: row.provider, remaining: Math.max(0, limit - used) };
});
