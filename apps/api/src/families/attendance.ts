import { pickupContacts as linkedContacts } from "@faridalms/database/stores/families";

import type { ModuleContributions } from "../core/extension";

import { pickupContacts } from "../attendance/pickup";
import { contribute } from "../core/extension";

/** The front desk's list of who may collect a learner: their guardians, and whether each may. */
export const FAMILIES_AT_THE_FRONT_DESK: ModuleContributions = {
  module: "families",
  needs: ["attendance"],
  contributions: [
    contribute(pickupContacts, {
      contactsOf: (context, input) =>
        linkedContacts(context.tx, {
          tenantId: context.tenantId,
          studentId: input.studentId,
          day: input.day,
        }),
    }),
  ],
};
