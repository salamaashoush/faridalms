import { eventsAbout } from "@faridalms/database/business/events";
import {
  addTaxRate,
  listTaxRates,
  profile,
  saveProfile,
} from "@faridalms/database/business/profile";
import {
  businessProfileSchema,
  taxRateSchema,
} from "@faridalms/domain/business";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { formatCountry } from "../format";
import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { operatorNames } from "./operators";

/**
 * The business's legal details and VAT rates, as quotes and invoices print
 * them, and every change made to either.
 */
export const getSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("settings");
    const db = requireBusiness();
    const [held, rates, events, names] = await Promise.all([
      profile(db),
      listTaxRates(db),
      eventsAbout(db, ["business", "tax_rate"]),
      operatorNames(db),
    ]);
    return { profile: held, rates, events, names };
  },
);

const profileInput = v.object({
  ...businessProfileSchema.entries,
  expectedVersion: v.nullable(v.number()),
});

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof profileInput>) =>
    v.parse(profileInput, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("settings");
      return (await saveProfile(requireBusiness(), {
        ...data,
        by: operator.id,
      }))
        ? { ok: true }
        : {
            ok: false,
            message:
              "Someone changed the details since you opened them. Reload to see their change.",
          };
    },
  );

export const addRate = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof taxRateSchema>) =>
    v.parse(taxRateSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true } | { ok: false; message: string; field: "validFrom" }
    > => {
      const { operator } = await requireArea("settings");
      return (await addTaxRate(requireBusiness(), { ...data, by: operator.id }))
        ? { ok: true }
        : {
            ok: false,
            field: "validFrom",
            message: `${formatCountry(data.country)} already has a rate from that day.`,
          };
    },
  );
