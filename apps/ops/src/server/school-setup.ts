import {
  customerById,
  linkTenant,
} from "@faridalms/database/business/customers";
import {
  draftById,
  finishDraft,
  recordProgress,
} from "@faridalms/database/business/drafts";
import {
  createSubscription,
  openSubscription,
  SubscriptionError,
} from "@faridalms/database/business/subscriptions";
import { HostRefusedError } from "@faridalms/database/directory/hosts";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import { newSchoolSchema } from "@faridalms/domain/provisioning";
import {
  draftAddressesSchema,
  draftPlanSchema,
} from "@faridalms/domain/provisioning-draft";
import { businessToday } from "@faridalms/domain/subscriptions";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import type { Refusal } from "./creation";
import type { Operator } from "./session";

import { requireBusiness } from "./business";
import { activateSchool, beginSchool, provisionSchool } from "./creation";
import { directoryAdmin } from "./directory-admin";
import { publishSubscription } from "./publication";
import { publishing } from "./round";

const refused = (message: string): Refusal => ({
  ok: false,
  message,
  takenSlugs: [],
});

export type CreatedSchool =
  | {
      ok: true;
      schoolId: string;
      subscriptionId: string;
      sent: { schoolId: string | null; sentTo: string; loginName: string }[];
    }
  | Refusal;

/**
 * Creates the school a draft describes, step by step, recording each step
 * as it is done so that a failure resumes where it stopped: the directory's
 * rows, the subscription with what was sold, the cell's tenant and its
 * administrators' links, the entitlements published, its hosts and sign-in
 * domains, then the tenant active. The customer must have accepted the data
 * processing agreement first: no school's data is held without it. It acts
 * as the operator given, or as the customer's own acceptance does.
 */
export async function createDraftSchool(
  operator: Operator,
  draftId: string,
): Promise<CreatedSchool> {
  const db = requireBusiness();
  const draft = await draftById(db, draftId);
  if (!draft || draft.state === "abandoned") throw new Error("NOT_FOUND");
  const found = draft.customerId
    ? await customerById(db, draft.customerId)
    : null;
  if (!found) return refused("Choose the customer first.");
  const { customer } = found;
  if (!customer.dpaVersion)
    return refused(
      "The customer has not accepted the data processing agreement. Record its acceptance first: no school's data is held without it.",
    );
  const parsedSpec = v.safeParse(newSchoolSchema, {
    ...draft.spec.tenant,
    ...draft.spec.people,
    entitlements: settableOf(BASIC_ENTITLEMENTS),
  });
  if (!parsedSpec.success)
    return refused(
      "Its schools or people are not complete. Go back to those steps.",
    );
  const spec = parsedSpec.output;
  const plan = v.parse(draftPlanSchema, draft.spec.plan);
  const addresses = v.parse(draftAddressesSchema, draft.spec.addresses);
  const progress = { ...draft.progress };
  const today = businessToday();

  if (!progress.tenantId || !progress.schoolIds) {
    const begun = await beginSchool(operator, spec);
    if (!begun.ok) return begun;
    progress.tenantId = begun.tenantId;
    progress.schoolIds = begun.schoolIds;
    await recordProgress(db, draft.id, {
      tenantId: begun.tenantId,
      schoolIds: begun.schoolIds,
    });
  }
  const { tenantId, schoolIds } = progress;
  const [schoolId] = schoolIds;
  if (!schoolId) throw new Error("A tenant has a school");

  if (!progress.subscriptionId) {
    if (
      !(await linkTenant(db, {
        customerId: customer.id,
        tenantId,
        by: operator.id,
      }))
    )
      return refused("This customer already runs another tenant.");
    const held = await openSubscription(db, tenantId);
    const startsOn = plan.terms.termStartsOn ?? today;
    let subscriptionId = held?.id;
    try {
      subscriptionId ??= await createSubscription(db, {
        customerId: customer.id,
        tenantId,
        currency: customer.currency,
        terms: plan.terms,
        items: [
          ...(plan.planVersionId
            ? [
                {
                  planVersionId: plan.planVersionId,
                  addOnVersionId: null,
                  quantity: plan.quantity,
                  unitPriceMinor: plan.unitPriceMinor,
                  discountPercent: plan.discountPercent,
                  schoolIds: [],
                  startsOn,
                },
              ]
            : []),
          ...plan.addOns.map((addOn) => ({
            planVersionId: null,
            addOnVersionId: addOn.addOnVersionId,
            quantity: addOn.quantity,
            unitPriceMinor: addOn.unitPriceMinor,
            discountPercent: 0,
            schoolIds: addOn.schoolIndexes.flatMap((index) => {
              const id = schoolIds[index];
              return id ? [id] : [];
            }),
            startsOn,
          })),
        ],
        by: operator.id,
        reason: "Sold with the school",
      });
    } catch (error) {
      if (error instanceof SubscriptionError)
        return refused(
          error.code === "version_retired"
            ? "A plan or add-on it was sold has been retired since. Choose a version still sold."
            : "Its subscription could not be opened.",
        );
      throw error;
    }
    progress.subscriptionId = subscriptionId;
    await recordProgress(db, draft.id, { subscriptionId });
  }
  const { subscriptionId } = progress;

  if (!progress.provisioned) {
    const answer = await provisionSchool(operator, {
      tenantId,
      schoolIds,
      spec,
    });
    if (!answer.ok) return answer;
    progress.provisioned = {
      created: answer.value.created,
      sent: answer.value.sent,
    };
    await recordProgress(db, draft.id, { provisioned: progress.provisioned });
  }

  if (!progress.published) {
    await publishSubscription(publishing(operator), {
      subscriptionId,
      day: today,
      by: operator.id,
      reason: "Sold with the school",
    });
    await recordProgress(db, draft.id, { published: true });
  }

  if (!progress.addresses) {
    for (const host of addresses.hosts) {
      const hostSchool = schoolIds[host.schoolIndex];
      if (!hostSchool) continue;
      try {
        await directoryAdmin().addHost({
          schoolId: hostSchool,
          hostname: host.hostname,
          role: host.role,
          challenge: randomBytes(24).toString("base64url"),
          operatorId: operator.id,
          reason: "Set up with the school",
        });
      } catch (error) {
        if (error instanceof HostRefusedError && error.code === "hosts.exists")
          continue;
        if (error instanceof HostRefusedError)
          return refused(
            error.code === "hosts.taken"
              ? `Another school holds ${host.hostname}. Change it in the addresses step, then create again.`
              : `The plan allows fewer hosts of its own than the addresses step names. Change one, then create again.`,
          );
        throw error;
      }
    }
    for (const domain of addresses.ssoDomains)
      if (
        !(await directoryAdmin().addSsoDomain({
          tenantId,
          domain,
          operatorId: operator.id,
          reason: "Set up with the school",
        }))
      )
        return refused(
          `Another tenant signs in with ${domain}. Change it in the addresses step, then create again.`,
        );
    await recordProgress(db, draft.id, { addresses: true });
  }

  if (!progress.activated) {
    if (!(await activateSchool(operator, tenantId)))
      return refused(
        "The directory still shows it as provisioning. Create again to finish.",
      );
    await recordProgress(db, draft.id, { activated: true });
  }
  if (draft.state === "draft")
    await finishDraft(db, { id: draft.id, tenantId, by: operator.id });
  return {
    ok: true,
    schoolId,
    subscriptionId,
    sent: progress.provisioned.sent,
  };
}
