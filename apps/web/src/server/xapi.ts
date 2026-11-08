import { recordStoreSchema } from "@faridalms/domain/xapi";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getRecordStore = createServerFn({ method: "GET" }).handler(() =>
  record(backend().xapi.recordStore()),
);

export const saveRecordStore = createServerFn({ method: "POST" })
  .validator(checked(recordStoreSchema))
  .handler(({ data }) => backend().xapi.saveRecordStoreSettings(data));

export const retryRecordStore = createServerFn({ method: "POST" }).handler(() =>
  backend().xapi.retryRecordStore(),
);
