import type { DirectoryAdmin } from "@faridalms/database/directory/admin";

import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { saveSeriesSchema } from "@faridalms/domain/exams";
import { savePlanSchema } from "@faridalms/domain/plans";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { opsEnv } from "./env";
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
