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

import { requireArea } from "./access";
import { requireBusiness } from "./business";

/** The business's legal details and VAT rates, as quotes and invoices print them. */
export const getSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("settings");
    const db = requireBusiness();
    const [held, rates] = await Promise.all([profile(db), listTaxRates(db)]);
    return { profile: held, rates };
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
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("settings");
      return (await addTaxRate(requireBusiness(), { ...data, by: operator.id }))
        ? { ok: true }
        : {
            ok: false,
            message: `A rate for ${data.country} already starts on that day.`,
          };
    },
  );
