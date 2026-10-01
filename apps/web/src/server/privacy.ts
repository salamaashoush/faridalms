import {
  approveErasureSchema,
  breachNoticesSchema,
  closeBreachSchema,
  closeRequestSchema,
  extendRequestSchema,
  placeHoldSchema,
  releaseHoldSchema,
  runErasureSchema,
  saveBreachSchema,
  saveRequestSchema,
  saveRetentionSchema,
} from "@faridalms/domain/privacy";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getPrivacyOverview = createServerFn({ method: "GET" }).handler(
  () => backend().privacy.overview(),
);

export const saveRetention = createServerFn({ method: "POST" })
  .validator(checked(saveRetentionSchema))
  .handler(({ data }) => backend().privacy.saveRetention(data));

export const placeHold = createServerFn({ method: "POST" })
  .validator(checked(placeHoldSchema))
  .handler(({ data }) => backend().privacy.placeHold(data));

export const releaseHold = createServerFn({ method: "POST" })
  .validator(checked(releaseHoldSchema))
  .handler(({ data }) => backend().privacy.releaseHold(data));

export const saveRequest = createServerFn({ method: "POST" })
  .validator(checked(saveRequestSchema))
  .handler(({ data }) => backend().privacy.saveRequest(data));

export const extendRequest = createServerFn({ method: "POST" })
  .validator(checked(extendRequestSchema))
  .handler(({ data }) => backend().privacy.extendRequest(data));

export const closeRequest = createServerFn({ method: "POST" })
  .validator(checked(closeRequestSchema))
  .handler(({ data }) => backend().privacy.closeRequest(data));

export const saveBreach = createServerFn({ method: "POST" })
  .validator(checked(saveBreachSchema))
  .handler(({ data }) => backend().privacy.saveBreach(data));

export const breachNotices = createServerFn({ method: "POST" })
  .validator(checked(breachNoticesSchema))
  .handler(({ data }) => backend().privacy.breachNotices(data));

export const closeBreach = createServerFn({ method: "POST" })
  .validator(checked(closeBreachSchema))
  .handler(({ data }) => backend().privacy.closeBreach(data));

export const approveErasure = createServerFn({ method: "POST" })
  .validator(checked(approveErasureSchema))
  .handler(({ data }) => backend().privacy.approveErasure(data));

export const runErasure = createServerFn({ method: "POST" })
  .validator(checked(runErasureSchema))
  .handler(({ data }) => backend().privacy.runErasure(data));
