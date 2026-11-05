import * as v from "valibot";

import type { AdministratorInput, TenantSpecInput } from "./provisioning";
import type { SubscriptionTerms } from "./subscriptions";

import { customHostnameSchema, HOST_ROLES } from "./hosts";
import { MAX_GROUP_SCHOOLS } from "./provisioning";
import { subscriptionTermsSchema } from "./subscriptions";

/**
 * The steps of creating a school in the console with its business database,
 * in order. Each is saved as it is left, so a draft can be resumed.
 */
export const DRAFT_STEPS = [
  "customer",
  "schools",
  "plan",
  "addresses",
  "people",
  "review",
] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

const money = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10 ** 12),
);
const quantity = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(1_000_000),
);
const schoolIndexes = v.pipe(
  v.array(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(MAX_GROUP_SCHOOLS),
    ),
  ),
  v.maxLength(MAX_GROUP_SCHOOLS),
);

/**
 * What the new tenant buys: a plan version, Basic where there is none, and
 * add-ons, each for some schools or all, by their place in the schools
 * step since they have no ids yet; and its trial or contract.
 */
export const draftPlanSchema = v.object({
  planVersionId: v.nullable(v.pipe(v.string(), v.uuid())),
  quantity,
  unitPriceMinor: money,
  discountPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  addOns: v.pipe(
    v.array(
      v.object({
        addOnVersionId: v.pipe(v.string(), v.uuid()),
        quantity,
        unitPriceMinor: money,
        schoolIndexes,
      }),
    ),
    v.maxLength(30),
  ),
  terms: subscriptionTermsSchema,
});
export type DraftPlan = v.InferOutput<typeof draftPlanSchema>;

const ssoDomainSchema = v.pipe(
  customHostnameSchema,
  v.check(
    (domain) => !domain.startsWith("*."),
    "Name the domain itself, such as example.com.",
  ),
);

/** Hosts of its schools' own, created pending, and the domains its people sign in with. */
export const draftAddressesSchema = v.pipe(
  v.object({
    hosts: v.pipe(
      v.array(
        v.object({
          schoolIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
          hostname: customHostnameSchema,
          role: v.picklist(HOST_ROLES),
        }),
      ),
      v.maxLength(40),
    ),
    ssoDomains: v.pipe(v.array(ssoDomainSchema), v.maxLength(10)),
  }),
  v.check(
    (addresses) =>
      new Set(addresses.hosts.map((host) => host.hostname)).size ===
      addresses.hosts.length,
    "Give each host once.",
  ),
  v.check(
    (addresses) =>
      new Set(addresses.ssoDomains).size === addresses.ssoDomains.length,
    "Give each sign-in domain once.",
  ),
);
export type DraftAddresses = v.InferOutput<typeof draftAddressesSchema>;

/**
 * A draft as saved: each step's fields as the operator left them. The
 * tenant and its people are checked again in full when it is created.
 */
export interface DraftSpec {
  tenant: TenantSpecInput;
  plan: DraftPlan;
  addresses: DraftAddresses;
  people: {
    administrators: AdministratorInput[];
    groupAdministrator: AdministratorInput | null;
  };
}

/**
 * How far creating a draft has gone, so a failure resumes where it stopped
 * with the same ids.
 */
export interface DraftProgress {
  tenantId?: string;
  schoolIds?: string[];
  subscriptionId?: string;
  provisioned?: {
    created: boolean;
    sent: { schoolId: string | null; sentTo: string; loginName: string }[];
  };
  published?: boolean;
  addresses?: boolean;
  activated?: boolean;
}

/** A blank draft: one school in the cell given, Basic on a trial ending when given. */
export function blankDraft(input: {
  cellId: string;
  trialEndsOn: string;
}): DraftSpec {
  const terms: SubscriptionTerms = {
    state: "trial",
    termStartsOn: null,
    termEndsOn: null,
    trialEndsOn: input.trialEndsOn,
    renewal: "auto",
    schedule: "annual",
    contractedStudents: null,
    censusOn: null,
    notice: null,
  };
  return {
    tenant: {
      kind: "school",
      nameEn: null,
      nameAr: null,
      cellId: input.cellId,
      defaultLocale: "en",
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: null,
          nameAr: null,
          slug: "",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
        },
      ],
    },
    plan: {
      planVersionId: null,
      quantity: 1,
      unitPriceMinor: 0,
      discountPercent: 0,
      addOns: [],
      terms,
    },
    addresses: { hosts: [], ssoDomains: [] },
    people: {
      administrators: [
        {
          givenNameEn: null,
          familyNameEn: null,
          givenNameAr: null,
          familyNameAr: null,
          email: "",
        },
      ],
      groupAdministrator: null,
    },
  };
}
