import type {
  DraftSpec,
  DraftStep,
} from "@faridalms/domain/provisioning-draft";

import { catalogue } from "@faridalms/database/business/catalogue";
import {
  customerById,
  listCustomers,
} from "@faridalms/database/business/customers";
import {
  abandonDraft,
  draftById,
  openDrafts,
  saveDraft,
  startDraft,
} from "@faridalms/database/business/drafts";
import { openSubscription } from "@faridalms/database/business/subscriptions";
import { customHostProblem } from "@faridalms/domain/hosts";
import {
  administratorSchema,
  newSchoolSchema,
  tenantSpecSchema,
} from "@faridalms/domain/provisioning";
import {
  blankDraft,
  DRAFT_STEPS,
  draftAddressesSchema,
  draftPlanSchema,
} from "@faridalms/domain/provisioning-draft";
import { addDays } from "@faridalms/domain/school";
import { businessToday, TRIAL_DAYS } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import type { CreatedSchool } from "./school-setup";

import { requireArea } from "./access";
import { agreementStateOf } from "./agreement-state";
import { businessDb, requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { opsEnv } from "./env";
import { createDraftSchool } from "./school-setup";

const uuid = v.pipe(v.string(), v.uuid());
const reason = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));
/**
 * What New school opens on: the open cells, and with a business database
 * the drafts being filled in, for the console sets a school up as a sale.
 */
export const getNewSchool = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("tenants");
    const db = businessDb();
    const cells = await directoryAdmin().openCells();
    if (!db) return { cells, drafts: null };
    return {
      cells,
      drafts: (await openDrafts(db)).map(({ draft, customerName }) => ({
        id: draft.id,
        step: draft.step,
        customerName,
        schools: draft.spec.tenant.schools.map(
          (school) => school.nameEn || school.nameAr || school.slug,
        ),
        updatedAt: draft.updatedAt,
        started: draft.tenantId !== null,
      })),
    };
  },
);

export const startNewDraft = createServerFn({ method: "POST" }).handler(
  async () => {
    const { operator } = await requireArea("tenants");
    const [cell] = await directoryAdmin().openCells();
    const id = await startDraft(requireBusiness(), {
      spec: blankDraft({
        cellId: cell?.id ?? "",
        trialEndsOn: addDays(businessToday(), TRIAL_DAYS),
      }),
      by: operator.id,
    });
    return { id };
  },
);

/** A draft with all its steps need: cells, customers, what is sold. */
export const getDraft = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("tenants");
    const db = requireBusiness();
    const draft = await draftById(db, data.id);
    if (!draft || draft.state === "abandoned") throw new Error("NOT_FOUND");
    const [cells, customers, sold, customer] = await Promise.all([
      directoryAdmin().openCells(),
      listCustomers(db),
      catalogue(db),
      draft.customerId ? customerById(db, draft.customerId) : null,
    ]);
    const [subscription, agreements] = await Promise.all([
      draft.tenantId ? openSubscription(db, draft.tenantId) : null,
      customer ? agreementStateOf(db, customer.customer.id) : null,
    ]);
    return {
      draft,
      today: businessToday(),
      cells,
      customers: customers.map((row) => ({
        id: row.id,
        legalNameEn: row.legalNameEn,
        currency: row.currency,
        runsTenant: row.tenantId !== null && row.tenantId !== draft.tenantId,
      })),
      customer,
      agreements,
      selling: {
        plans: sold.plans.filter((plan) => !plan.retiredAt),
        addOns: sold.addOns.filter((addOn) => !addOn.retiredAt),
      },
      domains: {
        portal: opsEnv().PORTAL_DOMAIN,
        sites: opsEnv().SITES_DOMAIN,
      },
      subscriptionId: subscription?.id ?? null,
    };
  });

const peopleSchema = v.object({
  administrators: v.array(administratorSchema),
  groupAdministrator: v.nullable(administratorSchema),
});

const nextStep = v.picklist(DRAFT_STEPS);
const saveStepSchema = v.variant("step", [
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("customer"),
    customerId: uuid,
  }),
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("schools"),
    tenant: tenantSpecSchema,
  }),
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("plan"),
    plan: draftPlanSchema,
  }),
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("addresses"),
    addresses: draftAddressesSchema,
  }),
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("people"),
    people: peopleSchema,
  }),
  v.object({
    id: uuid,
    expectedVersion: v.number(),
    next: nextStep,
    step: v.literal("review"),
  }),
]);

export type SaveStepInput = v.InferInput<typeof saveStepSchema>;

/** Each school keeps its administrator's place as schools are added or removed. */
function alignPeople(spec: DraftSpec): DraftSpec["people"] {
  const count = spec.tenant.schools.length;
  const administrators = spec.tenant.schools.map(
    (_, index) =>
      spec.people.administrators[index] ?? {
        givenNameEn: null,
        familyNameEn: null,
        givenNameAr: null,
        familyNameAr: null,
        email: "",
      },
  );
  return {
    administrators: administrators.slice(0, count),
    groupAdministrator:
      spec.tenant.kind === "school_group"
        ? spec.people.groupAdministrator
        : null,
  };
}

/**
 * Saves the step an operator is leaving, checked as that step is, and
 * moves the draft to the step they go to.
 */
export const saveDraftStep = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof saveStepSchema>) =>
    v.parse(saveStepSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; version: number } | { ok: false; message: string }
    > => {
      const { operator } = await requireArea("tenants");
      const db = requireBusiness();
      const draft = await draftById(db, data.id);
      if (!draft || draft.state !== "draft") throw new Error("NOT_FOUND");
      const spec: DraftSpec = { ...draft.spec };
      let customerId = draft.customerId;
      if (data.step === "customer") {
        const chosen = await customerById(db, data.customerId);
        if (!chosen) return { ok: false, message: "No such customer." };
        if (
          chosen.customer.tenantId &&
          chosen.customer.tenantId !== draft.tenantId
        )
          return {
            ok: false,
            message:
              "This customer already runs a tenant. A customer runs one; add schools to its group instead.",
          };
        customerId = data.customerId;
      }
      if (data.step === "schools") {
        if (draft.tenantId)
          return {
            ok: false,
            message:
              "Its schools are already in the directory, so their addresses no longer change here.",
          };
        spec.tenant = data.tenant;
        spec.people = alignPeople(spec);
      }
      if (data.step === "plan") spec.plan = data.plan;
      if (data.step === "addresses") {
        const env = opsEnv();
        const domains = { portal: env.PORTAL_DOMAIN, sites: env.SITES_DOMAIN };
        for (const host of data.addresses.hosts) {
          if (host.schoolIndex >= spec.tenant.schools.length)
            return { ok: false, message: "Choose one of its schools." };
          if (customHostProblem(host.hostname, domains))
            return {
              ok: false,
              message: `${host.hostname} is under the platform's own domains, or is not a domain name.`,
            };
        }
        spec.addresses = data.addresses;
      }
      if (data.step === "people") {
        const parsed = v.safeParse(newSchoolSchema, {
          ...spec.tenant,
          ...data.people,
        });
        if (!parsed.success)
          return {
            ok: false,
            message: parsed.issues.map((issue) => issue.message).join(" "),
          };
        spec.people = data.people;
      }
      const version = await saveDraft(db, {
        id: data.id,
        expectedVersion: data.expectedVersion,
        step: data.next satisfies DraftStep,
        customerId,
        spec,
        by: operator.id,
      });
      return version === null
        ? {
            ok: false,
            message:
              "Someone else saved this draft since you opened it. Reload to see their changes.",
          }
        : { ok: true, version };
    },
  );

export const abandonNewSchool = createServerFn({ method: "POST" })
  .validator((input: { id: string; reason: string }) =>
    v.parse(v.object({ id: uuid, reason }), input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("tenants");
    const abandoned = await abandonDraft(requireBusiness(), {
      ...data,
      by: operator.id,
    });
    return abandoned
      ? { ok: true as const }
      : {
          ok: false as const,
          message:
            "Creating it has begun, so it is finished rather than set aside.",
        };
  });

/** Creates the school a draft describes; see createDraftSchool. */
export const createFromDraft = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }): Promise<CreatedSchool> => {
    const { operator } = await requireArea("tenants");
    return createDraftSchool(operator, data.id);
  });
