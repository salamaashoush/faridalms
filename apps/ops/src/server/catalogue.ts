import type { BusinessDb } from "@faridalms/database/business/client";

import {
  catalogue,
  CatalogueError,
  retireVersion,
  saveAddOnVersion,
  savePlanVersion,
} from "@faridalms/database/business/catalogue";
import { eventsOf } from "@faridalms/database/business/events";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { setOfferSchema } from "@faridalms/domain/plans";
import {
  addOnVersionSchema,
  businessToday,
  planVersionSchema,
} from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { directoryAdmin as directory } from "./directory-admin";
import { operatorNames } from "./operators";

type Outcome = { ok: true } | { ok: false; message: string };

const REFUSED: Record<CatalogueError["code"], string> = {
  code_taken: "Something in the catalogue already has this code.",
  not_found: "That is no longer in the catalogue. Reload the page.",
  kind_differs: "A new version keeps the add-on's kind.",
};

/** A save, with the plan or add-on it wrote to so the page can open it. */
type Saved = { ok: true; id: string } | { ok: false; message: string };

async function refused(write: () => Promise<string>): Promise<Saved> {
  try {
    return { ok: true, id: await write() };
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
    return {
      today: businessToday(),
      ...(await catalogue(requireBusiness())),
    };
  },
);

export const savePlan = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof planVersionSchema>) =>
    v.parse(planVersionSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("catalogue");
    const db = requireBusiness();
    return refused(async () => {
      const id = await savePlanVersion(db, { ...data, by: operator.id });
      const saved =
        data.planId ??
        (await catalogue(db)).plans.find((version) => version.id === id)
          ?.planId;
      if (!saved) throw new Error("the version was not saved");
      return saved;
    });
  });

export const saveAddOn = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof addOnVersionSchema>) =>
    v.parse(addOnVersionSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("catalogue");
    const db = requireBusiness();
    return refused(async () => {
      const id = await saveAddOnVersion(db, { ...data, by: operator.id });
      const saved =
        data.addOnId ??
        (await catalogue(db)).addOns.find((version) => version.id === id)
          ?.addOnId;
      if (!saved) throw new Error("the version was not saved");
      return saved;
    });
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

const recordInput = v.object({ id: v.pipe(v.string(), v.uuid()) });

/**
 * What a plan's or add-on's page shows of its past: its own events and each
 * version's retirement, newest first, and why each version was made.
 */
async function historyOf(
  db: BusinessDb,
  kind: "plan" | "add_on",
  id: string,
  versionIds: readonly string[],
) {
  const [own, retired, names] = await Promise.all([
    eventsOf(db, kind, id),
    Promise.all(
      versionIds.map((versionId) => eventsOf(db, `${kind}_version`, versionId)),
    ),
    operatorNames(db),
  ]);
  const history = [...own, ...retired.flat()].toSorted(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const why: Record<number, string | null> = {};
  for (const event of own) {
    const made = event.after;
    if (
      event.action === `${kind}.version` &&
      made !== null &&
      typeof made === "object" &&
      !Array.isArray(made) &&
      typeof made.version === "number"
    )
      why[made.version] = event.reason;
  }
  return { history, why, names };
}

/** A plan's versions, newest first, why each was made, and its history. */
export const getPlan = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(recordInput, input))
  .handler(async ({ data }) => {
    await requireArea("catalogue");
    const db = requireBusiness();
    const versions = (await catalogue(db)).plans.filter(
      (version) => version.planId === data.id,
    );
    if (versions.length === 0) throw new Error("NOT_FOUND");
    return {
      today: businessToday(),
      versions,
      ...(await historyOf(
        db,
        "plan",
        data.id,
        versions.map((version) => version.id),
      )),
    };
  });

/** An add-on's versions, newest first, why each was made, and its history. */
export const getAddOn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(recordInput, input))
  .handler(async ({ data }) => {
    await requireArea("catalogue");
    const db = requireBusiness();
    const versions = (await catalogue(db)).addOns.filter(
      (version) => version.addOnId === data.id,
    );
    if (versions.length === 0) throw new Error("NOT_FOUND");
    return {
      today: businessToday(),
      versions,
      ...(await historyOf(
        db,
        "add_on",
        data.id,
        versions.map((version) => version.id),
      )),
    };
  });

/**
 * Every module with whether it is offered to schools that do not have it,
 * and when the operator last decided; a module never decided on is offered.
 */
export const getOffers = createServerFn({ method: "GET" }).handler(async () => {
  await requireArea("catalogue");
  const decided = new Map(
    (await directory().offers()).map((row) => [row.module, row]),
  );
  return MODULE_IDS.map((module) => {
    const row = decided.get(module);
    return {
      id: module,
      module,
      offered: row?.offered ?? true,
      changedAt: row ? row.updatedAt.toISOString() : null,
    };
  });
});

/**
 * Puts a module on offer to schools that lack it, or takes it off. Cells
 * read the offer within the directory cache's minute.
 */
export const setOffer = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof setOfferSchema>) =>
    v.parse(setOfferSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("catalogue");
    const changed = await directory().setOffer({
      ...data,
      operatorId: operator.id,
    });
    return changed
      ? { ok: true }
      : {
          ok: false,
          message: data.offered
            ? "That module is already on offer."
            : "That module is already off offer.",
        };
  });
