import type { ProvisionResult } from "@faridalms/domain/provisioning";

import { openSubscription } from "@faridalms/database/business/subscriptions";
import { HostRefusedError } from "@faridalms/database/directory/hosts";
import { saveSeriesSchema } from "@faridalms/domain/exams";
import {
  addHostSchema,
  customHostProblem,
  expectedRecords,
  hostRefSchema,
  platformName,
} from "@faridalms/domain/hosts";
import { saveEntitlementsSchema } from "@faridalms/domain/plans";
import {
  newSchoolSchema,
  reissueInviteSchema,
  setStandingSchema,
} from "@faridalms/domain/provisioning";
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import type { Refusal } from "./creation";

import { currentAccess, requireArea, requireFreshSignIn } from "./access";
import { businessDb } from "./business";
import { activateSchool, beginSchool, provisionSchool } from "./creation";
import { directoryAdmin as directory } from "./directory-admin";
import { opsEnv } from "./env";
import { explain, reissueInvite } from "./provisioner";
import { changeStanding, tellCell } from "./standing";

const byId = v.object({ id: v.pipe(v.string(), v.uuid()) });

/** Who is signed in and what their roles let them do, or null. */
export const getAccess = createServerFn({ method: "GET" }).handler(() =>
  currentAccess(),
);

export const listSchools = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readTenants");
    return directory().schools();
  },
);

export const getSchool = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof byId>) => v.parse(byId, input))
  .handler(async ({ data }) => {
    await requireArea("readTenants");
    const [school, changes, hosts] = await Promise.all([
      directory().school(data.id),
      directory().changes({ id: data.id }),
      directory().hosts(data.id),
    ]);
    if (!school) throw new Error("NOT_FOUND");
    const ssoDomains = await directory().ssoDomains(school.tenantId);
    const business = businessDb();
    const subscription = business
      ? await openSubscription(business, school.tenantId)
      : null;
    const env = opsEnv();
    const domains = { portal: env.PORTAL_DOMAIN, sites: env.SITES_DOMAIN };
    const hostChanges = hosts.length
      ? (
          await Promise.all(
            hosts.map((host) => directory().changes({ id: host.hostname })),
          )
        ).flat()
      : [];
    return {
      school,
      ssoDomains,
      /**
       * With a business database a school's entitlements come from its
       * subscription; without one an operator sets them here.
       */
      sold: business ? { subscriptionId: subscription?.id ?? null } : null,
      platform: {
        site: platformName(school.slug, "site", domains),
        portal: platformName(school.slug, "portal", domains),
      },
      changes: [...changes, ...hostChanges].toSorted((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      ),
      hosts: hosts.map((host) => ({
        ...host,
        records: expectedRecords(
          host,
          school.slug,
          domains,
          env.EDGE_IPV4 ?? null,
        ),
      })),
    };
  });

export const saveEntitlements = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof saveEntitlementsSchema>) =>
    v.parse(saveEntitlementsSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("entitlements");
    requireFreshSignIn(operator);
    // The next publication would undo it: the subscription is changed instead.
    if (businessDb()) throw new Error("SOLD");
    const { schoolId, reason, ...entitlements } = data;
    await directory().saveEntitlements({
      schoolId,
      entitlements,
      operatorId: operator.id,
      reason,
    });
    const school = await directory().school(schoolId);
    return {
      ok: true,
      atOnce: school ? await tellCell(operator, school.tenantId) : false,
    };
  });

export const listChanges = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readTenants");
    return directory().changes();
  },
);

export const listSeries = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readTenants");
    const [series, changes] = await Promise.all([
      directory().series(),
      directory().changes({ type: "exam_series" }),
    ]);
    return { series, changes };
  },
);

export const saveSeries = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof saveSeriesSchema>) =>
    v.parse(saveSeriesSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("tenants");
    const { reason, ...series } = data;
    const id = await directory().saveSeries({
      ...series,
      operatorId: operator.id,
      reason,
    });
    return { id };
  });

export const listCells = createServerFn({ method: "GET" }).handler(async () => {
  await requireArea("readTenants");
  return directory().openCells();
});

export type CreateSchoolOutcome =
  | {
      ok: true;
      schoolId: string;
      sent: ProvisionResult["sent"];
      /** False when an earlier attempt had already created it in the cell. */
      created: boolean;
      /** False when the directory still shows it as provisioning. */
      activated: boolean;
    }
  | Refusal;

/**
 * Creates a school or group where the console runs without its business
 * database: the directory rows first, as provisioning, then the cell creates
 * the tenant and emails its administrators, then the directory marks it
 * active. A failure at any step leaves it provisioning, and submitting the
 * same addresses again finishes it with the same ids.
 */
export const createSchool = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof newSchoolSchema>) =>
    v.parse(newSchoolSchema, input),
  )
  .handler(async ({ data }): Promise<CreateSchoolOutcome> => {
    const { operator } = await requireArea("tenants");
    if (businessDb()) throw new Error("SOLD");
    const begun = await beginSchool(operator, data);
    if (!begun.ok) return begun;
    const answer = await provisionSchool(operator, {
      tenantId: begun.tenantId,
      schoolIds: begun.schoolIds,
      spec: data,
    });
    if (!answer.ok) return answer;
    const [schoolId] = begun.schoolIds;
    if (!schoolId) throw new Error("A tenant has a school");
    return {
      ok: true,
      schoolId,
      sent: answer.value.sent,
      created: answer.value.created,
      activated: await activateSchool(operator, begun.tenantId),
    };
  });

const resendSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  email: reissueInviteSchema.entries.email,
});

/** Pauses, suspends, restricts or reopens a school's tenant. */
export const setSchoolLifecycle = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof setStandingSchema>) =>
    v.parse(setStandingSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("lifecycle");
      requireFreshSignIn(operator);
      return changeStanding(operator, data);
    },
  );

export const resendInvite = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof resendSchema>) =>
    v.parse(resendSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; sentTo: string; reset: boolean }
      | { ok: false; message: string }
    > => {
      const { operator } = await requireArea("tenants");
      const school = await directory().school(data.schoolId);
      if (!school) throw new Error("NOT_FOUND");
      if (school.tenantState !== "active")
        return {
          ok: false,
          message:
            "The school is not active yet. Finish creating it from New school first.",
        };
      const answer = await reissueInvite(operator, {
        tenantId: school.tenantId,
        schoolId: school.id,
        email: data.email,
      });
      if (!answer.ok) return { ok: false, message: explain(answer) };
      await directory().recordInvite({
        schoolId: school.id,
        operatorId: operator.id,
      });
      return {
        ok: true,
        sentTo: answer.value.sentTo,
        reset: answer.value.reset,
      };
    },
  );

const schoolHostSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  ...hostRefSchema.entries,
});
const reasoned = v.object({
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

export const addHost = createServerFn({ method: "POST" })
  .validator(
    (
      input: v.InferInput<typeof addHostSchema> & {
        schoolId: string;
        reason: string;
      },
    ) =>
      v.parse(
        v.object({
          schoolId: v.pipe(v.string(), v.uuid()),
          ...addHostSchema.entries,
          ...reasoned.entries,
        }),
        input,
      ),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("tenants");
      const env = opsEnv();
      const problem = customHostProblem(data.hostname, {
        portal: env.PORTAL_DOMAIN,
        sites: env.SITES_DOMAIN,
      });
      if (problem)
        return {
          ok: false,
          message:
            problem === "hosts.platform"
              ? "Names under the platform's own domains are the platform's."
              : "That is not a domain name.",
        };
      try {
        await directory().addHost({
          schoolId: data.schoolId,
          hostname: data.hostname,
          role: data.role,
          challenge: randomBytes(24).toString("base64url"),
          operatorId: operator.id,
          reason: data.reason,
        });
      } catch (error) {
        if (error instanceof HostRefusedError)
          return {
            ok: false,
            message: {
              "hosts.exists": "The school already has this host.",
              "hosts.taken": "Another school holds this host.",
              "hosts.limit_reached":
                "The school already has as many hosts as its entitlements allow.",
            }[error.code],
          };
        throw error;
      }
      return { ok: true };
    },
  );

export const removeHost = createServerFn({ method: "POST" })
  .validator(
    (input: v.InferInput<typeof schoolHostSchema> & { reason: string }) =>
      v.parse(
        v.object({ ...schoolHostSchema.entries, ...reasoned.entries }),
        input,
      ),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("tenants");
    return {
      ok: await directory().removeHost({ ...data, operatorId: operator.id }),
    };
  });

export const makeHostCanonical = createServerFn({ method: "POST" })
  .validator(
    (input: v.InferInput<typeof schoolHostSchema> & { reason: string }) =>
      v.parse(
        v.object({ ...schoolHostSchema.entries, ...reasoned.entries }),
        input,
      ),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("tenants");
    return {
      ok: await directory().makeCanonical({
        ...data,
        operatorId: operator.id,
      }),
    };
  });

/** Queues a check; the cell's worker runs it on its next pass. */
export const checkHost = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof schoolHostSchema>) =>
    v.parse(schoolHostSchema, input),
  )
  .handler(async ({ data }) => {
    await requireArea("tenants");
    return { ok: await directory().requestCheck(data) };
  });
