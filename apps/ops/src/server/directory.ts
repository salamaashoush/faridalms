import type { ProvisionResult } from "@faridalms/domain/provisioning";

import { customerOfTenant } from "@faridalms/database/business/customers";
import {
  openSubscription,
  soldInForce,
} from "@faridalms/database/business/subscriptions";
import { HostRefusedError } from "@faridalms/database/directory/hosts";
import { saveSeriesSchema } from "@faridalms/domain/exams";
import {
  addHostSchema,
  customHostProblem,
  expectedRecords,
  hostRefSchema,
  platformName,
} from "@faridalms/domain/hosts";
import { onboardingMarkSchema } from "@faridalms/domain/onboarding";
import { saveEntitlementsSchema } from "@faridalms/domain/plans";
import {
  newSchoolSchema,
  reissueInviteSchema,
  setStandingSchema,
} from "@faridalms/domain/provisioning";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import type { Refusal } from "./creation";

import {
  CHANGE_PERIOD_DAYS,
  changeLogQuery,
  CHANGES_PER_PAGE,
} from "../change-log";
import { seriesName } from "../format";
import { currentAccess, requireArea, requireFreshSignIn } from "./access";
import { businessDb } from "./business";
import { activateSchool, beginSchool, provisionSchool } from "./creation";
import { directoryAdmin as directory } from "./directory-admin";
import { opsEnv } from "./env";
import { schoolHealth } from "./health";
import { operatorNames } from "./operators";
import { explain, reissueInvite } from "./provisioner";
import { changeStanding, tellCell } from "./standing";

const byId = v.object({ id: v.pipe(v.string(), v.uuid()) });

/** Who is signed in and what their roles let them do, or null. */
export const getAccess = createServerFn({ method: "GET" }).handler(() =>
  currentAccess(),
);

/** Every school, each with its health and onboarding. */
export const listSchools = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readTenants");
    const schools = await directory().schools();
    const health = await schoolHealth(
      { directory: directory(), business: businessDb() },
      schools,
      new Date(),
      businessToday(),
    );
    return schools.map((school) => ({
      ...school,
      health: health.get(school.id) ?? null,
    }));
  },
);

/** Operators' names by id, where a business database names them. */
async function actorNames(): Promise<Record<string, string>> {
  const business = businessDb();
  return business ? operatorNames(business) : {};
}

export const getSchool = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof byId>) => v.parse(byId, input))
  .handler(async ({ data }) => {
    await requireArea("readTenants");
    const [school, changes, hosts, names] = await Promise.all([
      directory().school(data.id),
      directory().changes({ id: data.id }),
      directory().hosts(data.id),
      actorNames(),
    ]);
    if (!school) throw new Error("NOT_FOUND");
    const [ssoDomains, tenantChanges] = await Promise.all([
      directory().ssoDomains(school.tenantId),
      directory().changes({ id: school.tenantId }),
    ]);
    const business = businessDb();
    const [subscription, customer] = business
      ? await Promise.all([
          openSubscription(business, school.tenantId),
          customerOfTenant(business, school.tenantId),
        ])
      : [null, null];
    const plan =
      business && subscription
        ? ((
            await soldInForce(business, [subscription.id], businessToday())
          ).get(subscription.id)?.plan ?? null)
        : null;
    const health = (
      await schoolHealth(
        { directory: directory(), business },
        [school],
        new Date(),
        businessToday(),
      )
    ).get(school.id);
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
      health: health ?? null,
      ssoDomains,
      /**
       * With a business database a school's entitlements come from its
       * subscription; without one an operator sets them here.
       */
      sold: business ? { subscriptionId: subscription?.id ?? null } : null,
      customer: customer
        ? { id: customer.id, name: customer.legalNameEn }
        : null,
      plan,
      today: businessToday(),
      platform: {
        site: platformName(school.slug, "site", domains),
        portal: platformName(school.slug, "portal", domains),
      },
      changes: [...changes, ...tenantChanges, ...hostChanges].toSorted((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      ),
      names,
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

/** What a change is about, named for the reader and linked where it can be. */
export interface ChangeRecord {
  name: string;
  /** The part of it the change touched, such as a hostname, or what it is. */
  detail: string | null;
  /** The school whose History holds the change. */
  schoolId: string | null;
  /** An exam session, which the Exam sessions page holds. */
  session: boolean;
}

const contains = (needle: string) => (text: string | null) =>
  text !== null && text.toLowerCase().includes(needle);

/**
 * The directory's change log, a page at a time, filtered on the server so a
 * filter reaches the whole log. A school's, a group's or a session's name
 * matches its changes, and its hosts' and sign-in domains' too.
 */
export const listChanges = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof changeLogQuery>) =>
    v.parse(changeLogQuery, input),
  )
  .handler(async ({ data }) => {
    await requireArea("readTenants");
    const [schools, series, names, counts] = await Promise.all([
      directory().schools(),
      directory().series(),
      actorNames(),
      directory().changeCounts(),
    ]);
    const needle = data.q.trim().toLowerCase();
    const matches = contains(needle);
    const tenants = new Map<
      string,
      { name: string; kind: string; schools: typeof schools }
    >();
    for (const school of schools) {
      const tenant = tenants.get(school.tenantId);
      if (tenant) tenant.schools.push(school);
      else
        tenants.set(school.tenantId, {
          name:
            school.tenantNameEn ??
            school.tenantNameAr ??
            school.nameEn ??
            school.slug,
          kind: school.tenantKind,
          schools: [school],
        });
    }
    const namedSchools = schools
      .filter((school) =>
        [school.nameEn, school.nameAr, school.slug].some(matches),
      )
      .map((school) => school.id);
    const namedTenants = [...tenants]
      .filter(([, tenant]) => matches(tenant.name))
      .map(([id]) => id);
    const namedSeries = series
      .filter((one) => matches(seriesName(one)))
      .map((one) => one.id);
    const since =
      data.when === "all"
        ? undefined
        : new Date(Date.now() - CHANGE_PERIOD_DAYS[data.when] * 86_400_000);
    const { changes, total } = await directory().changeLog({
      actions: data.action,
      actors: data.by,
      since,
      words: needle || undefined,
      named: needle
        ? {
            schools: namedSchools,
            tenants: namedTenants,
            subjects: [...namedSchools, ...namedTenants, ...namedSeries],
          }
        : undefined,
      offset: (data.page - 1) * CHANGES_PER_PAGE,
      limit: CHANGES_PER_PAGE,
    });
    const schoolsById = new Map(schools.map((school) => [school.id, school]));
    const seriesById = new Map(series.map((one) => [one.id, one]));
    const schoolNamed = (id: string | null) => {
      const school = id ? schoolsById.get(id) : undefined;
      return school ? (school.nameEn ?? school.nameAr ?? school.slug) : null;
    };
    const tenantRecord = (id: string | null, detail: string | null) => {
      const tenant = id ? tenants.get(id) : undefined;
      const only = tenant?.kind === "school" ? tenant.schools[0] : undefined;
      if (only)
        return {
          name: only.nameEn ?? only.nameAr ?? only.slug,
          detail,
          schoolId: only.id,
          session: false,
        };
      return {
        name: tenant?.name ?? "A school group no longer listed",
        detail: detail ?? "School group",
        schoolId: null,
        session: false,
      };
    };
    const recordOf = (change: (typeof changes)[number]): ChangeRecord => {
      switch (change.subjectType) {
        case "school":
          return {
            name: schoolNamed(change.subjectId) ?? "A school no longer listed",
            detail: null,
            schoolId: schoolsById.has(change.subjectId)
              ? change.subjectId
              : null,
            session: false,
          };
        case "host":
          return {
            name: schoolNamed(change.schoolId) ?? change.subjectId,
            detail: change.schoolId ? change.subjectId : "Web address",
            schoolId: change.schoolId,
            session: false,
          };
        case "tenant":
          return tenantRecord(change.subjectId, null);
        case "sso_domain":
          return tenantRecord(change.tenantId, change.subjectId);
        case "exam_series": {
          const one = seriesById.get(change.subjectId);
          return {
            name: one ? seriesName(one) : change.subjectId,
            detail: "Exam session",
            schoolId: null,
            session: true,
          };
        }
        case "cell":
          return {
            name: `Cell ${change.subjectId}`,
            detail: null,
            schoolId: null,
            session: false,
          };
        default:
          return {
            name: change.subjectId,
            detail: "Integration",
            schoolId: null,
            session: false,
          };
      }
    };
    return {
      changes: changes.map((change) => ({
        ...change,
        record: recordOf(change),
      })),
      total,
      counts,
      names,
      schoolNames: Object.fromEntries(
        schools.map((school) => [
          school.slug,
          school.nameEn ?? school.nameAr ?? school.slug,
        ]),
      ),
      pages: Math.max(1, Math.ceil(total / CHANGES_PER_PAGE)),
    };
  });

export const listSeries = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readTenants");
    return { series: await directory().series(), today: businessToday() };
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

/** Ticks or unticks an onboarding step only an operator can see taken. */
export const markOnboardingStep = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof onboardingMarkSchema>) =>
    v.parse(onboardingMarkSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("tenants");
      if (!(await directory().school(data.schoolId)))
        return { ok: false, message: "No such school." };
      const changed = await directory().markOnboarding({
        ...data,
        operatorId: operator.id,
      });
      return changed
        ? { ok: true }
        : { ok: false, message: "Someone else has just changed that step." };
    },
  );
