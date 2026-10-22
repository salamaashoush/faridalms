import {
  saveSharedSchema,
  sharedQuerySchema,
  sharedRefSchema,
} from "@faridalms/domain/shared";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const listShared = createServerFn({ method: "GET" })
  .validator(checked(sharedQuerySchema))
  .handler(({ data }) => backend().shared.list(data));

export const readShared = createServerFn({ method: "GET" })
  .validator(checked(sharedRefSchema))
  .handler(({ data }) => backend().shared.read(data));

export const saveShared = createServerFn({ method: "POST" })
  .validator(checked(saveSharedSchema))
  .handler(({ data }) => backend().shared.save(data));

export const removeShared = createServerFn({ method: "POST" })
  .validator(checked(sharedRefSchema))
  .handler(({ data }) => backend().shared.remove(data));

export const sharedUses = createServerFn({ method: "GET" })
  .validator(checked(sharedRefSchema))
  .handler(({ data }) => backend().shared.uses(data));
