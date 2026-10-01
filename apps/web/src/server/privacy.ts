import {
  placeHoldSchema,
  releaseHoldSchema,
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
