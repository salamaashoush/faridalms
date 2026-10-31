import type { DirectoryAdmin } from "@faridalms/database/directory/admin";

import {
  openDirectoryAdmin,
  SlugTakenError,
} from "@faridalms/database/directory/admin";
import { saveSeriesSchema } from "@faridalms/domain/exams";
import { savePlanSchema } from "@faridalms/domain/plans";
import {
  newSchoolSchema,
  reissueInviteSchema,
} from "@faridalms/domain/provisioning";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { opsEnv } from "./env";
import { explain, provisionTenant, reissueInvite } from "./provisioner";
import { currentOperator, requireOperator } from "./session";

const byId = v.object({ id: v.pipe(v.string(), v.uuid()) });

let admin: DirectoryAdmin | null = null;
const directory = () => {
  admin ??= openDirectoryAdmin(opsEnv().OPS_DIRECTORY_URL);
  return admin;
};

export const getOperator = createServerFn({ method: "GET" }).handler(() =>
  currentOperator(),
);

export const listSchools = createServerFn({ method: "GET" }).handler(() => {
  requireOperator();
  return directory().schools();
});

export const getSchool = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof byId>) => v.parse(byId, input))
  .handler(async ({ data }) => {
    requireOperator();
    const [school, changes] = await Promise.all([
      directory().school(data.id),
      directory().changes({ id: data.id }),
    ]);
    if (!school) throw new Error("NOT_FOUND");
    return { school, changes };
  });

export const savePlan = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof savePlanSchema>) =>
    v.parse(savePlanSchema, input),
  )
  .handler(async ({ data }) => {
    const operator = requireOperator();
    const { schoolId, reason, ...plan } = data;
    const defaults = Object.values(plan).every((value) => value === null);
    await directory().savePlan({
      schoolId,
      plan: defaults ? null : plan,
      operatorId: operator.id,
      reason,
    });
    return { ok: true };
  });

export const listChanges = createServerFn({ method: "GET" }).handler(() => {
  requireOperator();
  return directory().changes();
});

export const listSeries = createServerFn({ method: "GET" }).handler(
  async () => {
    requireOperator();
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
    const operator = requireOperator();
    const { reason, ...series } = data;
    const id = await directory().saveSeries({
      ...series,
      operatorId: operator.id,
      reason,
    });
    return { id };
  });

export const listCells = createServerFn({ method: "GET" }).handler(() => {
  requireOperator();
  return directory().openCells();
});

export type CreateSchoolOutcome =
  | {
      ok: true;
      schoolId: string;
      sentTo: string;
      loginName: string;
      /** False when an earlier attempt had already created it in the cell. */
      created: boolean;
      /** False when the directory still shows it as provisioning. */
      activated: boolean;
    }
  | { ok: false; message: string; takenSlugs: string[] };

/**
 * Creates a school or group: the directory rows first, as provisioning, then
 * the cell creates the tenant and emails its first administrator, then the
 * directory marks it active. A failure at any step leaves it provisioning,
 * and submitting the same addresses again finishes it with the same ids.
 */
export const createSchool = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof newSchoolSchema>) =>
    v.parse(newSchoolSchema, input),
  )
  .handler(async ({ data }): Promise<CreateSchoolOutcome> => {
    const operator = requireOperator();
    let begun: Awaited<ReturnType<DirectoryAdmin["beginTenant"]>>;
    try {
      begun = await directory().beginTenant({
        tenantId: Bun.randomUUIDv7(),
        kind: data.kind,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        cellId: data.cellId,
        jurisdictions: data.jurisdictions,
        schools: data.schools.map((school) => ({
          id: Bun.randomUUIDv7(),
          slug: school.slug,
          nameEn: school.nameEn,
          nameAr: school.nameAr,
        })),
        plan: data.plan,
        operatorId: operator.id,
      });
    } catch (error) {
      if (error instanceof SlugTakenError)
        return {
          ok: false,
          takenSlugs: error.slugs,
          message: error.pending
            ? "These addresses belong to a school still being created with other details. Submit it as it was first entered to finish it."
            : "Another school already has this address.",
        };
      if (error instanceof Error && error.message === "cell.not_open")
        return {
          ok: false,
          takenSlugs: [],
          message: "That cell is not open for new schools.",
        };
      throw error;
    }
    const answer = await provisionTenant(operator, {
      tenantId: begun.tenantId,
      schoolIds: begun.schoolIds,
      spec: data,
    });
    if (!answer.ok)
      return {
        ok: false,
        takenSlugs: [],
        message: `${explain(answer)} The school stays in the directory as provisioning until it succeeds.`,
      };
    const activated = await directory()
      .activateTenant({ tenantId: begun.tenantId, operatorId: operator.id })
      .then(
        () => true,
        () => false,
      );
    const [schoolId] = begun.schoolIds;
    if (!schoolId) throw new Error("A tenant has a school");
    return {
      ok: true,
      schoolId,
      sentTo: answer.value.sentTo,
      loginName: answer.value.loginName,
      created: answer.value.created,
      activated,
    };
  });

const resendSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  email: reissueInviteSchema.entries.email,
});

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
      const operator = requireOperator();
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
