import {
  deliveryLog,
  markRead as markNotificationsRead,
  notificationsOf,
  unreadCount,
} from "@faridalms/database/stores/notifications";
import {
  localeOf,
  preferenceOf,
  savePreference,
  setLocale,
} from "@faridalms/database/stores/preferences";
import {
  deliveryLogSchema,
  listNotificationsSchema,
  markReadSchema,
  preferencesOf,
  savePreferencesSchema,
} from "@faridalms/domain/notifications";
import { paged, pageWindow } from "@faridalms/domain/paging";

import { channelsOf } from "../core/notify";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const PAGE = 30;

const mine = (context: {
  tenantId: string;
  schoolId: string;
  actor: { userId: string };
}) => ({
  tenantId: context.tenantId,
  userId: context.actor.userId,
  orgId: context.schoolId,
});

export const list = readProcedure
  .input(listNotificationsSchema)
  .handler(async ({ input, context }) => {
    const [page, counts] = await Promise.all([
      notificationsOf(context.tx, {
        ...mine(context),
        tab: input.tab,
        ...pageWindow(input.page, PAGE),
      }),
      unreadCount(context.tx, mine(context)),
    ]);
    return {
      ...page,
      ...counts,
      ...paged(page.rows, page.total, input.page, PAGE),
    };
  });

/** What the bell shows: the latest few and how many are unread. */
export const recent = readProcedure.handler(async ({ context }) => {
  const [page, counts] = await Promise.all([
    notificationsOf(context.tx, {
      ...mine(context),
      tab: "all",
      limit: 8,
      offset: 0,
    }),
    unreadCount(context.tx, mine(context)),
  ]);
  return { rows: page.rows, ...counts };
});

export const markRead = writeProcedure
  .input(markReadSchema)
  .handler(async ({ input, context }) => {
    await markNotificationsRead(context.tx, {
      ...mine(context),
      ids: input.ids,
    });
    return unreadCount(context.tx, mine(context));
  });

export const preferences = readProcedure.handler(async ({ context }) => {
  const [value, locale] = await Promise.all([
    preferenceOf(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: "notifications",
    }),
    localeOf(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
    }),
  ]);
  return {
    preferences: preferencesOf(value),
    locale: locale ?? "en",
    channels: context.channels,
    /** Whether the school sends texts at all; without them nothing offers one. */
    texts: (await channelsOf(context)).includes("sms"),
  };
});

export const savePreferences = writeProcedure
  .input(savePreferencesSchema)
  .handler(async ({ input, context }) => {
    await savePreference(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: "notifications",
      value: input.preferences,
    });
    await setLocale(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      locale: input.locale,
    });
    await audit(context, {
      action: "notifications.preferences",
      objectType: "user",
      objectId: context.actor.userId,
    });
    return { saved: true };
  });

/** Every attempt to reach someone by email or text, for the school's office. */
export const deliveries = readProcedure
  .input(deliveryLogSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    // Texts are a channel only where a module on adds them.
    const sms = (await channelsOf(context)).includes("sms");
    const result = await deliveryLog(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      state: input.state,
      channel: sms ? input.channel : "email",
      q: input.q,
      ...pageWindow(input.page, PAGE),
    });
    return {
      ...result,
      ...paged(result.rows, result.total, input.page, PAGE),
      sms,
    };
  });
