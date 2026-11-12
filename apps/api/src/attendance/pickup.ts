import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** Someone the front desk may hand a learner to, or must not. */
export interface PickupContact {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationEn: string | null;
  relationAr: string | null;
  pickup: "allowed" | "not_allowed" | "ask_office" | null;
  phone: string | null;
}

/** A module that knows who may collect a learner on a day. */
export interface PickupContacts {
  contactsOf(
    context: UnitContext,
    input: { studentId: string; day: string },
  ): Promise<PickupContact[]>;
}

export const pickupContacts = point<PickupContacts>("pickup contacts");

/** Who may collect the learner on the day, and who must not; none without a module that knows. */
export async function pickupContactsOf(
  context: UnitContext,
  input: { studentId: string; day: string },
): Promise<PickupContact[]> {
  const found = await Promise.all(
    (await contributionsTo(context, pickupContacts)).map((contribution) =>
      contribution.contactsOf(context, input),
    ),
  );
  return found.flat();
}
