import { catalogue } from "@faridalms/database/business/catalogue";
import { eventsOf } from "@faridalms/database/business/events";
import {
  addItem,
  addOverride,
  endParts,
  listOpenSubscriptions,
  setTerms,
  SubscriptionError,
} from "@faridalms/database/business/subscriptions";
import {
  businessToday,
  endPartsSchema,
  overrideSchema,
  subscriptionItemSchema,
  subscriptionTermsSchema,
} from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import type { RoundOutcome } from "./daily-round";

import { requireArea, requireFreshSignIn } from "./access";
import { requireBusiness } from "./business";
import { lastRound } from "./daily-round";
import { directoryAdmin } from "./directory-admin";
import { operatorNames } from "./operators";
import { previewSubscription, publishSubscription } from "./publication";
import { publishing, runRoundAs } from "./round";

type Outcome = { ok: true } | { ok: false; message: string };

const uuid = v.pipe(v.string(), v.uuid());
const reason = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));

const REFUSED: Record<SubscriptionError["code"], string> = {
  not_found: "No such subscription.",
  already_open: "The tenant already has a subscription in force.",
  version_retired: "That version is retired and no longer sold.",
  version_missing: "That version is not in the catalogue.",
  ended: "The subscription has ended, so it no longer changes.",
};

async function refused(write: () => Promise<unknown>): Promise<Outcome> {
  try {
    await write();
    return { ok: true };
  } catch (error) {
    if (error instanceof SubscriptionError)
      return { ok: false, message: REFUSED[error.code] };
    throw error;
  }
}

const deps = () => ({
  business: requireBusiness(),
  directory: directoryAdmin(),
});

/** Whether the schools named all belong to the subscription's tenant. */
async function ownSchools(subscriptionId: string, schoolIds: string[]) {
  if (schoolIds.length === 0) return true;
  const preview = await previewSubscription(
    deps(),
    subscriptionId,
    businessToday(),
  );
  if (!preview) throw new SubscriptionError("not_found");
  const own = new Set(preview.schools.map(({ school }) => school.id));
  return schoolIds.every((id) => own.has(id));
}

const NOT_OWN: Outcome = {
  ok: false,
  message: "That school is not one of this subscription's.",
};

/** Every subscription in force, and when the daily round last ran. */
export const getSubscriptions = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readSubscriptions");
    const db = requireBusiness();
    const [rows, schools, round, names] = await Promise.all([
      listOpenSubscriptions(db),
      directoryAdmin().schools(),
      lastRound(db),
      operatorNames(db),
    ]);
    const tenants = new Map<string, string>();
    for (const school of schools)
      tenants.set(
        school.tenantId,
        school.tenantNameEn ??
          school.tenantNameAr ??
          school.nameEn ??
          school.slug,
      );
    return {
      today: businessToday(),
      subscriptions: rows
        .map(({ subscription, customerName }) => ({
          ...subscription,
          customerName,
          tenantName: tenants.get(subscription.tenantId) ?? null,
        }))
        .toSorted((a, b) =>
          (a.trialEndsOn ?? a.termEndsOn ?? "9999").localeCompare(
            b.trialEndsOn ?? b.termEndsOn ?? "9999",
          ),
        ),
      round,
      names,
    };
  },
);

/**
 * A subscription, what each of its schools has now and would have if it were
 * published today, what can still be sold to it, and its history.
 */
export const getSubscription = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("readSubscriptions");
    const today = businessToday();
    const db = requireBusiness();
    const [preview, sold, history, names] = await Promise.all([
      previewSubscription(deps(), data.id, today),
      catalogue(db),
      eventsOf(db, "subscription", data.id),
      operatorNames(db),
    ]);
    if (!preview) throw new Error("NOT_FOUND");
    const [first] = preview.schools;
    return {
      today,
      ...preview.detail,
      tenantName: first
        ? (first.school.tenantNameEn ?? first.school.tenantNameAr)
        : null,
      schools: preview.schools.map(({ school, current, next }) => ({
        id: school.id,
        name: school.nameEn ?? school.nameAr ?? school.slug,
        tenantState: school.tenantState,
        access: school.entitlements.access,
        current,
        next,
      })),
      selling: {
        plans: sold.plans.filter((plan) => !plan.retiredAt),
        addOns: sold.addOns.filter((addOn) => !addOn.retiredAt),
      },
      history,
      names,
    };
  });

const termsInput = v.object({
  id: uuid,
  terms: subscriptionTermsSchema,
  reason,
});

export const saveTerms = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof termsInput>) =>
    v.parse(termsInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("subscriptions");
    return refused(() =>
      setTerms(requireBusiness(), { ...data, by: operator.id }),
    );
  });

export const addSubscriptionItem = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof subscriptionItemSchema>) =>
    v.parse(subscriptionItemSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("subscriptions");
    if (!(await ownSchools(data.subscriptionId, data.schoolIds)))
      return NOT_OWN;
    return refused(() =>
      addItem(requireBusiness(), {
        ...data,
        schoolIds: [...new Set(data.schoolIds)],
        by: operator.id,
      }),
    );
  });

export const addSubscriptionOverride = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof overrideSchema>) =>
    v.parse(overrideSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("subscriptions");
    if (
      data.schoolId &&
      !(await ownSchools(data.subscriptionId, [data.schoolId]))
    )
      return NOT_OWN;
    return refused(() =>
      addOverride(requireBusiness(), { ...data, by: operator.id }),
    );
  });

export const endSubscriptionParts = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof endPartsSchema>) =>
    v.parse(endPartsSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("subscriptions");
    let ended = 0;
    const out = await refused(async () => {
      ended = await endParts(requireBusiness(), { ...data, by: operator.id });
    });
    if (out.ok && ended === 0)
      return {
        ok: false,
        message:
          "Nothing ended: each has ended by then already, or starts on or after that day.",
      };
    return out;
  });

const publishInput = v.object({ id: uuid, reason });

/** Writes what the subscription gives each of its schools today, at once. */
export const publishNow = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof publishInput>) =>
    v.parse(publishInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("subscriptions");
    requireFreshSignIn(operator);
    return publishSubscription(publishing(operator), {
      subscriptionId: data.id,
      day: businessToday(),
      by: operator.id,
      reason: data.reason,
    });
  });

/** Runs today's round now, as the console does each day on its own. */
export const runDailyRound = createServerFn({ method: "POST" }).handler(
  async (): Promise<
    { ok: true; outcome: RoundOutcome } | { ok: false; message: string }
  > => {
    const { operator } = await requireArea("lifecycle");
    requireFreshSignIn(operator);
    const outcome = await runRoundAs(operator);
    return outcome
      ? { ok: true, outcome }
      : {
          ok: false,
          message:
            "Another console is running the round now. Reload in a minute to see what it did.",
        };
  },
);
