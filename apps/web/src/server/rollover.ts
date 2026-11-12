import {
  applyRolloverSchema,
  openReenrolmentSchema,
  rolloverQuerySchema,
  saveRolloverSchema,
  setIntentionSchema,
} from "@faridalms/domain/rollover";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getRollover = createServerFn({ method: "GET" })
  .validator(checked(rolloverQuerySchema))
  .handler(({ data }) => record(backend().rollover.preview(data)));

export const saveRollover = createServerFn({ method: "POST" })
  .validator(checked(saveRolloverSchema))
  .handler(({ data }) => backend().rollover.save(data));

export const applyRollover = createServerFn({ method: "POST" })
  .validator(checked(applyRolloverSchema))
  .handler(({ data }) => backend().rollover.apply(data));

export const openReenrolment = createServerFn({ method: "POST" })
  .validator(checked(openReenrolmentSchema))
  .handler(({ data }) => backend().rollover.openReenrolment(data));

export const setIntention = createServerFn({ method: "POST" })
  .validator(checked(setIntentionSchema))
  .handler(({ data }) => backend().rollover.setIntention(data));

export const getAsking = createServerFn({ method: "GET" }).handler(() =>
  record(backend().rollover.asking()),
);
