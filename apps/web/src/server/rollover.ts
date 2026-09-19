import {
  applyRolloverSchema,
  rolloverQuerySchema,
  saveRolloverSchema,
} from "@faridalms/domain/rollover";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getRollover = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(rolloverQuerySchema, input))
  .handler(({ data }) => backend().getRollover(data));
export const saveRollover = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveRolloverSchema, input))
  .handler(({ data }) => backend().saveRollover(data));
export const applyRollover = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(applyRolloverSchema, input))
  .handler(({ data }) => backend().applyRollover(data));
