import {
  applyRolloverSchema,
  rolloverQuerySchema,
  saveRolloverSchema,
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
