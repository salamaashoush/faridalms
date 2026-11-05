import {
  catalogue,
  CatalogueError,
  retireVersion,
  saveAddOnVersion,
  savePlanVersion,
} from "@faridalms/database/business/catalogue";
import {
  addOnVersionSchema,
  planVersionSchema,
} from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";

type Outcome = { ok: true } | { ok: false; message: string };

const REFUSED: Record<CatalogueError["code"], string> = {
  code_taken: "Something in the catalogue already has this code.",
  not_found: "That is no longer in the catalogue. Reload the page.",
  kind_differs: "A new version keeps the add-on's kind.",
};

async function refused(write: () => Promise<unknown>): Promise<Outcome> {
  try {
    await write();
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogueError)
      return { ok: false, message: REFUSED[error.code] };
    throw error;
  }
}

/** Every plan and add-on version, newest first, with prices. */
export const getCatalogue = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("catalogue");
    return catalogue(requireBusiness());
  },
);

export const savePlan = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof planVersionSchema>) =>
    v.parse(planVersionSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("catalogue");
    return refused(() =>
      savePlanVersion(requireBusiness(), { ...data, by: operator.id }),
    );
  });

export const saveAddOn = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof addOnVersionSchema>) =>
    v.parse(addOnVersionSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("catalogue");
    return refused(() =>
      saveAddOnVersion(requireBusiness(), { ...data, by: operator.id }),
    );
  });

const retireSchema = v.object({
  kind: v.picklist(["plan", "add_on"]),
  id: v.pipe(v.string(), v.uuid()),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

/** Stops a version being sold; contracts that hold it keep it. */
export const retire = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof retireSchema>) =>
    v.parse(retireSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("catalogue");
    const retired = await retireVersion(requireBusiness(), {
      ...data,
      by: operator.id,
    });
    return retired
      ? { ok: true }
      : { ok: false, message: "That version was already retired." };
  });
